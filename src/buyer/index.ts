import { createHash } from 'node:crypto';

/** Amounts are integer USDC base units (six decimals), never floating point. */
export interface PurchaseRequest {
  idempotencyKey: string;
  projectId: string;
  agentId: string;
  providerId: string;
  network: string;
  mint: string;
  payTo: string;
  amount: bigint;
  resource: string;
}

export interface BudgetConfig {
  network: string;
  mint: string;
  projects: readonly { id: string; limit: bigint }[];
  agents: readonly { id: string; projectId: string; limit: bigint }[];
  providers: readonly { id: string; payTo: string; resources?: readonly string[] }[];
}

export type BuyerErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_PROJECT'
  | 'UNKNOWN_AGENT'
  | 'AGENT_PROJECT_MISMATCH'
  | 'UNSUPPORTED_NETWORK'
  | 'UNSUPPORTED_MINT'
  | 'UNSUPPORTED_PROVIDER'
  | 'UNSUPPORTED_RECIPIENT'
  | 'UNSUPPORTED_RESOURCE'
  | 'PROJECT_BUDGET_EXCEEDED'
  | 'AGENT_BUDGET_EXCEEDED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNKNOWN_RESERVATION'
  | 'INVALID_RESERVATION_STATE';

export class BuyerError extends Error {
  readonly code: BuyerErrorCode;

  constructor(code: BuyerErrorCode, message: string) {
    super(message);
    this.name = 'BuyerError';
    this.code = code;
  }
}

export type ReservationState = 'reserved' | 'spent' | 'released' | 'uncertain';

export interface Reservation {
  readonly id: string;
  readonly request: Readonly<PurchaseRequest>;
  readonly state: ReservationState;
  readonly signature?: string;
  readonly reason?: string;
}

export interface BudgetBalance {
  readonly id: string;
  readonly limit: bigint;
  readonly held: bigint;
  readonly spent: bigint;
  readonly remaining: bigint;
}

export type SettlementOutcome<Result = unknown> =
  | { status: 'confirmed'; signature: string; result: Result }
  | { status: 'rejected'; reason: string }
  | { status: 'uncertain'; reason: string };

/** Rejected MUST mean definitively no charge; exceptions are treated as uncertain. */
export type SettlementAdapter<Result = unknown> = (
  request: Readonly<PurchaseRequest>,
) => Promise<SettlementOutcome<Result>> | SettlementOutcome<Result>;

export type PurchaseReceipt<Result = unknown> =
  | {
      status: 'confirmed';
      reservationId: string;
      request: Readonly<PurchaseRequest>;
      signature: string;
      result: Result;
    }
  | {
      status: 'rejected' | 'uncertain';
      reservationId: string;
      request: Readonly<PurchaseRequest>;
      reason: string;
    };

interface MutableBalance {
  id: string;
  limit: bigint;
  held: bigint;
  spent: bigint;
}

interface AgentBalance extends MutableBalance {
  projectId: string;
}

interface MutableReservation {
  id: string;
  request: Readonly<PurchaseRequest>;
  state: ReservationState;
  signature?: string;
  reason?: string;
}

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BuyerError('INVALID_INPUT', `${name} must be a nonempty string.`);
  }
}

function requireAmount(value: unknown, name: string): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new BuyerError('INVALID_INPUT', `${name} must be a nonnegative bigint.`);
  }
}

function immutableRequest(request: PurchaseRequest): Readonly<PurchaseRequest> {
  if (!request || typeof request !== 'object') {
    throw new BuyerError('INVALID_INPUT', 'Purchase request must be an object.');
  }
  for (const name of [
    'idempotencyKey', 'projectId', 'agentId', 'providerId',
    'network', 'mint', 'payTo', 'resource',
  ] as const) {
    requireText(request[name], name);
  }
  requireAmount(request.amount, 'amount');
  return Object.freeze({
    idempotencyKey: request.idempotencyKey,
    projectId: request.projectId,
    agentId: request.agentId,
    providerId: request.providerId,
    network: request.network,
    mint: request.mint,
    payTo: request.payTo,
    amount: request.amount,
    resource: request.resource,
  });
}

function fingerprint(request: Readonly<PurchaseRequest>): string {
  // Explicit fields and base-unit strings make binding independent of object key order.
  return createHash('sha256').update(JSON.stringify([
    request.projectId, request.agentId, request.providerId, request.network,
    request.mint, request.payTo, request.amount.toString(), request.resource,
  ])).digest('hex');
}

function balanceSnapshot(balance: MutableBalance): BudgetBalance {
  return Object.freeze({
    id: balance.id,
    limit: balance.limit,
    held: balance.held,
    spent: balance.spent,
    remaining: balance.limit - balance.held - balance.spent,
  });
}

/** Single-process in-memory ledger. A restart loses reservations and idempotency records. */
export class BudgetLedger {
  readonly network: string;
  readonly mint: string;
  private readonly projects = new Map<string, MutableBalance>();
  private readonly agents = new Map<string, AgentBalance>();
  private readonly providers = new Map<string, { payTo: string; resources?: Set<string> }>();
  private readonly reservations = new Map<string, MutableReservation>();
  private sequence = 0;

  constructor(config: BudgetConfig) {
    requireText(config.network, 'network');
    requireText(config.mint, 'mint');
    this.network = config.network;
    this.mint = config.mint;
    for (const project of config.projects) {
      requireText(project.id, 'project.id');
      requireAmount(project.limit, 'project.limit');
      if (this.projects.has(project.id)) {
        throw new BuyerError('INVALID_INPUT', `Duplicate project ${project.id}.`);
      }
      this.projects.set(project.id, { id: project.id, limit: project.limit, held: 0n, spent: 0n });
    }
    for (const agent of config.agents) {
      requireText(agent.id, 'agent.id');
      requireText(agent.projectId, 'agent.projectId');
      requireAmount(agent.limit, 'agent.limit');
      if (this.agents.has(agent.id) || !this.projects.has(agent.projectId)) {
        throw new BuyerError('INVALID_INPUT', `Duplicate agent or unknown project for ${agent.id}.`);
      }
      this.agents.set(agent.id, {
        id: agent.id, projectId: agent.projectId, limit: agent.limit, held: 0n, spent: 0n,
      });
    }
    for (const provider of config.providers) {
      requireText(provider.id, 'provider.id');
      requireText(provider.payTo, 'provider.payTo');
      if (this.providers.has(provider.id)) {
        throw new BuyerError('INVALID_INPUT', `Duplicate provider ${provider.id}.`);
      }
      for (const resource of provider.resources ?? []) requireText(resource, 'provider.resource');
      this.providers.set(provider.id, {
        payTo: provider.payTo,
        resources: provider.resources === undefined ? undefined : new Set(provider.resources),
      });
    }
  }

  projectBalance(id: string): BudgetBalance {
    const balance = this.projects.get(id);
    if (!balance) throw new BuyerError('UNKNOWN_PROJECT', `Unknown project ${id}.`);
    return balanceSnapshot(balance);
  }

  agentBalance(id: string): BudgetBalance {
    const balance = this.agents.get(id);
    if (!balance) throw new BuyerError('UNKNOWN_AGENT', `Unknown agent ${id}.`);
    return balanceSnapshot(balance);
  }

  snapshot(): { projects: BudgetBalance[]; agents: BudgetBalance[]; reservations: Reservation[] } {
    return {
      projects: [...this.projects.values()].map(balanceSnapshot),
      agents: [...this.agents.values()].map(balanceSnapshot),
      reservations: [...this.reservations.values()].map((entry) => Object.freeze({ ...entry })),
    };
  }

  getReservation(id: string): Reservation {
    return Object.freeze({ ...this.requireReservation(id) });
  }

  /** Synchronous reservation is atomic within one JavaScript process, before any await. */
  reserve(input: PurchaseRequest): Reservation {
    const request = immutableRequest(input);
    const project = this.projects.get(request.projectId);
    const agent = this.agents.get(request.agentId);
    if (!project) throw new BuyerError('UNKNOWN_PROJECT', `Unknown project ${request.projectId}.`);
    if (!agent) throw new BuyerError('UNKNOWN_AGENT', `Unknown agent ${request.agentId}.`);
    if (agent.projectId !== request.projectId) {
      throw new BuyerError('AGENT_PROJECT_MISMATCH', 'Agent does not belong to this project.');
    }
    if (request.network !== this.network) {
      throw new BuyerError('UNSUPPORTED_NETWORK', 'Network is not permitted.');
    }
    if (request.mint !== this.mint) throw new BuyerError('UNSUPPORTED_MINT', 'Mint is not permitted.');
    const provider = this.providers.get(request.providerId);
    if (!provider) throw new BuyerError('UNSUPPORTED_PROVIDER', 'Provider is not permitted.');
    if (provider.payTo !== request.payTo) {
      throw new BuyerError('UNSUPPORTED_RECIPIENT', 'Payment recipient does not match the provider.');
    }
    if (provider.resources && !provider.resources.has(request.resource)) {
      throw new BuyerError('UNSUPPORTED_RESOURCE', 'Resource is not permitted for this provider.');
    }
    if (request.amount > project.limit - project.spent - project.held) {
      throw new BuyerError('PROJECT_BUDGET_EXCEEDED', 'Project budget would be exceeded.');
    }
    if (request.amount > agent.limit - agent.spent - agent.held) {
      throw new BuyerError('AGENT_BUDGET_EXCEEDED', 'Agent budget would be exceeded.');
    }
    const entry: MutableReservation = {
      id: `reservation-${++this.sequence}`, request, state: 'reserved',
    };
    project.held += request.amount;
    agent.held += request.amount;
    this.reservations.set(entry.id, entry);
    return this.getReservation(entry.id);
  }

  commit(id: string, signature: string): Reservation {
    requireText(signature, 'signature');
    const entry = this.requireReservation(id);
    if (entry.state === 'spent' && entry.signature === signature) return this.getReservation(id);
    if (entry.state !== 'reserved') {
      throw new BuyerError('INVALID_RESERVATION_STATE', `Cannot commit a ${entry.state} reservation.`);
    }
    return this.moveToSpent(entry, signature);
  }

  release(id: string, reason: string): Reservation {
    requireText(reason, 'reason');
    const entry = this.requireReservation(id);
    if (entry.state !== 'reserved') {
      throw new BuyerError('INVALID_RESERVATION_STATE', `Cannot release a ${entry.state} reservation.`);
    }
    for (const balance of this.balancesFor(entry)) balance.held -= entry.request.amount;
    entry.state = 'released';
    entry.reason = reason;
    return this.getReservation(id);
  }

  markUncertain(id: string, reason: string): Reservation {
    requireText(reason, 'reason');
    const entry = this.requireReservation(id);
    if (entry.state !== 'reserved' && entry.state !== 'uncertain') {
      throw new BuyerError('INVALID_RESERVATION_STATE', `Cannot mark a ${entry.state} reservation uncertain.`);
    }
    entry.state = 'uncertain';
    entry.reason = reason;
    return this.getReservation(id);
  }

  /** Manual reconciliation after verifying a signature externally; never releases held funds. */
  confirmUncertain(id: string, signature: string): Reservation {
    requireText(signature, 'signature');
    const entry = this.requireReservation(id);
    if (entry.state === 'spent' && entry.signature === signature) return this.getReservation(id);
    if (entry.state !== 'uncertain') {
      throw new BuyerError('INVALID_RESERVATION_STATE', 'Only an uncertain reservation can be reconciled.');
    }
    return this.moveToSpent(entry, signature);
  }

  private requireReservation(id: string): MutableReservation {
    const entry = this.reservations.get(id);
    if (!entry) throw new BuyerError('UNKNOWN_RESERVATION', `Unknown reservation ${id}.`);
    return entry;
  }

  private balancesFor(entry: MutableReservation): [MutableBalance, AgentBalance] {
    return [this.projects.get(entry.request.projectId)!, this.agents.get(entry.request.agentId)!];
  }

  private moveToSpent(entry: MutableReservation, signature: string): Reservation {
    for (const balance of this.balancesFor(entry)) {
      balance.held -= entry.request.amount;
      balance.spent += entry.request.amount;
    }
    entry.state = 'spent';
    entry.signature = signature;
    return this.getReservation(entry.id);
  }
}

/** The adapter must verify that a real payment quote matches every request constraint. */
export class BuyerGateway {
  readonly ledger: BudgetLedger;
  private readonly operations = new Map<string, {
    fingerprint: string;
    promise: Promise<PurchaseReceipt>;
  }>();

  constructor(ledger: BudgetLedger) {
    this.ledger = ledger;
  }

  purchase<Result>(input: PurchaseRequest, adapter: SettlementAdapter<Result>): Promise<PurchaseReceipt<Result>> {
    let request: Readonly<PurchaseRequest>;
    try {
      request = immutableRequest(input);
      const binding = fingerprint(request);
      const existing = this.operations.get(request.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== binding) {
          throw new BuyerError('IDEMPOTENCY_CONFLICT', 'Idempotency key is already bound to a different request.');
        }
        return existing.promise as Promise<PurchaseReceipt<Result>>;
      }
      const reservation = this.ledger.reserve(request);
      // Schedule the adapter after saving the operation, so even reentrant calls deduplicate.
      const operation = Promise.resolve().then(async (): Promise<PurchaseReceipt<Result>> => {
        try {
          const outcome = await adapter(request);
          if (outcome?.status === 'confirmed') {
            requireText(outcome.signature, 'settlement signature');
            this.ledger.commit(reservation.id, outcome.signature);
            // A paid service result may indicate failure; the confirmed charge remains spent.
            return Object.freeze({
              status: 'confirmed', reservationId: reservation.id, request,
              signature: outcome.signature, result: outcome.result,
            });
          }
          if (outcome?.status === 'rejected') {
            requireText(outcome.reason, 'rejection reason');
            this.ledger.release(reservation.id, outcome.reason);
            return Object.freeze({
              status: 'rejected', reservationId: reservation.id, request, reason: outcome.reason,
            });
          }
          if (outcome?.status === 'uncertain') {
            requireText(outcome.reason, 'uncertainty reason');
            this.ledger.markUncertain(reservation.id, outcome.reason);
            return Object.freeze({
              status: 'uncertain', reservationId: reservation.id, request, reason: outcome.reason,
            });
          }
          throw new BuyerError('INVALID_INPUT', 'Adapter returned an unsupported settlement outcome.');
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Settlement adapter failed.';
          // Network timeouts and malformed replies may follow a successful payment.
          const state = this.ledger.getReservation(reservation.id).state;
          if (state === 'reserved' || state === 'uncertain') {
            this.ledger.markUncertain(reservation.id, reason || 'Settlement outcome is unknown.');
          }
          return Object.freeze({
            status: 'uncertain', reservationId: reservation.id, request,
            reason: reason || 'Settlement outcome is unknown.',
          });
        }
      });
      this.operations.set(request.idempotencyKey, { fingerprint: binding, promise: operation });
      return operation;
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

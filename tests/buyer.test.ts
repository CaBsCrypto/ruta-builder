import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetLedger, BuyerError, BuyerGateway } from '../src/buyer/index.ts';
import type { BudgetConfig, PurchaseRequest, SettlementOutcome } from '../src/buyer/index.ts';

// These adapters are test doubles. Their signatures are not blockchain evidence.
const NETWORK = 'solana:devnet';
const MINT = 'fixture-usdc-mint';
const RESOURCE = 'https://fixture.invalid/report';

function config(projectLimit = 100n, agentLimit = 100n): BudgetConfig {
  return {
    network: NETWORK,
    mint: MINT,
    projects: [{ id: 'project', limit: projectLimit }],
    agents: [
      { id: 'agent-a', projectId: 'project', limit: agentLimit },
      { id: 'agent-b', projectId: 'project', limit: agentLimit },
    ],
    providers: [{ id: 'reports', payTo: 'fixture-recipient', resources: [RESOURCE] }],
  };
}

function request(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    idempotencyKey: 'purchase-1', projectId: 'project', agentId: 'agent-a',
    providerId: 'reports', network: NETWORK, mint: MINT,
    payTo: 'fixture-recipient', amount: 10n, resource: RESOURCE, ...overrides,
  };
}

const confirmed = (): SettlementOutcome<string> => ({
  status: 'confirmed', signature: 'fixture-signature', result: 'fixture result',
});

function expectCode(code: string) {
  return (error: unknown) => error instanceof BuyerError && error.code === code;
}

test('rejects an overbudget purchase before the adapter executes', async () => {
  const ledger = new BudgetLedger(config(9n));
  const gateway = new BuyerGateway(ledger);
  let calls = 0;
  await assert.rejects(gateway.purchase(request(), () => {
    calls += 1;
    return confirmed();
  }), expectCode('PROJECT_BUDGET_EXCEEDED'));
  assert.equal(calls, 0);
  assert.deepEqual(ledger.projectBalance('project'), {
    id: 'project', limit: 9n, held: 0n, spent: 0n, remaining: 9n,
  });
});

test('reserves synchronously so 100 concurrent purchases cannot exceed a budget', async () => {
  const ledger = new BudgetLedger(config(100n));
  const gateway = new BuyerGateway(ledger);
  let settle!: () => void;
  const pending = new Promise<void>((resolve) => { settle = resolve; });
  let calls = 0;
  const operations = Array.from({ length: 100 }, (_, i) => gateway.purchase(
    request({ idempotencyKey: `concurrent-${i}` }), async () => {
      calls += 1;
      await pending;
      return confirmed();
    },
  ));
  const outcomes = Promise.allSettled(operations);
  assert.equal(ledger.projectBalance('project').held, 100n);
  assert.equal(ledger.projectBalance('project').remaining, 0n);
  settle();
  const results = await outcomes;
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 10);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 90);
  assert.equal(calls, 10);
  assert.equal(ledger.projectBalance('project').spent, 100n);
  assert.equal(ledger.projectBalance('project').held, 0n);
});

test('identical in-flight and completed duplicates share one promise and one charge', async () => {
  const ledger = new BudgetLedger(config());
  const gateway = new BuyerGateway(ledger);
  let calls = 0;
  let settle!: () => void;
  const pending = new Promise<void>((resolve) => { settle = resolve; });
  const adapter = async () => {
    calls += 1;
    await pending;
    return confirmed();
  };
  const first = gateway.purchase(request(), adapter);
  const second = gateway.purchase(request(), adapter);
  assert.equal(first, second);
  assert.equal(ledger.projectBalance('project').held, 10n);
  settle();
  const receipt = await first;
  assert.equal(gateway.purchase(request(), adapter), first);
  assert.equal(await second, receipt);
  assert.equal(calls, 1);
  assert.equal(ledger.projectBalance('project').spent, 10n);
});

test('an idempotency key cannot be rebound to a different request', async () => {
  const ledger = new BudgetLedger(config());
  const gateway = new BuyerGateway(ledger);
  await gateway.purchase(request(), confirmed);
  for (const change of [
    { amount: 11n }, { agentId: 'agent-b' }, { resource: `${RESOURCE}?different` },
    { mint: 'other' }, { network: 'other' }, { payTo: 'other' }, { providerId: 'other' },
  ]) {
    await assert.rejects(gateway.purchase(request(change), confirmed), expectCode('IDEMPOTENCY_CONFLICT'));
  }
  assert.equal(ledger.projectBalance('project').spent, 10n);
});

test('enforces network, mint, provider, recipient, resource, and project membership allowlists', async () => {
  for (const [change, code] of [
    [{ network: 'solana:mainnet' }, 'UNSUPPORTED_NETWORK'],
    [{ mint: 'unapproved-mint' }, 'UNSUPPORTED_MINT'],
    [{ providerId: 'unapproved-provider' }, 'UNSUPPORTED_PROVIDER'],
    [{ payTo: 'unapproved-recipient' }, 'UNSUPPORTED_RECIPIENT'],
    [{ resource: 'https://unapproved.invalid' }, 'UNSUPPORTED_RESOURCE'],
    [{ agentId: 'unapproved-agent' }, 'UNKNOWN_AGENT'],
    [{ projectId: 'unapproved-project' }, 'UNKNOWN_PROJECT'],
  ] as const) {
    const ledger = new BudgetLedger(config());
    await assert.rejects(new BuyerGateway(ledger).purchase(request(change), confirmed), expectCode(code));
    assert.equal(ledger.projectBalance('project').held, 0n);
  }
  const policy = config();
  policy.projects = [...policy.projects, { id: 'another-project', limit: 100n }];
  const ledger = new BudgetLedger(policy);
  await assert.rejects(
    new BuyerGateway(ledger).purchase(request({ projectId: 'another-project' }), confirmed),
    expectCode('AGENT_PROJECT_MISMATCH'),
  );
});

test('confirmed payment remains spent when the paid service result reports failure', async () => {
  const ledger = new BudgetLedger(config());
  const receipt = await new BuyerGateway(ledger).purchase(request(), () => ({
    status: 'confirmed', signature: 'fixture-paid', result: { ok: false, error: 'report unavailable' },
  }));
  assert.equal(receipt.status, 'confirmed');
  assert.equal(ledger.projectBalance('project').spent, 10n);
  assert.equal(ledger.projectBalance('project').held, 0n);
  assert.throws(() => ledger.release(receipt.reservationId, 'service failed'), expectCode('INVALID_RESERVATION_STATE'));
});

test('uncertain settlement retains the budget and retry never executes the adapter again', async () => {
  const ledger = new BudgetLedger(config(10n));
  const gateway = new BuyerGateway(ledger);
  let calls = 0;
  const adapter = () => {
    calls += 1;
    return { status: 'uncertain' as const, reason: 'confirmation timed out' };
  };
  const receipt = await gateway.purchase(request(), adapter);
  assert.equal(receipt.status, 'uncertain');
  await gateway.purchase(request(), adapter);
  assert.equal(calls, 1);
  assert.equal(ledger.projectBalance('project').held, 10n);
  assert.equal(ledger.projectBalance('project').spent, 0n);
  assert.throws(() => ledger.release(receipt.reservationId, 'retry'), expectCode('INVALID_RESERVATION_STATE'));
  await assert.rejects(gateway.purchase(request({ idempotencyKey: 'another' }), confirmed), expectCode('PROJECT_BUDGET_EXCEEDED'));
  ledger.confirmUncertain(receipt.reservationId, 'externally-verified-fixture-signature');
  assert.equal(ledger.projectBalance('project').held, 0n);
  assert.equal(ledger.projectBalance('project').spent, 10n);
});

test('adapter exceptions and malformed settlement replies are uncertain, never refunded', async () => {
  for (const adapter of [
    () => { throw new Error('connection closed after sending'); },
    () => ({ status: 'confirmed' as const, signature: '', result: 'data' }),
    () => ({ status: 'unexpected' }) as unknown as SettlementOutcome,
  ]) {
    const ledger = new BudgetLedger(config());
    const receipt = await new BuyerGateway(ledger).purchase(request(), adapter);
    assert.equal(receipt.status, 'uncertain');
    assert.equal(ledger.projectBalance('project').held, 10n);
    assert.equal(ledger.getReservation(receipt.reservationId).state, 'uncertain');
  }
});

test('definite no-charge rejection releases funds and remains idempotent', async () => {
  const ledger = new BudgetLedger(config(10n));
  const gateway = new BuyerGateway(ledger);
  let calls = 0;
  const adapter = () => {
    calls += 1;
    return { status: 'rejected' as const, reason: 'quote expired before any payment' };
  };
  const receipt = await gateway.purchase(request(), adapter);
  assert.equal(receipt.status, 'rejected');
  assert.equal(ledger.projectBalance('project').remaining, 10n);
  await gateway.purchase(request(), adapter);
  assert.equal(calls, 1);
  await gateway.purchase(request({ idempotencyKey: 'fresh-attempt' }), confirmed);
  assert.equal(ledger.projectBalance('project').spent, 10n);
});

test('different agents share the project limit and each has its own cap', async () => {
  const ledger = new BudgetLedger(config(15n, 12n));
  const gateway = new BuyerGateway(ledger);
  await gateway.purchase(request(), confirmed);
  await assert.rejects(gateway.purchase(request({ idempotencyKey: 'agent-limit', amount: 3n }), confirmed), expectCode('AGENT_BUDGET_EXCEEDED'));
  await assert.rejects(gateway.purchase(request({ idempotencyKey: 'project-limit', agentId: 'agent-b', amount: 6n }), confirmed), expectCode('PROJECT_BUDGET_EXCEEDED'));
  await gateway.purchase(request({ idempotencyKey: 'agent-b', agentId: 'agent-b', amount: 5n }), confirmed);
  assert.equal(ledger.projectBalance('project').spent, 15n);
  assert.equal(ledger.agentBalance('agent-a').spent, 10n);
  assert.equal(ledger.agentBalance('agent-b').spent, 5n);
});

test('rejects negative and non-bigint amounts and budgets; accepts zero amounts', async () => {
  assert.throws(() => new BudgetLedger(config(-1n)), expectCode('INVALID_INPUT'));
  assert.throws(() => new BudgetLedger(config(100n, -1n)), expectCode('INVALID_INPUT'));
  assert.throws(() => new BudgetLedger(config(1 as unknown as bigint)), expectCode('INVALID_INPUT'));
  const ledger = new BudgetLedger(config());
  const gateway = new BuyerGateway(ledger);
  await assert.rejects(gateway.purchase(request({ amount: -1n }), confirmed), expectCode('INVALID_INPUT'));
  await assert.rejects(gateway.purchase(request({ amount: 1.5 as unknown as bigint }), confirmed), expectCode('INVALID_INPUT'));
  await gateway.purchase(request({ amount: 0n }), confirmed);
  assert.equal(ledger.projectBalance('project').spent, 0n);
});

test('caller mutation cannot change the reserved request or provider policy', async () => {
  const policy = config();
  const ledger = new BudgetLedger(policy);
  const original = request();
  let seen: Readonly<PurchaseRequest> | undefined;
  const operation = new BuyerGateway(ledger).purchase(original, (input) => {
    seen = input;
    assert.ok(Object.isFrozen(input));
    return confirmed();
  });
  original.amount = 99n;
  original.payTo = 'different-recipient';
  await operation;
  assert.equal(seen?.amount, 10n);
  assert.equal(seen?.payTo, 'fixture-recipient');
  assert.equal(ledger.projectBalance('project').spent, 10n);
});

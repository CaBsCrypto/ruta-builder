/** Integer-only reconciliation of supplied Solana jsonParsed getTransaction results. */
export interface RpcTransactionEnvelope {
  signature: string;
  transaction: unknown | null;
}

export interface ReconcileInput {
  treasuryAddress: string;
  mint: string;
  decimals?: 6;
  requestedSignatures: string[];
  transactions: RpcTransactionEnvelope[];
  /** Explicit human labels keyed by transaction signature. No identity is inferred. */
  labels?: Record<string, string>;
}

export interface TransferRecord {
  signature: string;
  instructionPath: string;
  instructionIndex: number;
  innerInstructionIndex: number | null;
  slot: number | null;
  blockTime: number | null;
  direction: "incoming" | "outgoing" | "internal";
  mint: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  fromOwner: string | null;
  toOwner: string | null;
  amountRaw: string;
  amountUsdc: string;
  label: string | null;
}

export interface ReportException {
  code: string;
  signature: string | null;
  instructionPath: string | null;
  message: string;
  affectsCoverage: boolean;
}

export interface TransactionReconciliation {
  signature: string;
  status: "processed" | "skipped";
  transferNetRaw: string;
  balanceDeltaRaw: string | null;
  matchesBalance: boolean | null;
}

export interface TreasuryReport {
  schemaVersion: "usdc-treasury-report/v1";
  treasuryAddress: string;
  mint: string;
  decimals: 6;
  totals: {
    incomingRaw: string;
    outgoingRaw: string;
    internalRaw: string;
    /** Always calculated from explicit parsed transfers, even if balance reconciliation fails. */
    netRaw: string;
    observedBalanceDeltaRaw: string | null;
  };
  coverage: {
    complete: boolean;
    requested: number;
    received: number;
    reconciled: number;
    processedSignatures: string[];
    unresolvedSignatures: string[];
  };
  transfers: TransferRecord[];
  transactions: TransactionReconciliation[];
  exceptions: ReportException[];
}

type JsonObject = Record<string, unknown>;
interface TokenAccount {
  address: string;
  mint: string;
  owner: string | null;
  decimals: number;
  pre: bigint;
  post: bigint;
  valid: boolean;
}

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const object = (value: unknown): JsonObject | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null;
const string = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const amount = (value: unknown): bigint | null =>
  typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? BigInt(value) : null;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function decimalUnits(raw: bigint): string {
  const padded = raw.toString().padStart(7, "0");
  return `${padded.slice(0, -6)}.${padded.slice(-6)}`;
}

/** Stable comparison allows replayed envelopes with differently ordered JSON keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const valueObject = object(value);
  if (valueObject) return `{${Object.keys(valueObject).sort().map(key => `${JSON.stringify(key)}:${canonical(valueObject[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export function reconcileTransfers(input: ReconcileInput): TreasuryReport {
  if (!string(input.treasuryAddress) || !string(input.mint)) throw new TypeError("treasuryAddress and mint are required.");
  if (input.decimals !== undefined && input.decimals !== 6) throw new TypeError("This prototype only supports a mint with six decimals.");
  if (!Array.isArray(input.requestedSignatures) || input.requestedSignatures.some(sig => !string(sig))) {
    throw new TypeError("requestedSignatures must contain nonempty strings.");
  }
  if (!Array.isArray(input.transactions)) throw new TypeError("transactions must be an array of RPC envelopes.");
  if (input.labels !== undefined && (!object(input.labels) || Object.values(input.labels).some(label => typeof label !== "string"))) {
    throw new TypeError("labels must map transaction signatures to human-supplied strings.");
  }
  const exceptions: ReportException[] = [];
  const issue = (code: string, signature: string | null, message: string, affectsCoverage = true, instructionPath: string | null = null) => {
    exceptions.push({ code, signature, instructionPath, message, affectsCoverage });
  };
  const signatures = [...new Set(input.requestedSignatures)].sort();
  const requested = new Set(signatures);
  const requestCounts = new Map<string, number>();
  for (const sig of input.requestedSignatures) requestCounts.set(sig, (requestCounts.get(sig) ?? 0) + 1);
  for (const sig of signatures) if (requestCounts.get(sig)! > 1) issue("duplicate_signature", sig, "Repeated requested signature was counted once.", false);
  const envelopes = new Map<string, unknown>();
  const conflicts = new Set<string>();
  for (const envelope of input.transactions) {
    if (!object(envelope) || !string(envelope.signature)) {
      issue("invalid_envelope", null, "An RPC envelope has no usable signature.");
      continue;
    }
    const sig = envelope.signature;
    if (!requested.has(sig)) {
      issue("unexpected_signature", sig, "Envelope was not in the requested signature set.");
      continue;
    }
    if (envelopes.has(sig)) {
      if (canonical(envelopes.get(sig)) !== canonical(envelope.transaction)) {
        conflicts.add(sig);
        issue("conflicting_duplicate", sig, "Repeated envelopes contain different transaction data.");
      } else issue("duplicate_envelope", sig, "Identical repeated envelope was counted once.", false);
    } else envelopes.set(sig, envelope.transaction);
  }

  const transfers: TransferRecord[] = [];
  const reconciliations: TransactionReconciliation[] = [];
  let incoming = 0n;
  let outgoing = 0n;
  let internal = 0n;
  let totalBalanceDelta = 0n;
  let allBalanceDeltasKnown = true;
  let received = 0;
  const processedSignatures: string[] = [];
  const unresolvedSignatures: string[] = [];

  for (const signature of signatures) {
    const skip = () => {
      reconciliations.push({ signature, status: "skipped", transferNetRaw: "0", balanceDeltaRaw: null, matchesBalance: null });
      unresolvedSignatures.push(signature);
      allBalanceDeltasKnown = false;
    };
    const tx = object(envelopes.get(signature));
    if (!tx || conflicts.has(signature)) {
      if (!conflicts.has(signature)) issue("missing_transaction", signature, "RPC result is absent, null, or not an object.");
      skip();
      continue;
    }
    const transaction = object(tx.transaction);
    const message = object(transaction?.message);
    const meta = object(tx.meta);
    if (!transaction || !message || !meta || !Array.isArray(transaction.signatures) || transaction.signatures[0] !== signature) {
      issue("signature_or_layout_mismatch", signature, "Expected jsonParsed transaction, metadata, and matching primary signature.");
      skip();
      continue;
    }
    received++;
    if (!("err" in meta) || meta.err !== null) {
      issue("failed_transaction", signature, "Missing or non-null transaction error; no transfers from this transaction were counted.");
      skip();
      continue;
    }
    if (!Array.isArray(message.accountKeys) || !Array.isArray(message.instructions)) {
      issue("unsupported_layout", signature, "Expected jsonParsed accountKeys and instructions arrays.");
      skip();
      continue;
    }
    const addresses = message.accountKeys.map(key => string(key) ?? string(object(key)?.pubkey));
    if (addresses.some(address => address === null) || new Set(addresses).size !== addresses.length) {
      issue("unsupported_account_keys", signature, "Account keys must be distinct addresses in jsonParsed order.");
      skip();
      continue;
    }
    const accounts = new Map<string, TokenAccount>();
    let balanceDataKnown = true;
    for (const side of ["pre", "post"] as const) {
      const balances = meta[`${side}TokenBalances`];
      if (!Array.isArray(balances)) {
        issue("missing_token_balances", signature, `RPC ${side}TokenBalances is unavailable.`);
        balanceDataKnown = false;
        continue;
      }
      const seenBalances = new Set<string>();
      for (const rawBalance of balances) {
        const balance = object(rawBalance);
        const ui = object(balance?.uiTokenAmount);
        const index = integer(balance?.accountIndex);
        const address = index === null ? null : addresses[index];
        const mint = string(balance?.mint);
        const raw = amount(ui?.amount);
        const decimals = integer(ui?.decimals);
        const owner = string(balance?.owner);
        if (!address || !mint || raw === null || decimals === null) {
          issue("invalid_token_balance", signature, "Token balance has an invalid account index, mint, integer amount, or decimals.");
          balanceDataKnown = false;
          continue;
        }
        if (seenBalances.has(address)) {
          issue("duplicate_token_balance", signature, `RPC ${side}TokenBalances repeats a token account.`);
          balanceDataKnown = false;
          continue;
        }
        seenBalances.add(address);
        const account = accounts.get(address) ?? { address, mint, owner, decimals, pre: 0n, post: 0n, valid: true };
        if (account.mint !== mint || account.decimals !== decimals || (owner && account.owner && owner !== account.owner)) {
          issue("conflicting_token_account", signature, "Pre/post token account mint, decimals, or owner disagrees.");
          account.valid = false;
          balanceDataKnown = false;
        }
        account.owner ??= owner;
        account[side] = raw;
        accounts.set(address, account);
      }
    }
    for (const account of accounts.values()) {
      if (account.mint === input.mint && account.decimals !== 6) {
        issue("invalid_mint_decimals", signature, "Configured mint is present with decimals other than six.");
        account.valid = false;
        balanceDataKnown = false;
      }
      if (account.mint === input.mint && !account.owner && account.address !== input.treasuryAddress) {
        issue("missing_token_owner", signature, "A configured-mint token account has no owner; treasury relevance is uncertain.");
        balanceDataKnown = false;
      }
    }
    let txIncoming = 0n;
    let txOutgoing = 0n;
    const slot = integer(tx.slot);
    const blockTime = integer(tx.blockTime);

    const inspectInstruction = (rawInstruction: unknown, index: number, innerIndex: number | null) => {
      const path = innerIndex === null ? `outer.${index}` : `outer.${index}.inner.${innerIndex}`;
      const instruction = object(rawInstruction);
      if (!instruction) {
        issue("invalid_instruction", signature, "Instruction is not an object.", true, path);
        return;
      }
      const programIndex = integer(instruction.programIdIndex);
      const directProgramId = string(instruction.programId);
      const indexedProgramId = programIndex === null ? null : addresses[programIndex] ?? null;
      if (("programId" in instruction && !directProgramId) || ("programIdIndex" in instruction && !indexedProgramId) || (directProgramId && indexedProgramId && directProgramId !== indexedProgramId)) {
        issue("program_identity_mismatch", signature, "Instruction program ID/index is invalid or contradictory.", true, path);
        return;
      }
      const programId = directProgramId ?? indexedProgramId;
      const namedToken = instruction.program === "spl-token" || instruction.program === "spl-token-2022";
      const identifiedToken = TOKEN_PROGRAMS.has(programId ?? "");
      if ((namedToken && !identifiedToken) || (identifiedToken && string(instruction.program) && !namedToken)) {
        issue("program_identity_mismatch", signature, "Parsed token program alias does not agree with a known token program ID.", true, path);
        return;
      }
      if (!programId && !string(instruction.program)) {
        issue("unsupported_instruction_layout", signature, "Instruction has no resolvable program identity.", true, path);
        return;
      }
      const isToken = identifiedToken;
      if (!isToken) return;
      const parsed = object(instruction.parsed);
      const info = object(parsed?.info);
      if (!parsed || !info || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) {
        // The balance comparison detects mint/burn effects as well. Never silently classify them as transfers.
        issue("unsupported_token_instruction", signature, "Token instruction is not a supported parsed transfer or transferChecked.", true, path);
        return;
      }
      const source = string(info.source);
      const destination = string(info.destination);
      const sourceAccount = source ? accounts.get(source) : undefined;
      const destinationAccount = destination ? accounts.get(destination) : undefined;
      const declaredMint = string(info.mint);
      const mints = [...new Set([declaredMint, sourceAccount?.mint, destinationAccount?.mint].filter((mint): mint is string => !!mint))];
      if (mints.length > 1) {
        issue("mint_mismatch", signature, "Instruction and token balance mints disagree.", true, path);
        return;
      }
      if (!mints.length) {
        issue("missing_mint", signature, "Transfer mint cannot be established from instruction or token balances.", true, path);
        return;
      }
      if (mints[0] !== input.mint) {
        issue("excluded_mint", signature, "Transfer uses a different mint and was excluded.", false, path);
        return;
      }
      const tokenAmount = object(info.tokenAmount);
      const raw = amount(parsed.type === "transferChecked" ? tokenAmount?.amount : info.amount);
      if (!source || !destination || raw === null || (parsed.type === "transferChecked" && tokenAmount?.decimals !== 6) || sourceAccount?.valid === false || destinationAccount?.valid === false) {
        issue("invalid_transfer", signature, "Transfer is missing accounts, valid integer units, or six-decimal mint evidence.", true, path);
        return;
      }
      if (parsed.type === "transfer" && ![sourceAccount, destinationAccount].some(account => account?.decimals === 6)) {
        issue("missing_decimals", signature, "Unchecked transfer has no six-decimal token balance evidence.", true, path);
        return;
      }
      const fromOwner = sourceAccount?.owner ?? null;
      const toOwner = destinationAccount?.owner ?? null;
      const fromTreasury = source === input.treasuryAddress || fromOwner === input.treasuryAddress;
      const toTreasury = destination === input.treasuryAddress || toOwner === input.treasuryAddress;
      if (!fromOwner || !toOwner) issue("missing_transfer_owner", signature, "One or both token owners are unknown; authority/signers were not substituted.", true, path);
      if (!fromTreasury && !toTreasury) return;
      const direction = fromTreasury && toTreasury ? "internal" : fromTreasury ? "outgoing" : "incoming";
      if (direction === "incoming") { txIncoming += raw; incoming += raw; }
      if (direction === "outgoing") { txOutgoing += raw; outgoing += raw; }
      if (direction === "internal") internal += raw;
      transfers.push({
        signature, instructionPath: path, instructionIndex: index, innerInstructionIndex: innerIndex,
        slot, blockTime, direction, mint: input.mint, fromTokenAccount: source, toTokenAccount: destination,
        fromOwner, toOwner, amountRaw: raw.toString(), amountUsdc: decimalUnits(raw),
        label: input.labels && Object.hasOwn(input.labels, signature) ? input.labels[signature] : null,
      });
    };
    message.instructions.forEach((instruction, index) => inspectInstruction(instruction, index, null));
    if (!Array.isArray(meta.innerInstructions)) {
      issue("missing_inner_instructions", signature, "Inner instruction recording is unavailable; CPI coverage cannot be established.");
    } else {
      const seenInnerIndexes = new Set<number>();
      for (const rawGroup of meta.innerInstructions) {
        const group = object(rawGroup);
        const index = integer(group?.index);
        if (index === null || index >= message.instructions.length || !Array.isArray(group?.instructions) || seenInnerIndexes.has(index)) {
          issue("invalid_inner_instructions", signature, "CPI group has invalid or duplicate outer index/instructions.");
          continue;
        }
        seenInnerIndexes.add(index);
        group.instructions.forEach((instruction, innerIndex) => inspectInstruction(instruction, index, innerIndex));
      }
    }
    const net = txIncoming - txOutgoing;
    const balanceDelta = balanceDataKnown ? [...accounts.values()].filter(account => account.valid && account.mint === input.mint && (account.owner === input.treasuryAddress || account.address === input.treasuryAddress)).reduce((sum, account) => sum + account.post - account.pre, 0n) : null;
    const matchesBalance = balanceDelta === null ? null : balanceDelta === net;
    if (matchesBalance === false) issue("balance_mismatch", signature, "Explicit transfer net differs from treasury token balance delta; transfer totals were retained.");
    if (balanceDelta === null) allBalanceDeltasKnown = false;
    else totalBalanceDelta += balanceDelta;
    reconciliations.push({ signature, status: "processed", transferNetRaw: net.toString(), balanceDeltaRaw: balanceDelta?.toString() ?? null, matchesBalance });
    processedSignatures.push(signature);
    if (matchesBalance !== true || exceptions.some(exception => exception.signature === signature && exception.affectsCoverage)) unresolvedSignatures.push(signature);
  }

  transfers.sort((a, b) => compareText(a.signature, b.signature) || a.instructionIndex - b.instructionIndex || (a.innerInstructionIndex ?? -1) - (b.innerInstructionIndex ?? -1));
  exceptions.sort((a, b) => compareText(a.signature ?? "", b.signature ?? "") || compareText(a.instructionPath ?? "", b.instructionPath ?? "") || compareText(a.code, b.code) || compareText(a.message, b.message));
  const complete = !exceptions.some(exception => exception.affectsCoverage);
  return {
    schemaVersion: "usdc-treasury-report/v1", treasuryAddress: input.treasuryAddress, mint: input.mint, decimals: 6,
    totals: { incomingRaw: incoming.toString(), outgoingRaw: outgoing.toString(), internalRaw: internal.toString(), netRaw: (incoming - outgoing).toString(), observedBalanceDeltaRaw: allBalanceDeltasKnown ? totalBalanceDelta.toString() : null },
    coverage: { complete, requested: signatures.length, received, reconciled: signatures.length - unresolvedSignatures.length, processedSignatures, unresolvedSignatures },
    transfers, transactions: reconciliations, exceptions,
  };
}

function csvCell(value: string | number | null, preserveText = false): string {
  let cell = value === null ? "" : String(value);
  if (preserveText || /^[\s\uFEFF]*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}

/** Transfer CSV only. JSON contains coverage/errors and must accompany exports for audit review. */
export function toCsv(report: TreasuryReport): string {
  const headers = ["signature", "instruction_path", "slot", "block_time", "direction", "mint", "from_token_account", "to_token_account", "from_owner", "to_owner", "amount_raw", "amount_usdc", "label"];
  const rows = report.transfers.map(transfer => [
    transfer.signature, transfer.instructionPath, transfer.slot, transfer.blockTime, transfer.direction, transfer.mint,
    transfer.fromTokenAccount, transfer.toTokenAccount, transfer.fromOwner, transfer.toOwner, transfer.amountRaw, transfer.amountUsdc, transfer.label,
  ].map((value, index) => csvCell(value, index === 10 || index === 11)).join(","));
  return `${headers.map(header => csvCell(header)).join(",")}\r\n${rows.length ? `${rows.join("\r\n")}\r\n` : ""}`;
}

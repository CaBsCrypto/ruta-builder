import test from "node:test";
import assert from "node:assert/strict";
import { reconcileTransfers, toCsv } from "../src/reports/index.ts";
import { SYNTHETIC_MINT, SYNTHETIC_TREASURY, syntheticFeeOnly, syntheticKnownBatch, syntheticTransfer } from "../fixtures/reports/synthetic.ts";
import type { RpcTransactionEnvelope } from "../src/reports/index.ts";

function reportFor(...transactions: RpcTransactionEnvelope[]) {
  return reconcileTransfers({ treasuryAddress: SYNTHETIC_TREASURY, mint: SYNTHETIC_MINT, requestedSignatures: transactions.map(tx => tx.signature), transactions });
}
const data = (envelope: RpcTransactionEnvelope): any => envelope.transaction;

test("reconstructs fifty explicitly synthetic signatures, including CPI, unchecked and internal transfers", () => {
  const report = reconcileTransfers(syntheticKnownBatch());
  assert.equal(report.coverage.complete, true);
  assert.equal(report.coverage.requested, 50);
  assert.equal(report.coverage.reconciled, 50);
  assert.equal(report.transfers.length, 38);
  assert.deepEqual(report.totals, { incomingRaw: "325000000", outgoingRaw: "338000000", internalRaw: "300000000", netRaw: "-13000000", observedBalanceDeltaRaw: "-13000000" });
  assert.equal(report.transfers.find(record => record.signature === "synthetic-signature-005")?.instructionPath, "outer.0.inner.0");
});

test("deduplicates signature requests and identical RPC envelopes", () => {
  const input = syntheticKnownBatch();
  input.requestedSignatures.push(input.requestedSignatures[0]);
  input.transactions.push(structuredClone(input.transactions[0]));
  const report = reconcileTransfers(input);
  assert.equal(report.totals.incomingRaw, "325000000");
  assert.equal(report.coverage.requested, 50);
  assert.equal(report.coverage.complete, true);
  assert.ok(report.exceptions.some(exception => exception.code === "duplicate_signature"));
  assert.ok(report.exceptions.some(exception => exception.code === "duplicate_envelope"));
});

test("conflicting duplicated payloads are skipped and expose incomplete coverage", () => {
  const tx = syntheticTransfer(1);
  const conflicting = structuredClone(tx);
  data(conflicting).slot++;
  const report = reportFor(tx, conflicting);
  assert.equal(report.totals.incomingRaw, "0");
  assert.equal(report.coverage.complete, false);
  assert.deepEqual(report.coverage.unresolvedSignatures, [tx.signature]);
});

test("failed transactions never contribute apparent parsed transfers", () => {
  const tx = syntheticTransfer(1);
  data(tx).meta.err = { InstructionError: [0, "Custom"] };
  const report = reportFor(tx);
  assert.equal(report.transfers.length, 0);
  assert.equal(report.totals.netRaw, "0");
  assert.equal(report.coverage.complete, false);
  assert.equal(report.exceptions[0].code, "failed_transaction");
});

test("foreign mint transfers are explicitly excluded", () => {
  const tx = syntheticTransfer(1);
  const rpc = data(tx);
  rpc.transaction.message.instructions[0].parsed.info.mint = "synthetic-other-mint";
  for (const balance of [...rpc.meta.preTokenBalances, ...rpc.meta.postTokenBalances]) balance.mint = "synthetic-other-mint";
  const report = reportFor(tx);
  assert.equal(report.transfers.length, 0);
  assert.equal(report.totals.netRaw, "0");
  assert.equal(report.coverage.complete, true);
  assert.ok(report.exceptions.some(exception => exception.code === "excluded_mint"));
});

test("missing RPC and mismatched primary signatures cannot be silently counted", () => {
  const tx = syntheticTransfer(1);
  data(tx).transaction.signatures[0] = "synthetic-different-signature";
  const report = reportFor(tx, { signature: "synthetic-missing", transaction: null });
  assert.equal(report.transfers.length, 0);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.unresolvedSignatures.length, 2);
  assert.equal(report.totals.observedBalanceDeltaRaw, null);
});

test("retains integer precision well beyond Number.MAX_SAFE_INTEGER", () => {
  const raw = "900719925474099312345678";
  const report = reportFor(syntheticTransfer(1, "incoming", raw));
  assert.equal(report.totals.incomingRaw, raw);
  assert.equal(report.transfers[0].amountUsdc, "900719925474099312.345678");
  assert.equal(report.coverage.complete, true);
  assert.equal(JSON.parse(JSON.stringify(report)).totals.incomingRaw, raw);
});

test("rejects numeric amount coercion and incorrect decimals", () => {
  const numeric = syntheticTransfer(1);
  data(numeric).transaction.message.instructions[0].parsed.info.tokenAmount.amount = 1000000;
  const wrongDecimals = syntheticTransfer(2);
  data(wrongDecimals).transaction.message.instructions[0].parsed.info.tokenAmount.decimals = 9;
  const report = reportFor(numeric, wrongDecimals);
  assert.equal(report.transfers.length, 0);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.exceptions.filter(exception => exception.code === "invalid_transfer").length, 2);
});

test("balance mismatch retains transfer net and its discrepancy", () => {
  const tx = syntheticTransfer(1, "outgoing", "3000000");
  data(tx).meta.postTokenBalances[0].uiTokenAmount.amount = "1000000";
  const report = reportFor(tx);
  assert.equal(report.totals.netRaw, "-3000000");
  assert.equal(report.totals.observedBalanceDeltaRaw, "-2000000");
  assert.equal(report.coverage.complete, false);
  assert.ok(report.exceptions.some(exception => exception.code === "balance_mismatch"));
});

test("missing owners do not use signers/authority as identity or recipient", () => {
  const tx = syntheticTransfer(1, "outgoing");
  for (const balance of [...data(tx).meta.preTokenBalances, ...data(tx).meta.postTokenBalances]) {
    if (balance.accountIndex === 2) delete balance.owner;
  }
  data(tx).transaction.message.instructions[0].parsed.info.authority = "synthetic-delegate";
  const report = reportFor(tx);
  assert.equal(report.transfers[0].fromOwner, SYNTHETIC_TREASURY);
  assert.equal(report.transfers[0].toOwner, null);
  assert.equal(report.transfers[0].direction, "outgoing");
  assert.equal(report.coverage.complete, false);
});

test("treasury token account address can be used directly instead of owner address", () => {
  const tx = syntheticTransfer(1, "incoming");
  const report = reconcileTransfers({ treasuryAddress: "synthetic-destination-account-1", mint: SYNTHETIC_MINT, requestedSignatures: [tx.signature], transactions: [tx] });
  assert.equal(report.transfers[0].direction, "incoming");
  assert.equal(report.totals.netRaw, "1000000");
  assert.equal(report.coverage.complete, true);
});

test("a treasury signer paying only SOL/fees does not create a USDC record", () => {
  const report = reportFor(syntheticFeeOnly(1));
  assert.equal(report.transfers.length, 0);
  assert.equal(report.totals.netRaw, "0");
  assert.equal(report.coverage.complete, true);
});

test("missing balances and unavailable CPI recording are explicit coverage gaps", () => {
  const tx = syntheticTransfer(1);
  delete data(tx).meta.preTokenBalances;
  data(tx).meta.innerInstructions = null;
  const report = reportFor(tx);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.totals.observedBalanceDeltaRaw, null);
  assert.ok(report.exceptions.some(exception => exception.code === "missing_token_balances"));
  assert.ok(report.exceptions.some(exception => exception.code === "missing_inner_instructions"));
});

test("raw/unsupported SPL layouts cannot silently pass reconciliation", () => {
  const tx = syntheticTransfer(1);
  data(tx).transaction.message.instructions[0] = { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: "opaque" };
  const report = reportFor(tx);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.transfers.length, 0);
  assert.ok(report.exceptions.some(exception => exception.code === "unsupported_token_instruction"));
});

test("string account keys retain token balance account indexes", () => {
  const tx = syntheticTransfer(1);
  data(tx).transaction.message.accountKeys = data(tx).transaction.message.accountKeys.map((key: any) => key.pubkey);
  const report = reportFor(tx);
  assert.equal(report.coverage.complete, true);
  assert.equal(report.totals.netRaw, "1000000");
});

test("duplicate token balances and malformed account keys cannot report complete coverage", () => {
  const duplicateBalance = syntheticTransfer(1);
  data(duplicateBalance).meta.preTokenBalances.push(structuredClone(data(duplicateBalance).meta.preTokenBalances[0]));
  const invalidKey = syntheticTransfer(2);
  data(invalidKey).transaction.message.accountKeys[1] = {};
  const report = reportFor(duplicateBalance, invalidKey);
  assert.equal(report.coverage.complete, false);
  assert.ok(report.exceptions.some(exception => exception.code === "duplicate_token_balance"));
  assert.ok(report.exceptions.some(exception => exception.code === "unsupported_account_keys"));
});

test("compiled token program instruction is marked unsupported instead of ignored", () => {
  const tx = syntheticTransfer(1);
  data(tx).transaction.message.accountKeys.push({ pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", signer: false, writable: false });
  data(tx).transaction.message.instructions[0] = { programIdIndex: 3, accounts: [1, 2], data: "opaque" };
  const report = reportFor(tx);
  assert.equal(report.coverage.complete, false);
  assert.ok(report.exceptions.some(exception => exception.code === "unsupported_token_instruction"));
});

test("token aliases cannot override an unknown or contradictory program identity", () => {
  const unknownId = syntheticTransfer(1);
  data(unknownId).transaction.message.instructions[0].programId = "synthetic-unrelated-program";
  const outOfRangeIndex = syntheticTransfer(2);
  delete data(outOfRangeIndex).transaction.message.instructions[0].programId;
  data(outOfRangeIndex).transaction.message.instructions[0].programIdIndex = 999;
  const wrongAlias = syntheticTransfer(3);
  data(wrongAlias).transaction.message.instructions[0].program = "system";
  const missingId = syntheticTransfer(4);
  delete data(missingId).transaction.message.instructions[0].programId;
  const report = reportFor(unknownId, outOfRangeIndex, wrongAlias, missingId);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.transfers.length, 0);
  assert.equal(report.exceptions.filter(exception => exception.code === "program_identity_mismatch").length, 4);
});

test("JSON and CSV exports are deterministic with permuted fetched envelopes", () => {
  const input = syntheticKnownBatch();
  const expected = reconcileTransfers(input);
  input.transactions.reverse();
  input.requestedSignatures.reverse();
  const actual = reconcileTransfers(input);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  assert.equal(toCsv(actual), toCsv(expected));
});

test("explicit human labels are quoted and spreadsheet formula cells are escaped", () => {
  const tx = syntheticTransfer(1);
  const report = reconcileTransfers({ treasuryAddress: SYNTHETIC_TREASURY, mint: SYNTHETIC_MINT, requestedSignatures: [tx.signature], transactions: [tx], labels: { [tx.signature]: ' =HYPERLINK("https://synthetic.invalid","grant")\nline' } });
  assert.equal(report.transfers[0].label, ' =HYPERLINK("https://synthetic.invalid","grant")\nline');
  const csv = toCsv(report);
  assert.ok(csv.includes('"\' =HYPERLINK(""https://synthetic.invalid"",""grant"")\nline"'));
  assert.ok(csv.includes('"\'1000000","\'1.000000"'));
  assert.equal(report.transfers[0].fromOwner, "synthetic-counterparty-1");
});

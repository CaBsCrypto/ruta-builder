# Candidate B: USDC report reconciliation

`reconcileTransfers(input)` accepts a configured treasury owner **or token account**, one six-decimal mint, the requested signature set, and an array of `{ signature, transaction }` envelopes. `transaction` is the unwrapped `result` returned by Solana `getTransaction` using `encoding: "jsonParsed"`; preserve `null` for unavailable results. No RPC request, wallet key, or on-chain write is performed by this module.

```ts
import { reconcileTransfers, toCsv } from "./index.ts";

const report = reconcileTransfers({
  treasuryAddress,
  mint,
  requestedSignatures,
  transactions: fetchedRpcEnvelopes,
  labels: { [requestedSignatures[0]]: "Grant milestone 1" },
});
const json = JSON.stringify(report, null, 2);
const csv = toCsv(report);
```

`labels` are human-supplied values keyed by signature. They are not inferred identities or certifications. All transfer amounts and signed aggregate values are decimal integer strings; formatted USDC uses exactly six fractional digits. No floating point balance value from RPC is used.

The parser walks outer and CPI inner instructions, accepts SPL Token/Token-2022 `transfer` and `transferChecked` only with a recognized concrete token program ID, resolves mint and token owners using the pre/post token balances, and retains source/destination token accounts and instruction locations. Parsed program aliases cannot override missing, contradictory, or unknown program IDs. An authority or signer is never substituted for an owner. Internal treasury transfers contribute to `internalRaw` but not incoming/outgoing/net.

Transfer net is compared against treasury token balance delta. Missing data, unknown owners, failed transactions, signature mismatches, opaque token layouts, conflicting duplicate envelopes, unsupported token effects, and balance discrepancies expose `coverage.complete: false`. Explicit transfer totals remain visible when balance reconciliation fails. An identical replay or duplicate requested signature is deduplicated and reported without invalidating otherwise complete coverage. Foreign mint transfers are excluded with a notice.

`coverage.complete` covers only the requested batch. It does not prove complete wallet history, period coverage, RPC authenticity, or finality. Discovery/pagination, start/end selection, provider retries, and finalized commitment are responsibilities of a caller. `slot` and `blockTime` remain null when unavailable. Mint/burn/token extensions, transfer fees, raw compiled instruction decoding, and ownership changes are not supported; they must not silently produce a complete report. Treasury policy, tax treatment, and the accuracy of human labels are outside this module.

Output ordering and exports are deterministic. CSV is a transfer table; deliver the JSON alongside it because JSON carries reconciliation and exceptions. CSV quotes every cell, escapes embedded quotes/newlines and spreadsheet formulas, and prefixes raw/formatted amount cells with an apostrophe to preserve exact integer precision when opened in a spreadsheet.

`fixtures/reports/synthetic.ts` generates fifty deliberately synthetic signatures. They are test data, not devnet evidence. Run `node --experimental-strip-types --test tests/reports.test.ts` on Node 22.20+ to verify the implementation.

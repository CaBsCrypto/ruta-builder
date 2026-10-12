import type { ReconcileInput, RpcTransactionEnvelope } from "../../src/reports/index.ts";

/** SYNTHETIC ONLY: these addresses/signatures are deliberately not on-chain evidence. */
export const SYNTHETIC_TREASURY = "synthetic-treasury-owner";
export const SYNTHETIC_MINT = "synthetic-six-decimal-usdc-mint";

export function syntheticTransfer(index: number, direction: "incoming" | "outgoing" | "internal" = "incoming", units = "1000000", inner = false, unchecked = false): RpcTransactionEnvelope {
  const signature = `synthetic-signature-${index.toString().padStart(3, "0")}`;
  const fromOwner = direction === "incoming" ? `synthetic-counterparty-${index}` : SYNTHETIC_TREASURY;
  const toOwner = direction === "outgoing" ? `synthetic-counterparty-${index}` : SYNTHETIC_TREASURY;
  const source = `synthetic-source-account-${index}`;
  const destination = `synthetic-destination-account-${index}`;
  const tokenAmount = (amount: string) => ({ amount, decimals: 6, uiAmount: null, uiAmountString: "SYNTHETIC" });
  const balance = (accountIndex: number, owner: string, amount: string) => ({ accountIndex, mint: SYNTHETIC_MINT, owner, uiTokenAmount: tokenAmount(amount) });
  const transfer = { program: "spl-token", programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", parsed: { type: unchecked ? "transfer" : "transferChecked", info: { source, destination, authority: fromOwner, ...(unchecked ? { amount: units } : { mint: SYNTHETIC_MINT, tokenAmount: tokenAmount(units) }) } } };
  return {
    signature,
    transaction: {
      slot: 123000 + index, blockTime: 1791673200 + index,
      transaction: { signatures: [signature], message: {
        accountKeys: [{ pubkey: SYNTHETIC_TREASURY, signer: true, writable: true }, { pubkey: source, signer: false, writable: true }, { pubkey: destination, signer: false, writable: true }],
        instructions: inner ? [{ programId: "synthetic-aggregator-program", accounts: [1, 2], data: "synthetic-cpi" }] : [transfer],
      } },
      meta: { err: null, fee: 5000, preTokenBalances: [balance(1, fromOwner, units), balance(2, toOwner, "0")], postTokenBalances: [balance(1, fromOwner, "0"), balance(2, toOwner, units)], innerInstructions: inner ? [{ index: 0, instructions: [transfer] }] : [] },
    },
  };
}

export function syntheticFeeOnly(index: number): RpcTransactionEnvelope {
  const envelope = syntheticTransfer(index);
  const tx = envelope.transaction as any;
  tx.transaction.message.instructions = [{ program: "system", parsed: { type: "transfer", info: { source: SYNTHETIC_TREASURY, destination: "synthetic-sol-recipient", lamports: 10 } } }];
  tx.meta.preTokenBalances = [];
  tx.meta.postTokenBalances = [];
  return envelope;
}

/** Fifty known synthetic signatures: 13 incoming, 13 outgoing, 12 internal, 12 SOL-only. */
export function syntheticKnownBatch(): ReconcileInput {
  const transactions = Array.from({ length: 50 }, (_, index) => {
    if (index % 4 === 3) return syntheticFeeOnly(index + 1);
    const direction = index % 4 === 0 ? "incoming" : index % 4 === 1 ? "outgoing" : "internal";
    return syntheticTransfer(index + 1, direction, ((BigInt(index) + 1n) * 1000000n).toString(), index === 4, index === 5);
  });
  return { treasuryAddress: SYNTHETIC_TREASURY, mint: SYNTHETIC_MINT, decimals: 6, requestedSignatures: transactions.map(tx => tx.signature), transactions };
}

import { mkdir, writeFile } from 'node:fs/promises';
import { DEVNET_NETWORK, DEVNET_RPC, DEVNET_USDC } from '../shared/config.ts';
import { ReadonlySolanaRpc } from '../shared/rpc.ts';
import { reconcileTransfers } from '../reports/index.ts';
import type { ReconcileInput } from '../reports/index.ts';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
const nonemptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const tokenPrograms = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);

/** Choose an owner explicitly recorded for an account involved in a checked transfer. */
function candidateOwner(transaction: unknown): { owner: string; instructionPath: string } | null {
  const tx = object(transaction);
  const meta = object(tx?.meta);
  const message = object(object(tx?.transaction)?.message);
  if (!meta || meta.err !== null || !message || !Array.isArray(message.accountKeys) || !Array.isArray(message.instructions)) return null;
  const addresses = message.accountKeys.map(key => nonemptyString(key) ?? nonemptyString(object(key)?.pubkey));
  const owners = new Map<string, string>();
  for (const balances of [meta.preTokenBalances, meta.postTokenBalances]) {
    if (!Array.isArray(balances)) continue;
    for (const value of balances) {
      const balance = object(value);
      const owner = nonemptyString(balance?.owner);
      const index = balance?.accountIndex;
      if (balance?.mint !== DEVNET_USDC || !owner || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) continue;
      const address = addresses[index];
      if (address) owners.set(address, owner);
    }
  }
  const instructions = message.instructions.map((instruction, index) => ({ instruction, path: `outer.${index}` }));
  if (Array.isArray(meta.innerInstructions)) {
    for (const value of meta.innerInstructions) {
      const group = object(value);
      if (!group || !Array.isArray(group.instructions)) continue;
      group.instructions.forEach((instruction, index) => {
        instructions.push({ instruction, path: `outer.${String(group.index)}.inner.${index}` });
      });
    }
  }
  for (const { instruction: value, path } of instructions) {
    const instruction = object(value);
    const parsed = object(instruction?.parsed);
    const info = object(parsed?.info);
    if (!instruction || !tokenPrograms.has(String(instruction.programId)) || parsed?.type !== 'transferChecked' || info?.mint !== DEVNET_USDC) continue;
    const tokenAmount = object(info.tokenAmount);
    if (tokenAmount?.decimals !== 6 || typeof tokenAmount.amount !== 'string' || !/^(0|[1-9]\d*)$/.test(tokenAmount.amount)) continue;
    const source = nonemptyString(info.source);
    const destination = nonemptyString(info.destination);
    const owner = (source && owners.get(source)) || (destination && owners.get(destination));
    if (owner) return { owner, instructionPath: path };
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log('Uso: npm run devnet:sample\nLee hasta tres firmas del mint USDC en devnet y sus transacciones jsonParsed.\nReconcilia una transferencia comprobada para un propietario explícito.\nSalida: output/devnet-sample.json. No paga, firma ni envía transacciones.\nSOLANA_RPC_URL permite elegir un RPC; se comprueba el génesis devnet antes de consultar.\n--help funciona sin solicitudes de red.');
    return;
  }
  if (args.length) {
    console.error('Argumentos no admitidos. Usa --help; la muestra está limitada a tres firmas.');
    process.exitCode = 2;
    return;
  }

  const result: JsonObject = {
    checkedAt: new Date().toISOString(), mode: 'devnet-readonly-sample', network: DEVNET_NETWORK,
    status: 'no-sample', paymentAttempted: false, paymentSettled: false, transactionSubmitted: false,
    walletHistoryCovered: false, independentGroundTruth: false,
    scope: 'Una transacción seleccionada de hasta tres firmas recientes del mint; sin paginación ni búsqueda de billeteras.',
  };
  let rpc: ReadonlySolanaRpc | undefined;
  try {
    rpc = new ReadonlySolanaRpc(process.env.SOLANA_RPC_URL ?? DEVNET_RPC);
    result.source = {
      rpcOrigin: new URL(rpc.url).origin, mint: DEVNET_USDC, commitment: 'confirmed',
      signatureLimit: 3, maxSupportedTransactionVersion: 0,
    };
    await rpc.assertDevnet();
    result.genesisConfirmed = true;
    const signaturesResult = await rpc.call<unknown>('getSignaturesForAddress', [DEVNET_USDC, { limit: 3, commitment: 'confirmed' }]);
    if (!Array.isArray(signaturesResult)) throw new Error('RPC devolvió una lista de firmas inválida.');
    const signatures = [...new Set(signaturesResult.slice(0, 3).map(value => nonemptyString(object(value)?.signature)).filter((value): value is string => value !== null))];
    result.discoveredSignatures = signatures;
    const inspected: { signature: string; available: boolean; successful: boolean; error?: string }[] = [];
    const samples: { signature: string; transaction: unknown; owner: string; instructionPath: string }[] = [];
    for (const signature of signatures) {
      try {
        const transaction = await rpc.call<unknown>('getTransaction', [signature, {
          encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0,
        }]);
        const successful = object(object(transaction)?.meta)?.err === null;
        inspected.push({ signature, available: transaction !== null, successful });
        const candidate = candidateOwner(transaction);
        if (candidate) samples.push({ signature, transaction, owner: candidate.owner, instructionPath: candidate.instructionPath });
      } catch (error) {
        inspected.push({ signature, available: false, successful: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    result.inspected = inspected;
    const sample = samples[0];
    if (sample) {
      const input: ReconcileInput = {
        treasuryAddress: sample.owner, mint: DEVNET_USDC, decimals: 6,
        requestedSignatures: [sample.signature], transactions: [{ signature: sample.signature, transaction: sample.transaction }],
      };
      const report = reconcileTransfers(input);
      result.selectedSignature = sample.signature;
      result.selectedInstructionPath = sample.instructionPath;
      result.sourceTransaction = sample.transaction;
      result.report = report;
      result.status = report.coverage.complete && report.transfers.length > 0 ? 'sample-reconciled' : 'coverage-incomplete';
    } else {
      result.reason = 'La muestra consultada no aportó una transacción exitosa con transferChecked USDC y propietario explícito. No se amplió la búsqueda.';
      if (inspected.some(item => item.error || !item.available)) result.status = 'coverage-incomplete';
    }
  } catch (error) {
    result.status = 'coverage-incomplete';
    result.reason = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  }
  if (rpc) result.rpc = rpc.telemetry;
  await mkdir('output', { recursive: true });
  await writeFile('output/devnet-sample.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, selectedSignature: result.selectedSignature, rpc: result.rpc, reason: result.reason, output: 'output/devnet-sample.json' }, null, 2));
}

await main();

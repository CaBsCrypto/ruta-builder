import { mkdir, writeFile } from 'node:fs/promises';
import { ReadonlySolanaRpc } from '../shared/rpc.ts';
import { DEVNET_RPC, DEVNET_USDC, DEVNET_NETWORK } from '../shared/config.ts';
import { HTTPFacilitatorClient } from '@x402/core/server';

const rpc = new ReadonlySolanaRpc(process.env.SOLANA_RPC_URL ?? DEVNET_RPC);
const result: Record<string, unknown> = {
  checkedAt: new Date().toISOString(), mode: 'devnet-readonly', network: DEVNET_NETWORK,
  transactionSubmitted: false, paymentSettled: false,
};
try {
  await rpc.assertDevnet();
  result.genesisConfirmed = true;
  result.slot = await rpc.call('getSlot', [{ commitment: 'confirmed' }]);
  const mint = await rpc.call<{ value: { data: { parsed?: { info?: { decimals?: number } } } } | null }>('getAccountInfo', [DEVNET_USDC, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  result.usdcMint = DEVNET_USDC;
  result.mintDecimals = mint.value?.data.parsed?.info?.decimals;
  if (result.mintDecimals !== 6) throw new Error('No se pudo confirmar el mint USDC de devnet y sus seis decimales.');
  const facilitator = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL, timeoutMs: 15_000 });
  const supported = await facilitator.getSupported();
  result.facilitator = { url: facilitator.url, exactDevnetSupported: supported.kinds.some(kind => kind.x402Version === 2 && kind.network === DEVNET_NETWORK && kind.scheme === 'exact') };
  result.status = 'passed-readonly';
} catch (error) {
  result.status = 'blocked';
  result.reason = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
}
result.rpc = rpc.telemetry;
await mkdir('output', { recursive: true });
await writeFile('output/devnet-check.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

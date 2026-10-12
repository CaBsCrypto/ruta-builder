import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { StandardConnectFeature } from '@wallet-standard/features';
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import { SOLANA_DEVNET_CHAIN } from '@solana/wallet-standard-chains';
import { address, getTransactionDecoder, getTransactionEncoder, type TransactionPartialSigner } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { x402PurchaseAdapter } from '../src/payments/client.ts';
import type { SettlementOutcome } from '../src/buyer/index.ts';

export type BrowserWallet = Wallet;
const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const PRICE = '10000';
export function isCompatibleWallet(wallet: Wallet): boolean {
  const sign = wallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
  return wallet.chains.includes(SOLANA_DEVNET_CHAIN) && typeof (wallet.features['standard:connect'] as StandardConnectFeature['standard:connect'] | undefined)?.connect === 'function' && typeof sign?.signTransaction === 'function' && sign.supportedTransactionVersions.includes(0);
}
export function discoverWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const registry = getWallets();
  const update = () => onChange(registry.get().filter(isCompatibleWallet));
  update();
  const offRegister = registry.on('register', update); const offUnregister = registry.on('unregister', update);
  return () => { offRegister(); offUnregister(); };
}

/** A partial signer only: it never uses signAndSendTransaction or submits through RPC. */
export function createPartialSigner(wallet: Wallet, account: WalletAccount): TransactionPartialSigner {
  if (!isCompatibleWallet(wallet) || !account.chains.includes(SOLANA_DEVNET_CHAIN) || !account.features.includes(SolanaSignTransaction)) throw new Error('La cuenta no permite firmar transacciones de Solana devnet.');
  const accountAddress = address(account.address);
  const feature = wallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
  return {
    address: accountAddress,
    async signTransactions(transactions) {
      const outputs = await feature.signTransaction(...transactions.map(transaction => ({ account, chain: SOLANA_DEVNET_CHAIN as 'solana:devnet', transaction: new Uint8Array(getTransactionEncoder().encode(transaction)) })));
      if (outputs.length !== transactions.length) throw new Error('La wallet no devolvió todas las firmas solicitadas.');
      return outputs.map((output, index) => {
        const signed = getTransactionDecoder().decode(output.signedTransaction);
        const original = transactions[index]!;
        if (signed.messageBytes.length !== original.messageBytes.length || signed.messageBytes.some((byte, offset) => byte !== original.messageBytes[offset])) throw new Error('La wallet modificó la transacción aprobada; no se enviará la autorización.');
        const signature = signed.signatures[accountAddress];
        if (!signature || signature.length !== 64 || signature.every(byte => byte === 0)) throw new Error('La wallet no incluyó una firma válida de la cuenta.');
        return { [accountAddress]: signature };
      });
    },
  };
}

export async function payWithWallet({ wallet, reportId, resource, health }: {
  wallet: Wallet; reportId: string; resource: string;
  health: { network: string; mint: string; price: string; payTo: string; mode: string };
}): Promise<SettlementOutcome> {
  const stateKey = `ruta:payment:${reportId}`;
  if (['uncertain', 'sending', 'confirmed'].includes(sessionStorage.getItem(stateKey) || '')) return { status: 'uncertain', reason: 'Ya existe una autorización pendiente o confirmada. Comprueba el estado del informe sin solicitar otra firma.' };
  if (health.mode !== 'devnet' || health.network !== NETWORK || health.mint !== MINT || health.price !== '0.01') return { status: 'rejected', reason: 'La configuración no corresponde al precio de 0,01 USDC y a la red devnet autorizados.' };
  const url = new URL(resource, location.origin);
  if (url.origin !== location.origin || url.pathname !== `/reports/${encodeURIComponent(reportId)}` || url.search || url.hash) return { status: 'rejected', reason: 'El recurso de pago no pertenece a este informe y a este sitio.' };
  if (!isCompatibleWallet(wallet)) return { status: 'rejected', reason: 'La wallet no admite firma local de transacciones v0 en Solana devnet.' };
  try {
    address(health.payTo);
    const connection = wallet.features['standard:connect'] as StandardConnectFeature['standard:connect'];
    const connected = await connection.connect();
    const account = connected.accounts.find(item => item.chains.includes(SOLANA_DEVNET_CHAIN) && item.features.includes(SolanaSignTransaction));
    if (!account) return { status: 'rejected', reason: 'No se encontró una cuenta autorizada para Solana devnet.' };
    const client = new x402Client().register(NETWORK, new ExactSvmScheme(createPartialSigner(wallet, account), { rpcUrl: 'https://api.devnet.solana.com' }));
    const intentKey = `ruta:intent:${reportId}`;
    let idempotencyKey = sessionStorage.getItem(intentKey);
    if (!idempotencyKey) { idempotencyKey = `browser-${crypto.randomUUID()}`; sessionStorage.setItem(intentKey, idempotencyKey); }
    const guardedFetch: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.has('PAYMENT-SIGNATURE')) sessionStorage.setItem(stateKey, 'sending');
      return fetch(input, { ...init, credentials: 'same-origin' });
    };
    const result = await x402PurchaseAdapter(client, guardedFetch)({ idempotencyKey, projectId: reportId, agentId: 'builder-desktop', providerId: 'ruta-builder', network: NETWORK, mint: MINT, payTo: health.payTo, amount: BigInt(PRICE), resource: url.href });
    if (result.status === 'confirmed') sessionStorage.setItem(stateKey, 'confirmed');
    else if (result.status === 'uncertain') sessionStorage.setItem(stateKey, 'uncertain');
    else { sessionStorage.removeItem(stateKey); sessionStorage.removeItem(intentKey); }
    return result;
  } catch (error) {
    if (sessionStorage.getItem(stateKey) === 'sending') { sessionStorage.setItem(stateKey, 'uncertain'); return { status: 'uncertain', reason: 'La autorización pudo enviarse. Comprueba el estado sin firmar otra compra.' }; }
    return { status: 'rejected', reason: error instanceof Error ? error.message : 'La wallet no pudo preparar la firma.' };
  }
}

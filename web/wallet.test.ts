import assert from 'node:assert/strict';
import test from 'node:test';
import { address, blockhash, compileTransaction, createTransactionMessage, getTransactionDecoder, getTransactionEncoder, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, type SignatureBytes, type Transaction, type TransactionWithLifetime, type TransactionWithinSizeLimit } from '@solana/kit';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { SolanaSignTransactionInput } from '@solana/wallet-standard-features';
import { createPartialSigner, isCompatibleWallet } from './wallet.ts';

const ACCOUNT = address('11111111111111111111111111111111');
const account: WalletAccount = { address: ACCOUNT, publicKey: new Uint8Array(32), chains: ['solana:devnet'], features: ['solana:signTransaction'] };
function transaction() {
  const message = setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash(ACCOUNT), lastValidBlockHeight: 1n }, setTransactionMessageFeePayer(ACCOUNT, createTransactionMessage({ version: 0 })));
  return compileTransaction(message) as Transaction & TransactionWithLifetime & TransactionWithinSizeLimit;
}
function wallet(sign: (...inputs: readonly SolanaSignTransactionInput[]) => Promise<readonly { signedTransaction: Uint8Array }[]>): Wallet {
  return { version: '1.0.0', name: 'Offline test wallet', icon: 'data:image/svg+xml;base64,', chains: ['solana:devnet'], accounts: [account], features: {
    'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: [0], signTransaction: sign },
  } };
}
function signedBytes(input: SolanaSignTransactionInput, modify = false) {
  const decoded = getTransactionDecoder().decode(input.transaction);
  const bytes = new Uint8Array(decoded.messageBytes);
  if (modify) bytes[bytes.length - 5] = bytes[bytes.length - 5]! ^ 1;
  return new Uint8Array(getTransactionEncoder().encode({ ...decoded, messageBytes: bytes as unknown as Transaction['messageBytes'], signatures: { [ACCOUNT]: new Uint8Array(64).fill(7) as SignatureBytes } }));
}

test('wallet partial signer requests local devnet signature and returns only account dictionary', async () => {
  let calls = 0;
  const signer = createPartialSigner(wallet(async (...inputs) => { calls++; assert.equal(inputs[0]?.chain, 'solana:devnet'); assert.equal(inputs[0]?.account, account); return inputs.map(input => ({ signedTransaction: signedBytes(input) })); }), account);
  const signatures = await signer.signTransactions([transaction()]);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(signatures[0]!), [ACCOUNT]);
  assert.equal(signatures[0]![ACCOUNT]?.length, 64);
});
test('wallet cannot modify transaction contents while authorizing a fixed resource', async () => {
  const signer = createPartialSigner(wallet(async (...inputs) => inputs.map(input => ({ signedTransaction: signedBytes(input, true) }))), account);
  await assert.rejects(signer.signTransactions([transaction()]), /changed the approved transaction/);
});
test('wallet rejects missing signed outputs before authorization can be sent', async () => {
  const signer = createPartialSigner(wallet(async () => []), account);
  await assert.rejects(signer.signTransactions([transaction()]), /did not return all requested signatures/);
});
test('wallet discovery excludes unsupported chain and unsupported transaction version', () => {
  const original = wallet(async () => []);
  assert.equal(isCompatibleWallet(original), true);
  assert.equal(isCompatibleWallet({ ...original, chains: ['solana:mainnet'] }), false);
  assert.equal(isCompatibleWallet({ ...original, features: { ...original.features, 'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], signTransaction: async () => [] } } }), false);
  assert.throws(() => createPartialSigner(original, { ...account, chains: ['solana:mainnet'] }), /no permite firmar/);
});

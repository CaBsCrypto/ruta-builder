import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from "@solana/kit";
import { DEVNET_NETWORK } from "./config.ts";

const CACHE_PATH = resolve(".cache/disposable-devnet-wallet.json");
interface WalletCache {
  schemaVersion: "disposable-devnet-wallet/v1";
  network: typeof DEVNET_NETWORK;
  buyerSeedBase64: string;
  merchantSeedBase64: string;
  buyerAddress: string;
  merchantAddress: string;
}

async function signerFromSeed(encoded: unknown): Promise<KeyPairSigner> {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("La cache devnet tiene una semilla inválida; no se reemplazará.");
  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  if (bytes.length !== 32) throw new Error("La cache devnet debe contener semillas de exactamente 32 bytes.");
  try { return await createKeyPairSignerFromPrivateKeyBytes(bytes); }
  finally { bytes.fill(0); }
}

async function loadCache(): Promise<{ buyer: KeyPairSigner; merchant: KeyPairSigner; path: string; newlyCreated: boolean }> {
  let cache: WalletCache;
  try { cache = JSON.parse(await readFile(CACHE_PATH, "utf8")) as WalletCache; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw error;
    throw new Error("No se pudo leer la cache de wallets desechables; no se reemplazará ni se mostrará su contenido.");
  }
  if (cache.schemaVersion !== "disposable-devnet-wallet/v1" || cache.network !== DEVNET_NETWORK) throw new Error("La cache de wallets no pertenece a este prototipo devnet.");
  const buyer = await signerFromSeed(cache.buyerSeedBase64);
  const merchant = await signerFromSeed(cache.merchantSeedBase64);
  if (buyer.address !== cache.buyerAddress || merchant.address !== cache.merchantAddress || buyer.address === merchant.address) throw new Error("Las direcciones de la cache no corresponden a sus semillas devnet.");
  await chmod(CACHE_PATH, 0o600);
  return { buyer, merchant, path: CACHE_PATH, newlyCreated: false };
}

/** Creates only isolated devnet keys. Never reads environment or user wallet/key files. */
export async function loadOrCreateDisposableWallets() {
  try { return await loadCache(); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const buyerSeed = randomBytes(32);
  const merchantSeed = randomBytes(32);
  try {
    const buyer = await createKeyPairSignerFromPrivateKeyBytes(buyerSeed);
    const merchant = await createKeyPairSignerFromPrivateKeyBytes(merchantSeed);
    const cache: WalletCache = {
      schemaVersion: "disposable-devnet-wallet/v1", network: DEVNET_NETWORK,
      buyerSeedBase64: buyerSeed.toString("base64"), merchantSeedBase64: merchantSeed.toString("base64"),
      buyerAddress: buyer.address, merchantAddress: merchant.address,
    };
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    try { await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") return await loadCache();
      throw error;
    }
    await chmod(CACHE_PATH, 0o600);
    return { buyer, merchant, path: CACHE_PATH, newlyCreated: true };
  } finally {
    buyerSeed.fill(0);
    merchantSeed.fill(0);
  }
}

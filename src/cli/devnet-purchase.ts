import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { BudgetLedger, BuyerGateway } from "../buyer/index.ts";
import { startPaidReportServer } from "../payments/server.ts";
import { x402PurchaseAdapter } from "../payments/client.ts";
import { reconcileTransfers } from "../reports/index.ts";
import { DEVNET_NETWORK, DEVNET_RPC, DEVNET_USDC, REPORT_PRICE_UNITS } from "../shared/config.ts";
import { loadOrCreateDisposableWallets } from "../shared/disposable-wallet.ts";
import { ReadonlySolanaRpc } from "../shared/rpc.ts";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const HELP = `Prueba una única compra real x402 de 0.01 USDC de prueba en Solana devnet.

Uso:
  npm run devnet:purchase -- --help
  npm run devnet:purchase -- --prepare-wallets
  npm run devnet:purchase

--help             Ayuda sin red, archivos ni generación de wallets.
--prepare-wallets  Crea/carga dos wallets desechables y muestra únicamente sus
                   direcciones y los faucets oficiales, sin acceder a la red.

Las semillas de 32 bytes se conservan en .cache/disposable-devnet-wallet.json
con modo 600; en Windows también aplica la protección ACL heredada del directorio.
No se leen claves de wallets del usuario ni claves de variables de entorno.
Las consultas deben confirmar la identidad genesis de devnet y el mint USDC.
Se requiere USDC en la ATA del comprador y una ATA USDC existente del vendedor.
Circle puede crear/fondear ambas ATAs con 20 USDC por dirección cada dos horas:
https://faucet.circle.com/ (elegir Solana Devnet; formulario protegido por reCAPTCHA).
SOL de prueba: https://faucet.solana.com/ (seleccionar Devnet si se necesita).

La compra usa el facilitador oficial por defecto del SDK y un servidor local.
El recurso pagado muestra balances observados; no afirma un historial completo.
No hay reintentos automáticos de pago. Una respuesta incierta conserva la reserva.
Se escribe output/devnet-purchase.json sin semillas ni autorizaciones firmadas.
Si la evidencia previa indica un intento de liquidación, éxito o estado incierto,
el comando se detiene sin comprar de nuevo ni sobrescribir esa evidencia.
Una ejecución blocked-funding permite volver a comprobar tras usar el faucet.
SOLANA_RPC_URL puede indicar un RPC alternativo, siempre comprobado como devnet.
`;

type TokenAccountsResponse = {
  context?: { slot?: number };
  value: { pubkey: string; account: { owner: string; data: { parsed?: { type?: string; info?: { mint?: string; owner?: string; tokenAmount?: { amount?: string; decimals?: number } } } } } }[];
};

async function associatedTokenAddress(owner: string): Promise<string> {
  const encoder = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    seeds: [encoder.encode(address(owner)), encoder.encode(address(TOKEN_PROGRAM)), encoder.encode(address(DEVNET_USDC))],
  });
  return ata;
}

async function observedBalance(rpc: ReadonlySolanaRpc, owner: string) {
  const ata = await associatedTokenAddress(owner);
  const source = await rpc.call<TokenAccountsResponse>("getTokenAccountsByOwner", [owner, { mint: DEVNET_USDC }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  if (!source || !Array.isArray(source.value)) throw new Error("RPC no devolvió las cuentas USDC esperadas.");
  let total = 0n;
  let ataBalance = 0n;
  let ataExists = false;
  for (const account of source.value) {
    const info = account.account?.data?.parsed?.info;
    const raw = info?.tokenAmount?.amount;
    if (account.account?.owner !== TOKEN_PROGRAM || info?.mint !== DEVNET_USDC || info.owner !== owner || info.tokenAmount?.decimals !== 6 || typeof raw !== "string" || !/^(0|[1-9]\d*)$/.test(raw)) throw new Error("RPC devolvió una cuenta USDC con programa, propietario, mint, decimales o unidades inválidos.");
    total += BigInt(raw);
    if (account.pubkey === ata) { ataExists = true; ataBalance = BigInt(raw); }
  }
  return { owner, mint: DEVNET_USDC, decimals: 6, balanceRaw: total.toString(), associatedTokenAccount: ata, ataExists, ataBalanceRaw: ataBalance.toString(), contextSlot: source.context?.slot ?? null };
}

const safeJson = (value: unknown): string => JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry, 2);

async function priorAttemptBlocksPurchase(): Promise<boolean> {
  let prior: Record<string, unknown>;
  try {
    const decoded: unknown = JSON.parse(await readFile("output/devnet-purchase.json", "utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("invalid evidence");
    prior = decoded as Record<string, unknown>;
    if (prior.mode !== "devnet-real-x402" || prior.network !== DEVNET_NETWORK || typeof prior.status !== "string" || (typeof prior.transactionSubmitted !== "boolean" && prior.transactionSubmitted !== null)) throw new Error("invalid evidence");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    console.log(safeJson({ status: "already-attempted-needs-review", reason: "La evidencia previa no se pudo validar; se conserva sin sobrescribir y no se inicia otra compra.", evidencePath: "output/devnet-purchase.json" }));
    process.exitCode = 2;
    return true;
  }
  const metrics = prior.serverMetrics as { settlementAttempts?: unknown } | undefined;
  const attempts = metrics?.settlementAttempts;
  const statuses = new Set(["confirmed-devnet", "settlement-reported", "settlement-needs-reconciliation", "uncertain"]);
  if (statuses.has(prior.status as string) || prior.transactionSubmitted === true || prior.transactionSubmitted === null || (typeof attempts === "number" && attempts > 0) || (metrics !== undefined && (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0))) {
    const receipt = prior.receipt as { signature?: unknown } | undefined;
    console.log(safeJson({ status: "already-attempted-needs-review", priorStatus: prior.status,
      signature: typeof receipt?.signature === "string" ? receipt.signature : null,
      reason: "La ejecución previa requiere revisión; no se genera otra autorización ni se sobrescribe su evidencia.", evidencePath: "output/devnet-purchase.json" }));
    process.exitCode = 2;
    return true;
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  if (args.some(arg => arg !== "--prepare-wallets") || args.length > 1) throw new Error("Argumentos inválidos; usa --help.");
  if (args.length === 0 && await priorAttemptBlocksPurchase()) return;
  const wallets = await loadOrCreateDisposableWallets();
  const publicWallets = { buyerAddress: wallets.buyer.address, merchantAddress: wallets.merchant.address, cachePath: wallets.path, newlyCreated: wallets.newlyCreated };
  if (args[0] === "--prepare-wallets") {
    console.log(safeJson({ mode: "offline-disposable-devnet-wallets", network: DEVNET_NETWORK, ...publicWallets,
      circleFaucet: "https://faucet.circle.com/", solFaucet: "https://faucet.solana.com/", faucetNetwork: "Solana Devnet",
      instruction: "Solicita 20 USDC de prueba para cada dirección para crear/fondear sus ATAs.", transactionSubmitted: false, paymentSettled: false }));
    return;
  }
  const started = performance.now();
  const rpc = new ReadonlySolanaRpc(process.env.SOLANA_RPC_URL ?? DEVNET_RPC);
  const evidence: Record<string, unknown> = {
    checkedAt: new Date().toISOString(), mode: "devnet-real-x402", network: DEVNET_NETWORK, mint: DEVNET_USDC,
    amountRaw: REPORT_PRICE_UNITS.toString(), commitment: "confirmed", ...publicWallets,
    transactionSubmitted: false, paymentSettled: false, independentConfirmation: false,
  };
  let server: Awaited<ReturnType<typeof startPaidReportServer>> | undefined;
  try {
    await rpc.assertDevnet();
    evidence.genesisConfirmed = true;
    const mint = await rpc.call<{ value: { owner?: string; data?: { parsed?: { info?: { decimals?: number } } } } | null }>("getAccountInfo", [DEVNET_USDC, { encoding: "jsonParsed", commitment: "confirmed" }]);
    if (mint.value?.owner !== TOKEN_PROGRAM || mint.value.data?.parsed?.info?.decimals !== 6) throw new Error("No se confirmó el programa SPL Token y los seis decimales del mint USDC devnet.");
    evidence.mintDecimals = 6;
    const buyer = await observedBalance(rpc, wallets.buyer.address);
    const merchant = await observedBalance(rpc, wallets.merchant.address);
    evidence.observedBalances = { buyer, merchant };
    evidence.observedAt = new Date().toISOString();
    if (!buyer.ataExists || BigInt(buyer.ataBalanceRaw) < REPORT_PRICE_UNITS || !merchant.ataExists) {
      evidence.status = "blocked-funding";
      evidence.reason = "Falta USDC suficiente en la ATA del comprador o la ATA USDC del vendedor todavía no existe.";
      evidence.nextAction = "En https://faucet.circle.com/ elige Solana Devnet y solicita 20 USDC para cada dirección; luego ejecuta este comando una vez.";
      process.exitCode = 1;
      return;
    }
    const reportResource = {
      schemaVersion: "devnet-usdc-balance-observation/v1", observedAt: evidence.observedAt,
      network: DEVNET_NETWORK, commitment: "confirmed", mint: DEVNET_USDC,
      sourceMethod: "getTokenAccountsByOwner", buyer, merchant,
      coverage: "Dos observaciones de balance en confirmed; no reconstruye historial ni acredita finalización.",
    };
    const facilitator = new HTTPFacilitatorClient({ timeoutMs: 30_000 });
    evidence.facilitatorUrl = facilitator.url;
    server = await startPaidReportServer({ facilitator, payTo: wallets.merchant.address, mode: "devnet", makeReport: () => reportResource });
    const ledger = new BudgetLedger({ network: DEVNET_NETWORK, mint: DEVNET_USDC,
      projects: [{ id: "devnet-validation", limit: REPORT_PRICE_UNITS }],
      agents: [{ id: "disposable-buyer", projectId: "devnet-validation", limit: REPORT_PRICE_UNITS }],
      providers: [{ id: "local-paid-report", payTo: wallets.merchant.address, resources: [server.url] }],
    });
    const gateway = new BuyerGateway(ledger);
    const client = x402Client.fromConfig({
      schemes: [{ network: DEVNET_NETWORK, client: new ExactSvmScheme(wallets.buyer, { rpcUrl: rpc.url }) }],
      spendControls: { allowedAssets: [{ network: DEVNET_NETWORK, asset: DEVNET_USDC, maxAmountPerPayment: REPORT_PRICE_UNITS.toString() }], maxAmountPerPayment: "$0.01" },
    });
    const request = {
      idempotencyKey: `devnet-once-${randomUUID()}`, projectId: "devnet-validation", agentId: "disposable-buyer",
      providerId: "local-paid-report", network: DEVNET_NETWORK, mint: DEVNET_USDC,
      payTo: wallets.merchant.address, amount: REPORT_PRICE_UNITS, resource: server.url,
    };
    // Persist a conservative marker before signing/sending authorization. A process crash must not enable another purchase.
    evidence.status = "attempt-started";
    evidence.transactionSubmitted = null;
    evidence.paymentSettled = null;
    evidence.request = request;
    await mkdir("output", { recursive: true });
    await writeFile("output/devnet-purchase.json", `${safeJson(evidence)}\n`);
    const receipt = await gateway.purchase(request, x402PurchaseAdapter(client));
    evidence.receipt = receipt;
    evidence.ledger = ledger.snapshot();
    evidence.serverMetrics = server.metrics;
    evidence.status = receipt.status === "confirmed" ? "settlement-reported" : receipt.status;
    if (receipt.status === "uncertain") {
      evidence.transactionSubmitted = null;
      evidence.paymentSettled = null;
      process.exitCode = 2;
      return;
    }
    if (receipt.status !== "confirmed") {
      evidence.transactionSubmitted = false;
      evidence.paymentSettled = false;
      process.exitCode = 1;
      return;
    }
    evidence.transactionSubmitted = true;
    evidence.paymentSettled = null;
    await rpc.assertDevnet();
    const transaction = await rpc.call<unknown | null>("getTransaction", [receipt.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    evidence.settlementTransaction = transaction;
    const reconciliation = reconcileTransfers({ treasuryAddress: wallets.merchant.address, mint: DEVNET_USDC,
      requestedSignatures: [receipt.signature], transactions: [{ signature: receipt.signature, transaction }] });
    evidence.settlementReconciliation = reconciliation;
    const matchingIncoming = reconciliation.transfers.filter(transfer => transfer.direction === "incoming" && transfer.fromOwner === wallets.buyer.address && transfer.toOwner === wallets.merchant.address).reduce((sum, transfer) => sum + BigInt(transfer.amountRaw), 0n);
    if (!reconciliation.coverage.complete || reconciliation.totals.netRaw !== REPORT_PRICE_UNITS.toString() || matchingIncoming !== REPORT_PRICE_UNITS) {
      evidence.status = "settlement-needs-reconciliation";
      evidence.reason = "El recibo del facilitador no pudo confirmarse como una transferencia exitosa y exacta entre las dos wallets desechables; no repetir automáticamente.";
      process.exitCode = 2;
      return;
    }
    evidence.independentConfirmation = true;
    evidence.paymentSettled = true;
    evidence.status = "confirmed-devnet";
  } catch (error) {
    evidence.status = evidence.transactionSubmitted === true || evidence.transactionSubmitted === null ? "settlement-needs-reconciliation" : "blocked";
    evidence.reason = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (server) {
      evidence.serverMetrics = server.metrics;
      try { await server.close(); }
      catch (error) { evidence.serverCloseError = error instanceof Error ? error.message : "Error cerrando el servidor local."; }
    }
    evidence.rpc = rpc.telemetry;
    evidence.totalElapsedMs = performance.now() - started;
    evidence.telemetryScope = "rpc mide solo lecturas del adaptador; no incluye RPC interno del SDK ni llamadas del facilitador.";
    await mkdir("output", { recursive: true });
    await writeFile("output/devnet-purchase.json", `${safeJson(evidence)}\n`);
    console.log(safeJson(evidence));
  }
}

try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : "Error preparando la prueba devnet."); process.exitCode = 1; }

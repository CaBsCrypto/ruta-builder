import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { base58 } from "@scure/base";
import { DEVNET_NETWORK, DEVNET_RPC, DEVNET_USDC } from "../shared/config.ts";
import { ReadonlySolanaRpc } from "../shared/rpc.ts";
import { reconcileTransfers, toCsv } from "../reports/index.ts";
import type { RpcTransactionEnvelope } from "../reports/index.ts";

const HELP = `Reconcilia un lote conocido de transacciones USDC en Solana devnet.

Uso:
  npm run report:rpc -- --treasury <pubkey> --signature <firma> [--signature <firma> ...]
  npm run report:rpc -- --treasury <pubkey> --signatures <archivo.json>
  npm run report:rpc -- --help

--treasury    Dirección pública del propietario de la tesorería o de su cuenta de tokens.
--signature   Firma conocida de una transacción; se puede repetir este argumento.
--signatures  Archivo JSON con un array de entre 1 y 50 firmas conocidas.
--help        Muestra esta ayuda sin acceder a la red ni escribir archivos.

Usa una sola forma de entrada de firmas y un máximo de 50 firmas en total.
SOLANA_RPC_URL puede indicar otro RPC; getGenesisHash debe confirmar devnet.
Las lecturas usan confirmed, jsonParsed y maxSupportedTransactionVersion: 0.
No descubre el historial de una wallet, solicita airdrops ni envía transacciones.
Los importes usan exclusivamente el mint USDC oficial de devnet y seis decimales.

Escribe output/report-rpc.json (fuente RPC, conciliación, errores y telemetría)
y output/report-rpc.csv (transferencias; debe acompañarse del JSON).
La cobertura solo corresponde al lote solicitado y a confirmed, no a finalización.
Salida: 0 = lote completo; 1 = argumentos/red; 2 = cobertura incompleta.
`;

function validateBase58(value: string, expectedBytes: number, name: string): void {
  try {
    if (base58.decode(value).length !== expectedBytes) throw new Error("length");
  } catch {
    throw new Error(`${name} debe ser una cadena base58 de ${expectedBytes} bytes.`);
  }
}

async function parseArguments(argv: string[]): Promise<{ treasuryAddress: string; requestedSignatures: string[] }> {
  let treasuryAddress: string | undefined;
  let signaturesFile: string | undefined;
  const signatures: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!["--treasury", "--signature", "--signatures"].includes(flag)) throw new Error(`Argumento desconocido: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${flag}.`);
    if (flag === "--treasury") {
      if (treasuryAddress !== undefined) throw new Error("--treasury solo puede indicarse una vez.");
      treasuryAddress = value;
    } else if (flag === "--signatures") {
      if (signaturesFile !== undefined) throw new Error("--signatures solo puede indicarse una vez.");
      signaturesFile = value;
    } else signatures.push(value);
  }
  if (!treasuryAddress) throw new Error("Se requiere --treasury con una dirección pública.");
  validateBase58(treasuryAddress, 32, "--treasury");
  if (signaturesFile && signatures.length) throw new Error("Usa --signatures o --signature, sin combinar ambas formas.");
  if (signaturesFile) {
    const text = await readFile(resolve(signaturesFile), "utf8");
    if (text.length > 16_384) throw new Error("El archivo de firmas supera el límite de 16 KiB.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { throw new Error("El archivo de firmas debe contener JSON válido."); }
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== "string")) throw new Error("El archivo debe contener únicamente un array JSON de firmas.");
    signatures.push(...parsed);
  }
  if (signatures.length < 1 || signatures.length > 50) throw new Error("Indica entre 1 y 50 firmas conocidas.");
  for (const signature of signatures) validateBase58(signature, 64, "Cada firma");
  return { treasuryAddress, requestedSignatures: signatures };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const input = await parseArguments(argv);
  const start = performance.now();
  const rpc = new ReadonlySolanaRpc(process.env.SOLANA_RPC_URL ?? DEVNET_RPC);
  const transactions: RpcTransactionEnvelope[] = [];
  const fetchErrors: { signature: string; message: string }[] = [];
  let acquisitionError: string | null = null;
  let genesisConfirmed = false;
  try {
    await rpc.assertDevnet();
    genesisConfirmed = true;
  } catch (error) {
    acquisitionError = error instanceof Error ? error.message : String(error);
  }
  for (const signature of [...new Set(input.requestedSignatures)].sort()) {
    if (!genesisConfirmed) {
      transactions.push({ signature, transaction: null });
      continue;
    }
    try {
      const transaction = await rpc.call<unknown | null>("getTransaction", [signature, {
        commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0,
      }]);
      transactions.push({ signature, transaction });
      if (transaction === null) fetchErrors.push({ signature, message: "RPC devolvió null: transacción no disponible en confirmed." });
    } catch (error) {
      transactions.push({ signature, transaction: null });
      fetchErrors.push({ signature, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const source = { ...input, mint: DEVNET_USDC, decimals: 6 as const, transactions };
  const report = reconcileTransfers(source);
  const result = {
    checkedAt: new Date().toISOString(), mode: "devnet-readonly-known-signatures", network: DEVNET_NETWORK,
    commitment: "confirmed", genesisConfirmed, transactionSubmitted: false, paymentSettled: false,
    acquisitionError, fetchErrors, source, report,
    telemetry: { ...rpc.telemetry, totalElapsedMs: performance.now() - start },
  };
  await mkdir("output", { recursive: true });
  await writeFile("output/report-rpc.json", `${JSON.stringify(result, null, 2)}\n`);
  await writeFile("output/report-rpc.csv", toCsv(report));
  console.log(JSON.stringify({
    status: acquisitionError || fetchErrors.length ? "read-incomplete" : report.coverage.complete ? "reconciled" : "coverage-incomplete",
    network: DEVNET_NETWORK, coverage: report.coverage, totals: report.totals,
    acquisitionError, fetchErrors, telemetry: result.telemetry,
    output: [resolve("output/report-rpc.json"), resolve("output/report-rpc.csv")],
  }, null, 2));
  if (acquisitionError || fetchErrors.length) process.exitCode = 1;
  else if (!report.coverage.complete) process.exitCode = 2;
}

try { await main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Usa --help para ver los argumentos y límites.");
  process.exitCode = 1;
}

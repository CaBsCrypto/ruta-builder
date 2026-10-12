import { DEVNET_GENESIS, assertDevnetUrl } from './config.ts';

export type RpcTelemetry = { calls: number; elapsedMs: number; methods: Record<string, number> };

export class ReadonlySolanaRpc {
  readonly url: string;
  readonly telemetry: RpcTelemetry = { calls: 0, elapsedMs: 0, methods: {} };
  #nextId = 1;
  constructor(url: string) { assertDevnetUrl(url); this.url = url; }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    // This adapter deliberately exposes no transaction or faucet method.
    const allowed = ['getGenesisHash', 'getVersion', 'getSlot', 'getBalance', 'getAccountInfo', 'getTokenAccountsByOwner', 'getTransaction', 'getSignaturesForAddress'];
    if (!allowed.includes(method)) throw new Error(`Método no permitido en el adaptador de lectura: ${method}`);
    const start = performance.now();
    this.telemetry.calls++;
    this.telemetry.methods[method] = (this.telemetry.methods[method] ?? 0) + 1;
    try {
      const id = this.#nextId++;
      const response = await fetch(this.url, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const data = await response.json() as { id?: number; error?: { message?: string }; result?: T };
      if (data.error) throw new Error(`RPC rechazó ${method}: ${data.error.message ?? 'error sin mensaje'}`);
      if (data.id !== id || !('result' in data)) throw new Error('Respuesta RPC incompleta o identificador incorrecto.');
      return data.result as T;
    } finally { this.telemetry.elapsedMs += performance.now() - start; }
  }

  async assertDevnet(): Promise<void> {
    const genesis = await this.call<string>('getGenesisHash');
    if (genesis !== DEVNET_GENESIS) throw new Error(`Se esperaba devnet; la red respondió ${genesis}.`);
  }
}

export const DEVNET_NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
// CAIP-2 uses a shortened identifier; getGenesisHash returns the full hash.
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' as const;
export const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as const;
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const USDC_DECIMALS = 6;
export const REPORT_PRICE_UNITS = 10_000n;

export function formatUsdc(units: bigint | string): string {
  const amount = BigInt(units);
  const sign = amount < 0n ? '-' : '';
  const abs = amount < 0n ? -amount : amount;
  return `${sign}${abs / 1_000_000n}.${String(abs % 1_000_000n).padStart(6, '0')}`;
}

export function parseUnits(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error('El importe debe ser un entero positivo en unidades mínimas.');
  return BigInt(value);
}

export function assertDevnetUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
    throw new Error('El proveedor RPC debe usar HTTPS, excepto localhost.');
  }
}

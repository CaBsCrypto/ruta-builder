import { existsSync } from 'node:fs';
import { startCoachServer } from '../coach/app.ts';

if (process.argv.includes('--help')) {
  console.log('Ruta Builder: npm run build && npm run coach:demo\nModo conectado: COACH_PAY_TO + OPENAI_API_KEY, npm run coach:start. Solo Solana devnet. Nunca compra automáticamente.');
} else {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const demo = process.argv.includes('--demo');
  const server = await startCoachServer({ port: Number(process.env.COACH_PORT ?? 4311), mode: demo ? 'local-fixture' : 'devnet',
    dbPath: process.env.COACH_DB_PATH ?? (demo ? '.cache/coach-demo.sqlite' : '.cache/coach-devnet.sqlite'),
    apiKey: process.env.OPENAI_API_KEY, payTo: demo ? undefined : process.env.COACH_PAY_TO,
    publicOrigin: process.env.COACH_PUBLIC_ORIGIN });
  console.log(`Ruta Builder: ${server.url}\n${demo ? 'DEMO: IA y liquidación simuladas; no hay pago en cadena.' : 'Solana devnet; generación de IA previa a cualquier autorización de pago.'}`);
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await server.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

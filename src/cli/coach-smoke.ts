import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { startCoachServer } from '../coach/app.ts';
import { coachProjects } from '../../fixtures/coach/projects.ts';
import { BudgetLedger, BuyerGateway } from '../buyer/index.ts';
import { fixtureClient, FixtureFacilitator } from '../payments/fixture.ts';
import { x402PurchaseAdapter } from '../payments/client.ts';
import { DEVNET_NETWORK, DEVNET_USDC, REPORT_PRICE_UNITS } from '../shared/config.ts';

const directory = await mkdtemp(join(tmpdir(), 'ruta-smoke-'));
const facilitator = new FixtureFacilitator(), payTo = '11111111111111111111111111111111';
const server = await startCoachServer({ mode: 'local-fixture', dbPath: join(directory, 'coach.sqlite'), facilitator, payTo });
let cookie = '';
const privateFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers); headers.set('Cookie', cookie);
  const response = await fetch(input, { ...init, headers });
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  return response;
};
const request = (path: string, body?: unknown) => privateFetch(server.url + path, body ? {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
} : undefined);
async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let i = 0; i < 50; i++) { const value = await read(); if (ready(value)) return value; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('La demo no completó el trabajo esperado.');
}
try {
  const creation = await request('/diagnostics', { profile: coachProjects[0]!.profile, sourceMode: 'fixture', fixtureId: 'grantflow' });
  assert.equal(creation.status, 202); const diagnosticId = (await creation.json() as {id:string}).id;
  const free = await waitFor(async () => (await request(`/diagnostics/${diagnosticId}`)).json() as Promise<{state:string;opportunities:{id:string}[];evidence:unknown[]}>, value => value.state !== 'analyzing');
  const preparation = await request(`/diagnostics/${diagnosticId}/reports`, { opportunityId: free.opportunities[0]!.id });
  const reportId = (await preparation.json() as {id:string}).id;
  await waitFor(async () => (await request(`/diagnostics/${diagnosticId}`)).json() as Promise<{reports:{state:string}[]}>, value => value.reports[0]?.state === 'ready');
  const resource = `${server.url}/reports/${reportId}`;
  const ledger = new BudgetLedger({ network: DEVNET_NETWORK, mint: DEVNET_USDC, projects: [{ id: 'coach', limit: REPORT_PRICE_UNITS }],
    agents: [{ id: 'cli', projectId: 'coach', limit: REPORT_PRICE_UNITS }], providers: [{ id: 'coach', payTo, resources: [resource] }] });
  const gateway = new BuyerGateway(ledger), adapter = x402PurchaseAdapter(fixtureClient(), privateFetch);
  const intent = { idempotencyKey: 'coach-smoke', projectId: 'coach', agentId: 'cli', providerId: 'coach', network: DEVNET_NETWORK, mint: DEVNET_USDC, payTo, amount: REPORT_PRICE_UNITS, resource };
  const [paid, retry] = await Promise.all([gateway.purchase(intent, adapter), gateway.purchase(intent, adapter)]);
  assert.equal(paid.status, 'confirmed'); assert.equal(paid, retry); assert.equal(facilitator.settlements, 1);
  const download = await privateFetch(resource); assert.equal(download.status, 200);
  const packet = await download.json() as {report:{inputsHash:string;ai:{mode:string}}};
  const summary = { checkedAt: new Date().toISOString(), mode: 'local-fixture', realPaymentSettled: false, blockchainTransactionsSubmitted: 0,
    free: { state: free.state, evidenceCount: free.evidence.length, opportunityCount: free.opportunities.length },
    report: { inputsHash: packet.report.inputsHash, aiMode: packet.report.ai.mode },
    buyer: { status: paid.status, sameReceipt: paid === retry, simulatedSettlements: facilitator.settlements, downloadWithoutNewCharge: facilitator.settlements === 1 } };
  await mkdir('output', { recursive: true }); await writeFile('output/coach-smoke.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
  assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('ruta-smoke-'));
  await rm(directory, { recursive: true, force: true });
}

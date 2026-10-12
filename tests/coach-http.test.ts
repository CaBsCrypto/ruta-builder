import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { startCoachServer } from '../src/coach/app.ts';
import { coachProjects } from '../fixtures/coach/projects.ts';
import { FixtureFacilitator, fixtureClient } from '../src/payments/fixture.ts';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { emptyProfile } from '../src/coach/types.ts';

function browser(url: string, initialCookie = '') {
  let cookie = initialCookie;
  return { get cookie() { return cookie; }, async request(path: string, init: RequestInit = {}) {
    const response = await fetch(url + path, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init.headers } });
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return response;
  } };
}
async function removeOwnedTemp(directory: string) {
  assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
  assert.match(basename(directory), /^coach-(?:http|uncertain)-/);
  await rm(directory, { recursive: true, force: true });
}
async function prepared(b: ReturnType<typeof browser>, profile = coachProjects[0]!.profile) {
  const made = await b.request('/diagnostics', { method: 'POST', body: JSON.stringify({ profile, sourceMode: 'fixture', fixtureId: 'grantflow' }) });
  assert.equal(made.status, 202); const { id } = await made.json() as {id:string};
  let diagnostic: any;
  for (let i=0; i<40; i++) {
    diagnostic = await (await b.request(`/diagnostics/${id}`)).json();
    if (diagnostic.state !== 'analyzing') break;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(diagnostic.state, 'ready');
  const created = await b.request(`/diagnostics/${id}/reports`, { method: 'POST', body: JSON.stringify({ opportunityId: diagnostic.opportunities[0].id }) });
  assert.equal(created.status, 202); const reportId = (await created.json() as {id:string}).id;
  for (let i=0; i<40; i++) {
    diagnostic = await (await b.request(`/diagnostics/${id}`)).json();
    if (diagnostic.reports[0].state !== 'preparing') break;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(diagnostic.reports[0].state, 'ready');
  assert.equal('content' in diagnostic.reports[0], false);
  assert.equal('diagnosis' in diagnostic, false);
  return { id, reportId, diagnostic };
}
test('private free preview, immutable paid fixture, replay and restart recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coach-http-')), dbPath = join(dir, 'coach.sqlite');
  const facilitator = new FixtureFacilitator();
  let server = await startCoachServer({ mode: 'local-fixture', dbPath, facilitator });
  try {
    const b = browser(server.url), stranger = browser(server.url);
    const { id, reportId } = await prepared(b);
    assert.equal((await stranger.request(`/diagnostics/${id}`)).status, 404);
    assert.equal((await stranger.request(`/reports/${reportId}`)).status, 404);
    const quote = await b.request(`/reports/${reportId}`); assert.equal(quote.status, 402);
    const required = decodePaymentRequiredHeader(quote.headers.get('payment-required')!);
    const signature = encodePaymentSignatureHeader(await fixtureClient().createPaymentPayload(required));
    const buy = () => b.request(`/reports/${reportId}`, { headers: { 'PAYMENT-SIGNATURE': signature, 'Idempotency-Key': 'same-intent' } });
    const results = await Promise.all([buy(), buy()]); assert.deepEqual(results.map(r=>r.status), [200,200]);
    const packet = await results[0]!.json() as any;
    assert.equal(packet.report.ai.mode, 'fixture'); assert.equal(facilitator.settlements, 1);
    assert.equal((await b.request(`/reports/${reportId}`)).status, 200);
    const md = await b.request(`/reports/${reportId}?format=markdown`);
    const markdown = await md.text();
    assert.match(markdown, /# Plan and application/);
    assert.match(markdown, /^## Diagnostic$/m);
    const cookie = b.cookie; await server.close();
    server = await startCoachServer({ mode: 'local-fixture', dbPath, facilitator });
    const resumed = browser(server.url, cookie);
    const downloaded = await resumed.request(`/reports/${reportId}`);
    assert.equal(downloaded.status,200); assert.deepEqual((await downloaded.json() as any).report,packet.report);
    assert.equal(facilitator.settlements,1);
  } finally { await server.close(); await removeOwnedTemp(dir); }
});
test('uncertain settlement prevents another authorization and survives restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coach-uncertain-')), dbPath = join(dir,'db.sqlite');
  const facilitator = new FixtureFacilitator(); facilitator.throwAfterSettlement = true;
  let server = await startCoachServer({mode:'local-fixture',dbPath,facilitator});
  try {
    const b=browser(server.url), {reportId}=await prepared(b);
    const first=await b.request(`/api/demo-pay/${reportId}`,{method:'POST'});
    assert.equal(first.status,503); assert.equal((await first.json() as any).rejectedBeforeSettlement,undefined);
    const again=await b.request(`/api/demo-pay/${reportId}`,{method:'POST'}); assert.equal(again.status,503);
    const cookie=b.cookie; await server.close();
    server=await startCoachServer({mode:'local-fixture',dbPath,facilitator});
    assert.equal((await browser(server.url,cookie).request(`/reports/${reportId}`)).status,503);
    assert.equal(facilitator.settlements,1);
  } finally {await server.close();await removeOwnedTemp(dir);}
});
test('partial idea, unsupported ecosystem, invalid report and cross origin cannot charge', async()=>{
  const server=await startCoachServer({mode:'local-fixture',dbPath:':memory:',prepareContent:async()=>({content:{} as never,telemetry:{} as never})});
  try {
    const b=browser(server.url);
    assert.equal((await b.request('/diagnostics',{method:'POST',headers:{Origin:'https://other.invalid'},body:'{}'})).status,403);
    for (const websiteUrl of ['https://user:secret@example.com', 'https://example.com/?api_key=secret', 'https://127.0.0.1']) {
      const response = await b.request('/diagnostics',{method:'POST',body:JSON.stringify({profile:{...coachProjects[0]!.profile,websiteUrl}})});
      assert.equal(response.status,400);
    }
    assert.equal(server.store.diagnostics(server.store.session(b.cookie.split('=')[1]!)!).length,0);
    const profile={...coachProjects[0]!.profile,targetChain:'avalanche',websiteUrl:'',repositoryUrl:''};
    const creation=await b.request('/diagnostics',{method:'POST',body:JSON.stringify({profile})});
    const {id}=await creation.json() as any;
    const free=await (await b.request(`/diagnostics/${id}`)).json() as any;
    assert.equal(free.state,'partial'); assert.deepEqual(free.opportunities,[]);
    assert.equal((await b.request(`/diagnostics/${id}/reports`,{method:'POST',body:JSON.stringify({opportunityId:'invented'})})).status,422);
    const fixture=await b.request('/diagnostics',{method:'POST',body:JSON.stringify({profile:coachProjects[0]!.profile,sourceMode:'fixture',fixtureId:'grantflow'})});
    const fixtureId=(await fixture.json() as any).id;
    const d=await(await b.request(`/diagnostics/${fixtureId}`)).json() as any;
    const report=await b.request(`/diagnostics/${fixtureId}/reports`,{method:'POST',body:JSON.stringify({opportunityId:d.opportunities[0].id})});
    const reportId=(await report.json() as any).id;
    assert.equal((await b.request(`/reports/${reportId}`)).status,409);
    const check=await(await b.request(`/diagnostics/${fixtureId}`)).json() as any;
    assert.equal(check.reports[0].state,'failed'); assert.equal((server.facilitator as FixtureFacilitator).settlements,0);
  }finally{await server.close();}
});
test('a target programme is retained without inventing missing evidence, and can be cleared', async () => {
  const server = await startCoachServer({ mode: 'local-fixture', dbPath: ':memory:' });
  try {
    const b = browser(server.url);
    const catalog = await (await b.request('/api/opportunities')).json() as { opportunities: { id: string }[] };
    assert.ok(catalog.opportunities.some(item => item.id === 'encode-solana-2026'));
    assert.ok(!catalog.opportunities.some(item => item.id === 'agentic-engineering'));
    const profile = { ...emptyProfile(), projectName: 'Ruta Builder', description: 'Acompañante de proyectos y postulaciones',
      audience: 'Builders Solana', stage: 'prototype', currentChain: 'solana', publicBenefit: 'Orientación gratuita',
      solanaUse: 'x402 sobre devnet; compra real pendiente', milestones: 'Revisar, probar y documentar' };
    const created = await b.request('/diagnostics', { method: 'POST', body: JSON.stringify({ profile, preferredOpportunityId: 'encode-solana-2026' }) });
    assert.equal(created.status, 202); const { id } = await created.json() as { id: string };
    const free = await (await b.request(`/diagnostics/${id}`)).json() as any;
    assert.equal(free.state, 'partial'); assert.equal(free.preferredOpportunityId, 'encode-solana-2026');
    assert.equal(free.opportunities[0].id, 'encode-solana-2026'); assert.equal(free.opportunities[0].status, 'pending');
    assert.equal(free.profile.team, ''); assert.equal(free.profile.repositoryUrl, '');
    assert.ok(free.evidence.every((item: { provenance: string }) => item.provenance === 'declared'));
    const prepared = await b.request(`/diagnostics/${id}/reports`, { method: 'POST', body: JSON.stringify({ opportunityId: 'encode-solana-2026' }) });
    assert.equal(prepared.status, 202);
    const reportId = (await prepared.json() as { id: string }).id;
    const held = server.store.report(reportId)!;
    assert.equal(held.content?.selectedOpportunity.id, 'encode-solana-2026');
    assert.equal((await b.request(`/reports/${reportId}`)).status, 402);
    const cleared = await b.request(`/diagnostics/${id}`, { method: 'PATCH', body: JSON.stringify({ profile, preferredOpportunityId: '' }) });
    assert.equal(cleared.status, 202);
    const updated = await (await b.request(`/diagnostics/${id}`)).json() as any;
    assert.equal(updated.revision, 2); assert.equal(updated.preferredOpportunityId, undefined);
    assert.equal(server.store.report(reportId)!.content?.selectedOpportunity.id, 'encode-solana-2026');
  } finally { await server.close(); }
});

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { HTTPFacilitatorClient, x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { FixtureFacilitator, fixtureClient } from '../payments/fixture.ts';
import { DEVNET_NETWORK, DEVNET_USDC, REPORT_PRICE_UNITS } from '../shared/config.ts';
import { coachProjects } from '../../fixtures/coach/projects.ts';
import { PROFILE_FIELDS, emptyProfile, type CoachProfile, type CoachReport, type ReportRecord, type SourceInspection } from './types.ts';
import { CoachStore, canonicalHash, reportMarkdown, type StoredDiagnostic } from './store.ts';
import { inspectSources, validatePublicUrl } from './sources.ts';
import { CATALOG_VERSION, availableOpportunities, buildQuestions, declaredEvidence, evaluateOpportunities } from './catalog.ts';
import { DEFAULT_COACH_MODEL, prepareCoachContent, validateCoachContent } from './ai.ts';

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
export interface CoachServerOptions {
  port?: number; dbPath?: string; mode: 'local-fixture' | 'devnet'; aiMode?: 'fixture' | 'live';
  apiKey?: string; payTo?: string; facilitator?: FacilitatorClient; publicOrigin?: string;
  inspect?: typeof inspectSources; prepareContent?: typeof prepareCoachContent;
  webRoot?: string;
}

function profileFrom(value: unknown): CoachProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_profile');
  const input = value as Record<string, unknown>, profile = emptyProfile();
  for (const field of PROFILE_FIELDS) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'string' || input[field].length > 4_000) throw new Error('invalid_profile');
    profile[field] = input[field].trim();
  }
  if (Object.keys(input).some(field => !PROFILE_FIELDS.includes(field as typeof PROFILE_FIELDS[number]))) throw new Error('invalid_profile');
  if (!profile.projectName || !profile.description || !profile.audience || !profile.targetChain || !['idea', 'prototype', 'live'].includes(profile.stage)) throw new Error('profile_incomplete');
  profile.currentChain = profile.currentChain.toLowerCase(); profile.targetChain = profile.targetChain.toLowerCase();
  for (const field of ['websiteUrl', 'repositoryUrl'] as const) {
    if (profile[field]) profile[field] = validatePublicUrl(profile[field]).href;
  }
  return profile;
}
const errorName = (error: unknown) => error instanceof Error ? error.message : 'operation_failed';

/** Local/beta server. Public source text never executes; payments never generate content. */
export async function startCoachServer(options: CoachServerOptions) {
  const mode = options.mode, aiMode = options.aiMode ?? (mode === 'local-fixture' ? 'fixture' : 'live');
  if (mode === 'devnet' && aiMode === 'fixture') throw new Error('fixture_ai_requires_local_mode');
  const payTo = options.payTo ?? (mode === 'local-fixture' ? '11111111111111111111111111111111' : '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payTo)) throw new Error('COACH_PAY_TO_required');
  const store = new CoachStore(options.dbPath); store.recover();
  const facilitator = options.facilitator ?? (mode === 'local-fixture' ? new FixtureFacilitator() : new HTTPFacilitatorClient());
  const resourceServer = new x402ResourceServer(facilitator).register(DEVNET_NETWORK, new ExactSvmScheme());
  let requirements: PaymentRequirements[] = [], paymentInitialization: Promise<void> | undefined;
  // Fixture startup is offline. The real facilitator is contacted only when a prepared report is requested.
  async function paymentReady() {
    paymentInitialization ??= (async () => {
      await resourceServer.initialize();
      requirements = await resourceServer.buildPaymentRequirements({ scheme: 'exact', network: DEVNET_NETWORK, payTo,
        price: { asset: DEVNET_USDC, amount: REPORT_PRICE_UNITS.toString() }, maxTimeoutSeconds: 60 });
    })().catch(error => { paymentInitialization = undefined; throw error; });
    await paymentInitialization;
  }
  const app = express(); app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb', strict: true }));
  const jobs = new Set<Promise<void>>(), processing = new Map<string, Promise<Reply>>();
  const limits = new Map<string, { count: number; since: number }>();
  let origin = options.publicOrigin ?? '', shuttingDown = false;
  const launch = (job: () => Promise<void>) => {
    const promise = Promise.resolve().then(job).catch(() => {}).finally(() => jobs.delete(promise));
    jobs.add(promise);
  };
  const allowWork = (owner: string) => {
    if (jobs.size >= 8 || shuttingDown) return false;
    const entry = limits.get(owner);
    if (!entry || Date.now() - entry.since > 3_600_000) { limits.set(owner, { count: 1, since: Date.now() }); return true; }
    if (entry.count >= 20) return false;
    entry.count++; return true;
  };
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com; frame-ancestors 'none'" });
    const requestOrigin = req.get('Origin');
    if (requestOrigin && requestOrigin !== origin) { res.status(403).json({ error: 'origin_not_allowed' }); return; }
    const token = /(?:^|;\s*)coach_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.get('Cookie') ?? '')?.[1];
    let owner = token ? store.session(token) : null;
    if (!owner) {
      const session = store.createSession(); owner = session.id;
      res.setHeader('Set-Cookie', `coach_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${origin.startsWith('https:') ? '; Secure' : ''}`);
    }
    res.locals.owner = owner; next();
  });
  app.get('/api/health', (_req, res) => res.json({ mode, aiMode, model: DEFAULT_COACH_MODEL, aiConfigured: aiMode === 'fixture' || Boolean(options.apiKey),
    network: DEVNET_NETWORK, mint: DEVNET_USDC, price: '0.01', payTo }));
  app.get('/api/demo-projects', (_req, res) => res.json({ projects: mode === 'local-fixture' ? coachProjects.map(p => ({ id: p.id, name: p.title, title: p.title, summary: p.profile.description, profile: p.profile })) : [] }));
  app.get('/api/opportunities', (_req, res) => res.json({ opportunities: availableOpportunities().map(item => ({ id: item.id, title: item.title, ecosystem: item.ecosystem })) }));
  app.get('/api/diagnostics', (_req, res) => res.json({ diagnostics: store.diagnostics(res.locals.owner).map(d => ({ id: d.id, state: d.state, revision: d.revision, projectName: d.profile.projectName, updatedAt: d.updatedAt })) }));

  function analyze(item: StoredDiagnostic) {
    launch(async () => {
      try {
        let inspection: SourceInspection;
        if (item.sourceMode === 'fixture') inspection = structuredClone(coachProjects.find(p => p.id === item.fixtureId)!.inspection);
        else inspection = await (options.inspect ?? inspectSources)(item.profile);
        const evidence = [...inspection.evidence, ...declaredEvidence(item.profile)];
        const current = store.diagnostic(item.id);
        if (current?.revision !== item.revision) return;
        store.putDiagnostic({ ...item, inspection, evidence, matches: evaluateOpportunities(item.profile, evidence, { preferredOpportunityId: item.preferredOpportunityId }), questions: buildQuestions(item.profile),
          state: inspection.coverage.complete ? 'ready' : 'partial', updatedAt: new Date().toISOString() });
      } catch (error) {
        if (store.diagnostic(item.id)?.revision === item.revision) store.putDiagnostic({ ...item, state: 'failed', error: errorName(error), updatedAt: new Date().toISOString() });
      }
    });
  }
  const emptyInspection = (): SourceInspection => ({ documents: [], evidence: [], coverage: { complete: false, inspected: [], omitted: [], failures: [] }, metrics: { requests: 0, bytes: 0, elapsedMs: 0 } });
  function diagnosticInput(body: Record<string, unknown>, previous?: StoredDiagnostic) {
    const profile = profileFrom(body.profile);
    const sourceMode = body.sourceMode ?? previous?.sourceMode ?? 'public';
    const fixtureId = body.fixtureId ?? previous?.fixtureId;
    const preferred = body.preferredOpportunityId === undefined ? previous?.preferredOpportunityId : body.preferredOpportunityId;
    if (preferred !== undefined && (typeof preferred !== 'string' || preferred.length > 100 || preferred && !/^[a-z0-9][a-z0-9-]*$/.test(preferred))) throw new Error('invalid_opportunity_preference');
    if (sourceMode !== 'public' && sourceMode !== 'fixture') throw new Error('invalid_source_mode');
    if (sourceMode === 'fixture' && (mode !== 'local-fixture' || !coachProjects.some(p => p.id === fixtureId))) throw new Error('invalid_fixture');
    return { profile, sourceMode: sourceMode as 'public' | 'fixture', preferredOpportunityId: preferred || undefined, ...(sourceMode === 'fixture' ? { fixtureId: fixtureId as string } : {}) };
  }
  app.post('/diagnostics', (req, res) => {
    try {
      const input = diagnosticInput(req.body ?? {});
      if (!allowWork(res.locals.owner)) { res.status(429).json({ error: 'analysis_limit' }); return; }
      const now = new Date().toISOString();
      const item: StoredDiagnostic = { id: randomUUID(), ownerId: res.locals.owner, revision: 1, createdAt: now, updatedAt: now,
        state: 'analyzing', ...input, inspection: emptyInspection(), evidence: [], matches: [], questions: [], catalogVersion: CATALOG_VERSION };
      store.putDiagnostic(item); analyze(item); res.status(202).json({ id: item.id, state: item.state });
    } catch (error) { res.status(400).json({ error: errorName(error) }); }
  });
  app.patch('/diagnostics/:id', (req, res) => {
    const previous = store.diagnostic(req.params.id, res.locals.owner);
    if (!previous) { res.status(404).json({ error: 'not_found' }); return; }
    try {
      const input = diagnosticInput(req.body ?? {}, previous);
      if (!allowWork(res.locals.owner)) { res.status(429).json({ error: 'analysis_limit' }); return; }
      const item: StoredDiagnostic = { ...previous, ...input, revision: previous.revision + 1, state: 'analyzing',
        updatedAt: new Date().toISOString(), error: undefined, inspection: emptyInspection(), evidence: [], matches: [], questions: [] };
      store.putDiagnostic(item); analyze(item); res.status(202).json({ id: item.id, state: item.state });
    } catch (error) { res.status(400).json({ error: errorName(error) }); }
  });
  app.get('/diagnostics/:id', (req, res) => {
    const item = store.diagnostic(req.params.id, res.locals.owner);
    if (!item) { res.status(404).json({ error: 'not_found' }); return; }
    const matches = evaluateOpportunities(item.profile, item.evidence, { preferredOpportunityId: item.preferredOpportunityId });
    res.json({ id: item.id, revision: item.revision, state: item.state, profile: item.profile, sourceMode: item.sourceMode, fixtureId: item.fixtureId,
      evidence: item.evidence, coverage: item.inspection.coverage, questions: item.questions, metrics: item.inspection.metrics, error: item.error, preferredOpportunityId: item.preferredOpportunityId,
      opportunities: matches.map(match => ({ ...match.opportunity, status: match.status, criteria: match.criteria })),
      reports: store.reports(item.id, res.locals.owner).map(report => ({ id: report.id, revision: report.revision, state: report.state, paid: Boolean(store.access(res.locals.owner, report.id)), error: report.error, resource: `${origin}/reports/${report.id}` })) });
  });
  app.post('/diagnostics/:id/reports', (req, res) => {
    const item = store.diagnostic(req.params.id, res.locals.owner);
    if (!item) { res.status(404).json({ error: 'not_found' }); return; }
    if (item.state !== 'ready' && item.state !== 'partial') { res.status(409).json({ error: 'diagnostic_not_ready' }); return; }
    const matches = evaluateOpportunities(item.profile, item.evidence, { preferredOpportunityId: item.preferredOpportunityId });
    const selected = matches.find(match => match.opportunity.id === req.body?.opportunityId);
    if (!selected) { res.status(422).json({ error: item.profile.targetChain !== 'solana' ? 'ecosystem_not_supported' : 'opportunity_unavailable' }); return; }
    if (aiMode === 'live' && !options.apiKey) { res.status(503).json({ error: 'OPENAI_API_KEY_required' }); return; }
    const inputsHash = canonicalHash({ profile: item.profile, evidence: item.evidence, inspection: item.inspection, matches, catalogVersion: CATALOG_VERSION, locale: 'en', generationVersion: 2 });
    let report = store.findReport(item.id, item.revision, selected.opportunity.id, inputsHash);
    if (report && report.state !== 'failed') { res.status(202).json({ id: report.id, state: report.state, resource: `${origin}/reports/${report.id}` }); return; }
    if (jobs.size >= 8 || shuttingDown) { res.status(429).json({ error: 'preparation_limit' }); return; }
    report = { id: report?.id ?? randomUUID(), ownerId: item.ownerId, diagnosticId: item.id, revision: item.revision, state: 'preparing',
      createdAt: new Date().toISOString(), inputsHash, selectedOpportunityId: selected.opportunity.id, content: null };
    store.putReport(report); const snapshot = report;
    launch(async () => {
      try {
        const generated = await (options.prepareContent ?? prepareCoachContent)({ profile: item.profile, evidence: item.evidence, matches, selectedOpportunity: selected.opportunity },
          { mode: aiMode, locale: 'en', apiKey: options.apiKey, onCall: () => store.consumeAiCall(item.id, item.revision) });
        if (!validateCoachContent(generated.content, item.evidence)) throw new Error('invalid_report_content');
        const content: CoachReport = { schemaVersion: 'builder-coach-report/v1', id: snapshot.id, diagnosticId: item.id, revision: item.revision,
          createdAt: snapshot.createdAt, inputsHash, catalogVersion: CATALOG_VERSION, title: `Plan and application · ${item.profile.projectName}`,
          profile: item.profile, evidence: item.evidence, coverage: item.inspection.coverage, opportunities: matches,
          selectedOpportunity: selected.opportunity, content: generated.content, ai: generated.telemetry };
        JSON.parse(JSON.stringify(content));
        store.putReport({ ...snapshot, state: 'ready', content });
      } catch (error) { store.putReport({ ...snapshot, state: 'failed', error: errorName(error) }); }
    });
    res.status(202).json({ id: report.id, state: report.state, resource: `${origin}/reports/${report.id}` });
  });

  async function unpaid(report: ReportRecord, error = 'payment_required'): Promise<Reply> {
    await paymentReady();
    const required = await resourceServer.createPaymentRequiredResponse(requirements,
      { url: `${origin}/reports/${report.id}`, description: `Informe congelado ${report.inputsHash}`, mimeType: 'application/json' }, error === 'payment_required' ? undefined : error);
    return { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) }, body: { error, rejectedBeforeSettlement: true, mode } };
  }
  function paid(report: ReportRecord, receipt: unknown): Reply {
    return { status: 200, headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(receipt as SettleResponse) }, body: { mode, report: report.content } };
  }
  async function pay(report: ReportRecord, header: string | undefined, key: string | undefined): Promise<Reply> {
    const access = store.access(report.ownerId, report.id); if (access) return paid(report, access);
    const held = store.uncertain(report.ownerId, report.id);
    if (!header && held) return { status: 503, body: { error: 'settlement_uncertain', paymentId: held.id } };
    if (!header) return unpaid(report);
    if (header.length > 32_768) return { status: 400, body: { error: 'payment_header_too_large', rejectedBeforeSettlement: true } };
    await paymentReady();
    let payload: PaymentPayload;
    try { payload = decodePaymentSignatureHeader(header); } catch { return unpaid(report, 'invalid_payment_header'); }
    const requirement = payload.accepted ? resourceServer.findMatchingRequirements(requirements, payload) : undefined;
    const transaction = payload.payload?.transaction;
    if (payload.x402Version !== 2 || !requirement || payload.resource?.url !== `${origin}/reports/${report.id}` || typeof transaction !== 'string' || !transaction
      || (payload.accepted.extra?.paymentFlow !== undefined && payload.accepted.extra.paymentFlow !== 'authorization') || payload.accepted.extra?.assetTransferMethod !== undefined) return unpaid(report, 'quote_mismatch');
    if (!key?.trim() || key.length > 200) return { status: 400, body: { error: 'idempotency_key_required', rejectedBeforeSettlement: true } };
    let operation: ReturnType<CoachStore['beginPayment']>;
    try { operation = store.beginPayment(report.ownerId, report.id, key, canonicalHash(transaction), canonicalHash({ owner: report.ownerId, report: report.id, hash: report.inputsHash, requirement, transaction })); }
    catch (error) { return { status: 409, body: { error: errorName(error) } }; }
    if (!operation.created) {
      const running = processing.get(operation.operation.id); if (running) return running;
      if (operation.operation.state === 'confirmed' && operation.operation.receipt) return paid(report, operation.operation.receipt);
      if (operation.operation.state === 'rejected') return { status: 402, body: { error: operation.operation.error ?? 'payment_rejected', rejectedBeforeSettlement: true, paymentId: operation.operation.id } };
      return { status: 503, body: { error: 'settlement_uncertain', paymentId: operation.operation.id } };
    }
    const id = operation.operation.id;
    const work = Promise.resolve().then(async (): Promise<Reply> => {
      let valid = false;
      try {
        const verified = await resourceServer.verifyPayment(payload, requirement);
        valid = verified.isValid;
      } catch { store.setPaymentState(id, 'rejected', 'verification_unavailable'); return { status: 503, body: { error: 'verification_unavailable', rejectedBeforeSettlement: true, paymentId: id } }; }
      if (!valid) {
        store.setPaymentState(id, 'rejected', 'invalid_payment');
        return { status: 402, body: { error: 'invalid_payment', rejectedBeforeSettlement: true, paymentId: id } };
      }
      store.setPaymentState(id, 'settling');
      try {
        const receipt = await resourceServer.settlePayment(payload, requirement);
        if (!receipt.success || !receipt.transaction || receipt.network !== DEVNET_NETWORK || (receipt.amount !== undefined && receipt.amount !== requirement.amount)) throw new Error('invalid_settlement_response');
        store.confirmPayment(id, receipt); return paid(report, receipt);
      } catch { store.setPaymentState(id, 'uncertain', 'settlement_uncertain'); return { status: 503, body: { error: 'settlement_uncertain', paymentId: id } }; }
    });
    processing.set(id, work); try { return await work; } finally { processing.delete(id); }
  }
  function send(res: express.Response, reply: Reply) { if (reply.headers) res.set(reply.headers); res.status(reply.status).json(reply.body); }
  app.get('/reports/:id', async (req, res) => {
    const report = store.report(req.params.id, res.locals.owner);
    if (!report) { res.status(404).json({ error: 'not_found' }); return; }
    if (report.state !== 'ready' || !report.content) { res.status(409).json({ error: 'report_not_ready' }); return; }
    try {
      const reply = await pay(report, req.get('PAYMENT-SIGNATURE'), req.get('Idempotency-Key'));
      if (reply.status === 200 && req.query.format === 'markdown') {
        if (reply.headers) res.set(reply.headers); res.type('text/markdown').send(reportMarkdown(report.content)); return;
      }
      send(res, reply);
    } catch { res.status(503).json({ error: 'payment_service_unavailable' }); }
  });
  app.post('/api/demo-pay/:id', async (req, res) => {
    if (mode !== 'local-fixture') { res.status(404).json({ error: 'not_found' }); return; }
    const report = store.report(req.params.id, res.locals.owner);
    if (!report) { res.status(404).json({ error: 'not_found' }); return; }
    if (report.state !== 'ready') { res.status(409).json({ error: 'report_not_ready' }); return; }
    try {
      const access = store.access(report.ownerId, report.id); if (access) { send(res, paid(report, access)); return; }
      if (store.uncertain(report.ownerId, report.id)) { res.status(503).json({ error: 'settlement_uncertain' }); return; }
      const quote = await unpaid(report);
      const required = (await import('@x402/core/http')).decodePaymentRequiredHeader(quote.headers!['PAYMENT-REQUIRED']!);
      const payload = await fixtureClient().createPaymentPayload(required);
      const signature = (await import('@x402/core/http')).encodePaymentSignatureHeader(payload);
      send(res, await pay(report, signature, `demo:${report.id}`));
    } catch { res.status(503).json({ error: 'demo_payment_unavailable' }); }
  });
  app.get('/api/payments/:id', (req, res) => {
    const operation = store.payment(req.params.id);
    if (!operation || operation.ownerId !== res.locals.owner) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ id: operation.id, reportId: operation.reportId, state: operation.state, receipt: operation.receipt, error: operation.error });
  });
  const webRoot = options.webRoot ?? resolve('dist/web');
  if (existsSync(resolve(webRoot, 'index.html'))) {
    app.use(express.static(webRoot, { index: false }));
    app.get('/{*path}', (req, res) => req.path.startsWith('/api/') || req.path.startsWith('/diagnostics/') || req.path.startsWith('/reports/')
      ? res.status(404).json({ error: 'not_found' }) : res.sendFile(resolve(webRoot, 'index.html')));
  }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: errorName(error) === 'entity.too.large' ? 'request_too_large' : 'invalid_request' }));
  const server = await new Promise<Server>((accept, reject) => {
    const listening = app.listen(options.port ?? 0, '127.0.0.1', () => accept(listening)); listening.once('error', reject);
  });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('listen_failed');
  origin ||= `http://127.0.0.1:${address.port}`;
  return { url: `http://127.0.0.1:${address.port}`, store, facilitator,
    close: async () => { shuttingDown = true; server.closeIdleConnections(); await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())); await Promise.all([...jobs, ...processing.values()]); store.close(); } };
}

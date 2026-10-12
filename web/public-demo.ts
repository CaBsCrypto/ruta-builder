import seed from './demo-data.json' with { type: 'json' };
import { fixtureCoachContent, validateCoachContent } from '../src/coach/ai.ts';
import { emptyProfile, PROFILE_FIELDS, type CoachProfile, type CoachReport, type Evidence, type Opportunity, type OpportunityMatch, type ProfileField, type SourceInspection } from '../src/coach/types.ts';

/** An isolated, browser-only replay. It never calls fetch, a wallet, a model, or a facilitator. */
export const PUBLIC_DEMO_STORAGE_KEY = 'ruta:public-demo:v1';
export const PUBLIC_DEMO_CATALOG_AS_OF = '2026-10-11';
const MAX_PROJECTS = 20, MAX_REPORTS = 50, MAX_STORAGE_BYTES = 2 * 1024 * 1024;
const catalog = seed.catalog.opportunities as Opportunity[];
const projects = seed.projects as { id: string; title: string; profile: CoachProfile; inspection: Omit<SourceInspection, 'documents'> }[];
const labels: Partial<Record<ProfileField, string>> = { projectName: 'Project', description: 'Description', audience: 'Target users', stage: 'Stage', currentChain: 'Current network', targetChain: 'Target network', team: 'Team', license: 'License', users: 'Current users', country: 'Country', budgetUsd: 'Budget USD', milestones: 'Milestones', publicBenefit: 'Public benefit', solanaUse: 'Solana use' };
const questionLabels: Partial<Record<ProfileField, string>> = { team: 'Who is on the team and what does each person do?', license: 'Which license and public components will it have?', users: 'Which real users does it have? If none yet, say so.', budgetUsd: 'How much are you requesting in USD and how would you use the funds?', milestones: 'Which measurable milestones can you deliver?', publicBenefit: 'What public benefit does it offer other builders or users?', solanaUse: 'How does Solana help and which integration can you demonstrate?' };
type DemoDiagnostic = { id: string; revision: number; createdAt: string; updatedAt: string; state: 'ready' | 'partial'; profile: CoachProfile; sourceMode: 'public' | 'fixture'; fixtureId?: string; preferredOpportunityId?: string; evidence: Evidence[]; coverage: SourceInspection['coverage']; metrics: SourceInspection['metrics'] };
type DemoReport = { id: string; diagnosticId: string; revision: number; opportunityId: string; inputsHash: string; unlocked: boolean; content: CoachReport };
type DemoState = { version: 1; diagnostics: DemoDiagnostic[]; reports: DemoReport[] };
export interface PublicDemoOptions {
  /** Actual creation time; does not pretend the historical catalogue is current. */
  now?: () => Date;
  /** Used by offline tests. The published replay fixes the catalogue to 11 October 2026. */
  catalogNow?: () => Date;
  randomId?: () => string;
  origin?: string;
}
const blankState = (): DemoState => ({ version: 1, diagnostics: [], reports: [] });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

function cleanProfile(value: unknown): CoachProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_profile');
  const input = value as Record<string, unknown>, profile = emptyProfile();
  for (const field of PROFILE_FIELDS) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'string' || input[field].length > 4_000) throw new Error('invalid_profile');
    profile[field] = input[field].trim();
  }
  if (Object.keys(input).some(field => !PROFILE_FIELDS.includes(field as ProfileField))) throw new Error('invalid_profile');
  if (!profile.projectName || !profile.description || !profile.audience || !profile.targetChain || !['idea', 'prototype', 'live'].includes(profile.stage)) throw new Error('profile_incomplete');
  profile.currentChain = profile.currentChain.toLowerCase(); profile.targetChain = profile.targetChain.toLowerCase();
  for (const field of ['websiteUrl', 'repositoryUrl'] as const) {
    if (!profile[field]) continue;
    let url: URL;
    try { url = new URL(profile[field]); } catch { throw new Error('invalid_public_url'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('invalid_public_url');
    if ([...url.searchParams.keys()].some(key => /(?:token|secret|pass|api[_-]?key|authorization|credential)/i.test(key))) throw new Error('url_contains_credentials');
    // URLs are labels only. Parameters and fragments are never retained, read or requested.
    url.search = ''; url.hash = ''; profile[field] = url.href;
  }
  return profile;
}
function declared(profile: CoachProfile, at: string): Evidence[] {
  return Object.entries(labels).flatMap(([field, label]) => {
    const value = profile[field as ProfileField];
    return value ? [{ id: `declared:${field}`, category: 'profile' as const, provenance: 'declared' as const, claim: `${label} declared: ${value}`, excerpt: value, url: `builder://profile/${field}`, observedAt: at }] : [];
  });
}
function available(at: Date): Opportunity[] {
  return catalog.filter(item => item.ecosystem === 'solana' && item.status === 'active' && Date.parse(`${item.verifiedOn}T00:00:00Z`) <= at.getTime()
    && at.getTime() - Date.parse(`${item.verifiedOn}T00:00:00Z`) <= seed.catalog.freshnessDays * 86_400_000
    && (item.deadline === null || Date.parse(item.deadline) > at.getTime()));
}
function compare(profile: CoachProfile, evidence: Evidence[], preferred: string | undefined, at: Date): OpportunityMatch[] {
  if (profile.targetChain !== 'solana') return [];
  return available(at).map(opportunity => {
    const criteria = opportunity.criteria.map(criterion => {
      const value = profile[criterion.field];
      const refs = evidence.filter(item => item.id === `declared:${criterion.field}`).map(item => item.id);
      if (!value) return { id: criterion.id, label: criterion.label, status: 'missing' as const, reason: 'Missing information. The demo does not infer residence, team, users or budget.', evidenceIds: [] };
      if (criterion.allowed && !criterion.allowed.some(allowed => allowed.toLowerCase() === value.toLowerCase())) return { id: criterion.id, label: criterion.label, status: 'incompatible' as const, reason: `The declared information does not match the requirement (${criterion.allowed.join(', ')}).`, evidenceIds: refs };
      if (/functional|integration|demonstrable|demo|repository.*(?:submission|ready)|funcional|integraci[oó]n|demostrable|repositorio.*(?:entrega|preparado)/i.test(criterion.label)) return { id: criterion.id, label: criterion.label, status: 'missing' as const, reason: 'A declaration or installed SDK does not prove a working integration. Human review is required.', evidenceIds: refs };
      return { id: criterion.id, label: criterion.label, status: 'matched' as const, reason: 'Declaration compatible with the demo snapshot; the organizer confirms admission and eligibility.', evidenceIds: refs };
    });
    const status = criteria.some(item => item.status === 'incompatible') ? 'incompatible' : criteria.some(item => item.status === 'missing') ? 'pending' : 'possible';
    return { opportunity: clone(opportunity), status, criteria } as OpportunityMatch;
  }).filter(item => item.status !== 'incompatible').sort((a, b) => {
    const preferredRank = (match: OpportunityMatch) => match.opportunity.id === preferred ? -1 : 0;
    const publicOffering = Boolean(profile.publicBenefit) && /\b(?:MIT|Apache(?:-2\.0)?|GPL|BSD|MPL|c[oó]digo abierto|open source)\b/i.test(profile.license);
    const publicRank = (match: OpportunityMatch) => publicOffering && match.opportunity.id === 'solana-foundation-standard' ? -1 : 0;
    const missing = (match: OpportunityMatch) => match.criteria.filter(item => item.status === 'missing').length;
    return preferredRank(a) - preferredRank(b) || publicRank(a) - publicRank(b) || missing(a) - missing(b)
      || (a.opportunity.deadline ? Date.parse(a.opportunity.deadline) : Infinity) - (b.opportunity.deadline ? Date.parse(b.opportunity.deadline) : Infinity)
      || a.opportunity.id.localeCompare(b.opportunity.id);
  }).slice(0, 3);
}
async function fingerprint(value: unknown): Promise<string> {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sort(entry)])) : item;
  const bytes = new TextEncoder().encode(JSON.stringify(sort(value)));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Private to this browser's origin. Use as a transport explicitly; never replace global fetch. */
export function createPublicDemoApi(storage?: Storage, options: PublicDemoOptions = {}): (path: string, init?: RequestInit) => Promise<Response> {
  let persistence = storage;
  if (!persistence) { try { persistence = globalThis.localStorage; } catch { /* Report blocked persistence through the transport. */ } }
  const persistentStorage = persistence;
  const now = options.now ?? (() => new Date());
  const catalogNow = options.catalogNow ?? (() => new Date('2026-10-11T15:00:00.000Z'));
  const randomId = options.randomId ?? (() => globalThis.crypto.randomUUID());
  const origin = options.origin ?? (typeof location !== 'undefined' ? location.origin : 'https://ruta-builder.demo.invalid');
  const catalogVersion = `${seed.catalog.version}:public-demo-historical-snapshot:en-v2`;
  const response = (status: number, data: unknown) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Ruta-Demo': 'browser-local-no-payments' } });
  function load(): DemoState {
    let raw: string | null;
    try { if (!persistentStorage) throw new Error(); raw = persistentStorage.getItem(PUBLIC_DEMO_STORAGE_KEY); }
    catch { throw new Error('demo_storage_unavailable'); }
    if (!raw) return blankState();
    if (byteLength(raw) > MAX_STORAGE_BYTES) throw new Error('demo_storage_invalid');
    let value: DemoState;
    try { value = JSON.parse(raw) as DemoState; } catch { throw new Error('demo_storage_invalid'); }
    if (value?.version !== 1 || !Array.isArray(value.diagnostics) || !Array.isArray(value.reports) || value.diagnostics.length > MAX_PROJECTS || value.reports.length > MAX_REPORTS) throw new Error('demo_storage_invalid');
    return value;
  }
  function save(state: DemoState) {
    while (state.diagnostics.length > MAX_PROJECTS) {
      const removed = state.diagnostics.shift()!;
      state.reports = state.reports.filter(item => item.diagnosticId !== removed.id);
    }
    while (state.reports.length > MAX_REPORTS) state.reports.shift();
    const text = JSON.stringify(state);
    if (byteLength(text) > MAX_STORAGE_BYTES) throw new Error('demo_storage_full');
    try { if (!persistentStorage) throw new Error(); persistentStorage.setItem(PUBLIC_DEMO_STORAGE_KEY, text); } catch { throw new Error('demo_storage_unavailable'); }
  }
  function input(body: Record<string, unknown>, previous?: DemoDiagnostic) {
    const profile = cleanProfile(body.profile);
    const sourceMode = body.sourceMode ?? previous?.sourceMode ?? 'public';
    const fixtureId = body.fixtureId ?? previous?.fixtureId;
    const preferred = body.preferredOpportunityId === undefined ? previous?.preferredOpportunityId : body.preferredOpportunityId;
    if (sourceMode !== 'public' && sourceMode !== 'fixture') throw new Error('invalid_source_mode');
    if (sourceMode === 'fixture' && !projects.some(item => item.id === fixtureId)) throw new Error('invalid_fixture');
    if (preferred !== undefined && (typeof preferred !== 'string' || preferred.length > 100 || preferred && !/^[a-z0-9][a-z0-9-]*$/.test(preferred))) throw new Error('invalid_opportunity_preference');
    return { profile, sourceMode, ...(sourceMode === 'fixture' ? { fixtureId: fixtureId as string } : {}), ...(preferred ? { preferredOpportunityId: preferred as string } : {}) } as Pick<DemoDiagnostic, 'profile' | 'sourceMode' | 'fixtureId' | 'preferredOpportunityId'>;
  }
  function analyze(data: ReturnType<typeof input>, id: string, revision: number, createdAt: string): DemoDiagnostic {
    const fixture = data.sourceMode === 'fixture' ? projects.find(item => item.id === data.fixtureId)! : undefined;
    const at = now().toISOString();
    const coverage: SourceInspection['coverage'] = fixture ? clone(fixture.inspection.coverage) : { complete: false, inspected: [], omitted: [
      ...[data.profile.websiteUrl, data.profile.repositoryUrl].filter(Boolean).map(url => ({ url, reason: 'Public demo: URL supplied as a declaration; it is not inspected or requested over the network.' })),
      { url: 'builder://public-demo', reason: 'Historical public demo: no websites, repositories or external services are read. Only your declarations are used.' },
    ], failures: [] };
    return { ...data, id, revision, createdAt, updatedAt: at, state: coverage.complete ? 'ready' : 'partial',
      evidence: [...(fixture ? clone(fixture.inspection.evidence) : []), ...declared(data.profile, at)], coverage,
      metrics: { requests: 0, bytes: fixture?.inspection.metrics.bytes ?? 0, elapsedMs: 0 } };
  }
  let tail: Promise<void> = Promise.resolve();
  // Serialise local read/modify/write operations, including concurrent unlocks and prepares.
  const handle = async (path: string, init?: RequestInit): Promise<Response> => {
    try {
      if (!path.startsWith('/') || path.startsWith('//')) return response(400, { error: 'external_requests_disabled' });
      const url = new URL(path, origin), method = (init?.method ?? 'GET').toUpperCase();
      if (new Headers(init?.headers).has('PAYMENT-SIGNATURE')) return response(400, { error: 'real_payments_disabled' });
      if (!['GET', 'POST', 'PATCH'].includes(method)) return response(405, { error: 'method_not_allowed' });
      let body: Record<string, unknown> = {};
      if (init?.body !== undefined && init.body !== null) {
        if (typeof init.body !== 'string' || byteLength(init.body) > 64 * 1024) return response(413, { error: 'body_too_large' });
        let parsed: unknown;
        try { parsed = JSON.parse(init.body); } catch { return response(400, { error: 'invalid_body' }); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return response(400, { error: 'invalid_body' });
        body = parsed as Record<string, unknown>;
      }
      if (method === 'GET' && url.pathname === '/api/health') return response(200, { mode: 'public-demo', aiMode: 'fixture', model: 'deterministic-fixture', aiConfigured: false,
        payTo: '', network: '', mint: '', price: '0', simulated: true, catalogAsOf: PUBLIC_DEMO_CATALOG_AS_OF, historicalReplay: true, externalSourceReading: false, storage: persistentStorage ? 'this-browser-only' : 'unavailable' });
      if (method === 'GET' && url.pathname === '/api/demo-projects') return response(200, { projects: projects.map(item => ({ id: item.id, name: item.title, title: item.title, summary: item.profile.description, profile: item.profile })), simulated: true });
      if (method === 'GET' && url.pathname === '/api/opportunities') return response(200, { opportunities: available(catalogNow()).map(item => ({ id: item.id, title: item.title, ecosystem: item.ecosystem })), catalogAsOf: PUBLIC_DEMO_CATALOG_AS_OF, historicalReplay: true });
      const state = load();
      if (method === 'GET' && url.pathname === '/api/diagnostics') return response(200, { diagnostics: [...state.diagnostics].reverse().map(item => ({ id: item.id, state: item.state, revision: item.revision, projectName: item.profile.projectName, updatedAt: item.updatedAt })) });
      if (method === 'POST' && url.pathname === '/diagnostics') {
        const data = input(body), at = now().toISOString(), item = analyze(data, randomId(), 1, at);
        state.diagnostics.push(item); save(state); return response(202, { id: item.id, state: item.state });
      }
      const diagnosticRoute = /^\/diagnostics\/([A-Za-z0-9-]+)(\/reports)?$/.exec(url.pathname);
      if (diagnosticRoute) {
        const diagnostic = state.diagnostics.find(item => item.id === diagnosticRoute[1]);
        if (!diagnostic) return response(404, { error: 'not_found' });
        if (method === 'PATCH' && !diagnosticRoute[2]) {
          const item = analyze(input(body, diagnostic), diagnostic.id, diagnostic.revision + 1, diagnostic.createdAt);
          state.diagnostics[state.diagnostics.indexOf(diagnostic)] = item; save(state); return response(202, { id: item.id, state: item.state });
        }
        const matches = compare(diagnostic.profile, diagnostic.evidence, diagnostic.preferredOpportunityId, catalogNow());
        if (method === 'GET' && !diagnosticRoute[2]) return response(200, { ...diagnostic, catalogAsOf: PUBLIC_DEMO_CATALOG_AS_OF, historicalReplay: true,
          questions: Object.entries(questionLabels).filter(([field]) => !diagnostic.profile[field as ProfileField]).map(([field, question]) => ({ field, question })),
          opportunities: matches.map(match => ({ ...match.opportunity, status: match.status, criteria: match.criteria })),
          reports: state.reports.filter(item => item.diagnosticId === diagnostic.id).map(item => ({ id: item.id, revision: item.revision, state: 'ready', paid: item.unlocked, resource: `${origin}/reports/${item.id}` })) });
        if (method === 'POST' && diagnosticRoute[2]) {
          const selected = matches.find(match => match.opportunity.id === body.opportunityId);
          if (!selected) return response(422, { error: diagnostic.profile.targetChain !== 'solana' ? 'ecosystem_not_supported' : 'opportunity_unavailable' });
          const inputsHash = await fingerprint({ profile: diagnostic.profile, evidence: diagnostic.evidence, coverage: diagnostic.coverage, matches, catalogVersion });
          let report = state.reports.find(item => item.diagnosticId === diagnostic.id && item.revision === diagnostic.revision && item.opportunityId === selected.opportunity.id && item.inputsHash === inputsHash);
          if (!report) {
            const content = fixtureCoachContent({ profile: diagnostic.profile, evidence: diagnostic.evidence, matches, selectedOpportunity: selected.opportunity }, 'en');
            if (!validateCoachContent(content, diagnostic.evidence)) return response(422, { error: 'invalid_report_content' });
            const id = randomId(), full: CoachReport = { schemaVersion: 'builder-coach-report/v1', id, diagnosticId: diagnostic.id, revision: diagnostic.revision,
              createdAt: now().toISOString(), inputsHash, catalogVersion, title: `Plan and application · ${diagnostic.profile.projectName}`, profile: clone(diagnostic.profile), evidence: clone(diagnostic.evidence), coverage: clone(diagnostic.coverage), opportunities: clone(matches), selectedOpportunity: clone(selected.opportunity), content,
              ai: { mode: 'fixture', model: 'deterministic-fixture', calls: 0, inputTokens: 0, outputTokens: 0, elapsedMs: 0 } };
            report = { id, diagnosticId: diagnostic.id, revision: diagnostic.revision, opportunityId: selected.opportunity.id, inputsHash, unlocked: false, content: full };
            state.reports.push(report); save(state);
          }
          return response(202, { id: report.id, state: 'ready', resource: `${origin}/reports/${report.id}` });
        }
      }
      const reportRoute = /^\/(reports|api\/demo-pay)\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      if (reportRoute) {
        const report = state.reports.find(item => item.id === reportRoute[2]);
        if (!report) return response(404, { error: 'not_found' });
        if (method === 'POST' && reportRoute[1] === 'api/demo-pay') {
          if (!validateCoachContent(report.content.content, report.content.evidence)) return response(422, { error: 'invalid_report_content' });
          report.unlocked = true; save(state);
          return response(200, { mode: 'public-demo', status: 'confirmed', simulated: true, report: report.content });
        }
        if (method === 'GET' && reportRoute[1] === 'reports') return report.unlocked
          ? response(200, { mode: 'public-demo', simulated: true, report: report.content })
          : response(402, { error: 'public_demo_unlock_required', mode: 'public-demo', simulated: true, rejectedBeforeSettlement: true });
      }
      return response(404, { error: 'not_found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'public_demo_failed';
      const status = message.startsWith('demo_storage_') ? 507 : 400;
      return response(status, { error: message === 'Unexpected end of JSON input' || message.startsWith('Unexpected token') ? 'invalid_body' : message });
    }
  };
  return (path, init) => {
    const pending = tail.then(() => handle(path, init));
    tail = pending.then(() => {}, () => {});
    return pending;
  };
}

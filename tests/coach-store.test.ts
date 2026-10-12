import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { CoachStore, canonicalHash, type StoredDiagnostic } from '../src/coach/store.ts';
import type { CoachReport, ReportRecord } from '../src/coach/types.ts';
import { coachProjects } from '../fixtures/coach/projects.ts';
import { declaredEvidence, evaluateOpportunities, CATALOG_VERSION } from '../src/coach/catalog.ts';
import { fixtureCoachContent } from '../src/coach/ai.ts';

const now = new Date('2026-10-11T15:00:00Z');
function diagnostic(ownerId: string, id = 'diagnostic-one'): StoredDiagnostic {
  const fixture = coachProjects[0];
  const evidence = [...fixture.inspection.evidence, ...declaredEvidence(fixture.profile, now)];
  return { id, ownerId, revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), state: 'ready',
    profile: fixture.profile, inspection: fixture.inspection, evidence, matches: evaluateOpportunities(fixture.profile,evidence,{now}),
    questions: [], catalogVersion: CATALOG_VERSION, sourceMode: 'fixture', fixtureId: fixture.id };
}
function report(ownerId: string, id = 'report-one', state: ReportRecord['state'] = 'ready'): ReportRecord {
  const source = diagnostic(ownerId);
  const selectedOpportunity = source.matches[0].opportunity;
  const content: CoachReport = { schemaVersion: 'builder-coach-report/v1', id, diagnosticId: source.id, revision: 1,
    createdAt: now.toISOString(), inputsHash: 'input-hash', catalogVersion: CATALOG_VERSION, title: 'Fixture report',
    profile: source.profile, evidence: source.evidence, coverage: source.inspection.coverage, opportunities: source.matches, selectedOpportunity,
    content: fixtureCoachContent({profile:source.profile,evidence:source.evidence,matches:source.matches,selectedOpportunity}),
    ai: { mode:'fixture',model:'deterministic-fixture',calls:0,inputTokens:0,outputTokens:0,elapsedMs:0 } };
  return { id,ownerId,diagnosticId:source.id,revision:1,state,createdAt:now.toISOString(),inputsHash:'input-hash',
    selectedOpportunityId:selectedOpportunity.id,content:state === 'ready' ? content : null };
}
function durablePath(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(),'coach-store-'));
  t.after(() => {
    // Verify the exact mkdtemp target stays inside the OS temporary directory before recursive cleanup.
    assert.equal(resolve(dirname(root)),resolve(tmpdir()));
    assert.ok(basename(root).startsWith('coach-store-'));
    rmSync(root,{recursive:true,force:true});
  });
  return join(root,'coach.sqlite');
}

test('sessions persist across connections, expire and isolate diagnostic ownership', t => {
  const path = durablePath(t); let store = new CoachStore(path);
  try {
    const owner = store.createSession(), other = store.createSession();
    assert.equal(store.session(owner.token),owner.id);
    assert.equal(store.session('not-a-token'),null);
    store.putDiagnostic(diagnostic(owner.id));
    assert.ok(store.diagnostic('diagnostic-one',owner.id));
    assert.equal(store.diagnostic('diagnostic-one',other.id),null);
    assert.equal(store.diagnostics(other.id).length,0);
    assert.throws(()=>store.putDiagnostic(diagnostic(other.id)),/diagnostic_owner_conflict/);
    store.close(); store = new CoachStore(path);
    assert.equal(store.session(owner.token),owner.id);
    assert.equal(store.diagnostics(owner.id).length,1);
    store.db.prepare('UPDATE sessions SET expires_at=0 WHERE id=?').run(owner.id);
    assert.equal(store.session(owner.token),null);
  } finally { store.close(); }
});

test('AI reservation is capped at three per revision and survives restart', async t => {
  const path = durablePath(t); let store = new CoachStore(path);
  try {
    const results = await Promise.allSettled(Array.from({length:12},()=>Promise.resolve().then(()=>store.consumeAiCall('diagnostic',1))));
    assert.equal(results.filter(item=>item.status==='fulfilled').length,3);
    assert.equal(results.filter(item=>item.status==='rejected').length,9);
    assert.equal(store.aiCallCount('diagnostic',1),3);
    store.close(); store = new CoachStore(path);
    assert.throws(()=>store.consumeAiCall('diagnostic',1),/ai_call_limit/);
    store.consumeAiCall('diagnostic',2);
    assert.equal(store.aiCallCount('diagnostic',2),1);
    assert.equal(store.aiCallCount('diagnostic',1),3);
  } finally { store.close(); }
});

test('ready reports are immutable and report identity cannot change while preparing', () => {
  const store = new CoachStore(':memory:');
  try {
    const owner = store.createSession(), other = store.createSession();
    const pending = report(owner.id,'report-one','preparing');
    store.putReport(pending);
    for (const change of [{ownerId:other.id},{diagnosticId:'different'},{revision:2},{inputsHash:'different'},{selectedOpportunityId:'different'}]) {
      assert.throws(()=>store.putReport({...pending,...change}),/report_binding_conflict/);
    }
    const ready = report(owner.id);
    store.putReport(ready); store.putReport(ready);
    assert.throws(()=>store.putReport({...ready,error:'altered'}),/immutable_report/);
    assert.throws(()=>store.putReport({...ready,state:'failed',content:null}),/immutable_report/);
    assert.equal(store.report(ready.id,other.id),null);
    assert.equal(store.reports(ready.diagnosticId,other.id).length,0);
    assert.equal(store.findReport(ready.diagnosticId,1,ready.selectedOpportunityId,ready.inputsHash)?.id,ready.id);
    assert.throws(()=>store.putReport({...ready,id:'second-id'}),/UNIQUE constraint failed/);
  } finally { store.close(); }
});

test('simultaneous retries reuse one operation and authorization aliases remain bound', async () => {
  const store = new CoachStore(':memory:');
  try {
    const results = await Promise.all(Array.from({length:20},()=>Promise.resolve().then(()=>store.beginPayment('owner','report','key','authorization','binding'))));
    assert.equal(results.filter(item=>item.created).length,1);
    assert.equal(new Set(results.map(item=>item.operation.id)).size,1);
    const alias = store.beginPayment('owner','report','new-key','authorization','binding');
    assert.equal(alias.created,false);
    assert.equal(alias.operation.id,results[0].operation.id);
    assert.throws(()=>store.beginPayment('owner','report','key','different-authorization','binding'),/idempotency_conflict/);
    assert.throws(()=>store.beginPayment('owner','report','new-key','different-authorization','binding'),/idempotency_conflict/);
    assert.throws(()=>store.beginPayment('owner','report','key','authorization','different-binding'),/idempotency_conflict/);
  } finally { store.close(); }
});

test('authorization hash uniqueness crosses owners, caller keys and reports', () => {
  const store = new CoachStore(':memory:');
  try {
    store.beginPayment('owner-one','report-one','key-one','globally-unique','binding-one');
    assert.throws(()=>store.beginPayment('owner-two','report-one','key-two','globally-unique','binding-one'),/idempotency_conflict/);
    assert.throws(()=>store.beginPayment('owner-one','report-two','key-three','globally-unique','binding-one'),/idempotency_conflict/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM payments').get()?.count,1);
  } finally { store.close(); }
});

test('a second authorization is blocked during verification, settlement and uncertainty', () => {
  const store = new CoachStore(':memory:');
  try {
    const first = store.beginPayment('owner','report','key-a','auth-a','binding');
    assert.equal(store.uncertain('owner','report')?.state,'verifying');
    assert.throws(()=>store.beginPayment('owner','report','key-b','auth-b','binding'),/settlement_uncertain/);
    store.setPaymentState(first.operation.id,'settling');
    assert.throws(()=>store.beginPayment('owner','report','key-b','auth-b','binding'),/settlement_uncertain/);
    store.setPaymentState(first.operation.id,'uncertain','transport_timeout');
    assert.throws(()=>store.beginPayment('owner','report','key-b','auth-b','binding'),/settlement_uncertain/);
    assert.throws(()=>store.setPaymentState(first.operation.id,'rejected'),/invalid_payment_transition/);
  } finally { store.close(); }
});

test('definitive rejection before settlement permits a new authorization but retains retry outcome', () => {
  const store = new CoachStore(':memory:');
  try {
    const first = store.beginPayment('owner','report','key-a','auth-a','binding');
    store.setPaymentState(first.operation.id,'rejected','verification_failed');
    const retry = store.beginPayment('owner','report','key-a','auth-a','binding');
    assert.equal(retry.created,false); assert.equal(retry.operation.state,'rejected');
    const replacement = store.beginPayment('owner','report','key-b','auth-b','binding');
    assert.equal(replacement.created,true);
    assert.notEqual(replacement.operation.id,first.operation.id);
  } finally { store.close(); }
});

test('confirming settlement atomically stores receipt and access, and prevents a second charge', t => {
  const path = durablePath(t); let store = new CoachStore(path);
  try {
    const operation = store.beginPayment('owner','report','key','authorization','binding').operation;
    assert.throws(()=>store.confirmPayment(operation.id,{success:true}),/invalid_settlement_transition/);
    assert.equal(store.access('owner','report'),null);
    store.setPaymentState(operation.id,'settling');
    assert.throws(()=>store.confirmPayment(operation.id,null),/invalid_receipt/);
    assert.equal(store.payment(operation.id)?.state,'settling');
    const receipt = {success:true,transaction:'FIXTURE-ONLY',network:'devnet'};
    store.confirmPayment(operation.id,receipt);
    assert.deepEqual(store.access('owner','report'),receipt);
    assert.equal(store.access('other-owner','report'),null);
    assert.equal(store.payment(operation.id)?.state,'confirmed');
    assert.throws(()=>store.setPaymentState(operation.id,'rejected'),/invalid_payment_transition/);
    store.close(); store = new CoachStore(path); store.recover();
    assert.deepEqual(store.access('owner','report'),receipt);
    assert.deepEqual(store.payment(operation.id)?.receipt,receipt);
    assert.equal(store.beginPayment('owner','report','key','authorization','binding').created,false);
    assert.throws(()=>store.beginPayment('owner','report','second-key','second-authorization','binding'),/report_already_paid/);
  } finally { store.close(); }
});

test('restart rejects verification, holds settlement, and fails interrupted preparation safely', t => {
  const path = durablePath(t); let store = new CoachStore(path);
  try {
    const verifying = store.beginPayment('owner','report-verifying','key-v','auth-v','binding-v').operation;
    const settling = store.beginPayment('owner','report-settling','key-s','auth-s','binding-s').operation;
    store.setPaymentState(settling.id,'settling');
    store.putDiagnostic({...diagnostic('owner'),state:'analyzing'});
    store.putReport(report('owner','preparing-report','preparing'));
    store.close(); store = new CoachStore(path); store.recover();
    assert.equal(store.payment(verifying.id)?.state,'rejected');
    assert.equal(store.payment(verifying.id)?.error,'restart_before_settlement');
    assert.equal(store.payment(settling.id)?.state,'uncertain');
    assert.equal(store.payment(settling.id)?.error,'restart_during_settlement');
    assert.equal(store.diagnostic('diagnostic-one')?.state,'failed');
    assert.equal(store.report('preparing-report')?.state,'failed');
    assert.throws(()=>store.beginPayment('owner','report-settling','new-key','new-auth','binding-s'),/settlement_uncertain/);
    assert.equal(store.beginPayment('owner','report-verifying','new-key-v','new-auth-v','binding-v').created,true);
    store.recover();
    assert.equal(store.payment(settling.id)?.state,'uncertain');
  } finally { store.close(); }
});

test('canonical hashes normalize object insertion order while retaining content and array order', () => {
  assert.equal(canonicalHash({b:2,a:{y:2,x:1}}),canonicalHash({a:{x:1,y:2},b:2}));
  assert.notEqual(canonicalHash([1,2]),canonicalHash([2,1]));
  assert.notEqual(canonicalHash({version:1}),canonicalHash({version:2}));
});

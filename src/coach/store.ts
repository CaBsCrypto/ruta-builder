import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Diagnostic, ReportRecord, CoachReport } from './types.ts';

export type StoredDiagnostic = Diagnostic & { sourceMode: 'public' | 'fixture'; fixtureId?: string };
export type PaymentState = 'verifying' | 'settling' | 'confirmed' | 'rejected' | 'uncertain';
export interface PaymentOperation {
  id: string; ownerId: string; reportId: string; authorizationHash: string; binding: string;
  state: PaymentState; receipt: unknown | null; error: string | null;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const decode = <T>(row: unknown): T | null => row ? JSON.parse((row as { data: string }).data) as T : null;

/** One SQLite connection, durable ownership, immutable reports and settlement markers. */
export class CoachStore {
  readonly db: DatabaseSync;
  constructor(path = '.cache/coach.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS diagnostics (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, diagnostic_id TEXT NOT NULL,
        revision INTEGER NOT NULL, selected_opportunity TEXT NOT NULL, inputs_hash TEXT NOT NULL, data TEXT NOT NULL,
        UNIQUE(diagnostic_id, revision, selected_opportunity, inputs_hash));
      CREATE TABLE IF NOT EXISTS ai_calls (diagnostic_id TEXT NOT NULL, revision INTEGER NOT NULL, calls INTEGER NOT NULL,
        PRIMARY KEY(diagnostic_id, revision));
      CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, report_id TEXT NOT NULL,
        authorization_hash TEXT UNIQUE NOT NULL, binding TEXT NOT NULL, state TEXT NOT NULL,
        receipt TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS payment_keys (owner_id TEXT NOT NULL, key TEXT NOT NULL, payment_id TEXT NOT NULL,
        PRIMARY KEY(owner_id,key), FOREIGN KEY(payment_id) REFERENCES payments(id));
      CREATE TABLE IF NOT EXISTS report_access (owner_id TEXT NOT NULL, report_id TEXT NOT NULL, receipt TEXT NOT NULL,
        PRIMARY KEY(owner_id,report_id));
    `);
  }
  createSession() {
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(id, hash(token), Date.now() + 30 * 86_400_000);
    return { id, token };
  }
  session(token: string): string | null {
    const row = this.db.prepare('SELECT id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now()) as { id: string } | undefined;
    return row?.id ?? null;
  }
  putDiagnostic(diagnostic: StoredDiagnostic) {
    const existing = this.diagnostic(diagnostic.id);
    if (existing && existing.ownerId !== diagnostic.ownerId) throw new Error('diagnostic_owner_conflict');
    this.db.prepare('INSERT INTO diagnostics VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(diagnostic.id, diagnostic.ownerId, JSON.stringify(diagnostic));
  }
  diagnostic(id: string, ownerId?: string): StoredDiagnostic | null {
    return decode<StoredDiagnostic>(ownerId
      ? this.db.prepare('SELECT data FROM diagnostics WHERE id=? AND owner_id=?').get(id, ownerId)
      : this.db.prepare('SELECT data FROM diagnostics WHERE id=?').get(id));
  }
  diagnostics(ownerId: string): StoredDiagnostic[] {
    return (this.db.prepare('SELECT data FROM diagnostics WHERE owner_id=? ORDER BY rowid DESC LIMIT 50').all(ownerId) as {data:string}[]).map(row => JSON.parse(row.data) as StoredDiagnostic);
  }
  putReport(report: ReportRecord) {
    const existing = this.report(report.id);
    if (existing && (existing.ownerId !== report.ownerId || existing.diagnosticId !== report.diagnosticId
      || existing.revision !== report.revision || existing.selectedOpportunityId !== report.selectedOpportunityId
      || existing.inputsHash !== report.inputsHash)) throw new Error('report_binding_conflict');
    if (existing?.state === 'ready' && JSON.stringify(existing) !== JSON.stringify(report)) throw new Error('immutable_report');
    this.db.prepare(`INSERT INTO reports VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(report.id, report.ownerId, report.diagnosticId, report.revision, report.selectedOpportunityId, report.inputsHash, JSON.stringify(report));
  }
  report(id: string, ownerId?: string): ReportRecord | null {
    return decode<ReportRecord>(ownerId
      ? this.db.prepare('SELECT data FROM reports WHERE id=? AND owner_id=?').get(id,ownerId)
      : this.db.prepare('SELECT data FROM reports WHERE id=?').get(id));
  }
  findReport(diagnosticId: string, revision: number, selected: string, inputsHash: string): ReportRecord | null {
    return decode<ReportRecord>(this.db.prepare('SELECT data FROM reports WHERE diagnostic_id=? AND revision=? AND selected_opportunity=? AND inputs_hash=?').get(diagnosticId, revision, selected, inputsHash));
  }
  reports(diagnosticId: string, ownerId: string): ReportRecord[] {
    return (this.db.prepare('SELECT data FROM reports WHERE diagnostic_id=? AND owner_id=? ORDER BY rowid DESC').all(diagnosticId,ownerId) as {data:string}[]).map(row => JSON.parse(row.data) as ReportRecord);
  }
  consumeAiCall(diagnosticId: string, revision: number) {
    this.transaction(() => {
      const row = this.db.prepare('SELECT calls FROM ai_calls WHERE diagnostic_id=? AND revision=?').get(diagnosticId,revision) as {calls:number} | undefined;
      if ((row?.calls ?? 0) >= 3) throw new Error('ai_call_limit');
      this.db.prepare('INSERT INTO ai_calls VALUES (?,?,1) ON CONFLICT(diagnostic_id,revision) DO UPDATE SET calls=calls+1').run(diagnosticId,revision);
    });
  }
  aiCallCount(diagnosticId: string, revision: number) {
    return (this.db.prepare('SELECT calls FROM ai_calls WHERE diagnostic_id=? AND revision=?').get(diagnosticId,revision) as {calls:number}|undefined)?.calls ?? 0;
  }
  access(ownerId: string, reportId: string): unknown | null {
    const row = this.db.prepare('SELECT receipt FROM report_access WHERE owner_id=? AND report_id=?').get(ownerId,reportId) as {receipt:string}|undefined;
    return row ? JSON.parse(row.receipt) : null;
  }
  payment(id: string): PaymentOperation | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE id=?').get(id) as Record<string,string> | undefined;
    return row ? { id:row.id!, ownerId:row.owner_id!, reportId:row.report_id!, authorizationHash:row.authorization_hash!, binding:row.binding!, state:row.state as PaymentState, receipt:row.receipt ? JSON.parse(row.receipt) : null, error:row.error ?? null } : null;
  }
  uncertain(ownerId: string, reportId: string): PaymentOperation | null {
    const row = this.db.prepare("SELECT id FROM payments WHERE owner_id=? AND report_id=? AND state IN ('uncertain','settling','verifying') LIMIT 1").get(ownerId,reportId) as {id:string}|undefined;
    return row ? this.payment(row.id) : null;
  }
  /** Atomically bind a caller key AND globally unique authorization to one report. */
  beginPayment(ownerId: string, reportId: string, key: string, authorizationHash: string, binding: string): { operation: PaymentOperation; created: boolean } {
    return this.transaction(() => {
      const keyRow = this.db.prepare('SELECT payment_id FROM payment_keys WHERE owner_id=? AND key=?').get(ownerId,key) as {payment_id:string}|undefined;
      const authorization = this.db.prepare('SELECT id FROM payments WHERE authorization_hash=?').get(authorizationHash) as {id:string}|undefined;
      const existing = keyRow ? this.payment(keyRow.payment_id)! : authorization ? this.payment(authorization.id)! : null;
      if (existing) {
        if (existing.binding !== binding || existing.ownerId !== ownerId || existing.reportId !== reportId
          || existing.authorizationHash !== authorizationHash) throw new Error('idempotency_conflict');
        this.db.prepare('INSERT OR IGNORE INTO payment_keys VALUES (?,?,?)').run(ownerId,key,existing.id);
        return { operation:existing, created:false };
      }
      if (this.access(ownerId,reportId) !== null) throw new Error('report_already_paid');
      if (this.uncertain(ownerId,reportId)) throw new Error('settlement_uncertain');
      const operation:PaymentOperation = {id:randomUUID(),ownerId,reportId,authorizationHash,binding,state:'verifying',receipt:null,error:null};
      this.db.prepare('INSERT INTO payments VALUES (?,?,?,?,?,?,NULL,NULL)').run(operation.id,ownerId,reportId,authorizationHash,binding,operation.state);
      this.db.prepare('INSERT INTO payment_keys VALUES (?,?,?)').run(ownerId,key,operation.id);
      return { operation, created:true };
    });
  }
  setPaymentState(id: string, state: PaymentState, error: string | null = null) {
    this.transaction(() => {
      const operation = this.payment(id);
      if (!operation) throw new Error('payment_not_found');
      const allowed = operation.state === 'verifying' ? ['settling','rejected'] : operation.state === 'settling' ? ['uncertain'] : [];
      if (!allowed.includes(state)) throw new Error('invalid_payment_transition');
      this.db.prepare('UPDATE payments SET state=?,error=? WHERE id=?').run(state,error,id);
    });
  }
  confirmPayment(id: string, receipt: unknown) {
    this.transaction(() => {
      const operation = this.payment(id);
      if (!operation || operation.state !== 'settling') throw new Error('invalid_settlement_transition');
      if (receipt === null || receipt === undefined) throw new Error('invalid_receipt');
      const encoded = JSON.stringify(receipt);
      this.db.prepare("UPDATE payments SET state='confirmed',receipt=?,error=NULL WHERE id=?").run(encoded,id);
      this.db.prepare('INSERT OR REPLACE INTO report_access VALUES (?,?,?)').run(operation.ownerId,operation.reportId,encoded);
    });
  }
  recover() {
    this.db.prepare("UPDATE payments SET state='uncertain',error='restart_during_settlement' WHERE state='settling'").run();
    this.db.prepare("UPDATE payments SET state='rejected',error='restart_before_settlement' WHERE state='verifying'").run();
    for (const row of this.db.prepare('SELECT data FROM diagnostics').all() as {data:string}[]) {
      const item = JSON.parse(row.data) as StoredDiagnostic;
      if (item.state === 'analyzing') this.putDiagnostic({...item,state:'failed',error:'La lectura se interrumpió al reiniciar. Puedes volver a analizar.'});
    }
    for (const row of this.db.prepare('SELECT data FROM reports').all() as {data:string}[]) {
      const item = JSON.parse(row.data) as ReportRecord;
      if (item.state === 'preparing') this.putReport({...item,state:'failed',error:'La preparación se interrumpió; no se liquidó un pago.'});
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

/** Stable hashes bind content, not incidental object insertion order. */
export function canonicalHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])) : item;
  return hash(JSON.stringify(canonical(value)));
}
export function reportMarkdown(report: CoachReport): string {
  const statement = (item: {text:string;kind:string;needsConfirmation:boolean;evidenceIds:string[]}) => `${item.text}${item.needsConfirmation ? ' [Por confirmar]' : ''}${item.evidenceIds.length ? ` (evidencia: ${item.evidenceIds.join(', ')})` : ''}`;
  return [`# ${report.title}`,`Versión ${report.revision} · ${report.createdAt}`,`IA: ${report.ai.mode === 'fixture' ? 'SIMULADA' : report.ai.model}`,statement(report.content.summary),'## Diagnóstico',...report.content.diagnosis.map(item=>`- ${statement(item)}`),'## Próximos pasos',...report.content.nextSteps.map(item=>`- **${item.title}:** ${statement(item.detail)}`),'## Postulación',...report.content.application.flatMap(item=>[`### ${item.heading}`,statement(item.content)]),'## Evidencias',...report.evidence.map(item=>`- ${item.id} · ${item.provenance}: ${item.claim} — ${item.url}${item.file ? ` (${item.file}:${item.line ?? 1})` : ''}`),'',`Cobertura: ${report.coverage.complete ? 'fuentes seleccionadas inspeccionadas' : 'parcial'}; no acredita despliegue, gasto real ni elegibilidad.`].join('\n\n');
}

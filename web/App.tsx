import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachProfile, CoachReport, CriterionMatch, Evidence, ProfileField, ReportStatement, SourceInspection } from '../src/coach/types.ts';
import { emptyProfile } from '../src/coach/types.ts';
import type { BrowserWallet } from './wallet.ts';
import { createPublicDemoApi } from './public-demo.ts';

const isPublicDemo = import.meta.env.VITE_PUBLIC_DEMO === 'true';
const repositoryUrl = import.meta.env.VITE_REPOSITORY_URL || 'https://github.com/CaBsCrypto/ruta-builder';
const transport = isPublicDemo ? createPublicDemoApi() : fetch;
type Health = { mode: 'local-fixture' | 'devnet' | 'public-demo'; aiMode: 'fixture' | 'live'; model: string; payTo: string; network: string; mint: string; price: string };
type OpportunityPreview = { id: string; title: string; sourceUrl: string; kind: string; reward: string; status: string; description: string; verifiedOn: string; deadline: string | null; criteria: CriterionMatch[] };
type OpportunityChoice = { id: string; title: string; ecosystem: string };
type ReportPreview = { id: string; state: 'preparing' | 'ready' | 'failed'; paid: boolean; resource: string; error?: string };
type FreeDiagnostic = { id: string; revision: number; state: string; profile: CoachProfile; evidence: Evidence[]; coverage: SourceInspection['coverage']; questions: { field: ProfileField; question: string }[]; opportunities: OpportunityPreview[]; reports: ReportPreview[]; sourceMode?: 'public' | 'fixture'; fixtureId?: string; preferredOpportunityId?: string; error?: string };
type Recent = { id: string; state: string; revision: number; projectName: string; updatedAt: string };
type Demo = { id: string; name: string; summary: string; profile: CoachProfile };
const steps = ['Tu proyecto', 'Fuentes', 'Confirmar', 'Oportunidades', 'Tu informe'];
const labels: Record<string, string> = { observed: 'Observado', declared: 'Declarado por ti', inferred: 'Inferido', grant: 'Grant', prize: 'Premio', accelerator: 'Aceleradora', credits: 'Créditos', active: 'Activa', closed: 'Cerrada', paused: 'Pausada', unverified: 'Por verificar', matched: 'Dato aportado', missing: 'Falta confirmar', incompatible: 'No compatible', idea: 'Idea', prototype: 'Prototipo', live: 'En funcionamiento' };
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await transport(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  const messages: Record<string, string> = { demo_storage_unavailable: 'El navegador bloqueó el guardado local. Permite el almacenamiento de este sitio o abre la demo en otro navegador.', demo_storage_full: 'El almacenamiento de la demo está lleno. Descarga tus borradores y borra los datos de este sitio para comenzar de nuevo.', demo_storage_invalid: 'Los datos guardados de la demo no se pueden leer. Borra los datos de este sitio para comenzar de nuevo.', OPENAI_API_KEY_required: 'La IA conectada aún no está configurada. Puedes explorar el recorrido usando el modo de demostración.', ecosystem_not_supported: 'Todavía no tenemos cobertura de oportunidades para esta red.', opportunity_unavailable: 'La convocatoria no está disponible con los datos actuales. Vuelve a revisar tu diagnóstico.', preferred_opportunity_unavailable: 'La convocatoria elegida ya no está disponible para esta red. Elige otra o explora opciones.', analysis_limit: 'Llegaste al límite de revisiones de esta sesión. Puedes retomar tus diagnósticos existentes.', profile_incomplete: 'Completa el nombre, la descripción y el público de tu proyecto.', not_found: 'Este recurso no está disponible en tu sesión.', preparation_limit: 'Hay varias revisiones en curso. Intenta preparar el informe más tarde.', diagnostic_not_ready: 'Espera a que termine la revisión de tus fuentes.', settlement_uncertain: 'El estado del pago necesita conciliación. No solicites otra firma.' };
  if (!response.ok) throw new Error(data.error && messages[data.error] || data.error || `No se pudo completar la solicitud (${response.status}).`);
  return data;
}
const formatDate = (date: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(date));
const formatReviewDate = (date: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'UTC' : 'America/Santiago' }).format(new Date(date));
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    link: <><path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
    file: <><path d="M14 2H5v20h14V7l-5-5Z" /><path d="M14 2v5h5M8 12h8M8 16h6" /></>,
    spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    wallet: <><path d="M20 8H4V5h15v3M4 8v12h17V8M21 12h-6v4h6" /><path d="M17 14h.01" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
function Field({ label, name, value, onChange, placeholder, multiline, optional = false }: { label: string; name: ProfileField; value: string; onChange: (name: ProfileField, value: string) => void; placeholder?: string; multiline?: boolean; optional?: boolean }) {
  return <label className="field"><span>{label}{optional && <small>Opcional</small>}</span>{multiline ? <textarea name={name} value={value} rows={3} required={!optional} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} /> : <input name={name} value={value} required={!optional} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} type={name.endsWith('Url') ? 'url' : 'text'} />}</label>;
}
function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Statement({ statement, evidence, onEvidence }: { statement: ReportStatement; evidence: Evidence[]; onEvidence: (id: string) => void }) {
  return <div className="statement"><p>{statement.text}</p><div className="statement-meta">{statement.kind === 'proposal' && <Badge>Propuesta</Badge>}{statement.kind === 'unknown' && <Badge tone="amber">Por completar</Badge>}{statement.needsConfirmation && <span>Revisa antes de presentar</span>}{statement.evidenceIds.map(id => evidence.find(item => item.id === id) && <button key={id} className="evidence-reference" onClick={() => onEvidence(id)} aria-label={`Ver evidencia ${id}`}>{id}</button>)}</div></div>;
}
function download(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [demos, setDemos] = useState<Demo[]>([]);
  const [opportunityChoices, setOpportunityChoices] = useState<OpportunityChoice[]>([]);
  const [preferredOpportunityId, setPreferredOpportunityId] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [profile, setProfile] = useState<CoachProfile>(emptyProfile);
  const [step, setStep] = useState(0);
  const [sourceMode, setSourceMode] = useState<'public' | 'fixture'>('public');
  const [fixtureId, setFixtureId] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<FreeDiagnostic | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState('');
  const [selectedReport, setSelectedReport] = useState<ReportPreview | null>(null);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [wallets, setWallets] = useState<BrowserWallet[]>([]);
  const [walletName, setWalletName] = useState('');
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [evidenceFocus, setEvidenceFocus] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestGeneration = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refreshRecent = useCallback(() => api<{ diagnostics: Recent[] }>('/api/diagnostics').then(data => setRecent(data.diagnostics)), []);
  useEffect(() => {
    Promise.all([api<Health>('/api/health'), api<{ projects: Demo[] }>('/api/demo-projects'), api<{ diagnostics: Recent[] }>('/api/diagnostics'), api<{ opportunities: OpportunityChoice[] }>('/api/opportunities')]).then(([state, examples, sessions, programs]) => {
      if (!alive.current) return;
      setHealth(state); setDemos(examples.projects); setRecent(sessions.diagnostics); setOpportunityChoices(programs.opportunities);
    }).catch(err => { if (alive.current) setError(err.message); });
    if (isPublicDemo) return;
    let stopped = false;
    let unsubscribe = () => {};
    void import('./wallet.ts').then(({ discoverWallets }) => {
      if (!stopped) unsubscribe = discoverWallets(setWallets);
    }).catch(err => { if (!stopped && alive.current) setError(err.message); });
    return () => { stopped = true; unsubscribe(); };
  }, []);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (!evidenceFocus) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.evidence-modal');
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEvidenceFocus(null);
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href]')];
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [evidenceFocus]);
  const loadDiagnostic = useCallback(async (id: string, resume = false) => {
    if (resume) requestGeneration.current++;
    const generation = requestGeneration.current;
    const item = await api<FreeDiagnostic>(`/diagnostics/${encodeURIComponent(id)}`);
    if (!alive.current || generation !== requestGeneration.current) return item;
    setDiagnostic(item);
    if (resume) { setProfile(item.profile); setSourceMode(item.sourceMode || 'public'); setFixtureId(item.fixtureId); setPreferredOpportunityId(item.preferredOpportunityId || ''); setSelectedOpportunity(''); setStep(3); setReport(null); setSelectedReport(null); setNotice('Retomaste tu proyecto. Puedes revisar las fuentes y actualizar tus respuestas.'); }
    return item;
  }, []);
  useEffect(() => {
    if (!diagnostic || (diagnostic.state !== 'analyzing' && !diagnostic.reports.some(item => item.state === 'preparing'))) return;
    const id = window.setInterval(() => { void loadDiagnostic(diagnostic.id).catch(err => setError(err.message)); }, 1500);
    return () => window.clearInterval(id);
  }, [diagnostic?.id, diagnostic?.state, diagnostic?.reports.map(item => item.state).join(','), loadDiagnostic]);
  useEffect(() => {
    if (!diagnostic?.opportunities.length || selectedOpportunity) return;
    const available = diagnostic.opportunities.filter(item => !['incompatible', 'closed', 'paused', 'unverified'].includes(item.status));
    const possible = available.find(item => item.id === diagnostic.preferredOpportunityId) || available[0];
    if (possible) setSelectedOpportunity(possible.id);
  }, [diagnostic, selectedOpportunity]);
  useEffect(() => {
    if (!selectedReport || !diagnostic) return;
    const updated = diagnostic.reports.find(item => item.id === selectedReport.id);
    if (updated && (updated.state !== selectedReport.state || updated.paid !== selectedReport.paid)) setSelectedReport(updated);
  }, [diagnostic, selectedReport]);
  useEffect(() => {
    if (!selectedReport) return;
    setPaymentUncertain(!isPublicDemo && (sessionStorage.getItem(`ruta:payment:${selectedReport.id}`) === 'uncertain' || sessionStorage.getItem(`ruta:payment:${selectedReport.id}`) === 'sending'));
    if (selectedReport.state !== 'ready') return;
    let current = true;
    transport(`/reports/${encodeURIComponent(selectedReport.id)}`, { credentials: 'same-origin' }).then(async response => {
      if (response.status === 402) return;
      const body = await response.json() as { report?: CoachReport; error?: string };
      if (!isPublicDemo && body.error === 'settlement_uncertain') { setPaymentUncertain(true); sessionStorage.setItem(`ruta:payment:${selectedReport.id}`, 'uncertain'); }
      if (!response.ok) throw new Error(body.error || 'No se pudo recuperar el informe.');
      if (current && body.report) { setReport(body.report); setPaymentUncertain(false); if (!isPublicDemo) sessionStorage.setItem(`ruta:payment:${selectedReport.id}`, 'confirmed'); }
    }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [selectedReport?.id, selectedReport?.state, selectedReport?.paid]);
  useEffect(() => {
    if (!report) return;
    try { setEdits(JSON.parse(localStorage.getItem(`ruta:draft:${report.id}`) || '{}') as Record<string, string>); }
    catch { setEdits({}); }
  }, [report?.id]);
  function update(field: ProfileField, value: string) { setProfile(previous => ({ ...previous, [field]: value })); if (field === 'targetChain') setPreferredOpportunityId(''); setConfirmed(false); }
  function beginNew() {
    requestGeneration.current++;
    setProfile(emptyProfile()); setStep(0); setDiagnostic(null); setReport(null); setSelectedReport(null); setSelectedOpportunity(''); setPreferredOpportunityId(''); setSourceMode('public'); setFixtureId(undefined); setConfirmed(false); setError(''); setNotice('');
  }
  function useDemo(demo: Demo) {
    beginNew(); setProfile(demo.profile); setSourceMode('fixture'); setFixtureId(demo.id); setNotice(`Ejemplo «${demo.name}» seleccionado. Sus fuentes y datos son simulados.`); setStep(0);
  }
  async function startDiagnostic() {
    if (!confirmed) { setError('Confirma tus respuestas antes de preparar el diagnóstico.'); return; }
    setBusy(true); setError(''); setReport(null); setSelectedReport(null); setSelectedOpportunity('');
    const generation = ++requestGeneration.current;
    try {
      const body = { profile, sourceMode, preferredOpportunityId, ...(fixtureId ? { fixtureId } : {}) };
      const result = await api<{ id: string }>(diagnostic ? `/diagnostics/${encodeURIComponent(diagnostic.id)}` : '/diagnostics', { method: diagnostic ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (generation !== requestGeneration.current) return;
      await loadDiagnostic(result.id); setStep(3); await refreshRecent();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar la revisión.'); }
    finally { setBusy(false); }
  }
  async function createReport() {
    if (!diagnostic || !selectedOpportunity) return;
    setBusy(true); setError(''); setReport(null);
    try { const created = await api<{ id: string; state: 'preparing'; resource: string }>(`/diagnostics/${diagnostic.id}/reports`, { method: 'POST', body: JSON.stringify({ opportunityId: selectedOpportunity }) }); setSelectedReport({ ...created, paid: false }); await loadDiagnostic(diagnostic.id); setStep(4); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo preparar el informe.'); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!selectedReport || !health || paymentUncertain) return;
    setBusy(true); setError('');
    try {
      if (isPublicDemo || health.mode === 'local-fixture' || health.mode === 'public-demo') {
        const result = await api<{ status?: string; report?: CoachReport; error?: string }>(`/api/demo-pay/${selectedReport.id}`, { method: 'POST' });
        if (!result.report || (result.status !== undefined && result.status !== 'confirmed')) throw new Error(result.error || 'No se pudo abrir el informe de demostración.');
        if (result.report) setReport(result.report);
      } else {
        const wallet = wallets.find(item => item.name === walletName);
        if (!wallet) throw new Error('Selecciona una wallet desktop compatible con Solana.');
        const { payWithWallet } = await import('./wallet.ts');
        const result = await payWithWallet({ wallet, reportId: selectedReport.id, resource: selectedReport.resource, health });
        if (result.status === 'uncertain') { setPaymentUncertain(true); throw new Error(result.reason); }
        if (result.status === 'rejected') throw new Error(result.reason);
        const response = result.result as { report?: CoachReport };
        if (response.report) setReport(response.report);
        else { const loaded = await api<{ report: CoachReport }>(`/reports/${selectedReport.id}`); setReport(loaded.report); }
      }
      await loadDiagnostic(diagnostic!.id); setNotice(health.mode === 'public-demo' ? 'Informe de demostración disponible en este navegador. No se solicitó una firma ni se movieron fondos.' : health.mode === 'local-fixture' ? 'Informe desbloqueado mediante un pago simulado. No se movieron fondos.' : 'Pago confirmado. Tu informe ya está disponible en esta sesión.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud.'); }
    finally { setBusy(false); }
  }
  function editSection(heading: string, value: string) {
    if (!report) return;
    const next = { ...edits, [heading]: value }; setEdits(next);
    try { localStorage.setItem(`ruta:draft:${report.id}`, JSON.stringify(next)); }
    catch { setNotice('No se pudo guardar esta edición en el navegador. Descarga el borrador antes de cerrar esta página.'); }
  }
  function exportDraft() {
    if (!report) return;
    const lines = [`# ${report.title}`, '', `Convocatoria: ${report.selectedOpportunity.title}`, `Fuente: ${report.selectedOpportunity.sourceUrl}`, '', 'Borrador para revisión humana. Las ediciones locales son declaraciones del usuario y no modifican el informe original.', ''];
    for (const section of report.content.application) lines.push(`## ${section.heading}`, '', edits[section.heading] ?? section.content.text, '', ...(section.content.evidenceIds.length ? [`Evidencia original: ${section.content.evidenceIds.join(', ')}`, ''] : []));
    download('postulacion-ruta-builder.md', lines.join('\n'), 'text/markdown;charset=utf-8');
  }
  const unsupported = profile.targetChain !== 'solana';
  const isAnalyzing = diagnostic?.state === 'analyzing';
  const coverage = report?.coverage ?? diagnostic?.coverage;
  const availableEvidence = report?.evidence ?? diagnostic?.evidence ?? [];
  const focusedEvidence = availableEvidence.find(item => item.id === evidenceFocus);
  const selectedProgram = diagnostic?.opportunities.find(item => item.id === selectedOpportunity);
  const preferredProgram = opportunityChoices.find(item => item.id === preferredOpportunityId);
  const canPrepare = diagnostic && !isAnalyzing && diagnostic.state !== 'failed' && !unsupported && selectedProgram && selectedProgram.status !== 'incompatible' && !['closed', 'paused', 'unverified'].includes(selectedProgram.status);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); beginNew(); }}><span className="brand-icon"><span /><span /><span /></span><span>ruta<span className="brand-light">builder</span></span></a>
      <span className="sidebar-eyebrow">TU ESPACIO DE TRABAJO</span>
      <nav aria-label="Pasos del proyecto">{steps.map((label, index) => <button key={label} className={`nav-step ${step === index ? 'active' : ''}`} disabled={index > 2 && !diagnostic || index === 4 && !selectedReport} onClick={() => { if (index <= 2 || diagnostic) setStep(index); setError(''); }}><span className={`step-number ${index < step ? 'done' : ''}`}>{index < step ? <Icon name="check" size={13} /> : index + 1}</span><span>{label}</span>{step === index && <span className="nav-dot" />}</button>)}</nav>
      <button className="new-project" onClick={beginNew}><Icon name="plus" size={16} /> Nuevo proyecto</button>
      {recent.length > 0 && <div className="recent-projects"><span className="sidebar-eyebrow">RETOMAR</span>{recent.slice(0, 4).map(item => <button key={item.id} onClick={() => { setBusy(true); setError(''); setSelectedOpportunity(''); void loadDiagnostic(item.id, true).catch(err => setError(err.message)).finally(() => setBusy(false)); }}><span className="recent-dot" /><span>{item.projectName || 'Proyecto sin nombre'}</span></button>)}</div>}
      <div className="sidebar-footer"><span className="solana-mark"><i /><i /><i /></span><div><strong>Solana primero</strong><p>Más ecosistemas, próximamente.</p></div></div>
    </aside>
    <div className="workspace">
      {recent.length > 0 && <details className="mobile-recent"><summary>Retomar un proyecto de esta sesión</summary>{recent.map(item => <button key={item.id} disabled={busy} onClick={() => { setBusy(true); setError(''); setSelectedOpportunity(''); void loadDiagnostic(item.id, true).catch(err => setError(err.message)).finally(() => setBusy(false)); }}>{item.projectName || 'Proyecto sin nombre'}<Icon name="arrow" size={14} /></button>)}</details>}
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{profile.projectName || 'Nuevo proyecto'}</strong></div><div className="topbar-right"><span className="private-session"><span /> {isPublicDemo ? 'Guardado en este navegador' : 'Sesión privada'}</span>{health && <Badge tone={health.mode === 'devnet' ? 'green' : 'purple'}>{health.mode === 'public-demo' ? 'Demo pública' : health.mode === 'local-fixture' ? 'Demo local' : 'Solana devnet'}</Badge>}</div></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow">PASO {step + 1} DE 5 · {step < 3 ? 'CONSTRUYE TU PERFIL' : step === 3 ? 'ENCUENTRA TU CAMINO' : 'PREPARA TU POSTULACIÓN'}</span><h1 tabIndex={-1} ref={headingRef}>{['Cada proyecto empieza con una idea.', 'Dale contexto a tu proyecto.', 'La mejor guía empieza con buenos datos.', 'Oportunidades con sentido para ti.', 'Tu siguiente paso, preparado.'][step]}</h1><p>{['Cuéntanos qué quieres construir. Te ayudaremos a convertirlo en una ruta concreta.', isPublicDemo ? 'Registra tus referencias o explora fuentes sintéticas. Esta demo no visita webs ni repositorios.' : 'Revisaremos lo que compartas y mostraremos la evidencia detrás de cada observación.', 'Revisa tus respuestas. Lo que aún no sabes puede quedar pendiente.', 'Un punto de partida para investigar y decidir; cada programa tiene sus propios requisitos.', 'Un diagnóstico, un plan y un borrador que puedes revisar antes de presentar.'][step]}</p></div><div className="heading-counter">0{step + 1}<span>/ 05</span></div></div>
        {isPublicDemo && <div className="mode-banner public-demo-banner"><span className="mode-dot" /><strong>Demo pública</strong><span>Datos guardados sólo en este navegador. Fuentes, IA y pago simulados. Compra real en devnet pendiente.</span><span className="snapshot-note">Catálogo de demostración del 11 de octubre de 2026; verifica las condiciones actuales en las fuentes oficiales. No ingreses claves, credenciales ni información privada.</span></div>}
        {health?.mode === 'local-fixture' && <div className="mode-banner"><span className="mode-dot" /><strong>Modo demostración</strong><span>{health.aiMode === 'fixture' ? 'IA y pago simulados.' : 'Pago simulado; IA conectada.'} La compra real en devnet está pendiente.</span></div>}
        {health?.mode === 'devnet' && <div className="mode-banner"><span className="mode-dot" /><strong>Devnet · 0,01 USDC</strong><span>Solo se solicita una firma al pulsar «Pagar». La compra real sigue pendiente de validación.</span></div>}
        {error && <div className="alert error" role="alert"><strong>No pudimos completar este paso.</strong><span>{error}</span><button aria-label="Cerrar aviso" onClick={() => setError('')}>×</button></div>}
        {notice && <div className="alert notice" role="status"><span>{notice}</span><button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}
        {step < 3 && <div className="content-grid">
          <section className="card form-card">
            <div className="card-heading"><span className="section-icon"><Icon name={step === 0 ? 'spark' : step === 1 ? 'link' : 'check'} /></span><div><h2>{['Hablemos de tu idea', 'Tu proyecto, en sus propias fuentes', 'Confirma y completa'][step]}</h2><p>{['No necesitas tener código para comenzar.', isPublicDemo ? 'Tus enlaces se guardan como declaraciones, sin inspección remota.' : 'Una web y un repo público son suficientes para comenzar.', 'Estas respuestas son declaraciones tuyas.'][step]}</p></div><Badge>{step === 0 ? 'Gratis' : 'Perfil'}</Badge></div>
            <form onSubmit={event => { event.preventDefault(); setError(''); if (step < 2) setStep(step + 1); else void startDiagnostic(); }}>
              {step === 0 && <>
                <Field label="¿Cómo se llama tu proyecto?" name="projectName" value={profile.projectName} onChange={update} placeholder="Ej. Semilla, una comunidad de builders" />
                <Field label="¿Qué quieres construir?" name="description" value={profile.description} onChange={update} multiline placeholder="El problema que resuelves y cómo imaginas tu solución…" />
                <Field label="¿Para quién lo estás construyendo?" name="audience" value={profile.audience} onChange={update} placeholder="Ej. Comunidades que financian pequeños proyectos" />
                <fieldset className="stage-group"><legend>¿En qué etapa estás?</legend><div className="stage-options">{[['idea', 'Tengo una idea', 'Estoy definiendo el problema'], ['prototype', 'Tengo un prototipo', 'Ya puedo mostrar cómo funciona'], ['live', 'Ya está funcionando', 'Hay un producto en uso']].map(([value, title, subtitle]) => <label className={`stage-option ${profile.stage === value ? 'selected' : ''}`} key={value}><input type="radio" name="stage" value={value} checked={profile.stage === value} onChange={() => update('stage', value)} /><span className="radio-dot" /><strong>{title}</strong><span>{subtitle}</span></label>)}</div></fieldset>
                <div className="field-row"><label className="field"><span>¿Qué red utiliza hoy?</span><select value={profile.currentChain} onChange={event => update('currentChain', event.target.value)}><option value="">Aún no la he elegido</option><option value="solana">Solana</option><option value="avalanche">Avalanche</option><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="other">Otra red</option></select></label><label className="field"><span>¿Dónde quieres postular?</span><select value={profile.targetChain} onChange={event => update('targetChain', event.target.value)}><option value="solana">Solana</option><option value="avalanche">Avalanche · Próximamente</option><option value="ethereum">Ethereum · Próximamente</option><option value="base">Base · Próximamente</option></select></label></div>
                <label className="field"><span>¿Tienes una convocatoria en mente?<small>Opcional</small></span><select value={preferredOpportunityId} onChange={event => { setPreferredOpportunityId(event.target.value); setConfirmed(false); }} aria-describedby="preferred-opportunity-help"><option value="">Quiero explorar opciones</option>{opportunityChoices.filter(item => item.ecosystem === profile.targetChain).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><small id="preferred-opportunity-help">Compararemos tu proyecto con esta convocatoria. Elegirla no confirma tu elegibilidad.</small></label>
                {unsupported && <p className="inline-note amber">Guardaremos tu interés en esta red. Por ahora, el diagnóstico de oportunidades y los informes completos cubren Solana.</p>}
              </>}
              {step === 1 && <>
                {sourceMode === 'fixture' && <div className="inline-note purple"><strong>Fuentes de ejemplo seleccionadas.</strong><p>Se usará un caso simulado, sin inspeccionar estas URLs en internet.</p><button type="button" className="text-button" onClick={() => { setSourceMode('public'); setFixtureId(undefined); }}>Usar mis propias fuentes</button></div>}
                <Field label="Sitio web" name="websiteUrl" value={profile.websiteUrl} onChange={update} placeholder="https://tuproyecto.com" optional />
                <Field label="Repositorio público GitHub" name="repositoryUrl" value={profile.repositoryUrl} onChange={update} placeholder="https://github.com/equipo/proyecto" optional />
                <div className="source-note"><Icon name="file" /><div><strong>También puedes continuar sin fuentes</strong><p>En ese caso, tu perfil se apoyará en lo que nos cuentes. Verás claramente qué está observado y qué está declarado.</p></div></div>
                <div className="inspection-limits">{isPublicDemo ? <><h3>Alcance de la demo pública</h3><ul><li>Los ejemplos usan evidencia sintética incluida en la aplicación.</li><li>Tus propias URLs quedan declaradas, sin inspección ni llamadas de red.</li><li>El informe se prepara con una plantilla local y guarda cobertura parcial.</li></ul><p>El lector real de web y GitHub está en el repositorio para ejecutar el MVP local. Esta demo no comprueba integraciones, consumo ni gastos.</p></> : <><h3>Qué vamos a revisar</h3><ul><li>Hasta 3 páginas del mismo sitio y 30 archivos de texto del repo.</li><li>Documentación, dependencias y referencias de código.</li><li>El repositorio fijado a un commit, sin ejecutar el proyecto.</li></ul><p>No podemos conocer tu consumo real ni tus gastos a partir del código.</p></>}</div>
              </>}
              {step === 2 && <>
                <div className="profile-summary"><div><span>Proyecto</span><strong>{profile.projectName || 'Nombre pendiente'}</strong></div><div><span>Etapa</span><strong>{labels[profile.stage]}</strong></div><div><span>Red objetivo</span><strong>{profile.targetChain === 'solana' ? 'Solana' : profile.targetChain}</strong></div></div>
                {preferredProgram && <p className="small-note">Convocatoria a revisar: <strong>{preferredProgram.title}</strong>. El encaje se comprobará con tus respuestas y las fuentes disponibles.</p>}
                <div className="field-row"><Field label="Equipo y experiencia" name="team" value={profile.team} onChange={update} placeholder="Quiénes participan y qué aportan" optional /><Field label="Licencia del proyecto" name="license" value={profile.license} onChange={update} placeholder="Ej. MIT, aún sin definir" optional /></div>
                <div className="field-row"><Field label="Usuarios o validación" name="users" value={profile.users} onChange={update} placeholder="Datos reales; puede ser «sin usuarios»" optional /><Field label="País de residencia" name="country" value={profile.country} onChange={update} placeholder="Se usa para revisar elegibilidad" optional /></div>
                <Field label="Presupuesto solicitado en USD" name="budgetUsd" value={profile.budgetUsd} onChange={update} placeholder="Ej. 3000; déjalo vacío si falta definirlo" optional />
                <Field label="Entregables e hitos" name="milestones" value={profile.milestones} onChange={update} multiline placeholder="Qué podrías entregar y en qué plazo" optional />
                <Field label="¿Qué aporta a la comunidad?" name="publicBenefit" value={profile.publicBenefit} onChange={update} multiline placeholder="Qué parte sería reutilizable o útil para otros" optional />
                <Field label="¿Cómo utilizarías Solana?" name="solanaUse" value={profile.solanaUse} onChange={update} multiline placeholder="La función concreta que necesita esta red" optional />
                <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Revisé estas respuestas. Los campos vacíos deben mantenerse como datos pendientes, sin inventarlos.</span></label>
              </>}
              <div className="form-actions">{step > 0 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Volver</button>}<span className="small-note">{step === 2 ? 'La vista inicial es gratuita' : `Paso ${step + 1} de 3 del perfil`}</span><button className="button primary" type="submit" disabled={busy || step === 0 && (!profile.projectName.trim() || !profile.description.trim() || !profile.audience.trim()) || step === 2 && !confirmed}>{busy ? 'Preparando…' : step === 2 ? 'Preparar diagnóstico' : 'Continuar'}<Icon name="arrow" size={16} /></button></div>
            </form>
          </section>
          <aside className="right-rail"><div className="guide-card"><div className="guide-orbit"><Icon name="spark" size={28} /></div><Badge tone="green">DE LA IDEA AL SIGUIENTE PASO</Badge><h2>Una ruta que parte de tu proyecto.</h2><p>Relacionamos lo que construyes con los requisitos de cada oportunidad. Tú revisas los hechos y decides cómo avanzar.</p><div className="guide-item"><span>01</span><div><strong>Un perfil claro</strong><p>Problema, equipo y etapa.</p></div></div><div className="guide-item"><span>02</span><div><strong>Evidencia a la vista</strong><p>Fuentes y límites de la revisión.</p></div></div><div className="guide-item"><span>03</span><div><strong>Un borrador útil</strong><p>Plan, hitos y postulación editable.</p></div></div></div>{demos.length > 0 && <div className="demo-card"><span className="eyebrow">¿QUIERES EXPLORAR PRIMERO?</span><h3>Prueba con un proyecto de ejemplo</h3><p>Datos simulados, seleccionados por ti.</p>{demos.map(demo => <button key={demo.id} onClick={() => useDemo(demo)}><span><strong>{demo.name}</strong><small>{demo.summary}</small></span><Icon name="arrow" size={16} /></button>)}</div>}</aside>
        </div>}
        {step === 3 && diagnostic && <>
          {isAnalyzing ? <div className="card loading-card" role="status"><span className="spinner" /><h2>Estamos revisando tu proyecto</h2><p>{isPublicDemo ? 'Preparando el perfil local y comparando requisitos del catálogo de demostración.' : 'Fijando fuentes, identificando referencias y comparando requisitos.'}</p></div> : <div className="content-grid diagnosis-grid"><div className="main-column">
            <section className="card"><div className="card-heading"><span className="section-icon"><Icon name="spark" /></span><div><h2>{diagnostic.profile.projectName}</h2><p>Perfil · revisión {diagnostic.revision}</p></div><Badge tone={diagnostic.state === 'partial' ? 'amber' : 'green'}>{diagnostic.state === 'partial' ? 'Cobertura parcial' : diagnostic.state === 'failed' ? 'Revisión incompleta' : 'Vista inicial lista'}</Badge></div><p className="project-description">{diagnostic.profile.description}</p><div className="profile-tags"><Badge>{labels[diagnostic.profile.stage]}</Badge><Badge>Para: {diagnostic.profile.audience}</Badge><Badge>Objetivo: {diagnostic.profile.targetChain}</Badge></div>{diagnostic.error && <p className="inline-note amber">{diagnostic.error}</p>}
              <div className="subsection"><div className="section-title"><h3>Lo que encontramos</h3><span>{diagnostic.evidence.length} referencias</span></div><div className="evidence-list">{diagnostic.evidence.slice(0, 7).map(item => <button key={item.id} onClick={() => setEvidenceFocus(item.id)}><span className={`evidence-dot ${item.provenance}`} /><span><strong>{item.claim}</strong><small>{labels[item.provenance]}{item.file ? ` · ${item.file}${item.line ? `:${item.line}` : ''}` : ''}</small></span><Icon name="arrow" size={14} /></button>)}{!diagnostic.evidence.length && <p className="muted">Sin observaciones verificables todavía. El perfil se basa en tus declaraciones.</p>}</div><p className="small-note">Una dependencia encontrada no demuestra una integración funcionando.</p></div>
              {diagnostic.questions.length > 0 && <div className="subsection"><h3>Falta confirmar</h3><ul className="questions-list">{diagnostic.questions.map(item => <li key={item.field}>{item.question}</li>)}</ul><button className="text-button" onClick={() => { setProfile(diagnostic.profile); setStep(2); setConfirmed(false); }}>Completar o corregir mis respuestas <Icon name="arrow" size={14} /></button></div>}
            </section>
            <section className="card"><div className="section-title"><h2>Explora tus oportunidades</h2><Badge>Solana</Badge></div><p className="muted">Elige una convocatoria para preparar tu plan y un borrador. El encaje aún puede depender de respuestas pendientes.</p>{unsupported && <p className="inline-note amber">La red objetivo no está cubierta todavía. Guardamos tu interés; puedes actualizar el objetivo a Solana.</p>}<div className="opportunity-list">{diagnostic.opportunities.map(item => <label className={`opportunity ${selectedOpportunity === item.id ? 'selected' : ''}`} key={item.id}><input type="radio" name="opportunity" checked={selectedOpportunity === item.id} onChange={() => setSelectedOpportunity(item.id)} disabled={unsupported || ['incompatible', 'closed', 'paused', 'unverified'].includes(item.status)} /><div className="opportunity-top"><span className="radio-dot" /><Badge tone="purple">{labels[item.kind] || item.kind}</Badge><span className={`opportunity-status ${item.status}`}>{item.status === 'possible' ? 'Posible encaje' : item.status === 'pending' ? 'Por confirmar' : labels[item.status] || item.status}</span></div><h3>{item.title}</h3><p className="opportunity-description">{item.description}</p><p className="reward">{item.reward}</p><div className="opportunity-dates"><span>{item.deadline ? `Cierre: ${formatDate(item.deadline)} · Santiago` : 'Sin fecha publicada'}</span><span>{isPublicDemo ? 'Instantánea del catálogo' : 'Ficha revisada'}: {formatReviewDate(item.verifiedOn)}</span></div><div className="criterion-tags">{item.criteria.map(criterion => <span key={criterion.id} className={criterion.status} title={criterion.reason}>{criterion.status === 'incompatible' ? '×' : '○'} {criterion.label}</span>)}</div><a className="source-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>Consultar requisitos oficiales ↗</a></label>)}{!diagnostic.opportunities.length && <p className="inline-note amber">No hay fichas disponibles que podamos recomendar con esta cobertura. Puedes completar el perfil o revisar las fuentes oficiales.</p>}</div><div className="form-actions"><span className="small-note">Hasta 3 oportunidades explicadas en tu informe</span><button className="button primary" onClick={() => void createReport()} disabled={busy || !canPrepare}>{busy ? 'Preparando…' : 'Preparar mi informe'}<Icon name="arrow" size={16} /></button></div></section>
          </div><aside className="right-rail"><Coverage coverage={diagnostic.coverage} /><div className="quiet-card"><Icon name="file" /><h3>De aquí a una postulación</h3><p>Tu informe completo incluye diagnóstico, requisitos, próximos pasos y un borrador editable.</p><div className="price-tag">{isPublicDemo ? <><span>Acceso gratuito · demo</span></> : <>0,01 <span>USDC · devnet</span></>}</div><p className="small-note">{isPublicDemo ? 'El recorrido público usa una plantilla local. El flujo HTTP x402 se reproduce con el backend del repositorio.' : 'Primero lo preparamos y validamos; después decides si lo obtienes.'}</p></div>{diagnostic.reports.length > 0 && <div className="demo-card"><h3>Informes de esta revisión</h3>{diagnostic.reports.map(item => <button key={item.id} onClick={() => { setSelectedReport(item); setReport(null); setStep(4); }}><span><strong>{item.paid ? 'Informe disponible' : item.state === 'preparing' ? 'Preparando informe' : item.state === 'failed' ? 'Informe incompleto' : 'Informe preparado'}</strong><small>{item.id.slice(0, 12)}</small></span><Icon name="arrow" size={15} /></button>)}</div>}</aside></div>}
        </>}
        {step === 4 && selectedReport && <>
          {selectedReport.state === 'preparing' ? <div className="card loading-card" role="status"><span className="spinner" /><h2>Preparando un informe con respaldo</h2><p>Relacionando los hechos, los requisitos y los próximos pasos. {isPublicDemo ? 'El acceso a la demo es gratuito; no se solicitan firmas ni pagos.' : 'No se solicita ningún pago durante la preparación.'}</p></div> : selectedReport.state === 'failed' ? <div className="card"><h2>Este informe necesita una revisión</h2><p className="inline-note amber">{selectedReport.error || 'No se pudo validar el contenido. No está disponible para cobro.'}</p><button className="button secondary" onClick={() => setStep(3)}>Volver al diagnóstico</button></div> : !report ? <div className="content-grid"><section className="card unlock-card"><div className="report-cover"><span className="eyebrow">TU INFORME PERSONALIZADO</span><Icon name="file" size={44} /><h2>{profile.projectName}</h2><p>De la evidencia a un plan de acción.</p><div className="cover-lines"><i /><i /><i /></div><Badge tone="green">Preparado y validado</Badge></div><div className="unlock-body"><h2>Todo lo que necesitas para dar el siguiente paso</h2><ul><li><Icon name="check" size={16} /> {isPublicDemo ? 'Diagnóstico y referencias de demostración' : 'Diagnóstico explicado y fuentes verificables'}</li><li><Icon name="check" size={16} /> Hasta 3 oportunidades y sus requisitos</li><li><Icon name="check" size={16} /> Plan de trabajo y borrador editable</li><li><Icon name="check" size={16} /> Descargas y acceso en esta sesión</li></ul><div className="purchase-price">{isPublicDemo ? <><strong className="demo-access">Acceso gratuito</strong><Badge tone="purple">Demo pública</Badge></> : <><strong>0,01 <span>USDC</span></strong><Badge>Solana devnet</Badge></>}</div>{health?.mode === 'devnet' && <label className="field"><span>Tu wallet desktop</span><select value={walletName} onChange={event => setWalletName(event.target.value)}><option value="">Selecciona una wallet</option>{wallets.map(wallet => <option key={wallet.name} value={wallet.name}>{wallet.name}</option>)}</select>{!wallets.length && <small>No detectamos una wallet compatible. Abre esta página en un navegador con una wallet Solana Wallet Standard.</small>}</label>}{paymentUncertain ? <div className="inline-note amber"><strong>El estado del pago necesita conciliación.</strong><p>No se solicitará otra firma. Puedes recargar para comprobar si el informe ya está disponible.</p><button className="text-button" onClick={() => { window.location.reload(); }}>Comprobar estado</button></div> : <button className="button primary full" disabled={busy || !health || health.mode === 'devnet' && !walletName} onClick={() => void pay()}><Icon name={isPublicDemo ? 'file' : 'wallet'} size={17} />{busy ? 'Procesando…' : health?.mode === 'public-demo' ? 'Ver informe de demostración' : health?.mode === 'local-fixture' ? 'Desbloquear con pago simulado' : 'Pagar 0,01 USDC en devnet'}</button>}<p className="small-note">{health?.mode === 'public-demo' ? 'Sin wallet, firmas ni transacciones. Este paso muestra el recorrido; no demuestra un pago x402 en cadena.' : <>{health?.mode === 'local-fixture' ? 'La demo no firma ni transmite transacciones.' : 'Firmas desde tu wallet. Ruta Builder no custodia tus claves.'} Reintentos y descargas no generan un segundo cargo de este informe.</>}</p></div></section><aside className="right-rail"><Coverage coverage={diagnostic?.coverage} /><div className="quiet-card"><h3>Tú conservas la última palabra.</h3><p>El diagnóstico es orientación. La convocatoria decide la elegibilidad y la financiación; revisa el borrador antes de enviarlo.</p></div></aside></div> : <div className="content-grid paid-grid"><div className="main-column"><section className="card report-intro"><div className="section-title"><Badge tone="green">Informe disponible</Badge><span className="small-note">Revisión {report.revision} · {formatDate(report.createdAt)}</span></div><h2>{report.title}</h2><Statement statement={report.content.summary} evidence={report.evidence} onEvidence={setEvidenceFocus} /><div className="report-actions"><button className="button secondary" onClick={() => download('informe-ruta-builder.json', JSON.stringify(report, null, 2), 'application/json')}><Icon name="download" size={16} />Informe original JSON</button><button className="button secondary" onClick={exportDraft}><Icon name="download" size={16} />Borrador Markdown</button></div>{report.ai.mode === 'fixture' && <p className="inline-note purple">Informe preparado con una plantilla determinista, sin llamar a la IA real. Revisa las declaraciones y los datos pendientes antes de presentar.</p>}</section><section className="card"><span className="eyebrow">01 · DIAGNÓSTICO</span><h2>Dónde estás hoy</h2><div className="diagnosis-statements">{report.content.diagnosis.map((item, index) => <Statement key={index} statement={item} evidence={report.evidence} onEvidence={setEvidenceFocus} />)}</div></section><section className="card"><span className="eyebrow">02 · OPORTUNIDADES</span><h2>Por qué podrían encajar</h2>{report.opportunities.map(match => <div className="report-opportunity" key={match.opportunity.id}><div className="section-title"><h3>{match.opportunity.title}</h3><Badge tone="purple">{labels[match.opportunity.kind]}</Badge></div><p>{match.opportunity.description}</p><ul className="criteria-detail">{match.criteria.map(criterion => <li key={criterion.id}><Badge tone={criterion.status === 'matched' ? 'green' : 'amber'}>{labels[criterion.status]}</Badge><div><strong>{criterion.label}</strong><p>{criterion.reason}</p>{criterion.evidenceIds.map(id => <button className="evidence-reference" key={id} onClick={() => setEvidenceFocus(id)}>{id}</button>)}</div></li>)}</ul><a className="source-link" href={match.opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">Revisar fuente oficial ↗</a><p className="small-note">{isPublicDemo ? 'Instantánea del catálogo' : 'Ficha verificada'}: {match.opportunity.verifiedOn}{match.opportunity.deadline ? ` · Plazo: ${formatDate(match.opportunity.deadline)}` : ''}</p></div>)}</section><section className="card"><span className="eyebrow">03 · TU PLAN</span><h2>Próximos pasos concretos</h2><div className="next-steps">{report.content.nextSteps.map((item, index) => <div className="next-step" key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><Statement statement={item.detail} evidence={report.evidence} onEvidence={setEvidenceFocus} /></div></div>)}</div></section><section className="card"><div className="section-title"><div><span className="eyebrow">04 · TU POSTULACIÓN</span><h2>Un borrador para hacer tuyo</h2></div><Badge>Editable</Badge></div><p className="muted">Para {report.selectedOpportunity.title}. Tus cambios se guardan en este navegador y se identifican como ediciones tuyas; el informe original se conserva.</p><div className="application-editor">{report.content.application.map(section => <label className="field" key={section.heading}><span>{section.heading}{Object.hasOwn(edits, section.heading) && <Badge tone="purple">Editado por ti</Badge>}</span><textarea value={edits[section.heading] ?? section.content.text} onChange={event => editSection(section.heading, event.target.value)} rows={4} /><small>{section.content.evidenceIds.length ? `Evidencia del texto original: ${section.content.evidenceIds.join(', ')}` : 'Revisa y completa con tus datos reales.'}</small></label>)}</div><div className="form-actions"><span className="small-note">Tú revisas y presentas la postulación.</span><button className="button primary" onClick={exportDraft}><Icon name="download" size={16} />Descargar borrador</button></div></section></div><aside className="right-rail"><Coverage coverage={report.coverage} /><AiCoverage report={report} /><div className="quiet-card"><Icon name="file" /><h3>Un informe, una versión</h3><p>Este paquete conserva el perfil, las fuentes y el catálogo utilizados. Puedes volver a descargarlo desde esta sesión.</p><dl className="report-metadata"><dt>Red objetivo</dt><dd>{report.profile.targetChain}</dd><dt>Catálogo</dt><dd>{report.catalogVersion}</dd><dt>Referencia</dt><dd>{report.inputsHash.slice(0, 16)}…</dd></dl></div><div className="quiet-card"><h3>Datos que requieren cuidado</h3><p>Revisa cada afirmación sobre usuarios, presupuesto e hitos. Los campos pendientes deben completarse con evidencia propia.</p></div></aside></div>}
        </>}
        {!health && !error && <p className="muted" role="status">Conectando con tu espacio de trabajo…</p>}
        <footer className="page-footer"><span>Ruta Builder · Orientación con evidencia</span><a href={repositoryUrl} target="_blank" rel="noopener noreferrer">Código fuente · MIT ↗</a><span>{isPublicDemo ? 'Demo de recorrido, sin transacciones.' : 'Tu equipo revisa y decide.'}</span></footer>
      </main>
    </div>
    {focusedEvidence && <div className="modal-backdrop" onClick={() => setEvidenceFocus(null)}><section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title" onClick={event => event.stopPropagation()}><div className="section-title"><Badge tone={focusedEvidence.provenance === 'observed' ? 'green' : 'purple'}>{labels[focusedEvidence.provenance]}</Badge><button className="close-button" onClick={() => setEvidenceFocus(null)} aria-label="Cerrar evidencia">×</button></div><h2 id="evidence-title">{focusedEvidence.claim}</h2><blockquote>{focusedEvidence.excerpt}</blockquote><dl><dt>Referencia</dt><dd>{focusedEvidence.id}</dd>{focusedEvidence.file && <><dt>Archivo</dt><dd>{focusedEvidence.file}{focusedEvidence.line ? `:${focusedEvidence.line}` : ''}</dd></>}{focusedEvidence.commit && <><dt>Commit</dt><dd className="break-all">{focusedEvidence.commit}</dd></>}<dt>Revisado</dt><dd>{formatDate(focusedEvidence.observedAt)}</dd></dl>{/^https?:/.test(focusedEvidence.url) && <a className="button secondary" href={focusedEvidence.url} target="_blank" rel="noopener noreferrer">Ver fuente <Icon name="arrow" size={16} /></a>}</section></div>}
  </div>;
}

function AiCoverage({ report }: { report: CoachReport }) {
  const { contextEvidenceCount, totalEvidenceCount, contextBytes } = report.ai;
  if (contextEvidenceCount === undefined || totalEvidenceCount === undefined) return null;
  const partial = contextEvidenceCount < totalEvidenceCount;
  return <div className="quiet-card ai-coverage"><div className="section-title"><h3>Contexto del análisis</h3><Badge tone={partial ? 'amber' : 'green'}>{partial ? 'Parcial' : 'Dentro del alcance'}</Badge></div><p>{report.ai.mode === 'fixture' ? 'El caso simulado consideró' : 'La IA recibió'} <strong>{contextEvidenceCount} de {totalEvidenceCount} referencias</strong> del informe.</p>{contextBytes !== undefined && <p className="small-note">Texto de contexto: {new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(contextBytes / 1000)} kB.</p>}{partial && <p>Las otras referencias se conservan en el paquete original y deben revisarse por separado; no formaron parte del contexto enviado al modelo.</p>}</div>;
}

function Coverage({ coverage }: { coverage?: SourceInspection['coverage'] }) {
  if (!coverage) return null;
  return <div className="coverage-card"><div className="section-title"><h3>Cobertura de la revisión</h3><span className={`coverage-dot ${coverage.complete ? 'complete' : ''}`} /></div><p>Conoce el alcance antes de interpretar los resultados.</p><div className="coverage-counts"><div><strong>{coverage.inspected.length}</strong><span>Inspeccionadas</span></div><div><strong>{coverage.omitted.length + coverage.failures.length}</strong><span>Fuera del alcance</span></div></div>{coverage.inspected.length > 0 && <details><summary>Fuentes inspeccionadas</summary><ul>{coverage.inspected.map((item, index) => <li key={index}>{item.file || item.url}</li>)}</ul></details>}{coverage.omitted.length + coverage.failures.length > 0 && <details open><summary>Omisiones y límites</summary><ul>{[...coverage.omitted, ...coverage.failures].map((item, index) => <li key={index}><strong>{item.file || item.url || 'Fuente no disponible'}</strong><span>{item.reason}</span></li>)}</ul></details>}<p className="small-note">{coverage.complete ? 'Completa dentro de los límites de esta revisión.' : 'Cobertura parcial: hay datos que no pudimos inspeccionar.'} No acredita consumo ni gastos reales.</p></div>;
}

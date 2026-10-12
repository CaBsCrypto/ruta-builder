import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachProfile, CoachReport, CriterionMatch, Evidence, ProfileField, ReportStatement, SourceInspection } from '../src/coach/types.ts';
import { emptyProfile } from '../src/coach/types.ts';
import type { BrowserWallet } from './wallet.ts';
import { Landing } from './Landing.tsx';
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
const steps = ['Your project', 'Sources', 'Confirm', 'Opportunities', 'Your report'];
const labels: Record<string, string> = { observed: 'Observed', declared: 'Declared by you', inferred: 'Inferred', grant: 'Grant', prize: 'Prize', accelerator: 'Accelerator', credits: 'Credits', active: 'Active', closed: 'Closed', paused: 'Paused', unverified: 'Unverified', matched: 'Declared information', missing: 'Needs confirmation', incompatible: 'Incompatible', idea: 'Idea', prototype: 'Prototype', live: 'Live' };
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await transport(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  const messages: Record<string, string> = {"demo_storage_unavailable":"Your browser blocked local storage. Allow storage for this site or use another browser.","demo_storage_full":"Demo storage is full. Download your drafts and clear this site’s data to start again.","demo_storage_invalid":"Saved demo data cannot be read. Clear this site’s data to start again.","OPENAI_API_KEY_required":"Connected AI is not configured yet. Explore the demo mode.","ecosystem_not_supported":"Opportunities for this network are not covered yet.","opportunity_unavailable":"This opportunity is unavailable with the current information. Review your diagnostic.","preferred_opportunity_unavailable":"The selected opportunity is unavailable for this network. Choose another or explore options.","analysis_limit":"This session reached its review limit. Resume an existing diagnostic.","profile_incomplete":"Complete the project name, description and audience.","not_found":"This resource is unavailable in your session.","preparation_limit":"Several reviews are in progress. Try preparing the report later.","diagnostic_not_ready":"Wait for the source review to finish.","settlement_uncertain":"Payment status needs reconciliation. Do not request another signature."};
  if (!response.ok) throw new Error(data.error && messages[data.error] || data.error || `Could not complete the request (${response.status}).`);
  return data;
}
const formatDate = (date: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(date));
const formatReviewDate = (date: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'UTC' : 'America/Santiago' }).format(new Date(date));
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
  return <label className="field"><span>{label}{optional && <small>Optional</small>}</span>{multiline ? <textarea name={name} value={value} rows={3} required={!optional} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} /> : <input name={name} value={value} required={!optional} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} type={name.endsWith('Url') ? 'url' : 'text'} />}</label>;
}
function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Statement({ statement, evidence, onEvidence }: { statement: ReportStatement; evidence: Evidence[]; onEvidence: (id: string) => void }) {
  return <div className="statement"><p>{statement.text}</p><div className="statement-meta">{statement.kind === 'proposal' && <Badge>Proposal</Badge>}{statement.kind === 'unknown' && <Badge tone="amber">To complete</Badge>}{statement.needsConfirmation && <span>Review before submitting</span>}{statement.evidenceIds.map(id => evidence.find(item => item.id === id) && <button key={id} className="evidence-reference" onClick={() => onEvidence(id)} aria-label={`View evidence ${id}`}>{id}</button>)}</div></div>;
}
function download(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [landing, setLanding] = useState(isPublicDemo);
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
      if (!response.ok) throw new Error(body.error || 'Could not recover the report.');
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
    beginNew(); setProfile(demo.profile); setSourceMode('fixture'); setFixtureId(demo.id); setNotice(`Example “${demo.name}” selected. Its sources and data are simulated.`); setStep(0);
  }
  async function startDiagnostic() {
    if (!confirmed) { setError('Confirm your answers before preparing the diagnostic.'); return; }
    setBusy(true); setError(''); setReport(null); setSelectedReport(null); setSelectedOpportunity('');
    const generation = ++requestGeneration.current;
    try {
      const body = { profile, sourceMode, preferredOpportunityId, ...(fixtureId ? { fixtureId } : {}) };
      const result = await api<{ id: string }>(diagnostic ? `/diagnostics/${encodeURIComponent(diagnostic.id)}` : '/diagnostics', { method: diagnostic ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (generation !== requestGeneration.current) return;
      await loadDiagnostic(result.id); setStep(3); await refreshRecent();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start the review.'); }
    finally { setBusy(false); }
  }
  async function createReport() {
    if (!diagnostic || !selectedOpportunity) return;
    setBusy(true); setError(''); setReport(null);
    try { const created = await api<{ id: string; state: 'preparing'; resource: string }>(`/diagnostics/${diagnostic.id}/reports`, { method: 'POST', body: JSON.stringify({ opportunityId: selectedOpportunity }) }); setSelectedReport({ ...created, paid: false }); await loadDiagnostic(diagnostic.id); setStep(4); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not prepare the report.'); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!selectedReport || !health || paymentUncertain) return;
    setBusy(true); setError('');
    try {
      if (isPublicDemo || health.mode === 'local-fixture' || health.mode === 'public-demo') {
        const result = await api<{ status?: string; report?: CoachReport; error?: string }>(`/api/demo-pay/${selectedReport.id}`, { method: 'POST' });
        if (!result.report || (result.status !== undefined && result.status !== 'confirmed')) throw new Error(result.error || 'Could not open the demo report.');
        if (result.report) setReport(result.report);
      } else {
        const wallet = wallets.find(item => item.name === walletName);
        if (!wallet) throw new Error('Select a compatible Solana desktop wallet.');
        const { payWithWallet } = await import('./wallet.ts');
        const result = await payWithWallet({ wallet, reportId: selectedReport.id, resource: selectedReport.resource, health });
        if (result.status === 'uncertain') { setPaymentUncertain(true); throw new Error(result.reason); }
        if (result.status === 'rejected') throw new Error(result.reason);
        const response = result.result as { report?: CoachReport };
        if (response.report) setReport(response.report);
        else { const loaded = await api<{ report: CoachReport }>(`/reports/${selectedReport.id}`); setReport(loaded.report); }
      }
      await loadDiagnostic(diagnostic!.id); setNotice(health.mode === 'public-demo' ? 'Demo report available in this browser. No signature was requested and no funds moved.' : health.mode === 'local-fixture' ? 'Report unlocked with a simulated payment. No funds moved.' : 'Payment confirmed. Your report is available in this session.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not complete the request.'); }
    finally { setBusy(false); }
  }
  function editSection(heading: string, value: string) {
    if (!report) return;
    const next = { ...edits, [heading]: value }; setEdits(next);
    try { localStorage.setItem(`ruta:draft:${report.id}`, JSON.stringify(next)); }
    catch { setNotice('Could not save this edit in your browser. Download the draft before closing this page.'); }
  }
  function exportDraft() {
    if (!report) return;
    const lines = [`# ${report.title}`, '', `Opportunity: ${report.selectedOpportunity.title}`, `Source: ${report.selectedOpportunity.sourceUrl}`, '', 'Draft for human review. Local edits are user declarations and do not change the original report.', ''];
    for (const section of report.content.application) lines.push(`## ${section.heading}`, '', edits[section.heading] ?? section.content.text, '', ...(section.content.evidenceIds.length ? [`Original evidence: ${section.content.evidenceIds.join(', ')}`, ''] : []));
    download('ruta-builder-application.md', lines.join('\n'), 'text/markdown;charset=utf-8');
  }
  const unsupported = profile.targetChain !== 'solana';
  const isAnalyzing = diagnostic?.state === 'analyzing';
  const coverage = report?.coverage ?? diagnostic?.coverage;
  const availableEvidence = report?.evidence ?? diagnostic?.evidence ?? [];
  const focusedEvidence = availableEvidence.find(item => item.id === evidenceFocus);
  const selectedProgram = diagnostic?.opportunities.find(item => item.id === selectedOpportunity);
  const preferredProgram = opportunityChoices.find(item => item.id === preferredOpportunityId);
  const canPrepare = diagnostic && !isAnalyzing && diagnostic.state !== 'failed' && !unsupported && selectedProgram && selectedProgram.status !== 'incompatible' && !['closed', 'paused', 'unverified'].includes(selectedProgram.status);

  if (landing) return <Landing onStart={() => setLanding(false)} repositoryUrl={repositoryUrl} />;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (isPublicDemo) setLanding(true); else beginNew(); }}><span className="brand-icon"><span /><span /><span /></span><span>ruta<span className="brand-light">builder</span></span></a>
      <span className="sidebar-eyebrow">YOUR WORKSPACE</span>
      <nav aria-label="Project steps">{steps.map((label, index) => <button key={label} className={`nav-step ${step === index ? 'active' : ''}`} disabled={index > 2 && !diagnostic || index === 4 && !selectedReport} onClick={() => { if (index <= 2 || diagnostic) setStep(index); setError(''); }}><span className={`step-number ${index < step ? 'done' : ''}`}>{index < step ? <Icon name="check" size={13} /> : index + 1}</span><span>{label}</span>{step === index && <span className="nav-dot" />}</button>)}</nav>
      <button className="new-project" onClick={beginNew}><Icon name="plus" size={16} /> New project</button>
      {recent.length > 0 && <div className="recent-projects"><span className="sidebar-eyebrow">RESUME</span>{recent.slice(0, 4).map(item => <button key={item.id} onClick={() => { setBusy(true); setError(''); setSelectedOpportunity(''); void loadDiagnostic(item.id, true).catch(err => setError(err.message)).finally(() => setBusy(false)); }}><span className="recent-dot" /><span>{item.projectName || 'Untitled project'}</span></button>)}</div>}
      <div className="sidebar-footer"><span className="solana-mark"><i /><i /><i /></span><div><strong>Solana first</strong><p>More ecosystems coming soon.</p></div></div>
    </aside>
    <div className="workspace">
      {recent.length > 0 && <details className="mobile-recent"><summary>Resume a project from this session</summary>{recent.map(item => <button key={item.id} disabled={busy} onClick={() => { setBusy(true); setError(''); setSelectedOpportunity(''); void loadDiagnostic(item.id, true).catch(err => setError(err.message)).finally(() => setBusy(false)); }}>{item.projectName || 'Untitled project'}<Icon name="arrow" size={14} /></button>)}</details>}
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{profile.projectName || 'New project'}</strong></div><div className="topbar-right"><span className="private-session"><span /> {isPublicDemo ? 'Saved in this browser' : 'Private session'}</span>{health && <Badge tone={health.mode === 'devnet' ? 'green' : 'purple'}>{health.mode === 'public-demo' ? 'Public demo' : health.mode === 'local-fixture' ? 'Local demo' : 'Solana devnet'}</Badge>}</div></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow">STEP {step + 1} OF 5 · {step < 3 ? 'BUILD YOUR PROFILE' : step === 3 ? 'FIND YOUR PATH' : 'PREPARE YOUR APPLICATION'}</span><h1 tabIndex={-1} ref={headingRef}>{['Every project starts with an idea.', 'Give your project context.', 'Good guidance starts with good information.', 'Opportunities that fit your project.', 'Your next step, prepared.'][step]}</h1><p>{['Tell us what you want to build. Turn your idea into a practical path forward.', isPublicDemo ? 'Add references or explore synthetic sources. This demo does not visit websites or repositories.' : 'We review what you share and show the evidence behind each observation.', 'Review your answers. Unknown information can stay incomplete.', 'A starting point for research and decisions. Each program has its own requirements.', 'A diagnostic, a plan and a draft to review before submitting.'][step]}</p></div><div className="heading-counter">0{step + 1}<span>/ 05</span></div></div>
        {isPublicDemo && <div className="mode-banner public-demo-banner"><span className="mode-dot" /><strong>Public demo</strong><span>Data saved only in this browser. Sources, AI and payments are simulated. Real devnet purchase pending.</span><span className="snapshot-note">Demo catalog snapshot: October 11, 2026. Check current terms at official sources. Do not enter keys, credentials or private information.</span></div>}
        {health?.mode === 'local-fixture' && <div className="mode-banner"><span className="mode-dot" /><strong>Demo mode</strong><span>{health.aiMode === 'fixture' ? 'AI and payments are simulated.' : 'Simulated payment; connected AI.'} Real devnet purchase is pending.</span></div>}
        {health?.mode === 'devnet' && <div className="mode-banner"><span className="mode-dot" /><strong>Devnet · 0.01 USDC</strong><span>A signature is requested only after clicking Pay. Real purchase validation remains pending.</span></div>}
        {error && <div className="alert error" role="alert"><strong>We could not complete this step.</strong><span>{error}</span><button aria-label="Dismiss notice" onClick={() => setError('')}>×</button></div>}
        {notice && <div className="alert notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
        {step < 3 && <div className="content-grid">
          <section className="card form-card">
            <div className="card-heading"><span className="section-icon"><Icon name={step === 0 ? 'spark' : step === 1 ? 'link' : 'check'} /></span><div><h2>{['Tell us about your idea', 'Your project, through its sources', 'Confirm and complete'][step]}</h2><p>{['You can start without code.', isPublicDemo ? 'Links are saved as declarations, without remote inspection.' : 'A website and a public repository are enough to start.', 'These answers are your declarations.'][step]}</p></div><Badge>{step === 0 ? 'Free' : 'Profile'}</Badge></div>
            <form onSubmit={event => { event.preventDefault(); setError(''); if (step < 2) setStep(step + 1); else void startDiagnostic(); }}>
              {step === 0 && <>
                <Field label="What is your project called?" name="projectName" value={profile.projectName} onChange={update} placeholder="e.g. Ruta Builder" />
                <Field label="What do you want to build?" name="description" value={profile.description} onChange={update} multiline placeholder="The problem you solve and your proposed solution…" />
                <Field label="Who are you building it for?" name="audience" value={profile.audience} onChange={update} placeholder="e.g. Builders preparing their first application" />
                <fieldset className="stage-group"><legend>What stage are you at?</legend><div className="stage-options">{[['idea', 'I have an idea', 'I am defining the problem'], ['prototype', 'I have a prototype', 'I can show how it works'], ['live', 'It is live', 'People are using the product']].map(([value, title, subtitle]) => <label className={`stage-option ${profile.stage === value ? 'selected' : ''}`} key={value}><input type="radio" name="stage" value={value} checked={profile.stage === value} onChange={() => update('stage', value)} /><span className="radio-dot" /><strong>{title}</strong><span>{subtitle}</span></label>)}</div></fieldset>
                <div className="field-row"><label className="field"><span>Which network does it use today?</span><select value={profile.currentChain} onChange={event => update('currentChain', event.target.value)}><option value="">Not chosen yet</option><option value="solana">Solana</option><option value="avalanche">Avalanche</option><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="other">Another network</option></select></label><label className="field"><span>Which ecosystem are you targeting?</span><select value={profile.targetChain} onChange={event => update('targetChain', event.target.value)}><option value="solana">Solana</option><option value="avalanche">Avalanche · Coming soon</option><option value="ethereum">Ethereum · Coming soon</option><option value="base">Base · Coming soon</option></select></label></div>
                <label className="field"><span>Do you have an opportunity in mind?<small>Optional</small></span><select value={preferredOpportunityId} onChange={event => { setPreferredOpportunityId(event.target.value); setConfirmed(false); }} aria-describedby="preferred-opportunity-help"><option value="">I want to explore options</option>{opportunityChoices.filter(item => item.ecosystem === profile.targetChain).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><small id="preferred-opportunity-help">We compare your project with this opportunity. Selecting it does not confirm eligibility.</small></label>
                {unsupported && <p className="inline-note amber">We will save your interest in this network. Opportunity diagnostics and full reports currently cover Solana.</p>}
              </>}
              {step === 1 && <>
                {sourceMode === 'fixture' && <div className="inline-note purple"><strong>Example sources selected.</strong><p>A simulated case will be used. These URLs will not be inspected online.</p><button type="button" className="text-button" onClick={() => { setSourceMode('public'); setFixtureId(undefined); }}>Use my own sources</button></div>}
                <Field label="Website" name="websiteUrl" value={profile.websiteUrl} onChange={update} placeholder="https://your-project.example" optional />
                <Field label="Public GitHub repository" name="repositoryUrl" value={profile.repositoryUrl} onChange={update} placeholder="https://github.com/team/project" optional />
                <div className="source-note"><Icon name="file" /><div><strong>You can also continue without sources</strong><p>Your profile will rely on what you tell us. Observations and declarations are clearly identified.</p></div></div>
                <div className="inspection-limits">{isPublicDemo ? <><h3>Public demo scope</h3><ul><li>Examples use synthetic evidence bundled with the application.</li><li>Your URLs remain declarations, without inspection or network requests.</li><li>The report uses a local template and records partial coverage.</li></ul><p>The real website and GitHub reader is in the repository for the local MVP. This demo does not verify integrations, usage or spending.</p></> : <><h3>What we review</h3><ul><li>Up to 3 pages from the same site and 30 repository text files.</li><li>Documentation, dependencies and code references.</li><li>The repository pinned to a commit, without executing it.</li></ul><p>Code alone does not reveal your actual usage or spending.</p></>}</div>
              </>}
              {step === 2 && <>
                <div className="profile-summary"><div><span>Project</span><strong>{profile.projectName || 'Name to be completed'}</strong></div><div><span>Stage</span><strong>{labels[profile.stage]}</strong></div><div><span>Target network</span><strong>{profile.targetChain === 'solana' ? 'Solana' : profile.targetChain}</strong></div></div>
                {preferredProgram && <p className="small-note">Opportunity to review: <strong>{preferredProgram.title}</strong>. Fit will be assessed using your answers and available sources.</p>}
                <div className="field-row"><Field label="Team and experience" name="team" value={profile.team} onChange={update} placeholder="Who is involved and what they contribute" optional /><Field label="Project license" name="license" value={profile.license} onChange={update} placeholder="e.g. MIT, or not decided yet" optional /></div>
                <div className="field-row"><Field label="Users or validation" name="users" value={profile.users} onChange={update} placeholder="Real information; no users yet is a valid answer" optional /><Field label="Country of residence" name="country" value={profile.country} onChange={update} placeholder="Used to review eligibility" optional /></div>
                <Field label="Requested budget in USD" name="budgetUsd" value={profile.budgetUsd} onChange={update} placeholder="e.g. 3000; leave blank if not decided" optional />
                <Field label="Deliverables and milestones" name="milestones" value={profile.milestones} onChange={update} multiline placeholder="What you can deliver and when" optional />
                <Field label="What does it contribute to the community?" name="publicBenefit" value={profile.publicBenefit} onChange={update} multiline placeholder="Which parts others could reuse or benefit from" optional />
                <Field label="How would you use Solana?" name="solanaUse" value={profile.solanaUse} onChange={update} multiline placeholder="The specific function that needs this network" optional />
                <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed these answers. Empty fields must remain unknown, without invented information.</span></label>
              </>}
              <div className="form-actions">{step > 0 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Back</button>}<span className="small-note">{step === 2 ? 'The initial preview is free' : `Step ${step + 1} of 3 in your profile`}</span><button className="button primary" type="submit" disabled={busy || step === 0 && (!profile.projectName.trim() || !profile.description.trim() || !profile.audience.trim()) || step === 2 && !confirmed}>{busy ? 'Preparing…' : step === 2 ? 'Prepare diagnostic' : 'Continue'}<Icon name="arrow" size={16} /></button></div>
            </form>
          </section>
          <aside className="right-rail"><div className="guide-card"><div className="guide-orbit"><Icon name="spark" size={28} /></div><Badge tone="green">FROM IDEA TO NEXT STEP</Badge><h2>A path that starts with your project.</h2><p>Compare what you build with opportunity requirements. Review the facts and decide how to move forward.</p><div className="guide-item"><span>01</span><div><strong>A clear profile</strong><p>Problem, team and stage.</p></div></div><div className="guide-item"><span>02</span><div><strong>Visible evidence</strong><p>Sources and review limits.</p></div></div><div className="guide-item"><span>03</span><div><strong>A useful draft</strong><p>Plan, milestones and editable application.</p></div></div></div>{demos.length > 0 && <div className="demo-card"><span className="eyebrow">WANT TO EXPLORE FIRST?</span><h3>Try an example project</h3><p>Simulated data, selected by you.</p>{demos.map(demo => <button key={demo.id} onClick={() => useDemo(demo)}><span><strong>{demo.name}</strong><small>{demo.summary}</small></span><Icon name="arrow" size={16} /></button>)}</div>}</aside>
        </div>}
        {step === 3 && diagnostic && <>
          {isAnalyzing ? <div className="card loading-card" role="status"><span className="spinner" /><h2>Reviewing your project</h2><p>{isPublicDemo ? 'Preparing your local profile and comparing demo catalog requirements.' : 'Pinning sources, identifying references and comparing requirements.'}</p></div> : <div className="content-grid diagnosis-grid"><div className="main-column">
            <section className="card"><div className="card-heading"><span className="section-icon"><Icon name="spark" /></span><div><h2>{diagnostic.profile.projectName}</h2><p>Profile · revision {diagnostic.revision}</p></div><Badge tone={diagnostic.state === 'partial' ? 'amber' : 'green'}>{diagnostic.state === 'partial' ? 'Partial coverage' : diagnostic.state === 'failed' ? 'Incomplete review' : 'Preview ready'}</Badge></div><p className="project-description">{diagnostic.profile.description}</p><div className="profile-tags"><Badge>{labels[diagnostic.profile.stage]}</Badge><Badge>For: {diagnostic.profile.audience}</Badge><Badge>Target: {diagnostic.profile.targetChain}</Badge></div>{diagnostic.error && <p className="inline-note amber">{diagnostic.error}</p>}
              <div className="subsection"><div className="section-title"><h3>What we found</h3><span>{diagnostic.evidence.length} references</span></div><div className="evidence-list">{diagnostic.evidence.slice(0, 7).map(item => <button key={item.id} onClick={() => setEvidenceFocus(item.id)}><span className={`evidence-dot ${item.provenance}`} /><span><strong>{item.claim}</strong><small>{labels[item.provenance]}{item.file ? ` · ${item.file}${item.line ? `:${item.line}` : ''}` : ''}</small></span><Icon name="arrow" size={14} /></button>)}{!diagnostic.evidence.length && <p className="muted">No verifiable observations yet. The profile relies on your declarations.</p>}</div><p className="small-note">A dependency does not prove a working integration.</p></div>
              {diagnostic.questions.length > 0 && <div className="subsection"><h3>Needs confirmation</h3><ul className="questions-list">{diagnostic.questions.map(item => <li key={item.field}>{item.question}</li>)}</ul><button className="text-button" onClick={() => { setProfile(diagnostic.profile); setStep(2); setConfirmed(false); }}>Complete or correct my answers <Icon name="arrow" size={14} /></button></div>}
            </section>
            <section className="card"><div className="section-title"><h2>Explore your opportunities</h2><Badge>Solana</Badge></div><p className="muted">Choose an opportunity for your plan and draft. Fit may still depend on unanswered questions.</p>{unsupported && <p className="inline-note amber">The target network is not covered yet. Your interest is saved; you can switch your target to Solana.</p>}<div className="opportunity-list">{diagnostic.opportunities.map(item => <label className={`opportunity ${selectedOpportunity === item.id ? 'selected' : ''}`} key={item.id}><input type="radio" name="opportunity" checked={selectedOpportunity === item.id} onChange={() => setSelectedOpportunity(item.id)} disabled={unsupported || ['incompatible', 'closed', 'paused', 'unverified'].includes(item.status)} /><div className="opportunity-top"><span className="radio-dot" /><Badge tone="purple">{labels[item.kind] || item.kind}</Badge><span className={`opportunity-status ${item.status}`}>{item.status === 'possible' ? 'Possible fit' : item.status === 'pending' ? 'To confirm' : labels[item.status] || item.status}</span></div><h3>{item.title}</h3><p className="opportunity-description">{item.description}</p><p className="reward">{item.reward}</p><div className="opportunity-dates"><span>{item.deadline ? `Deadline: ${formatDate(item.deadline)} · Santiago` : 'No published deadline'}</span><span>{isPublicDemo ? 'Catalog snapshot' : 'Listing reviewed'}: {formatReviewDate(item.verifiedOn)}</span></div><div className="criterion-tags">{item.criteria.map(criterion => <span key={criterion.id} className={criterion.status} title={criterion.reason}>{criterion.status === 'incompatible' ? '×' : '○'} {criterion.label}</span>)}</div><a className="source-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>Read official requirements ↗</a></label>)}{!diagnostic.opportunities.length && <p className="inline-note amber">No listings can be recommended with this coverage. Complete your profile or check official sources.</p>}</div><div className="form-actions"><span className="small-note">Up to 3 opportunities explained in your report</span><button className="button primary" onClick={() => void createReport()} disabled={busy || !canPrepare}>{busy ? 'Preparing…' : 'Prepare my report'}<Icon name="arrow" size={16} /></button></div></section>
          </div><aside className="right-rail"><Coverage coverage={diagnostic.coverage} /><div className="quiet-card"><Icon name="file" /><h3>From here to an application</h3><p>Your full report includes a diagnostic, requirements, next steps and an editable draft.</p><div className="price-tag">{isPublicDemo ? <><span>Free access · demo</span></> : <>0.01 <span>USDC · devnet</span></>}</div><p className="small-note">{isPublicDemo ? 'The public journey uses a local template. The repository backend reproduces the HTTP x402 flow.' : 'We prepare and validate it first; then you choose whether to access it.'}</p></div>{diagnostic.reports.length > 0 && <div className="demo-card"><h3>Reports from this review</h3>{diagnostic.reports.map(item => <button key={item.id} onClick={() => { setSelectedReport(item); setReport(null); setStep(4); }}><span><strong>{item.paid ? 'Report available' : item.state === 'preparing' ? 'Preparing report' : item.state === 'failed' ? 'Incomplete report' : 'Report prepared'}</strong><small>{item.id.slice(0, 12)}</small></span><Icon name="arrow" size={15} /></button>)}</div>}</aside></div>}
        </>}
        {step === 4 && selectedReport && <>
          {selectedReport.state === 'preparing' ? <div className="card loading-card" role="status"><span className="spinner" /><h2>Preparing an evidence-backed report</h2><p>Connecting facts, requirements and next steps. {isPublicDemo ? 'Demo access is free. No signatures or payments are requested.' : 'No payment is requested during preparation.'}</p></div> : selectedReport.state === 'failed' ? <div className="card"><h2>This report needs a review</h2><p className="inline-note amber">{selectedReport.error || 'The content could not be validated. It cannot be offered for payment.'}</p><button className="button secondary" onClick={() => setStep(3)}>Back to diagnostic</button></div> : !report ? <div className="content-grid"><section className="card unlock-card"><div className="report-cover"><span className="eyebrow">YOUR PROJECT REPORT</span><Icon name="file" size={44} /><h2>{profile.projectName}</h2><p>From evidence to an action plan.</p><div className="cover-lines"><i /><i /><i /></div><Badge tone="green">Prepared and validated</Badge></div><div className="unlock-body"><h2>Prepare your next step</h2><ul><li><Icon name="check" size={16} /> {isPublicDemo ? 'Demo diagnostic and references' : 'Explained diagnostic and verifiable sources'}</li><li><Icon name="check" size={16} /> Up to 3 opportunities and their requirements</li><li><Icon name="check" size={16} /> Work plan and editable draft</li><li><Icon name="check" size={16} /> Downloads and access in this session</li></ul><div className="purchase-price">{isPublicDemo ? <><strong className="demo-access">Free access</strong><Badge tone="purple">Public demo</Badge></> : <><strong>0.01 <span>USDC</span></strong><Badge>Solana devnet</Badge></>}</div>{health?.mode === 'devnet' && <label className="field"><span>Your desktop wallet</span><select value={walletName} onChange={event => setWalletName(event.target.value)}><option value="">Select a wallet</option>{wallets.map(wallet => <option key={wallet.name} value={wallet.name}>{wallet.name}</option>)}</select>{!wallets.length && <small>No compatible wallet detected. Open this page in a browser with a Solana Wallet Standard wallet.</small>}</label>}{paymentUncertain ? <div className="inline-note amber"><strong>The payment status needs reconciliation.</strong><p>No further signature will be requested. Reload to check whether the report is available.</p><button className="text-button" onClick={() => { window.location.reload(); }}>Check status</button></div> : <button className="button primary full" disabled={busy || !health || health.mode === 'devnet' && !walletName} onClick={() => void pay()}><Icon name={isPublicDemo ? 'file' : 'wallet'} size={17} />{busy ? 'Processing…' : health?.mode === 'public-demo' ? 'View demo report' : health?.mode === 'local-fixture' ? 'Unlock with simulated payment' : 'Pay 0.01 USDC on devnet'}</button>}<p className="small-note">{health?.mode === 'public-demo' ? 'No wallet, signatures or transactions. This step demonstrates the journey, not an on-chain x402 payment.' : <>{health?.mode === 'local-fixture' ? 'The demo does not sign or broadcast transactions.' : 'You sign from your wallet. Ruta Builder does not custody your keys.'} Retries and downloads do not charge again for this report.</>}</p></div></section><aside className="right-rail"><Coverage coverage={diagnostic?.coverage} /><div className="quiet-card"><h3>You make the final decision.</h3><p>The diagnostic provides guidance. The program decides eligibility and funding; review your draft before submitting.</p></div></aside></div> : <div className="content-grid paid-grid"><div className="main-column"><section className="card report-intro"><div className="section-title"><Badge tone="green">Report available</Badge><span className="small-note">Revision {report.revision} · {formatDate(report.createdAt)}</span></div><h2>{report.title}</h2><Statement statement={report.content.summary} evidence={report.evidence} onEvidence={setEvidenceFocus} /><div className="report-actions"><button className="button secondary" onClick={() => download('ruta-builder-report.json', JSON.stringify(report, null, 2), 'application/json')}><Icon name="download" size={16} />Original report JSON</button><button className="button secondary" onClick={exportDraft}><Icon name="download" size={16} />Markdown draft</button></div>{report.ai.mode === 'fixture' && <p className="inline-note purple">Report prepared with a deterministic template, without a real AI call. Review declarations and missing information before submitting.</p>}</section><section className="card"><span className="eyebrow">01 · DIAGNOSTIC</span><h2>Where you are today</h2><div className="diagnosis-statements">{report.content.diagnosis.map((item, index) => <Statement key={index} statement={item} evidence={report.evidence} onEvidence={setEvidenceFocus} />)}</div></section><section className="card"><span className="eyebrow">02 · OPPORTUNITIES</span><h2>Why they could fit</h2>{report.opportunities.map(match => <div className="report-opportunity" key={match.opportunity.id}><div className="section-title"><h3>{match.opportunity.title}</h3><Badge tone="purple">{labels[match.opportunity.kind]}</Badge></div><p>{match.opportunity.description}</p><ul className="criteria-detail">{match.criteria.map(criterion => <li key={criterion.id}><Badge tone={criterion.status === 'matched' ? 'green' : 'amber'}>{labels[criterion.status]}</Badge><div><strong>{criterion.label}</strong><p>{criterion.reason}</p>{criterion.evidenceIds.map(id => <button className="evidence-reference" key={id} onClick={() => setEvidenceFocus(id)}>{id}</button>)}</div></li>)}</ul><a className="source-link" href={match.opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">Review official source ↗</a><p className="small-note">{isPublicDemo ? 'Catalog snapshot' : 'Listing verified'}: {match.opportunity.verifiedOn}{match.opportunity.deadline ? ` · Deadline: ${formatDate(match.opportunity.deadline)}` : ''}</p></div>)}</section><section className="card"><span className="eyebrow">03 · YOUR PLAN</span><h2>Practical next steps</h2><div className="next-steps">{report.content.nextSteps.map((item, index) => <div className="next-step" key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><Statement statement={item.detail} evidence={report.evidence} onEvidence={setEvidenceFocus} /></div></div>)}</div></section><section className="card"><div className="section-title"><div><span className="eyebrow">04 · YOUR APPLICATION</span><h2>A draft to make your own</h2></div><Badge>Editable</Badge></div><p className="muted">For {report.selectedOpportunity.title}. Your changes are saved in this browser as your edits. The original report is preserved.</p><div className="application-editor">{report.content.application.map(section => <label className="field" key={section.heading}><span>{section.heading}{Object.hasOwn(edits, section.heading) && <Badge tone="purple">Edited by you</Badge>}</span><textarea value={edits[section.heading] ?? section.content.text} onChange={event => editSection(section.heading, event.target.value)} rows={4} /><small>{section.content.evidenceIds.length ? `Original text evidence: ${section.content.evidenceIds.join(', ')}` : 'Review and complete with your actual information.'}</small></label>)}</div><div className="form-actions"><span className="small-note">You review and submit the application.</span><button className="button primary" onClick={exportDraft}><Icon name="download" size={16} />Download draft</button></div></section></div><aside className="right-rail"><Coverage coverage={report.coverage} /><AiCoverage report={report} /><div className="quiet-card"><Icon name="file" /><h3>One report, one version</h3><p>This package preserves the profile, sources and catalog used. Download it again from this session.</p><dl className="report-metadata"><dt>Target network</dt><dd>{report.profile.targetChain}</dd><dt>Catalog</dt><dd>{report.catalogVersion}</dd><dt>Reference</dt><dd>{report.inputsHash.slice(0, 16)}…</dd></dl></div><div className="quiet-card"><h3>Information to review carefully</h3><p>Review every claim about users, budget and milestones. Complete missing fields with your own evidence.</p></div></aside></div>}
        </>}
        {!health && !error && <p className="muted" role="status">Connecting to your workspace…</p>}
        <footer className="page-footer"><span>Ruta Builder · Guidance with evidence</span><a href={repositoryUrl} target="_blank" rel="noopener noreferrer">Source code · MIT ↗</a><span>{isPublicDemo ? 'Journey demo, without transactions.' : 'Your team reviews and decides.'}</span></footer>
      </main>
    </div>
    {focusedEvidence && <div className="modal-backdrop" onClick={() => setEvidenceFocus(null)}><section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title" onClick={event => event.stopPropagation()}><div className="section-title"><Badge tone={focusedEvidence.provenance === 'observed' ? 'green' : 'purple'}>{labels[focusedEvidence.provenance]}</Badge><button className="close-button" onClick={() => setEvidenceFocus(null)} aria-label="Close evidence">×</button></div><h2 id="evidence-title">{focusedEvidence.claim}</h2><blockquote>{focusedEvidence.excerpt}</blockquote><dl><dt>Reference</dt><dd>{focusedEvidence.id}</dd>{focusedEvidence.file && <><dt>File</dt><dd>{focusedEvidence.file}{focusedEvidence.line ? `:${focusedEvidence.line}` : ''}</dd></>}{focusedEvidence.commit && <><dt>Commit</dt><dd className="break-all">{focusedEvidence.commit}</dd></>}<dt>Reviewed</dt><dd>{formatDate(focusedEvidence.observedAt)}</dd></dl>{/^https?:/.test(focusedEvidence.url) && <a className="button secondary" href={focusedEvidence.url} target="_blank" rel="noopener noreferrer">View source <Icon name="arrow" size={16} /></a>}</section></div>}
  </div>;
}

function AiCoverage({ report }: { report: CoachReport }) {
  const { contextEvidenceCount, totalEvidenceCount, contextBytes } = report.ai;
  if (contextEvidenceCount === undefined || totalEvidenceCount === undefined) return null;
  const partial = contextEvidenceCount < totalEvidenceCount;
  return <div className="quiet-card ai-coverage"><div className="section-title"><h3>Analysis context</h3><Badge tone={partial ? 'amber' : 'green'}>{partial ? 'Partial' : 'Within scope'}</Badge></div><p>{report.ai.mode === 'fixture' ? 'The simulated case used' : 'The AI received'} <strong>{contextEvidenceCount} of {totalEvidenceCount} references</strong> in the report.</p>{contextBytes !== undefined && <p className="small-note">Context text: {new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(contextBytes / 1000)} kB.</p>}{partial && <p>Other references remain in the original package for separate review; they were outside the model context.</p>}</div>;
}

function Coverage({ coverage }: { coverage?: SourceInspection['coverage'] }) {
  if (!coverage) return null;
  return <div className="coverage-card"><div className="section-title"><h3>Review coverage</h3><span className={`coverage-dot ${coverage.complete ? 'complete' : ''}`} /></div><p>Understand the scope before interpreting results.</p><div className="coverage-counts"><div><strong>{coverage.inspected.length}</strong><span>Inspected</span></div><div><strong>{coverage.omitted.length + coverage.failures.length}</strong><span>Outside scope</span></div></div>{coverage.inspected.length > 0 && <details><summary>Inspected sources</summary><ul>{coverage.inspected.map((item, index) => <li key={index}>{item.file || item.url}</li>)}</ul></details>}{coverage.omitted.length + coverage.failures.length > 0 && <details open><summary>Omissions and limits</summary><ul>{[...coverage.omitted, ...coverage.failures].map((item, index) => <li key={index}><strong>{item.file || item.url || 'Source unavailable'}</strong><span>{item.reason}</span></li>)}</ul></details>}<p className="small-note">{coverage.complete ? 'Complete within the limits of this review.' : 'Partial coverage: some information could not be inspected.'} Does not verify actual usage or spending.</p></div>;
}

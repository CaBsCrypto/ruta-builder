import { emptyProfile, type CoachProfile, type SourceInspection } from '../../src/coach/types.js';

const at = '2026-10-11T12:00:00.000Z';
const commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export interface CoachProjectFixture { id: string; title: string; profile: CoachProfile; inspection: SourceInspection }

function inspection(id: string, files: { file: string; text: string; category: 'dependency' | 'documentation' | 'code_reference'; claim: string }[]): SourceInspection {
  const documents = files.map((file, index) => ({ id: `${id}:document:${index}`, title: file.file, url: `fixture://projects/${id}/${file.file}`, text: file.text, observedAt: at, file: file.file, commit }));
  return {
    documents,
    evidence: files.map((file, index) => ({ id: `${id}:observed:${index}`, category: file.category, provenance: 'observed', claim: `Fixture: ${file.claim}`, excerpt: file.text, url: documents[index].url, file: file.file, line: 1, commit, observedAt: at })),
    coverage: { complete: true, inspected: documents.map(document => ({ url: document.url, file: document.file })), omitted: [], failures: [] },
    repositoryCommit: commit, metrics: { requests: 0, bytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.text), 0), elapsedMs: 0 },
  };
}

/** Synthetic, repository-shaped examples. No actual website, repository or integration was verified. */
export const coachProjects: CoachProjectFixture[] = [
  {
    id: 'grantflow', title: 'GrantFlow · rendiciones USDC (fixture)',
    profile: { ...emptyProfile(), projectName: 'GrantFlow (fixture)', description: 'Ayudar a comunidades a comparar microgrants previstos con transferencias USDC observadas.', audience: 'Responsables de comunidades Solana', stage: 'prototype', currentChain: 'solana',
      team: 'Dos builders en este ejemplo sintético.', license: 'MIT propuesta por el equipo del ejemplo.', users: 'Sin usuarios reales: ejemplo sintético.', publicBenefit: 'Reconciliador reutilizable y reportes gratuitos para comunidades.',
      solanaUse: 'Reconciliación de transferencias USDC; cobro x402 en devnet aún sin liquidación real validada.', milestones: 'Importación, revisión de pagos, exportaciones y demo reproducible.' },
    inspection: inspection('grantflow', [
      { file: 'README.md', text: '# GrantFlow\nSynthetic microgrant reporting example.\nDemo payments are simulated.', category: 'documentation', claim: 'README describe rendiciones de microgrants y pagos simulados.' },
      { file: 'package.json', text: '{"dependencies":{"@solana/kit":"5.5.1","@x402/svm":"2.28.0"}}', category: 'dependency', claim: 'El manifiesto lista @solana/kit y @x402/svm; no prueba integración funcional.' },
    ]),
  },
  {
    id: 'wallet-alerts', title: 'Wallet Alerts · idea de notificaciones (fixture)',
    profile: { ...emptyProfile(), projectName: 'Wallet Alerts (fixture)', description: 'Avisar a una comunidad de cambios relevantes en una tesorería.', audience: 'Administradores de tesorerías', stage: 'idea', currentChain: 'ethereum', users: 'Sin usuarios reales: ejemplo sintético.', publicBenefit: 'Alertas básicas gratuitas y documentación pública.' },
    inspection: inspection('wallet-alerts', [
      { file: 'README.md', text: '# Wallet Alerts\nAn idea for treasury notifications. No Solana implementation yet.', category: 'documentation', claim: 'README presenta una idea y declara que aún no hay implementación Solana.' },
      { file: 'package.json', text: '{"dependencies":{"viem":"2.0.0"}}', category: 'dependency', claim: 'El manifiesto lista viem; no acredita actividad ni costes de consumo.' },
    ]),
  },
  {
    id: 'public-sdk', title: 'Public SDK · herramienta abierta (fixture)',
    profile: { ...emptyProfile(), projectName: 'Public SDK (fixture)', description: 'Facilitar a builders consultas de transferencias con evidencia trazable.', audience: 'Desarrolladores de herramientas comunitarias', stage: 'prototype', currentChain: 'solana', team: 'Builder individual de ejemplo.', license: 'Apache-2.0 declarada para este ejemplo.', users: 'Sin usuarios reales: ejemplo sintético.', publicBenefit: 'SDK abierto y ejemplos públicos reutilizables.', solanaUse: 'Consultas RPC de Solana para interpretar instrucciones SPL Token.', milestones: 'Documentar cobertura, probar datos incompletos y preparar ejemplos.' },
    inspection: inspection('public-sdk', [
      { file: 'README.md', text: '# Public SDK\nSynthetic public SDK for RPC transfer inspection.', category: 'documentation', claim: 'README describe un SDK para inspección RPC de transferencias.' },
      { file: 'src/client.ts', text: 'const method = "getTransaction";\nexport { method };', category: 'code_reference', claim: 'El archivo referencia getTransaction; no demuestra solicitudes ni consumo real.' },
    ]),
  },
];
export const fixtureProjects = coachProjects;

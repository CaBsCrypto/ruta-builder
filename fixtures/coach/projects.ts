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
    id: 'grantflow', title: 'GrantFlow · USDC reporting (fixture)',
    profile: { ...emptyProfile(), projectName: 'GrantFlow (fixture)', description: 'Help communities compare planned microgrants with observed USDC transfers.', audience: 'Solana community organizers', stage: 'prototype', currentChain: 'solana',
      team: 'Two builders in this synthetic example.', license: 'MIT proposed by the example team.', users: 'No real users: synthetic example.', publicBenefit: 'Reusable reconciler and free community reports.',
      solanaUse: 'Reconcile USDC transfers; x402 devnet charging without validated real settlement.', milestones: 'Import, payment review, exports and a reproducible demo.' },
    inspection: inspection('grantflow', [
      { file: 'README.md', text: '# GrantFlow\nSynthetic microgrant reporting example.\nDemo payments are simulated.', category: 'documentation', claim: 'README describes microgrant reporting and simulated payments.' },
      { file: 'package.json', text: '{"dependencies":{"@solana/kit":"5.5.1","@x402/svm":"2.28.0"}}', category: 'dependency', claim: 'Manifest lists @solana/kit and @x402/svm; this does not prove a functional integration.' },
    ]),
  },
  {
    id: 'wallet-alerts', title: 'Wallet Alerts · notification idea (fixture)',
    profile: { ...emptyProfile(), projectName: 'Wallet Alerts (fixture)', description: 'Notify a community about relevant changes in a treasury.', audience: 'Treasury administrators', stage: 'idea', currentChain: 'ethereum', users: 'No real users: synthetic example.', publicBenefit: 'Free basic alerts and public documentation.' },
    inspection: inspection('wallet-alerts', [
      { file: 'README.md', text: '# Wallet Alerts\nAn idea for treasury notifications. No Solana implementation yet.', category: 'documentation', claim: 'README presents an idea and declares no Solana implementation yet.' },
      { file: 'package.json', text: '{"dependencies":{"viem":"2.0.0"}}', category: 'dependency', claim: 'Manifest lists viem; this does not establish activity or actual usage costs.' },
    ]),
  },
  {
    id: 'public-sdk', title: 'Public SDK · open tool (fixture)',
    profile: { ...emptyProfile(), projectName: 'Public SDK (fixture)', description: 'Help builders query transfers with traceable evidence.', audience: 'Developers of community tools', stage: 'prototype', currentChain: 'solana', team: 'Example solo builder.', license: 'Apache-2.0 declared for this example.', users: 'No real users: synthetic example.', publicBenefit: 'Open SDK and reusable public examples.', solanaUse: 'Solana RPC queries to interpret SPL Token instructions.', milestones: 'Document coverage, test incomplete data and prepare examples.' },
    inspection: inspection('public-sdk', [
      { file: 'README.md', text: '# Public SDK\nSynthetic public SDK for RPC transfer inspection.', category: 'documentation', claim: 'README describes an SDK for RPC transfer inspection.' },
      { file: 'src/client.ts', text: 'const method = "getTransaction";\nexport { method };', category: 'code_reference', claim: 'File references getTransaction; this does not prove requests or actual usage.' },
    ]),
  },
];
export const fixtureProjects = coachProjects;

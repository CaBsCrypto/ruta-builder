export const PROFILE_FIELDS = ['projectName', 'description', 'audience', 'stage', 'currentChain', 'targetChain', 'websiteUrl', 'repositoryUrl', 'team', 'license', 'users', 'country', 'budgetUsd', 'milestones', 'publicBenefit', 'solanaUse'] as const;
export type ProfileField = typeof PROFILE_FIELDS[number];
export type CoachProfile = Record<ProfileField, string>;
export type Provenance = 'observed' | 'declared' | 'inferred';
export interface Evidence {
  id: string;
  category: 'documentation' | 'dependency' | 'code_reference' | 'service' | 'license' | 'infrastructure' | 'profile';
  provenance: Provenance;
  claim: string;
  excerpt: string;
  url: string;
  file?: string;
  line?: number;
  commit?: string;
  observedAt: string;
}
export interface SourceDocument {
  id: string; url: string; title: string; text: string; observedAt: string;
  file?: string; commit?: string;
}
export interface CoverageEntry { url: string; reason?: string; file?: string }
export interface SourceInspection {
  documents: SourceDocument[];
  evidence: Evidence[];
  coverage: { complete: boolean; inspected: CoverageEntry[]; omitted: CoverageEntry[]; failures: CoverageEntry[] };
  repositoryCommit?: string;
  metrics: { requests: number; bytes: number; elapsedMs: number };
}
export type OpportunityKind = 'grant' | 'prize' | 'accelerator' | 'credits';
export interface OpportunityCriterion {
  id: string; label: string; field: ProfileField; allowed?: string[];
}
export interface Opportunity {
  id: string; title: string; ecosystem: string; kind: OpportunityKind;
  status: 'active' | 'closed' | 'paused' | 'unverified';
  deadline: string | null; verifiedOn: string; sourceUrl: string;
  reward: string; description: string; criteria: OpportunityCriterion[];
}
export interface CriterionMatch {
  id: string; label: string; status: 'matched' | 'missing' | 'incompatible';
  reason: string; evidenceIds: string[];
}
export interface OpportunityMatch {
  opportunity: Opportunity; status: 'possible' | 'pending' | 'incompatible'; criteria: CriterionMatch[];
}
export interface ReportStatement {
  text: string; evidenceIds: string[]; kind: 'fact' | 'proposal' | 'unknown';
  needsConfirmation: boolean;
}
export interface GeneratedCoachContent {
  summary: ReportStatement;
  diagnosis: ReportStatement[];
  nextSteps: { title: string; detail: ReportStatement }[];
  application: { heading: string; content: ReportStatement }[];
}
export interface AiTelemetry {
  mode: 'fixture' | 'live'; model: string; calls: number;
  inputTokens: number; outputTokens: number; elapsedMs: number;
  contextEvidenceCount?: number; totalEvidenceCount?: number; contextBytes?: number;
}
export interface CoachReport {
  schemaVersion: 'builder-coach-report/v1';
  id: string; diagnosticId: string; revision: number; createdAt: string;
  inputsHash: string; catalogVersion: string; title: string;
  profile: CoachProfile; evidence: Evidence[]; coverage: SourceInspection['coverage'];
  opportunities: OpportunityMatch[]; selectedOpportunity: Opportunity;
  content: GeneratedCoachContent; ai: AiTelemetry;
}
export interface Diagnostic {
  id: string; ownerId: string; revision: number; createdAt: string; updatedAt: string;
  state: 'analyzing' | 'ready' | 'partial' | 'failed';
  preferredOpportunityId?: string;
  profile: CoachProfile; inspection: SourceInspection; evidence: Evidence[];
  matches: OpportunityMatch[]; questions: { field: ProfileField; question: string }[];
  catalogVersion: string; error?: string;
}
export interface ReportRecord {
  id: string; ownerId: string; diagnosticId: string; revision: number;
  state: 'preparing' | 'ready' | 'failed'; createdAt: string; inputsHash: string;
  selectedOpportunityId: string; content: CoachReport | null;
  error?: string;
}
export function emptyProfile(): CoachProfile {
  return Object.fromEntries(PROFILE_FIELDS.map(field => [field, field === 'targetChain' ? 'solana' : field === 'stage' ? 'idea' : ''])) as CoachProfile;
}

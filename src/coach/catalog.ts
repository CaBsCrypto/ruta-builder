import { readFileSync } from 'node:fs';
import type { CoachProfile, Evidence, Opportunity, OpportunityMatch, ProfileField } from './types.js';

const seed = JSON.parse(readFileSync(new URL('../../research/coach-catalog.json', import.meta.url), 'utf8')) as { version: string; freshnessDays: number; opportunities: Opportunity[] };
export const CATALOG_VERSION = seed.version;
export const CATALOG_FRESHNESS_DAYS = seed.freshnessDays;
export const catalog: Opportunity[] = seed.opportunities;

const labels: Partial<Record<ProfileField, string>> = {
  projectName: 'Project', description: 'Description', audience: 'Target users', stage: 'Stage', currentChain: 'Current network', targetChain: 'Target network',
  team: 'Team', license: 'License', users: 'Current users', country: 'Country', budgetUsd: 'Budget USD', milestones: 'Milestones', publicBenefit: 'Public benefit', solanaUse: 'Solana use',
};

export function declaredEvidence(profile: CoachProfile, now = new Date()): Evidence[] {
  return Object.entries(labels).flatMap(([field, label]) => {
    const value = profile[field as ProfileField]?.trim();
    return value ? [{ id: `declared:${field}`, category: 'profile' as const, provenance: 'declared' as const,
      claim: `${label} declared: ${value}`, excerpt: value, url: `builder://profile/${field}`, observedAt: now.toISOString() }] : [];
  });
}

export function availableOpportunities(options: { now?: Date; ecosystem?: string; catalog?: Opportunity[] } = {}): Opportunity[] {
  const now = (options.now ?? new Date()).getTime();
  const ecosystem = (options.ecosystem ?? 'solana').trim().toLowerCase();
  return (options.catalog ?? catalog).filter(opportunity => {
    const verified = Date.parse(`${opportunity.verifiedOn}T00:00:00Z`);
    const deadline = opportunity.deadline === null ? Infinity : Date.parse(opportunity.deadline);
    return opportunity.ecosystem === ecosystem && opportunity.status === 'active'
      && Number.isFinite(verified) && verified <= now && now - verified <= CATALOG_FRESHNESS_DAYS * 86_400_000
      && deadline > now;
  });
}

export function evaluateOpportunities(profile: CoachProfile, evidence: Evidence[], options: { now?: Date; catalog?: Opportunity[]; preferredOpportunityId?: string } = {}): OpportunityMatch[] {
  if (profile.targetChain.trim().toLowerCase() !== 'solana') return [];
  return availableOpportunities({ now: options.now, ecosystem: 'solana', catalog: options.catalog }).map(opportunity => {
    const criteria = opportunity.criteria.map(criterion => {
      const value = profile[criterion.field]?.trim() ?? '';
      const refs = evidence.filter(item => item.id === `declared:${criterion.field}`).map(item => item.id);
      if (!value) return { id: criterion.id, label: criterion.label, status: 'missing' as const,
        reason: 'Missing information. Not inferred from the repository, time zone or other answers.', evidenceIds: [] };
      if (criterion.allowed && !criterion.allowed.some(allowed => allowed.toLowerCase() === value.toLowerCase())) {
        return { id: criterion.id, label: criterion.label, status: 'incompatible' as const,
          reason: `Declared information does not match this requirement (${criterion.allowed.join(', ')}).`, evidenceIds: refs };
      }
      if (/functional|integration|demonstrable|demo|repository.*(?:submission|ready)|funcional|integraci[oó]n|demostrable|repositorio.*(?:entrega|preparado)/i.test(criterion.label)) {
        return { id: criterion.id, label: criterion.label, status: 'missing' as const,
          reason: 'Human review pending: declarations and static inspection do not prove a working demo or integration. Installing an SDK does not prove it either.', evidenceIds: refs };
      }
      return { id: criterion.id, label: criterion.label, status: 'matched' as const,
        reason: 'Declared information compatible with the listing guidance; confirmation is required and this does not establish eligibility or selection.', evidenceIds: refs };
    });
    const status = criteria.some(item => item.status === 'incompatible') ? 'incompatible' : criteria.some(item => item.status === 'missing') ? 'pending' : 'possible';
    return { opportunity, status, criteria } satisfies OpportunityMatch;
  }).filter(item => item.status !== 'incompatible').sort((a, b) => {
    const missing = (match: OpportunityMatch) => match.criteria.filter(item => item.status === 'missing').length;
    // A declared public offering/open license gives standard grants review priority, not eligibility.
    const publicOffering = Boolean(profile.publicBenefit.trim()) && /\b(?:MIT|Apache(?:-2\.0)?|GPL|BSD|MPL|c[oó]digo abierto|open source)\b/i.test(profile.license);
    const reviewPriority = (match: OpportunityMatch) => publicOffering && match.opportunity.id === 'solana-foundation-standard' ? -1 : 0;
    const preferred = (match: OpportunityMatch) => match.opportunity.id === options.preferredOpportunityId ? -1 : 0;
    // The builder's selection changes review order only after availability and incompatibilities were checked.
    return preferred(a) - preferred(b) || reviewPriority(a) - reviewPriority(b) || missing(a) - missing(b) || (a.opportunity.deadline ? Date.parse(a.opportunity.deadline) : Infinity) - (b.opportunity.deadline ? Date.parse(b.opportunity.deadline) : Infinity) || a.opportunity.id.localeCompare(b.opportunity.id);
  }).slice(0, 3);
}

const questions: Partial<Record<ProfileField, string>> = {
  projectName: 'What is the project called?', description: 'What problem does it solve and what are you building?', audience: 'Who would use it?',
  team: 'Who is on the team and what does each person do?', license: 'Which license and public components will it have?', users: 'Which real users does it have? If none yet, say so.',
  budgetUsd: 'How much are you requesting in USD and how would you use the funds?', milestones: 'Which measurable milestones can you deliver?',
  publicBenefit: 'What public benefit does it offer other builders or users?', solanaUse: 'How does Solana help achieve the goal and which integration can you demonstrate?',
};
export function buildQuestions(profile: CoachProfile): { field: ProfileField; question: string }[] {
  return Object.entries(questions).filter(([field]) => !profile[field as ProfileField]?.trim()).map(([field, question]) => ({ field: field as ProfileField, question: question! }));
}

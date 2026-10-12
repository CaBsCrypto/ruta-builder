import { readFileSync } from 'node:fs';
import type { CoachProfile, Evidence, Opportunity, OpportunityMatch, ProfileField } from './types.js';

const seed = JSON.parse(readFileSync(new URL('../../research/coach-catalog.json', import.meta.url), 'utf8')) as { version: string; freshnessDays: number; opportunities: Opportunity[] };
export const CATALOG_VERSION = seed.version;
export const CATALOG_FRESHNESS_DAYS = seed.freshnessDays;
export const catalog: Opportunity[] = seed.opportunities;

const labels: Partial<Record<ProfileField, string>> = {
  projectName: 'Proyecto', description: 'Descripción', audience: 'Usuarios objetivo', stage: 'Etapa', currentChain: 'Red actual', targetChain: 'Red objetivo',
  team: 'Equipo', license: 'Licencia', users: 'Usuarios actuales', country: 'País', budgetUsd: 'Presupuesto USD', milestones: 'Hitos', publicBenefit: 'Beneficio público', solanaUse: 'Uso de Solana',
};

export function declaredEvidence(profile: CoachProfile, now = new Date()): Evidence[] {
  return Object.entries(labels).flatMap(([field, label]) => {
    const value = profile[field as ProfileField]?.trim();
    return value ? [{ id: `declared:${field}`, category: 'profile' as const, provenance: 'declared' as const,
      claim: `${label} declarado: ${value}`, excerpt: value, url: `builder://profile/${field}`, observedAt: now.toISOString() }] : [];
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
        reason: 'Dato pendiente. No se infiere del repositorio, horario ni otras respuestas.', evidenceIds: [] };
      if (criterion.allowed && !criterion.allowed.some(allowed => allowed.toLowerCase() === value.toLowerCase())) {
        return { id: criterion.id, label: criterion.label, status: 'incompatible' as const,
          reason: `El dato declarado no coincide con este requisito (${criterion.allowed.join(', ')}).`, evidenceIds: refs };
      }
      if (/funcional|integraci[oó]n|demostrable|demo|repositorio.*(?:entrega|preparado)/i.test(criterion.label)) {
        return { id: criterion.id, label: criterion.label, status: 'missing' as const,
          reason: 'Revisión humana pendiente: la declaración y lectura estática no acreditan una demo ni integración funcionando. Instalar un SDK tampoco lo demuestra.', evidenceIds: refs };
      }
      return { id: criterion.id, label: criterion.label, status: 'matched' as const,
        reason: 'Dato declarado compatible con la orientación de la ficha; requiere confirmación y no acredita elegibilidad ni selección.', evidenceIds: refs };
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
  projectName: '¿Cómo se llama el proyecto?', description: '¿Qué problema resuelve y qué construyes?', audience: '¿Quién lo usaría?',
  team: '¿Quiénes forman el equipo y qué hace cada persona?', license: '¿Qué licencia y partes públicas tendrá?', users: '¿Qué usuarios reales tiene? Si aún no hay, indícalo.',
  budgetUsd: '¿Cuánto solicitas en USD y cómo usarías esos fondos?', milestones: '¿Qué hitos medibles puedes entregar?',
  publicBenefit: '¿Qué beneficio público ofrece para otros builders o usuarios?', solanaUse: '¿Cómo ayuda Solana a lograr el objetivo y qué integración puedes demostrar?',
};
export function buildQuestions(profile: CoachProfile): { field: ProfileField; question: string }[] {
  return Object.entries(questions).filter(([field]) => !profile[field as ProfileField]?.trim()).map(([field, question]) => ({ field: field as ProfileField, question: question! }));
}

import type { Lead } from './types';

const highIntentRoles = [
  'coordinator',
  'manager',
  'director',
  'practice manager',
  'care manager',
  'case manager',
  'clinical coordinator',
  'clinical care manager',
  'clinical lead',
  'discharge planner',
  'discharge coordinator',
  'sil manager',
  'village manager',
  'intake',
  'admissions',
  'partnership',
  'referral',
];

const priorityCategories = new Set([
  'NDIS support coordinator',
  'Home Care Package provider',
  'Retirement village',
  'Aged care provider',
  'SIL provider',
  'Community nursing provider',
  'Hospital discharge planner',
  'Allied health provider',
]);

const highNeedSignals = [
  'elderly',
  'high risk',
  'high-risk',
  'complex',
  'sil',
  'supported independent living',
  'neurological',
  'neuro',
  'abi',
  'acquired brain injury',
  'chronic disease',
  'falls',
  'frequent falls',
  'fall risk',
  'epilepsy',
  'seizure',
  'dementia',
  'cognitive decline',
  'post-discharge',
  'post discharge',
  'hospital discharge',
  'recurrent hospital',
  'hospital presentations',
  'mobility decline',
  'frailty',
  'frail',
  'respiratory disease',
  'copd',
  'cardiovascular disease',
  'heart failure',
  'family involvement',
  'complex support coordination',
  'hospital avoidance',
  'deterioration',
  'wellness monitoring',
  'clinical monitoring',
  'care coordination',
  'family visibility',
  'trend reporting',
  'escalation',
];

const commercialFitSignals = [
  'home care package',
  'hcp',
  'support at home',
  'plan-managed',
  'plan managed',
  'self-managed',
  'self managed',
  'ndis funding',
  'sil',
  'supported independent living',
  'high-needs participants',
  'complex participants',
  'funded nursing',
  'clinical supports',
  'nursing supports',
  'premium',
  'care manager',
  'package clients',
];

const lowFitSignals = [
  'gym',
  'retail',
  'marketing',
  'trade',
  'beauty',
  'cosmetic',
  'not accepting',
  'closed',
  'low cost support',
  'low-cost support',
  'social support only',
];

export function scoreLead(lead: Pick<Lead, 'category' | 'contactRole' | 'email' | 'website' | 'needs' | 'location' | 'notes'> & Partial<Pick<Lead, 'businessNeeds' | 'suitabilitySummary' | 'outreachAngle'>>): number {
  let score = 42;
  const role = lead.contactRole.toLowerCase();
  const notes = [
    lead.notes,
    lead.suitabilitySummary,
    lead.outreachAngle,
    ...(lead.needs ?? []),
    ...(lead.businessNeeds ?? []),
  ].filter(Boolean).join(' ').toLowerCase();

  if (priorityCategories.has(lead.category)) score += 16;
  if (lead.email) score += 12;
  if (lead.website) score += 8;
  if (lead.location) score += 6;
  if (lead.needs.length > 0) score += Math.min(14, lead.needs.length * 5);
  if ((lead.businessNeeds?.length ?? 0) > 0) score += Math.min(10, (lead.businessNeeds?.length ?? 0) * 4);
  if (lead.suitabilitySummary) score += 6;
  if (lead.outreachAngle) score += 4;
  if (highIntentRoles.some((term) => role.includes(term))) score += 14;
  if (notes.includes('referral') || notes.includes('transition')) score += 8;
  score += Math.min(18, highNeedSignals.filter((term) => notes.includes(term)).length * 4);
  score += Math.min(16, commercialFitSignals.filter((term) => notes.includes(term)).length * 4);
  if (lowFitSignals.some((term) => notes.includes(term))) score -= 20;

  return Math.max(5, Math.min(98, score));
}

export function leadScoreOutOfTen(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score / 10)));
}

export function likelihoodLabel(score: number): string {
  if (score >= 80) return 'High';
  if (score >= 62) return 'Promising';
  if (score >= 42) return 'Needs review';
  return 'Low';
}

export function likelihoodClass(score: number): string {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 62) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (score >= 42) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

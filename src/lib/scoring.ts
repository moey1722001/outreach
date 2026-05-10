import type { Lead } from './types';

const highIntentRoles = [
  'coordinator',
  'manager',
  'director',
  'practice manager',
  'care manager',
  'clinical lead',
  'partnership',
  'referral',
];

const priorityCategories = new Set([
  'NDIS support coordinator',
  'Home Care Package provider',
  'Aged care provider',
]);

export function scoreLead(lead: Pick<Lead, 'category' | 'contactRole' | 'email' | 'website' | 'needs' | 'location' | 'notes'> & Partial<Pick<Lead, 'businessNeeds' | 'suitabilitySummary' | 'outreachAngle'>>): number {
  let score = 42;
  const role = lead.contactRole.toLowerCase();
  const notes = lead.notes.toLowerCase();

  if (priorityCategories.has(lead.category)) score += 16;
  if (lead.email) score += 12;
  if (lead.website) score += 8;
  if (lead.location) score += 6;
  if (lead.needs.length > 0) score += Math.min(14, lead.needs.length * 5);
  if ((lead.businessNeeds?.length ?? 0) > 0) score += Math.min(10, (lead.businessNeeds?.length ?? 0) * 4);
  if (lead.suitabilitySummary) score += 6;
  if (lead.outreachAngle) score += 4;
  if (highIntentRoles.some((term) => role.includes(term))) score += 14;
  if (notes.includes('referral') || notes.includes('complex') || notes.includes('transition')) score += 8;
  if (notes.includes('not accepting') || notes.includes('closed')) score -= 20;

  return Math.max(5, Math.min(98, score));
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

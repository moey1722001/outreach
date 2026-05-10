import type { DuplicateMatch, Lead, LeadFormInput } from './types';

function normaliseText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normaliseWebsite(value: string) {
  return normaliseText(value)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function normalisePhone(value: string) {
  return value.replace(/\D/g, '');
}

export function findDuplicateMatches(candidate: Pick<LeadFormInput, 'organisation' | 'email' | 'website' | 'phone'>, leads: Lead[], currentLeadId?: string): DuplicateMatch[] {
  const candidateEmail = normaliseText(candidate.email);
  const candidateOrganisation = normaliseText(candidate.organisation);
  const candidateWebsite = normaliseWebsite(candidate.website);
  const candidatePhone = normalisePhone(candidate.phone);

  return leads
    .filter((lead) => lead.id !== currentLeadId)
    .map((lead) => {
      const matchedOn: DuplicateMatch['matchedOn'] = [];

      if (candidateEmail && normaliseText(lead.email) === candidateEmail) matchedOn.push('email');
      if (candidateOrganisation && normaliseText(lead.organisation) === candidateOrganisation) matchedOn.push('organisation');
      if (candidateWebsite && normaliseWebsite(lead.website) === candidateWebsite) matchedOn.push('website');
      if (candidatePhone && normalisePhone(lead.phone) === candidatePhone) matchedOn.push('phone');

      return {
        leadId: lead.id,
        organisation: lead.organisation,
        matchedOn,
        status: lead.status,
        lastContactedAt: lead.lastContactedAt,
      };
    })
    .filter((match) => match.matchedOn.length > 0);
}

export function hasPriorOutreach(lead: Lead) {
  return Boolean(lead.lastContactedAt || lead.contactHistory.length > 0 || lead.emailHistory.some((email) => email.sentAt));
}

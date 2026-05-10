import { supabase } from './supabase';
import { scoreLead } from './scoring';
import type { ContactEvent, ContactMethod, DraftEmail, EmailRecord, Lead, LeadFormInput, OutreachTone, SearchBrief } from './types';

const STORAGE_KEY = 'paracare-outreach-leads';

const now = () => new Date().toISOString();

const sampleLeads: Lead[] = [
  hydrateLead({
    id: 'lead-ndis-inner-west',
    organisation: 'Inner West Support Coordination',
    category: 'NDIS support coordinator',
    website: 'https://example.org/inner-west-support',
    location: 'Sydney Inner West',
    suburb: 'Marrickville',
    postcode: '2204',
    region: 'Inner West Sydney',
    radiusKm: 12,
    contactName: 'Samantha Lee',
    contactRole: 'Support Coordination Manager',
    email: 'hello@example.org',
    phone: '',
    status: 'qualified',
    likelihood: 86,
    fitSummary: 'Strong referral pathway for participants needing responsive clinical oversight at home.',
    suitabilitySummary: 'Likely suitable because support coordinators regularly need reliable clinical partners for participants with complex home-care needs.',
    businessNeeds: ['Responsive escalation', 'Clear family communication', 'Reliable home nursing availability'],
    servicesOffered: ['NDIS support coordination', 'Participant care planning'],
    concerns: ['Verify current referral pathways and preferred clinical providers.'],
    outreachAngle: 'Position Paracare as a dependable clinical partner for complex participants who need better visibility and escalation.',
    researchConfidence: 72,
    needs: ['Complex disability support', 'Care coordination', 'Family communication'],
    source: 'Demo lead',
    nextAction: 'Review draft and send a short introduction.',
    notes: 'Likely values quick updates, reliable escalation paths, and family visibility.',
    lastContactedAt: null,
    createdAt: now(),
    updatedAt: now(),
  }),
  hydrateLead({
    id: 'lead-hcp-north',
    organisation: 'Northern Home Care Partners',
    category: 'Home Care Package provider',
    website: 'https://example.org/northern-home-care',
    location: 'Northern Beaches',
    suburb: 'Manly',
    postcode: '2095',
    region: 'Northern Beaches',
    radiusKm: 15,
    contactName: 'Daniel Hart',
    contactRole: 'Care Manager',
    email: 'care@example.org',
    phone: '',
    status: 'drafted',
    likelihood: 78,
    fitSummary: 'Good fit for older clients needing nursing, reporting and coordinated follow-up.',
    suitabilitySummary: 'Promising fit for care managers coordinating older clients who need nursing oversight and timely documentation.',
    businessNeeds: ['Medication oversight', 'Incident reporting', 'Coordinated home visits'],
    servicesOffered: ['Home Care Package coordination', 'Care management'],
    concerns: ['Confirm whether they work with external nursing providers.'],
    outreachAngle: 'Lead with Paracare’s clinical documentation, follow-up reliability and family updates.',
    researchConfidence: 68,
    needs: ['Home nursing', 'Medication oversight', 'Incident reporting'],
    source: 'Demo lead',
    nextAction: 'Personalise with local availability and partner review.',
    notes: 'Mention Paracare’s clinical documentation and escalation workflow.',
    lastContactedAt: null,
    createdAt: now(),
    updatedAt: now(),
  }),
];

function hydrateLead(partial: Partial<Lead> & Pick<Lead, 'id' | 'organisation' | 'category'>): Lead {
  const createdAt = partial.createdAt ?? now();
  return {
    id: partial.id,
    organisation: partial.organisation,
    category: partial.category,
    website: partial.website ?? '',
    location: partial.location ?? '',
    suburb: partial.suburb ?? '',
    postcode: partial.postcode ?? '',
    region: partial.region ?? '',
    radiusKm: partial.radiusKm ?? null,
    contactName: partial.contactName ?? '',
    contactRole: partial.contactRole ?? '',
    email: partial.email ?? '',
    phone: partial.phone ?? '',
    status: partial.status ?? 'new',
    likelihood: partial.likelihood ?? 50,
    fitSummary: partial.fitSummary ?? '',
    suitabilitySummary: partial.suitabilitySummary ?? '',
    businessNeeds: partial.businessNeeds ?? [],
    servicesOffered: partial.servicesOffered ?? [],
    concerns: partial.concerns ?? [],
    outreachAngle: partial.outreachAngle ?? '',
    researchConfidence: partial.researchConfidence ?? 0,
    needs: partial.needs ?? [],
    source: partial.source ?? '',
    nextAction: partial.nextAction ?? '',
    notes: partial.notes ?? '',
    lastContactedAt: partial.lastContactedAt ?? null,
    contactedBy: partial.contactedBy ?? '',
    followUpDate: partial.followUpDate ?? '',
    outcome: partial.outcome ?? '',
    contactHistory: partial.contactHistory ?? [],
    emailHistory: partial.emailHistory ?? [],
    createdAt,
    updatedAt: partial.updatedAt ?? createdAt,
  };
}

function fromDb(row: Record<string, unknown>): Lead {
  const contactHistory = ((row.outreach_contact_events as Record<string, unknown>[] | null) ?? []).map(fromContactEventDb);
  const emailHistory = ((row.outreach_email_drafts as Record<string, unknown>[] | null) ?? []).map(fromEmailDb);

  return hydrateLead({
    id: row.id as string,
    organisation: row.organisation as string,
    category: row.category as Lead['category'],
    website: (row.website as string | null) ?? '',
    location: (row.location as string | null) ?? '',
    suburb: (row.suburb as string | null) ?? '',
    postcode: (row.postcode as string | null) ?? '',
    region: (row.region as string | null) ?? '',
    radiusKm: (row.radius_km as number | null) ?? null,
    contactName: (row.contact_name as string | null) ?? '',
    contactRole: (row.contact_role as string | null) ?? '',
    email: (row.email as string | null) ?? '',
    phone: (row.phone as string | null) ?? '',
    status: row.status as Lead['status'],
    likelihood: row.likelihood as number,
    fitSummary: (row.fit_summary as string | null) ?? '',
    suitabilitySummary: (row.suitability_summary as string | null) ?? '',
    businessNeeds: (row.business_needs as string[] | null) ?? [],
    servicesOffered: (row.services_offered as string[] | null) ?? [],
    concerns: (row.concerns as string[] | null) ?? [],
    outreachAngle: (row.outreach_angle as string | null) ?? '',
    researchConfidence: (row.research_confidence as number | null) ?? 0,
    needs: (row.needs as string[] | null) ?? [],
    source: (row.source as string | null) ?? '',
    nextAction: (row.next_action as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    lastContactedAt: (row.last_contacted_at as string | null) ?? null,
    contactedBy: (row.contacted_by as string | null) ?? '',
    followUpDate: (row.follow_up_date as string | null) ?? '',
    outcome: (row.outcome as string | null) ?? '',
    contactHistory,
    emailHistory,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  });
}

function fromContactEventDb(row: Record<string, unknown>): ContactEvent {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    method: row.method as ContactMethod,
    contactedAt: row.contacted_at as string,
    contactedBy: (row.contacted_by as string | null) ?? '',
    emailAddressUsed: (row.email_address_used as string | null) ?? '',
    draftSubject: (row.draft_subject as string | null) ?? '',
    draftBody: (row.draft_body as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    outcome: (row.outcome as string | null) ?? '',
    followUpDate: (row.follow_up_date as string | null) ?? '',
    createdAt: row.created_at as string,
  };
}

function fromEmailDb(row: Record<string, unknown>): EmailRecord {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    subject: row.subject as string,
    body: row.body as string,
    tone: row.tone as OutreachTone,
    generatedAt: (row.generated_at as string | null) ?? (row.created_at as string),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? '',
  };
}

function toDb(lead: Lead) {
  return {
    id: lead.id,
    organisation: lead.organisation,
    category: lead.category,
    website: lead.website || null,
    location: lead.location || null,
    suburb: lead.suburb || null,
    postcode: lead.postcode || null,
    region: lead.region || null,
    radius_km: lead.radiusKm,
    contact_name: lead.contactName || null,
    contact_role: lead.contactRole || null,
    email: lead.email || null,
    phone: lead.phone || null,
    status: lead.status,
    likelihood: lead.likelihood,
    fit_summary: lead.fitSummary || null,
    suitability_summary: lead.suitabilitySummary || null,
    business_needs: lead.businessNeeds,
    services_offered: lead.servicesOffered,
    concerns: lead.concerns,
    outreach_angle: lead.outreachAngle || null,
    research_confidence: lead.researchConfidence,
    needs: lead.needs,
    source: lead.source || null,
    next_action: lead.nextAction || null,
    notes: lead.notes || null,
    last_contacted_at: lead.lastContactedAt,
    contacted_by: lead.contactedBy || null,
    follow_up_date: lead.followUpDate || null,
    outcome: lead.outcome || null,
  };
}

function readLocalLeads(): Lead[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLeads));
    return sampleLeads;
  }

  try {
    return (JSON.parse(stored) as Lead[]).map((lead) => hydrateLead(lead));
  } catch {
    return sampleLeads;
  }
}

function writeLocalLeads(leads: Lead[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function defaultFollowUpDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export async function listLeads(): Promise<Lead[]> {
  if (!supabase) return readLocalLeads();

  const { data, error } = await supabase
    .from('outreach_leads')
    .select('*, outreach_contact_events(*), outreach_email_drafts(*)')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function saveLead(input: LeadFormInput, existingId?: string): Promise<Lead> {
  const timestamp = now();
  const lead = hydrateLead({
    ...input,
    id: existingId ?? crypto.randomUUID(),
    likelihood: input.likelihood ?? scoreLead(input),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (!supabase) {
    const leads = readLocalLeads();
    const index = leads.findIndex((item) => item.id === lead.id);
    const nextLead = index >= 0 ? { ...leads[index], ...lead, createdAt: leads[index].createdAt, updatedAt: timestamp } : lead;
    const next = index >= 0 ? leads.map((item) => (item.id === lead.id ? nextLead : item)) : [nextLead, ...leads];
    writeLocalLeads(next);
    return nextLead;
  }

  const { data, error } = await supabase
    .from('outreach_leads')
    .upsert(toDb(lead))
    .select('*, outreach_contact_events(*), outreach_email_drafts(*)')
    .single();

  if (error) throw error;
  return fromDb(data);
}

export async function updateLeadStatus(lead: Lead, status: Lead['status']): Promise<Lead> {
  return saveLead({ ...lead, status, likelihood: lead.likelihood }, lead.id);
}

export async function logContact(lead: Lead, event: Omit<ContactEvent, 'id' | 'leadId' | 'createdAt'>): Promise<Lead> {
  const contactEvent: ContactEvent = {
    ...event,
    id: crypto.randomUUID(),
    leadId: lead.id,
    createdAt: now(),
  };

  const updatedLead = hydrateLead({
    ...lead,
    status: event.method === 'email_sent' ? 'contacted' : lead.status,
    lastContactedAt: event.contactedAt,
    contactedBy: event.contactedBy,
    followUpDate: event.followUpDate,
    outcome: event.outcome,
    contactHistory: [contactEvent, ...lead.contactHistory],
  });

  if (!supabase) {
    const leads = readLocalLeads().map((item) => (item.id === lead.id ? updatedLead : item));
    writeLocalLeads(leads);
    return updatedLead;
  }

  const { error: eventError } = await supabase.from('outreach_contact_events').insert({
    id: contactEvent.id,
    lead_id: contactEvent.leadId,
    method: contactEvent.method,
    contacted_at: contactEvent.contactedAt,
    contacted_by: contactEvent.contactedBy || null,
    email_address_used: contactEvent.emailAddressUsed || null,
    draft_subject: contactEvent.draftSubject || null,
    draft_body: contactEvent.draftBody || null,
    notes: contactEvent.notes || null,
    outcome: contactEvent.outcome || null,
    follow_up_date: contactEvent.followUpDate || null,
  });
  if (eventError) throw eventError;

  return saveLead({ ...updatedLead, likelihood: updatedLead.likelihood }, updatedLead.id);
}

export async function markLatestEmailSent(lead: Lead, contactedBy: string, sentAt = now()): Promise<Lead> {
  const latest = lead.emailHistory[0];
  if (!latest) return lead;

  if (!supabase) {
    const updatedHistory = lead.emailHistory.map((email, index) => index === 0 ? { ...email, sentAt } : email);
    const updatedLead = hydrateLead({ ...lead, emailHistory: updatedHistory });
    writeLocalLeads(readLocalLeads().map((item) => (item.id === lead.id ? updatedLead : item)));
    return logContact(updatedLead, {
      method: 'email_sent',
      contactedAt: sentAt,
      contactedBy,
      emailAddressUsed: lead.email,
      draftSubject: latest.subject,
      draftBody: latest.body,
      notes: `Email sent: ${latest.subject}`,
      outcome: 'Email sent',
      followUpDate: lead.followUpDate || defaultFollowUpDate(),
    });
  }

  const { error } = await supabase.from('outreach_email_drafts').update({ sent_at: sentAt }).eq('id', latest.id);
  if (error) throw error;

  return logContact(lead, {
    method: 'email_sent',
    contactedAt: sentAt,
    contactedBy,
    emailAddressUsed: lead.email,
    draftSubject: latest.subject,
    draftBody: latest.body,
    notes: `Email sent: ${latest.subject}`,
    outcome: 'Email sent',
    followUpDate: lead.followUpDate || defaultFollowUpDate(),
  });
}

export async function discoverLeads(brief: SearchBrief): Promise<Lead[]> {
  if (!supabase) return createLocalDiscoveries(brief);

  const { data, error } = await supabase.functions.invoke('discover-leads', { body: brief });
  if (error) throw error;
  return (data?.leads ?? []).map((lead: Partial<Lead> & Pick<Lead, 'organisation' | 'category'>) => hydrateLead({
    ...lead,
    id: lead.id || crypto.randomUUID(),
    createdAt: lead.createdAt || now(),
    updatedAt: lead.updatedAt || now(),
  }));
}

export async function generateEmail(lead: Lead, tone: OutreachTone, createdBy = ''): Promise<DraftEmail> {
  const draft = !supabase
    ? createLocalEmail(lead, tone)
    : await invokeGenerateEmail(lead, tone);

  await saveEmailDraft(lead, draft, tone, createdBy);
  return draft;
}

async function invokeGenerateEmail(lead: Lead, tone: OutreachTone): Promise<DraftEmail> {
  const { data, error } = await supabase!.functions.invoke('generate-email', { body: { lead, tone } });
  if (error) throw error;
  return data as DraftEmail;
}

async function saveEmailDraft(lead: Lead, draft: DraftEmail, tone: OutreachTone, createdBy: string) {
  const record: EmailRecord = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    subject: draft.subject,
    body: draft.body,
    tone,
    generatedAt: now(),
    reviewedAt: null,
    sentAt: null,
    createdBy,
  };

  if (!supabase) {
    const updatedLead = hydrateLead({ ...lead, status: 'drafted', emailHistory: [record, ...lead.emailHistory] });
    writeLocalLeads(readLocalLeads().map((item) => (item.id === lead.id ? updatedLead : item)));
    return;
  }

  const { error } = await supabase.from('outreach_email_drafts').insert({
    id: record.id,
    lead_id: record.leadId,
    subject: record.subject,
    body: record.body,
    tone: record.tone,
    generated_at: record.generatedAt,
    created_by: record.createdBy || null,
  });
  if (error) throw error;
}

function createLocalDiscoveries(brief: SearchBrief): Lead[] {
  const timestamp = now();
  const place = [brief.suburb, brief.postcode, brief.region].filter(Boolean).join(' ') || brief.location || 'Local';

  return Array.from({ length: Math.max(1, brief.leadCount || 5) }, (_, index) => {
    const category = brief.categories[index % brief.categories.length];
    const lead = hydrateLead({
      id: crypto.randomUUID(),
      organisation: `${place} ${category.replace(' provider', '').replace(' clinic', '')} Network`,
      category,
      website: '',
      location: place,
      suburb: brief.suburb,
      postcode: brief.postcode,
      region: brief.region,
      radiusKm: brief.radiusKm,
      contactName: '',
      contactRole: category === 'GP clinic' ? 'Practice Manager' : 'Partnerships or Referrals Lead',
      email: '',
      phone: '',
      status: 'researching',
      likelihood: 0,
      fitSummary: 'AI research placeholder. Connect Supabase Edge Functions with a search API to enrich this lead.',
      suitabilitySummary: 'Autonomous research could not verify this candidate yet. Treat as a placeholder until the search function is connected.',
      businessNeeds: ['Referral pathway', 'Clinical support', 'Responsive follow-up'],
      servicesOffered: ['Public services not verified'],
      concerns: ['Live search provider is not configured. Human verification required.'],
      outreachAngle: 'Verify fit before drafting an email.',
      researchConfidence: 25,
      needs: ['Referral pathway', 'Clinical support', 'Responsive follow-up'],
      source: 'Local discovery draft',
      nextAction: 'Verify website, decision maker, and email before outreach.',
      notes: brief.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    lead.likelihood = scoreLead(lead) - index * 4;
    return lead;
  });
}

function createLocalEmail(lead: Lead, tone: OutreachTone): DraftEmail {
  const greeting = lead.contactName ? `Hi ${lead.contactName.split(' ')[0]},` : 'Hi,';
  const body = [
    greeting,
    '',
    `I’m reaching out from Paracare because ${lead.organisation} looks like a strong fit for the kind of coordinated in-home clinical support we provide.`,
    '',
    `We support clients who need reliable nursing oversight, clear documentation, and responsive communication between families, coordinators and care teams. For ${lead.category.toLowerCase()} partners, that usually means fewer gaps between referral, visit, escalation and follow-up.`,
    '',
    lead.fitSummary ? `What stood out: ${lead.fitSummary}` : '',
    lead.region || lead.suburb ? `We are looking specifically at the ${[lead.suburb, lead.region].filter(Boolean).join(', ')} area.` : '',
    '',
    tone === 'concise'
      ? 'Would it be worth a brief conversation next week to see whether Paracare could support any current clients?'
      : 'Would you be open to a short conversation next week? I’d like to understand the clients you’re supporting and where Paracare may be genuinely useful.',
    '',
    'Kind regards,',
    'Paracare',
  ].filter(Boolean).join('\n');

  return {
    subject: `Potential referral support for ${lead.organisation}`,
    body,
  };
}

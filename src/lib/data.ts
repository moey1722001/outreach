import { supabase } from './supabase';
import { scoreLead } from './scoring';
import type { DraftEmail, Lead, LeadFormInput, SearchBrief } from './types';

const STORAGE_KEY = 'paracare-outreach-leads';

const sampleLeads: Lead[] = [
  {
    id: 'lead-ndis-inner-west',
    organisation: 'Inner West Support Coordination',
    category: 'NDIS support coordinator',
    website: 'https://example.org/inner-west-support',
    location: 'Sydney Inner West',
    contactName: 'Samantha Lee',
    contactRole: 'Support Coordination Manager',
    email: 'hello@example.org',
    phone: '',
    status: 'qualified',
    likelihood: 86,
    fitSummary: 'Strong referral pathway for participants needing responsive clinical oversight at home.',
    needs: ['Complex disability support', 'Care coordination', 'Family communication'],
    source: 'Demo lead',
    nextAction: 'Review draft and send a short introduction.',
    notes: 'Likely values quick updates, reliable escalation paths, and family visibility.',
    lastContactedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lead-hcp-north',
    organisation: 'Northern Home Care Partners',
    category: 'Home Care Package provider',
    website: 'https://example.org/northern-home-care',
    location: 'Northern Beaches',
    contactName: 'Daniel Hart',
    contactRole: 'Care Manager',
    email: 'care@example.org',
    phone: '',
    status: 'drafted',
    likelihood: 78,
    fitSummary: 'Good fit for older clients needing nursing, reporting and coordinated follow-up.',
    needs: ['Home nursing', 'Medication oversight', 'Incident reporting'],
    source: 'Demo lead',
    nextAction: 'Personalise with local availability and partner review.',
    notes: 'Mention Paracare’s clinical documentation and escalation workflow.',
    lastContactedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function fromDb(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    organisation: row.organisation as string,
    category: row.category as Lead['category'],
    website: (row.website as string | null) ?? '',
    location: (row.location as string | null) ?? '',
    contactName: (row.contact_name as string | null) ?? '',
    contactRole: (row.contact_role as string | null) ?? '',
    email: (row.email as string | null) ?? '',
    phone: (row.phone as string | null) ?? '',
    status: row.status as Lead['status'],
    likelihood: row.likelihood as number,
    fitSummary: (row.fit_summary as string | null) ?? '',
    needs: (row.needs as string[] | null) ?? [],
    source: (row.source as string | null) ?? '',
    nextAction: (row.next_action as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    lastContactedAt: (row.last_contacted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toDb(lead: Lead) {
  return {
    id: lead.id,
    organisation: lead.organisation,
    category: lead.category,
    website: lead.website || null,
    location: lead.location || null,
    contact_name: lead.contactName || null,
    contact_role: lead.contactRole || null,
    email: lead.email || null,
    phone: lead.phone || null,
    status: lead.status,
    likelihood: lead.likelihood,
    fit_summary: lead.fitSummary || null,
    needs: lead.needs,
    source: lead.source || null,
    next_action: lead.nextAction || null,
    notes: lead.notes || null,
    last_contacted_at: lead.lastContactedAt,
  };
}

function readLocalLeads(): Lead[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLeads));
    return sampleLeads;
  }

  try {
    return JSON.parse(stored) as Lead[];
  } catch {
    return sampleLeads;
  }
}

function writeLocalLeads(leads: Lead[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

export async function listLeads(): Promise<Lead[]> {
  if (!supabase) return readLocalLeads();

  const { data, error } = await supabase
    .from('outreach_leads')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function saveLead(input: LeadFormInput, existingId?: string): Promise<Lead> {
  const now = new Date().toISOString();
  const lead: Lead = {
    ...input,
    id: existingId ?? crypto.randomUUID(),
    likelihood: input.likelihood ?? scoreLead(input),
    createdAt: now,
    updatedAt: now,
  };

  if (!supabase) {
    const leads = readLocalLeads();
    const index = leads.findIndex((item) => item.id === lead.id);
    const nextLead = index >= 0 ? { ...leads[index], ...lead, createdAt: leads[index].createdAt, updatedAt: now } : lead;
    const next = index >= 0 ? leads.map((item) => (item.id === lead.id ? nextLead : item)) : [nextLead, ...leads];
    writeLocalLeads(next);
    return nextLead;
  }

  const { data, error } = await supabase
    .from('outreach_leads')
    .upsert(toDb(lead))
    .select('*')
    .single();

  if (error) throw error;
  return fromDb(data);
}

export async function updateLeadStatus(lead: Lead, status: Lead['status']): Promise<Lead> {
  return saveLead({ ...lead, status, likelihood: lead.likelihood }, lead.id);
}

export async function discoverLeads(brief: SearchBrief): Promise<Lead[]> {
  if (!supabase) return createLocalDiscoveries(brief);

  const { data, error } = await supabase.functions.invoke('discover-leads', { body: brief });
  if (error) throw error;
  return (data?.leads ?? []).map((lead: Lead) => ({
    ...lead,
    id: lead.id || crypto.randomUUID(),
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || new Date().toISOString(),
  }));
}

export async function generateEmail(lead: Lead, tone: string): Promise<DraftEmail> {
  if (!supabase) return createLocalEmail(lead, tone);

  const { data, error } = await supabase.functions.invoke('generate-email', { body: { lead, tone } });
  if (error) throw error;
  return data as DraftEmail;
}

function createLocalDiscoveries(brief: SearchBrief): Lead[] {
  const now = new Date().toISOString();
  return brief.categories.slice(0, 4).map((category, index) => {
    const lead: Lead = {
      id: crypto.randomUUID(),
      organisation: `${brief.location || 'Local'} ${category.replace(' provider', '').replace(' clinic', '')} Network`,
      category,
      website: '',
      location: brief.location,
      contactName: '',
      contactRole: category === 'GP clinic' ? 'Practice Manager' : 'Partnerships or Referrals Lead',
      email: '',
      phone: '',
      status: 'researching',
      likelihood: 0,
      fitSummary: 'AI research placeholder. Connect Supabase Edge Functions with a search API to enrich this lead.',
      needs: ['Referral pathway', 'Clinical support', 'Responsive follow-up'],
      source: 'Local discovery draft',
      nextAction: 'Verify website, decision maker, and email before outreach.',
      notes: brief.notes,
      lastContactedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    lead.likelihood = scoreLead(lead) - index * 4;
    return lead;
  });
}

function createLocalEmail(lead: Lead, tone: string): DraftEmail {
  const greeting = lead.contactName ? `Hi ${lead.contactName.split(' ')[0]},` : 'Hi,';
  const body = [
    greeting,
    '',
    `I’m reaching out from Paracare because ${lead.organisation} looks like a strong fit for the kind of coordinated in-home clinical support we provide.`,
    '',
    `We support clients who need reliable nursing oversight, clear documentation, and responsive communication between families, coordinators and care teams. For ${lead.category.toLowerCase()} partners, that usually means fewer gaps between referral, visit, escalation and follow-up.`,
    '',
    lead.fitSummary ? `What stood out: ${lead.fitSummary}` : '',
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

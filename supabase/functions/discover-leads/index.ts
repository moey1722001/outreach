import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LeadCategory =
  | 'NDIS support coordinator'
  | 'Home Care Package provider'
  | 'Retirement village'
  | 'Aged care provider'
  | 'SIL provider'
  | 'Community nursing provider'
  | 'Hospital discharge planner'
  | 'GP clinic'
  | 'Allied health provider';

const leadCategories: LeadCategory[] = [
  'NDIS support coordinator',
  'Home Care Package provider',
  'Retirement village',
  'Aged care provider',
  'SIL provider',
  'Community nursing provider',
  'Hospital discharge planner',
  'GP clinic',
  'Allied health provider',
];

const decisionMakerGuide: Record<LeadCategory, string> = {
  'NDIS support coordinator': 'Primary decision makers: Support Coordination Manager, Specialist Support Coordinator, Support Coordination Team Lead, Director/Founder of a support coordination provider. Why: they influence participant referrals, choose responsive clinical partners, and coordinate complex in-home support needs.',
  'Home Care Package provider': 'Primary decision makers: Home Care Package Manager, Care Manager, Clinical Care Manager, Intake/Admissions Manager, Operations Manager. Why: they manage package clients, approve external nursing/allied partners, and need reliable reporting, escalation and visit coordination.',
  'Retirement village': 'Primary decision makers: Village Manager, Resident Services Manager, Community Manager, Wellness/Health Coordinator. Why: they know residents and families who may need in-home clinical support, escalation, post-discharge care or family communication.',
  'Aged care provider': 'Primary decision makers: Facility Manager, General Manager, Clinical Care Manager, Admissions/Intake Manager, Home Care Manager. Why: they influence family enquiries, transitions of care, respite/discharge pathways and referrals for clients needing extra clinical support.',
  'SIL provider': 'Primary decision makers: SIL Manager, Operations Manager, House Manager, Support Coordination Lead, Director/Founder. Why: they support NDIS participants with complex daily needs and often need clinical visibility, deterioration recognition, escalation recommendations and family reassurance.',
  'Community nursing provider': 'Primary decision makers: Clinical Coordinator, Nursing Manager, Care Manager, Intake Manager, Director. Why: they manage community clients who may need structured monitoring, trend reporting, escalation support and extra post-discharge oversight.',
  'Hospital discharge planner': 'Primary decision makers: Discharge Planner, NUM, Transitional Care Coordinator, Social Worker, Care Navigation Lead. Why: they help clients return home safely and can identify people needing proactive monitoring after discharge.',
  'GP clinic': 'Primary decision makers: Practice Manager, Nurse Manager, Principal GP, Practice Owner. Why: they manage referral pathways and see patients needing chronic disease monitoring, falls-risk review, post-discharge oversight and added clinical visibility.',
  'Allied health provider': 'Primary decision makers: Practice Manager, Principal Clinician, Director/Owner, Referral Coordinator. Why: they often support high-needs clients who may need complementary clinical monitoring, care coordination, home visits and stronger escalation pathways.',
};

const paracareContext = `Paracare Services provides proactive in-home wellness and clinical monitoring for NDIS participants, Home Care Package / Support at Home clients, retirement village residents and complex community care clients.

Paracare is not a hospital replacement, emergency service, ambulance replacement, acute care provider or generic support worker provider.

Position Paracare as: "Paramedic-led wellness and clinical monitoring designed to improve visibility, support early deterioration recognition and provide proactive oversight for community-based clients."

Services and value points include BP monitoring, heart rate monitoring, SpO2 monitoring, 12 lead ECGs when clinically indicated, systems-based reviews, falls risk monitoring, wellness assessments, family dashboard visibility, clinical trend reporting, escalation recommendations, post-discharge oversight, communication with providers/families and supporting clients to remain safely in the community.`;

const commercialFitContext = `Paracare is a premium clinical monitoring and wellness service, not low-cost support work. Commercially realistic leads are organisations or pathways where premium monitoring may be fundable or valued.

Preferred commercial-fit signals:
- Home Care Package / Support at Home providers.
- Plan-managed or self-managed NDIS participant pathways.
- SIL providers and organisations managing high-needs participants.
- Organisations already funding nursing, clinical supports, post-discharge oversight or complex-care monitoring.
- Providers with care managers, clinical coordinators, package managers, SIL managers or intake teams who can identify funded clients.

Lower commercial fit:
- Businesses focused only on low-cost support work, social support, retail services, generic wellness or clients unlikely to fund premium monitoring.`;

const idealClientSignals = [
  'elderly clients',
  'high-risk community clients',
  'NDIS participants with complex needs',
  'SIL homes',
  'neurological conditions',
  'ABI clients',
  'chronic disease clients',
  'frequent hospital presentations',
  'post-discharge clients',
  'falls-risk clients',
  'clients needing additional oversight or family reassurance',
];

const poorFitSignals = [
  'generic retail businesses',
  'unrelated healthcare businesses',
  'standard gyms',
  'unrelated trades',
  'generic marketing companies',
  'businesses with no disability, aged care or community care relevance',
  'businesses focused only on low-cost support work or social support without clinical oversight needs',
];

interface SearchRequest {
  location?: string;
  suburb?: string;
  postcode?: string;
  region?: string;
  radiusKm?: number | null;
  leadCount?: number;
  categories?: LeadCategory[];
  notes?: string;
  modelMode?: 'save_tokens' | 'launch_quality';
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function targetDecisionMakers(categories: LeadCategory[]) {
  return categories.map((category) => `${category}: ${decisionMakerGuide[category]}`).join('\n');
}

function isLeadCategory(value: unknown): value is LeadCategory {
  return typeof value === 'string' && leadCategories.includes(value as LeadCategory);
}

function closestCategory(value: unknown, categories: LeadCategory[]): LeadCategory {
  if (isLeadCategory(value) && categories.includes(value)) return value;
  const text = String(value ?? '').toLowerCase();
  const matched = categories.find((category) => text.includes(category.toLowerCase()));
  if (matched) return matched;
  if (text.includes('ndis') || text.includes('support coordination')) return categories.includes('NDIS support coordinator') ? 'NDIS support coordinator' : categories[0];
  if (text.includes('home care') || text.includes('hcp')) return categories.includes('Home Care Package provider') ? 'Home Care Package provider' : categories[0];
  if (text.includes('retirement')) return categories.includes('Retirement village') ? 'Retirement village' : categories[0];
  if (text.includes('aged')) return categories.includes('Aged care provider') ? 'Aged care provider' : categories[0];
  if (text.includes('sil') || text.includes('supported independent living')) return categories.includes('SIL provider') ? 'SIL provider' : categories[0];
  if (text.includes('community nursing') || text.includes('nursing')) return categories.includes('Community nursing provider') ? 'Community nursing provider' : categories[0];
  if (text.includes('discharge') || text.includes('transitional care')) return categories.includes('Hospital discharge planner') ? 'Hospital discharge planner' : categories[0];
  if (text.includes('gp') || text.includes('clinic')) return categories.includes('GP clinic') ? 'GP clinic' : categories[0];
  if (text.includes('allied')) return categories.includes('Allied health provider') ? 'Allied health provider' : categories[0];
  return categories[0];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function score(value: unknown, fallback = 60) {
  return Math.min(100, Math.max(0, Number(value) || fallback));
}

function leadScore(value: unknown, fallback = 6) {
  const numericValue = Number(value) || fallback;
  const outOfTen = numericValue <= 10 ? numericValue : numericValue / 10;
  return Math.min(100, Math.max(10, Math.round(outOfTen * 10)));
}

function normaliseDomain(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

function extractEmails(text: string) {
  return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
    .map((email) => email.toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email)))];
}

function extractPhones(text: string) {
  return [...new Set((text.match(/(?:\+?61|0)[\d\s().-]{8,}\d/g) ?? [])
    .map((phone) => phone.replace(/\s+/g, ' ').trim())
    .filter((phone) => phone.replace(/\D/g, '').length >= 9))];
}

function matchingEvidence(lead: Record<string, unknown>, results: Array<Record<string, unknown>>) {
  const domain = normaliseDomain(lead.website);
  const genericWords = new Set(['care', 'health', 'healthcare', 'home', 'service', 'services', 'support', 'supports', 'group', 'australia', 'australian', 'community', 'provider', 'providers']);
  const organisation = String(lead.organisation ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const organisationWords = organisation.split(/\s+/).filter((word) => word.length > 3 && !genericWords.has(word));

  return results.filter((result) => {
    const url = String(result.url ?? '').toLowerCase();
    const title = String(result.title ?? '').toLowerCase();
    const content = String(result.content ?? '').toLowerCase();
    if (domain && normaliseDomain(url) === domain) return true;
    if (domain && url.includes(domain)) return true;
    const haystack = `${title}\n${content}`;
    if (organisation && haystack.includes(organisation)) return true;
    const matchedWords = organisationWords.filter((word) => haystack.includes(word));
    return organisationWords.length >= 2 && matchedWords.length >= 2;
  });
}

function publicContactFromEvidence(lead: Record<string, unknown>, results: Array<Record<string, unknown>>) {
  const evidence = matchingEvidence(lead, results);
  const text = evidence.map((result) => [
    result.title,
    result.url,
    result.content,
    result.raw_content,
  ].filter(Boolean).join('\n')).join('\n\n');

  return {
    email: extractEmails(text)[0] ?? '',
    phone: extractPhones(text)[0] ?? '',
    foundContactEvidence: evidence.length > 0,
  };
}

function sanitiseLead(lead: Record<string, unknown>, categories: LeadCategory[], fallbackRadius: number | null, results: Array<Record<string, unknown>>) {
  const publicContact = publicContactFromEvidence(lead, results);
  const email = typeof lead.email === 'string' && lead.email.includes('@') ? lead.email : publicContact.email;
  const phone = typeof lead.phone === 'string' && lead.phone.replace(/\D/g, '').length >= 9 ? lead.phone : publicContact.phone;
  const notes = typeof lead.notes === 'string' ? lead.notes : '';
  const contactNote = email
    ? 'Public email found and needs human verification before sending.'
    : 'No public email was found in the searched sources; verify the website/contact page manually before sending.';

  return {
    ...lead,
    category: closestCategory(lead.category, categories),
    status: 'qualified',
    likelihood: leadScore(lead.likelihood),
    researchConfidence: score(lead.researchConfidence, leadScore(lead.likelihood)),
    radiusKm: typeof lead.radiusKm === 'number' ? lead.radiusKm : fallbackRadius,
    website: typeof lead.website === 'string' ? lead.website : '',
    location: typeof lead.location === 'string' ? lead.location : '',
    suburb: typeof lead.suburb === 'string' ? lead.suburb : '',
    postcode: typeof lead.postcode === 'string' ? lead.postcode : '',
    region: typeof lead.region === 'string' ? lead.region : '',
    contactName: typeof lead.contactName === 'string' ? lead.contactName : '',
    contactRole: typeof lead.contactRole === 'string' ? lead.contactRole : decisionMakerGuide[closestCategory(lead.category, categories)].split(': ')[1]?.split('.')[0] ?? '',
    email,
    phone,
    businessNeeds: stringArray(lead.businessNeeds),
    servicesOffered: stringArray(lead.servicesOffered),
    concerns: stringArray(lead.concerns),
    needs: stringArray(lead.needs),
    notes: [notes, contactNote].filter(Boolean).join(' '),
    lastContactedAt: typeof lead.lastContactedAt === 'string' ? lead.lastContactedAt : null,
  };
}

async function providerError(response: Response, provider: 'Search provider' | 'Lead analysis') {
  const body = await response.text();
  const lowerBody = body.toLowerCase();

  if (lowerBody.includes('insufficient_quota') || lowerBody.includes('quota')) {
    return `${provider} failed: OpenAI quota has been exceeded. Check the OpenAI project billing/credits for the API key saved in Supabase.`;
  }

  if (lowerBody.includes('invalid_api_key') || response.status === 401) {
    return `${provider} failed: the configured API key was rejected. Check the secret value saved in Supabase.`;
  }

  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message ?? body;
    const code = parsed?.error?.code ?? parsed?.code;

    if (code === 'insufficient_quota' || String(message).toLowerCase().includes('quota')) {
      return `${provider} failed: OpenAI quota has been exceeded. Check the OpenAI project billing/credits for the API key saved in Supabase.`;
    }

    if (code === 'invalid_api_key' || response.status === 401) {
      return `${provider} failed: the configured API key was rejected. Check the secret value saved in Supabase.`;
    }

    return `${provider} failed (${response.status}): ${message}`;
  } catch {
    return `${provider} failed (${response.status}): ${body}`;
  }
}

function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct;

  const stack: unknown[] = [(payload as { output?: unknown }).output];
  while (stack.length > 0) {
    const value = stack.shift();
    if (!value) continue;
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (typeof value === 'object') {
      const item = value as Record<string, unknown>;
      if (typeof item.text === 'string' && item.text.trim()) return item.text;
      if (typeof item.content === 'string' && item.content.trim()) return item.content;
      stack.push(item.content, item.message, item.output);
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json() as SearchRequest;
    const {
      location = '',
      suburb = '',
      postcode = '',
      region = '',
      radiusKm = 10,
      leadCount = 10,
      categories: requestedCategories = [],
      notes = '',
      modelMode = 'save_tokens',
    } = body;
    const categories = requestedCategories.filter(isLeadCategory);

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const searchKey = Deno.env.get('TAVILY_API_KEY');

    if (!searchKey) {
      return json({ error: 'Lead search is not configured: missing TAVILY_API_KEY Supabase Edge Function secret.' }, 500);
    }

    if (!openAiKey) {
      return json({ error: 'Lead analysis is not configured: missing OPENAI_API_KEY Supabase Edge Function secret.' }, 500);
    }

    if (categories.length === 0) {
      return json({ error: 'Choose at least one lead type before searching.' }, 400);
    }

    const area = [suburb, postcode, region || location].filter(Boolean).join(' ');
    if (!area) {
      return json({ error: 'Enter a suburb, postcode or region before searching.' }, 400);
    }

    const requestedCount = Math.min(20, Math.max(1, leadCount));
    const model = modelMode === 'save_tokens'
      ? Deno.env.get('OUTREACH_OPENAI_TEST_MODEL') ?? 'gpt-4.1-nano'
      : Deno.env.get('OUTREACH_OPENAI_MODEL') ?? 'gpt-4.1-mini';
    const categoryQuery = categories.join(' OR ');
    const priorityTerms = 'complex care SIL ABI neuro chronic disease falls risk post-discharge HCP plan-managed self-managed NDIS clinical supports';
    const queries = [
      `${categoryQuery} near ${area} contact email phone ${priorityTerms}`,
      `${categoryQuery} ${area} Care Manager Clinical Coordinator Intake Admissions referrals`,
      `${categoryQuery} ${area} "contact us" referrals intake "support at home"`,
      `${categoryQuery} ${area} email phone referrals HCP SIL NDIS`,
      `site:linkedin.com/company ${categoryQuery} ${area} aged care NDIS SIL`,
      `site:linkedin.com/in ${categoryQuery} ${area} Care Manager Support Coordinator Director`,
    ];

    const searchPayloads = await Promise.all(queries.map(async (query) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: searchKey,
          query,
          search_depth: 'advanced',
          include_answer: false,
          include_raw_content: true,
          max_results: Math.min(10, Math.max(requestedCount, 5)),
        }),
      });

      if (!response.ok) {
        throw new Error(await providerError(response, 'Search provider'));
      }

      return response.json();
    }));

    const seenUrls = new Set<string>();
    const results = searchPayloads.flatMap((payload) => Array.isArray(payload.results) ? payload.results : [])
      .filter((result: Record<string, unknown>) => {
        const url = String(result.url ?? '');
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });

    if (results.length === 0) {
      return json({ error: `No search results found for ${area}. Try a broader radius or fewer lead types.` }, 404);
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: `You are an autonomous healthcare outreach research assistant for Paracare. Return up to ${requestedCount} suitable Australian outreach leads from supplied public web and LinkedIn search results.

Paracare context:
${paracareContext}

Commercial fit context:
${commercialFitContext}

Use only public facts present in the supplied results. Do not invent email addresses, phone numbers, websites, LinkedIn profiles or personal names. If a public source does not show a named person, leave contactName empty and recommend the most likely role in contactRole.

The category field must be exactly one of: ${categories.join(', ')}.
The status field must always be exactly "qualified".
The likelihood field is the lead score from 1 to 10, where 10 means strongest referral potential for Paracare.

Decision-maker guide:
${targetDecisionMakers(categories)}

Ideal end-client signals to prioritise:
${idealClientSignals.map((signal) => `- ${signal}`).join('\n')}

Low-priority or do-not-target signals:
${poorFitSignals.map((signal) => `- ${signal}`).join('\n')}

For each candidate, explain:
- what the organisation does
- the main person or role Paracare should contact to get referral/client conversations
- why that role matters for NDIS, Home Care Packages, aged care, GP or allied-health referrals
- public phone/email/website/LinkedIn evidence found, if available
- services offered, likely needs, commercial fit, concerns, outreach angle, and priority score

Prioritise businesses with a direct pathway to referrals or client introductions. Prefer organisations with public contact details, clear local presence, and client groups likely to need proactive wellness monitoring, systems-based health reviews, trend monitoring, deterioration recognition, family visibility, post-discharge oversight, escalation recommendations, complex disability support or high-needs community oversight.

Commercial awareness:
- Do not score a lead highly on clinical relevance alone. Also assess whether Paracare's premium monitoring model is financially realistic.
- Prefer HCP/Support at Home providers, plan-managed or self-managed NDIS pathways, SIL providers, high-needs participant managers, and organisations already funding nursing or clinical supports.
- If the organisation appears focused on low-cost support work only, social support only, or unfunded generic wellness, lower the score and list that concern.
- Include commercial-fit evidence or uncertainty in suitabilitySummary, businessNeeds, concerns or notes.

Do not include businesses that are not relevant to disability, aged care, community care, retirement living, discharge support, high-needs allied health or clinical community monitoring. If a search result is only a generic clinic, gym, retailer, marketing company or unrelated provider, exclude it.

Scoring:
- 9-10: strong clinical and commercial fit; clear high-needs elderly/disability/community-care client base plus HCP, plan/self-managed NDIS, SIL, funded nursing, clinical supports, care managers/coordinators, complex care or hospital avoidance signals.
- 7-8: good fit; likely referral pathway and relevant client base, but commercial evidence is less complete.
- 4-6: possible but needs human review.
- 1-3: low clinical or commercial fit; only include if there is still a clear reason Paracare may be relevant.

Email/phone rules:
- Search the supplied website/contact/search snippets carefully for a public email and phone number.
- Prefer direct organisation emails from the organisation's own website or contact page.
- Generic public inboxes like admin@, info@, referrals@, intake@ or hello@ are acceptable if public.
- Never invent an email. If no email is public, leave email empty and explain that it needs manual verification in notes.
- Never use a personal LinkedIn profile as proof of a private email address.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              searchArea: { location, suburb, postcode, region, radiusKm },
              requestedCount,
              categories,
              outreachInstructions: notes,
              decisionMakerGuide: targetDecisionMakers(categories),
              searchResults: results.map((result: Record<string, unknown>) => ({
                title: result.title,
                url: result.url,
                content: result.content,
                rawContent: typeof result.raw_content === 'string' ? result.raw_content.slice(0, 5000) : '',
              })),
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'lead_discovery',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['leads'],
              properties: {
                leads: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['organisation', 'category', 'website', 'location', 'suburb', 'postcode', 'region', 'radiusKm', 'contactName', 'contactRole', 'email', 'phone', 'status', 'likelihood', 'fitSummary', 'suitabilitySummary', 'businessNeeds', 'servicesOffered', 'concerns', 'outreachAngle', 'researchConfidence', 'needs', 'source', 'nextAction', 'notes', 'lastContactedAt'],
                    properties: {
                      organisation: { type: 'string' },
                      category: { type: 'string', enum: categories },
                      website: { type: 'string' },
                      location: { type: 'string' },
                      suburb: { type: 'string' },
                      postcode: { type: 'string' },
                      region: { type: 'string' },
                      radiusKm: { type: ['number', 'null'] },
                      contactName: { type: 'string' },
                      contactRole: { type: 'string' },
                      email: { type: 'string' },
                      phone: { type: 'string' },
                      status: { type: 'string', enum: ['qualified'] },
                      likelihood: { type: 'number' },
                      fitSummary: { type: 'string' },
                      suitabilitySummary: { type: 'string' },
                      businessNeeds: { type: 'array', items: { type: 'string' } },
                      servicesOffered: { type: 'array', items: { type: 'string' } },
                      concerns: { type: 'array', items: { type: 'string' } },
                      outreachAngle: { type: 'string' },
                      researchConfidence: { type: 'number' },
                      needs: { type: 'array', items: { type: 'string' } },
                      source: { type: 'string' },
                      nextAction: { type: 'string' },
                      notes: { type: 'string' },
                      lastContactedAt: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return json({ error: await providerError(response, 'Lead analysis') }, 502);
    }

    const data = await response.json();
    const text = outputText(data);
    if (!text) {
      return json({ error: 'Lead analysis failed: the AI model returned no structured text. Try Launch quality mode or a smaller lead count.' }, 502);
    }
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed.leads) || parsed.leads.length === 0) {
      return json({ error: 'Search completed, but no suitable leads were identified. Try a broader area or different lead types.' }, 404);
    }

    return json({ leads: parsed.leads.slice(0, requestedCount).map((lead: Record<string, unknown>) => sanitiseLead(lead, categories, radiusKm, results)) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown lead search error.' }, 500);
  }
});

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
  | 'GP clinic'
  | 'Allied health provider';

const decisionMakerGuide: Record<LeadCategory, string> = {
  'NDIS support coordinator': 'Primary decision makers: Support Coordination Manager, Specialist Support Coordinator, Support Coordination Team Lead, Director/Founder of a support coordination provider. Why: they influence participant referrals, choose responsive clinical partners, and coordinate complex in-home support needs.',
  'Home Care Package provider': 'Primary decision makers: Home Care Package Manager, Care Manager, Clinical Care Manager, Intake/Admissions Manager, Operations Manager. Why: they manage package clients, approve external nursing/allied partners, and need reliable reporting, escalation and visit coordination.',
  'Retirement village': 'Primary decision makers: Village Manager, Resident Services Manager, Community Manager, Wellness/Health Coordinator. Why: they know residents and families who may need in-home clinical support, escalation, post-discharge care or family communication.',
  'Aged care provider': 'Primary decision makers: Facility Manager, General Manager, Clinical Care Manager, Admissions/Intake Manager, Home Care Manager. Why: they influence family enquiries, transitions of care, respite/discharge pathways and referrals for clients needing extra clinical support.',
  'GP clinic': 'Primary decision makers: Practice Manager, Nurse Manager, Principal GP, Practice Owner. Why: they manage referral pathways and see patients needing home nursing, chronic disease support, wound care, medication oversight and post-discharge follow-up.',
  'Allied health provider': 'Primary decision makers: Practice Manager, Principal Clinician, Director/Owner, Referral Coordinator. Why: they often support clients who need complementary nursing, care coordination, home visits and stronger escalation pathways.',
};

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
      categories = [],
      notes = '',
      modelMode = 'save_tokens',
    } = body;

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
    const queries = [
      `${categories.join(' OR ')} near ${area} within ${radiusKm ?? 10}km healthcare referrals community aged care NDIS Australia contact phone email`,
      `${categories.join(' OR ')} ${area} Practice Manager Care Manager Support Coordination Manager Intake Admissions phone email website LinkedIn`,
      `site:linkedin.com/company (${categories.join(' OR ')}) ${area} healthcare aged care NDIS`,
      `site:linkedin.com/in (${categories.join(' OR ')}) ${area} Practice Manager Care Manager Support Coordinator Director`,
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
            content: `You are an autonomous healthcare outreach research assistant for Paracare, an Australian in-home clinical care provider. Return up to ${requestedCount} suitable Australian outreach leads from supplied public web and LinkedIn search results.

Use only public facts present in the supplied results. Do not invent email addresses, phone numbers, websites, LinkedIn profiles or personal names. If a public source does not show a named person, leave contactName empty and recommend the most likely role in contactRole.

Decision-maker guide:
${targetDecisionMakers(categories)}

For each candidate, explain:
- what the organisation does
- the main person or role Paracare should contact to get referral/client conversations
- why that role matters for NDIS, Home Care Packages, aged care, GP or allied-health referrals
- public phone/email/website/LinkedIn evidence found, if available
- services offered, likely needs, concerns, outreach angle, and priority score

Prioritise businesses with a direct pathway to referrals or client introductions. Prefer organisations with public contact details, clear local presence, and client groups likely to need in-home nursing, care coordination, post-discharge support, medication oversight, wound care, complex disability support, or family communication.`,
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
                      category: { type: 'string' },
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
                      status: { type: 'string' },
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

    return json({ leads: parsed.leads.slice(0, requestedCount) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown lead search error.' }, 500);
  }
});

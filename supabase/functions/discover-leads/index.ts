import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { location, suburb, postcode, region, radiusKm, leadCount = 10, categories, notes } = await req.json();
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const searchKey = Deno.env.get('TAVILY_API_KEY');

    let searchResults = '';
    if (searchKey) {
      const searchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: searchKey,
          query: `${categories.join(' OR ')} near ${suburb ?? ''} ${postcode ?? ''} ${region ?? location ?? ''} within ${radiusKm ?? 10}km healthcare referrals community aged care NDIS Australia`,
          search_depth: 'advanced',
          max_results: Math.min(20, Math.max(leadCount * 2, 10)),
        }),
      });
      if (searchResponse.ok) searchResults = JSON.stringify(await searchResponse.json());
    }

    if (!openAiKey) {
      return Response.json({ leads: fallbackLeads({ location, suburb, postcode, region, radiusKm, leadCount, categories, notes }) }, { headers: corsHeaders });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OUTREACH_OPENAI_MODEL') ?? 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: `You are an autonomous healthcare outreach research assistant for Paracare. Return up to ${leadCount} suitable Australian outreach leads from supplied search results. Respect the requested suburb, postcode, region and radius. Gather only public facts. Do not invent email addresses, phone numbers, websites or personal names. If a public source does not show a contact person, leave contactName empty and infer only a safe role such as Practice Manager or Referrals Lead. For each candidate, list services offered, analyse likely business needs, explain whether Paracare is a good fit, identify concerns, choose the best outreach angle, and provide a priority score. Only return candidates that are plausibly suitable for in-home clinical care, NDIS, aged care, GP or allied-health referral relationships.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ location, suburb, postcode, region, radiusKm, leadCount, categories, notes, searchResults }),
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

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text;
    return Response.json(JSON.parse(text), { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
});

function fallbackLeads({ location, suburb, postcode, region, radiusKm, leadCount, categories, notes }: { location: string; suburb: string; postcode: string; region: string; radiusKm: number | null; leadCount: number; categories: string[]; notes: string }) {
  const area = [suburb, postcode, region].filter(Boolean).join(' ') || location;

  return Array.from({ length: Math.max(1, leadCount || 5) }, (_, index) => {
    const category = categories[index % categories.length];
    return ({
    organisation: `${area || 'Local'} ${category} candidate`,
    category,
    website: '',
    location: area,
    suburb: suburb ?? '',
    postcode: postcode ?? '',
    region: region ?? '',
    radiusKm: radiusKm ?? null,
    contactName: '',
    contactRole: category === 'GP clinic' ? 'Practice Manager' : 'Referrals or Partnerships Lead',
    email: '',
    phone: '',
    status: 'researching',
    likelihood: 72 - index * 5,
    fitSummary: 'Search provider not configured. Verify this placeholder with public research before outreach.',
    suitabilitySummary: 'Autonomous research could not verify this candidate yet because live search/AI provider secrets are not fully configured.',
    businessNeeds: ['Referral pathway', 'Clinical support', 'Care coordination'],
    servicesOffered: ['Public services not verified'],
    concerns: ['Live search provider is not configured. Human verification required.'],
    outreachAngle: 'Verify fit and public contact details before generating a human-reviewed email.',
    researchConfidence: 25,
    needs: ['Referral pathway', 'Clinical support', 'Care coordination'],
    source: 'Fallback discovery',
    nextAction: 'Verify organisation, website, decision maker and contact email.',
    notes,
    lastContactedAt: null,
  });
  });
}

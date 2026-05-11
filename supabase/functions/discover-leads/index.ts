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

interface SearchRequest {
  location?: string;
  suburb?: string;
  postcode?: string;
  region?: string;
  radiusKm?: number | null;
  leadCount?: number;
  categories?: LeadCategory[];
  notes?: string;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
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
    const query = `${categories.join(' OR ')} near ${area} within ${radiusKm ?? 10}km healthcare referrals community aged care NDIS Australia`;

    const searchResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: searchKey,
        query,
        search_depth: 'advanced',
        include_answer: false,
        include_raw_content: false,
        max_results: Math.min(20, Math.max(requestedCount * 2, 10)),
      }),
    });

    if (!searchResponse.ok) {
      return json({ error: await providerError(searchResponse, 'Search provider') }, 502);
    }

    const searchPayload = await searchResponse.json();
    const results = Array.isArray(searchPayload.results) ? searchPayload.results : [];

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
        model: Deno.env.get('OUTREACH_OPENAI_MODEL') ?? 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: `You are an autonomous healthcare outreach research assistant for Paracare. Return up to ${requestedCount} suitable Australian outreach leads from supplied web search results. Use only public facts present in the search results. Do not invent email addresses, phone numbers, websites or personal names. If a public source does not show a contact person, leave contactName empty and infer only a safe role such as Practice Manager or Referrals Lead. For each candidate, list services offered, likely business needs, why Paracare is a good fit, concerns, best outreach angle, and a priority score. Only return organisations plausibly suitable for in-home clinical care, NDIS, aged care, GP or allied-health referral relationships.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              searchArea: { location, suburb, postcode, region, radiusKm },
              requestedCount,
              categories,
              outreachInstructions: notes,
              searchResults: results.map((result: Record<string, unknown>) => ({
                title: result.title,
                url: result.url,
                content: result.content,
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
    const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text;
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed.leads) || parsed.leads.length === 0) {
      return json({ error: 'Search completed, but no suitable leads were identified. Try a broader area or different lead types.' }, 404);
    }

    return json({ leads: parsed.leads.slice(0, requestedCount) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown lead search error.' }, 500);
  }
});

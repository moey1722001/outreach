import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { location, categories, notes } = await req.json();
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const searchKey = Deno.env.get('TAVILY_API_KEY');

    let searchResults = '';
    if (searchKey) {
      const searchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: searchKey,
          query: `${categories.join(' OR ')} ${location} healthcare referrals community aged care NDIS`,
          search_depth: 'advanced',
          max_results: 8,
        }),
      });
      if (searchResponse.ok) searchResults = JSON.stringify(await searchResponse.json());
    }

    if (!openAiKey) {
      return Response.json({ leads: fallbackLeads(location, categories, notes) }, { headers: corsHeaders });
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
            content: 'You are a careful healthcare partnership researcher. Extract likely Australian outreach leads from supplied search results. Do not invent email addresses or personal names. Score based on role fit, referral relevance, public evidence and likely need.',
          },
          {
            role: 'user',
            content: JSON.stringify({ location, categories, notes, searchResults }),
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
                    required: ['organisation', 'category', 'website', 'location', 'contactName', 'contactRole', 'email', 'phone', 'status', 'likelihood', 'fitSummary', 'needs', 'source', 'nextAction', 'notes', 'lastContactedAt'],
                    properties: {
                      organisation: { type: 'string' },
                      category: { type: 'string' },
                      website: { type: 'string' },
                      location: { type: 'string' },
                      contactName: { type: 'string' },
                      contactRole: { type: 'string' },
                      email: { type: 'string' },
                      phone: { type: 'string' },
                      status: { type: 'string' },
                      likelihood: { type: 'number' },
                      fitSummary: { type: 'string' },
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

function fallbackLeads(location: string, categories: string[], notes: string) {
  return categories.slice(0, 4).map((category, index) => ({
    organisation: `${location || 'Local'} ${category} candidate`,
    category,
    website: '',
    location,
    contactName: '',
    contactRole: category === 'GP clinic' ? 'Practice Manager' : 'Referrals or Partnerships Lead',
    email: '',
    phone: '',
    status: 'researching',
    likelihood: 72 - index * 5,
    fitSummary: 'Search provider not configured. Verify this placeholder with public research before outreach.',
    needs: ['Referral pathway', 'Clinical support', 'Care coordination'],
    source: 'Fallback discovery',
    nextAction: 'Verify organisation, website, decision maker and contact email.',
    notes,
    lastContactedAt: null,
  }));
}

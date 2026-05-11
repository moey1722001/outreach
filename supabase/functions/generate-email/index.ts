import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function openAiError(response: Response) {
  const body = await response.text();
  const lowerBody = body.toLowerCase();

  if (lowerBody.includes('insufficient_quota') || lowerBody.includes('quota')) {
    return 'Email drafting failed: OpenAI quota has been exceeded. Check the OpenAI project billing/credits for the API key saved in Supabase.';
  }

  if (lowerBody.includes('invalid_api_key') || response.status === 401) {
    return 'Email drafting failed: the configured OpenAI API key was rejected. Check the OPENAI_API_KEY secret saved in Supabase.';
  }

  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message ?? body;
    const code = parsed?.error?.code ?? parsed?.code;

    if (code === 'insufficient_quota' || String(message).toLowerCase().includes('quota')) {
      return 'Email drafting failed: OpenAI quota has been exceeded. Check the OpenAI project billing/credits for the API key saved in Supabase.';
    }

    if (code === 'invalid_api_key' || response.status === 401) {
      return 'Email drafting failed: the configured OpenAI API key was rejected. Check the OPENAI_API_KEY secret saved in Supabase.';
    }

    return `Email drafting failed (${response.status}): ${message}`;
  } catch {
    return `Email drafting failed (${response.status}): ${body}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const { lead, tone = 'warm' } = await req.json();

    if (!openAiKey) {
      return Response.json({ error: 'Email drafting is not configured: missing OPENAI_API_KEY Supabase Edge Function secret.' }, { status: 500, headers: corsHeaders });
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
            content: 'You write concise, ethical B2B outreach emails for an Australian in-home healthcare provider. Use the researched services, likely business needs, suitability summary, concerns and outreach angle. Never claim a partnership, never imply endorsement, never overstate public research, and keep the draft ready for human review before sending.',
          },
          {
            role: 'user',
            content: JSON.stringify({ lead, tone }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'outreach_email',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'body'],
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) throw new Error(await openAiError(response));
    const data = await response.json();
    const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text;
    return Response.json(JSON.parse(text), { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
});

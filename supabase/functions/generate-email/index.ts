import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const { lead, tone = 'warm' } = await req.json();

    if (!openAiKey) {
      return Response.json(localDraft(lead, tone), { headers: corsHeaders });
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

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text;
    return Response.json(JSON.parse(text), { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
});

function localDraft(lead: Record<string, unknown>, tone: string) {
  const organisation = String(lead.organisation ?? '');
  const contactName = String(lead.contactName ?? '');
  const fitSummary = String(lead.fitSummary ?? '');
  const outreachAngle = String(lead.outreachAngle ?? '');
  const firstName = contactName ? contactName.split(' ')[0] : '';
  const services = Array.isArray(lead.servicesOffered) ? lead.servicesOffered.join(', ') : '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  return {
    subject: `Referral support for ${organisation}`,
    body: [
      greeting,
      '',
      `I’m reaching out from Paracare because ${organisation} looks like a relevant organisation for coordinated in-home clinical support.`,
      '',
      'Paracare supports clients who need reliable nursing oversight, clear documentation, and responsive communication between families, coordinators and care teams.',
      '',
      services ? `I noticed your services include ${services}.` : '',
      fitSummary ? `What stood out in our research: ${fitSummary}` : '',
      outreachAngle ? `The potential fit: ${outreachAngle}` : '',
      '',
      tone === 'concise'
        ? 'Would it be worth a brief conversation next week?'
        : 'Would you be open to a short conversation next week to see whether Paracare could be useful for any current or future clients?',
      '',
      'Kind regards,',
      'Paracare',
    ].filter(Boolean).join('\n'),
  };
}

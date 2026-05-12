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

function cleanDraft(draft: { subject?: unknown; body?: unknown }) {
  let subject = String(draft.subject ?? '').trim();
  let body = String(draft.body ?? '').trim();

  subject = subject
    .replace(/\btrusted provider\b/gi, 'clinical support')
    .replace(/\bleading provider\b/gi, 'clinical support')
    .replace(/\s+/g, ' ')
    .slice(0, 90);

  body = body
    .replace(/^\s*(i hope (this|my) (email|message) finds you well\.?\s*)/gim, '')
    .replace(/\bi hope (this|my) (email|message) finds you well\.?\s*/gi, '')
    .replace(/\bemergency paramedics?\b/gi, 'paramedic-led clinical monitoring team')
    .replace(/\bambulance replacement\b/gi, 'community monitoring service')
    .replace(/\bhospital replacement\b/gi, 'community monitoring service')
    .replace(/\bacute care provider\b/gi, 'proactive monitoring service')
    .replace(/\bgeneric support workers?\b/gi, 'clinical monitoring team')
    .replace(/\btrusted provider\b/gi, 'in-home clinical support team')
    .replace(/\bleading provider\b/gi, 'in-home clinical support team')
    .replace(/\bbecome a dependable partner\b/gi, 'be useful for future client referrals')
    .replace(/\bLooking forward to your response\.?/gi, 'Thanks for considering it.')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  body = body
    .replace(/\n?\[Your Name\]\n?/gi, '\nParacare\n')
    .replace(/\n?\[Your Position\]\n?/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!/(kind regards|warm regards)\s*,?\s*\n/i.test(body)) {
    body = `${body}\n\nKind regards,\nParacare`;
  } else if (!/(kind regards|warm regards)[\s\S]*paracare/i.test(body)) {
    body = `${body}\nParacare`;
  }

  return { subject, body };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const { lead, tone = 'warm', modelMode = 'save_tokens' } = await req.json();

    if (!openAiKey) {
      return Response.json({ error: 'Email drafting is not configured: missing OPENAI_API_KEY Supabase Edge Function secret.' }, { status: 500, headers: corsHeaders });
    }

    const model = modelMode === 'save_tokens'
      ? Deno.env.get('OUTREACH_OPENAI_TEST_MODEL') ?? 'gpt-4.1-nano'
      : Deno.env.get('OUTREACH_OPENAI_MODEL') ?? 'gpt-4.1-mini';

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
            content: `You write ethical, high-response B2B outreach emails for Paracare Services, an Australian paramedic-led wellness and clinical monitoring service with a family/provider visibility app.

Paracare in one sentence:
Paramedic-led wellness and clinical monitoring designed to improve visibility, support early deterioration recognition and provide proactive oversight for community-based clients.

What Paracare is:
- Proactive in-home wellness and clinical monitoring for NDIS participants, Home Care Package / Support at Home clients, retirement village residents and complex community care clients.
- A clinical visibility and oversight service for people who need more structure around wellness checks, trend monitoring, family reassurance and escalation recommendations.
- A communication layer between families, providers, coordinators and the client through the Paracare app/dashboard.

What Paracare is not:
- Not a hospital replacement.
- Not an emergency service or ambulance replacement.
- Not an acute care provider.
- Not generic support workers.

Services may include:
- BP, heart rate and SpO2 monitoring.
- 12 lead ECGs when clinically indicated.
- Neuro, CVS, respiratory, abdominal, GI/GU and musculoskeletal systems reviews.
- Falls risk monitoring, wellness assessments, post-discharge oversight, clinical trend reporting and escalation recommendations.

What matters about the Paracare app:
- It gives referrers, families and care stakeholders clearer visibility over wellness checks, observations, visit notes, trends and escalation recommendations.
- It helps reduce uncertainty for families and coordinators by keeping updates and follow-up visible.
- It supports continuity between home visits and helps providers spot deterioration concerns earlier.
- It is useful for NDIS participants with complex needs, SIL homes, HCP clients, older people, falls-risk clients, ABI/neuro/chronic disease clients and people transitioning home after hospital.

Write every email as a fresh, human-reviewed first email. It must not sound like a generic cold email.

Rules:
- Use the organisation's actual services, likely client group, contact role, public facts, suitability summary, concerns and outreach angle.
- If a named person exists, write to that person. Otherwise write naturally to the role/team.
- Lead with a specific reason for contacting them, not a generic introduction.
- Keep it short: 150-210 words unless concise mode is requested.
- Use plain language, clinical credibility, and a calm helpful tone.
- Make the offer concrete: referral support, responsive in-home nursing, escalation, documentation, family/care-team communication, post-discharge support, or complex-care support.
- Explain Paracare and the app in one useful sentence. Do not make the app sound like a generic portal or software pitch.
- Use the terms "wellness monitoring", "clinical monitoring", "trend reporting", "family visibility", "post-discharge oversight" or "escalation recommendations" only where they fit the lead.
- Do not overclaim hospital reduction. You may say Paracare can support early recognition and reduce avoidable hospital presentations where appropriate.
- Ask for a low-friction next step, usually a brief call or the right person to speak with.
- Avoid hype, pressure, fake familiarity, exaggerated claims, spammy subject lines, and "I hope this email finds you well".
- Never use these phrases: "I hope this email finds you well", "I hope this message finds you well", "trusted provider", "leading provider", "touching base", "just checking in", "become a dependable partner", "looking forward to your response", "hospital replacement", "ambulance replacement", "emergency service", "acute care provider", "generic support workers".
- Subject line must be plain, specific and under 8 words.
- Never include placeholders like [Your Name], [Your Position], [Company Name] or [Phone].
- Never claim an existing partnership, endorsement or referral relationship.
- If evidence is weak, acknowledge it gently and ask to be pointed to the right person.

Structure:
1. Specific observation about their organisation or client group.
2. Why Paracare is relevant, including the app's communication/visibility value.
3. Concrete use case for their clients.
4. One simple CTA.

Marketing basis: favour buying-group relevance over over-personalising to one individual; help the recipient quickly understand why this matters to their organisation and clients.`,
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
    const text = outputText(data);
    if (!text) {
      throw new Error('Email drafting failed: the AI model returned no structured text. Try Launch quality mode.');
    }
    return Response.json(cleanDraft(JSON.parse(text)), { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
});

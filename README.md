# Paracare Outreach

Private standalone outreach CRM for healthcare and community partnership leads. This app is intentionally separate from the clinical Paracare app and uses its own Supabase project.

## Local development

From the repository root:

```bash
npm run outreach:dev
```

The app runs on `http://localhost:5174`.

Lead Finder requires Outreach Supabase variables and deployed Edge Functions. It does not return fake/demo lead search results.

## Environment

Copy `outreach/.env.example` to `outreach/.env` and point it at the separate Outreach Supabase project:

```bash
VITE_OUTREACH_SUPABASE_URL=https://YOUR_OUTREACH_PROJECT_REF.supabase.co
VITE_OUTREACH_SUPABASE_ANON_KEY=your_outreach_supabase_anon_key_here
```

The deployed app also includes the public Outreach Supabase URL and publishable anon key as a fallback so it cannot accidentally fall back to the clinical Paracare project or local demo mode. Environment variables are still recommended for future project/key rotation.

Edge Function secrets for AI/search:

```bash
OPENAI_API_KEY=...
OUTREACH_OPENAI_MODEL=gpt-4.1-mini
TAVILY_API_KEY=...
```

`TAVILY_API_KEY` and `OPENAI_API_KEY` are required for Lead Finder. If either is missing, the app shows a clear configuration error instead of returning placeholder leads.

## Supabase

The Outreach Supabase project lives under `outreach/supabase`, separate from the clinical app's root `supabase` folder.

Apply the migration and deploy functions against the separate Outreach project:

```bash
cd outreach
supabase link --project-ref YOUR_OUTREACH_PROJECT_REF
supabase db push
supabase functions deploy discover-leads
supabase functions deploy generate-email
```

Set required Edge Function secrets:

```bash
supabase secrets set TAVILY_API_KEY=...
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OUTREACH_OPENAI_MODEL=gpt-4.1-mini
```

Auth signups are disabled in `outreach/supabase/config.toml`. Invite only the two internal users in the Outreach Supabase dashboard.

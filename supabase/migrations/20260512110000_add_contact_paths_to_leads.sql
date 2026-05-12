alter table public.outreach_leads
  add column if not exists contact_page_url text,
  add column if not exists linkedin_url text;

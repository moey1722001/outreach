alter table public.outreach_leads
  add column if not exists suitability_summary text,
  add column if not exists business_needs text[] not null default '{}',
  add column if not exists outreach_angle text,
  add column if not exists research_confidence integer not null default 0 check (research_confidence between 0 and 100);

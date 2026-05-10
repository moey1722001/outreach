alter table public.outreach_leads
  add column if not exists suburb text,
  add column if not exists postcode text,
  add column if not exists region text,
  add column if not exists radius_km integer,
  add column if not exists contacted_by text,
  add column if not exists follow_up_date date,
  add column if not exists outcome text,
  add column if not exists normalised_email text generated always as (nullif(lower(trim(email)), '')) stored,
  add column if not exists normalised_organisation text generated always as (nullif(lower(regexp_replace(trim(organisation), '\s+', ' ', 'g')), '')) stored,
  add column if not exists normalised_website text generated always as (nullif(regexp_replace(regexp_replace(lower(trim(website)), '^https?://(www\.)?', ''), '/$', ''), '')) stored,
  add column if not exists normalised_phone text generated always as (nullif(regexp_replace(phone, '\D', '', 'g'), '')) stored;

alter table public.outreach_email_drafts
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists created_by text;

create table if not exists public.outreach_contact_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  method text not null check (method in ('email_sent', 'phone_call', 'meeting', 'manual_note')),
  contacted_at timestamptz not null default now(),
  contacted_by text,
  notes text,
  outcome text,
  follow_up_date date,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.outreach_contact_events enable row level security;

drop policy if exists "Owners can delete their leads" on public.outreach_leads;

create policy "Owners can read contact events"
on public.outreach_contact_events for select
to authenticated
using (owner_id = auth.uid());

create policy "Owners can insert contact events"
on public.outreach_contact_events for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Owners can update contact events"
on public.outreach_contact_events for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create index if not exists outreach_leads_area_idx on public.outreach_leads(owner_id, region, suburb, postcode);
create index if not exists outreach_leads_follow_up_idx on public.outreach_leads(owner_id, follow_up_date) where follow_up_date is not null;
create index if not exists outreach_contact_events_lead_idx on public.outreach_contact_events(lead_id, contacted_at desc);
create index if not exists outreach_email_drafts_lead_idx on public.outreach_email_drafts(lead_id, generated_at desc);

create unique index if not exists outreach_unique_email_per_owner
on public.outreach_leads(owner_id, normalised_email)
where normalised_email is not null;

create unique index if not exists outreach_unique_organisation_per_owner
on public.outreach_leads(owner_id, normalised_organisation)
where normalised_organisation is not null;

create unique index if not exists outreach_unique_website_per_owner
on public.outreach_leads(owner_id, normalised_website)
where normalised_website is not null;

create unique index if not exists outreach_unique_phone_per_owner
on public.outreach_leads(owner_id, normalised_phone)
where normalised_phone is not null;

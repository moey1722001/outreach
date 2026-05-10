create type public.outreach_lead_category as enum (
  'NDIS support coordinator',
  'Home Care Package provider',
  'Retirement village',
  'Aged care provider',
  'GP clinic',
  'Allied health provider'
);

create type public.outreach_lead_status as enum (
  'new',
  'researching',
  'qualified',
  'drafted',
  'reviewed',
  'contacted',
  'follow_up',
  'won',
  'not_fit'
);

create table public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  organisation text not null,
  category public.outreach_lead_category not null,
  website text,
  location text,
  contact_name text,
  contact_role text,
  email text,
  phone text,
  status public.outreach_lead_status not null default 'new',
  likelihood integer not null default 50 check (likelihood between 0 and 100),
  fit_summary text,
  needs text[] not null default '{}',
  source text,
  next_action text,
  notes text,
  last_contacted_at timestamptz,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_email_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  subject text not null,
  body text not null,
  tone text not null default 'warm',
  reviewed_at timestamptz,
  sent_at timestamptz,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_outreach_leads_updated_at
before update on public.outreach_leads
for each row execute function public.set_updated_at();

create trigger set_outreach_email_drafts_updated_at
before update on public.outreach_email_drafts
for each row execute function public.set_updated_at();

alter table public.outreach_leads enable row level security;
alter table public.outreach_email_drafts enable row level security;

create policy "Owners can read their leads"
on public.outreach_leads for select
to authenticated
using (owner_id = auth.uid());

create policy "Owners can insert their leads"
on public.outreach_leads for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Owners can update their leads"
on public.outreach_leads for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owners can delete their leads"
on public.outreach_leads for delete
to authenticated
using (owner_id = auth.uid());

create policy "Owners can read drafts"
on public.outreach_email_drafts for select
to authenticated
using (owner_id = auth.uid());

create policy "Owners can insert drafts"
on public.outreach_email_drafts for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Owners can update drafts"
on public.outreach_email_drafts for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create index outreach_leads_owner_status_idx on public.outreach_leads(owner_id, status);
create index outreach_leads_owner_category_idx on public.outreach_leads(owner_id, category);
create index outreach_leads_likelihood_idx on public.outreach_leads(likelihood desc);

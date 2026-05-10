alter type public.outreach_lead_status add value if not exists 'replied';
alter type public.outreach_lead_status add value if not exists 'interested';
alter type public.outreach_lead_status add value if not exists 'meeting_booked';
alter type public.outreach_lead_status add value if not exists 'not_interested';

alter table public.outreach_leads
  add column if not exists services_offered text[] not null default '{}',
  add column if not exists concerns text[] not null default '{}';

alter table public.outreach_contact_events
  add column if not exists email_address_used text,
  add column if not exists draft_subject text,
  add column if not exists draft_body text;

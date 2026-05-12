do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'outreach_leads'
      and policyname = 'Owners can delete their leads'
  ) then
    create policy "Owners can delete their leads"
    on public.outreach_leads for delete
    to authenticated
    using (owner_id = auth.uid());
  end if;
end
$policy$;

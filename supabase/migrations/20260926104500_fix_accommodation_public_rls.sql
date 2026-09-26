-- Fix public accommodation visibility without exposing private host records.
-- Anonymous/customer catalogue reads must not require SELECT on accommodation_hosts.

create or replace function private.accommodation_host_is_public(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accommodation_hosts h
    where h.id = p_host_id
      and h.verification_status = 'approved'
  );
$$;

revoke all on function private.accommodation_host_is_public(uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.accommodation_host_is_public(uuid) to anon, authenticated;

drop policy if exists "accommodation_properties_public_read" on public.accommodation_properties;
drop policy if exists "accommodation_properties_owner_read" on public.accommodation_properties;

create policy "accommodation_properties_public_read"
on public.accommodation_properties
for select
to anon, authenticated
using (
  approval_status = 'approved'
  and is_published = true
  and private.accommodation_host_is_public(host_id)
);

create policy "accommodation_properties_owner_read"
on public.accommodation_properties
for select
to authenticated
using (
  exists (
    select 1
    from public.accommodation_hosts h
    where h.id = accommodation_properties.host_id
      and h.user_id = (select auth.uid())
  )
);

drop policy if exists "accommodation_units_public_read" on public.accommodation_units;
drop policy if exists "accommodation_units_owner_read" on public.accommodation_units;

create policy "accommodation_units_public_read"
on public.accommodation_units
for select
to anon, authenticated
using (
  approval_status = 'approved'
  and is_active = true
  and exists (
    select 1
    from public.accommodation_properties p
    where p.id = accommodation_units.property_id
      and p.approval_status = 'approved'
      and p.is_published = true
      and private.accommodation_host_is_public(p.host_id)
  )
);

create policy "accommodation_units_owner_read"
on public.accommodation_units
for select
to authenticated
using (
  exists (
    select 1
    from public.accommodation_properties p
    join public.accommodation_hosts h on h.id = p.host_id
    where p.id = accommodation_units.property_id
      and h.user_id = (select auth.uid())
  )
);

drop policy if exists "public reads active approved accommodation rates" on public.accommodation_unit_rates;

create policy "public reads active approved accommodation rates"
on public.accommodation_unit_rates
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.accommodation_units u
    join public.accommodation_properties p on p.id = u.property_id
    where u.id = accommodation_unit_rates.unit_id
      and u.approval_status = 'approved'
      and u.is_active = true
      and p.approval_status = 'approved'
      and p.is_published = true
      and private.accommodation_host_is_public(p.host_id)
  )
);

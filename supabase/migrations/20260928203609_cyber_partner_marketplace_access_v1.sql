-- LEOGO DIGITAL MARKET V2
-- Cyber order participant read access + Admin profile-change listing

drop policy if exists cyber_orders_read_participants on public.cyber_orders;
create policy cyber_orders_read_participants on public.cyber_orders
for select to authenticated
using (
  customer_id=(select auth.uid())
  or provider_id=(select auth.uid())
  or private.is_leogo_admin('approvals.read')
);

drop policy if exists cyber_order_files_read_participants on public.cyber_order_files;
create policy cyber_order_files_read_participants on public.cyber_order_files
for select to authenticated
using (
  uploaded_by=(select auth.uid())
  or exists(
    select 1 from public.cyber_orders o
    where o.id=order_id and o.provider_id=(select auth.uid())
  )
  or private.is_leogo_admin('approvals.read')
);

create or replace function public.admin_list_cyber_profile_changes()
returns table(
  id uuid,partner_id uuid,business_name text,email text,status text,submitted_at timestamptz,admin_notes text,payload jsonb
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select r.id,r.partner_id,coalesce(c.business_name,u.email::text,'Cyber Partner'),u.email::text,
         r.status,r.submitted_at,r.admin_notes,
         r.payload||jsonb_build_object('profile_change_request_id',r.id,'partner_type','cyber')
  from public.partner_profile_change_requests r
  left join public.cyber_provider_accounts c on c.user_id=r.partner_id
  left join auth.users u on u.id=r.partner_id
  where r.partner_type='cyber' and r.status in ('submitted','under_review','changes_requested')
  order by r.submitted_at desc;
end
$$;

grant execute on function public.admin_list_cyber_profile_changes() to authenticated;

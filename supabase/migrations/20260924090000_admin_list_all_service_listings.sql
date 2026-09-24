-- Keep approved service listings visible to Admin after they leave Approval Center.

create or replace function public.admin_list_service_listings()
returns table (
  service_id uuid,
  provider_id uuid,
  provider_name text,
  provider_email text,
  service_name text,
  category_name text,
  description text,
  pricing_model text,
  price_from_kes numeric,
  price_to_kes numeric,
  unit_label text,
  service_area text,
  availability_notes text,
  is_available boolean,
  approval_status text,
  admin_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    s.id,
    s.provider_id,
    p.business_name,
    u.email::text,
    s.service_name,
    s.category_name,
    s.description,
    s.pricing_model,
    s.price_from_kes,
    s.price_to_kes,
    s.unit_label,
    s.service_area,
    s.availability_notes,
    s.is_available,
    s.approval_status,
    s.admin_notes,
    s.submitted_at,
    s.approved_at,
    s.created_at,
    s.updated_at
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id = s.provider_id
  left join auth.users u on u.id = s.provider_id
  order by
    case s.approval_status
      when 'pending' then 1
      when 'under_review' then 2
      when 'changes_requested' then 3
      when 'approved' then 4
      when 'rejected' then 5
      else 6
    end,
    s.updated_at desc;
end;
$$;

revoke all on function public.admin_list_service_listings() from public;
grant execute on function public.admin_list_service_listings() to authenticated;

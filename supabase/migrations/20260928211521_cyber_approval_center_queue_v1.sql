
create or replace function public.admin_list_cyber_approvals()
returns table(
  kind text,
  record_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  title text,
  subtitle text,
  amount_kes numeric,
  status text,
  submitted_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  with combined(kind,record_id,applicant_id,applicant_name,applicant_email,title,subtitle,amount_kes,status,submitted_at,payload) as (
    select
      'cyber_application'::text,
      c.user_id,
      c.user_id,
      c.business_name,
      u.email::text,
      'Cyber Partner Registration'::text,
      concat_ws(' · ',c.owner_name,c.town,c.county),
      null::numeric,
      c.application_status,
      coalesce(c.submitted_at,c.created_at),
      to_jsonb(c)
    from public.cyber_provider_accounts c
    left join auth.users u on u.id=c.user_id
    where c.application_status in ('submitted','under_review','changes_requested')

    union all

    select
      'cyber_service'::text,
      s.id,
      s.provider_id,
      c.business_name,
      u.email::text,
      s.service_name,
      concat_ws(' · ',replace(s.service_category,'_',' '),replace(s.pricing_model,'_',' ')),
      s.price_kes::numeric,
      s.approval_status,
      coalesce(s.submitted_at,s.created_at),
      to_jsonb(s) || jsonb_build_object('cyber_business_name',c.business_name)
    from public.cyber_services s
    join public.cyber_provider_accounts c on c.user_id=s.provider_id
    left join auth.users u on u.id=s.provider_id
    where s.approval_status in ('pending','under_review','changes_requested')

    union all

    select
      'cyber_product'::text,
      p.id,
      p.provider_id,
      c.business_name,
      u.email::text,
      p.product_name,
      concat_ws(' · ','Cyber shop item',p.measurement_unit),
      p.price_kes::numeric,
      p.approval_status,
      coalesce(p.submitted_at,p.created_at),
      (to_jsonb(p) - 'image_path')
        || jsonb_build_object(
          'cyber_business_name',c.business_name,
          'cyber_product_image_path',p.image_path
        )
    from public.cyber_products p
    join public.cyber_provider_accounts c on c.user_id=p.provider_id
    left join auth.users u on u.id=p.provider_id
    where p.approval_status in ('pending','under_review','changes_requested')

    union all

    select
      'cyber_profile_change'::text,
      r.id,
      r.partner_id,
      coalesce(c.business_name,u.email::text,'Cyber Partner'),
      u.email::text,
      'Cyber Profile Update'::text,
      'Approved Cyber partner edited shop/profile details · current approved profile remains active',
      null::numeric,
      r.status,
      r.submitted_at,
      r.payload || jsonb_build_object(
        'profile_change_request_id',r.id,
        'partner_type','cyber',
        'admin_notes',r.admin_notes
      )
    from public.partner_profile_change_requests r
    left join public.cyber_provider_accounts c on c.user_id=r.partner_id
    left join auth.users u on u.id=r.partner_id
    where r.partner_type='cyber'
      and r.status in ('submitted','under_review','changes_requested')
  )
  select * from combined
  order by submitted_at desc nulls last,kind,record_id;
end
$$;

revoke execute on function public.admin_list_cyber_approvals() from public, anon;
grant execute on function public.admin_list_cyber_approvals() to authenticated;

-- LEOGO DIGITAL MARKET V2
-- Cyber profile edits are handled by the dedicated Cyber Admin module.

create or replace function public.admin_list_partner_profile_changes()
returns table(kind text, record_id uuid, applicant_id uuid, applicant_name text, applicant_email text, title text, subtitle text, amount_kes numeric, status text, submitted_at timestamptz, payload jsonb)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    case r.partner_type
      when 'seller' then 'seller_profile_change'
      when 'service_provider' then 'service_provider_profile_change'
      when 'transport' then 'transport_provider_profile_change'
      when 'accommodation' then 'accommodation_provider_profile_change'
      when 'premium' then 'premium_partner_profile_change'
    end,
    r.id,r.partner_id,
    coalesce(s.business_name,sp.business_name,tp.business_name,ah.business_name,pp.display_name,u.email::text,'Partner'),
    u.email::text,
    case r.partner_type
      when 'seller' then 'Seller Profile Update'
      when 'service_provider' then 'Service Provider Profile Update'
      when 'transport' then 'Transport Provider Profile Update'
      when 'accommodation' then 'Accommodation Provider Profile Update'
      when 'premium' then 'Premium Profile Update'
    end,
    'Approved partner edited profile · current approved profile remains active',
    null::numeric,r.status,r.submitted_at,
    r.payload||jsonb_build_object('profile_change_request_id',r.id,'partner_type',r.partner_type,'admin_notes',r.admin_notes)
  from public.partner_profile_change_requests r
  left join auth.users u on u.id=r.partner_id
  left join public.seller_accounts s on r.partner_type='seller' and s.user_id=r.partner_id
  left join public.service_provider_accounts sp on r.partner_type='service_provider' and sp.user_id=r.partner_id
  left join public.transport_provider_accounts tp on r.partner_type='transport' and tp.user_id=r.partner_id
  left join public.accommodation_hosts ah on r.partner_type='accommodation' and ah.user_id=r.partner_id
  left join public.premium_profiles pp on r.partner_type='premium' and pp.user_id=r.partner_id
  where r.status in ('submitted','under_review','changes_requested')
    and r.partner_type<>'cyber'
  order by r.submitted_at desc;
end
$$;


create or replace function public.admin_network_overview_extended()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('dashboard.read') then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'transport_providers',jsonb_build_object(
      'supported',true,
      'value',(select count(*) from public.transport_provider_accounts where application_status='approved')
    ),
    'cyber_providers',jsonb_build_object(
      'supported',true,
      'value',(select count(*) from public.cyber_provider_accounts where application_status='approved')
    ),
    'health_medicine_providers',jsonb_build_object(
      'supported',true,
      'value',(select count(*) from public.health_medicine_accounts where application_status='approved')
    ),
    'leogo_riders',jsonb_build_object(
      'supported',true,
      'value',(select count(*) from public.leogo_staff where status='active' and staff_role='rider')
    ),
    'property_listings',jsonb_build_object(
      'supported',true,
      'value',(
        select count(*)
        from public.vacant_house_listings
        where approval_status='approved' and availability_status='vacant'
      )
    )
  );
end
$function$;

revoke all on function public.admin_network_overview_extended() from public,anon;
grant execute on function public.admin_network_overview_extended() to authenticated;

notify pgrst,'reload schema';

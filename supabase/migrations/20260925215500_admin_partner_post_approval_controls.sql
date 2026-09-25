-- LEOGO V2: post-approval Admin record views and safe suspension controls.
-- Applied to production on 2026-09-25.

create or replace function public.admin_get_service_provider_record(p_provider_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_account jsonb; v_services jsonb;
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  select to_jsonb(p) || jsonb_build_object('email',u.email::text) into v_account
  from public.service_provider_accounts p left join auth.users u on u.id=p.user_id
  where p.user_id=p_provider_id;
  if v_account is null then raise exception 'Service Provider not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc),'[]'::jsonb) into v_services
  from public.service_provider_services s where s.provider_id=p_provider_id;
  return jsonb_build_object('account',v_account,'services',v_services);
end $$;

create or replace function public.admin_get_transport_provider_record(p_provider_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_account jsonb; v_vehicles jsonb;
begin
  if not (private.is_leogo_admin('approvals.read') or private.is_leogo_admin('delivery.manage')) then raise exception 'Admin access required'; end if;
  select to_jsonb(p) || jsonb_build_object('email',u.email::text) into v_account
  from public.transport_provider_accounts p left join auth.users u on u.id=p.user_id
  where p.user_id=p_provider_id;
  if v_account is null then raise exception 'Transport Provider not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.updated_at desc),'[]'::jsonb) into v_vehicles
  from public.transport_provider_vehicles v where v.provider_id=p_provider_id;
  return jsonb_build_object('account',v_account,'vehicles',v_vehicles);
end $$;

create or replace function public.admin_set_service_provider_account_status(p_provider_id uuid,p_suspended boolean,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  select to_jsonb(p),p.business_name into v_before,v_name from public.service_provider_accounts p where p.user_id=p_provider_id for update;
  if v_before is null then raise exception 'Service Provider not found'; end if;
  if not p_suspended and (v_before->>'approved_at') is null then raise exception 'Only a previously approved account can be reactivated'; end if;
  update public.service_provider_accounts
  set application_status=case when p_suspended then 'suspended' else 'approved' end,
      availability_status=case when p_suspended then 'offline' else 'available' end,
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),updated_at=now()
  where user_id=p_provider_id;
  select to_jsonb(p) into v_after from public.service_provider_accounts p where p.user_id=p_provider_id;
  perform private.notify_partner(p_provider_id,'service_provider',
    case when p_suspended then 'service_provider_suspended' else 'service_provider_reactivated' end,
    case when p_suspended then 'Service Provider account suspended' else 'Service Provider account reactivated' end,
    case when p_suspended then 'LEOGO Admin suspended your Service Provider account. Your profile and services are hidden from customers.'
      else 'LEOGO Admin reactivated your Service Provider account. Approved available services can appear to customers again.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'service_provider_account',p_provider_id,'provider-profile',jsonb_build_object('suspended',p_suspended));
  perform private.write_admin_audit(
    case when p_suspended then 'service_provider.account_suspended' else 'service_provider.account_reactivated' end,
    'service_provider_account',p_provider_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'provider_id',p_provider_id,'application_status',v_after->>'application_status');
end $$;

create or replace function public.admin_set_service_listing_availability(p_service_id uuid,p_active boolean,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  select to_jsonb(s),s.provider_id,s.service_name into v_before,v_provider,v_name
  from public.service_provider_services s where s.id=p_service_id for update;
  if v_before is null then raise exception 'Service listing not found'; end if;
  if (v_before->>'approval_status') <> 'approved' then raise exception 'Only approved services can be activated or suspended'; end if;
  update public.service_provider_services
  set is_available=p_active,admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),updated_at=now()
  where id=p_service_id;
  select to_jsonb(s) into v_after from public.service_provider_services s where s.id=p_service_id;
  perform private.notify_partner(v_provider,'service_provider',
    case when p_active then 'service_listing_reactivated' else 'service_listing_suspended' end,
    case when p_active then 'Service listing reactivated' else 'Service listing suspended' end,
    v_name||case when p_active then ' is active again on LEOGO.' else ' has been suspended and is hidden from customers.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'service_listing',p_service_id,'provider-services',jsonb_build_object('is_available',p_active));
  perform private.write_admin_audit(
    case when p_active then 'service_listing.reactivated' else 'service_listing.suspended' end,
    'service_listing',p_service_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'service_id',p_service_id,'is_available',p_active);
end $$;

create or replace function public.admin_set_transport_provider_account_status(p_provider_id uuid,p_suspended boolean,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  select to_jsonb(p) into v_before from public.transport_provider_accounts p where p.user_id=p_provider_id for update;
  if v_before is null then raise exception 'Transport Provider not found'; end if;
  if not p_suspended and (v_before->>'approved_at') is null then raise exception 'Only a previously approved account can be reactivated'; end if;
  update public.transport_provider_accounts
  set application_status=case when p_suspended then 'suspended' else 'approved' end,
      availability_status=case when p_suspended then 'offline' else 'available' end,
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),updated_at=now()
  where user_id=p_provider_id;
  select to_jsonb(p) into v_after from public.transport_provider_accounts p where p.user_id=p_provider_id;
  perform private.notify_partner(p_provider_id,'transport',
    case when p_suspended then 'transport_provider_suspended' else 'transport_provider_reactivated' end,
    case when p_suspended then 'Transport Provider account suspended' else 'Transport Provider account reactivated' end,
    case when p_suspended then 'LEOGO Admin suspended your Transport Provider account. Your vehicles are hidden from customers.'
      else 'LEOGO Admin reactivated your Transport Provider account. Approved available vehicles can appear to customers again.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'transport_provider_account',p_provider_id,'transport-profile',jsonb_build_object('suspended',p_suspended));
  perform private.write_admin_audit(
    case when p_suspended then 'transport_provider.account_suspended' else 'transport_provider.account_reactivated' end,
    'transport_provider_account',p_provider_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'provider_id',p_provider_id,'application_status',v_after->>'application_status');
end $$;

create or replace function public.admin_set_transport_vehicle_availability(p_vehicle_id uuid,p_active boolean,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_label text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  select to_jsonb(v),v.provider_id,concat_ws(' ',v.vehicle_type,v.registration_number)
    into v_before,v_provider,v_label from public.transport_provider_vehicles v where v.id=p_vehicle_id for update;
  if v_before is null then raise exception 'Transport vehicle not found'; end if;
  if p_active and (v_before->>'approved_at') is null then raise exception 'Only a previously approved vehicle can be reactivated'; end if;
  update public.transport_provider_vehicles
  set is_available=p_active,approval_status=case when p_active then 'approved' else 'disabled' end,
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),updated_at=now()
  where id=p_vehicle_id;
  select to_jsonb(v) into v_after from public.transport_provider_vehicles v where v.id=p_vehicle_id;
  perform private.notify_partner(v_provider,'transport',
    case when p_active then 'transport_vehicle_reactivated' else 'transport_vehicle_suspended' end,
    case when p_active then 'Vehicle reactivated' else 'Vehicle suspended' end,
    v_label||case when p_active then ' is active again on LEOGO.' else ' has been suspended and is hidden from customers.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'transport_vehicle',p_vehicle_id,'transport-vehicles',
    jsonb_build_object('is_available',p_active,'approval_status',v_after->>'approval_status'));
  perform private.write_admin_audit(
    case when p_active then 'transport_vehicle.reactivated' else 'transport_vehicle.suspended' end,
    'transport_vehicle',p_vehicle_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'vehicle_id',p_vehicle_id,'is_available',p_active,'approval_status',v_after->>'approval_status');
end $$;

revoke all on function public.admin_get_service_provider_record(uuid) from public;
revoke all on function public.admin_get_transport_provider_record(uuid) from public;
revoke all on function public.admin_set_service_provider_account_status(uuid,boolean,text) from public;
revoke all on function public.admin_set_service_listing_availability(uuid,boolean,text) from public;
revoke all on function public.admin_set_transport_provider_account_status(uuid,boolean,text) from public;
revoke all on function public.admin_set_transport_vehicle_availability(uuid,boolean,text) from public;
grant execute on function public.admin_get_service_provider_record(uuid) to authenticated;
grant execute on function public.admin_get_transport_provider_record(uuid) to authenticated;
grant execute on function public.admin_set_service_provider_account_status(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_service_listing_availability(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_transport_provider_account_status(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_transport_vehicle_availability(uuid,boolean,text) to authenticated;

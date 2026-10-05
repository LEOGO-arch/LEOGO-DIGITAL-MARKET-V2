-- Expand browser location pinning to Service Provider accounts without changing
-- the existing Service Provider, Seller, Transport, order or approval workflows.
-- Old RPCs remain available for cached clients.

alter table public.service_provider_accounts
  add column if not exists shop_latitude numeric,
  add column if not exists shop_longitude numeric,
  add column if not exists shop_map_link text;

alter table public.service_provider_accounts
  drop constraint if exists service_provider_shop_latitude_check;
alter table public.service_provider_accounts
  add constraint service_provider_shop_latitude_check
  check (shop_latitude is null or shop_latitude between -90 and 90);

alter table public.service_provider_accounts
  drop constraint if exists service_provider_shop_longitude_check;
alter table public.service_provider_accounts
  add constraint service_provider_shop_longitude_check
  check (shop_longitude is null or shop_longitude between -180 and 180);

create or replace function public.submit_service_provider_application_v2(
  p_business_name text,
  p_owner_name text,
  p_id_number text,
  p_phone text,
  p_primary_service text,
  p_service_category text,
  p_experience_years integer,
  p_county_code text,
  p_sub_county_code text,
  p_town text,
  p_location_details text,
  p_business_description text,
  p_service_area_notes text,
  p_business_id_document_path text,
  p_shop_latitude numeric default null,
  p_shop_longitude numeric default null,
  p_shop_map_link text default null,
  p_business_licence_path text default null,
  p_registration_certificate_path text default null,
  p_professional_licence_path text default null,
  p_other_permit_paths text[] default '{}'::text[]
)
returns public.service_provider_accounts
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_row public.service_provider_accounts;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if (p_shop_latitude is null) <> (p_shop_longitude is null) then
    raise exception 'Enter both service-base latitude and longitude, or leave both blank';
  end if;
  if p_shop_latitude is not null and (p_shop_latitude < -90 or p_shop_latitude > 90) then
    raise exception 'Service-base latitude is invalid';
  end if;
  if p_shop_longitude is not null and (p_shop_longitude < -180 or p_shop_longitude > 180) then
    raise exception 'Service-base longitude is invalid';
  end if;

  v_row := public.submit_service_provider_application(
    p_business_name,
    p_owner_name,
    p_id_number,
    p_phone,
    p_primary_service,
    p_service_category,
    p_experience_years,
    p_county_code,
    p_sub_county_code,
    p_town,
    p_location_details,
    p_business_description,
    p_service_area_notes,
    p_business_id_document_path,
    p_business_licence_path,
    p_registration_certificate_path,
    p_professional_licence_path,
    p_other_permit_paths
  );

  update public.service_provider_accounts
  set shop_latitude=p_shop_latitude,
      shop_longitude=p_shop_longitude,
      shop_map_link=nullif(btrim(coalesce(p_shop_map_link,'')),''),
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;

  return v_row;
end
$function$;

revoke all on function public.submit_service_provider_application_v2(
  text,text,text,text,text,text,integer,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text[]
) from public,anon;
grant execute on function public.submit_service_provider_application_v2(
  text,text,text,text,text,text,integer,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text[]
) to authenticated;

create or replace function public.service_provider_submit_profile_change_v2(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
  v_change_id uuid;
  v_lat numeric;
  v_lng numeric;
  v_has_lat boolean := p_payload ? 'shop_latitude';
  v_has_lng boolean := p_payload ? 'shop_longitude';
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Profile details are required'; end if;

  if nullif(p_payload->>'shop_latitude','') is not null then
    v_lat := (p_payload->>'shop_latitude')::numeric;
  end if;
  if nullif(p_payload->>'shop_longitude','') is not null then
    v_lng := (p_payload->>'shop_longitude')::numeric;
  end if;

  if (v_lat is null) <> (v_lng is null) then
    raise exception 'Enter both service-base latitude and longitude, or leave both blank';
  end if;
  if v_lat is not null and (v_lat < -90 or v_lat > 90) then raise exception 'Service-base latitude is invalid'; end if;
  if v_lng is not null and (v_lng < -180 or v_lng > 180) then raise exception 'Service-base longitude is invalid'; end if;

  v_result := public.partner_submit_profile_change('service_provider',p_payload);
  v_change_id := (v_result->>'change_id')::uuid;

  update public.partner_profile_change_requests
  set payload = payload || jsonb_build_object(
        'shop_latitude',case when v_has_lat then to_jsonb(v_lat) else 'null'::jsonb end,
        'shop_longitude',case when v_has_lng then to_jsonb(v_lng) else 'null'::jsonb end,
        'shop_map_link',to_jsonb(nullif(btrim(coalesce(p_payload->>'shop_map_link','')),''))
      ),
      updated_at=now()
  where id=v_change_id
    and partner_id=v_uid
    and partner_type='service_provider';

  return v_result;
end
$function$;

revoke all on function public.service_provider_submit_profile_change_v2(jsonb) from public,anon;
grant execute on function public.service_provider_submit_profile_change_v2(jsonb) to authenticated;

create or replace function private.apply_service_provider_profile_pin_on_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.partner_type='service_provider'
     and new.status='approved'
     and old.status is distinct from new.status
     and (
       new.payload ? 'shop_latitude'
       or new.payload ? 'shop_longitude'
       or new.payload ? 'shop_map_link'
     )
  then
    update public.service_provider_accounts
    set shop_latitude=case
          when new.payload ? 'shop_latitude' and nullif(new.payload->>'shop_latitude','') is not null
            then (new.payload->>'shop_latitude')::numeric
          when new.payload ? 'shop_latitude' then null
          else shop_latitude end,
        shop_longitude=case
          when new.payload ? 'shop_longitude' and nullif(new.payload->>'shop_longitude','') is not null
            then (new.payload->>'shop_longitude')::numeric
          when new.payload ? 'shop_longitude' then null
          else shop_longitude end,
        shop_map_link=case
          when new.payload ? 'shop_map_link'
            then nullif(btrim(coalesce(new.payload->>'shop_map_link','')),'')
          else shop_map_link end,
        updated_at=now()
    where user_id=new.partner_id;
  end if;
  return new;
end
$function$;

drop trigger if exists service_provider_profile_pin_approval
on public.partner_profile_change_requests;

create trigger service_provider_profile_pin_approval
after update of status
on public.partner_profile_change_requests
for each row
execute function private.apply_service_provider_profile_pin_on_approval();

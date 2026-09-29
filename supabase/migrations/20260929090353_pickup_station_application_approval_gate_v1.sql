-- Pickup Station Partner application/approval gate.
create table if not exists public.pickup_station_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  station_name text not null,
  applicant_name text not null,
  id_number text not null,
  phone text not null,
  county text not null,
  sub_county text not null,
  town text not null,
  address_line text not null,
  landmark text,
  door_number text,
  operating_hours text,
  latitude numeric,
  longitude numeric,
  map_link text,
  application_status text not null default 'pending'
    check (application_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  approved_station_id uuid references public.pickup_stations(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_station_applications_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create index if not exists pickup_station_applications_status_submitted_idx
  on public.pickup_station_applications(application_status,submitted_at desc);

alter table public.pickup_station_applications enable row level security;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_approvals()
 RETURNS TABLE(kind text, record_id uuid, applicant_id uuid, applicant_name text, applicant_email text, title text, subtitle text, amount_kes numeric, status text, submitted_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin approval access required';
  end if;

  return query
  select
    'pickup_station_application'::text as kind,
    a.id as record_id,
    a.user_id as applicant_id,
    a.applicant_name,
    u.email::text as applicant_email,
    a.station_name as title,
    (a.town||' · '||a.sub_county||' · '||a.county)::text as subtitle,
    null::numeric as amount_kes,
    a.application_status as status,
    a.submitted_at,
    jsonb_build_object(
      'station_name',a.station_name,
      'applicant_name',a.applicant_name,
      'id_number',a.id_number,
      'phone',a.phone,
      'county',a.county,
      'sub_county',a.sub_county,
      'town',a.town,
      'address_line',a.address_line,
      'landmark',a.landmark,
      'door_number',a.door_number,
      'operating_hours',a.operating_hours,
      'latitude',a.latitude,
      'longitude',a.longitude,
      'map_link',a.map_link,
      'admin_notes',a.admin_notes
    ) as payload
  from public.pickup_station_applications a
  left join auth.users u on u.id=a.user_id
  where a.application_status in ('pending','under_review','changes_requested')
  order by a.submitted_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_pickup_station_application(p_record_id uuid, p_decision text, p_notes text DEFAULT NULL::text, p_service_fee_percent numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.pickup_station_applications%rowtype;
  v_station_id uuid;
  v_display_order smallint;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Admin approval permission required';
  end if;

  if p_decision not in ('under_review','changes_requested','reject','approve') then
    raise exception 'Unsupported Pickup Station approval decision';
  end if;

  if p_decision in ('changes_requested','reject') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a clear Admin note';
  end if;

  if p_service_fee_percent is null or p_service_fee_percent<0 or p_service_fee_percent>100 then
    raise exception 'Pickup Station service fee must be between 0 and 100 percent';
  end if;

  select * into v_app
  from public.pickup_station_applications
  where id=p_record_id
  for update;

  if not found then raise exception 'Pickup Station application not found'; end if;
  if v_app.application_status='approved' then
    return jsonb_build_object('ok',true,'already_approved',true,'station_id',v_app.approved_station_id);
  end if;

  if p_decision='under_review' then
    update public.pickup_station_applications
    set application_status='under_review',
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_record_id;

    perform private.notify_partner(
      v_app.user_id,'pickup_station','application_under_review',
      'Pickup Station application under review',
      'LEOGO Admin is reviewing your Pickup Station application for '||v_app.station_name||'.',
      'pickup_station_application',v_app.id,'pickup-application',
      jsonb_build_object('application_id',v_app.id,'status','under_review')
    );

  elsif p_decision='changes_requested' then
    update public.pickup_station_applications
    set application_status='changes_requested',
        admin_notes=btrim(p_notes),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_record_id;

    perform private.notify_partner(
      v_app.user_id,'pickup_station','application_changes_requested',
      'Pickup Station application needs correction',
      'LEOGO Admin requested changes to your Pickup Station application. Open the Pickup Station card to correct and resubmit.',
      'pickup_station_application',v_app.id,'pickup-application',
      jsonb_build_object('application_id',v_app.id,'status','changes_requested','admin_notes',btrim(p_notes))
    );

  elsif p_decision='reject' then
    update public.pickup_station_applications
    set application_status='rejected',
        admin_notes=btrim(p_notes),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_record_id;

    perform private.notify_partner(
      v_app.user_id,'pickup_station','application_rejected',
      'Pickup Station application not approved',
      'Your Pickup Station application for '||v_app.station_name||' was not approved. Open the Pickup Station card to review the Admin note.',
      'pickup_station_application',v_app.id,'pickup-application',
      jsonb_build_object('application_id',v_app.id,'status','rejected','admin_notes',btrim(p_notes))
    );

  else
    if exists(
      select 1 from public.pickup_station_partner_accounts a
      where a.user_id=v_app.user_id and a.status='active'
    ) then
      select pickup_station_id into v_station_id
      from public.pickup_station_partner_accounts
      where user_id=v_app.user_id;
    else
      select coalesce(max(display_order),0)+1 into v_display_order
      from public.pickup_stations;

      insert into public.pickup_stations(
        station_name,county,sub_county,town,address_line,landmark,door_number,
        service_fee_percent,is_active,display_order,updated_by,contact_phone,
        operating_hours,latitude,longitude,map_link
      )
      values(
        v_app.station_name,v_app.county,v_app.sub_county,v_app.town,v_app.address_line,
        v_app.landmark,v_app.door_number,round(p_service_fee_percent,3),true,v_display_order,
        (select auth.uid()),v_app.phone,v_app.operating_hours,v_app.latitude,v_app.longitude,v_app.map_link
      )
      returning id into v_station_id;

      insert into public.pickup_station_partner_accounts(
        user_id,pickup_station_id,display_name,phone,status,assigned_by,assigned_at
      )
      values(
        v_app.user_id,v_station_id,v_app.applicant_name,v_app.phone,'active',(select auth.uid()),now()
      );
    end if;

    update public.pickup_station_applications
    set application_status='approved',
        approved_station_id=v_station_id,
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_record_id;

    perform private.notify_partner(
      v_app.user_id,'pickup_station','application_approved',
      'Pickup Station application approved',
      'Your Pickup Station application for '||v_app.station_name||' is approved. Open the Pickup Station card to access your dashboard.',
      'pickup_station',v_station_id,'pickup-dashboard',
      jsonb_build_object('application_id',v_app.id,'pickup_station_id',v_station_id,'status','approved')
    );
  end if;

  perform private.write_admin_audit(
    'pickup.application.'||p_decision,'pickup_station_application',v_app.id::text,
    to_jsonb(v_app),
    jsonb_build_object('decision',p_decision,'station_id',v_station_id,'service_fee_percent',p_service_fee_percent),
    jsonb_build_object('notes',p_notes)
  );

  return jsonb_build_object(
    'ok',true,
    'decision',p_decision,
    'application_id',v_app.id,
    'pickup_station_id',v_station_id
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_get_application()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_app public.pickup_station_applications%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_app
  from public.pickup_station_applications
  where user_id=v_uid;

  if not found then
    return jsonb_build_object('exists',false);
  end if;

  return jsonb_build_object(
    'exists',true,
    'application',to_jsonb(v_app)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_submit_application(p_station_name text, p_applicant_name text, p_id_number text, p_phone text, p_county text, p_sub_county text, p_town text, p_address_line text, p_landmark text DEFAULT NULL::text, p_door_number text DEFAULT NULL::text, p_operating_hours text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_map_link text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.pickup_station_applications%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  if exists(
    select 1 from public.pickup_station_partner_accounts a
    where a.user_id=v_uid and a.status='active'
  ) then
    raise exception 'Your account already has active Pickup Station access';
  end if;

  if char_length(btrim(coalesce(p_station_name,'')))<2 then raise exception 'Enter the Pickup Station / business name'; end if;
  if char_length(btrim(coalesce(p_applicant_name,'')))<2 then raise exception 'Enter the applicant name'; end if;
  if char_length(btrim(coalesce(p_id_number,'')))<4 then raise exception 'Enter a valid ID / business identification number'; end if;
  if char_length(regexp_replace(coalesce(p_phone,''),'\D','','g'))<9 then raise exception 'Enter a valid phone number'; end if;
  if char_length(btrim(coalesce(p_county,'')))<2 then raise exception 'Enter the county'; end if;
  if char_length(btrim(coalesce(p_sub_county,'')))<2 then raise exception 'Enter the sub-county'; end if;
  if char_length(btrim(coalesce(p_town,'')))<2 then raise exception 'Enter the town / trading centre'; end if;
  if char_length(btrim(coalesce(p_address_line,'')))<3 then raise exception 'Enter the station address'; end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be supplied together';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then
    raise exception 'Invalid station coordinates';
  end if;

  select * into v_existing
  from public.pickup_station_applications
  where user_id=v_uid
  for update;

  if found and v_existing.application_status in ('pending','under_review') then
    raise exception 'Your Pickup Station application is already awaiting Admin review';
  end if;
  if found and v_existing.application_status='approved' then
    raise exception 'Your Pickup Station application is already approved';
  end if;

  insert into public.pickup_station_applications(
    user_id,station_name,applicant_name,id_number,phone,county,sub_county,town,address_line,
    landmark,door_number,operating_hours,latitude,longitude,map_link,application_status,
    admin_notes,submitted_at,reviewed_at,reviewed_by,updated_at
  )
  values(
    v_uid,btrim(p_station_name),btrim(p_applicant_name),btrim(p_id_number),btrim(p_phone),
    btrim(p_county),btrim(p_sub_county),btrim(p_town),btrim(p_address_line),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_door_number,'')),''),
    nullif(btrim(coalesce(p_operating_hours,'')),''),
    p_latitude,p_longitude,nullif(btrim(coalesce(p_map_link,'')),''),
    'pending',null,now(),null,null,now()
  )
  on conflict(user_id) do update
  set station_name=excluded.station_name,
      applicant_name=excluded.applicant_name,
      id_number=excluded.id_number,
      phone=excluded.phone,
      county=excluded.county,
      sub_county=excluded.sub_county,
      town=excluded.town,
      address_line=excluded.address_line,
      landmark=excluded.landmark,
      door_number=excluded.door_number,
      operating_hours=excluded.operating_hours,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      map_link=excluded.map_link,
      application_status='pending',
      admin_notes=null,
      submitted_at=now(),
      reviewed_at=null,
      reviewed_by=null,
      updated_at=now()
  returning id into v_id;

  perform private.write_admin_audit(
    'pickup.application.submitted','pickup_station_application',v_id::text,
    null,jsonb_build_object('user_id',v_uid,'station_name',btrim(p_station_name)),
    jsonb_build_object('actor_role','pickup_station_applicant')
  );

  return jsonb_build_object('ok',true,'application_id',v_id,'status','pending');
end
$function$;

revoke all on function public.pickup_partner_get_application() from public,anon;
revoke all on function public.pickup_partner_submit_application(text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,text) from public,anon;
revoke all on function public.admin_list_pickup_station_approvals() from public,anon;
revoke all on function public.admin_review_pickup_station_application(uuid,text,text,numeric) from public,anon;

grant execute on function public.pickup_partner_get_application() to authenticated;
grant execute on function public.pickup_partner_submit_application(text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,text) to authenticated;
grant execute on function public.admin_list_pickup_station_approvals() to authenticated;
grant execute on function public.admin_review_pickup_station_application(uuid,text,text,numeric) to authenticated;

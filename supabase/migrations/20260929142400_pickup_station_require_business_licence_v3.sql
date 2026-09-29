-- Pickup Station applications require a Business ID / identification document and Business licence.

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

  if p_decision='approve' then
    if v_app.business_id_document_path is null then
      raise exception 'Business ID / identification document is required before approval';
    end if;
    if v_app.business_licence_path is null then
      raise exception 'Business licence is required before approval';
    end if;
    if not private.pickup_verification_path_owned(v_app.user_id,v_app.business_id_document_path) then
      raise exception 'Business ID / identification upload is missing or invalid';
    end if;
    if not private.pickup_verification_path_owned(v_app.user_id,v_app.business_licence_path) then
      raise exception 'Business licence upload is missing or invalid';
    end if;
    if v_app.registration_certificate_path is not null
       and not private.pickup_verification_path_owned(v_app.user_id,v_app.registration_certificate_path) then
      raise exception 'Registration certificate upload is missing or invalid';
    end if;
    if exists(
      select 1 from unnest(v_app.other_permit_paths) p(path)
      where not private.pickup_verification_path_owned(v_app.user_id,p.path)
    ) then
      raise exception 'One or more other permit uploads are missing or invalid';
    end if;
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

CREATE OR REPLACE FUNCTION public.pickup_partner_submit_application(p_station_name text, p_applicant_name text, p_id_number text, p_phone text, p_county text, p_sub_county text, p_town text, p_address_line text, p_landmark text DEFAULT NULL::text, p_door_number text DEFAULT NULL::text, p_operating_hours text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_map_link text DEFAULT NULL::text, p_business_id_document_path text DEFAULT NULL::text, p_business_licence_path text DEFAULT NULL::text, p_registration_certificate_path text DEFAULT NULL::text, p_other_permit_paths text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.pickup_station_applications%rowtype;
  v_id uuid;
  v_business_id text;
  v_business_licence text;
  v_registration_certificate text;
  v_other_permits text[];
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
  if char_length(btrim(coalesce(p_county,'')))<2 then raise exception 'Choose the county'; end if;
  if char_length(btrim(coalesce(p_sub_county,'')))<2 then raise exception 'Choose the sub-county'; end if;
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

  v_business_id:=coalesce(nullif(btrim(coalesce(p_business_id_document_path,'')),''),v_existing.business_id_document_path);
  v_business_licence:=coalesce(nullif(btrim(coalesce(p_business_licence_path,'')),''),v_existing.business_licence_path);
  v_registration_certificate:=coalesce(nullif(btrim(coalesce(p_registration_certificate_path,'')),''),v_existing.registration_certificate_path);
  v_other_permits:=case
    when coalesce(array_length(p_other_permit_paths,1),0)>0 then p_other_permit_paths
    else coalesce(v_existing.other_permit_paths,'{}'::text[])
  end;

  if v_business_id is null then
    raise exception 'Business ID / identification document is required';
  end if;
  if v_business_licence is null then
    raise exception 'Business licence is required for Pickup Station verification';
  end if;
  if coalesce(array_length(v_other_permits,1),0)>4 then
    raise exception 'Upload a maximum of 4 other permit files';
  end if;

  if not private.pickup_verification_path_owned(v_uid,v_business_id) then
    raise exception 'Business ID / identification document upload could not be verified';
  end if;
  if not private.pickup_verification_path_owned(v_uid,v_business_licence) then
    raise exception 'Business licence upload could not be verified';
  end if;
  if v_registration_certificate is not null
     and not private.pickup_verification_path_owned(v_uid,v_registration_certificate) then
    raise exception 'Registration certificate upload could not be verified';
  end if;
  if exists(
    select 1 from unnest(v_other_permits) p(path)
    where not private.pickup_verification_path_owned(v_uid,p.path)
  ) then
    raise exception 'One or more other permit uploads could not be verified';
  end if;

  insert into public.pickup_station_applications(
    user_id,station_name,applicant_name,id_number,phone,county,sub_county,town,address_line,
    landmark,door_number,operating_hours,latitude,longitude,map_link,
    business_id_document_path,business_licence_path,registration_certificate_path,other_permit_paths,
    application_status,admin_notes,submitted_at,reviewed_at,reviewed_by,updated_at
  )
  values(
    v_uid,btrim(p_station_name),btrim(p_applicant_name),btrim(p_id_number),btrim(p_phone),
    btrim(p_county),btrim(p_sub_county),btrim(p_town),btrim(p_address_line),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_door_number,'')),''),
    nullif(btrim(coalesce(p_operating_hours,'')),''),
    p_latitude,p_longitude,nullif(btrim(coalesce(p_map_link,'')),''),
    v_business_id,v_business_licence,v_registration_certificate,v_other_permits,
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
      business_id_document_path=excluded.business_id_document_path,
      business_licence_path=excluded.business_licence_path,
      registration_certificate_path=excluded.registration_certificate_path,
      other_permit_paths=excluded.other_permit_paths,
      application_status='pending',
      admin_notes=null,
      submitted_at=now(),
      reviewed_at=null,
      reviewed_by=null,
      updated_at=now()
  returning id into v_id;

  perform private.write_admin_audit(
    'pickup.application.submitted','pickup_station_application',v_id::text,
    null,
    jsonb_build_object(
      'user_id',v_uid,
      'station_name',btrim(p_station_name),
      'business_id_uploaded',true,
      'business_licence_uploaded',true,
      'registration_certificate_uploaded',v_registration_certificate is not null,
      'other_permit_count',coalesce(array_length(v_other_permits,1),0)
    ),
    jsonb_build_object('actor_role','pickup_station_applicant')
  );

  return jsonb_build_object('ok',true,'application_id',v_id,'status','pending');
end
$function$;


alter table public.partner_profile_change_requests
  drop constraint if exists partner_profile_change_requests_partner_type_check;

alter table public.partner_profile_change_requests
  add constraint partner_profile_change_requests_partner_type_check
  check (partner_type = any(array[
    'seller'::text,
    'service_provider'::text,
    'transport'::text,
    'accommodation'::text,
    'premium'::text
  ]));

create or replace function public.accommodation_provider_submit_profile_change(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_host public.accommodation_hosts%rowtype;
  v_clean jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Profile details are required'; end if;

  select * into v_host
  from public.accommodation_hosts
  where user_id=v_uid and verification_status='approved';

  if not found then raise exception 'Approved Accommodation Provider account required'; end if;

  if char_length(btrim(coalesce(p_payload->>'business_name','')))<2 then raise exception 'Business or operator name is required'; end if;
  if char_length(btrim(coalesce(p_payload->>'owner_name','')))<2 then raise exception 'Owner / manager name is required'; end if;
  if char_length(btrim(coalesce(p_payload->>'id_number','')))<4 then raise exception 'Identification number is required'; end if;
  if coalesce(p_payload->>'phone','') !~ '^\+254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if char_length(btrim(coalesce(p_payload->>'county','')))<2 or char_length(btrim(coalesce(p_payload->>'sub_county','')))<2 then raise exception 'County and Sub-County are required'; end if;
  if char_length(btrim(coalesce(p_payload->>'town','')))<2 or char_length(btrim(coalesce(p_payload->>'location_details','')))<3 then raise exception 'Town and business location are required'; end if;
  if nullif(p_payload->>'base_latitude','') is null or nullif(p_payload->>'base_longitude','') is null then raise exception 'Pin the Accommodation location before submitting changes'; end if;
  if (p_payload->>'base_latitude')::numeric not between -90 and 90 or (p_payload->>'base_longitude')::numeric not between -180 and 180 then raise exception 'Accommodation coordinates are invalid'; end if;
  if nullif(btrim(coalesce(p_payload->>'business_id_document_path','')),'') is null then raise exception 'Business ID / identification document is required'; end if;

  v_clean=jsonb_build_object(
    'business_name',btrim(p_payload->>'business_name'),
    'owner_name',btrim(p_payload->>'owner_name'),
    'id_number',btrim(p_payload->>'id_number'),
    'phone',btrim(p_payload->>'phone'),
    'email',nullif(btrim(coalesce(p_payload->>'email','')),''),
    'county_code',nullif(btrim(coalesce(p_payload->>'county_code','')),''),
    'county',btrim(p_payload->>'county'),
    'sub_county_code',nullif(btrim(coalesce(p_payload->>'sub_county_code','')),''),
    'sub_county',btrim(p_payload->>'sub_county'),
    'town',btrim(p_payload->>'town'),
    'location_details',btrim(p_payload->>'location_details'),
    'base_map_link',nullif(btrim(coalesce(p_payload->>'base_map_link','')),''),
    'base_latitude',(p_payload->>'base_latitude')::numeric,
    'base_longitude',(p_payload->>'base_longitude')::numeric,
    'business_description',nullif(btrim(coalesce(p_payload->>'business_description','')),''),
    'profile_picture_path',nullif(p_payload->>'profile_picture_path',''),
    'passport_photo_path',nullif(p_payload->>'passport_photo_path',''),
    'business_id_document_path',p_payload->>'business_id_document_path',
    'business_licence_path',nullif(p_payload->>'business_licence_path',''),
    'registration_certificate_path',nullif(p_payload->>'registration_certificate_path',''),
    'other_permit_paths',coalesce(p_payload->'other_permit_paths','[]'::jsonb)
  );

  insert into public.partner_profile_change_requests(
    partner_type,partner_id,payload,status,admin_notes,submitted_at,reviewed_at,reviewed_by,updated_at
  )
  values('accommodation',v_uid,v_clean,'submitted',null,now(),null,null,now())
  on conflict(partner_type,partner_id) do update set
    payload=excluded.payload,
    status='submitted',
    admin_notes=null,
    submitted_at=now(),
    reviewed_at=null,
    reviewed_by=null,
    updated_at=now()
  returning id into v_id;

  perform private.notify_partner(
    v_uid,'accommodation','profile_change_submitted',
    'Accommodation profile changes sent for approval',
    'Your Accommodation Provider profile changes have been sent to LEOGO Admin. Your current approved profile remains active until approval.',
    'partner_profile_change',v_id,'accommodation-profile',
    jsonb_build_object('status','submitted')
  );

  return jsonb_build_object('ok',true,'change_id',v_id,'status','submitted');
end
$function$;

create or replace function public.premium_partner_submit_profile_change(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_profile public.premium_profiles%rowtype;
  v_details public.premium_profile_details%rowtype;
  v_existing jsonb;
  v_merged jsonb;
  v_gallery text[];
  v_path text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Profile details are required'; end if;

  select * into v_profile
  from public.premium_profiles
  where user_id=v_uid and application_status='approved';

  if not found then raise exception 'Approved Premium Profile required'; end if;

  select * into v_details
  from public.premium_profile_details
  where user_id=v_uid;

  select r.payload into v_existing
  from public.partner_profile_change_requests r
  where r.partner_type='premium'
    and r.partner_id=v_uid
    and r.status in ('submitted','changes_requested')
  limit 1;

  if v_existing is null then
    select jsonb_build_object(
      'display_name',v_profile.display_name,
      'gender',v_profile.gender,
      'age',v_details.age,
      'orientation',v_details.orientation,
      'general_location',v_profile.general_location,
      'about',v_profile.about,
      'profile_picture_path',v_profile.profile_picture_path,
      'gallery_paths',coalesce((
        select jsonb_agg(g.media_path order by g.sort_order)
        from public.premium_profile_gallery g
        where g.user_id=v_uid
      ),'[]'::jsonb)
    ) into v_existing;
  end if;

  v_merged=v_existing||p_payload;

  if char_length(btrim(coalesce(v_merged->>'display_name',''))) not between 2 and 50 then raise exception 'Display name must be 2 to 50 characters'; end if;
  if char_length(btrim(coalesce(v_merged->>'gender',''))) not between 2 and 40 then raise exception 'Choose a valid gender'; end if;
  if nullif(v_merged->>'age','') is null or (v_merged->>'age')::integer not between 18 and 100 then raise exception 'Age must be between 18 and 100'; end if;
  if char_length(btrim(coalesce(v_merged->>'orientation',''))) not between 2 and 60 then raise exception 'Choose a valid orientation'; end if;
  if char_length(btrim(coalesce(v_merged->>'general_location',''))) not between 2 and 100 then raise exception 'Enter your general location'; end if;
  if char_length(btrim(coalesce(v_merged->>'about',''))) not between 20 and 1000 then raise exception 'About must be between 20 and 1000 characters'; end if;
  if char_length(btrim(coalesce(v_merged->>'profile_picture_path','')))<3 then raise exception 'Profile picture is required'; end if;
  if v_merged->>'profile_picture_path' not like v_uid::text||'/%' then raise exception 'Invalid profile picture path'; end if;

  if jsonb_typeof(coalesce(v_merged->'gallery_paths','[]'::jsonb))<>'array' then
    raise exception 'Gallery photos are invalid';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[])
  into v_gallery
  from jsonb_array_elements_text(coalesce(v_merged->'gallery_paths','[]'::jsonb)) with ordinality as x(value,ordinality);

  if cardinality(v_gallery)>3 then raise exception 'Maximum 3 gallery photos allowed'; end if;

  foreach v_path in array v_gallery loop
    if nullif(btrim(v_path),'') is not null and v_path not like v_uid::text||'/%' then
      raise exception 'Invalid gallery image path';
    end if;
  end loop;

  v_merged=jsonb_build_object(
    'display_name',btrim(v_merged->>'display_name'),
    'gender',btrim(v_merged->>'gender'),
    'age',(v_merged->>'age')::integer,
    'orientation',btrim(v_merged->>'orientation'),
    'general_location',btrim(v_merged->>'general_location'),
    'about',btrim(v_merged->>'about'),
    'profile_picture_path',btrim(v_merged->>'profile_picture_path'),
    'gallery_paths',to_jsonb(v_gallery)
  );

  insert into public.partner_profile_change_requests(
    partner_type,partner_id,payload,status,admin_notes,submitted_at,reviewed_at,reviewed_by,updated_at
  )
  values('premium',v_uid,v_merged,'submitted',null,now(),null,null,now())
  on conflict(partner_type,partner_id) do update set
    payload=excluded.payload,
    status='submitted',
    admin_notes=null,
    submitted_at=now(),
    reviewed_at=null,
    reviewed_by=null,
    updated_at=now()
  returning id into v_id;

  perform private.notify_partner(
    v_uid,'premium','profile_change_submitted',
    'Premium Profile changes sent for approval',
    'Your Premium Profile changes have been sent to LEOGO Admin. Your currently approved public profile remains visible until approval.',
    'partner_profile_change',v_id,'profile',
    jsonb_build_object('status','submitted')
  );

  return jsonb_build_object('ok',true,'change_id',v_id,'status','submitted');
end
$function$;

create or replace function public.admin_list_partner_profile_changes()
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
as $function$
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
    r.id,
    r.partner_id,
    coalesce(
      s.business_name,
      sp.business_name,
      tp.business_name,
      ah.business_name,
      pp.display_name,
      u.email::text,
      'Partner'
    ),
    u.email::text,
    case r.partner_type
      when 'seller' then 'Seller Profile Update'
      when 'service_provider' then 'Service Provider Profile Update'
      when 'transport' then 'Transport Provider Profile Update'
      when 'accommodation' then 'Accommodation Provider Profile Update'
      when 'premium' then 'Premium Profile Update'
    end,
    'Approved partner edited profile · current approved profile remains active',
    null::numeric,
    r.status,
    r.submitted_at,
    r.payload||jsonb_build_object(
      'profile_change_request_id',r.id,
      'partner_type',r.partner_type,
      'admin_notes',r.admin_notes
    )
  from public.partner_profile_change_requests r
  left join auth.users u on u.id=r.partner_id
  left join public.seller_accounts s on r.partner_type='seller' and s.user_id=r.partner_id
  left join public.service_provider_accounts sp on r.partner_type='service_provider' and sp.user_id=r.partner_id
  left join public.transport_provider_accounts tp on r.partner_type='transport' and tp.user_id=r.partner_id
  left join public.accommodation_hosts ah on r.partner_type='accommodation' and ah.user_id=r.partner_id
  left join public.premium_profiles pp on r.partner_type='premium' and pp.user_id=r.partner_id
  where r.status in ('submitted','under_review','changes_requested')
  order by r.submitted_at desc;
end
$function$;

create or replace function public.admin_review_accommodation_profile_change(
  p_change_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_req public.partner_profile_change_requests%rowtype;
  v_host public.accommodation_hosts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_payload jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported profile-change decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select * into v_req
  from public.partner_profile_change_requests
  where id=p_change_id and partner_type='accommodation'
  for update;

  if not found then raise exception 'Accommodation profile change request not found'; end if;
  if v_req.status not in ('submitted','under_review','changes_requested') then raise exception 'This profile change has already been reviewed'; end if;

  v_payload=v_req.payload;

  if p_decision='approve' then
    select * into v_host
    from public.accommodation_hosts
    where user_id=v_req.partner_id and verification_status='approved'
    for update;

    if not found then raise exception 'Approved Accommodation Provider account not found'; end if;

    v_before=to_jsonb(v_host);

    update public.accommodation_hosts
    set business_name=v_payload->>'business_name',
        owner_name=v_payload->>'owner_name',
        id_number=v_payload->>'id_number',
        contact_phone=v_payload->>'phone',
        contact_email=nullif(v_payload->>'email',''),
        county_code=nullif(v_payload->>'county_code',''),
        county=v_payload->>'county',
        sub_county_code=nullif(v_payload->>'sub_county_code',''),
        sub_county=v_payload->>'sub_county',
        town=v_payload->>'town',
        location_details=v_payload->>'location_details',
        base_map_link=nullif(v_payload->>'base_map_link',''),
        base_latitude=(v_payload->>'base_latitude')::numeric,
        base_longitude=(v_payload->>'base_longitude')::numeric,
        business_description=nullif(v_payload->>'business_description',''),
        profile_picture_path=coalesce(nullif(v_payload->>'profile_picture_path',''),profile_picture_path),
        passport_photo_path=coalesce(nullif(v_payload->>'passport_photo_path',''),passport_photo_path),
        business_id_document_path=coalesce(nullif(v_payload->>'business_id_document_path',''),business_id_document_path),
        business_licence_path=coalesce(nullif(v_payload->>'business_licence_path',''),business_licence_path),
        registration_certificate_path=coalesce(nullif(v_payload->>'registration_certificate_path',''),registration_certificate_path),
        other_permit_paths=coalesce(array(select jsonb_array_elements_text(coalesce(v_payload->'other_permit_paths','[]'::jsonb))),'{}'::text[]),
        admin_notes=null,
        updated_at=now()
    where user_id=v_req.partner_id;

    select to_jsonb(h) into v_after
    from public.accommodation_hosts h
    where h.user_id=v_req.partner_id;
  end if;

  update public.partner_profile_change_requests
  set status=case p_decision
      when 'approve' then 'approved'
      when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested'
      else 'under_review'
    end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    reviewed_at=case when p_decision in ('approve','reject') then now() else null end,
    reviewed_by=(select auth.uid()),
    updated_at=now()
  where id=p_change_id
  returning * into v_req;

  perform private.notify_partner(
    v_req.partner_id,'accommodation','profile_change_'||p_decision,
    case p_decision
      when 'approve' then 'Accommodation profile changes approved'
      when 'changes_requested' then 'Accommodation profile changes need correction'
      when 'reject' then 'Accommodation profile changes not approved'
      else 'Accommodation profile changes under review'
    end,
    case p_decision
      when 'approve' then 'Your edited Accommodation Provider profile has been approved and is now active.'
      when 'changes_requested' then 'LEOGO Admin requested corrections to your Accommodation Provider profile changes.'
      when 'reject' then 'Your proposed Accommodation Provider profile changes were not approved. Your previous approved profile remains active.'
      else 'LEOGO Admin is reviewing your Accommodation Provider profile changes.'
    end||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'partner_profile_change',v_req.id,'accommodation-profile',
    jsonb_build_object('decision',p_decision)
  );

  perform private.write_admin_audit(
    'approval.accommodation_profile_change.'||p_decision,
    'partner_profile_change',
    v_req.id::text,
    v_before,
    coalesce(v_after,v_payload),
    jsonb_build_object('partner_type','accommodation','partner_id',v_req.partner_id,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'change_id',v_req.id,'decision',p_decision,'partner_type','accommodation');
end
$function$;

create or replace function public.admin_review_premium_profile_change(
  p_change_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_req public.partner_profile_change_requests%rowtype;
  v_profile public.premium_profiles%rowtype;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_old_paths text[]:=array[]::text[];
  v_new_gallery text[]:=array[]::text[];
  v_path text;
  v_index integer:=0;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported profile-change decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select * into v_req
  from public.partner_profile_change_requests
  where id=p_change_id and partner_type='premium'
  for update;

  if not found then raise exception 'Premium profile change request not found'; end if;
  if v_req.status not in ('submitted','under_review','changes_requested') then raise exception 'This profile change has already been reviewed'; end if;

  v_payload=v_req.payload;
  select * into v_profile
  from public.premium_profiles
  where user_id=v_req.partner_id and application_status='approved'
  for update;

  if not found then raise exception 'Approved Premium Profile not found'; end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[])
  into v_new_gallery
  from jsonb_array_elements_text(coalesce(v_payload->'gallery_paths','[]'::jsonb)) with ordinality as x(value,ordinality);

  if p_decision='approve' then
    v_before=to_jsonb(v_profile)||jsonb_build_object(
      'details',(select to_jsonb(d) from public.premium_profile_details d where d.user_id=v_req.partner_id),
      'gallery',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order) from public.premium_profile_gallery g where g.user_id=v_req.partner_id),'[]'::jsonb)
    );

    if v_profile.profile_picture_path is distinct from v_payload->>'profile_picture_path'
       and nullif(v_profile.profile_picture_path,'') is not null then
      v_old_paths=array_append(v_old_paths,v_profile.profile_picture_path);
    end if;

    select v_old_paths||coalesce(array_agg(g.media_path order by g.sort_order),array[]::text[])
    into v_old_paths
    from public.premium_profile_gallery g
    where g.user_id=v_req.partner_id;

    update public.premium_profiles
    set display_name=v_payload->>'display_name',
        gender=v_payload->>'gender',
        general_location=v_payload->>'general_location',
        about=v_payload->>'about',
        profile_picture_path=v_payload->>'profile_picture_path',
        updated_at=now()
    where user_id=v_req.partner_id;

    update public.premium_profile_details
    set age=(v_payload->>'age')::integer,
        orientation=v_payload->>'orientation',
        updated_at=now()
    where user_id=v_req.partner_id;

    delete from public.premium_profile_gallery where user_id=v_req.partner_id;

    foreach v_path in array v_new_gallery loop
      if nullif(btrim(v_path),'') is not null then
        v_index=v_index+1;
        insert into public.premium_profile_gallery(user_id,media_path,sort_order)
        values(v_req.partner_id,btrim(v_path),v_index);
      end if;
    end loop;

    insert into public.premium_media_cleanup_queue(user_id,media_path)
    select v_req.partner_id,x
    from unnest(coalesce(v_old_paths,array[]::text[])) x
    where nullif(x,'') is not null
      and x<>(v_payload->>'profile_picture_path')
      and not (x=any(v_new_gallery))
    on conflict(user_id,media_path) do nothing;

    select to_jsonb(p)||jsonb_build_object(
      'details',(select to_jsonb(d) from public.premium_profile_details d where d.user_id=v_req.partner_id),
      'gallery',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order) from public.premium_profile_gallery g where g.user_id=v_req.partner_id),'[]'::jsonb)
    )
    into v_after
    from public.premium_profiles p
    where p.user_id=v_req.partner_id;
  elsif p_decision='reject' then
    insert into public.premium_media_cleanup_queue(user_id,media_path)
    select v_req.partner_id,x
    from unnest(
      array[v_payload->>'profile_picture_path']||coalesce(v_new_gallery,array[]::text[])
    ) x
    where nullif(x,'') is not null
      and x<>v_profile.profile_picture_path
      and not exists(
        select 1 from public.premium_profile_gallery g
        where g.user_id=v_req.partner_id and g.media_path=x
      )
    on conflict(user_id,media_path) do nothing;
  end if;

  update public.partner_profile_change_requests
  set status=case p_decision
      when 'approve' then 'approved'
      when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested'
      else 'under_review'
    end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    reviewed_at=case when p_decision in ('approve','reject') then now() else null end,
    reviewed_by=(select auth.uid()),
    updated_at=now()
  where id=p_change_id
  returning * into v_req;

  perform private.notify_partner(
    v_req.partner_id,'premium','profile_change_'||p_decision,
    case p_decision
      when 'approve' then 'Premium Profile changes approved'
      when 'changes_requested' then 'Premium Profile changes need correction'
      when 'reject' then 'Premium Profile changes not approved'
      else 'Premium Profile changes under review'
    end,
    case p_decision
      when 'approve' then 'Your edited Premium Profile has been approved and is now public.'
      when 'changes_requested' then 'LEOGO Admin requested corrections to your Premium Profile changes.'
      when 'reject' then 'Your proposed Premium Profile changes were not approved. Your previous approved profile remains active.'
      else 'LEOGO Admin is reviewing your Premium Profile changes.'
    end||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'partner_profile_change',v_req.id,'profile',
    jsonb_build_object('decision',p_decision)
  );

  perform private.write_admin_audit(
    'approval.premium_profile_change.'||p_decision,
    'partner_profile_change',
    v_req.id::text,
    v_before,
    coalesce(v_after,v_payload),
    jsonb_build_object('partner_type','premium','partner_id',v_req.partner_id,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'change_id',v_req.id,'decision',p_decision,'partner_type','premium');
end
$function$;

revoke execute on function public.accommodation_provider_submit_profile_change(jsonb) from public,anon;
revoke execute on function public.premium_partner_submit_profile_change(jsonb) from public,anon;
revoke execute on function public.admin_review_accommodation_profile_change(uuid,text,text) from public,anon;
revoke execute on function public.admin_review_premium_profile_change(uuid,text,text) from public,anon;

grant execute on function public.accommodation_provider_submit_profile_change(jsonb) to authenticated;
grant execute on function public.premium_partner_submit_profile_change(jsonb) to authenticated;
grant execute on function public.admin_review_accommodation_profile_change(uuid,text,text) to authenticated;
grant execute on function public.admin_review_premium_profile_change(uuid,text,text) to authenticated;

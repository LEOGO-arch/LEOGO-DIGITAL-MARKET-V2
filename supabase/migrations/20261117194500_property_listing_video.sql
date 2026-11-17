-- Property listing optional video: private until listing approval.
alter table public.vacant_house_listings add column if not exists video_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vacant-house-videos','vacant-house-videos',false,20971520,array['video/mp4','video/webm'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['video/mp4','video/webm'];
create policy vacant_video_upload_owner on storage.objects for insert to authenticated
with check(bucket_id='vacant-house-videos' and split_part(name,'/',1)=(select auth.uid())::text);
create policy vacant_video_read_authorized on storage.objects for select to anon,authenticated
using(bucket_id='vacant-house-videos' and (
 (select auth.uid())::text=split_part(name,'/',1)
 or exists(select 1 from public.vacant_house_listings l where l.video_path=name and l.approval_status='approved' and l.availability_status='vacant')
 or private.is_leogo_admin('approvals.read')
));
create policy vacant_video_delete_owner on storage.objects for delete to authenticated
using(bucket_id='vacant-house-videos' and split_part(name,'/',1)=(select auth.uid())::text and not exists(select 1 from public.vacant_house_listings l where l.video_path=name));
CREATE OR REPLACE FUNCTION public.customer_submit_vacant_house(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_settings public.vacant_house_settings%rowtype;
  v_id uuid := gen_random_uuid();
  v_reference text;
  v_photos text[];
  v_video text;
  v_lat numeric;
  v_lng numeric;
  v_purpose text;
  v_monthly_rent numeric;
  v_sale_price numeric;
begin
  if v_user is null then raise exception 'Sign in to submit a property'; end if;
  select * into v_settings from public.vacant_house_settings where id=1;
  if not coalesce(v_settings.is_enabled,false) then raise exception 'Property submissions are currently unavailable'; end if;

  v_purpose:=coalesce(nullif(btrim(p_data->>'listing_purpose'),''),'rent');
  if v_purpose not in ('rent','sale') then raise exception 'Choose whether the property is for rent or for sale'; end if;

  if v_purpose='rent' then
    v_monthly_rent:=coalesce(nullif(p_data->>'monthly_rent_kes',''),'0')::numeric;
    if v_monthly_rent<=0 or v_monthly_rent>100000000 then raise exception 'Enter a valid monthly rent'; end if;
    v_sale_price:=null;
  else
    v_sale_price:=coalesce(nullif(p_data->>'sale_price_kes',''),'0')::numeric;
    if v_sale_price<=0 or v_sale_price>1000000000000 then raise exception 'Enter a valid property sale price'; end if;
    v_monthly_rent:=null;
  end if;

  v_photos:=coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'photo_paths','[]'::jsonb))),'{}'::text[]);
  if coalesce(array_length(v_photos,1),0)<1 then raise exception 'Add at least one property photo'; end if;
  if coalesce(array_length(v_photos,1),0)>v_settings.max_photos then raise exception 'Too many property photos'; end if;
  if exists(select 1 from unnest(v_photos) p where split_part(p,'/',1)<>v_user::text) then
    raise exception 'Property photo path is not owned by this customer';
  end if;

  v_video:=nullif(btrim(coalesce(p_data->>'video_path','')),'');
  if v_video is not null then
    if split_part(v_video,'/',1)<>v_user::text
       or array_length(string_to_array(v_video,'/'),1)<>3
       or (right(v_video,4)<>'.mp4' and right(v_video,5)<>'.webm')
       or not exists(select 1 from storage.objects o where o.bucket_id='vacant-house-videos' and o.name=v_video) then
      raise exception 'Property video upload is missing or does not belong to you';
    end if;
  end if;

  if coalesce((p_data->>'contact_reveal_consent')::boolean,false) is not true then
    raise exception 'Consent is required before LEOGO can reveal contact and exact location to verified interested customers';
  end if;

  if nullif(btrim(coalesce(p_data->>'latitude','')),'') is not null then
    v_lat:=(p_data->>'latitude')::numeric;
    if v_lat not between -90 and 90 then raise exception 'Enter a valid latitude'; end if;
  end if;
  if nullif(btrim(coalesce(p_data->>'longitude','')),'') is not null then
    v_lng:=(p_data->>'longitude')::numeric;
    if v_lng not between -180 and 180 then raise exception 'Enter a valid longitude'; end if;
  end if;

  v_reference:='VH-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,7));

  insert into public.vacant_house_listings(
    id,listing_reference,submitter_user_id,source_type,submitter_role,title,house_type,
    listing_purpose,monthly_rent_kes,sale_price_kes,deposit_kes,property_size_text,ownership_note,
    county,sub_county,area_estate,bedrooms,bathrooms,
    furnished,water_available,electricity_available,parking_available,gated_compound,
    description,available_from,photo_paths,video_path,approval_status,availability_status
  )
  values(
    v_id,v_reference,v_user,'customer',
    coalesce(nullif(btrim(p_data->>'submitter_role'),''),'other'),
    btrim(coalesce(p_data->>'title','')),
    btrim(coalesce(p_data->>'house_type','')),
    v_purpose,v_monthly_rent,v_sale_price,
    case when v_purpose='rent' then coalesce(nullif(p_data->>'deposit_kes',''),'0')::numeric else 0 end,
    nullif(btrim(coalesce(p_data->>'property_size_text','')),''),
    nullif(btrim(coalesce(p_data->>'ownership_note','')),''),
    btrim(coalesce(p_data->>'county','')),
    btrim(coalesce(p_data->>'sub_county','')),
    btrim(coalesce(p_data->>'area_estate','')),
    coalesce(nullif(p_data->>'bedrooms',''),'0')::smallint,
    coalesce(nullif(p_data->>'bathrooms',''),'0')::smallint,
    coalesce((p_data->>'furnished')::boolean,false),
    coalesce((p_data->>'water_available')::boolean,false),
    coalesce((p_data->>'electricity_available')::boolean,false),
    coalesce((p_data->>'parking_available')::boolean,false),
    coalesce((p_data->>'gated_compound')::boolean,false),
    btrim(coalesce(p_data->>'description','')),
    coalesce(nullif(p_data->>'available_from','')::date,current_date),
    v_photos,v_video,'pending','vacant'
  );

  insert into private.vacant_house_private_details(
    listing_id,contact_name,contact_phone,exact_address,landmark,maps_link,
    latitude,longitude,contact_reveal_consent
  )
  values(
    v_id,
    btrim(coalesce(p_data->>'contact_name','')),
    btrim(coalesce(p_data->>'contact_phone','')),
    btrim(coalesce(p_data->>'exact_address','')),
    nullif(btrim(coalesce(p_data->>'landmark','')),''),
    nullif(btrim(coalesce(p_data->>'maps_link','')),''),
    v_lat,v_lng,true
  );

  return jsonb_build_object(
    'success',true,'listing_id',v_id,'listing_reference',v_reference,
    'listing_purpose',v_purpose,'approval_status','pending',
    'voucher_on_approval_kes',case when v_settings.voucher_enabled then v_settings.submission_voucher_kes else 0 end
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.admin_get_vacant_house_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_settings jsonb;
  v_listings jsonb;
  v_requests jsonb;
  v_accounts jsonb;
begin
  if not private.is_leogo_admin('approvals.read')
     and not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Property Market Admin access required';
  end if;

  select jsonb_build_object(
    'is_enabled',s.is_enabled,'voucher_enabled',s.voucher_enabled,
    'submission_voucher_kes',s.submission_voucher_kes,
    'viewing_access_fee_kes',s.viewing_access_fee_kes,'max_photos',s.max_photos,
    'payment_account_id',(select a.account_id from public.payment_account_assignments a where a.function_code='vacant_house_viewing')
  ) into v_settings
  from public.vacant_house_settings s where s.id=1;

  select coalesce(jsonb_agg(row_data order by (row_data->>'submitted_at')::timestamptz desc),'[]'::jsonb)
  into v_listings
  from (
    select jsonb_build_object(
      'id',l.id,'listing_reference',l.listing_reference,'submitter_user_id',l.submitter_user_id,
      'submitter_name',coalesce(cp.full_name,'LEOGO Customer'),'submitter_profile_phone',cp.phone,
      'submitter_role',l.submitter_role,'title',l.title,'house_type',l.house_type,
      'listing_purpose',l.listing_purpose,'monthly_rent_kes',l.monthly_rent_kes,'sale_price_kes',l.sale_price_kes,
      'deposit_kes',l.deposit_kes,'property_size_text',l.property_size_text,'ownership_note',l.ownership_note,
      'county',l.county,'sub_county',l.sub_county,'area_estate',l.area_estate,
      'bedrooms',l.bedrooms,'bathrooms',l.bathrooms,'furnished',l.furnished,
      'water_available',l.water_available,'electricity_available',l.electricity_available,
      'parking_available',l.parking_available,'gated_compound',l.gated_compound,
      'description',l.description,'available_from',l.available_from,'photo_paths',l.photo_paths,'video_path',l.video_path,
      'approval_status',l.approval_status,'availability_status',l.availability_status,
      'admin_notes',l.admin_notes,'voucher_amount_kes',l.voucher_amount_kes,
      'submitted_at',l.submitted_at,'approved_at',l.approved_at,
      'contact_name',d.contact_name,'contact_phone',d.contact_phone,'exact_address',d.exact_address,
      'landmark',d.landmark,'maps_link',d.maps_link,'latitude',d.latitude,'longitude',d.longitude
    ) row_data
    from public.vacant_house_listings l
    left join public.customer_profiles cp on cp.user_id=l.submitter_user_id
    join private.vacant_house_private_details d on d.listing_id=l.id
    order by l.submitted_at desc
    limit 300
  ) q;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc),'[]'::jsonb)
  into v_requests
  from (
    select jsonb_build_object(
      'id',r.id,'request_reference',r.request_reference,'listing_id',r.listing_id,
      'listing_reference',l.listing_reference,'title',l.title,'listing_purpose',l.listing_purpose,
      'customer_user_id',r.customer_user_id,'customer_name',coalesce(cp.full_name,'LEOGO Customer'),
      'customer_phone',cp.phone,'fee_amount_kes',r.fee_amount_kes,
      'payment_reference',r.payment_reference,'payment_status',r.payment_status,
      'request_status',r.request_status,'preferred_viewing_at',r.preferred_viewing_at,
      'customer_message',r.customer_message,'admin_notes',r.admin_notes,
      'created_at',r.created_at,'verified_at',r.verified_at
    ) row_data
    from public.vacant_house_viewing_requests r
    join public.vacant_house_listings l on l.id=r.listing_id
    left join public.customer_profiles cp on cp.user_id=r.customer_user_id
    order by r.created_at desc
    limit 300
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'display_name',p.display_name,'account_type',p.account_type,
    'business_name',p.business_name,'account_name',p.account_name,'till_number',p.till_number,
    'paybill_number',p.paybill_number,'account_number',p.account_number,'bank_name',p.bank_name
  ) order by p.display_name),'[]'::jsonb)
  into v_accounts
  from public.payment_accounts p
  where p.status='active';

  return jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'summary',jsonb_build_object(
      'pending_listings',(select count(*) from public.vacant_house_listings where approval_status in ('pending','under_review')),
      'vacant_listings',(select count(*) from public.vacant_house_listings where approval_status='approved' and listing_purpose='rent' and availability_status='vacant'),
      'sale_listings',(select count(*) from public.vacant_house_listings where approval_status='approved' and listing_purpose='sale' and availability_status='vacant'),
      'occupied_listings',(select count(*) from public.vacant_house_listings where approval_status='approved' and availability_status in ('occupied','sold')),
      'pending_payments',(select count(*) from public.vacant_house_viewing_requests where payment_status='submitted'),
      'verified_access',(select count(*) from public.vacant_house_viewing_requests where payment_status in ('verified','waived'))
    ),
    'listings',coalesce(v_listings,'[]'::jsonb),
    'viewing_requests',coalesce(v_requests,'[]'::jsonb),
    'payment_accounts',coalesce(v_accounts,'[]'::jsonb)
  );
end
$function$
;
create or replace function public.public_get_approved_vacant_house_video(p_listing_id uuid)
returns text language sql stable security definer set search_path='' as $$
select l.video_path from public.vacant_house_listings l
join public.vacant_house_settings s on s.id=1 and s.is_enabled
where l.id=p_listing_id and l.approval_status='approved' and l.availability_status='vacant'
$$;
revoke execute on function public.public_get_approved_vacant_house_video(uuid) from public;
grant execute on function public.public_get_approved_vacant_house_video(uuid) to anon,authenticated;

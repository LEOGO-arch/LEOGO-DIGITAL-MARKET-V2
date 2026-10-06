
-- LEOGO DIGITAL MARKET V2 — Property marketplace rent/sale extension V1
-- Extends the Vacant Houses module. Existing rent listings remain unchanged.

alter table public.vacant_house_listings
  add column if not exists listing_purpose text not null default 'rent',
  add column if not exists sale_price_kes numeric(14,2),
  add column if not exists property_size_text text,
  add column if not exists ownership_note text;

alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_listing_purpose_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listings_listing_purpose_check
  check(listing_purpose in ('rent','sale'));

alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_house_type_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listings_house_type_check
  check(house_type in (
    'single_room','bedsitter','one_bedroom','two_bedroom','three_bedroom',
    'four_plus_bedroom','maisonette','bungalow','apartment','commercial',
    'land_plot','other'
  ));

alter table public.vacant_house_listings
  alter column monthly_rent_kes drop not null;
alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_monthly_rent_kes_check;
alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_sale_price_kes_check;
alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listing_price_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listing_price_check
  check(
    (
      listing_purpose='rent'
      and monthly_rent_kes is not null
      and monthly_rent_kes>0
      and monthly_rent_kes<=100000000
      and sale_price_kes is null
    )
    or
    (
      listing_purpose='sale'
      and sale_price_kes is not null
      and sale_price_kes>0
      and sale_price_kes<=1000000000000
      and monthly_rent_kes is null
    )
  );

alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_property_size_text_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listings_property_size_text_check
  check(property_size_text is null or char_length(btrim(property_size_text)) between 2 and 120);

alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_ownership_note_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listings_ownership_note_check
  check(ownership_note is null or char_length(btrim(ownership_note)) between 2 and 300);

alter table public.vacant_house_listings
  drop constraint if exists vacant_house_listings_availability_status_check;
alter table public.vacant_house_listings
  add constraint vacant_house_listings_availability_status_check
  check(availability_status in ('vacant','occupied','sold','archived'));

create index if not exists vacant_house_purpose_price_idx
  on public.vacant_house_listings(listing_purpose,approval_status,availability_status,monthly_rent_kes,sale_price_kes);

create or replace function public.customer_submit_vacant_house(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_settings public.vacant_house_settings%rowtype;
  v_id uuid := gen_random_uuid();
  v_reference text;
  v_photos text[];
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
    description,available_from,photo_paths,approval_status,availability_status
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
    v_photos,'pending','vacant'
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

revoke all on function public.customer_submit_vacant_house(jsonb) from public,anon;
grant execute on function public.customer_submit_vacant_house(jsonb) to authenticated;

create or replace function public.public_list_property_marketplace(
  p_search text default null,
  p_county text default null,
  p_house_type text default null,
  p_listing_purpose text default null,
  p_min_price numeric default null,
  p_max_price numeric default null
)
returns table(
  id uuid,
  listing_reference text,
  title text,
  house_type text,
  listing_purpose text,
  monthly_rent_kes numeric,
  sale_price_kes numeric,
  deposit_kes numeric,
  property_size_text text,
  ownership_note text,
  county text,
  sub_county text,
  area_estate text,
  bedrooms smallint,
  bathrooms smallint,
  furnished boolean,
  water_available boolean,
  electricity_available boolean,
  parking_available boolean,
  gated_compound boolean,
  description text,
  available_from date,
  photo_paths text[],
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select
    l.id,l.listing_reference,l.title,l.house_type,l.listing_purpose,
    l.monthly_rent_kes,l.sale_price_kes,l.deposit_kes,l.property_size_text,l.ownership_note,
    l.county,l.sub_county,l.area_estate,l.bedrooms,l.bathrooms,l.furnished,
    l.water_available,l.electricity_available,l.parking_available,l.gated_compound,
    l.description,l.available_from,l.photo_paths,l.submitted_at
  from public.vacant_house_listings l
  join public.vacant_house_settings s on s.id=1 and s.is_enabled=true
  where l.approval_status='approved'
    and l.availability_status='vacant'
    and (nullif(btrim(coalesce(p_listing_purpose,'')),'') is null or l.listing_purpose=btrim(p_listing_purpose))
    and (nullif(btrim(coalesce(p_county,'')),'') is null or lower(l.county)=lower(btrim(p_county)))
    and (nullif(btrim(coalesce(p_house_type,'')),'') is null or l.house_type=btrim(p_house_type))
    and (
      p_min_price is null
      or case when l.listing_purpose='sale' then l.sale_price_kes else l.monthly_rent_kes end >= p_min_price
    )
    and (
      p_max_price is null
      or case when l.listing_purpose='sale' then l.sale_price_kes else l.monthly_rent_kes end <= p_max_price
    )
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or l.title ilike '%'||btrim(p_search)||'%'
      or l.area_estate ilike '%'||btrim(p_search)||'%'
      or l.sub_county ilike '%'||btrim(p_search)||'%'
      or l.county ilike '%'||btrim(p_search)||'%'
      or l.description ilike '%'||btrim(p_search)||'%'
      or coalesce(l.property_size_text,'') ilike '%'||btrim(p_search)||'%'
    )
  order by l.submitted_at desc
  limit 250;
$function$;

revoke all on function public.public_list_property_marketplace(text,text,text,text,numeric,numeric) from public;
grant execute on function public.public_list_property_marketplace(text,text,text,text,numeric,numeric) to anon,authenticated;

create or replace function public.customer_get_my_vacant_house_submissions()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'listing_reference',l.listing_reference,'title',l.title,'house_type',l.house_type,
    'listing_purpose',l.listing_purpose,'monthly_rent_kes',l.monthly_rent_kes,'sale_price_kes',l.sale_price_kes,
    'deposit_kes',l.deposit_kes,'property_size_text',l.property_size_text,'ownership_note',l.ownership_note,
    'county',l.county,'sub_county',l.sub_county,'area_estate',l.area_estate,
    'approval_status',l.approval_status,'availability_status',l.availability_status,'admin_notes',l.admin_notes,
    'voucher_amount_kes',l.voucher_amount_kes,'photo_paths',l.photo_paths,
    'contact_name',d.contact_name,'contact_phone',d.contact_phone,
    'exact_address',d.exact_address,'landmark',d.landmark,'maps_link',d.maps_link,
    'latitude',d.latitude,'longitude',d.longitude,'submitted_at',l.submitted_at
  ) order by l.submitted_at desc),'[]'::jsonb)
  into v_rows
  from public.vacant_house_listings l
  join private.vacant_house_private_details d on d.listing_id=l.id
  where l.submitter_user_id=v_user;
  return v_rows;
end
$function$;

revoke all on function public.customer_get_my_vacant_house_submissions() from public,anon;
grant execute on function public.customer_get_my_vacant_house_submissions() to authenticated;

create or replace function public.customer_get_my_vacant_house_viewing_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_reference',r.request_reference,'listing_id',r.listing_id,
    'listing_reference',l.listing_reference,'title',l.title,'house_type',l.house_type,
    'listing_purpose',l.listing_purpose,'monthly_rent_kes',l.monthly_rent_kes,'sale_price_kes',l.sale_price_kes,
    'area_estate',l.area_estate,'sub_county',l.sub_county,'county',l.county,
    'fee_amount_kes',r.fee_amount_kes,'payment_status',r.payment_status,'request_status',r.request_status,
    'preferred_viewing_at',r.preferred_viewing_at,'admin_notes',r.admin_notes,
    'access_granted_at',r.access_granted_at,'created_at',r.created_at,
    'contact_name',case when r.payment_status in ('verified','waived') then d.contact_name else null end,
    'contact_phone',case when r.payment_status in ('verified','waived') then d.contact_phone else null end,
    'exact_address',case when r.payment_status in ('verified','waived') then d.exact_address else null end,
    'landmark',case when r.payment_status in ('verified','waived') then d.landmark else null end,
    'maps_link',case when r.payment_status in ('verified','waived') then d.maps_link else null end,
    'latitude',case when r.payment_status in ('verified','waived') then d.latitude else null end,
    'longitude',case when r.payment_status in ('verified','waived') then d.longitude else null end
  ) order by r.created_at desc),'[]'::jsonb)
  into v_rows
  from public.vacant_house_viewing_requests r
  join public.vacant_house_listings l on l.id=r.listing_id
  join private.vacant_house_private_details d on d.listing_id=l.id
  where r.customer_user_id=v_user;

  return v_rows;
end
$function$;

revoke all on function public.customer_get_my_vacant_house_viewing_requests() from public,anon;
grant execute on function public.customer_get_my_vacant_house_viewing_requests() to authenticated;

create or replace function public.customer_set_my_vacant_house_status(
  p_listing_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_purpose text;
begin
  if v_user is null then raise exception 'Sign in required'; end if;

  select listing_purpose into v_purpose
  from public.vacant_house_listings
  where id=p_listing_id and submitter_user_id=v_user and approval_status='approved'
  for update;
  if not found then raise exception 'Approved property listing not found'; end if;

  if v_purpose='sale' and p_status not in ('vacant','sold','archived') then
    raise exception 'Sale property can only be Available, Sold or Archived';
  end if;
  if v_purpose='rent' and p_status not in ('vacant','occupied','archived') then
    raise exception 'Rental property can only be Vacant, Occupied or Archived';
  end if;

  update public.vacant_house_listings
  set availability_status=p_status,
      occupied_at=case when p_status in ('occupied','sold') then now() else null end,
      updated_at=now()
  where id=p_listing_id;

  return jsonb_build_object('success',true,'listing_id',p_listing_id,'availability_status',p_status);
end
$function$;

revoke all on function public.customer_set_my_vacant_house_status(uuid,text) from public,anon;
grant execute on function public.customer_set_my_vacant_house_status(uuid,text) to authenticated;

create or replace function public.admin_get_vacant_house_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
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
      'description',l.description,'available_from',l.available_from,'photo_paths',l.photo_paths,
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
$function$;

revoke all on function public.admin_get_vacant_house_dashboard() from public,anon;
grant execute on function public.admin_get_vacant_house_dashboard() to authenticated;

create or replace function public.admin_set_vacant_house_availability(
  p_listing_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_purpose text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;

  select to_jsonb(l),l.listing_purpose into v_before,v_purpose
  from public.vacant_house_listings l where id=p_listing_id for update;
  if v_before is null then raise exception 'Property listing not found'; end if;

  if v_purpose='sale' and p_status not in ('vacant','sold','archived') then
    raise exception 'Sale property can only be Available, Sold or Archived';
  end if;
  if v_purpose='rent' and p_status not in ('vacant','occupied','archived') then
    raise exception 'Rental property can only be Vacant, Occupied or Archived';
  end if;

  update public.vacant_house_listings
  set availability_status=p_status,
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
      occupied_at=case when p_status in ('occupied','sold') then now() else null end,
      updated_at=now()
  where id=p_listing_id and approval_status='approved'
  returning to_jsonb(vacant_house_listings.*) into v_after;

  if v_after is null then raise exception 'Only approved property listings can change availability'; end if;

  perform private.write_admin_audit(
    'vacant_house.availability.'||p_status,'vacant_house_listing',p_listing_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('success',true,'listing_id',p_listing_id,'availability_status',p_status);
end
$function$;

revoke all on function public.admin_set_vacant_house_availability(uuid,text,text) from public,anon;
grant execute on function public.admin_set_vacant_house_availability(uuid,text,text) to authenticated;

notify pgrst,'reload schema';

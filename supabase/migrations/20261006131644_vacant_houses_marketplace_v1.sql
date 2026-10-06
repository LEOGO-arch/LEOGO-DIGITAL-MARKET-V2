
-- LEOGO DIGITAL MARKET V2 — Vacant Houses marketplace V1
-- Additive module. Does not alter the locked marketplace order/checkout/delivery flow.

create table if not exists public.vacant_house_settings (
  id smallint primary key default 1 check (id=1),
  is_enabled boolean not null default true,
  voucher_enabled boolean not null default true,
  submission_voucher_kes numeric(12,2) not null default 100 check (submission_voucher_kes between 0 and 1000000),
  viewing_access_fee_kes numeric(12,2) not null default 300 check (viewing_access_fee_kes between 0 and 1000000),
  max_photos smallint not null default 8 check (max_photos between 1 and 12),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.vacant_house_settings(id)
values(1)
on conflict(id) do nothing;

create table if not exists public.vacant_house_listings (
  id uuid primary key default gen_random_uuid(),
  listing_reference text not null unique check(char_length(listing_reference) between 8 and 40),
  submitter_user_id uuid not null references auth.users(id) on delete restrict,
  source_type text not null default 'customer' check(source_type in ('customer','landlord_partner')),
  submitter_role text not null check(submitter_role in ('owner','caretaker','agent','other')),
  title text not null check(char_length(btrim(title)) between 3 and 140),
  house_type text not null check(house_type in ('single_room','bedsitter','one_bedroom','two_bedroom','three_bedroom','four_plus_bedroom','maisonette','bungalow','apartment','commercial','other')),
  monthly_rent_kes numeric(14,2) not null check(monthly_rent_kes > 0 and monthly_rent_kes <= 100000000),
  deposit_kes numeric(14,2) not null default 0 check(deposit_kes >= 0 and deposit_kes <= 100000000),
  county text not null check(char_length(btrim(county)) between 2 and 80),
  sub_county text not null check(char_length(btrim(sub_county)) between 2 and 100),
  area_estate text not null check(char_length(btrim(area_estate)) between 2 and 160),
  bedrooms smallint not null default 0 check(bedrooms between 0 and 30),
  bathrooms smallint not null default 0 check(bathrooms between 0 and 30),
  furnished boolean not null default false,
  water_available boolean not null default false,
  electricity_available boolean not null default false,
  parking_available boolean not null default false,
  gated_compound boolean not null default false,
  description text not null check(char_length(btrim(description)) between 10 and 3000),
  available_from date not null default current_date,
  photo_paths text[] not null default '{}'::text[],
  approval_status text not null default 'pending' check(approval_status in ('pending','under_review','approved','rejected','suspended')),
  availability_status text not null default 'vacant' check(availability_status in ('vacant','occupied','archived')),
  admin_notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  voucher_amount_kes numeric(12,2) not null default 0 check(voucher_amount_kes >= 0),
  voucher_reward_id uuid references public.wallet_shopping_rewards(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  occupied_at timestamptz
);

create index if not exists vacant_house_public_idx
  on public.vacant_house_listings(approval_status,availability_status,submitted_at desc);
create index if not exists vacant_house_submitter_idx
  on public.vacant_house_listings(submitter_user_id,submitted_at desc);
create index if not exists vacant_house_location_idx
  on public.vacant_house_listings(county,sub_county,area_estate);
create index if not exists vacant_house_rent_idx
  on public.vacant_house_listings(monthly_rent_kes);

create table if not exists private.vacant_house_private_details (
  listing_id uuid primary key references public.vacant_house_listings(id) on delete cascade,
  contact_name text not null check(char_length(btrim(contact_name)) between 2 and 120),
  contact_phone text not null check(char_length(btrim(contact_phone)) between 7 and 30),
  exact_address text not null check(char_length(btrim(exact_address)) between 3 and 500),
  landmark text,
  maps_link text,
  latitude numeric(10,7) check(latitude is null or latitude between -90 and 90),
  longitude numeric(10,7) check(longitude is null or longitude between -180 and 180),
  contact_reveal_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vacant_house_viewing_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique check(char_length(request_reference) between 8 and 40),
  listing_id uuid not null references public.vacant_house_listings(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  preferred_viewing_at timestamptz,
  customer_message text,
  fee_amount_kes numeric(12,2) not null check(fee_amount_kes >= 0 and fee_amount_kes <= 1000000),
  payment_reference text,
  payment_status text not null check(payment_status in ('submitted','verified','rejected','refunded','waived')),
  request_status text not null check(request_status in ('pending_verification','access_granted','viewing_scheduled','viewed','closed','cancelled')),
  admin_notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  access_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id,customer_user_id)
);

create index if not exists vacant_house_viewing_customer_idx
  on public.vacant_house_viewing_requests(customer_user_id,created_at desc);
create index if not exists vacant_house_viewing_admin_idx
  on public.vacant_house_viewing_requests(payment_status,created_at desc);

alter table public.vacant_house_settings enable row level security;
alter table public.vacant_house_listings enable row level security;
alter table public.vacant_house_viewing_requests enable row level security;

revoke all on table public.vacant_house_settings from anon,authenticated;
revoke all on table public.vacant_house_listings from anon,authenticated;
revoke all on table public.vacant_house_viewing_requests from anon,authenticated;
revoke all on table private.vacant_house_private_details from public,anon,authenticated;

grant all on table public.vacant_house_settings to service_role;
grant all on table public.vacant_house_listings to service_role;
grant all on table public.vacant_house_viewing_requests to service_role;
grant all on table private.vacant_house_private_details to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vacant-house-public-media','vacant-house-public-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update
set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists vacant_house_public_media_insert_own on storage.objects;
create policy vacant_house_public_media_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id='vacant-house-public-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists vacant_house_public_media_update_own on storage.objects;
create policy vacant_house_public_media_update_own on storage.objects
for update to authenticated
using (
  bucket_id='vacant-house-public-media'
  and split_part(name,'/',1)=(select auth.uid())::text
)
with check (
  bucket_id='vacant-house-public-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists vacant_house_public_media_delete_own on storage.objects;
create policy vacant_house_public_media_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='vacant-house-public-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

-- Allow the existing payment-routing framework to assign a destination
-- specifically for Vacant House viewing/access fees.
alter table public.payment_account_assignments
  drop constraint if exists payment_account_assignments_function_code_check;

alter table public.payment_account_assignments
  add constraint payment_account_assignments_function_code_check
  check(function_code in (
    'wallet_sacco_deposits','savings_challenge','loan_repayment','marketplace_orders',
    'lipa_pole_pole','premium_payments','accommodation_payments','service_payments',
    'transport_payments','cyber_orders','other_revenue','vacant_house_viewing'
  ));

-- Shopping voucher is LEOGO Points, not cash. Keep all known reward sources.
alter table public.wallet_shopping_rewards
  drop constraint if exists wallet_shopping_rewards_credit_source_check;

alter table public.wallet_shopping_rewards
  add constraint wallet_shopping_rewards_credit_source_check
  check(credit_source in (
    'manual_admin','automatic_delivery','referral_referrer','referral_welcome',
    'vacant_house_submission'
  ));

create or replace function private.credit_vacant_house_submission_voucher(
  p_user_id uuid,
  p_listing_id uuid,
  p_reward_amount numeric,
  p_approved_by uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reward_id uuid;
  v_reference text;
begin
  if p_user_id is null or p_listing_id is null or coalesce(p_reward_amount,0)<=0 then
    return null;
  end if;

  v_reference:='VH-VOUCHER-'||upper(substr(replace(p_listing_id::text,'-',''),1,16));

  insert into public.wallet_accounts(user_id)
  values(p_user_id)
  on conflict(user_id) do nothing;

  insert into public.wallet_shopping_rewards(
    user_id,order_reference,eligible_subtotal_kes,reward_rate,
    reward_amount_kes,approved_by,credit_source
  )
  values(
    p_user_id,v_reference,0,0,round(p_reward_amount,2),
    p_approved_by,'vacant_house_submission'
  )
  on conflict(user_id,order_reference) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    select r.id into v_reward_id
    from public.wallet_shopping_rewards r
    where r.user_id=p_user_id and r.order_reference=v_reference;
  end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_id,
    external_reference,description
  )
  values(
    p_user_id,'shopping_reward','credit',round(p_reward_amount,2),v_reward_id,
    'vacant_house:'||p_listing_id::text,
    'Vacant House submission Shopping Voucher'
  )
  on conflict(reward_id)
  where reward_id is not null
  do nothing;

  return v_reward_id;
end
$function$;

revoke execute on function private.credit_vacant_house_submission_voucher(uuid,uuid,numeric,uuid)
from public,anon,authenticated;

create or replace function public.public_get_vacant_house_settings()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'is_enabled',s.is_enabled,
    'voucher_enabled',s.voucher_enabled,
    'submission_voucher_kes',case when s.voucher_enabled then s.submission_voucher_kes else 0 end,
    'viewing_access_fee_kes',s.viewing_access_fee_kes,
    'max_photos',s.max_photos
  )
  from public.vacant_house_settings s
  where s.id=1;
$function$;

revoke all on function public.public_get_vacant_house_settings() from public;
grant execute on function public.public_get_vacant_house_settings() to anon,authenticated;

create or replace function public.public_list_vacant_houses(
  p_search text default null,
  p_county text default null,
  p_house_type text default null,
  p_min_rent numeric default null,
  p_max_rent numeric default null
)
returns table(
  id uuid,
  listing_reference text,
  title text,
  house_type text,
  monthly_rent_kes numeric,
  deposit_kes numeric,
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
    l.id,l.listing_reference,l.title,l.house_type,l.monthly_rent_kes,l.deposit_kes,
    l.county,l.sub_county,l.area_estate,l.bedrooms,l.bathrooms,l.furnished,
    l.water_available,l.electricity_available,l.parking_available,l.gated_compound,
    l.description,l.available_from,l.photo_paths,l.submitted_at
  from public.vacant_house_listings l
  join public.vacant_house_settings s on s.id=1 and s.is_enabled=true
  where l.approval_status='approved'
    and l.availability_status='vacant'
    and (nullif(btrim(coalesce(p_county,'')),'') is null or lower(l.county)=lower(btrim(p_county)))
    and (nullif(btrim(coalesce(p_house_type,'')),'') is null or l.house_type=btrim(p_house_type))
    and (p_min_rent is null or l.monthly_rent_kes>=p_min_rent)
    and (p_max_rent is null or l.monthly_rent_kes<=p_max_rent)
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or l.title ilike '%'||btrim(p_search)||'%'
      or l.area_estate ilike '%'||btrim(p_search)||'%'
      or l.sub_county ilike '%'||btrim(p_search)||'%'
      or l.county ilike '%'||btrim(p_search)||'%'
      or l.description ilike '%'||btrim(p_search)||'%'
    )
  order by l.submitted_at desc
  limit 250;
$function$;

revoke all on function public.public_list_vacant_houses(text,text,text,numeric,numeric) from public;
grant execute on function public.public_list_vacant_houses(text,text,text,numeric,numeric) to anon,authenticated;

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
begin
  if v_user is null then raise exception 'Sign in to submit a vacant house'; end if;
  select * into v_settings from public.vacant_house_settings where id=1;
  if not coalesce(v_settings.is_enabled,false) then raise exception 'Vacant House submissions are currently unavailable'; end if;

  v_photos:=coalesce(array(select jsonb_array_elements_text(coalesce(p_data->'photo_paths','[]'::jsonb))),'{}'::text[]);
  if coalesce(array_length(v_photos,1),0)<1 then raise exception 'Add at least one house photo'; end if;
  if coalesce(array_length(v_photos,1),0)>v_settings.max_photos then raise exception 'Too many house photos'; end if;
  if exists(select 1 from unnest(v_photos) p where split_part(p,'/',1)<>v_user::text) then
    raise exception 'House photo path is not owned by this customer';
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
    monthly_rent_kes,deposit_kes,county,sub_county,area_estate,bedrooms,bathrooms,
    furnished,water_available,electricity_available,parking_available,gated_compound,
    description,available_from,photo_paths,approval_status,availability_status
  )
  values(
    v_id,v_reference,v_user,'customer',
    coalesce(nullif(btrim(p_data->>'submitter_role'),''),'other'),
    btrim(coalesce(p_data->>'title','')),
    btrim(coalesce(p_data->>'house_type','')),
    coalesce(nullif(p_data->>'monthly_rent_kes',''),'0')::numeric,
    coalesce(nullif(p_data->>'deposit_kes',''),'0')::numeric,
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
    'approval_status','pending',
    'voucher_on_approval_kes',case when v_settings.voucher_enabled then v_settings.submission_voucher_kes else 0 end
  );
end
$function$;

revoke all on function public.customer_submit_vacant_house(jsonb) from public,anon;
grant execute on function public.customer_submit_vacant_house(jsonb) to authenticated;

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
    'monthly_rent_kes',l.monthly_rent_kes,'county',l.county,'sub_county',l.sub_county,
    'area_estate',l.area_estate,'approval_status',l.approval_status,
    'availability_status',l.availability_status,'admin_notes',l.admin_notes,
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
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_status not in ('vacant','occupied','archived') then raise exception 'Unsupported house status'; end if;

  update public.vacant_house_listings
  set availability_status=p_status,
      occupied_at=case when p_status='occupied' then now() else null end,
      updated_at=now()
  where id=p_listing_id and submitter_user_id=v_user and approval_status='approved';

  if not found then raise exception 'Approved house listing not found'; end if;
  return jsonb_build_object('success',true,'listing_id',p_listing_id,'availability_status',p_status);
end
$function$;

revoke all on function public.customer_set_my_vacant_house_status(uuid,text) from public,anon;
grant execute on function public.customer_set_my_vacant_house_status(uuid,text) to authenticated;

create or replace function public.customer_get_vacant_house_access_quote(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_listing public.vacant_house_listings%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_viewing_requests%rowtype;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'Sign in to request house viewing details'; end if;
  select * into v_listing from public.vacant_house_listings
  where id=p_listing_id and approval_status='approved' and availability_status='vacant';
  if not found then raise exception 'This house is no longer available'; end if;

  select * into v_settings from public.vacant_house_settings where id=1;
  if not v_settings.is_enabled then raise exception 'Vacant House viewing access is currently unavailable'; end if;

  select * into v_existing
  from public.vacant_house_viewing_requests r
  where r.listing_id=p_listing_id and r.customer_user_id=v_user;

  select jsonb_build_object(
    'display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,
    'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,
    'account_number',p.account_number,'bank_name',p.bank_name,'instructions',p.instructions
  )
  into v_payment
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id and p.status='active'
  where a.function_code='vacant_house_viewing';

  return jsonb_build_object(
    'listing_id',p_listing_id,'listing_reference',v_listing.listing_reference,
    'title',v_listing.title,'fee_amount_kes',v_settings.viewing_access_fee_kes,
    'payment_account',v_payment,
    'existing_request',case when v_existing.id is null then null else jsonb_build_object(
      'id',v_existing.id,'request_reference',v_existing.request_reference,
      'payment_status',v_existing.payment_status,'request_status',v_existing.request_status,
      'fee_amount_kes',v_existing.fee_amount_kes,'admin_notes',v_existing.admin_notes
    ) end
  );
end
$function$;

revoke all on function public.customer_get_vacant_house_access_quote(uuid) from public,anon;
grant execute on function public.customer_get_vacant_house_access_quote(uuid) to authenticated;

create or replace function public.customer_submit_vacant_house_viewing_request(
  p_listing_id uuid,
  p_payment_reference text,
  p_preferred_viewing_at timestamptz default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_listing public.vacant_house_listings%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_viewing_requests%rowtype;
  v_id uuid := gen_random_uuid();
  v_ref text;
  v_fee numeric;
  v_payment_status text;
  v_request_status text;
begin
  if v_user is null then raise exception 'Sign in to request house viewing details'; end if;

  select * into v_listing
  from public.vacant_house_listings
  where id=p_listing_id and approval_status='approved' and availability_status='vacant'
  for share;
  if not found then raise exception 'This house is no longer available'; end if;
  if v_listing.submitter_user_id=v_user then raise exception 'You already own this house submission'; end if;

  select * into v_settings from public.vacant_house_settings where id=1;
  if not v_settings.is_enabled then raise exception 'Vacant House viewing access is currently unavailable'; end if;
  v_fee:=round(v_settings.viewing_access_fee_kes,2);

  if v_fee>0 then
    if char_length(btrim(coalesce(p_payment_reference,'')))<6 then
      raise exception 'Paste a valid payment reference';
    end if;
    if not exists(
      select 1
      from public.payment_account_assignments a
      join public.payment_accounts p on p.id=a.account_id and p.status='active'
      where a.function_code='vacant_house_viewing'
    ) then
      raise exception 'LEOGO has not configured the Vacant House viewing payment account yet';
    end if;
    v_payment_status:='submitted';
    v_request_status:='pending_verification';
  else
    v_payment_status:='waived';
    v_request_status:='access_granted';
  end if;

  select * into v_existing
  from public.vacant_house_viewing_requests r
  where r.listing_id=p_listing_id and r.customer_user_id=v_user
  for update;

  if v_existing.id is not null then
    if v_existing.payment_status not in ('rejected') then
      return jsonb_build_object(
        'success',true,'request_id',v_existing.id,'request_reference',v_existing.request_reference,
        'payment_status',v_existing.payment_status,'request_status',v_existing.request_status,
        'already_exists',true
      );
    end if;

    update public.vacant_house_viewing_requests
    set payment_reference=nullif(btrim(coalesce(p_payment_reference,'')),''),
        payment_status=v_payment_status,
        request_status=v_request_status,
        preferred_viewing_at=p_preferred_viewing_at,
        customer_message=nullif(btrim(coalesce(p_message,'')),''),
        fee_amount_kes=v_fee,
        admin_notes=null,
        verified_by=null,verified_at=null,
        access_granted_at=case when v_request_status='access_granted' then now() else null end,
        updated_at=now()
    where id=v_existing.id;

    return jsonb_build_object(
      'success',true,'request_id',v_existing.id,'request_reference',v_existing.request_reference,
      'payment_status',v_payment_status,'request_status',v_request_status,'resubmitted',true
    );
  end if;

  v_ref:='VHR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,7));

  insert into public.vacant_house_viewing_requests(
    id,request_reference,listing_id,customer_user_id,preferred_viewing_at,customer_message,
    fee_amount_kes,payment_reference,payment_status,request_status,access_granted_at
  )
  values(
    v_id,v_ref,p_listing_id,v_user,p_preferred_viewing_at,
    nullif(btrim(coalesce(p_message,'')),''),
    v_fee,nullif(btrim(coalesce(p_payment_reference,'')),''),
    v_payment_status,v_request_status,
    case when v_request_status='access_granted' then now() else null end
  );

  return jsonb_build_object(
    'success',true,'request_id',v_id,'request_reference',v_ref,
    'payment_status',v_payment_status,'request_status',v_request_status,'fee_amount_kes',v_fee
  );
end
$function$;

revoke all on function public.customer_submit_vacant_house_viewing_request(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.customer_submit_vacant_house_viewing_request(uuid,text,timestamptz,text) to authenticated;

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
    'monthly_rent_kes',l.monthly_rent_kes,'area_estate',l.area_estate,'sub_county',l.sub_county,'county',l.county,
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
    raise exception 'Vacant Houses Admin access required';
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
      'monthly_rent_kes',l.monthly_rent_kes,'deposit_kes',l.deposit_kes,
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
      'listing_reference',l.listing_reference,'title',l.title,
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
      'vacant_listings',(select count(*) from public.vacant_house_listings where approval_status='approved' and availability_status='vacant'),
      'occupied_listings',(select count(*) from public.vacant_house_listings where approval_status='approved' and availability_status='occupied'),
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

create or replace function public.admin_save_vacant_house_settings(
  p_is_enabled boolean,
  p_voucher_enabled boolean,
  p_submission_voucher_kes numeric,
  p_viewing_access_fee_kes numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings or fee management permission required';
  end if;
  if coalesce(p_submission_voucher_kes,-1)<0 or p_submission_voucher_kes>1000000 then
    raise exception 'Enter a valid submission Shopping Voucher amount';
  end if;
  if coalesce(p_viewing_access_fee_kes,-1)<0 or p_viewing_access_fee_kes>1000000 then
    raise exception 'Enter a valid viewing/access fee';
  end if;

  select to_jsonb(s) into v_before from public.vacant_house_settings s where id=1 for update;
  update public.vacant_house_settings
  set is_enabled=coalesce(p_is_enabled,false),
      voucher_enabled=coalesce(p_voucher_enabled,false),
      submission_voucher_kes=round(p_submission_voucher_kes,2),
      viewing_access_fee_kes=round(p_viewing_access_fee_kes,2),
      updated_by=(select auth.uid()),updated_at=now()
  where id=1
  returning to_jsonb(vacant_house_settings.*) into v_after;

  perform private.write_admin_audit(
    'vacant_houses.settings.updated','vacant_house_settings','1',
    v_before,v_after,'{}'::jsonb
  );
  return jsonb_build_object('success',true,'settings',v_after);
end
$function$;

revoke all on function public.admin_save_vacant_house_settings(boolean,boolean,numeric,numeric) from public,anon;
grant execute on function public.admin_save_vacant_house_settings(boolean,boolean,numeric,numeric) to authenticated;

create or replace function public.admin_review_vacant_house_listing(
  p_listing_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.vacant_house_listings%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_status text;
  v_reward_id uuid;
  v_voucher numeric:=0;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Give a clear rejection reason'; end if;

  select * into v_row from public.vacant_house_listings where id=p_listing_id for update;
  if not found then raise exception 'Vacant house listing not found'; end if;
  if v_row.approval_status not in ('pending','under_review') then raise exception 'This house listing has already been reviewed'; end if;

  v_before:=to_jsonb(v_row);
  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end;

  if p_decision='approve' then
    select * into v_settings from public.vacant_house_settings where id=1;
    if v_settings.voucher_enabled and v_settings.submission_voucher_kes>0 and v_row.source_type='customer' then
      v_voucher:=round(v_settings.submission_voucher_kes,2);
      v_reward_id:=private.credit_vacant_house_submission_voucher(
        v_row.submitter_user_id,v_row.id,v_voucher,(select auth.uid())
      );
    end if;
  end if;

  update public.vacant_house_listings
  set approval_status=v_status,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      approved_by=case when p_decision='approve' then (select auth.uid()) else approved_by end,
      approved_at=case when p_decision='approve' then now() else approved_at end,
      voucher_amount_kes=case when p_decision='approve' then v_voucher else voucher_amount_kes end,
      voucher_reward_id=case when p_decision='approve' then v_reward_id else voucher_reward_id end,
      updated_at=now()
  where id=p_listing_id
  returning to_jsonb(vacant_house_listings.*) into v_after;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.submitter_user_id,'vacant_house_'||v_status,
    case v_status when 'approved' then 'Vacant house approved' when 'rejected' then 'Vacant house not approved' else 'Vacant house under review' end,
    case v_status
      when 'approved' then '"'||v_row.title||'" is now visible in Vacant Houses.'
        ||case when v_voucher>0 then ' A Shopping Voucher worth KSh '||trim(to_char(v_voucher,'FM999999990.00'))||' has been credited as LEOGO Points.' else '' end
      when 'rejected' then '"'||v_row.title||'" was not approved. '||coalesce(p_notes,'')
      else '"'||v_row.title||'" is under LEOGO Admin review.'
    end,
    'vacant_house_listing',p_listing_id,
    'vacant_house_'||v_status||'_'||p_listing_id::text||'_'||extract(epoch from now())::bigint::text,
    'wallet',
    jsonb_build_object('listing_id',p_listing_id,'status',v_status,'voucher_kes',v_voucher)
  );

  perform private.write_admin_audit(
    'approval.vacant_house.'||p_decision,'vacant_house_listing',p_listing_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''),'voucher_kes',v_voucher)
  );

  return jsonb_build_object('success',true,'listing_id',p_listing_id,'approval_status',v_status,'voucher_kes',v_voucher);
end
$function$;

revoke all on function public.admin_review_vacant_house_listing(uuid,text,text) from public,anon;
grant execute on function public.admin_review_vacant_house_listing(uuid,text,text) to authenticated;

create or replace function public.admin_review_vacant_house_viewing_payment(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.vacant_house_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('payments.manage')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment or approval permission required';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Unsupported payment decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Give a clear rejection reason'; end if;

  select * into v_row from public.vacant_house_viewing_requests where id=p_request_id for update;
  if not found then raise exception 'Viewing request not found'; end if;
  if v_row.payment_status<>'submitted' then raise exception 'This viewing payment has already been reviewed'; end if;
  select * into v_listing from public.vacant_house_listings where id=v_row.listing_id;

  v_before:=to_jsonb(v_row);

  update public.vacant_house_viewing_requests
  set payment_status=case when p_decision='verify' then 'verified' else 'rejected' end,
      request_status=case when p_decision='verify' then 'access_granted' else 'pending_verification' end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      verified_by=(select auth.uid()),
      verified_at=now(),
      access_granted_at=case when p_decision='verify' then now() else null end,
      updated_at=now()
  where id=p_request_id
  returning to_jsonb(vacant_house_viewing_requests.*) into v_after;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.customer_user_id,
    case when p_decision='verify' then 'vacant_house_access_granted' else 'vacant_house_payment_rejected' end,
    case when p_decision='verify' then 'House viewing details unlocked' else 'House viewing payment needs attention' end,
    case when p_decision='verify'
      then 'Payment for "'||coalesce(v_listing.title,'Vacant House')||'" was verified. Exact location and landlord/agent contact details are now available in your Vacant Houses requests.'
      else 'The viewing/access payment for "'||coalesce(v_listing.title,'Vacant House')||'" was not verified. '||coalesce(p_notes,'Please check the payment reference and resubmit.')
    end,
    'vacant_house_viewing',p_request_id,
    'vacant_house_viewing_'||p_decision||'_'||p_request_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',
    jsonb_build_object('request_id',p_request_id,'listing_id',v_row.listing_id,'decision',p_decision)
  );

  perform private.write_admin_audit(
    'vacant_house.viewing_payment.'||p_decision,'vacant_house_viewing',p_request_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object(
    'success',true,'request_id',p_request_id,
    'payment_status',case when p_decision='verify' then 'verified' else 'rejected' end
  );
end
$function$;

revoke all on function public.admin_review_vacant_house_viewing_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_vacant_house_viewing_payment(uuid,text,text) to authenticated;

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
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_status not in ('vacant','occupied','archived') then raise exception 'Unsupported availability status'; end if;

  select to_jsonb(l) into v_before from public.vacant_house_listings l where id=p_listing_id for update;
  if v_before is null then raise exception 'Vacant house listing not found'; end if;

  update public.vacant_house_listings
  set availability_status=p_status,
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
      occupied_at=case when p_status='occupied' then now() else null end,
      updated_at=now()
  where id=p_listing_id and approval_status='approved'
  returning to_jsonb(vacant_house_listings.*) into v_after;

  if v_after is null then raise exception 'Only approved house listings can change availability'; end if;

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

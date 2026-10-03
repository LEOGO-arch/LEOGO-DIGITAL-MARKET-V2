-- LEOGO DIGITAL MARKET V2
-- Health & Medicine Partner V1
-- Separate regulated partner path. Additive: existing Seller -> Admin -> Customer order workflow is untouched.
-- Health products are browse/enquiry only in V1; checkout integration will be added only with the dedicated medicine rules.

create table if not exists public.health_medicine_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  id_number text not null,
  phone text not null,
  business_type text not null check (business_type in (
    'pharmacy','optics','medical_supplies','orthopaedic_rehab','laboratory_diagnostics','other_health'
  )),
  other_business_type text,
  county text not null,
  sub_county text not null,
  county_code text,
  sub_county_code text,
  town text not null,
  location_details text not null,
  shop_latitude numeric,
  shop_longitude numeric,
  shop_map_link text,
  business_description text,
  profile_picture_path text,
  business_id_document_path text not null,
  business_licence_path text,
  regulatory_licence_path text,
  professional_certificate_path text,
  registration_certificate_path text,
  other_permit_paths text[] not null default '{}',
  application_status text not null default 'submitted'
    check (application_status in ('submitted','under_review','changes_requested','approved','rejected','suspended')),
  availability_status text not null default 'open'
    check (availability_status in ('open','busy','closed')),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_pharmacy_regulatory_document_check check (
    business_type <> 'pharmacy'
    or nullif(btrim(coalesce(regulatory_licence_path,'')),'') is not null
  ),
  constraint health_other_business_type_check check (
    business_type <> 'other_health'
    or char_length(btrim(coalesce(other_business_type,''))) >= 2
  )
);

create index if not exists health_medicine_accounts_status_idx
  on public.health_medicine_accounts(application_status,submitted_at desc);
create index if not exists health_medicine_accounts_location_idx
  on public.health_medicine_accounts(county_code,sub_county_code,town);
create index if not exists health_medicine_accounts_type_idx
  on public.health_medicine_accounts(business_type,application_status);

create table if not exists public.health_medicine_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.health_medicine_accounts(user_id) on delete cascade,
  product_name text not null,
  product_kind text not null check (product_kind in (
    'pharmaceutical','optical','medical_supply','orthopaedic_rehab','diagnostic_lab','other_health'
  )),
  medicine_classification text not null default 'non_medicine'
    check (medicine_classification in ('non_medicine','otc','prescription_required','pharmacy_only')),
  requires_prescription boolean not null default false,
  brand text,
  description text,
  price_kes numeric(12,2) not null check (price_kes>=0),
  quantity_available numeric(12,2) not null default 0 check (quantity_available>=0),
  measurement_unit text not null default 'piece',
  image_path text not null,
  availability_status text not null default 'available'
    check (availability_status in ('available','out_of_stock','inactive')),
  order_mode text not null default 'enquiry_only'
    check (order_mode in ('enquiry_only')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_product_medicine_classification_check check (
    (product_kind='pharmaceutical' and medicine_classification<>'non_medicine')
    or (product_kind<>'pharmaceutical' and medicine_classification='non_medicine' and requires_prescription=false)
  ),
  constraint health_product_prescription_flag_check check (
    requires_prescription=(medicine_classification='prescription_required')
  )
);

create index if not exists health_medicine_products_provider_idx
  on public.health_medicine_products(provider_id,approval_status,availability_status);
create index if not exists health_medicine_products_kind_idx
  on public.health_medicine_products(product_kind,approval_status);

alter table public.health_medicine_accounts enable row level security;
alter table public.health_medicine_products enable row level security;

drop policy if exists health_account_read_own on public.health_medicine_accounts;
create policy health_account_read_own
on public.health_medicine_accounts for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists health_account_admin_read on public.health_medicine_accounts;
create policy health_account_admin_read
on public.health_medicine_accounts for select to authenticated
using (private.is_leogo_admin('approvals.read'));

drop policy if exists health_products_read_own on public.health_medicine_products;
create policy health_products_read_own
on public.health_medicine_products for select to authenticated
using ((select auth.uid())=provider_id);

drop policy if exists health_products_admin_read on public.health_medicine_products;
create policy health_products_admin_read
on public.health_medicine_products for select to authenticated
using (private.is_leogo_admin('approvals.read'));

grant select on public.health_medicine_accounts,public.health_medicine_products to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
('health-medicine-verification','health-medicine-verification',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp']),
('health-medicine-public-media','health-medicine-public-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update
set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists health_verification_insert_own on storage.objects;
create policy health_verification_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id='health-medicine-verification'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists health_verification_read_authorized on storage.objects;
create policy health_verification_read_authorized
on storage.objects for select to authenticated
using (
  bucket_id='health-medicine-verification'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or private.is_leogo_admin('approvals.read')
  )
);

drop policy if exists health_verification_update_own on storage.objects;
create policy health_verification_update_own
on storage.objects for update to authenticated
using (
  bucket_id='health-medicine-verification'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='health-medicine-verification'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists health_public_insert_own on storage.objects;
create policy health_public_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id='health-medicine-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists health_public_update_own on storage.objects;
create policy health_public_update_own
on storage.objects for update to authenticated
using (
  bucket_id='health-medicine-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='health-medicine-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists health_public_delete_own on storage.objects;
create policy health_public_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='health-medicine-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function public.health_medicine_get_own_account()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select to_jsonb(h) into v_row
  from public.health_medicine_accounts h
  where h.user_id=v_uid;
  return v_row;
end;
$$;

revoke all on function public.health_medicine_get_own_account() from public,anon;
grant execute on function public.health_medicine_get_own_account() to authenticated;

create or replace function public.health_medicine_submit_application(
  p_business_name text,
  p_owner_name text,
  p_id_number text,
  p_phone text,
  p_business_type text,
  p_other_business_type text,
  p_county_code text,
  p_sub_county_code text,
  p_town text,
  p_location_details text,
  p_shop_latitude numeric,
  p_shop_longitude numeric,
  p_shop_map_link text,
  p_business_description text,
  p_profile_picture_path text,
  p_business_id_document_path text,
  p_business_licence_path text,
  p_regulatory_licence_path text,
  p_professional_certificate_path text,
  p_registration_certificate_path text,
  p_other_permit_paths text[] default '{}'
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_existing text;
  v_county text;
  v_sub_county text;
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_business_name,'')))<2 then raise exception 'Business name is required'; end if;
  if char_length(btrim(coalesce(p_owner_name,'')))<2 then raise exception 'Owner / responsible person name is required'; end if;
  if char_length(btrim(coalesce(p_id_number,'')))<5 then raise exception 'A valid identification number is required'; end if;
  if coalesce(p_phone,'') !~ '^[+]254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if p_business_type not in ('pharmacy','optics','medical_supplies','orthopaedic_rehab','laboratory_diagnostics','other_health') then
    raise exception 'Choose a valid Health & Medicine business type';
  end if;
  if p_business_type='other_health' and char_length(btrim(coalesce(p_other_business_type,'')))<2 then
    raise exception 'Describe the Health & Medicine business type';
  end if;
  if p_business_type='pharmacy' and nullif(btrim(coalesce(p_regulatory_licence_path,'')),'') is null then
    raise exception 'A Pharmacy / pharmaceuticals regulatory licence document is required';
  end if;
  if nullif(btrim(coalesce(p_business_id_document_path,'')),'') is null then
    raise exception 'Business ID / identification document is required';
  end if;

  select c.name into v_county
  from public.kenya_counties c
  where c.code=p_county_code and c.is_active;
  if v_county is null then raise exception 'Choose a valid county'; end if;

  select s.name into v_sub_county
  from public.kenya_subcounties s
  where s.code=p_sub_county_code and s.county_code=p_county_code and s.is_active;
  if v_sub_county is null then raise exception 'Choose a valid sub-county'; end if;

  select application_status into v_existing
  from public.health_medicine_accounts where user_id=v_uid;

  if v_existing is not null and v_existing not in ('changes_requested','rejected') then
    raise exception 'Your Health & Medicine application is already locked for review';
  end if;

  insert into public.health_medicine_accounts(
    user_id,business_name,owner_name,id_number,phone,business_type,other_business_type,
    county,sub_county,county_code,sub_county_code,town,location_details,
    shop_latitude,shop_longitude,shop_map_link,business_description,profile_picture_path,
    business_id_document_path,business_licence_path,regulatory_licence_path,
    professional_certificate_path,registration_certificate_path,other_permit_paths,
    application_status,availability_status,submitted_at,approved_at,approved_by,admin_notes,updated_at
  ) values (
    v_uid,btrim(p_business_name),btrim(p_owner_name),upper(btrim(p_id_number)),btrim(p_phone),
    p_business_type,nullif(btrim(coalesce(p_other_business_type,'')),''),
    v_county,v_sub_county,p_county_code,p_sub_county_code,btrim(p_town),btrim(p_location_details),
    p_shop_latitude,p_shop_longitude,nullif(btrim(coalesce(p_shop_map_link,'')),''),
    nullif(btrim(coalesce(p_business_description,'')),''),
    nullif(btrim(coalesce(p_profile_picture_path,'')),''),
    btrim(p_business_id_document_path),
    nullif(btrim(coalesce(p_business_licence_path,'')),''),
    nullif(btrim(coalesce(p_regulatory_licence_path,'')),''),
    nullif(btrim(coalesce(p_professional_certificate_path,'')),''),
    nullif(btrim(coalesce(p_registration_certificate_path,'')),''),
    coalesce(p_other_permit_paths,'{}'),'submitted','open',now(),null,null,null,now()
  )
  on conflict(user_id) do update set
    business_name=excluded.business_name,owner_name=excluded.owner_name,id_number=excluded.id_number,phone=excluded.phone,
    business_type=excluded.business_type,other_business_type=excluded.other_business_type,
    county=excluded.county,sub_county=excluded.sub_county,county_code=excluded.county_code,sub_county_code=excluded.sub_county_code,
    town=excluded.town,location_details=excluded.location_details,shop_latitude=excluded.shop_latitude,
    shop_longitude=excluded.shop_longitude,shop_map_link=excluded.shop_map_link,business_description=excluded.business_description,
    profile_picture_path=excluded.profile_picture_path,business_id_document_path=excluded.business_id_document_path,
    business_licence_path=excluded.business_licence_path,regulatory_licence_path=excluded.regulatory_licence_path,
    professional_certificate_path=excluded.professional_certificate_path,
    registration_certificate_path=excluded.registration_certificate_path,other_permit_paths=excluded.other_permit_paths,
    application_status='submitted',submitted_at=now(),approved_at=null,approved_by=null,admin_notes=null,updated_at=now()
  returning to_jsonb(health_medicine_accounts.*) into v_row;

  return v_row;
end;
$$;

revoke all on function public.health_medicine_submit_application(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text[]) from public,anon;
grant execute on function public.health_medicine_submit_application(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text[]) to authenticated;

create or replace function public.health_medicine_list_own_products()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc),'[]'::jsonb)
  into v_rows
  from public.health_medicine_products p
  where p.provider_id=v_uid;
  return v_rows;
end;
$$;

revoke all on function public.health_medicine_list_own_products() from public,anon;
grant execute on function public.health_medicine_list_own_products() to authenticated;

create or replace function public.health_medicine_save_product(
  p_product_id uuid,
  p_product_name text,
  p_product_kind text,
  p_medicine_classification text,
  p_brand text,
  p_description text,
  p_price_kes numeric,
  p_quantity_available numeric,
  p_measurement_unit text,
  p_image_path text,
  p_availability_status text
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_business_type text;
  v_id uuid;
  v_requires_prescription boolean:=false;
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select business_type into v_business_type
  from public.health_medicine_accounts
  where user_id=v_uid and application_status='approved';

  if v_business_type is null then
    raise exception 'Approved Health & Medicine Partner account required';
  end if;

  if char_length(btrim(coalesce(p_product_name,'')))<2 then raise exception 'Product name is required'; end if;
  if p_product_kind not in ('pharmaceutical','optical','medical_supply','orthopaedic_rehab','diagnostic_lab','other_health') then
    raise exception 'Choose a valid Health & Medicine product type';
  end if;

  if v_business_type='pharmacy' and p_product_kind not in ('pharmaceutical','medical_supply','other_health') then
    raise exception 'A Pharmacy profile can list pharmaceuticals, medical supplies and other approved pharmacy items only';
  elsif v_business_type='optics' and p_product_kind not in ('optical','medical_supply') then
    raise exception 'An Optics profile can list optical items and related medical supplies only';
  elsif v_business_type='medical_supplies' and p_product_kind<>'medical_supply' then
    raise exception 'This Medical Supplies profile can list medical supplies only';
  elsif v_business_type='orthopaedic_rehab' and p_product_kind not in ('orthopaedic_rehab','medical_supply') then
    raise exception 'This Orthopaedic / Rehabilitation profile can list orthopaedic, rehabilitation and related medical supplies only';
  elsif v_business_type='laboratory_diagnostics' and p_product_kind not in ('diagnostic_lab','medical_supply') then
    raise exception 'This Laboratory / Diagnostics profile can list diagnostic/lab and related medical supplies only';
  elsif v_business_type='other_health' and p_product_kind<>'other_health' then
    raise exception 'This Other Health profile can list only its approved Other Health items';
  end if;

  if p_product_kind='pharmaceutical' then
    if v_business_type<>'pharmacy' then raise exception 'Only an approved Pharmacy partner can list pharmaceutical products'; end if;
    if p_medicine_classification not in ('otc','prescription_required','pharmacy_only') then
      raise exception 'Choose OTC, Prescription Required or Pharmacy-only for a pharmaceutical item';
    end if;
    v_requires_prescription:=p_medicine_classification='prescription_required';
  else
    p_medicine_classification:='non_medicine';
    v_requires_prescription:=false;
  end if;

  if coalesce(p_price_kes,-1)<0 then raise exception 'Enter a valid price'; end if;
  if coalesce(p_quantity_available,-1)<0 then raise exception 'Enter a valid quantity'; end if;
  if nullif(btrim(coalesce(p_measurement_unit,'')),'') is null then raise exception 'Measurement unit is required'; end if;
  if nullif(btrim(coalesce(p_image_path,'')),'') is null then raise exception 'Product image is required'; end if;
  if p_availability_status not in ('available','out_of_stock','inactive') then raise exception 'Choose a valid availability status'; end if;

  if p_product_id is null then
    insert into public.health_medicine_products(
      provider_id,product_name,product_kind,medicine_classification,requires_prescription,
      brand,description,price_kes,quantity_available,measurement_unit,image_path,availability_status,
      order_mode,approval_status,admin_notes,submitted_at,approved_at,approved_by,updated_at
    ) values (
      v_uid,btrim(p_product_name),p_product_kind,p_medicine_classification,v_requires_prescription,
      nullif(btrim(coalesce(p_brand,'')),''),nullif(btrim(coalesce(p_description,'')),''),
      p_price_kes,p_quantity_available,btrim(p_measurement_unit),btrim(p_image_path),p_availability_status,
      'enquiry_only','pending',null,now(),null,null,now()
    ) returning id into v_id;
  else
    update public.health_medicine_products set
      product_name=btrim(p_product_name),product_kind=p_product_kind,
      medicine_classification=p_medicine_classification,requires_prescription=v_requires_prescription,
      brand=nullif(btrim(coalesce(p_brand,'')),''),description=nullif(btrim(coalesce(p_description,'')),''),
      price_kes=p_price_kes,quantity_available=p_quantity_available,measurement_unit=btrim(p_measurement_unit),
      image_path=btrim(p_image_path),availability_status=p_availability_status,
      order_mode='enquiry_only',approval_status='pending',admin_notes=null,submitted_at=now(),
      approved_at=null,approved_by=null,updated_at=now()
    where id=p_product_id and provider_id=v_uid
      and approval_status in ('pending','changes_requested','approved','rejected')
    returning id into v_id;

    if v_id is null then raise exception 'Health & Medicine product not found'; end if;
  end if;

  select to_jsonb(p) into v_row from public.health_medicine_products p where p.id=v_id;
  return v_row;
end;
$$;

revoke all on function public.health_medicine_save_product(uuid,text,text,text,text,text,numeric,numeric,text,text,text) from public,anon;
grant execute on function public.health_medicine_save_product(uuid,text,text,text,text,text,numeric,numeric,text,text,text) to authenticated;

create or replace function public.public_list_health_medicine()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id',h.user_id,
        'business_name',h.business_name,
        'business_type',h.business_type,
        'other_business_type',h.other_business_type,
        'county',h.county,
        'sub_county',h.sub_county,
        'town',h.town,
        'location_details',h.location_details,
        'shop_map_link',h.shop_map_link,
        'business_description',h.business_description,
        'profile_picture_path',h.profile_picture_path,
        'availability_status',h.availability_status,
        'approved_product_count',(select count(*) from public.health_medicine_products p where p.provider_id=h.user_id and p.approval_status='approved' and p.availability_status<>'inactive')
      ) order by h.business_name)
      from public.health_medicine_accounts h
      where h.application_status='approved'
        and h.availability_status<>'closed'
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'provider_id',p.provider_id,
        'provider_name',h.business_name,
        'business_type',h.business_type,
        'product_name',p.product_name,
        'product_kind',p.product_kind,
        'medicine_classification',p.medicine_classification,
        'requires_prescription',p.requires_prescription,
        'brand',p.brand,
        'description',p.description,
        'price_kes',p.price_kes,
        'quantity_available',p.quantity_available,
        'measurement_unit',p.measurement_unit,
        'image_path',p.image_path,
        'availability_status',p.availability_status,
        'order_mode',p.order_mode,
        'county',h.county,
        'sub_county',h.sub_county,
        'town',h.town,
        'location_details',h.location_details
      ) order by p.updated_at desc)
      from public.health_medicine_products p
      join public.health_medicine_accounts h on h.user_id=p.provider_id
      where h.application_status='approved'
        and h.availability_status<>'closed'
        and p.approval_status='approved'
        and p.availability_status<>'inactive'
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.public_list_health_medicine() from public;
grant execute on function public.public_list_health_medicine() to anon,authenticated;

create or replace function public.public_search_health_medicine(p_query text,p_limit integer default 12)
returns jsonb
language sql security definer set search_path=''
as $$
  with params as (
    select lower(btrim(coalesce(p_query,''))) q,greatest(1,least(coalesce(p_limit,12),30)) lim
  ),
  rows as (
    select
      'health_product'::text type,
      p.id,
      p.provider_id,
      p.product_name::text title,
      h.business_name::text subtitle,
      concat_ws(' · ',nullif(h.location_details,''),nullif(h.town,''),nullif(h.sub_county,''),nullif(h.county,''))::text location,
      p.price_kes,
      p.product_kind::text category,
      p.image_path,
      'health-medicine-public-media'::text media_bucket,
      p.requires_prescription,
      p.medicine_classification,
      p.updated_at,
      lower(concat_ws(' ',p.product_name,p.brand,p.description,p.product_kind,p.medicine_classification,h.business_name,h.business_type,h.location_details,h.town,h.sub_county,h.county)) haystack
    from public.health_medicine_products p
    join public.health_medicine_accounts h on h.user_id=p.provider_id
    where h.application_status='approved'
      and h.availability_status<>'closed'
      and p.approval_status='approved'
      and p.availability_status<>'inactive'

    union all

    select
      'health_partner'::text,
      h.user_id,
      h.user_id,
      h.business_name,
      initcap(replace(coalesce(nullif(h.other_business_type,''),h.business_type),'_',' ')),
      concat_ws(' · ',nullif(h.location_details,''),nullif(h.town,''),nullif(h.sub_county,''),nullif(h.county,'')),
      null::numeric,
      h.business_type,
      h.profile_picture_path,
      'health-medicine-public-media'::text,
      false,
      'non_medicine'::text,
      h.updated_at,
      lower(concat_ws(' ',h.business_name,h.business_type,h.other_business_type,h.business_description,h.location_details,h.town,h.sub_county,h.county))
    from public.health_medicine_accounts h
    where h.application_status='approved'
      and h.availability_status<>'closed'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type',r.type,'id',r.id,'provider_id',r.provider_id,'title',r.title,'subtitle',r.subtitle,
    'location',r.location,'price_kes',r.price_kes,'category',r.category,'image_path',r.image_path,
    'media_bucket',r.media_bucket,'requires_prescription',r.requires_prescription,
    'medicine_classification',r.medicine_classification,'section_id','health-medicine'
  ) order by
    case when lower(r.title)=(select q from params) then 100
         when lower(r.title) like (select q from params)||'%' then 90
         when lower(r.title) like '%'||(select q from params)||'%' then 80
         when lower(r.location) like '%'||(select q from params)||'%' then 70
         else 60 end desc,
    r.updated_at desc
  ),'[]'::jsonb)
  from (
    select r.*
    from rows r,params p
    where char_length(p.q)>=2 and r.haystack like '%'||p.q||'%'
    limit (select lim from params)
  ) r;
$$;

revoke all on function public.public_search_health_medicine(text,integer) from public;
grant execute on function public.public_search_health_medicine(text,integer) to anon,authenticated;

create or replace function public.admin_list_health_medicine_approvals()
returns table(
  kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,
  title text,subtitle text,amount_kes numeric,status text,submitted_at timestamptz,payload jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;

  return query
  with combined(kind,record_id,applicant_id,applicant_name,applicant_email,title,subtitle,amount_kes,status,submitted_at,payload) as (
    select
      'health_medicine_application'::text,h.user_id,h.user_id,h.business_name,u.email::text,
      'Health & Medicine Partner Registration'::text,
      concat_ws(' · ',initcap(replace(coalesce(nullif(h.other_business_type,''),h.business_type),'_',' ')),h.town,h.county),
      null::numeric,h.application_status,coalesce(h.submitted_at,h.created_at),to_jsonb(h)
    from public.health_medicine_accounts h
    left join auth.users u on u.id=h.user_id
    where h.application_status in ('submitted','under_review','changes_requested')

    union all

    select
      'health_medicine_product'::text,p.id,p.provider_id,h.business_name,u.email::text,
      p.product_name,
      concat_ws(' · ',initcap(replace(p.product_kind,'_',' ')),initcap(replace(p.medicine_classification,'_',' ')),h.town,h.county),
      p.price_kes,p.approval_status,coalesce(p.submitted_at,p.created_at),
      (to_jsonb(p)-'image_path')||jsonb_build_object(
        'health_business_name',h.business_name,
        'business_type',h.business_type,
        'health_product_image_path',p.image_path
      )
    from public.health_medicine_products p
    join public.health_medicine_accounts h on h.user_id=p.provider_id
    left join auth.users u on u.id=p.provider_id
    where p.approval_status in ('pending','under_review','changes_requested')
  )
  select * from combined
  order by submitted_at desc nulls last,kind;
end;
$$;

revoke all on function public.admin_list_health_medicine_approvals() from public,anon;
grant execute on function public.admin_list_health_medicine_approvals() to authenticated;

create or replace function public.admin_review_health_medicine_application(
  p_record_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_before jsonb;v_after jsonb;v_business_type text;v_regulatory text;v_status text;v_title text;v_message text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'A clear reason is required';
  end if;

  select to_jsonb(h),h.business_type,h.regulatory_licence_path
  into v_before,v_business_type,v_regulatory
  from public.health_medicine_accounts h
  where h.user_id=p_record_id for update;

  if v_before is null then raise exception 'Health & Medicine application not found'; end if;
  if p_decision='approve' and v_business_type='pharmacy' and nullif(btrim(coalesce(v_regulatory,'')),'') is null then
    raise exception 'A Pharmacy regulatory licence document must be present before approval';
  end if;

  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'changes_requested' then 'changes_requested' else 'under_review' end;

  update public.health_medicine_accounts set
    application_status=v_status,
    approved_at=case when p_decision='approve' then now() else approved_at end,
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where user_id=p_record_id
    and application_status in ('submitted','under_review','changes_requested');

  if not found then raise exception 'Health & Medicine application has already been reviewed'; end if;

  select to_jsonb(h) into v_after from public.health_medicine_accounts h where h.user_id=p_record_id;

  v_title:=case p_decision
    when 'approve' then 'Health & Medicine application approved'
    when 'changes_requested' then 'Health & Medicine application needs correction'
    when 'reject' then 'Health & Medicine application not approved'
    else 'Health & Medicine application under review' end;
  v_message:=case p_decision
    when 'approve' then 'Your Health & Medicine Partner account is approved. You can now submit products for Admin approval.'
    when 'changes_requested' then 'LEOGO Admin requested corrections to your Health & Medicine registration. Update and resubmit from the Partner Portal.'
    when 'reject' then 'Your Health & Medicine application was not approved. Review the Admin note in the Partner Portal.'
    else 'LEOGO Admin is reviewing your Health & Medicine application.' end;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(p_record_id,'health_medicine','health_medicine_application_'||v_status,v_title,v_message,'health_medicine_account',p_record_id,'health-overview',jsonb_build_object('status',v_status));

  perform private.write_admin_audit(
    'approval.health_medicine.application.'||p_decision,'health_medicine_account',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

revoke all on function public.admin_review_health_medicine_application(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_medicine_application(uuid,text,text) to authenticated;

create or replace function public.admin_review_health_medicine_product(
  p_record_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_before jsonb;v_after jsonb;v_provider uuid;v_status text;v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'A clear reason is required';
  end if;

  select to_jsonb(p),p.provider_id,p.product_name
  into v_before,v_provider,v_name
  from public.health_medicine_products p
  where p.id=p_record_id for update;
  if v_before is null then raise exception 'Health & Medicine product not found'; end if;

  if not exists(
    select 1 from public.health_medicine_accounts h
    where h.user_id=v_provider and h.application_status='approved'
  ) then raise exception 'Provider must remain approved before a Health & Medicine product can be approved'; end if;

  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'changes_requested' then 'changes_requested' else 'under_review' end;

  update public.health_medicine_products set
    approval_status=v_status,
    approved_at=case when p_decision='approve' then now() else approved_at end,
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_record_id
    and approval_status in ('pending','under_review','changes_requested');

  if not found then raise exception 'Health & Medicine product has already been reviewed'; end if;

  select to_jsonb(p) into v_after from public.health_medicine_products p where p.id=p_record_id;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(
    v_provider,'health_medicine','health_medicine_product_'||v_status,
    'Health & Medicine product '||case p_decision when 'approve' then 'approved' when 'changes_requested' then 'needs correction' when 'reject' then 'not approved' else 'under review' end,
    coalesce(v_name,'Product')||case p_decision
      when 'approve' then ' is approved and can appear in Health & Medicine.'
      when 'changes_requested' then ' needs changes before it can be approved.'
      when 'reject' then ' was not approved. Review the Admin note.'
      else ' is being reviewed by LEOGO Admin.' end,
    'health_medicine_product',p_record_id,'health-products',jsonb_build_object('status',v_status)
  );

  perform private.write_admin_audit(
    'approval.health_medicine.product.'||p_decision,'health_medicine_product',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

revoke all on function public.admin_review_health_medicine_product(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_medicine_product(uuid,text,text) to authenticated;

create or replace function public.admin_list_health_medicine_network()
returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'partners',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select h.user_id,h.business_name,h.owner_name,h.phone,h.business_type,h.other_business_type,
          h.county,h.sub_county,h.town,h.location_details,h.application_status,h.availability_status,
          h.submitted_at,h.approved_at,h.updated_at,u.email::text as email,
          (select count(*) from public.health_medicine_products p where p.provider_id=h.user_id) as product_count
        from public.health_medicine_accounts h
        left join auth.users u on u.id=h.user_id
      ) x
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select p.id,p.provider_id,h.business_name as provider_name,p.product_name,p.product_kind,
          p.medicine_classification,p.requires_prescription,p.brand,p.price_kes,p.quantity_available,
          p.measurement_unit,p.availability_status,p.order_mode,p.approval_status,p.admin_notes,
          p.submitted_at,p.approved_at,p.updated_at
        from public.health_medicine_products p
        join public.health_medicine_accounts h on h.user_id=p.provider_id
      ) x
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_health_medicine_network() from public,anon;
grant execute on function public.admin_list_health_medicine_network() to authenticated;

-- Keep the old "pharmacy" Seller taxonomy code reserved, but remove it from ordinary Seller/customer product categories.
-- There are currently no Seller products in this category, so this separation does not migrate or remove live Seller listings.
create or replace function public.seller_product_taxonomy()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'code',c.code,'name',c.name,'display_order',c.display_order,
        'is_active',c.is_active,'is_assignable',c.is_assignable,'is_aggregator',c.is_aggregator,
        'restricted_category',c.restricted_category
      ) order by c.display_order,c.name)
      from public.product_categories c
      where c.is_active=true and c.code<>'pharmacy'
    ),'[]'::jsonb),
    'subcategories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'category_id',s.category_id,'code',s.code,'name',s.name,
        'display_order',s.display_order,'is_active',s.is_active
      ) order by s.display_order,s.name)
      from public.product_subcategories s
      join public.product_categories c on c.id=s.category_id
      where s.is_active=true and c.code<>'pharmacy'
    ),'[]'::jsonb)
  );
$$;

create or replace function public.customer_product_categories()
returns table(id uuid,code text,name text,display_order integer,is_assignable boolean,is_aggregator boolean,restricted_category boolean,public_product_count bigint)
language sql security definer set search_path=''
as $$
  select
    c.id,c.code,c.name,c.display_order,c.is_assignable,c.is_aggregator,c.restricted_category,
    (
      select count(*)
      from public.seller_products p
      join public.seller_accounts s on s.user_id=p.seller_id
      where p.category_id=c.id
        and s.application_status='approved'
        and p.product_approval_status='approved'
        and p.listing_status='active'
        and p.availability_status in ('available','out_of_stock')
    )::bigint
  from public.product_categories c
  where c.is_active and c.code<>'pharmacy'
  order by c.display_order,c.name;
$$;

create or replace function public.health_medicine_assert_seller_category_allowed(p_category_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.product_categories c where c.id=p_category_id and c.code='pharmacy') then
    raise exception 'Health & Medicine products must be registered through the Health & Medicine Partner portal, not an ordinary Seller account';
  end if;
end;
$$;

revoke all on function public.health_medicine_assert_seller_category_allowed(uuid) from public,anon,authenticated;
grant execute on function public.health_medicine_assert_seller_category_allowed(uuid) to authenticated;

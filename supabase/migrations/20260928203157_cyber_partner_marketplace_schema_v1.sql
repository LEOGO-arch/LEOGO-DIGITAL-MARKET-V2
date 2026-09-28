-- LEOGO DIGITAL MARKET V2
-- Cyber Partner -> Admin -> Customer marketplace schema

create table if not exists public.cyber_provider_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  id_number text not null,
  phone text not null,
  county text not null,
  sub_county text not null,
  county_code text,
  sub_county_code text,
  town text not null,
  location_details text not null,
  shop_latitude numeric not null,
  shop_longitude numeric not null,
  shop_map_link text,
  business_description text,
  profile_picture_path text,
  business_id_document_path text not null,
  business_licence_path text,
  registration_certificate_path text,
  other_permit_paths text[] not null default '{}',
  application_status text not null default 'submitted'
    check (application_status in ('submitted','under_review','changes_requested','approved','rejected','suspended')),
  availability_status text not null default 'open'
    check (availability_status in ('open','busy','closed')),
  submitted_at timestamptz default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cyber_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.cyber_provider_accounts(user_id) on delete cascade,
  service_name text not null,
  service_category text not null default 'other'
    check (service_category in ('photocopy','printing','typesetting','online_service','scanning','lamination','branding','design','other')),
  description text,
  pricing_model text not null default 'per_item'
    check (pricing_model in ('per_page','per_item','fixed','quote')),
  price_kes numeric,
  unit_label text,
  requires_file_upload boolean not null default false,
  accepts_multiple_files boolean not null default true,
  is_available boolean not null default true,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cyber_services_price_check check (
    (pricing_model='quote' and (price_kes is null or price_kes>=0))
    or (pricing_model<>'quote' and price_kes is not null and price_kes>=0)
  )
);

create table if not exists public.cyber_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.cyber_provider_accounts(user_id) on delete cascade,
  product_name text not null,
  description text,
  price_kes numeric not null check (price_kes>=0),
  quantity_available numeric not null default 0 check (quantity_available>=0),
  measurement_unit text not null default 'piece',
  image_path text,
  availability_status text not null default 'available'
    check (availability_status in ('available','out_of_stock','inactive')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cyber_marketplace_settings (
  id smallint primary key default 1 check (id=1),
  cbd_delivery_fee_kes numeric not null default 50 check (cbd_delivery_fee_kes>=0),
  estate_delivery_fee_kes numeric not null default 80 check (estate_delivery_fee_kes>=0),
  outside_town_delivery_fee_kes numeric not null default 200 check (outside_town_delivery_fee_kes>=0),
  delivery_note text not null default 'Delivery fee is selected by delivery zone. Admin may update these rates.',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.cyber_marketplace_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.cyber_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  provider_id uuid not null references public.cyber_provider_accounts(user_id) on delete restrict,
  item_type text not null check (item_type in ('service','product')),
  service_id uuid references public.cyber_services(id) on delete restrict,
  product_id uuid references public.cyber_products(id) on delete restrict,
  item_name text not null,
  pricing_model text,
  quantity numeric not null default 1 check (quantity>0),
  unit_price_kes numeric,
  subtotal_kes numeric not null default 0 check (subtotal_kes>=0),
  provider_quote_kes numeric,
  provider_quote_notes text,
  pricing_status text not null default 'fixed'
    check (pricing_status in ('fixed','quote_requested','quoted','quote_accepted','quote_rejected')),
  fulfilment_method text not null check (fulfilment_method in ('pickup','delivery')),
  delivery_zone_code text check (delivery_zone_code is null or delivery_zone_code in ('cbd','estate','outside_town')),
  delivery_address text,
  delivery_landmark text,
  delivery_map_link text,
  delivery_latitude numeric,
  delivery_longitude numeric,
  delivery_fee_kes numeric not null default 0 check (delivery_fee_kes>=0),
  total_kes numeric not null default 0 check (total_kes>=0),
  customer_notes text,
  payment_reference text,
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','pending_verification','verified','rejected')),
  order_status text not null default 'submitted'
    check (order_status in ('submitted','awaiting_quote','awaiting_payment','accepted','processing','ready_for_pickup','out_for_delivery','completed','rejected','cancelled')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id),
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cyber_order_item_reference_check check (
    (item_type='service' and service_id is not null and product_id is null)
    or (item_type='product' and product_id is not null and service_id is null)
  )
);

create table if not exists public.cyber_order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cyber_orders(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists cyber_services_provider_idx on public.cyber_services(provider_id, approval_status, is_available);
create index if not exists cyber_products_provider_idx on public.cyber_products(provider_id, approval_status, availability_status);
create index if not exists cyber_orders_customer_idx on public.cyber_orders(customer_id, created_at desc);
create index if not exists cyber_orders_provider_idx on public.cyber_orders(provider_id, created_at desc);
create index if not exists cyber_order_files_order_idx on public.cyber_order_files(order_id);

alter table public.cyber_provider_accounts enable row level security;
alter table public.cyber_services enable row level security;
alter table public.cyber_products enable row level security;
alter table public.cyber_marketplace_settings enable row level security;
alter table public.cyber_orders enable row level security;
alter table public.cyber_order_files enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
('cyber-verification','cyber-verification',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp']),
('cyber-public-media','cyber-public-media',true,8388608,array['image/jpeg','image/png','image/webp']),
('cyber-order-files','cyber-order-files',false,20971520,array[
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png','image/webp','text/plain'
])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists cyber_verification_insert_own on storage.objects;
create policy cyber_verification_insert_own on storage.objects for insert to authenticated
with check (bucket_id='cyber-verification' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_verification_read_authorized on storage.objects;
create policy cyber_verification_read_authorized on storage.objects for select to authenticated
using (bucket_id='cyber-verification' and (split_part(name,'/',1)=(select auth.uid())::text or private.is_leogo_admin('approvals.read')));

drop policy if exists cyber_verification_update_own on storage.objects;
create policy cyber_verification_update_own on storage.objects for update to authenticated
using (bucket_id='cyber-verification' and split_part(name,'/',1)=(select auth.uid())::text)
with check (bucket_id='cyber-verification' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_public_media_insert_own on storage.objects;
create policy cyber_public_media_insert_own on storage.objects for insert to authenticated
with check (bucket_id='cyber-public-media' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_public_media_update_own on storage.objects;
create policy cyber_public_media_update_own on storage.objects for update to authenticated
using (bucket_id='cyber-public-media' and split_part(name,'/',1)=(select auth.uid())::text)
with check (bucket_id='cyber-public-media' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_public_media_delete_own on storage.objects;
create policy cyber_public_media_delete_own on storage.objects for delete to authenticated
using (bucket_id='cyber-public-media' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_order_files_insert_customer on storage.objects;
create policy cyber_order_files_insert_customer on storage.objects for insert to authenticated
with check (bucket_id='cyber-order-files' and split_part(name,'/',1)=(select auth.uid())::text);

drop policy if exists cyber_order_files_read_authorized on storage.objects;
create policy cyber_order_files_read_authorized on storage.objects for select to authenticated
using (
  bucket_id='cyber-order-files'
  and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.is_leogo_admin('approvals.read')
    or exists(
      select 1 from public.cyber_order_files f join public.cyber_orders o on o.id=f.order_id
      where f.storage_path=name and o.provider_id=(select auth.uid())
    )
  )
);

alter table public.partner_profile_change_requests drop constraint if exists partner_profile_change_requests_partner_type_check;
alter table public.partner_profile_change_requests add constraint partner_profile_change_requests_partner_type_check
check (partner_type in ('seller','service_provider','transport','accommodation','premium','cyber'));

alter table public.payment_account_assignments drop constraint if exists payment_account_assignments_function_code_check;
alter table public.payment_account_assignments add constraint payment_account_assignments_function_code_check
check (function_code in (
  'wallet_sacco_deposits','savings_challenge','loan_repayment','marketplace_orders','lipa_pole_pole',
  'premium_payments','accommodation_payments','service_payments','transport_payments','cyber_orders','other_revenue'
));

insert into public.payment_account_assignments(function_code,account_id,assigned_by,assigned_at,updated_at)
select 'cyber_orders',account_id,assigned_by,now(),now()
from public.payment_account_assignments where function_code='marketplace_orders'
on conflict(function_code) do nothing;

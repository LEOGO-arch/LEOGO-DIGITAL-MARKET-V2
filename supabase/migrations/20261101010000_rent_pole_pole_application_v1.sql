-- Lipa Rent Pole Pole: private application intake only. No funds move in this migration.
create table if not exists public.rent_house_types (
  code text primary key check (code ~ '^[a-z0-9_]{2,50}$'),
  label text not null check (length(trim(label)) between 2 and 100),
  sort_order integer not null default 100,
  is_active boolean not null default true
);
insert into public.rent_house_types(code,label,sort_order) values
  ('single_room','Single Room',10),('bedsitter','Bedsitter',20),('one_bedroom','One Bedroom',30),
  ('two_bedroom','Two Bedrooms',40),('three_bedroom','Three Bedrooms',50),
  ('four_plus_bedroom','Four or More Bedrooms',60),('furnished_apartment','Furnished Apartment',70),
  ('maisonette','Maisonette',80),('other','Other',90)
on conflict (code) do nothing;

create table if not exists public.rent_installment_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  identity_number text not null check (length(trim(identity_number)) between 4 and 35),
  portrait_path text,
  house_type text not null references public.rent_house_types(code),
  monthly_rent numeric(14,2) not null check (monthly_rent > 0 and monthly_rent <= 10000000),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0 and deposit_amount <= 10000000),
  payment_frequency text not null check (payment_frequency in ('monthly','quarterly','four_months','half_yearly','annually')),
  county text not null,
  sub_county text not null,
  estate text not null check (length(trim(estate)) between 2 and 150),
  map_pin text,
  landlord_account text,
  description text,
  status text not null default 'submitted' check (status in ('submitted','needs_information','under_review','verified','active','rejected','suspended','closed')),
  landlord_verified_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  terms_document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_app_verified_requires_landlord check (status not in ('verified','active') or landlord_verified_at is not null),
  constraint rent_app_active_requires_approval check (status <> 'active' or (approved_at is not null and approved_by is not null))
);
create index if not exists rent_app_customer_date_idx on public.rent_installment_applications(customer_id,created_at desc);
create index if not exists rent_app_status_date_idx on public.rent_installment_applications(status,created_at desc);

alter table public.rent_house_types enable row level security;
alter table public.rent_installment_applications enable row level security;
create policy rent_types_public_read on public.rent_house_types for select to anon,authenticated using (is_active);
create policy rent_types_admin_read on public.rent_house_types for select to authenticated using (private.is_leogo_admin('settings.manage'));
create policy rent_types_admin_insert on public.rent_house_types for insert to authenticated with check (private.is_leogo_admin('settings.manage'));
create policy rent_types_admin_update on public.rent_house_types for update to authenticated using (private.is_leogo_admin('settings.manage')) with check (private.is_leogo_admin('settings.manage'));
create policy rent_application_customer_read on public.rent_installment_applications for select to authenticated using (customer_id = (select auth.uid()));
create policy rent_application_admin_read on public.rent_installment_applications for select to authenticated using (private.is_leogo_admin('approvals.read'));
create policy rent_application_customer_submit on public.rent_installment_applications for insert to authenticated
with check (customer_id=(select auth.uid()) and status='submitted' and portrait_path is null and approved_at is null and approved_by is null and landlord_verified_at is null and terms_document_path is null);

-- Only the portrait_path can be populated by the applicant, once, while the record is pending.
-- A trigger prevents UPDATE from modifying financial, identity, status, and approval fields.
create or replace function private.rent_customer_update_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_leogo_admin('approvals.manage') then return new; end if;
  if old.customer_id <> auth.uid() then raise exception 'Not your application'; end if;
  if old.status not in ('submitted','needs_information') then raise exception 'Contact LEOGO to amend an approved application'; end if;
  if (to_jsonb(new) - 'portrait_path' - 'updated_at') is distinct from (to_jsonb(old) - 'portrait_path' - 'updated_at')
    or old.portrait_path is not null or new.portrait_path is null
    or new.portrait_path !~ ('^' || old.customer_id::text || '/' || old.id::text || '\.(jpg|png|webp)$')
  then raise exception 'Only the initial identity photograph link may be saved'; end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger rent_customer_update_guard before update on public.rent_installment_applications
for each row execute function private.rent_customer_update_guard();
create policy rent_application_customer_portrait on public.rent_installment_applications for update to authenticated
using (customer_id=(select auth.uid()) and status in ('submitted','needs_information') and portrait_path is null)
with check (customer_id=(select auth.uid()));
create policy rent_application_admin_update on public.rent_installment_applications for update to authenticated
using (private.is_leogo_admin('approvals.manage')) with check (private.is_leogo_admin('approvals.manage'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('rent-applicant-private','rent-applicant-private',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy rent_portrait_owner_upload on storage.objects for insert to authenticated
with check (bucket_id='rent-applicant-private' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.rent_installment_applications a where a.id::text=split_part(split_part(name,'/',2),'.',1) and a.customer_id=(select auth.uid()) and a.portrait_path is null));
create policy rent_portrait_owner_read on storage.objects for select to authenticated
using (bucket_id='rent-applicant-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy rent_portrait_admin_read on storage.objects for select to authenticated
using (bucket_id='rent-applicant-private' and private.is_leogo_admin('approvals.read'));

grant select on public.rent_house_types to anon,authenticated;
grant insert,update on public.rent_house_types to authenticated;
grant select,insert,update on public.rent_installment_applications to authenticated;

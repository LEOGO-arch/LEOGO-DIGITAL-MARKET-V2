-- Customer one-off sale workflow for non-Seller accounts.
-- Includes secure media, Admin approval, public personal listing feed and customer notifications.

create table if not exists public.customer_personal_sale_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seller_name text not null check (char_length(btrim(seller_name)) between 2 and 120),
  id_number text not null check (char_length(btrim(id_number)) between 4 and 40),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  location text not null check (char_length(btrim(location)) between 2 and 160),
  item_name text not null check (char_length(btrim(item_name)) between 2 and 160),
  marked_price_kes numeric(12,2) not null check (marked_price_kes > 0),
  item_image_path text not null,
  ownership_proof_path text,
  approval_status text not null default 'pending' check (approval_status in ('pending','under_review','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  sale_status text not null default 'available' check (sale_status in ('available','sold','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_personal_sale_listings enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('customer-sale-media','customer-sale-media',true,6291456,array['image/jpeg','image/png','image/webp']::text[]),
  ('customer-sale-verification','customer-sale-verification',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do update
set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "customer_sale_media_insert_own" on storage.objects;
create policy "customer_sale_media_insert_own" on storage.objects for insert to authenticated
with check (bucket_id='customer-sale-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "customer_sale_media_update_own" on storage.objects;
create policy "customer_sale_media_update_own" on storage.objects for update to authenticated
using (bucket_id='customer-sale-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='customer-sale-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "customer_sale_media_delete_own" on storage.objects;
create policy "customer_sale_media_delete_own" on storage.objects for delete to authenticated
using (bucket_id='customer-sale-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "customer_sale_media_public_read" on storage.objects;
create policy "customer_sale_media_public_read" on storage.objects for select to public
using (bucket_id='customer-sale-media');

drop policy if exists "customer_sale_verification_insert_own" on storage.objects;
create policy "customer_sale_verification_insert_own" on storage.objects for insert to authenticated
with check (bucket_id='customer-sale-verification' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "customer_sale_verification_select_owner" on storage.objects;
create policy "customer_sale_verification_select_owner" on storage.objects for select to authenticated
using (bucket_id='customer-sale-verification' and owner_id=(select auth.uid())::text);
drop policy if exists "customer_sale_verification_select_admin" on storage.objects;
create policy "customer_sale_verification_select_admin" on storage.objects for select to authenticated
using (bucket_id='customer-sale-verification' and private.is_leogo_admin('approvals.read'));
drop policy if exists "customer_sale_verification_delete_own" on storage.objects;
create policy "customer_sale_verification_delete_own" on storage.objects for delete to authenticated
using (bucket_id='customer-sale-verification' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.customer_personal_sale_eligibility()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_is_seller boolean;
begin
  if v_uid is null then return jsonb_build_object('authenticated',false,'eligible',false,'is_seller',false,'reason','Sign in to sell a personal item.'); end if;
  select exists(select 1 from public.seller_accounts s where s.user_id=v_uid) into v_is_seller;
  return jsonb_build_object('authenticated',true,'eligible',not v_is_seller,'is_seller',v_is_seller,
    'reason',case when v_is_seller then 'This feature is for customers who are not registered Sellers. Use the LEOGO Partner Portal for Seller products.' else null end);
end $$;

create or replace function public.customer_submit_personal_sale(
  p_seller_name text,p_id_number text,p_phone text,p_location text,p_item_name text,
  p_marked_price_kes numeric,p_item_image_path text,p_ownership_proof_path text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if exists(select 1 from public.seller_accounts s where s.user_id=v_uid) then raise exception 'Registered Sellers must list products through the LEOGO Partner Portal'; end if;
  if char_length(btrim(coalesce(p_seller_name,'')))<2 then raise exception 'Enter your name'; end if;
  if char_length(btrim(coalesce(p_id_number,'')))<4 then raise exception 'Enter a valid ID number'; end if;
  if char_length(btrim(coalesce(p_phone,'')))<7 then raise exception 'Enter a valid phone number'; end if;
  if char_length(btrim(coalesce(p_location,'')))<2 then raise exception 'Enter your location'; end if;
  if char_length(btrim(coalesce(p_item_name,'')))<2 then raise exception 'Enter the item you are selling'; end if;
  if coalesce(p_marked_price_kes,0)<=0 then raise exception 'Enter a valid marked price'; end if;
  if p_item_image_path is null or p_item_image_path not like v_uid::text||'/%' then raise exception 'Upload an item picture before submitting'; end if;
  if nullif(btrim(coalesce(p_ownership_proof_path,'')),'') is not null and p_ownership_proof_path not like v_uid::text||'/%' then raise exception 'Invalid ownership proof path'; end if;

  insert into public.customer_personal_sale_listings(
    user_id,seller_name,id_number,phone,location,item_name,marked_price_kes,item_image_path,ownership_proof_path,approval_status,created_at,updated_at
  ) values(
    v_uid,btrim(p_seller_name),btrim(p_id_number),btrim(p_phone),btrim(p_location),btrim(p_item_name),p_marked_price_kes,
    p_item_image_path,nullif(btrim(coalesce(p_ownership_proof_path,'')),''),'pending',now(),now()
  ) returning id into v_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_uid,'personal_sale_submitted','Item submitted for approval','"'||btrim(p_item_name)||'" has been sent to LEOGO Admin for review.',
    'customer_personal_sale',v_id,'personal_sale_submitted_'||v_id::text,'dashboard',jsonb_build_object('listing_id',v_id,'status','pending'));

  return jsonb_build_object('ok',true,'listing_id',v_id,'approval_status','pending');
end $$;

create or replace function public.customer_public_personal_sales()
returns table(id uuid,public_name text,item_name text,marked_price_kes numeric,item_image_path text,public_title text,approved_at timestamptz,created_at timestamptz)
language sql security definer set search_path=''
as $$
  select l.id,split_part(btrim(l.seller_name),' ',1)::text,l.item_name,l.marked_price_kes,l.item_image_path,
    (split_part(btrim(l.seller_name),' ',1)||' is Selling '||l.item_name)::text,l.approved_at,l.created_at
  from public.customer_personal_sale_listings l
  where l.approval_status='approved' and l.sale_status='available'
  order by coalesce(l.approved_at,l.created_at) desc;
$$;

create or replace function public.admin_list_personal_sale_approvals()
returns table(kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,title text,subtitle text,amount_kes numeric,status text,submitted_at timestamptz,payload jsonb)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select 'customer_personal_sale'::text,l.id,l.user_id,l.seller_name,u.email::text,
    ('Personal Item: '||l.item_name)::text,('Customer one-off sale · '||l.location)::text,
    l.marked_price_kes,l.approval_status,l.created_at,to_jsonb(l)
  from public.customer_personal_sale_listings l
  left join auth.users u on u.id=l.user_id
  where l.approval_status in ('pending','under_review')
  order by l.created_at desc;
end $$;

create or replace function public.admin_review_personal_sale(p_record_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row public.customer_personal_sale_listings%rowtype; v_before jsonb; v_after jsonb; v_status text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Give a clear reason for rejection'; end if;

  select * into v_row from public.customer_personal_sale_listings where id=p_record_id for update;
  if not found then raise exception 'Personal sale listing not found'; end if;
  if v_row.approval_status not in ('pending','under_review') then raise exception 'This listing has already been reviewed'; end if;

  v_before:=to_jsonb(v_row);
  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end;

  update public.customer_personal_sale_listings
  set approval_status=v_status,admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      reviewed_by=(select auth.uid()),reviewed_at=case when p_decision in ('approve','reject') then now() else reviewed_at end,
      approved_at=case when p_decision='approve' then now() else approved_at end,updated_at=now()
  where id=p_record_id;

  select to_jsonb(l) into v_after from public.customer_personal_sale_listings l where l.id=p_record_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(
    v_row.user_id,'personal_sale_'||v_status,
    case v_status when 'approved' then 'Your item was approved' when 'rejected' then 'Your item was not approved' else 'Your item is under review' end,
    case v_status when 'approved' then '"'||v_row.item_name||'" is now visible in What Are You Selling and the LEOGO Marketplace.'
      when 'rejected' then '"'||v_row.item_name||'" was not approved. '||coalesce(p_notes,'')
      else '"'||v_row.item_name||'" is being reviewed by LEOGO Admin.' end,
    'customer_personal_sale',p_record_id,
    'personal_sale_'||v_status||'_'||p_record_id::text||'_'||extract(epoch from now())::bigint::text,'dashboard',
    jsonb_build_object('listing_id',p_record_id,'status',v_status,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit('approval.customer_personal_sale.'||p_decision,'customer_personal_sale',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));

  return jsonb_build_object('ok',true,'record_id',p_record_id,'approval_status',v_status);
end $$;

revoke execute on function public.customer_personal_sale_eligibility() from public;
revoke execute on function public.customer_submit_personal_sale(text,text,text,text,text,numeric,text,text) from public;
revoke execute on function public.customer_public_personal_sales() from public;
revoke execute on function public.admin_list_personal_sale_approvals() from public;
revoke execute on function public.admin_review_personal_sale(uuid,text,text) from public;

grant execute on function public.customer_personal_sale_eligibility() to authenticated;
grant execute on function public.customer_submit_personal_sale(text,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.customer_public_personal_sales() to anon,authenticated;
grant execute on function public.admin_list_personal_sale_approvals() to authenticated;
grant execute on function public.admin_review_personal_sale(uuid,text,text) to authenticated;

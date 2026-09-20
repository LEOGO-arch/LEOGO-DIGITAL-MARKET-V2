-- LEOGO: fix Admin delivery ambiguity + require Admin approval for Seller products before customer publication.

create or replace function public.admin_list_delivery_jobs()
returns table(
  delivery_job_id uuid,order_id uuid,order_reference text,customer_name text,customer_phone text,
  delivery_zone text,county text,sub_county text,estate text,landmark text,location_link text,
  rider_id uuid,rider_name text,rider_phone text,status text,assigned_at timestamptz,picked_up_at timestamptz,
  on_the_way_at timestamptz,delivered_at timestamptz,order_status text,payment_status text,created_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('orders.read') then raise exception 'Admin access required'; end if;
  insert into public.marketplace_delivery_jobs(order_id)
  select o.id from public.marketplace_orders o
  where o.order_status not in ('cancelled','delivered')
    and not exists(select 1 from public.marketplace_delivery_jobs d where d.order_id=o.id)
  on conflict on constraint marketplace_delivery_jobs_order_id_key do nothing;

  return query
  select d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,o.location_link,
         d.rider_id,s.display_name,s.phone,d.status,d.assigned_at,d.picked_up_at,d.on_the_way_at,d.delivered_at,
         o.order_status,o.payment_status,o.created_at
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  left join public.leogo_staff s on s.user_id=d.rider_id
  order by case d.status when 'awaiting_assignment' then 0 when 'assigned' then 1 when 'picked_up' then 2 when 'on_the_way' then 3 else 4 end,
           o.created_at desc;
end $$;

alter table public.seller_products
  add column if not exists product_approval_status text,
  add column if not exists product_submitted_at timestamptz,
  add column if not exists product_reviewed_at timestamptz,
  add column if not exists product_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists product_review_notes text;

update public.seller_products
set product_approval_status=coalesce(product_approval_status,'pending'),
    product_submitted_at=coalesce(product_submitted_at,updated_at,created_at)
where product_approval_status is null or product_submitted_at is null;

alter table public.seller_products
  alter column product_approval_status set default 'pending',
  alter column product_approval_status set not null,
  alter column product_submitted_at set default now();

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='seller_products_product_approval_status_check'
      and conrelid='public.seller_products'::regclass
  ) then
    alter table public.seller_products
      add constraint seller_products_product_approval_status_check
      check(product_approval_status in ('pending','under_review','changes_requested','approved','rejected'));
  end if;
end $$;

create or replace function private.queue_seller_product_for_admin_review()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if tg_op='INSERT' or (v_uid=new.seller_id and not private.is_leogo_admin('products.manage')) then
    new.product_approval_status:='pending';
    new.product_submitted_at:=now();
    new.product_reviewed_at:=null;
    new.product_reviewed_by:=null;
    new.product_review_notes:=null;
  end if;
  return new;
end $$;

drop trigger if exists queue_seller_product_for_admin_review on public.seller_products;
create trigger queue_seller_product_for_admin_review
before insert or update of
  product_name,price_kes,availability_status,quantity_available,measurement_unit,measurement_unit_other,
  accepts_lipa_pole_pole,lipa_pole_pole_first_deposit_kes,lipa_pole_pole_max_days,has_variants,
  product_details,main_image_path,gallery_image_paths,category_id,subcategory_id,
  custom_category_name,custom_subcategory_name,group_name,listing_status
on public.seller_products
for each row execute function private.queue_seller_product_for_admin_review();

update public.seller_products
set product_approval_status='pending',product_submitted_at=now(),
    product_reviewed_at=null,product_reviewed_by=null,product_review_notes=null
where product_approval_status<>'pending';

create or replace function public.customer_marketplace_products()
returns table(
  id uuid,seller_id uuid,seller_name text,product_name text,price_kes numeric,availability_status text,
  quantity_available numeric,measurement_unit text,accepts_lipa_pole_pole boolean,
  lipa_pole_pole_first_deposit_kes numeric,lipa_pole_pole_max_days integer,
  product_details text,main_image_path text,flash_sale_requested boolean,
  flash_sale_price_kes numeric,flash_sale_status text
)
language sql security definer set search_path=''
as $$
  select p.id,p.seller_id,s.business_name,p.product_name,p.price_kes,p.availability_status,p.quantity_available,
    p.measurement_unit,p.accepts_lipa_pole_pole,p.lipa_pole_pole_first_deposit_kes,p.lipa_pole_pole_max_days,
    p.product_details,p.main_image_path,p.flash_sale_requested,p.flash_sale_price_kes,p.flash_sale_status
  from public.seller_products p
  join public.seller_accounts s on s.user_id=p.seller_id
  join public.product_categories c on c.id=p.category_id
  where s.application_status='approved'
    and p.product_approval_status='approved'
    and p.listing_status='active'
    and p.availability_status in ('available','out_of_stock')
    and c.is_active and not c.restricted_category
  order by random();
$$;

create or replace function public.admin_review_seller_product(
  p_record_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_before jsonb; v_after jsonb; v_product public.seller_products%rowtype;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported product approval decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'A clear reason or correction note is required';
  end if;

  select * into v_product from public.seller_products where id=p_record_id for update;
  if not found then raise exception 'Seller product not found'; end if;
  if v_product.product_approval_status not in ('pending','under_review','changes_requested') then
    raise exception 'This product has already been reviewed';
  end if;
  v_before:=to_jsonb(v_product);

  update public.seller_products
  set product_approval_status=case p_decision
      when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
      product_reviewed_at=case when p_decision in ('approve','reject') then now() else null end,
      product_reviewed_by=(select auth.uid()),
      product_review_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=p_record_id;

  select to_jsonb(p) into v_after from public.seller_products p where p.id=p_record_id;

  perform private.notify_partner(
    v_product.seller_id,'seller','product_approval_'||p_decision,
    case p_decision when 'approve' then 'Product approved' when 'reject' then 'Product rejected'
      when 'changes_requested' then 'Product needs correction' else 'Product under review' end,
    case p_decision
      when 'approve' then '"'||v_product.product_name||'" has been approved and can appear on the customer marketplace when its listing is active.'
      when 'reject' then '"'||v_product.product_name||'" was rejected. '||coalesce(p_notes,'')
      when 'changes_requested' then '"'||v_product.product_name||'" needs correction before approval. '||coalesce(p_notes,'')
      else '"'||v_product.product_name||'" is now under Admin review.' end,
    'seller_product',p_record_id,'products',
    jsonb_build_object('product_id',p_record_id,'decision',p_decision,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit(
    'approval.seller_product.'||p_decision,'seller_product',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'record_id',p_record_id,'decision',p_decision);
end $$;

revoke execute on function public.admin_review_seller_product(uuid,text,text) from public,anon;
grant execute on function public.admin_review_seller_product(uuid,text,text) to authenticated;

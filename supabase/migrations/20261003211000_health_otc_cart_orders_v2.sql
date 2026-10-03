-- LEOGO DIGITAL MARKET V2
-- Health & Medicine OTC Cart / Order V2
-- Keeps Health & Medicine separate from ordinary Seller order records.
-- OTC pharmaceuticals and non-prescription Health products can be ordered.
-- Prescription-required medicines remain enquiry-only.

-- No Health products exist yet in production, so remove the unused "pharmacy_only"
-- classification and use the clearer seller choice requested for pharmaceuticals.
alter table public.health_medicine_products
  drop constraint if exists health_medicine_products_medicine_classification_check;
alter table public.health_medicine_products
  drop constraint if exists health_medicine_products_order_mode_check;

-- Existing rows, if any, are normalized before the tighter V2 constraints are added.
update public.health_medicine_products
set
  medicine_classification=case
    when product_kind='pharmaceutical' and requires_prescription then 'prescription_required'
    when product_kind='pharmaceutical' then 'otc'
    else 'non_medicine'
  end,
  requires_prescription=case
    when product_kind='pharmaceutical' and requires_prescription then true
    else false
  end,
  order_mode=case
    when product_kind='pharmaceutical' and requires_prescription then 'enquiry_only'
    else 'cart'
  end;

alter table public.health_medicine_products
  add constraint health_medicine_products_medicine_classification_check
  check (medicine_classification in ('non_medicine','otc','prescription_required'));
alter table public.health_medicine_products
  add constraint health_medicine_products_order_mode_check
  check (order_mode in ('cart','enquiry_only'));

create table if not exists public.health_medicine_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  provider_id uuid not null references public.health_medicine_accounts(user_id) on delete restrict,
  receiver_name text not null,
  contact_number text not null,
  delivery_zone text not null check (delivery_zone in ('pickup','cbd','estate','outside')),
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  pickup_station_id uuid references public.pickup_stations(id) on delete set null,
  items_subtotal_kes numeric(12,2) not null check (items_subtotal_kes>=0),
  service_fee_kes numeric(12,2) not null default 0 check (service_fee_kes>=0),
  pickup_fee_kes numeric(12,2) not null default 0 check (pickup_fee_kes>=0),
  delivery_fee_kes numeric(12,2) not null default 0 check (delivery_fee_kes>=0),
  grand_total_kes numeric(12,2) not null check (grand_total_kes>=0),
  payment_method text not null check (payment_method in ('till','paybill','cod')),
  payment_status text not null default 'submitted'
    check (payment_status in ('submitted','verified_paid','cod_due','cod_paid','rejected')),
  payment_message text,
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id) on delete set null,
  order_status text not null default 'placed'
    check (order_status in ('placed','accepted','preparing','ready_for_handover','handed_to_leogo','delivered','cancelled')),
  provider_received_at timestamptz,
  preparing_at timestamptz,
  ready_for_handover_at timestamptz,
  handed_to_leogo_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_medicine_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.health_medicine_orders(id) on delete cascade,
  provider_id uuid not null references public.health_medicine_accounts(user_id) on delete restrict,
  product_id uuid not null references public.health_medicine_products(id) on delete restrict,
  product_name text not null,
  product_kind text not null,
  medicine_classification text not null,
  requires_prescription boolean not null default false,
  unit_price_kes numeric(12,2) not null check (unit_price_kes>=0),
  quantity numeric(12,2) not null check (quantity>0),
  line_total_kes numeric(12,2) not null check (line_total_kes>=0),
  created_at timestamptz not null default now()
);

create index if not exists health_medicine_orders_customer_idx
  on public.health_medicine_orders(customer_id,created_at desc);
create index if not exists health_medicine_orders_provider_idx
  on public.health_medicine_orders(provider_id,created_at desc);
create index if not exists health_medicine_orders_payment_idx
  on public.health_medicine_orders(payment_status,created_at desc);
create index if not exists health_medicine_order_items_order_idx
  on public.health_medicine_order_items(order_id);

alter table public.health_medicine_orders enable row level security;
alter table public.health_medicine_order_items enable row level security;

-- Direct table access is intentionally narrow. Normal use goes through RPCs.
drop policy if exists health_orders_customer_read on public.health_medicine_orders;
create policy health_orders_customer_read
on public.health_medicine_orders for select to authenticated
using (customer_id=(select auth.uid()));

drop policy if exists health_orders_provider_read on public.health_medicine_orders;
create policy health_orders_provider_read
on public.health_medicine_orders for select to authenticated
using (provider_id=(select auth.uid()));

drop policy if exists health_orders_admin_read on public.health_medicine_orders;
create policy health_orders_admin_read
on public.health_medicine_orders for select to authenticated
using (private.is_leogo_admin('orders.read') or private.is_leogo_admin('approvals.read'));

drop policy if exists health_order_items_customer_read on public.health_medicine_order_items;
create policy health_order_items_customer_read
on public.health_medicine_order_items for select to authenticated
using (exists(
  select 1 from public.health_medicine_orders o
  where o.id=order_id and o.customer_id=(select auth.uid())
));

drop policy if exists health_order_items_provider_read on public.health_medicine_order_items;
create policy health_order_items_provider_read
on public.health_medicine_order_items for select to authenticated
using (provider_id=(select auth.uid()));

drop policy if exists health_order_items_admin_read on public.health_medicine_order_items;
create policy health_order_items_admin_read
on public.health_medicine_order_items for select to authenticated
using (private.is_leogo_admin('orders.read') or private.is_leogo_admin('approvals.read'));

grant select on public.health_medicine_orders,public.health_medicine_order_items to authenticated;

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
  v_order_mode text:='cart';
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
    if v_business_type<>'pharmacy' then raise exception 'Only an approved Pharmacy partner can list medicines'; end if;
    if p_medicine_classification not in ('otc','prescription_required') then
      raise exception 'Choose whether this medicine is OTC or Prescription Required';
    end if;
    v_requires_prescription:=p_medicine_classification='prescription_required';
    v_order_mode:=case when v_requires_prescription then 'enquiry_only' else 'cart' end;
  else
    p_medicine_classification:='non_medicine';
    v_requires_prescription:=false;
    v_order_mode:='cart';
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
      v_order_mode,'pending',null,now(),null,null,now()
    ) returning id into v_id;
  else
    update public.health_medicine_products set
      product_name=btrim(p_product_name),product_kind=p_product_kind,
      medicine_classification=p_medicine_classification,requires_prescription=v_requires_prescription,
      brand=nullif(btrim(coalesce(p_brand,'')),''),description=nullif(btrim(coalesce(p_description,'')),''),
      price_kes=p_price_kes,quantity_available=p_quantity_available,measurement_unit=btrim(p_measurement_unit),
      image_path=btrim(p_image_path),availability_status=p_availability_status,
      order_mode=v_order_mode,approval_status='pending',admin_notes=null,submitted_at=now(),
      approved_at=null,approved_by=null,updated_at=now()
    where id=p_product_id and provider_id=v_uid
      and approval_status in ('pending','changes_requested','approved','rejected')
    returning id into v_id;

    if v_id is null then raise exception 'Health & Medicine product not found or locked for review'; end if;
  end if;

  select to_jsonb(p) into v_row from public.health_medicine_products p where p.id=v_id;
  return v_row;
end;
$$;

revoke all on function public.health_medicine_save_product(uuid,text,text,text,text,text,numeric,numeric,text,text,text) from public,anon;
grant execute on function public.health_medicine_save_product(uuid,text,text,text,text,text,numeric,numeric,text,text,text) to authenticated;

create or replace function public.customer_create_health_medicine_order(
  p_items jsonb,
  p_receiver_name text,
  p_contact_number text,
  p_delivery_zone text,
  p_county text default null,
  p_sub_county text default null,
  p_estate text default null,
  p_landmark text default null,
  p_location_link text default null,
  p_pickup_station_id uuid default null,
  p_payment_method text default null,
  p_payment_message text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_order_id uuid;
  v_ref text;
  v_item jsonb;
  v_product public.health_medicine_products%rowtype;
  v_provider uuid:=null;
  v_qty numeric;
  v_subtotal numeric:=0;
  v_service numeric:=0;
  v_pickup numeric:=0;
  v_delivery numeric:=0;
  v_total numeric:=0;
  v_payment_status text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Health cart is empty'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose a supported delivery zone'; end if;
  if p_payment_method not in ('till','paybill','cod') then raise exception 'Choose Till, Paybill or Cash on Delivery'; end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2 or char_length(btrim(coalesce(p_contact_number,'')))<7 then
    raise exception 'Receiver name and contact are required';
  end if;
  if p_delivery_zone='pickup' and p_pickup_station_id is null then raise exception 'Choose a pickup station'; end if;
  if p_payment_method<>'cod' and char_length(btrim(coalesce(p_payment_message,'')))<3 then
    raise exception 'Add the M-Pesa payment confirmation message';
  end if;
  if p_payment_method='cod' and char_length(btrim(coalesce(p_payment_message,'')))<3 then
    raise exception 'Add the Transport & Parcel Delivery payment confirmation for Cash on Delivery';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 then raise exception 'Invalid Health item quantity'; end if;

    select p.* into v_product
    from public.health_medicine_products p
    join public.health_medicine_accounts h on h.user_id=p.provider_id
    where p.id=(v_item->>'product_id')::uuid
      and p.approval_status='approved'
      and p.availability_status='available'
      and p.order_mode='cart'
      and p.requires_prescription=false
      and h.application_status='approved'
      and h.availability_status<>'closed'
    for update of p;

    if not found then
      raise exception 'A Health & Medicine item in your cart is no longer approved, available, or eligible for normal ordering';
    end if;

    if v_product.product_kind='pharmaceutical' and v_product.medicine_classification<>'otc' then
      raise exception '% is not an OTC medicine and cannot use normal cart checkout',v_product.product_name;
    end if;

    if v_provider is null then
      v_provider:=v_product.provider_id;
    elsif v_provider<>v_product.provider_id then
      raise exception 'Health & Medicine checkout currently supports products from one Health Partner at a time';
    end if;

    if v_product.quantity_available<v_qty then
      raise exception '% does not have enough stock',v_product.product_name;
    end if;

    v_subtotal:=v_subtotal+(v_product.price_kes*v_qty);
  end loop;

  v_service:=round(v_subtotal * case
    when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000)
      then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100
    else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100
  end,2);

  if p_delivery_zone in ('cbd','estate','outside') then
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone);
  else
    select
      round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),
      coalesce(shipping_fee_kes,0)
    into v_pickup,v_delivery
    from public.pickup_stations
    where id=p_pickup_station_id and is_active=true;
    if not found then raise exception 'Pickup station is not available'; end if;
  end if;

  v_total:=v_subtotal+v_service+v_pickup+v_delivery;

  if p_payment_method='cod'
     and v_subtotal>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then
    raise exception 'Cash on Delivery is available only below KSh %',
      coalesce((select cod_limit_kes from public.order_settings where id=1),10000);
  end if;

  v_ref:='HLTH-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

  insert into public.health_medicine_orders(
    order_reference,customer_id,provider_id,receiver_name,contact_number,
    delivery_zone,county,sub_county,estate,landmark,location_link,pickup_station_id,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,grand_total_kes,
    payment_method,payment_status,payment_message
  ) values (
    v_ref,v_uid,v_provider,btrim(p_receiver_name),btrim(p_contact_number),
    p_delivery_zone,nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    p_pickup_station_id,v_subtotal,v_service,v_pickup,v_delivery,v_total,
    p_payment_method,v_payment_status,nullif(btrim(coalesce(p_payment_message,'')),'')
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::numeric;

    select * into v_product
    from public.health_medicine_products
    where id=(v_item->>'product_id')::uuid
    for update;

    insert into public.health_medicine_order_items(
      order_id,provider_id,product_id,product_name,product_kind,medicine_classification,
      requires_prescription,unit_price_kes,quantity,line_total_kes
    ) values (
      v_order_id,v_product.provider_id,v_product.id,v_product.product_name,v_product.product_kind,
      v_product.medicine_classification,v_product.requires_prescription,v_product.price_kes,v_qty,
      v_product.price_kes*v_qty
    );

    update public.health_medicine_products
    set
      quantity_available=greatest(quantity_available-v_qty,0),
      availability_status=case when quantity_available-v_qty<=0 then 'out_of_stock' else availability_status end,
      updated_at=now()
    where id=v_product.id;
  end loop;

  perform private.notify_partner(
    v_provider,'health_medicine','new_health_order','New Health & Medicine order',
    'A customer placed Health & Medicine order '||v_ref||'. Open Orders to review and prepare it.',
    'health_medicine_order',v_order_id,'health-orders',
    jsonb_build_object('order_reference',v_ref,'grand_total_kes',v_total,'payment_status',v_payment_status)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_uid,'order','Health & Medicine order placed',
    'Your Health & Medicine order '||v_ref||' was created successfully.',
    'health_medicine_order',v_order_id,'health_order_placed_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref,'provider_id',v_provider)
  );

  return jsonb_build_object(
    'order_id',v_order_id,
    'order_reference',v_ref,
    'items_subtotal_kes',v_subtotal,
    'service_fee_kes',v_service,
    'pickup_fee_kes',v_pickup,
    'delivery_fee_kes',v_delivery,
    'grand_total_kes',v_total,
    'external_amount_due_kes',v_total,
    'reward_points_redeemed_kes',0,
    'payment_status',v_payment_status,
    'order_source','health_medicine'
  );
end;
$$;

revoke all on function public.customer_create_health_medicine_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text) from public,anon;
grant execute on function public.customer_create_health_medicine_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text) to authenticated;

create or replace function public.health_medicine_list_own_orders()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.health_medicine_accounts h where h.user_id=v_uid) then
    raise exception 'Health & Medicine Partner account required';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(o)||jsonb_build_object(
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.created_at)
        from public.health_medicine_order_items i where i.order_id=o.id
      ),'[]'::jsonb)
    ) order by o.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.health_medicine_orders o
  where o.provider_id=v_uid;

  return v_rows;
end;
$$;

revoke all on function public.health_medicine_list_own_orders() from public,anon;
grant execute on function public.health_medicine_list_own_orders() to authenticated;

create or replace function public.health_medicine_update_order_status(p_order_id uuid,p_status text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_order public.health_medicine_orders%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_status not in ('accepted','preparing','ready_for_handover','handed_to_leogo','cancelled') then
    raise exception 'Unsupported Health order status';
  end if;

  select * into v_order
  from public.health_medicine_orders
  where id=p_order_id and provider_id=v_uid
  for update;
  if not found then raise exception 'Health order not found'; end if;

  if v_order.payment_status not in ('verified_paid','cod_due','cod_paid') and p_status<>'cancelled' then
    raise exception 'Wait for LEOGO payment verification before preparing this Health order';
  end if;
  if v_order.order_status in ('delivered','cancelled') then raise exception 'This Health order is already closed'; end if;

  if p_status='accepted' and v_order.order_status<>'placed' then raise exception 'Only a placed order can be accepted'; end if;
  if p_status='preparing' and v_order.order_status not in ('accepted','preparing') then raise exception 'Accept the order before preparing it'; end if;
  if p_status='ready_for_handover' and v_order.order_status not in ('accepted','preparing','ready_for_handover') then raise exception 'Prepare the order before marking it ready'; end if;
  if p_status='handed_to_leogo' and v_order.order_status<>'ready_for_handover' then raise exception 'Mark the order ready before handing it to LEOGO'; end if;

  update public.health_medicine_orders set
    order_status=p_status,
    provider_received_at=case when p_status='accepted' then coalesce(provider_received_at,now()) else provider_received_at end,
    preparing_at=case when p_status='preparing' then coalesce(preparing_at,now()) else preparing_at end,
    ready_for_handover_at=case when p_status='ready_for_handover' then coalesce(ready_for_handover_at,now()) else ready_for_handover_at end,
    handed_to_leogo_at=case when p_status='handed_to_leogo' then coalesce(handed_to_leogo_at,now()) else handed_to_leogo_at end,
    cancelled_at=case when p_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
    updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,'order','Health order update',
    'Health & Medicine order '||v_order.order_reference||' is now '||replace(p_status,'_',' ')||'.',
    'health_medicine_order',v_order.id,'health_order_status_'||p_status||'_'||v_order.id::text,'orders',
    jsonb_build_object('order_reference',v_order.order_reference,'order_status',p_status)
  );

  return jsonb_build_object('ok',true,'order_status',p_status);
end;
$$;

revoke all on function public.health_medicine_update_order_status(uuid,text) from public,anon;
grant execute on function public.health_medicine_update_order_status(uuid,text) to authenticated;

create or replace function public.customer_list_health_medicine_orders()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select coalesce(jsonb_agg(
    to_jsonb(o)||jsonb_build_object(
      'provider_name',h.business_name,
      'provider_type',h.business_type,
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.created_at)
        from public.health_medicine_order_items i where i.order_id=o.id
      ),'[]'::jsonb)
    ) order by o.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.health_medicine_orders o
  join public.health_medicine_accounts h on h.user_id=o.provider_id
  where o.customer_id=v_uid;

  return v_rows;
end;
$$;

revoke all on function public.customer_list_health_medicine_orders() from public,anon;
grant execute on function public.customer_list_health_medicine_orders() to authenticated;

create or replace function public.admin_list_health_medicine_orders()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_rows jsonb;
begin
  if not (private.is_leogo_admin('orders.read') or private.is_leogo_admin('approvals.read')) then
    raise exception 'Admin access required';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(o)||jsonb_build_object(
      'provider_name',h.business_name,
      'provider_type',h.business_type,
      'customer_email',u.email,
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.created_at)
        from public.health_medicine_order_items i where i.order_id=o.id
      ),'[]'::jsonb)
    ) order by o.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.health_medicine_orders o
  join public.health_medicine_accounts h on h.user_id=o.provider_id
  left join auth.users u on u.id=o.customer_id;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_health_medicine_orders() from public,anon;
grant execute on function public.admin_list_health_medicine_orders() to authenticated;

create or replace function public.admin_review_health_medicine_order_payment(
  p_order_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.health_medicine_orders%rowtype;
  v_status text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;

  select * into v_order from public.health_medicine_orders where id=p_order_id for update;
  if not found then raise exception 'Health order not found'; end if;
  if v_order.payment_status<>'submitted' then raise exception 'This Health order payment is no longer awaiting verification'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a clear rejection reason';
  end if;

  v_status:=case when p_decision='verify' then 'verified_paid' else 'rejected' end;
  update public.health_medicine_orders set
    payment_status=v_status,
    payment_verified_at=case when p_decision='verify' then now() else null end,
    payment_verified_by=case when p_decision='verify' then auth.uid() else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_order_id;

  perform private.notify_partner(
    v_order.provider_id,'health_medicine','health_order_payment_'||v_status,
    case when p_decision='verify' then 'Health order payment verified' else 'Health order payment rejected' end,
    'Payment for Health & Medicine order '||v_order.order_reference||
      case when p_decision='verify' then ' is verified. You can accept and prepare the order.'
      else ' was not verified. Wait for LEOGO guidance before preparing the order.' end,
    'health_medicine_order',v_order.id,'health-orders',
    jsonb_build_object('order_reference',v_order.order_reference,'payment_status',v_status)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,'payment',
    case when p_decision='verify' then 'Health order payment verified' else 'Health order payment needs attention' end,
    'Payment for Health & Medicine order '||v_order.order_reference||
      case when p_decision='verify' then ' has been verified.'
      else ' could not be verified. Contact LEOGO Customer Care.' end,
    'health_medicine_order',v_order.id,'health_order_payment_'||v_status||'_'||v_order.id::text,'orders',
    jsonb_build_object('order_reference',v_order.order_reference,'payment_status',v_status)
  );

  perform private.write_admin_audit(
    'health_medicine.order_payment.'||p_decision,'health_medicine_order',p_order_id::text,
    to_jsonb(v_order),
    (select to_jsonb(o) from public.health_medicine_orders o where o.id=p_order_id),
    jsonb_build_object('notes',p_notes)
  );

  return jsonb_build_object('ok',true,'payment_status',v_status);
end;
$$;

revoke all on function public.admin_review_health_medicine_order_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_medicine_order_payment(uuid,text,text) to authenticated;

-- Public Health product outputs now tell the customer whether normal cart ordering is allowed.
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
        'cart_eligible',(p.order_mode='cart' and p.requires_prescription=false),
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


-- Keep the Admin Dashboard "Action Required" payment queue complete.
create or replace function public.admin_list_pending_payment_actions()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rows jsonb;
begin
  if not private.is_leogo_admin('approvals.read')
     and not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Admin access required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind',q.kind,
        'record_id',q.record_id,
        'title',q.title,
        'detail',q.detail,
        'customer_name',q.customer_name,
        'amount_kes',q.amount_kes,
        'payment_reference',q.payment_reference,
        'submitted_at',q.submitted_at,
        'view',q.view_name,
        'tab',q.tab_name
      )
      order by q.submitted_at desc,q.kind,q.record_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      'marketplace_payment'::text as kind,
      o.id as record_id,
      'Marketplace order payment'::text as title,
      o.order_reference||' · '||coalesce(o.payment_method,'Payment') as detail,
      coalesce(nullif(o.receiver_name,''),cp.full_name,'Customer') as customer_name,
      o.grand_total_kes::numeric as amount_kes,
      null::text as payment_reference,
      o.created_at as submitted_at,
      'orders'::text as view_name,
      ''::text as tab_name
    from public.marketplace_orders o
    left join public.customer_profiles cp on cp.user_id=o.customer_id
    where o.payment_status='submitted'

    union all

    select
      'health_medicine_payment',
      o.id,
      'Health & Medicine order payment',
      o.order_reference||' · '||h.business_name||' · '||coalesce(o.payment_method,'Payment'),
      coalesce(nullif(o.receiver_name,''),cp.full_name,'Health Customer'),
      o.grand_total_kes::numeric,
      null::text,
      o.created_at,
      'health',
      'orders'
    from public.health_medicine_orders o
    join public.health_medicine_accounts h on h.user_id=o.provider_id
    left join public.customer_profiles cp on cp.user_id=o.customer_id
    where o.payment_status='submitted'

    union all

    select
      'wallet_deposit',
      d.id,
      case when d.deposit_kind='daily_challenge' then 'Savings challenge payment' else 'Wallet deposit payment' end,
      'Ref '||d.payment_reference,
      coalesce(cp.full_name,'Wallet Customer'),
      d.requested_amount_kes::numeric,
      d.payment_reference,
      d.submitted_at,
      'wallet',
      'deposits'
    from public.wallet_deposit_requests d
    left join public.customer_profiles cp on cp.user_id=d.user_id
    where d.request_status='pending'

    union all

    select
      'premium_payment',
      p.id,
      'Premium membership payment',
      p.plan_name||' · Ref '||p.payment_reference,
      coalesce(cp.full_name,'Premium Customer'),
      p.amount_kes::numeric,
      p.payment_reference,
      p.submitted_at,
      'premium',
      'subscriptions'
    from public.premium_membership_payments p
    left join public.customer_profiles cp on cp.user_id=p.user_id
    where p.payment_status='pending'

    union all

    select
      'service_payment',
      r.id,
      case when r.request_type='direct' then 'Direct service request fee' else 'Service quotation fee' end,
      r.request_reference||' · '||s.service_name||' · Ref '||r.payment_reference,
      coalesce(cp.full_name,'Service Customer'),
      case when r.request_type='direct' then r.direct_request_fee_kes else r.quotation_fee_kes end,
      r.payment_reference,
      r.created_at,
      'providers',
      ''
    from public.service_requests r
    join public.service_provider_services s on s.id=r.service_id
    left join public.customer_profiles cp on cp.user_id=r.customer_id
    where r.payment_status='pending_verification'
  ) q;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_pending_payment_actions() from public,anon;
grant execute on function public.admin_list_pending_payment_actions() to authenticated;

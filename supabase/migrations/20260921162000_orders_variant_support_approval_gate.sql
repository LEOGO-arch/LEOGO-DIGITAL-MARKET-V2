-- Orders V1: approved-product gate + exact variant ordering and stock reservation.

alter table public.marketplace_order_items
  add column if not exists variant_id uuid references public.seller_product_variants(id) on delete set null,
  add column if not exists variant_name text,
  add column if not exists variant_image_path text;

create or replace function public.customer_create_marketplace_order(
  p_items jsonb,p_receiver_name text,p_contact_number text,p_delivery_zone text,
  p_county text default null,p_sub_county text default null,p_estate text default null,p_landmark text default null,
  p_location_link text default null,p_pickup_station_id uuid default null,p_payment_method text default null,p_payment_message text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid()); v_order_id uuid; v_ref text;
  v_subtotal numeric:=0; v_service numeric:=0; v_pickup numeric:=0; v_delivery numeric:=0; v_total numeric:=0;
  v_item jsonb; v_product public.seller_products%rowtype; v_variant public.seller_product_variants%rowtype;
  v_variant_id uuid; v_qty numeric; v_unit_price numeric; v_payment_status text; v_seller_approved boolean;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose a supported delivery zone'; end if;
  if p_payment_method not in ('till','paybill','cod') then raise exception 'Choose a supported payment method'; end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2 or char_length(btrim(coalesce(p_contact_number,'')))<7 then raise exception 'Receiver name and contact are required'; end if;
  if p_delivery_zone='pickup' and p_pickup_station_id is null then raise exception 'Choose a pickup station'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 then raise exception 'Invalid item quantity'; end if;

    select p.* into v_product from public.seller_products p
    where p.id=(v_item->>'product_id')::uuid
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status='available'
    for update;
    if not found then raise exception 'A product in your cart is no longer approved or available'; end if;

    select exists(select 1 from public.seller_accounts s where s.user_id=v_product.seller_id and s.application_status='approved')
      into v_seller_approved;
    if not v_seller_approved then raise exception 'A Seller in your cart is not currently approved'; end if;

    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      if v_variant_id is null then raise exception 'Choose a variant for %',v_product.product_name; end if;
      select * into v_variant from public.seller_product_variants
      where id=v_variant_id and product_id=v_product.id and is_active=true
      for update;
      if not found then raise exception 'The selected variant for % is no longer available',v_product.product_name; end if;
      if v_variant.quantity_available<v_qty then raise exception '% — % does not have enough stock',v_product.product_name,v_variant.variant_name; end if;
      v_unit_price:=v_variant.price_kes;
    else
      if v_product.quantity_available<v_qty then raise exception '% does not have enough stock',v_product.product_name; end if;
      v_unit_price:=v_product.price_kes;
      v_variant_id:=null;
    end if;
    v_subtotal:=v_subtotal+(v_unit_price*v_qty);
  end loop;

  v_service:=round(v_subtotal*case when v_subtotal>=3000 then 0.015 else 0.02 end,2);
  if p_delivery_zone='cbd' then v_delivery:=50;
  elsif p_delivery_zone='estate' then v_delivery:=80;
  elsif p_delivery_zone='outside' then v_delivery:=200;
  else
    select round(v_subtotal*(coalesce(service_fee_percent,0)/100),2) into v_pickup
    from public.pickup_stations where id=p_pickup_station_id and is_active=true;
    if not found then raise exception 'Pickup station is not available'; end if;
  end if;

  v_total:=v_subtotal+v_service+v_pickup+v_delivery;
  v_ref:='LEOGO-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

  insert into public.marketplace_orders(
    order_reference,customer_id,receiver_name,contact_number,delivery_zone,county,sub_county,estate,landmark,location_link,pickup_station_id,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,grand_total_kes,payment_method,payment_status,payment_message
  ) values(
    v_ref,v_uid,btrim(p_receiver_name),btrim(p_contact_number),p_delivery_zone,
    nullif(btrim(coalesce(p_county,'')),''),nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),p_pickup_station_id,
    v_subtotal,v_service,v_pickup,v_delivery,v_total,p_payment_method,v_payment_status,nullif(btrim(coalesce(p_payment_message,'')),'')
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::numeric;
    select * into v_product from public.seller_products where id=(v_item->>'product_id')::uuid for update;
    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      select * into v_variant from public.seller_product_variants where id=v_variant_id and product_id=v_product.id for update;
      insert into public.marketplace_order_items(
        order_id,seller_id,product_id,variant_id,product_name,variant_name,variant_image_path,unit_price_kes,quantity,line_total_kes
      ) values(
        v_order_id,v_product.seller_id,v_product.id,v_variant.id,v_product.product_name,v_variant.variant_name,v_variant.image_path,
        v_variant.price_kes,v_qty,v_variant.price_kes*v_qty
      );
      update public.seller_product_variants set quantity_available=greatest(quantity_available-v_qty,0) where id=v_variant.id;
      update public.seller_products p
      set quantity_available=coalesce((select sum(v.quantity_available) from public.seller_product_variants v where v.product_id=p.id and v.is_active),0),
          availability_status=case when coalesce((select sum(v.quantity_available) from public.seller_product_variants v where v.product_id=p.id and v.is_active),0)<=0 then 'out_of_stock' else 'available' end,
          updated_at=now()
      where p.id=v_product.id;
    else
      insert into public.marketplace_order_items(order_id,seller_id,product_id,product_name,unit_price_kes,quantity,line_total_kes)
      values(v_order_id,v_product.seller_id,v_product.id,v_product.product_name,v_product.price_kes,v_qty,v_product.price_kes*v_qty);
      update public.seller_products
      set quantity_available=greatest(quantity_available-v_qty,0),
          availability_status=case when quantity_available-v_qty<=0 then 'out_of_stock' else availability_status end,
          updated_at=now()
      where id=v_product.id;
    end if;
  end loop;

  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes)
  select v_order_id,seller_id,sum(line_total_kes) from public.marketplace_order_items where order_id=v_order_id group by seller_id;

  perform private.notify_partner(
    so.seller_id,'seller','new_order','New customer order',
    'A customer placed order '||v_ref||'. Open Orders to receive and prepare it.',
    'marketplace_order',v_order_id,'orders',jsonb_build_object('order_reference',v_ref,'seller_subtotal_kes',so.seller_subtotal_kes)
  ) from public.marketplace_seller_orders so where so.order_id=v_order_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_uid,'order','Order placed','Your order '||v_ref||' was created successfully.',
    'marketplace_order',v_order_id,'order_placed_'||v_order_id::text,'orders',jsonb_build_object('order_reference',v_ref));

  return jsonb_build_object(
    'order_id',v_order_id,'order_reference',v_ref,'items_subtotal_kes',v_subtotal,'service_fee_kes',v_service,
    'pickup_fee_kes',v_pickup,'delivery_fee_kes',v_delivery,'grand_total_kes',v_total,'payment_status',v_payment_status
  );
end $$;

create or replace function public.customer_list_marketplace_orders()
returns table(
  id uuid,order_reference text,created_at timestamptz,receiver_name text,delivery_zone text,
  county text,sub_county text,estate text,landmark text,items_subtotal_kes numeric,service_fee_kes numeric,
  pickup_fee_kes numeric,delivery_fee_kes numeric,grand_total_kes numeric,payment_method text,payment_status text,
  order_status text,delivered_at timestamptz,items jsonb,seller_fulfilments jsonb,delivery_status text,rider_name text,rider_phone text
)
language plpgsql security definer set search_path=''
as $$
begin
  return query
  select o.id,o.order_reference,o.created_at,o.receiver_name,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,
    o.items_subtotal_kes,o.service_fee_kes,o.pickup_fee_kes,o.delivery_fee_kes,o.grand_total_kes,
    o.payment_method,o.payment_status,o.order_status,o.delivered_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'product_name',i.product_name,'variant_name',i.variant_name,'variant_id',i.variant_id,'variant_image_path',i.variant_image_path,
      'quantity',i.quantity,'unit_price_kes',i.unit_price_kes,'line_total_kes',i.line_total_kes,'seller_id',i.seller_id
    ) order by i.created_at) from public.marketplace_order_items i where i.order_id=o.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'seller_id',so.seller_id,'seller_name',s.business_name,'fulfilment_status',so.fulfilment_status,'seller_subtotal_kes',so.seller_subtotal_kes
    ) order by s.business_name) from public.marketplace_seller_orders so join public.seller_accounts s on s.user_id=so.seller_id where so.order_id=o.id),'[]'::jsonb),
    d.status,rs.display_name,rs.phone
  from public.marketplace_orders o
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  left join public.leogo_staff rs on rs.user_id=d.rider_id
  where o.customer_id=(select auth.uid())
  order by o.created_at desc;
end $$;

create or replace function public.seller_list_marketplace_orders()
returns table(
  seller_order_id uuid,order_id uuid,order_reference text,created_at timestamptz,receiver_name text,contact_number text,
  delivery_zone text,county text,sub_county text,estate text,landmark text,location_link text,seller_subtotal_kes numeric,
  fulfilment_status text,payment_status text,order_status text,items jsonb,delivery_status text,rider_name text,rider_phone text
)
language plpgsql security definer set search_path=''
as $$
begin
  return query
  select so.id,o.id,o.order_reference,o.created_at,o.receiver_name,o.contact_number,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    so.seller_subtotal_kes,so.fulfilment_status,o.payment_status,o.order_status,
    coalesce((select jsonb_agg(jsonb_build_object(
      'product_name',i.product_name,'variant_name',i.variant_name,'variant_id',i.variant_id,'variant_image_path',i.variant_image_path,
      'quantity',i.quantity,'unit_price_kes',i.unit_price_kes,'line_total_kes',i.line_total_kes
    ) order by i.created_at) from public.marketplace_order_items i where i.order_id=o.id and i.seller_id=so.seller_id),'[]'::jsonb),
    d.status,rs.display_name,rs.phone
  from public.marketplace_seller_orders so
  join public.marketplace_orders o on o.id=so.order_id
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  left join public.leogo_staff rs on rs.user_id=d.rider_id
  where so.seller_id=(select auth.uid())
  order by o.created_at desc;
end $$;

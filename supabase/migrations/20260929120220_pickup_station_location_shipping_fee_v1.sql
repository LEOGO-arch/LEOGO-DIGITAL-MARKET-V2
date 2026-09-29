-- Admin-managed shipping fee per approved Pickup Station.
alter table public.pickup_stations
  add column if not exists shipping_fee_kes numeric(12,2) not null default 50
  check (shipping_fee_kes>=0);

CREATE OR REPLACE FUNCTION public.admin_save_pickup_station(p_station_id uuid, p_station jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_fee numeric;
  v_shipping numeric;
  v_lat numeric;
  v_lng numeric;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery settings permission required'; end if;

  v_fee := coalesce((p_station->>'service_fee_percent')::numeric,0);
  if v_fee < 0 or v_fee > 100 then raise exception 'Pickup fee must be between 0 and 100 percent'; end if;
  begin
    v_shipping := coalesce(nullif(p_station->>'shipping_fee_kes','')::numeric,50);
  exception when others then
    raise exception 'Pickup Station shipping fee is invalid';
  end;
  if v_shipping < 0 then raise exception 'Pickup Station shipping fee must be zero or above'; end if;
  if char_length(btrim(coalesce(p_station->>'station_name',''))) < 2 then raise exception 'Station name is required'; end if;

  begin v_lat := nullif(p_station->>'latitude','')::numeric; exception when others then raise exception 'Pickup station latitude is invalid'; end;
  begin v_lng := nullif(p_station->>'longitude','')::numeric; exception when others then raise exception 'Pickup station longitude is invalid'; end;

  if v_lat is null or v_lng is null then raise exception 'Pin the Pickup Station location before saving'; end if;
  if v_lat < -90 or v_lat > 90 then raise exception 'Pickup station latitude is invalid'; end if;
  if v_lng < -180 or v_lng > 180 then raise exception 'Pickup station longitude is invalid'; end if;

  if p_station_id is null then
    insert into public.pickup_stations(
      station_name,county,sub_county,town,address_line,landmark,door_number,contact_phone,operating_hours,
      service_fee_percent,shipping_fee_kes,is_active,display_order,latitude,longitude,map_link,updated_by
    ) values(
      btrim(p_station->>'station_name'),
      btrim(p_station->>'county'),
      btrim(p_station->>'sub_county'),
      btrim(p_station->>'town'),
      btrim(p_station->>'address_line'),
      nullif(btrim(p_station->>'landmark'),''),
      nullif(btrim(p_station->>'door_number'),''),
      nullif(btrim(p_station->>'contact_phone'),''),
      nullif(btrim(p_station->>'operating_hours'),''),
      v_fee,
      round(v_shipping,2),
      coalesce((p_station->>'is_active')::boolean,true),
      coalesce((p_station->>'display_order')::smallint,0),
      v_lat,v_lng,nullif(btrim(coalesce(p_station->>'map_link','')),''),
      (select auth.uid())
    ) returning id into v_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.created','pickup_station',v_id::text,null,v_after);
  else
    select to_jsonb(t) into v_before from public.pickup_stations t where id=p_station_id for update;
    if v_before is null then raise exception 'Pickup station not found'; end if;

    update public.pickup_stations set
      station_name=btrim(p_station->>'station_name'),
      county=btrim(p_station->>'county'),
      sub_county=btrim(p_station->>'sub_county'),
      town=btrim(p_station->>'town'),
      address_line=btrim(p_station->>'address_line'),
      landmark=nullif(btrim(p_station->>'landmark'),''),
      door_number=nullif(btrim(p_station->>'door_number'),''),
      contact_phone=nullif(btrim(p_station->>'contact_phone'),''),
      operating_hours=nullif(btrim(p_station->>'operating_hours'),''),
      service_fee_percent=v_fee,
      shipping_fee_kes=round(v_shipping,2),
      is_active=coalesce((p_station->>'is_active')::boolean,true),
      display_order=coalesce((p_station->>'display_order')::smallint,0),
      latitude=v_lat,
      longitude=v_lng,
      map_link=nullif(btrim(coalesce(p_station->>'map_link','')),''),
      updated_by=(select auth.uid()),
      updated_at=now()
    where id=p_station_id;

    v_id:=p_station_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.updated','pickup_station',v_id::text,v_before,v_after);
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_create_marketplace_order(p_items jsonb, p_receiver_name text, p_contact_number text, p_delivery_zone text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text, p_location_link text DEFAULT NULL::text, p_pickup_station_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_payment_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_order_id uuid;
  v_ref text;
  v_subtotal numeric:=0;
  v_service numeric:=0;
  v_pickup numeric:=0;
  v_delivery numeric:=0;
  v_total numeric:=0;
  v_item jsonb;
  v_product public.seller_products%rowtype;
  v_variant public.seller_product_variants%rowtype;
  v_variant_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_payment_status text;
  v_seller_approved boolean;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose a supported delivery zone'; end if;
  if p_payment_method not in ('till','paybill','cod') then raise exception 'Choose a supported payment method'; end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2 or char_length(btrim(coalesce(p_contact_number,'')))<7 then
    raise exception 'Receiver name and contact are required';
  end if;
  if p_delivery_zone='pickup' and p_pickup_station_id is null then raise exception 'Choose a pickup station'; end if;

  -- Validate every line and calculate the exact server-side subtotal.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 then raise exception 'Invalid item quantity'; end if;

    select p.* into v_product
    from public.seller_products p
    where p.id=(v_item->>'product_id')::uuid
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status='available'
    for update;

    if not found then raise exception 'A product in your cart is no longer approved or available'; end if;

    select exists(
      select 1 from public.seller_accounts s
      where s.user_id=v_product.seller_id and s.application_status='approved'
    ) into v_seller_approved;

    if not v_seller_approved then
      raise exception 'A Seller in your cart is not currently approved';
    end if;

    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      if v_variant_id is null then
        raise exception 'Choose a variant for %',v_product.product_name;
      end if;

      select * into v_variant
      from public.seller_product_variants
      where id=v_variant_id
        and product_id=v_product.id
        and is_active=true
      for update;

      if not found then raise exception 'The selected variant for % is no longer available',v_product.product_name; end if;
      if v_variant.quantity_available < v_qty then
        raise exception '% — % does not have enough stock',v_product.product_name,v_variant.variant_name;
      end if;
      v_unit_price:=v_variant.price_kes;
    else
      if v_product.quantity_available < v_qty then
        raise exception '% does not have enough stock',v_product.product_name;
      end if;
      v_unit_price:=v_product.price_kes;
      v_variant_id:=null;
    end if;

    v_subtotal:=v_subtotal+(v_unit_price*v_qty);
  end loop;

  v_service:=round(v_subtotal * case when v_subtotal>=3000 then 0.015 else 0.02 end,2);

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
  v_ref:='LEOGO-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

  insert into public.marketplace_orders(
    order_reference,customer_id,receiver_name,contact_number,delivery_zone,county,sub_county,estate,landmark,location_link,pickup_station_id,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,grand_total_kes,payment_method,payment_status,payment_message
  )
  values(
    v_ref,v_uid,btrim(p_receiver_name),btrim(p_contact_number),p_delivery_zone,
    nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    p_pickup_station_id,v_subtotal,v_service,v_pickup,v_delivery,v_total,p_payment_method,v_payment_status,
    nullif(btrim(coalesce(p_payment_message,'')),'')
  )
  returning id into v_order_id;

  -- Create immutable order lines and reserve stock.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::numeric;

    select * into v_product
    from public.seller_products
    where id=(v_item->>'product_id')::uuid
    for update;

    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      select * into v_variant
      from public.seller_product_variants
      where id=v_variant_id and product_id=v_product.id
      for update;

      insert into public.marketplace_order_items(
        order_id,seller_id,product_id,variant_id,product_name,variant_name,variant_image_path,
        unit_price_kes,quantity,line_total_kes
      )
      values(
        v_order_id,v_product.seller_id,v_product.id,v_variant.id,v_product.product_name,v_variant.variant_name,v_variant.image_path,
        v_variant.price_kes,v_qty,v_variant.price_kes*v_qty
      );

      update public.seller_product_variants
      set quantity_available=greatest(quantity_available-v_qty,0)
      where id=v_variant.id;

      update public.seller_products p
      set quantity_available=coalesce((
            select sum(v.quantity_available)
            from public.seller_product_variants v
            where v.product_id=p.id and v.is_active
          ),0),
          availability_status=case when coalesce((
            select sum(v.quantity_available)
            from public.seller_product_variants v
            where v.product_id=p.id and v.is_active
          ),0)<=0 then 'out_of_stock' else 'available' end,
          updated_at=now()
      where p.id=v_product.id;
    else
      insert into public.marketplace_order_items(
        order_id,seller_id,product_id,product_name,unit_price_kes,quantity,line_total_kes
      )
      values(
        v_order_id,v_product.seller_id,v_product.id,v_product.product_name,v_product.price_kes,v_qty,v_product.price_kes*v_qty
      );

      update public.seller_products
      set quantity_available=greatest(quantity_available-v_qty,0),
          availability_status=case when quantity_available-v_qty<=0 then 'out_of_stock' else availability_status end,
          updated_at=now()
      where id=v_product.id;
    end if;
  end loop;

  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes)
  select v_order_id,seller_id,sum(line_total_kes)
  from public.marketplace_order_items
  where order_id=v_order_id
  group by seller_id;

  perform private.notify_partner(
    so.seller_id,'seller','new_order','New customer order',
    'A customer placed order '||v_ref||'. Open Orders to receive and prepare it.',
    'marketplace_order',v_order_id,'orders',
    jsonb_build_object('order_reference',v_ref,'seller_subtotal_kes',so.seller_subtotal_kes)
  )
  from public.marketplace_seller_orders so
  where so.order_id=v_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'order','Order placed','Your order '||v_ref||' was created successfully.',
    'marketplace_order',v_order_id,'order_placed_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref)
  );

  return jsonb_build_object(
    'order_id',v_order_id,
    'order_reference',v_ref,
    'items_subtotal_kes',v_subtotal,
    'service_fee_kes',v_service,
    'pickup_fee_kes',v_pickup,
    'delivery_fee_kes',v_delivery,
    'grand_total_kes',v_total,
    'payment_status',v_payment_status
  );
end $function$;

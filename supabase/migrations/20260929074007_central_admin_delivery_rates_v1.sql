-- LEOGO DIGITAL MARKET V2
-- Central Admin-managed delivery rates used by Marketplace and Cyber orders.

create table if not exists public.delivery_rate_settings (
  id smallint primary key default 1 check (id=1),
  cbd_fee_kes numeric(12,2) not null default 50 check (cbd_fee_kes>=0),
  estate_fee_kes numeric(12,2) not null default 80 check (estate_fee_kes>=0),
  outside_town_fee_kes numeric(12,2) not null default 200 check (outside_town_fee_kes>=0),
  standard_max_weight_kg numeric(12,2) not null default 50 check (standard_max_weight_kg>0),
  standard_max_area_sqm numeric(12,3) not null default 1 check (standard_max_area_sqm>0),
  rate_note text not null default 'Standard local delivery rates apply within the stated parcel limits. Far, heavy or oversized deliveries require a LEOGO quote.',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.delivery_rate_settings(id,cbd_fee_kes,estate_fee_kes,outside_town_fee_kes,standard_max_weight_kg,standard_max_area_sqm)
values(1,50,80,200,50,1) on conflict(id) do nothing;
alter table public.delivery_rate_settings enable row level security;

CREATE OR REPLACE FUNCTION public.public_get_delivery_rate_settings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'cbd_fee_kes',s.cbd_fee_kes,'estate_fee_kes',s.estate_fee_kes,'outside_town_fee_kes',s.outside_town_fee_kes,
    'standard_max_weight_kg',s.standard_max_weight_kg,'standard_max_area_sqm',s.standard_max_area_sqm,
    'rate_note',s.rate_note,'updated_at',s.updated_at
  ) from public.delivery_rate_settings s where s.id=1;
$function$
;

CREATE OR REPLACE FUNCTION private.delivery_fee_for_zone(p_zone text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case lower(coalesce(p_zone,''))
    when 'cbd' then s.cbd_fee_kes
    when 'estate' then s.estate_fee_kes
    when 'outside' then s.outside_town_fee_kes
    when 'outside_town' then s.outside_town_fee_kes
    when 'pickup' then 0::numeric
    else null::numeric
  end
  from public.delivery_rate_settings s where s.id=1;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_delivery_rate_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not (private.is_leogo_admin('settings.manage') or private.is_leogo_admin('fees.manage')
          or private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('approvals.read')) then
    raise exception 'Admin access required';
  end if;
  select to_jsonb(s) into v from public.delivery_rate_settings s where s.id=1;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_update_delivery_rate_settings(p_cbd_fee_kes numeric, p_estate_fee_kes numeric, p_outside_town_fee_kes numeric, p_standard_max_weight_kg numeric, p_standard_max_area_sqm numeric, p_rate_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb;
begin
  if not (private.is_leogo_admin('settings.manage') or private.is_leogo_admin('fees.manage')) then
    raise exception 'Delivery fee settings permission required';
  end if;
  if p_cbd_fee_kes is null or p_estate_fee_kes is null or p_outside_town_fee_kes is null
     or least(p_cbd_fee_kes,p_estate_fee_kes,p_outside_town_fee_kes)<0 then
    raise exception 'Delivery fees must be zero or above';
  end if;
  if p_standard_max_weight_kg is null or p_standard_max_weight_kg<=0 then
    raise exception 'Standard parcel weight limit must be above zero';
  end if;
  if p_standard_max_area_sqm is null or p_standard_max_area_sqm<=0 then
    raise exception 'Standard parcel area limit must be above zero';
  end if;

  select to_jsonb(s) into v_before from public.delivery_rate_settings s where s.id=1 for update;
  update public.delivery_rate_settings
  set cbd_fee_kes=round(p_cbd_fee_kes,2),
      estate_fee_kes=round(p_estate_fee_kes,2),
      outside_town_fee_kes=round(p_outside_town_fee_kes,2),
      standard_max_weight_kg=round(p_standard_max_weight_kg,2),
      standard_max_area_sqm=round(p_standard_max_area_sqm,3),
      rate_note=coalesce(nullif(btrim(coalesce(p_rate_note,'')),''),rate_note),
      updated_by=(select auth.uid()),updated_at=now()
  where id=1 returning to_jsonb(delivery_rate_settings.*) into v_after;

  update public.cyber_marketplace_settings
  set cbd_delivery_fee_kes=(v_after->>'cbd_fee_kes')::numeric,
      estate_delivery_fee_kes=(v_after->>'estate_fee_kes')::numeric,
      outside_town_delivery_fee_kes=(v_after->>'outside_town_fee_kes')::numeric,
      delivery_note=coalesce(v_after->>'rate_note',delivery_note),
      updated_by=(select auth.uid()),updated_at=now()
  where id=1;

  perform private.write_admin_audit('delivery.rates.updated','delivery_rate_settings','1',v_before,v_after,
    jsonb_build_object('scope','LEOGO system-wide standard delivery rates'));
  return v_after;
end $function$
;

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
    select round(v_subtotal*(coalesce(service_fee_percent,0)/100),2)
      into v_pickup
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
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_create_cyber_order(p_item_type text, p_item_id uuid, p_quantity numeric, p_customer_notes text, p_fulfilment_method text, p_delivery_zone_code text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_delivery_landmark text DEFAULT NULL::text, p_delivery_map_link text DEFAULT NULL::text, p_delivery_latitude numeric DEFAULT NULL::numeric, p_delivery_longitude numeric DEFAULT NULL::numeric, p_payment_reference text DEFAULT NULL::text, p_files jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_provider uuid; v_name text; v_pricing text; v_price numeric; v_requires_file boolean := false;
  v_qty numeric := greatest(coalesce(p_quantity,1),1);
  v_subtotal numeric := 0; v_delivery numeric := 0; v_total numeric := 0;
  v_order_id uuid; v_ref text; v_status text; v_payment_status text; v_file jsonb; v_path text;
  v_available numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_item_type not in ('service','product') then raise exception 'Choose a Cyber service or product'; end if;
  if p_fulfilment_method not in ('pickup','delivery') then raise exception 'Choose pickup or delivery'; end if;

  if p_item_type='service' then
    select s.provider_id,s.service_name,s.pricing_model,
      case
        when s.flash_sale_requested=true
         and s.flash_sale_status='approved'
         and s.flash_sale_price_kes is not null
         and s.flash_sale_starts_at<=now()
         and s.flash_sale_ends_at>now()
        then s.flash_sale_price_kes
        else s.price_kes
      end,
      s.requires_file_upload
      into v_provider,v_name,v_pricing,v_price,v_requires_file
    from public.cyber_services s
    join public.cyber_provider_accounts c on c.user_id=s.provider_id
    where s.id=p_item_id and s.approval_status='approved' and s.is_available and c.application_status='approved';

    if v_provider is null then raise exception 'This Cyber service is not currently available'; end if;
    if v_pricing='quote' then
      v_subtotal:=0; v_status:='awaiting_quote';
    else
      v_subtotal:=round(coalesce(v_price,0)*v_qty,2); v_status:='awaiting_payment';
    end if;
  else
    select p.provider_id,p.product_name,'fixed',p.price_kes,false,p.quantity_available
      into v_provider,v_name,v_pricing,v_price,v_requires_file,v_available
    from public.cyber_products p
    join public.cyber_provider_accounts c on c.user_id=p.provider_id
    where p.id=p_item_id and p.approval_status='approved' and p.availability_status='available'
      and c.application_status='approved';
    if v_provider is null then raise exception 'This Cyber product is not currently available'; end if;
    if v_qty>v_available then raise exception 'Requested quantity is higher than available stock'; end if;
    v_subtotal:=round(v_price*v_qty,2); v_status:='awaiting_payment';
  end if;

  if p_fulfilment_method='delivery' then
    if p_delivery_zone_code not in ('cbd','estate','outside_town') then raise exception 'Choose a delivery zone'; end if;
    if char_length(btrim(coalesce(p_delivery_address,'')))<3 then raise exception 'Enter the delivery address'; end if;

    -- Cyber and normal marketplace orders share the same Admin-managed delivery rates.
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone_code);
  end if;

  v_total:=round(v_subtotal+coalesce(v_delivery,0),2);
  if v_pricing='quote' then
    v_payment_status:='not_required';
  else
    v_payment_status:=case when v_total>0 then 'pending_verification' else 'not_required' end;
    if v_total>0 and char_length(btrim(coalesce(p_payment_reference,'')))<3 then
      raise exception 'Enter the payment reference';
    end if;
  end if;

  if v_requires_file and (p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)=0) then
    raise exception 'Upload the document/file required for this service';
  end if;
  if p_files is not null and jsonb_typeof(p_files)<>'array' then raise exception 'Uploaded file information is invalid'; end if;

  v_order_id:=gen_random_uuid();
  v_ref:='CYB-'||upper(substr(replace(v_order_id::text,'-',''),1,8));

  insert into public.cyber_orders(
    id,order_reference,customer_id,provider_id,item_type,service_id,product_id,item_name,pricing_model,quantity,
    unit_price_kes,subtotal_kes,pricing_status,fulfilment_method,delivery_zone_code,delivery_address,delivery_landmark,
    delivery_map_link,delivery_latitude,delivery_longitude,delivery_fee_kes,total_kes,customer_notes,payment_reference,
    payment_status,order_status,submitted_at,updated_at
  ) values (
    v_order_id,v_ref,v_uid,v_provider,p_item_type,
    case when p_item_type='service' then p_item_id else null end,
    case when p_item_type='product' then p_item_id else null end,
    v_name,v_pricing,v_qty,v_price,v_subtotal,
    case when v_pricing='quote' then 'quote_requested' else 'fixed' end,
    p_fulfilment_method,p_delivery_zone_code,nullif(btrim(coalesce(p_delivery_address,'')),''),
    nullif(btrim(coalesce(p_delivery_landmark,'')),''),
    nullif(btrim(coalesce(p_delivery_map_link,'')),''),
    p_delivery_latitude,p_delivery_longitude,v_delivery,v_total,
    nullif(btrim(coalesce(p_customer_notes,'')),''),
    case when v_pricing='quote' then null else nullif(btrim(coalesce(p_payment_reference,'')),'') end,
    v_payment_status,v_status,now(),now()
  );

  if p_files is not null then
    for v_file in select * from jsonb_array_elements(p_files)
    loop
      v_path:=nullif(btrim(coalesce(v_file->>'path','')),'');
      if v_path is null or split_part(v_path,'/',1)<>v_uid::text then raise exception 'Invalid uploaded file path'; end if;
      insert into public.cyber_order_files(order_id,uploaded_by,storage_path,original_name,mime_type,size_bytes)
      values(
        v_order_id,v_uid,v_path,coalesce(nullif(v_file->>'name',''),'Customer document'),
        nullif(v_file->>'mime',''),
        case when nullif(v_file->>'size','') is null then null else (v_file->>'size')::bigint end
      );
    end loop;
  end if;

  perform private.notify_partner(
    v_provider,'cyber',
    case when v_pricing='quote' then 'cyber_quote_request' else 'cyber_order_received' end,
    case when v_pricing='quote' then 'New Cyber quotation request' else 'New Cyber customer order' end,
    v_ref||' · '||v_name||case when v_payment_status='pending_verification' then ' · payment awaiting Admin verification' else '' end,
    'cyber_order',v_order_id,'cyber-orders',jsonb_build_object('order_reference',v_ref,'fulfilment_method',p_fulfilment_method)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_uid,'cyber_order','Cyber order received',
    v_ref||' for '||v_name||' has been submitted.',
    'cyber_order',v_order_id,'cyber_order_created_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref,'fulfilment_method',p_fulfilment_method)
  ) on conflict(event_key) do nothing;

  return jsonb_build_object(
    'ok',true,'order_id',v_order_id,'order_reference',v_ref,'subtotal_kes',v_subtotal,
    'delivery_fee_kes',v_delivery,'total_kes',v_total,'payment_status',v_payment_status,'order_status',v_status
  );
end
$function$
;


revoke all on function public.public_get_delivery_rate_settings() from public;
grant execute on function public.public_get_delivery_rate_settings() to anon,authenticated;
revoke all on function private.delivery_fee_for_zone(text) from public,anon,authenticated;
revoke all on function public.admin_get_delivery_rate_settings() from public,anon;
revoke all on function public.admin_update_delivery_rate_settings(numeric,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.admin_get_delivery_rate_settings() to authenticated;
grant execute on function public.admin_update_delivery_rate_settings(numeric,numeric,numeric,numeric,numeric,text) to authenticated;

-- LEOGO Health & Medicine cart checkout with prescription upload.
-- Approved Health products remain review-controlled. Prescription-required medicines
-- may enter the Health cart, but checkout is blocked unless the signed-in customer
-- uploads a private doctor prescription.

alter table public.health_medicine_orders
  add column if not exists prescription_required boolean not null default false,
  add column if not exists prescription_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'health-prescriptions',
  'health-prescriptions',
  false,
  8388608,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists health_prescription_insert_own on storage.objects;
create policy health_prescription_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id='health-prescriptions'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists health_prescription_read_authorized on storage.objects;
create policy health_prescription_read_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id='health-prescriptions'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or exists (
      select 1
      from public.health_medicine_orders o
      where o.provider_id=(select auth.uid())
        and o.prescription_path=storage.objects.name
    )
    or private.is_leogo_admin('orders.read')
    or private.is_leogo_admin('approvals.read')
  )
);

drop policy if exists health_prescription_delete_unsubmitted_own on storage.objects;
create policy health_prescription_delete_unsubmitted_own
on storage.objects
for delete
to authenticated
using (
  bucket_id='health-prescriptions'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists (
    select 1
    from public.health_medicine_orders o
    where o.prescription_path=storage.objects.name
  )
);

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
language plpgsql
security definer
set search_path=''
as $function$
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
    v_order_mode:='cart';
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
$function$;

-- Existing approved prescription-required products that were previously enquiry-only
-- become cart products; the prescription gate is enforced at checkout.
update public.health_medicine_products
set order_mode='cart', updated_at=now()
where requires_prescription=true
  and approval_status='approved'
  and order_mode<>'cart';

create or replace function public.public_list_health_medicine()
returns jsonb
language sql
security definer
set search_path=''
as $function$
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
        'approved_product_count',(select count(*) from public.health_medicine_products p where p.provider_id=h.user_id and p.approval_status='approved' and p.availability_status<>'inactive'),
        'approved_service_count',(select count(*) from public.health_specialist_services s where s.provider_id=h.user_id and s.approval_status='approved' and s.listing_status='active')
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
        'cart_eligible',(p.order_mode='cart' and p.availability_status='available' and p.quantity_available>0),
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
$function$;

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
language plpgsql
security definer
set search_path=''
as $function$
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
  v_prescription_required boolean:=false;
  v_prescription_path text:=nullif(btrim(coalesce(p_items->0->>'prescription_path','')),'');
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
      and h.application_status='approved'
      and h.availability_status<>'closed'
    for update of p;

    if not found then
      raise exception 'A Health & Medicine item in your cart is no longer approved, available, or eligible for ordering';
    end if;

    if v_product.requires_prescription then
      v_prescription_required:=true;
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

  if v_prescription_required then
    if v_prescription_path is null then
      raise exception 'Upload the doctor prescription before placing this Health & Medicine order';
    end if;
    if split_part(v_prescription_path,'/',1)<>v_uid::text then
      raise exception 'The uploaded prescription does not belong to the signed-in customer';
    end if;
    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id='health-prescriptions'
        and o.name=v_prescription_path
    ) then
      raise exception 'The uploaded prescription could not be verified. Upload it again before checkout';
    end if;
  else
    v_prescription_path:=null;
  end if;

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
    payment_method,payment_status,payment_message,prescription_required,prescription_path
  ) values (
    v_ref,v_uid,v_provider,btrim(p_receiver_name),btrim(p_contact_number),
    p_delivery_zone,nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    p_pickup_station_id,v_subtotal,v_service,v_pickup,v_delivery,v_total,
    p_payment_method,v_payment_status,nullif(btrim(coalesce(p_payment_message,'')),''),
    v_prescription_required,v_prescription_path
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
    'A customer placed Health & Medicine order '||v_ref||
      case when v_prescription_required then ' with a doctor prescription attached.' else '.' end,
    'health_medicine_order',v_order_id,'health-orders',
    jsonb_build_object(
      'order_reference',v_ref,
      'grand_total_kes',v_total,
      'payment_status',v_payment_status,
      'prescription_required',v_prescription_required
    )
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_uid,'order','Health & Medicine order placed',
    'Your Health & Medicine order '||v_ref||' was created successfully.',
    'health_medicine_order',v_order_id,'health_order_placed_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref,'provider_id',v_provider,'prescription_required',v_prescription_required)
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
    'order_source','health_medicine',
    'prescription_required',v_prescription_required
  );
end;
$function$;

-- Pickup Station operational evidence and short tracking references.
-- Receiving requires a parcel photo. Handover requires a collection photo and customer ID number.
-- Partners may also find a station parcel with the last 4+ characters of the LEOGO order reference.

alter table public.pickup_station_parcels
  add column if not exists receive_photo_path text,
  add column if not exists handover_photo_path text,
  add column if not exists handover_customer_id_number text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'pickup-station-proof',
  'pickup-station-proof',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists pickup_station_proof_partner_insert on storage.objects;
create policy pickup_station_proof_partner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='pickup-station-proof'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.pickup_partner_station_id() is not null
);

drop policy if exists pickup_station_proof_partner_read on storage.objects;
create policy pickup_station_proof_partner_read
on storage.objects for select
to authenticated
using (
  bucket_id='pickup-station-proof'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('orders.read')
  )
);

drop policy if exists pickup_station_proof_partner_delete on storage.objects;
create policy pickup_station_proof_partner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='pickup-station-proof'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function private.pickup_resolve_order_for_partner(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_station uuid := private.pickup_partner_station_id();
  v_code text := btrim(coalesce(p_code,''));
  v_compact text;
  v_id uuid;
  v_matches uuid[];
begin
  if v_station is null then
    raise exception 'Your account is not assigned to an active Pickup Station';
  end if;
  if v_code='' then
    raise exception 'Enter or scan an order / waybill number';
  end if;

  -- First preserve exact full-reference and UUID matching.
  select o.id into v_id
  from public.marketplace_orders o
  where o.pickup_station_id=v_station
    and o.delivery_zone='pickup'
    and (
      upper(o.order_reference)=upper(v_code)
      or (
        v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and o.id=v_code::uuid
      )
    )
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Manual station tracking may use the last 4 or more letters/digits of the
  -- LEOGO reference, e.g. BO1A instead of the complete order number.
  v_compact := regexp_replace(upper(v_code),'[^A-Z0-9]','','g');
  if char_length(v_compact)<4 then
    raise exception 'Enter the full order number or at least the last 4 characters';
  end if;

  select array_agg(o.id order by o.created_at desc)
  into v_matches
  from public.marketplace_orders o
  where o.pickup_station_id=v_station
    and o.delivery_zone='pickup'
    and right(
      regexp_replace(upper(o.order_reference),'[^A-Z0-9]','','g'),
      char_length(v_compact)
    )=v_compact;

  if coalesce(array_length(v_matches,1),0)=0 then
    raise exception 'No parcel booked for this Pickup Station matches that order / tracking number';
  end if;
  if array_length(v_matches,1)>1 then
    raise exception 'More than one parcel matches those last characters. Enter more of the order number';
  end if;

  return v_matches[1];
end
$function$;

create or replace function public.pickup_partner_lookup_parcel(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_result jsonb;
begin
  select jsonb_build_object(
    'parcel_id',p.id,
    'order_id',o.id,
    'order_reference',o.order_reference,
    'customer_name',o.receiver_name,
    'customer_phone',o.contact_number,
    'payment_method',o.payment_method,
    'payment_status',o.payment_status,
    'grand_total_kes',o.grand_total_kes,
    'parcel_status',p.status,
    'booked_at',p.booked_at,
    'received_at',p.received_at,
    'handed_over_at',p.handed_over_at,
    'receive_photo_captured',p.receive_photo_path is not null,
    'handover_photo_captured',p.handover_photo_path is not null,
    'handover_id_recorded',p.handover_customer_id_number is not null,
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object('name',i.product_name,'variant',i.variant_name,'quantity',i.quantity)
        order by i.created_at
      )
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'[]'::jsonb)
  )
  into v_result
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where o.id=v_order_id;

  return v_result;
end
$function$;

drop function if exists public.pickup_partner_receive_parcel(text,text);

create or replace function public.pickup_partner_receive_parcel(
  p_code text,
  p_receive_photo_path text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
  v_photo text := nullif(btrim(coalesce(p_receive_photo_path,'')),'');
begin
  if v_station is null then
    raise exception 'Your account is not assigned to an active Pickup Station';
  end if;
  if v_photo is null then
    raise exception 'A parcel receiving photo is required';
  end if;
  if not exists(
    select 1
    from storage.objects so
    where so.bucket_id='pickup-station-proof'
      and so.name=v_photo
      and (storage.foldername(so.name))[1]=v_uid::text
  ) then
    raise exception 'The parcel receiving photo could not be verified. Take the photo again';
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_order_id
  for update;

  select * into v_parcel
  from public.pickup_station_parcels
  where order_id=v_order_id
  for update;

  select station_name into v_station_name
  from public.pickup_stations
  where id=v_station;

  if v_parcel.status='handed_over' then
    raise exception 'This parcel has already been handed over';
  end if;
  if v_parcel.status='received' then
    raise exception 'This parcel has already been received at this Pickup Station';
  end if;
  if v_order.order_status='cancelled' then
    raise exception 'This order is cancelled and cannot be received';
  end if;

  update public.pickup_station_parcels
  set status='received',
      received_at=now(),
      received_by=v_uid,
      receive_photo_path=v_photo,
      last_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_delivery_jobs
  set status='ready_for_pickup',updated_at=now()
  where order_id=v_order.id
    and status not in ('delivered','cancelled','failed');

  update public.marketplace_orders
  set order_status=case when order_status='placed' then 'processing' else order_status end,
      updated_at=now()
  where id=v_order.id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'received',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel received with required photo evidence and stored for customer collection.')
  );

  perform private.pickup_notify_order_parties(
    v_order.id,'received',coalesce(v_station_name,'Pickup Station')
  );

  perform private.write_admin_audit(
    'pickup.parcel.received','marketplace_order',v_order.id::text,
    null,
    jsonb_build_object(
      'order_reference',v_order.order_reference,
      'pickup_station_id',v_station,
      'parcel_status','received',
      'delivery_status','ready_for_pickup',
      'receive_photo_recorded',true
    ),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'order_reference',v_order.order_reference,
    'status','received',
    'delivery_status','ready_for_pickup',
    'receive_photo_recorded',true
  );
end
$function$;

drop function if exists public.pickup_partner_handover_parcel(text,text);

create or replace function public.pickup_partner_handover_parcel(
  p_code text,
  p_handover_photo_path text,
  p_customer_id_number text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
  v_earning numeric := private.pickup_handled_parcel_earning();
  v_photo text := nullif(btrim(coalesce(p_handover_photo_path,'')),'');
  v_customer_id text := nullif(btrim(coalesce(p_customer_id_number,'')),'');
begin
  if v_station is null then
    raise exception 'Your account is not assigned to an active Pickup Station';
  end if;
  if v_photo is null then
    raise exception 'A handover photo is required before releasing the parcel';
  end if;
  if v_customer_id is null or char_length(v_customer_id)<4 or char_length(v_customer_id)>40 then
    raise exception 'Enter a valid customer ID number before releasing the parcel';
  end if;
  if not exists(
    select 1
    from storage.objects so
    where so.bucket_id='pickup-station-proof'
      and so.name=v_photo
      and (storage.foldername(so.name))[1]=v_uid::text
  ) then
    raise exception 'The handover photo could not be verified. Take the photo again';
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_order_id
  for update;

  select * into v_parcel
  from public.pickup_station_parcels
  where order_id=v_order_id
  for update;

  select station_name into v_station_name
  from public.pickup_stations
  where id=v_station;

  if v_parcel.status='handed_over' then
    raise exception 'This parcel has already been handed over';
  end if;
  if v_parcel.status<>'received' then
    raise exception 'Receive this parcel at the Pickup Station before handing it over';
  end if;
  if v_order.payment_status in ('submitted','rejected') then
    raise exception 'Payment is not verified. Do not hand over this parcel yet';
  end if;

  update public.pickup_station_parcels
  set status='handed_over',
      handed_over_at=now(),
      handed_over_by=v_uid,
      handover_photo_path=v_photo,
      handover_customer_id_number=v_customer_id,
      earnings_amount_kes=v_earning,
      last_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_delivery_jobs
  set status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      updated_at=now()
  where order_id=v_order.id
    and status not in ('cancelled','failed');

  update public.marketplace_orders
  set order_status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      payment_status=case when payment_status='cod_due' then 'cod_paid' else payment_status end,
      updated_at=now()
  where id=v_order.id;

  update public.marketplace_seller_orders
  set fulfilment_status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      updated_at=now()
  where order_id=v_order.id
    and fulfilment_status<>'cancelled';

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'handed_over',v_order.order_reference,v_uid,
    coalesce(
      nullif(btrim(coalesce(p_notes,'')),''),
      'Parcel handed over with customer ID and photo evidence. Station earning: KSh '||v_earning::text||'.'
    )
  );

  perform private.pickup_notify_order_parties(
    v_order.id,'handed_over',coalesce(v_station_name,'Pickup Station')
  );

  perform private.write_admin_audit(
    'pickup.parcel.handed_over','marketplace_order',v_order.id::text,
    null,
    jsonb_build_object(
      'order_reference',v_order.order_reference,
      'pickup_station_id',v_station,
      'parcel_status','handed_over',
      'delivery_status','delivered',
      'earnings_amount_kes',v_parcel.earnings_amount_kes,
      'handover_photo_recorded',true,
      'customer_id_recorded',true
    ),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'order_reference',v_order.order_reference,
    'status','handed_over',
    'delivery_status','delivered',
    'earnings_amount_kes',v_parcel.earnings_amount_kes,
    'handover_photo_recorded',true,
    'customer_id_recorded',true
  );
end
$function$;

revoke all on function public.pickup_partner_lookup_parcel(text) from public,anon;
grant execute on function public.pickup_partner_lookup_parcel(text) to authenticated;

revoke all on function public.pickup_partner_receive_parcel(text,text,text) from public,anon;
grant execute on function public.pickup_partner_receive_parcel(text,text,text) to authenticated;

revoke all on function public.pickup_partner_handover_parcel(text,text,text,text) from public,anon;
grant execute on function public.pickup_partner_handover_parcel(text,text,text,text) to authenticated;

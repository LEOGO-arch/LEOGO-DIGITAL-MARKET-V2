-- Distinguish arrival at a Pickup Station from final customer handover.
alter table public.marketplace_delivery_jobs
  drop constraint if exists marketplace_delivery_jobs_status_check;
alter table public.marketplace_delivery_jobs
  add constraint marketplace_delivery_jobs_status_check
  check (status = any(array[
    'awaiting_assignment'::text,'assigned'::text,'picked_up'::text,
    'arrived_sorting_center'::text,'sorting_received'::text,'ready_for_dispatch'::text,
    'on_the_way'::text,'ready_for_pickup'::text,'delivered'::text,
    'failed'::text,'cancelled'::text
  ]));

CREATE OR REPLACE FUNCTION public.pickup_partner_handover_parcel(p_code text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  select * into v_order from public.marketplace_orders where id=v_order_id for update;
  select * into v_parcel from public.pickup_station_parcels where order_id=v_order_id for update;
  select station_name into v_station_name from public.pickup_stations where id=v_station;

  if v_parcel.status='handed_over' then
    return jsonb_build_object('ok',true,'already_handed_over',true,'order_reference',v_order.order_reference,'status','handed_over');
  end if;
  if v_parcel.status<>'received' then raise exception 'Receive this parcel at the Pickup Station before handing it over'; end if;
  if v_order.payment_status in ('submitted','rejected') then
    raise exception 'Payment is not verified. Do not hand over this parcel yet';
  end if;

  update public.pickup_station_parcels
  set status='handed_over',handed_over_at=now(),handed_over_by=v_uid,last_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_delivery_jobs
  set status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and status not in ('cancelled','failed');

  update public.marketplace_orders
  set order_status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      payment_status=case when payment_status='cod_due' then 'cod_paid' else payment_status end,
      updated_at=now()
  where id=v_order.id;

  update public.marketplace_seller_orders
  set fulfilment_status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and fulfilment_status<>'cancelled';

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'handed_over',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel handed over to customer.')
  );

  perform private.pickup_notify_order_parties(v_order.id,'handed_over',coalesce(v_station_name,'Pickup Station'));
  perform private.write_admin_audit(
    'pickup.parcel.handed_over','marketplace_order',v_order.id::text,
    null,jsonb_build_object(
      'order_reference',v_order.order_reference,'pickup_station_id',v_station,
      'parcel_status','handed_over','delivery_status','delivered',
      'earnings_amount_kes',v_parcel.earnings_amount_kes
    ),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,'order_id',v_order.id,'order_reference',v_order.order_reference,
    'status','handed_over','delivery_status','delivered','earnings_amount_kes',v_parcel.earnings_amount_kes
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_receive_parcel(p_code text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  select * into v_order from public.marketplace_orders where id=v_order_id for update;
  select * into v_parcel from public.pickup_station_parcels where order_id=v_order_id for update;
  select station_name into v_station_name from public.pickup_stations where id=v_station;

  if v_parcel.status='handed_over' then raise exception 'This parcel has already been handed over'; end if;
  if v_parcel.status='received' then
    return jsonb_build_object('ok',true,'already_received',true,'order_reference',v_order.order_reference,'status','received');
  end if;
  if v_order.order_status='cancelled' then raise exception 'This order is cancelled and cannot be received'; end if;

  update public.pickup_station_parcels
  set status='received',received_at=now(),received_by=v_uid,last_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  -- Arrival at a Pickup Station is not final customer delivery.
  -- Keep the order open and expose a distinct Ready for Pickup delivery state.
  update public.marketplace_delivery_jobs
  set status='ready_for_pickup',updated_at=now()
  where order_id=v_order.id and status not in ('delivered','cancelled','failed');

  update public.marketplace_orders
  set order_status=case when order_status='placed' then 'processing' else order_status end,
      updated_at=now()
  where id=v_order.id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'received',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel received and stored for customer collection.')
  );

  perform private.pickup_notify_order_parties(v_order.id,'received',coalesce(v_station_name,'Pickup Station'));
  perform private.write_admin_audit(
    'pickup.parcel.received','marketplace_order',v_order.id::text,
    null,jsonb_build_object(
      'order_reference',v_order.order_reference,
      'pickup_station_id',v_station,
      'parcel_status','received',
      'delivery_status','ready_for_pickup'
    ),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,'order_id',v_order.id,'order_reference',v_order.order_reference,
    'status','received','delivery_status','ready_for_pickup'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.rider_update_delivery_status(p_delivery_job_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_job public.marketplace_delivery_jobs%rowtype;
  v_order public.marketplace_orders%rowtype;
begin
  if p_status not in ('picked_up','on_the_way','delivered') then
    raise exception 'Unsupported delivery status';
  end if;

  if not exists(
    select 1
    from public.leogo_staff ls
    where ls.user_id=v_uid
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  select * into v_job
  from public.marketplace_delivery_jobs d
  where d.id=p_delivery_job_id
    and d.rider_id=v_uid
  for update;
  if not found then raise exception 'Delivery job not found'; end if;

  select * into v_order
  from public.marketplace_orders o
  where o.id=v_job.order_id
  for update;

  if p_status='delivered' and v_order.delivery_zone='pickup' then
    raise exception 'This order is booked for a Pickup Station. The Pickup Station Partner must scan it to receive it.';
  end if;

  if p_status='picked_up' and v_job.status<>'assigned' then
    raise exception 'Job must be assigned before pickup';
  end if;

  if p_status='picked_up' and exists(
    select 1
    from public.marketplace_seller_orders so
    where so.order_id=v_job.order_id
      and so.fulfilment_status not in ('packed_ready','handed_to_rider','delivered')
  ) then
    raise exception 'One or more Seller portions are not packed and ready yet';
  end if;

  if p_status='on_the_way' and v_job.status<>'picked_up' then
    raise exception 'Mark the order picked up first';
  end if;

  if p_status='delivered' and v_job.status<>'on_the_way' then
    raise exception 'Mark the order on the way before delivered';
  end if;

  if p_status='picked_up' then
    update public.marketplace_seller_orders so
    set fulfilment_status='handed_to_rider',
        handed_to_rider_at=coalesce(so.handed_to_rider_at,now()),
        updated_at=now()
    where so.order_id=v_job.order_id
      and so.fulfilment_status='packed_ready';
  end if;

  update public.marketplace_delivery_jobs d
  set status=p_status,
      picked_up_at=case when p_status='picked_up' then now() else d.picked_up_at end,
      on_the_way_at=case when p_status='on_the_way' then now() else d.on_the_way_at end,
      delivered_at=case when p_status='delivered' then now() else d.delivered_at end,
      rider_notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),d.rider_notes),
      updated_at=now()
  where d.id=p_delivery_job_id;

  update public.marketplace_orders o
  set order_status=case when p_status='delivered' then 'delivered' else 'with_rider' end,
      delivered_at=case when p_status='delivered' then now() else o.delivered_at end,
      payment_status=case when p_status='delivered' and o.payment_method='cod' then 'cod_paid' else o.payment_status end,
      updated_at=now()
  where o.id=v_job.order_id;

  if p_status='delivered' then
    update public.marketplace_seller_orders so
    set fulfilment_status='delivered',
        delivered_at=coalesce(so.delivered_at,now()),
        updated_at=now()
    where so.order_id=v_job.order_id
      and so.fulfilment_status<>'cancelled';
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_order.customer_id,'delivery',
    case p_status
      when 'picked_up' then 'Order picked up'
      when 'on_the_way' then 'Order on the way'
      else 'Order delivered'
    end,
    'Order '||v_order.order_reference||' is '||replace(p_status,'_',' ')||'.',
    'marketplace_delivery_job',p_delivery_job_id,'delivery_'||p_status,'orders',
    jsonb_build_object('status',p_status)
  );

  perform private.notify_partner(
    so.seller_id,'seller','delivery_'||p_status,
    case p_status
      when 'picked_up' then 'Order picked up by rider'
      when 'on_the_way' then 'Order on the way'
      else 'Order delivered'
    end,
    'Delivery status for order '||v_order.order_reference||' is now '||replace(p_status,'_',' ')||'.',
    'marketplace_delivery_job',p_delivery_job_id,'orders',
    jsonb_build_object('status',p_status)
  )
  from public.marketplace_seller_orders so
  where so.order_id=v_job.order_id;

  return jsonb_build_object('ok',true,'status',p_status,'order_id',v_job.order_id);
end
$function$;

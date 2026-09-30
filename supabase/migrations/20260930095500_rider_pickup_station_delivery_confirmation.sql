-- Separate Rider physical delivery to a Pickup Station from the Pickup Station Partner's receipt confirmation.
-- Rider: on_the_way -> delivered_to_pickup_station
-- Station parcel: booked -> arrived_pending_receipt -> received -> handed_over

alter table public.marketplace_delivery_jobs
  add column if not exists delivered_to_pickup_station_at timestamptz;

alter table public.pickup_station_parcels
  add column if not exists arrived_at timestamptz,
  add column if not exists arrived_by_rider_id uuid references public.leogo_staff(user_id) on delete set null;

alter table public.marketplace_delivery_jobs
  drop constraint if exists marketplace_delivery_jobs_status_check;

alter table public.marketplace_delivery_jobs
  add constraint marketplace_delivery_jobs_status_check
  check (status = any (array[
    'awaiting_assignment'::text,
    'assigned'::text,
    'picked_up'::text,
    'arrived_sorting_center'::text,
    'sorting_received'::text,
    'ready_for_dispatch'::text,
    'on_the_way'::text,
    'delivered_to_pickup_station'::text,
    'ready_for_pickup'::text,
    'delivered'::text,
    'failed'::text,
    'cancelled'::text
  ]));

alter table public.pickup_station_parcels
  drop constraint if exists pickup_station_parcels_status_check;

alter table public.pickup_station_parcels
  add constraint pickup_station_parcels_status_check
  check (status = any (array[
    'booked'::text,
    'arrived_pending_receipt'::text,
    'received'::text,
    'handed_over'::text,
    'cancelled'::text
  ]));

alter table public.pickup_station_parcel_events
  drop constraint if exists pickup_station_parcel_events_event_type_check;

alter table public.pickup_station_parcel_events
  add constraint pickup_station_parcel_events_event_type_check
  check (event_type = any (array[
    'booked'::text,
    'rider_delivered_to_station'::text,
    'received'::text,
    'handed_over'::text,
    'return_booked'::text,
    'return_dispatched'::text,
    'withdrawal_requested'::text
  ]));

create or replace function public.rider_update_delivery_status_v3(
  p_delivery_job_id uuid,
  p_status text,
  p_note text default null,
  p_cod_payment_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_job public.marketplace_delivery_jobs%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
  v_title text;
  v_message text;
begin
  if p_status not in ('picked_up','arrived_sorting_center','on_the_way','delivered_to_pickup_station','delivered') then
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

  if not found then
    raise exception 'Delivery job not found';
  end if;

  select * into v_order
  from public.marketplace_orders o
  where o.id=v_job.order_id
  for update;

  if p_status='picked_up' then
    if v_job.status<>'assigned' then
      raise exception 'Job must be assigned before pickup';
    end if;

    if exists(
      select 1
      from public.marketplace_seller_orders so
      where so.order_id=v_job.order_id
        and so.fulfilment_status not in ('packed_ready','handed_to_rider','delivered')
    ) then
      raise exception 'One or more Seller portions are not packed and ready yet';
    end if;

    update public.marketplace_seller_orders so
    set fulfilment_status='handed_to_rider',
        handed_to_rider_at=coalesce(so.handed_to_rider_at,now()),
        updated_at=now()
    where so.order_id=v_job.order_id
      and so.fulfilment_status='packed_ready';

    v_title := 'Order picked up';
    v_message := 'Order '||v_order.order_reference||' has been picked up from the Seller and is heading to the LEOGO Sorting Center.';

  elsif p_status='arrived_sorting_center' then
    if v_job.status<>'picked_up' then
      raise exception 'Mark the order picked up before arriving at the sorting center';
    end if;

    v_title := 'Order arrived at LEOGO Sorting Center';
    v_message := 'Order '||v_order.order_reference||' has arrived at the LEOGO Sorting Center and is awaiting receipt confirmation.';

  elsif p_status='on_the_way' then
    if v_job.status<>'ready_for_dispatch' then
      raise exception 'Order must be marked ready for dispatch at the LEOGO Sorting Center first';
    end if;

    v_title := 'Order dispatched';
    if v_order.delivery_zone='pickup' then
      v_message := 'Order '||v_order.order_reference||' has left the LEOGO Sorting Center and is on the way to the selected Pickup Station.';
    else
      v_message := 'Order '||v_order.order_reference||' has left the LEOGO Sorting Center and is on the way to the customer.';
    end if;

  elsif p_status='delivered_to_pickup_station' then
    if v_order.delivery_zone<>'pickup' or v_order.pickup_station_id is null then
      raise exception 'This order is not a Pickup Station delivery';
    end if;
    if v_job.status<>'on_the_way' then
      raise exception 'Start delivery before marking arrival at the Pickup Station';
    end if;

    select ps.station_name into v_station_name
    from public.pickup_stations ps
    where ps.id=v_order.pickup_station_id;

    select * into v_parcel
    from public.pickup_station_parcels p
    where p.order_id=v_order.id
    for update;

    if not found then
      raise exception 'Pickup Station parcel record was not found';
    end if;
    if v_parcel.pickup_station_id<>v_order.pickup_station_id then
      raise exception 'Pickup Station assignment does not match the order';
    end if;
    if v_parcel.status in ('received','handed_over') then
      raise exception 'This Pickup Station has already confirmed receipt of the parcel';
    end if;

    update public.pickup_station_parcels p
    set status='arrived_pending_receipt',
        arrived_at=coalesce(p.arrived_at,now()),
        arrived_by_rider_id=v_uid,
        last_notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),p.last_notes),
        updated_at=now()
    where p.id=v_parcel.id
    returning * into v_parcel;

    insert into public.pickup_station_parcel_events(
      pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
    ) values (
      v_order.pickup_station_id,
      v_parcel.id,
      v_order.id,
      'rider_delivered_to_station',
      v_order.order_reference,
      v_uid,
      coalesce(
        nullif(btrim(coalesce(p_note,'')),''),
        'Rider delivered parcel to the Pickup Station. Waiting for Pickup Station Partner receipt confirmation.'
      )
    );

    insert into public.partner_notifications(
      user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
    )
    select
      pa.user_id,
      'pickup_station',
      'parcel_arrived_pending_receipt',
      'Parcel delivered — confirm receipt',
      'Rider delivered order '||v_order.order_reference||' to '||coalesce(v_station_name,'your Pickup Station')||'. Scan or enter the order and confirm receipt with the required parcel photo.',
      'pickup_station_parcel',
      v_parcel.id,
      'parcels',
      jsonb_build_object(
        'order_id',v_order.id,
        'order_reference',v_order.order_reference,
        'parcel_status','arrived_pending_receipt'
      )
    from public.pickup_station_partner_accounts pa
    where pa.pickup_station_id=v_order.pickup_station_id
      and pa.status='active';

    v_title := 'Parcel delivered to Pickup Station';
    v_message := 'Order '||v_order.order_reference||' has been delivered by the Rider to '||coalesce(v_station_name,'the selected Pickup Station')||' and is awaiting the station partner receipt confirmation.';

  else
    if v_order.delivery_zone='pickup' then
      raise exception 'Pickup Station orders are completed by the Pickup Station Partner, not by the Rider';
    end if;
    if v_job.status<>'on_the_way' then
      raise exception 'Mark the order on the way before delivered';
    end if;

    if v_order.payment_method='cod'
       and v_order.payment_status not in ('cod_paid','verified_paid')
       and coalesce(p_cod_payment_confirmed,false)=false then
      raise exception 'Confirm that full COD payment has been collected before handing over the order';
    end if;

    v_title := 'Order delivered';
    v_message := 'Order '||v_order.order_reference||' has been delivered.';
  end if;

  update public.marketplace_delivery_jobs d
  set status=p_status,
      picked_up_at=case when p_status='picked_up' then coalesce(d.picked_up_at,now()) else d.picked_up_at end,
      arrived_sorting_center_at=case when p_status='arrived_sorting_center' then coalesce(d.arrived_sorting_center_at,now()) else d.arrived_sorting_center_at end,
      on_the_way_at=case when p_status='on_the_way' then coalesce(d.on_the_way_at,now()) else d.on_the_way_at end,
      delivered_to_pickup_station_at=case when p_status='delivered_to_pickup_station' then coalesce(d.delivered_to_pickup_station_at,now()) else d.delivered_to_pickup_station_at end,
      delivered_at=case when p_status='delivered' then coalesce(d.delivered_at,now()) else d.delivered_at end,
      rider_notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),d.rider_notes),
      updated_at=now()
  where d.id=p_delivery_job_id;

  update public.marketplace_orders o
  set order_status=case when p_status='delivered' then 'delivered' else 'with_rider' end,
      delivered_at=case when p_status='delivered' then coalesce(o.delivered_at,now()) else o.delivered_at end,
      payment_status=case
        when p_status='delivered' and o.payment_method='cod' then 'cod_paid'
        else o.payment_status
      end,
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
    v_order.customer_id,'delivery',v_title,v_message,
    'marketplace_delivery_job',p_delivery_job_id,'delivery_'||p_status,'orders',
    jsonb_build_object('status',p_status)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  perform private.notify_partner(
    so.seller_id,'seller','delivery_'||p_status,v_title,v_message,
    'marketplace_delivery_job',p_delivery_job_id,'orders',
    jsonb_build_object('status',p_status)
  )
  from public.marketplace_seller_orders so
  where so.order_id=v_job.order_id;

  return jsonb_build_object(
    'ok',true,
    'status',p_status,
    'order_id',v_job.order_id,
    'pickup_station_pending_receipt',p_status='delivered_to_pickup_station'
  );
end
$function$;

create or replace function public.rider_list_delivery_jobs_v3()
returns table(
  delivery_job_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  status text,
  payment_method text,
  payment_status text,
  grand_total_kes numeric,
  admin_notes text,
  rider_notes text,
  cod_payment_required boolean,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  arrived_sorting_center_at timestamptz,
  sorting_received_at timestamptz,
  ready_for_dispatch_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  seller_pickups jsonb
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from public.leogo_staff ls
    where ls.user_id=(select auth.uid())
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  return query
  select
    d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,
    o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    d.status,o.payment_method,o.payment_status,o.grand_total_kes,
    d.admin_notes,d.rider_notes,
    (o.payment_method='cod' and o.payment_status not in ('cod_paid','verified_paid')) as cod_payment_required,
    d.assigned_at,d.picked_up_at,d.arrived_sorting_center_at,d.sorting_received_at,
    d.ready_for_dispatch_at,d.on_the_way_at,d.delivered_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id',so.seller_id,
        'seller_name',s.business_name,
        'seller_phone',s.phone,
        'seller_location',concat_ws(', ',
          nullif(s.location_details,''),
          nullif(s.town,''),
          nullif(s.sub_county,''),
          nullif(s.county,'')
        ),
        'seller_latitude',s.shop_latitude,
        'seller_longitude',s.shop_longitude,
        'seller_map_link',coalesce(
          nullif(s.shop_map_link,''),
          case when s.shop_latitude is not null and s.shop_longitude is not null
            then 'https://www.google.com/maps?q='||s.shop_latitude::text||','||s.shop_longitude::text
            else null end
        ),
        'fulfilment_status',so.fulfilment_status,
        'seller_subtotal_kes',so.seller_subtotal_kes,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id',i.product_id,
            'product_name',i.product_name,
            'variant_name',i.variant_name,
            'quantity',i.quantity,
            'measurement_unit',sp.measurement_unit
          ) order by i.created_at)
          from public.marketplace_order_items i
          left join public.seller_products sp on sp.id=i.product_id
          where i.order_id=o.id and i.seller_id=so.seller_id
        ),'[]'::jsonb)
      ) order by s.business_name)
      from public.marketplace_seller_orders so
      join public.seller_accounts s on s.user_id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb)
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  where d.rider_id=(select auth.uid())
  order by
    case d.status
      when 'assigned' then 0
      when 'picked_up' then 1
      when 'arrived_sorting_center' then 2
      when 'sorting_received' then 3
      when 'ready_for_dispatch' then 4
      when 'on_the_way' then 5
      when 'delivered_to_pickup_station' then 6
      when 'ready_for_pickup' then 7
      else 8
    end,
    o.created_at desc;
end
$function$;

drop function if exists public.pickup_partner_list_parcels();

create or replace function public.pickup_partner_list_parcels()
returns table(
  parcel_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  payment_method text,
  payment_status text,
  order_status text,
  parcel_status text,
  pickup_fee_kes numeric,
  grand_total_kes numeric,
  booked_at timestamptz,
  arrived_at timestamptz,
  received_at timestamptz,
  handed_over_at timestamptz,
  seller_names text,
  item_summary text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;

  return query
  select
    p.id,o.id,o.order_reference,o.receiver_name,o.contact_number,
    o.payment_method,o.payment_status,o.order_status,p.status,
    p.earnings_amount_kes,o.grand_total_kes,p.booked_at,p.arrived_at,p.received_at,p.handed_over_at,
    coalesce((
      select string_agg(distinct coalesce(sa.business_name,'Seller'),', ' order by coalesce(sa.business_name,'Seller'))
      from public.marketplace_seller_orders so
      left join public.seller_accounts sa on sa.user_id=so.seller_id
      where so.order_id=o.id
    ),'Seller'),
    coalesce((
      select string_agg(i.product_name||case when i.quantity<>1 then ' ×'||i.quantity::text else '' end,', ' order by i.created_at)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'Order items')
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where p.pickup_station_id=v_station
  order by
    case p.status
      when 'arrived_pending_receipt' then 0
      when 'received' then 1
      when 'booked' then 2
      when 'handed_over' then 3
      else 4
    end,
    coalesce(p.received_at,p.arrived_at,p.booked_at) desc;
end
$function$;

revoke all on function public.pickup_partner_list_parcels() from public,anon;
grant execute on function public.pickup_partner_list_parcels() to authenticated;

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
    'arrived_at',p.arrived_at,
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

create or replace function public.pickup_partner_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_account public.pickup_station_partner_accounts%rowtype;
  v_station public.pickup_stations%rowtype;
  v_month_start timestamptz := date_trunc('month',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_month_earned numeric := 0;
  v_total_earned numeric := 0;
  v_reserved numeric := 0;
  v_booked bigint := 0;
  v_pending_arrivals bigint := 0;
  v_received bigint := 0;
  v_today_received bigint := 0;
  v_today_handed bigint := 0;
  v_rate numeric := private.pickup_handled_parcel_earning();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_account
  from public.pickup_station_partner_accounts
  where user_id=v_uid;

  if not found then
    return jsonb_build_object('assigned',false);
  end if;

  select * into v_station
  from public.pickup_stations
  where id=v_account.pickup_station_id;

  select
    coalesce(sum(case when p.status='handed_over' then p.earnings_amount_kes else 0 end),0),
    coalesce(sum(case when p.status='handed_over' and p.handed_over_at>=v_month_start then p.earnings_amount_kes else 0 end),0),
    count(*) filter(where p.status='booked'),
    count(*) filter(where p.status='arrived_pending_receipt'),
    count(*) filter(where p.status='received'),
    count(*) filter(where p.received_at is not null and (p.received_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date),
    count(*) filter(where p.handed_over_at is not null and (p.handed_over_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date)
  into v_total_earned,v_month_earned,v_booked,v_pending_arrivals,v_received,v_today_received,v_today_handed
  from public.pickup_station_parcels p
  where p.pickup_station_id=v_account.pickup_station_id;

  select coalesce(sum(requested_amount_kes),0)
  into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id
    and status in ('pending','approved','paid');

  return jsonb_build_object(
    'assigned',true,
    'account',jsonb_build_object(
      'user_id',v_account.user_id,
      'display_name',v_account.display_name,
      'phone',v_account.phone,
      'status',v_account.status,
      'payout_method',v_account.payout_method,
      'payout_account_name',v_account.payout_account_name,
      'payout_phone',v_account.payout_phone,
      'payout_account_number',v_account.payout_account_number
    ),
    'station',to_jsonb(v_station),
    'handled_parcel_earning_kes',v_rate,
    'booked_parcels',v_booked,
    'pending_arrivals',v_pending_arrivals,
    'parcels_at_station',v_received,
    'received_today',v_today_received,
    'handed_over_today',v_today_handed,
    'month_earnings_kes',v_month_earned,
    'total_earnings_kes',v_total_earned,
    'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total_earned-v_reserved,0)
  );
end
$function$;

-- LEOGO Pickup Station transactional SMS policy:
-- SMS is sent only when the parcel arrives at the Pickup Station.
-- Existing email notifications remain unchanged for both arrival and ready-for-pickup stages.

drop trigger if exists pickup_station_sms_ready_for_pickup on public.pickup_station_parcels;

create or replace function private.enqueue_pickup_order_sms(
  p_order_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_station public.pickup_stations%rowtype;
  v_phone text;
  v_message text;
begin
  -- Product decision: customer SMS is arrival-only.
  if p_event_key <> 'pickup_station_arrived' then
    return;
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id;

  if not found or v_order.delivery_zone<>'pickup' or v_order.pickup_station_id is null then
    return;
  end if;

  select * into v_station
  from public.pickup_stations
  where id=v_order.pickup_station_id;

  v_phone := nullif(btrim(coalesce(v_order.contact_number,'')),'');
  if v_phone is null then
    select coalesce(
      nullif(btrim(p.phone),''),
      nullif(btrim(u.phone),''),
      nullif(btrim(u.raw_user_meta_data->>'phone'),'')
    )
    into v_phone
    from auth.users u
    left join public.customer_profiles p on p.user_id=u.id
    where u.id=v_order.customer_id;
  end if;

  if v_phone is null then
    return;
  end if;

  v_message :=
    'LEOGO: Parcel '||v_order.order_reference||
    ' has arrived at '||coalesce(v_station.station_name,'the Pickup Station')||
    '. Please wait for the ready-for-pickup email before collection.';

  insert into public.order_sms_outbox(
    order_id,event_key,recipient_phone,recipient_name,message,status
  )
  values(
    v_order.id,'pickup_station_arrived',v_phone,v_order.receiver_name,v_message,'pending'
  )
  on conflict (order_id,event_key) where order_id is not null do nothing;
exception when others then
  -- Never block delivery / station status changes because of SMS infrastructure.
  return;
end
$function$;

revoke all on function private.enqueue_pickup_order_sms(uuid,text) from public, anon, authenticated;

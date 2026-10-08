-- LEOGO Pickup Station SMS hotfix.
-- 1) Allow the server-side SMS worker to read/update its private outbox jobs.
-- 2) Always use the immutable shipping/contact number captured on the order.
-- Customer/partner clients remain unable to access the SMS outbox.

grant select, update on table public.order_sms_outbox to service_role;
revoke all on table public.order_sms_outbox from anon, authenticated;

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

  -- Use only the shipping/contact phone captured on the order at checkout.
  -- Do not fall back to profile/Auth phone because that may differ from
  -- the recipient selected for this delivery.
  v_phone := nullif(btrim(coalesce(v_order.contact_number,'')),'');

  if v_phone is null then
    return;
  end if;

  v_message :=
    'LEOGO: Parcel '||v_order.order_reference||
    ' has arrived at '||coalesce(v_station.station_name,'the Pickup Station')||
    '. Check your LEOGO order updates for collection status.';

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

revoke all on function private.enqueue_pickup_order_sms(uuid,text)
from public, anon, authenticated;

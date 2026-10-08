-- LEOGO Pickup Station SMS policy: send one SMS when the station has received
-- the parcel and it is ready for customer collection. Include the station name,
-- address and phone number, and always use the shipping contact captured on the order.

drop trigger if exists marketplace_delivery_sms_pickup_arrival on public.marketplace_delivery_jobs;

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
  v_station_address text;
  v_station_phone text;
  v_message text;
begin
  -- Send the customer SMS only when the Pickup Station confirms receipt.
  if p_event_key <> 'pickup_station_ready' then
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
    return;
  end if;

  v_station_address := nullif(btrim(coalesce(
    v_station.address_line,
    concat_ws(', ',v_station.door_number,v_station.landmark,v_station.town,v_station.sub_county,v_station.county)
  )),'');

  v_station_phone := nullif(btrim(coalesce(v_station.contact_phone,'')),'');

  v_message :=
    'LEOGO: Your parcel '||v_order.order_reference||
    ' has arrived at '||coalesce(v_station.station_name,'the Pickup Station')||
    case when v_station_address is not null then ', '||v_station_address else '' end||
    case when v_station_phone is not null then '. Tel '||v_station_phone else '' end||
    '. It is ready for collection.';

  insert into public.order_sms_outbox(
    order_id,event_key,recipient_phone,recipient_name,message,status
  )
  values(
    v_order.id,'pickup_station_ready',v_phone,v_order.receiver_name,v_message,'pending'
  )
  on conflict (order_id,event_key) where order_id is not null do nothing;
exception when others then
  -- Never block Pickup Station receipt because SMS infrastructure failed.
  return;
end
$function$;

revoke all on function private.enqueue_pickup_order_sms(uuid,text)
from public,anon,authenticated;

create or replace function private.enqueue_sms_when_station_receives_parcel()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='received'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_pickup_order_sms(new.order_id,'pickup_station_ready');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

revoke all on function private.enqueue_sms_when_station_receives_parcel()
from public,anon,authenticated;

drop trigger if exists pickup_station_sms_ready_for_pickup on public.pickup_station_parcels;
create trigger pickup_station_sms_ready_for_pickup
after update of status on public.pickup_station_parcels
for each row
execute function private.enqueue_sms_when_station_receives_parcel();

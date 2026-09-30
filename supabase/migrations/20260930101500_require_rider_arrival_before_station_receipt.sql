-- Enforce the Rider -> Pickup Station Partner handoff sequence at the database layer.
create or replace function private.enforce_pickup_station_receipt_sequence()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='received'
     and old.status<>'arrived_pending_receipt'
     and not private.is_leogo_admin('delivery.manage') then
    raise exception 'Rider delivery to the Pickup Station must be recorded before station receipt can be confirmed';
  end if;
  return new;
end
$function$;

drop trigger if exists pickup_station_receipt_sequence_guard
on public.pickup_station_parcels;

create trigger pickup_station_receipt_sequence_guard
before update of status
on public.pickup_station_parcels
for each row
execute function private.enforce_pickup_station_receipt_sequence();

-- Admin read-only Pickup Station handover evidence for marketplace order details.
-- This is deliberately separate from the existing order-detail RPC so the locked
-- order/payment/rider workflow remains unchanged.

create or replace function public.admin_get_pickup_handover_evidence(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'parcel_id',p.id,
    'order_id',p.order_id,
    'pickup_station_id',p.pickup_station_id,
    'pickup_station_name',s.station_name,
    'parcel_reference',p.parcel_reference,
    'parcel_status',p.status,
    'handed_over_at',p.handed_over_at,
    'handover_photo_path',p.handover_photo_path,
    'handover_evidence_available',p.handover_photo_path is not null
  )
  into v_result
  from public.pickup_station_parcels p
  left join public.pickup_stations s on s.id=p.pickup_station_id
  where p.order_id=p_order_id
  order by p.booked_at desc
  limit 1;

  return v_result;
end
$function$;

revoke all on function public.admin_get_pickup_handover_evidence(uuid) from public,anon;
grant execute on function public.admin_get_pickup_handover_evidence(uuid) to authenticated;

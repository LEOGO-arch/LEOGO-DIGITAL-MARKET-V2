-- Quick Admin shipping-fee control that does not require editing station coordinates.
CREATE OR REPLACE FUNCTION public.admin_update_pickup_station_shipping_fee(p_station_id uuid, p_shipping_fee_kes numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not (
    private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('fees.manage')
    or private.is_leogo_admin('settings.manage')
  ) then
    raise exception 'Pickup Station shipping fee permission required';
  end if;

  if p_shipping_fee_kes is null or p_shipping_fee_kes<0 then
    raise exception 'Shipping fee must be zero or above';
  end if;

  select to_jsonb(s) into v_before
  from public.pickup_stations s
  where s.id=p_station_id
  for update;

  if v_before is null then
    raise exception 'Pickup Station not found';
  end if;

  update public.pickup_stations
  set shipping_fee_kes=round(p_shipping_fee_kes,2),
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=p_station_id
  returning to_jsonb(pickup_stations.*) into v_after;

  perform private.write_admin_audit(
    'pickup_station.shipping_fee_updated',
    'pickup_station',
    p_station_id::text,
    v_before,
    v_after,
    jsonb_build_object('shipping_fee_kes',round(p_shipping_fee_kes,2))
  );

  return v_after;
end
$function$;

revoke all on function public.admin_update_pickup_station_shipping_fee(uuid,numeric) from public,anon;
grant execute on function public.admin_update_pickup_station_shipping_fee(uuid,numeric) to authenticated;

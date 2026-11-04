-- Atomically update delivery fees and delivery-time settings.
-- Calling both existing RPCs inside one PostgreSQL function guarantees rollback on either error.
create function public.admin_update_delivery_rates_and_eta(
  p_cbd_fee_kes numeric,
  p_estate_fee_kes numeric,
  p_outside_town_fee_kes numeric,
  p_standard_max_weight_kg numeric,
  p_standard_max_area_sqm numeric,
  p_rate_note text,
  p_eta_values jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_rates jsonb;
begin
  -- Authorization and validation remain in the established fee/ETA RPCs.
  -- An exception in either RPC rolls back both operations in this call.
  v_rates := public.admin_update_delivery_rate_settings(
    p_cbd_fee_kes, p_estate_fee_kes, p_outside_town_fee_kes,
    p_standard_max_weight_kg, p_standard_max_area_sqm, p_rate_note
  );
  perform public.admin_set_delivery_eta_settings(p_eta_values);
  return v_rates;
end;
$$;
revoke all on function public.admin_update_delivery_rates_and_eta(numeric,numeric,numeric,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.admin_update_delivery_rates_and_eta(numeric,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

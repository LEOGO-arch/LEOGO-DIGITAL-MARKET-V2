-- Keep the established marketplace order workflow intact while replacing only
-- its hard-coded service-fee and COD thresholds with Admin-controlled settings.
do $block$
declare
  v_def text;
  v_original_service text := 'v_service:=round(v_subtotal * case when v_subtotal>=3000 then 0.015 else 0.02 end,2);';
  v_live_service text := 'v_service:=round(v_subtotal * case when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000) then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100 else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100 end,2);';
  v_original_total text := 'v_total:=v_subtotal+v_service+v_pickup+v_delivery;';
  v_live_total text := 'v_total:=v_subtotal+v_service+v_pickup+v_delivery;'||chr(10)||
    '  if p_payment_method=''cod'' and v_total>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then'||chr(10)||
    '    raise exception ''Cash on Delivery is available only below KSh %'',coalesce((select cod_limit_kes from public.order_settings where id=1),10000);'||chr(10)||
    '  end if;';
begin
  select pg_get_functiondef(
    'public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure
  ) into v_def;

  if position(v_original_service in v_def)=0 then
    raise exception 'Marketplace order service-fee calculation anchor was not found';
  end if;
  if position(v_original_total in v_def)=0 then
    raise exception 'Marketplace order total calculation anchor was not found';
  end if;

  v_def:=replace(v_def,v_original_service,v_live_service);
  v_def:=replace(v_def,v_original_total,v_live_total);
  execute v_def;
end
$block$;

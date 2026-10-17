-- The Phase 4 scheduled monitor has its own subtotal calculation separate
-- from Admin's manual diagnosis. Reuse the canonical diagnostic-only
-- calculation: Seller item rows OR Assisted Shopping prepared quote items.
do $patch$
declare
  v_definition text;
  v_before text := $old$
  select count(*) into v_count
  from public.marketplace_orders o
  where abs(
    coalesce(o.items_subtotal_kes,0)
    -coalesce((
      select sum(i.line_total_kes)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),0)
  )>0.01;
$old$;
  v_after text := $new$
  select count(*) into v_count
  from public.marketplace_orders o
  join private.diagnostic_marketplace_order_item_totals() t on t.order_id=o.id
  where abs(coalesce(o.items_subtotal_kes,0)-coalesce(t.item_total_kes,0))>0.01;
$new$;
begin
  select pg_get_functiondef('private.system_monitoring_checks()'::regprocedure)
  into v_definition;
  if position(v_after in v_definition)>0 then return; end if;
  if position(v_before in v_definition)=0 then
    raise exception 'Scheduled monitoring order subtotal query has changed; review before replacing';
  end if;
  execute replace(v_definition,v_before,v_after);
end
$patch$;
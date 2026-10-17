-- Diagnostic-only correction. Seller items and Assisted Shopping prepared quote
-- lines are separate, valid immutable order sources. Never update paid totals.
create or replace function private.diagnostic_marketplace_order_item_totals()
returns table(order_id uuid,item_total_kes numeric)
language sql stable set search_path to ''
as $totals$
  select o.id,
    case
      when exists(select 1 from public.marketplace_order_items i where i.order_id=o.id)
        then coalesce((select sum(i.line_total_kes) from public.marketplace_order_items i where i.order_id=o.id),0)
      when a.id is not null
        then coalesce((select sum(i.line_total_kes)
          from public.assisted_shopping_quote_items i
          where i.request_id=a.id and i.prepared_quantity>0 and i.line_total_kes>0),0)
      else 0
    end::numeric as item_total_kes
  from public.marketplace_orders o
  left join public.assisted_shopping_requests a on a.marketplace_order_id=o.id
$totals$;
revoke all on function private.diagnostic_marketplace_order_item_totals() from public,anon,authenticated;

do $patch$
declare
  v_diagnosis text;
  v_details text;
  v_before text := 'execute ''select count(*) from public.marketplace_orders o left join (select order_id,sum(line_total_kes) total from public.marketplace_order_items group by order_id) i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.total,0))>0.01''';
  v_after text := 'select count(*) from public.marketplace_orders o join private.diagnostic_marketplace_order_item_totals() i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.item_total_kes,0))>0.01';
  v_old_total text := 'coalesce((select sum(i.line_total_kes) from public.marketplace_order_items i where i.order_id=o.id),0)';
  v_new_total text := 'coalesce((select t.item_total_kes from private.diagnostic_marketplace_order_item_totals() t where t.order_id=o.id),0)';
begin
  select pg_get_functiondef('public.admin_run_system_diagnosis(text,text,text)'::regprocedure) into v_diagnosis;
  if position(v_before in v_diagnosis)=0 then
    if position('private.diagnostic_marketplace_order_item_totals()' in v_diagnosis)=0 then
      raise exception 'Subtotal scan source changed. Review before installing diagnostic fix';
    end if;
  else
    -- Keep the existing INTO target from the original dynamic EXECUTE clause.
    v_diagnosis:=replace(v_diagnosis,v_before,
      'select count(*) into v_count from public.marketplace_orders o join private.diagnostic_marketplace_order_item_totals() i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.item_total_kes,0))>0.01');
    -- The previous EXECUTE statement has a separate INTO v_count; remove it.
    v_diagnosis:=replace(v_diagnosis,
      'select count(*) into v_count from public.marketplace_orders o join private.diagnostic_marketplace_order_item_totals() i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.item_total_kes,0))>0.01'||E'\n    into v_count;',
      'select count(*) into v_count from public.marketplace_orders o join private.diagnostic_marketplace_order_item_totals() i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.item_total_kes,0))>0.01;');
    execute v_diagnosis;
  end if;

  select pg_get_functiondef('private.system_diagnostic_finding_data(text,integer)'::regprocedure) into v_details;
  if position(v_old_total in v_details)=0 then
    if position(v_new_total in v_details)=0 then
      raise exception 'Diagnostic finding details source changed. Review before installing fix';
    end if;
  else
    v_details:=replace(v_details,v_old_total,v_new_total);
    execute v_details;
  end if;
end
$patch$;
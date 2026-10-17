-- Include existing Assisted Shopping quote items in the same Admin order-detail
-- response used by the order page, A6/80mm receipt and download summary.
-- Prefer ordinary marketplace_order_items when present; never duplicate rows.
do $patch$
declare
  v_existing text;
  v_updated text;
  v_anchor text := $anchor$where i.order_id=o.id
    ),'[]'::jsonb),
    'sellers'$anchor$;
  v_replacement text := $replacement$where i.order_id=o.id
    ),(
      select jsonb_agg(jsonb_build_object(
        'id',qi.id,
        'seller_id',null,'seller_name','LEOGO Assisted Shopping',
        'product_id',null,'product_name',qi.item_name,
        'variant_id',null,'variant_name',null,
        'variant_image_path',null,'product_image_path',null,
        'unit_price_kes',qi.unit_price_kes,
        'quantity',qi.prepared_quantity,
        'line_total_kes',qi.line_total_kes,
        'measurement_unit',qi.unit_label
      ) order by qi.sort_order,qi.created_at)
      from public.assisted_shopping_requests ar
      join public.assisted_shopping_quote_items qi on qi.request_id=ar.id
      where ar.marketplace_order_id=o.id
        and coalesce(qi.prepared_quantity,0)>0
        and coalesce(qi.line_total_kes,0)>0
    ),'[]'::jsonb),
    'sellers'$replacement$;
begin
  select pg_get_functiondef('public.admin_get_marketplace_order_detail(uuid)'::regprocedure)
    into v_existing;
  if v_existing is null then
    raise exception 'Required Admin order detail function missing';
  end if;
  if position('public.assisted_shopping_quote_items qi' in v_existing)>0 then
    return;
  end if;
  if position(v_anchor in v_existing)=0 then
    raise exception 'Admin order item aggregation changed; review required before applying';
  end if;
  v_updated:=replace(v_existing,v_anchor,v_replacement);
  execute v_updated;
end
$patch$;

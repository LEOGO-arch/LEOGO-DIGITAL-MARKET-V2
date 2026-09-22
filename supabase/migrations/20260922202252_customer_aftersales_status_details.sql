
create or replace function public.customer_list_marketplace_orders_v2()
returns table(
  id uuid,
  order_reference text,
  created_at timestamptz,
  receiver_name text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  items_subtotal_kes numeric,
  service_fee_kes numeric,
  pickup_fee_kes numeric,
  delivery_fee_kes numeric,
  grand_total_kes numeric,
  payment_method text,
  payment_status text,
  payment_verified_at timestamptz,
  order_status text,
  delivered_at timestamptz,
  items jsonb,
  seller_fulfilments jsonb,
  delivery_status text,
  rider_name text,
  rider_phone text,
  delivery_assigned_at timestamptz,
  delivery_picked_up_at timestamptz,
  arrived_sorting_center_at timestamptz,
  sorting_received_at timestamptz,
  ready_for_dispatch_at timestamptz,
  on_the_way_at timestamptz,
  delivery_delivered_at timestamptz,
  review jsonb,
  aftersales_case jsonb
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  return query
  select
    o.id,o.order_reference,o.created_at,o.receiver_name,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,
    o.items_subtotal_kes,o.service_fee_kes,o.pickup_fee_kes,o.delivery_fee_kes,o.grand_total_kes,
    o.payment_method,o.payment_status,o.payment_verified_at,o.order_status,o.delivered_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name',i.product_name,
        'variant_name',i.variant_name,
        'variant_id',i.variant_id,
        'variant_image_path',i.variant_image_path,
        'quantity',i.quantity,
        'unit_price_kes',i.unit_price_kes,
        'line_total_kes',i.line_total_kes,
        'seller_id',i.seller_id
      ) order by i.created_at)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id',so.seller_id,
        'seller_name',s.business_name,
        'fulfilment_status',so.fulfilment_status,
        'seller_subtotal_kes',so.seller_subtotal_kes,
        'received_at',so.received_at,
        'packed_ready_at',so.packed_ready_at,
        'handed_to_rider_at',so.handed_to_rider_at,
        'delivered_at',so.delivered_at
      ) order by s.business_name)
      from public.marketplace_seller_orders so
      join public.seller_accounts s on s.user_id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb),
    d.status,rs.display_name,rs.phone,
    d.assigned_at,d.picked_up_at,d.arrived_sorting_center_at,d.sorting_received_at,
    d.ready_for_dispatch_at,d.on_the_way_at,d.delivered_at,
    (
      select jsonb_build_object(
        'id',r.id,'rating',r.rating,'comment',r.comment,
        'created_at',r.created_at,'updated_at',r.updated_at
      )
      from public.marketplace_order_reviews r
      where r.order_id=o.id and r.customer_id=(select auth.uid())
    ),
    (
      select jsonb_build_object(
        'id',c.id,
        'case_reference',c.case_reference,
        'status',c.status,
        'issue_type',c.issue_type,
        'preferred_solution',c.preferred_solution,
        'details',c.details,
        'admin_notes',c.admin_notes,
        'created_at',c.created_at,
        'updated_at',c.updated_at,
        'resolved_at',c.resolved_at
      )
      from public.marketplace_aftersales_cases c
      where c.order_id=o.id and c.customer_id=(select auth.uid())
      order by c.created_at desc
      limit 1
    )
  from public.marketplace_orders o
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  left join public.leogo_staff rs on rs.user_id=d.rider_id
  where o.customer_id=(select auth.uid())
  order by o.created_at desc;
end
$function$;

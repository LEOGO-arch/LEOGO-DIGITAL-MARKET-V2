-- Admin Orders detail control screen backend.

create or replace function public.admin_get_marketplace_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id',o.id,
      'order_reference',o.order_reference,
      'customer_id',o.customer_id,
      'customer_email',cu.email,
      'receiver_name',o.receiver_name,
      'contact_number',o.contact_number,
      'delivery_zone',o.delivery_zone,
      'county',o.county,
      'sub_county',o.sub_county,
      'estate',o.estate,
      'landmark',o.landmark,
      'location_link',o.location_link,
      'pickup_station_id',o.pickup_station_id,
      'pickup_station_name',ps.station_name,
      'pickup_station_address',concat_ws(', ',nullif(ps.address_line,''),nullif(ps.town,''),nullif(ps.sub_county,''),nullif(ps.county,'')),
      'items_subtotal_kes',o.items_subtotal_kes,
      'service_fee_kes',o.service_fee_kes,
      'pickup_fee_kes',o.pickup_fee_kes,
      'delivery_fee_kes',o.delivery_fee_kes,
      'grand_total_kes',o.grand_total_kes,
      'payment_method',o.payment_method,
      'payment_status',o.payment_status,
      'payment_message',o.payment_message,
      'payment_verified_at',o.payment_verified_at,
      'payment_verified_by',o.payment_verified_by,
      'payment_verified_by_name',au.display_name,
      'order_status',o.order_status,
      'created_at',o.created_at,
      'updated_at',o.updated_at,
      'delivered_at',o.delivered_at
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,
        'seller_id',i.seller_id,
        'seller_name',sa.business_name,
        'product_id',i.product_id,
        'product_name',i.product_name,
        'variant_id',i.variant_id,
        'variant_name',i.variant_name,
        'variant_image_path',i.variant_image_path,
        'product_image_path',sp.main_image_path,
        'unit_price_kes',i.unit_price_kes,
        'quantity',i.quantity,
        'line_total_kes',i.line_total_kes,
        'measurement_unit',sp.measurement_unit
      ) order by i.created_at)
      from public.marketplace_order_items i
      left join public.seller_accounts sa on sa.user_id=i.seller_id
      left join public.seller_products sp on sp.id=i.product_id
      where i.order_id=o.id
    ),'[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_order_id',so.id,
        'seller_id',so.seller_id,
        'business_name',sa.business_name,
        'owner_name',sa.owner_name,
        'seller_phone',sa.phone,
        'seller_email',su.email,
        'seller_location',concat_ws(', ',
          nullif(sa.location_details,''),
          nullif(sa.town,''),
          nullif(sa.sub_county,''),
          nullif(sa.county,'')
        ),
        'seller_subtotal_kes',so.seller_subtotal_kes,
        'fulfilment_status',so.fulfilment_status,
        'received_at',so.received_at,
        'packed_ready_at',so.packed_ready_at,
        'handed_to_rider_at',so.handed_to_rider_at,
        'delivered_at',so.delivered_at,
        'updated_at',so.updated_at
      ) order by sa.business_name)
      from public.marketplace_seller_orders so
      left join public.seller_accounts sa on sa.user_id=so.seller_id
      left join auth.users su on su.id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb),
    'delivery', case when d.id is null then null else jsonb_build_object(
      'delivery_job_id',d.id,
      'status',d.status,
      'rider_id',d.rider_id,
      'rider_name',r.display_name,
      'rider_phone',r.phone,
      'vehicle_type',r.vehicle_type,
      'vehicle_registration',r.vehicle_registration,
      'assigned_at',d.assigned_at,
      'assigned_by',d.assigned_by,
      'picked_up_at',d.picked_up_at,
      'on_the_way_at',d.on_the_way_at,
      'delivered_at',d.delivered_at,
      'rider_notes',d.rider_notes,
      'admin_notes',d.admin_notes,
      'updated_at',d.updated_at
    ) end
  )
  into v_result
  from public.marketplace_orders o
  left join auth.users cu on cu.id=o.customer_id
  left join public.pickup_stations ps on ps.id=o.pickup_station_id
  left join public.admin_users au on au.user_id=o.payment_verified_by
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  left join public.leogo_staff r on r.user_id=d.rider_id
  where o.id=p_order_id;

  if v_result is null then raise exception 'Order not found'; end if;
  return v_result;
end $$;

revoke execute on function public.admin_get_marketplace_order_detail(uuid) from public;
grant execute on function public.admin_get_marketplace_order_detail(uuid) to authenticated;

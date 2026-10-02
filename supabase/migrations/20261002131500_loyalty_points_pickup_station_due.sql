-- LEOGO Loyalty & Rewards V2.2
-- Pickup Station partners must see/collect only the external amount due after
-- LEOGO Points have been applied.

create or replace function public.pickup_partner_lookup_parcel(p_code text)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_result jsonb;
begin
  select jsonb_build_object(
    'parcel_id',p.id,
    'order_id',o.id,
    'order_reference',o.order_reference,
    'customer_name',o.receiver_name,
    'customer_phone',o.contact_number,
    'payment_method',o.payment_method,
    'payment_status',o.payment_status,
    'grand_total_kes',o.grand_total_kes,
    'reward_points_redeemed_kes',o.reward_points_redeemed_kes,
    'external_amount_due_kes',o.external_amount_due_kes,
    'parcel_status',p.status,
    'booked_at',p.booked_at,
    'arrived_at',p.arrived_at,
    'received_at',p.received_at,
    'handed_over_at',p.handed_over_at,
    'receive_photo_captured',p.receive_photo_path is not null,
    'handover_photo_captured',p.handover_photo_path is not null,
    'handover_id_recorded',p.handover_customer_id_number is not null,
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object('name',i.product_name,'variant',i.variant_name,'quantity',i.quantity)
        order by i.created_at
      )
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'[]'::jsonb)
  )
  into v_result
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where o.id=v_order_id;

  return v_result;
end
$function$;

revoke execute on function public.pickup_partner_lookup_parcel(text) from public,anon;
grant execute on function public.pickup_partner_lookup_parcel(text) to authenticated;

create or replace function public.pickup_partner_list_parcels_v2()
returns table(
  parcel_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  payment_method text,
  payment_status text,
  order_status text,
  parcel_status text,
  pickup_fee_kes numeric,
  grand_total_kes numeric,
  reward_points_redeemed_kes numeric,
  external_amount_due_kes numeric,
  booked_at timestamptz,
  arrived_at timestamptz,
  received_at timestamptz,
  handed_over_at timestamptz,
  seller_names text,
  item_summary text
)
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;

  return query
  select
    p.id,o.id,o.order_reference,o.receiver_name,o.contact_number,
    o.payment_method,o.payment_status,o.order_status,p.status,
    p.earnings_amount_kes,o.grand_total_kes,
    o.reward_points_redeemed_kes,o.external_amount_due_kes,
    p.booked_at,p.arrived_at,p.received_at,p.handed_over_at,
    coalesce((
      select string_agg(distinct coalesce(sa.business_name,'Seller'),', ' order by coalesce(sa.business_name,'Seller'))
      from public.marketplace_seller_orders so
      left join public.seller_accounts sa on sa.user_id=so.seller_id
      where so.order_id=o.id
    ),'Seller'),
    coalesce((
      select string_agg(i.product_name||case when i.quantity<>1 then ' ×'||i.quantity::text else '' end,', ' order by i.created_at)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'Order items')
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where p.pickup_station_id=v_station
  order by
    case p.status
      when 'arrived_pending_receipt' then 0
      when 'received' then 1
      when 'booked' then 2
      when 'handed_over' then 3
      else 4
    end,
    coalesce(p.received_at,p.arrived_at,p.booked_at) desc;
end
$function$;

revoke execute on function public.pickup_partner_list_parcels_v2() from public,anon;
grant execute on function public.pickup_partner_list_parcels_v2() to authenticated;

-- LEOGO Admin Pickup Station parcel register.
-- Exposes the existing station parcel lifecycle to authorized Admin roles so
-- every station can be reviewed/exported without changing partner workflows.
create index if not exists pickup_station_parcels_admin_booked_idx
  on public.pickup_station_parcels (booked_at desc, id desc);

create or replace function public.admin_list_pickup_station_parcels(
  p_limit integer default 500,
  p_before_booked_at timestamptz default null,
  p_before_id uuid default null
)
returns table(
  parcel_id uuid,
  order_id uuid,
  pickup_station_id uuid,
  station_name text,
  parcel_reference text,
  parcel_status text,
  order_reference text,
  customer_name text,
  customer_phone text,
  payment_method text,
  payment_status text,
  order_status text,
  item_summary text,
  seller_names text,
  pickup_fee_kes numeric,
  grand_total_kes numeric,
  booked_at timestamptz,
  arrived_at timestamptz,
  received_at timestamptz,
  handed_over_at timestamptz,
  days_to_arrival integer,
  days_waiting_to_receive integer,
  days_to_handover integer,
  receive_photo_captured boolean,
  handover_photo_captured boolean,
  received_by_email text,
  handed_over_by_email text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not (
    private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('orders.read')
  ) then
    raise exception 'Admin access required';
  end if;

  if (p_before_booked_at is null) <> (p_before_id is null) then
    raise exception 'Both parcel cursor values must be supplied together';
  end if;

  return query
  select
    p.id,
    o.id,
    p.pickup_station_id,
    s.station_name,
    p.parcel_reference,
    p.status,
    o.order_reference,
    o.receiver_name,
    o.contact_number,
    o.payment_method,
    o.payment_status,
    o.order_status,
    coalesce((
      select string_agg(
        concat(
          i.product_name,
          case when nullif(i.variant_name,'') is null then '' else ' — '||i.variant_name end,
          case when i.quantity<>1 then ' ×'||i.quantity::text else '' end
        ),
        ', ' order by i.created_at
      )
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'Order items'),
    coalesce((
      select string_agg(distinct coalesce(sa.business_name,'Seller'),', ' order by coalesce(sa.business_name,'Seller'))
      from public.marketplace_seller_orders so
      left join public.seller_accounts sa on sa.user_id=so.seller_id
      where so.order_id=o.id
    ),'Seller'),
    o.pickup_fee_kes,
    o.grand_total_kes,
    p.booked_at,
    p.arrived_at,
    p.received_at,
    p.handed_over_at,
    case
      when p.arrived_at is not null then greatest(0,floor(extract(epoch from (p.arrived_at-p.booked_at))/86400))::integer
      when p.status='booked' then greatest(0,floor(extract(epoch from (now()-p.booked_at))/86400))::integer
      else null
    end,
    case
      when p.arrived_at is null then null
      when p.received_at is not null then greatest(0,floor(extract(epoch from (p.received_at-p.arrived_at))/86400))::integer
      when p.status='arrived_pending_receipt' then greatest(0,floor(extract(epoch from (now()-p.arrived_at))/86400))::integer
      else null
    end,
    case
      when p.received_at is null then null
      when p.handed_over_at is not null then greatest(0,floor(extract(epoch from (p.handed_over_at-p.received_at))/86400))::integer
      when p.status='received' then greatest(0,floor(extract(epoch from (now()-p.received_at))/86400))::integer
      else null
    end,
    p.receive_photo_path is not null,
    p.handover_photo_path is not null,
    received_user.email::text,
    handed_over_user.email::text
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  join public.pickup_stations s on s.id=p.pickup_station_id
  left join auth.users received_user on received_user.id=p.received_by
  left join auth.users handed_over_user on handed_over_user.id=p.handed_over_by
  where p_before_booked_at is null
     or (p.booked_at,p.id)<(p_before_booked_at,p_before_id)
  order by p.booked_at desc,p.id desc
  limit greatest(1,least(coalesce(p_limit,500),500));
end
$function$;

revoke all on function public.admin_list_pickup_station_parcels(integer,timestamptz,uuid) from public,anon;
grant execute on function public.admin_list_pickup_station_parcels(integer,timestamptz,uuid) to authenticated;

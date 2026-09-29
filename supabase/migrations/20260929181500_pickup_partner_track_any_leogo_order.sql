-- Allow an active Pickup Station Partner to track any LEOGO marketplace order
-- without exposing customer identity, phone, address, item, or payment details.
-- Full reference, UUID, or an unambiguous last 4+ reference suffix can be used.

create or replace function private.pickup_resolve_any_order_for_tracking(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_code text := btrim(coalesce(p_code,''));
  v_compact text;
  v_id uuid;
  v_matches uuid[];
begin
  if private.pickup_partner_station_id() is null then
    raise exception 'Active Pickup Station Partner access required';
  end if;

  if v_code='' then
    raise exception 'Enter an order / tracking number';
  end if;

  select o.id
  into v_id
  from public.marketplace_orders o
  where upper(o.order_reference)=upper(v_code)
     or (
       v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and o.id=v_code::uuid
     )
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_compact := regexp_replace(upper(v_code),'[^A-Z0-9]','','g');
  if char_length(v_compact)<4 then
    raise exception 'Enter the full order number or at least the last 4 characters';
  end if;

  select array_agg(o.id order by o.created_at desc)
  into v_matches
  from public.marketplace_orders o
  where right(
    regexp_replace(upper(o.order_reference),'[^A-Z0-9]','','g'),
    char_length(v_compact)
  )=v_compact;

  if coalesce(array_length(v_matches,1),0)=0 then
    raise exception 'No LEOGO order matches that tracking number';
  end if;

  if array_length(v_matches,1)>1 then
    raise exception 'More than one LEOGO order matches those last characters. Enter more of the order number';
  end if;

  return v_matches[1];
end
$function$;

revoke all on function private.pickup_resolve_any_order_for_tracking(text) from public,anon;
grant execute on function private.pickup_resolve_any_order_for_tracking(text) to authenticated;

create or replace function public.pickup_partner_track_any_order(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_order_id uuid := private.pickup_resolve_any_order_for_tracking(p_code);
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_id',o.id,
    'order_reference',o.order_reference,
    'order_status',o.order_status,
    'created_at',o.created_at,
    'delivered_at',o.delivered_at,
    'delivery_zone',o.delivery_zone,
    'delivery_method',
      case
        when o.delivery_zone='pickup' then 'Pickup Station'
        when o.delivery_zone='cbd' then 'CBD Delivery'
        when o.delivery_zone='estate' then 'Estate Delivery'
        when o.delivery_zone in ('outside','outside_town') then 'Outside Town Delivery'
        else initcap(replace(coalesce(o.delivery_zone,'Delivery'),'_',' '))
      end,
    'delivery_status',
      coalesce(
        (
          select d.status
          from public.marketplace_delivery_jobs d
          where d.order_id=o.id
          order by d.created_at desc
          limit 1
        ),
        case
          when o.order_status='delivered' then 'delivered'
          else o.order_status
        end
      ),
    'pickup_parcel_status',
      (
        select p.status
        from public.pickup_station_parcels p
        where p.order_id=o.id
        limit 1
      ),
    'pickup_station',
      case
        when o.delivery_zone='pickup' and s.id is not null then
          jsonb_build_object(
            'id',s.id,
            'station_name',s.station_name,
            'town',s.town,
            'sub_county',s.sub_county,
            'county',s.county,
            'address_line',s.address_line,
            'landmark',s.landmark,
            'contact_phone',s.contact_phone,
            'operating_hours',s.operating_hours,
            'map_link',s.map_link,
            'is_active',s.is_active
          )
        else null
      end
  )
  into v_result
  from public.marketplace_orders o
  left join public.pickup_stations s on s.id=o.pickup_station_id
  where o.id=v_order_id;

  return v_result;
end
$function$;

revoke all on function public.pickup_partner_track_any_order(text) from public,anon;
grant execute on function public.pickup_partner_track_any_order(text) to authenticated;

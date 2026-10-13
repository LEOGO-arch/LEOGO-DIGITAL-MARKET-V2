create or replace function public.admin_aftersales_waybill_print_data(p_return_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v jsonb;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 select jsonb_build_object(
  'aftersales_number',c.case_reference,
  'item_name',coalesce(i.product_name,nullif(r.item_description,''),'Item not specified'),
  'customer_name',r.customer_name,
  'customer_phone',r.customer_phone,
  'station_name',s.station_name,
  'station_address',concat_ws(', ',nullif(s.address_line,''),nullif(s.town,''),nullif(s.sub_county,''),nullif(s.county,'')),
  'station_landmark',s.landmark,
  'station_phone',s.contact_phone,
  'receiving_date',(select min(e.created_at) from public.pickup_station_parcel_events e where e.return_parcel_id=r.id and e.event_type='received'),
  'assigned_rider_name',w.courier_name,
  'assigned_rider_phone',case when w.assignee_type='rider' then ls.phone when w.assignee_type='courier' then tp.phone else null end,
  'assigning_date',w.assigned_at
 ) into v
 from public.pickup_station_return_parcels r
 join public.marketplace_aftersales_cases c on c.id=r.aftersales_case_id
 join public.pickup_stations s on s.id=r.pickup_station_id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 left join public.aftersales_return_waybills w on w.return_id=r.id
 left join public.leogo_staff ls on w.assignee_type='rider' and ls.user_id=w.assignee_id
 left join public.transport_provider_accounts tp on w.assignee_type='courier' and tp.user_id=w.assignee_id
 where r.id=p_return_id;
 if v is null then raise exception 'Return parcel not found';end if;
 return v;
end;$fn$;
revoke all on function public.admin_aftersales_waybill_print_data(uuid) from public,anon;
grant execute on function public.admin_aftersales_waybill_print_data(uuid) to authenticated;
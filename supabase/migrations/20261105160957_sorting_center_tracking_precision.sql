create or replace function public.sorting_staff_list_parcels(p_center_id uuid,p_search text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_rows jsonb;
begin
  if not private.sorting_center_has_access(p_center_id,'read') then raise exception 'Sorting center access required'; end if;
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_rows from (
    select p.created_at,jsonb_build_object('parcel_id',p.id,'parcel_reference',p.parcel_reference,'status',p.status,'order_id',o.id,'order_reference',o.order_reference,'customer_reference',o.order_reference,'seller_order_id',p.seller_order_id,'seller_name',sa.business_name,'seller_phone',sa.phone,'customer_name',o.receiver_name,'customer_phone',o.contact_number,'county',o.county,'sub_county',o.sub_county,'estate',o.estate,'destination_center_id',p.destination_center_id,'destination_center_name',dc.center_name,'shipment_tracking_number',sh.tracking_number,'package_weight_kg',p.package_weight_kg,'booked_at',p.booked_at,'updated_at',p.updated_at,'last_received_at',(select max(e.created_at) from public.sorting_parcel_events e where e.parcel_id=p.id and e.event_type in ('center_received','shipment_received'))) row_data
    from public.sorting_parcels p join public.marketplace_orders o on o.id=p.order_id join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.seller_accounts sa on sa.user_id=so.seller_id left join public.sorting_centers dc on dc.id=p.destination_center_id left join public.sorting_shipments sh on sh.id=p.current_shipment_id
    where p.current_center_id=p_center_id and (nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',p.parcel_reference,o.order_reference,o.receiver_name,o.contact_number,sa.business_name,o.county,o.sub_county,sh.tracking_number) ilike '%'||btrim(p_search)||'%')
  ) x;
  return v_rows;
end
$function$;

create or replace function public.admin_sorting_center_operations(p_search text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return jsonb_build_object(
    'parcels',(select coalesce(jsonb_agg(jsonb_build_object('parcel_id',p.id,'parcel_reference',p.parcel_reference,'status',p.status,'order_reference',o.order_reference,'customer_reference',o.order_reference,'customer_name',o.receiver_name,'customer_phone',o.contact_number,'seller',sa.business_name,'county',o.county,'sub_county',o.sub_county,'origin_center',oc.center_name,'current_center',cc.center_name,'destination_center',dc.center_name,'shipment_tracking_number',sh.tracking_number,'booked_at',p.booked_at,'updated_at',p.updated_at) order by p.updated_at desc),'[]'::jsonb)
      from public.sorting_parcels p join public.marketplace_orders o on o.id=p.order_id join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.seller_accounts sa on sa.user_id=so.seller_id join public.sorting_centers oc on oc.id=p.origin_center_id left join public.sorting_centers cc on cc.id=p.current_center_id left join public.sorting_centers dc on dc.id=p.destination_center_id left join public.sorting_shipments sh on sh.id=p.current_shipment_id
      where nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',p.parcel_reference,o.order_reference,o.receiver_name,o.contact_number,sa.business_name,o.county,o.sub_county,oc.center_name,cc.center_name,dc.center_name,sh.tracking_number) ilike '%'||btrim(p_search)||'%'),
    'shipments',(select coalesce(jsonb_agg(jsonb_build_object('shipment_id',sh.id,'tracking_number',sh.tracking_number,'status',sh.status,'origin_center',o.center_name,'destination_center',d.center_name,'created_at',sh.created_at,'dispatched_at',sh.dispatched_at,'received_at',sh.received_at,'parcel_count',(select count(*) from public.sorting_shipment_parcels sp where sp.shipment_id=sh.id)) order by sh.created_at desc),'[]'::jsonb) from public.sorting_shipments sh join public.sorting_centers o on o.id=sh.origin_center_id join public.sorting_centers d on d.id=sh.destination_center_id where nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',sh.tracking_number,o.center_name,d.center_name) ilike '%'||btrim(p_search)||'%'),
    'diagnostics',(select jsonb_build_object('parcels_in_multiple_active_shipments',(select count(*) from (select parcel_id from public.sorting_shipment_parcels where is_active group by parcel_id having count(*)>1) q),'active_shipment_parcels_mismatched',(select count(*) from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id join public.sorting_shipments sh on sh.id=sp.shipment_id where sp.is_active and (p.current_shipment_id is distinct from sh.id or sh.status not in ('building','dispatched','in_transit'))),'stale_unreceived_bookings',(select count(*) from public.sorting_parcels where status in ('booked','seller_handed_over') and booked_at<now()-interval '48 hours'),'open_incidents',(select count(*) from public.sorting_parcel_incidents where status<>'resolved')))
  );
end
$function$;

create or replace function public.customer_list_sorting_order_tracking(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_rows jsonb;
begin
  if v_uid is null or not exists(select 1 from public.marketplace_orders where id=p_order_id and customer_id=v_uid) then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'created_at',e.created_at,'verified',e.verified,'from_center',fc.center_name,'to_center',tc.center_name,'shipment_tracking_number',sh.tracking_number,'route_estimated_hours',r.estimated_hours,'route_expected_at',case when e.event_type='shipment_dispatched' and r.estimated_hours is not null then e.created_at+(r.estimated_hours*interval '1 hour') else null end) order by e.created_at),'[]'::jsonb)
  into v_rows from public.sorting_parcel_events e left join public.sorting_centers fc on fc.id=e.from_center_id left join public.sorting_centers tc on tc.id=e.to_center_id left join public.sorting_shipments sh on sh.id=e.shipment_id left join public.sorting_center_routes r on r.origin_center_id=e.from_center_id and r.destination_center_id=e.to_center_id where e.order_id=p_order_id and e.verified and e.event_type not in ('booked','incident_reported');
  return jsonb_build_object('order_id',p_order_id,'events',v_rows);
end
$function$;

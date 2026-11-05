-- Read models for scoped staff operations, admin reporting and delivery diagnosis.
create or replace function public.sorting_staff_list_shipments(p_center_id uuid,p_status text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_rows jsonb;
begin
  if not private.sorting_center_has_access(p_center_id,'read') then raise exception 'Sorting center access required'; end if;
  select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb) into v_rows from (
    select sh.created_at,jsonb_build_object(
      'shipment_id',sh.id,'tracking_number',sh.tracking_number,'status',sh.status,
      'origin_center_id',sh.origin_center_id,'origin_center',o.center_name,
      'destination_center_id',sh.destination_center_id,'destination_center',d.center_name,
      'created_at',sh.created_at,'dispatched_at',sh.dispatched_at,'received_at',sh.received_at,
      'prepared_by',prep.display_name,'verified_by',ver.display_name,
      'assigned_transport_provider_id',sh.assigned_transport_provider_id,
      'parcel_count',(select count(*) from public.sorting_shipment_parcels sp where sp.shipment_id=sh.id),
      'parcels',(select coalesce(jsonb_agg(jsonb_build_object('parcel_id',p.id,'parcel_reference',p.parcel_reference,'order_reference',mo.order_reference,'seller',sa.business_name,'county',mo.county,'sub_county',mo.sub_county,'weight_kg',p.package_weight_kg) order by mo.order_reference),'[]'::jsonb)
        from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id join public.marketplace_orders mo on mo.id=p.order_id join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.seller_accounts sa on sa.user_id=so.seller_id where sp.shipment_id=sh.id)
    ) row_data
    from public.sorting_shipments sh join public.sorting_centers o on o.id=sh.origin_center_id join public.sorting_centers d on d.id=sh.destination_center_id
    left join public.leogo_staff prep on prep.user_id=sh.prepared_by left join public.leogo_staff ver on ver.user_id=sh.verified_by
    where (sh.origin_center_id=p_center_id or sh.destination_center_id=p_center_id) and (p_status is null or sh.status=p_status)
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
    'parcels',(select coalesce(jsonb_agg(jsonb_build_object('parcel_id',p.id,'parcel_reference',p.parcel_reference,'status',p.status,'order_reference',o.order_reference,'seller',sa.business_name,'county',o.county,'sub_county',o.sub_county,'origin_center',oc.center_name,'current_center',cc.center_name,'destination_center',dc.center_name,'shipment_tracking_number',sh.tracking_number,'booked_at',p.booked_at,'updated_at',p.updated_at) order by p.updated_at desc),'[]'::jsonb)
      from public.sorting_parcels p join public.marketplace_orders o on o.id=p.order_id join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.seller_accounts sa on sa.user_id=so.seller_id join public.sorting_centers oc on oc.id=p.origin_center_id left join public.sorting_centers cc on cc.id=p.current_center_id left join public.sorting_centers dc on dc.id=p.destination_center_id left join public.sorting_shipments sh on sh.id=p.current_shipment_id
      where nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',p.parcel_reference,o.order_reference,sa.business_name,o.county,o.sub_county,oc.center_name,cc.center_name,dc.center_name,sh.tracking_number) ilike '%'||btrim(p_search)||'%'),
    'shipments',(select coalesce(jsonb_agg(jsonb_build_object('shipment_id',sh.id,'tracking_number',sh.tracking_number,'status',sh.status,'origin_center',o.center_name,'destination_center',d.center_name,'created_at',sh.created_at,'dispatched_at',sh.dispatched_at,'received_at',sh.received_at,'parcel_count',(select count(*) from public.sorting_shipment_parcels sp where sp.shipment_id=sh.id)) order by sh.created_at desc),'[]'::jsonb) from public.sorting_shipments sh join public.sorting_centers o on o.id=sh.origin_center_id join public.sorting_centers d on d.id=sh.destination_center_id where nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',sh.tracking_number,o.center_name,d.center_name) ilike '%'||btrim(p_search)||'%'),
    'diagnostics',(select jsonb_build_object('parcels_in_multiple_active_shipments',(select count(*) from (select parcel_id from public.sorting_shipment_parcels where is_active group by parcel_id having count(*)>1) q),'active_shipment_parcels_mismatched',(select count(*) from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id join public.sorting_shipments sh on sh.id=sp.shipment_id where sp.is_active and (p.current_shipment_id is distinct from sh.id or sh.status not in ('building','dispatched','in_transit'))),'stale_unreceived_bookings',(select count(*) from public.sorting_parcels where status in ('booked','seller_handed_over') and booked_at<now()-interval '48 hours'),'open_incidents',(select count(*) from public.sorting_parcel_incidents where status<>'resolved')))
  );
end
$function$;

create or replace function private.notify_customer_sorting_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_customer uuid; v_center text; v_title text; v_message text; v_order_ref text;
begin
  if not new.verified or new.event_type not in ('center_received','sorted','shipment_dispatched','shipment_received','last_mile_assigned','out_for_delivery','delivered') then return new; end if;
  select customer_id,order_reference into v_customer,v_order_ref from public.marketplace_orders where id=new.order_id;
  if v_customer is null then return new; end if;
  select center_name into v_center from public.sorting_centers where id=coalesce(new.to_center_id,new.from_center_id);
  v_title:=case new.event_type when 'center_received' then 'Parcel received at sorting center' when 'sorted' then 'Parcel sorted for delivery' when 'shipment_dispatched' then 'Parcel dispatched to next center' when 'shipment_received' then 'Parcel arrived at next sorting center' when 'last_mile_assigned' then 'Parcel assigned for local delivery' when 'out_for_delivery' then 'Parcel is out for delivery' else 'Parcel delivered' end;
  v_message:=case new.event_type when 'center_received' then 'Order '||v_order_ref||' was physically received at '||coalesce(v_center,'a LEOGO sorting center')||'.' when 'sorted' then 'Order '||v_order_ref||' was sorted and prepared for its next delivery stage.' when 'shipment_dispatched' then 'Order '||v_order_ref||' was dispatched to '||coalesce(v_center,'the next LEOGO sorting center')||'.' when 'shipment_received' then 'Order '||v_order_ref||' arrived at '||coalesce(v_center,'the next LEOGO sorting center')||'.' when 'last_mile_assigned' then 'Order '||v_order_ref||' was assigned for local delivery.' when 'out_for_delivery' then 'Order '||v_order_ref||' is out for delivery.' else 'Order '||v_order_ref||' was marked delivered.' end;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_customer,'marketplace_order',v_title,v_message,'marketplace_order',new.order_id::text,'sorting:'||new.id::text,'orders',jsonb_build_object('order_id',new.order_id,'parcel_event_id',new.id));
  return new;
end
$function$;

drop trigger if exists sorting_customer_event_notification on public.sorting_parcel_events;
create trigger sorting_customer_event_notification after insert on public.sorting_parcel_events for each row execute function private.notify_customer_sorting_event();

revoke all on function public.sorting_staff_list_shipments(uuid,text) from public,anon;
revoke all on function public.admin_sorting_center_operations(text) from public,anon;
grant execute on function public.sorting_staff_list_shipments(uuid,text) to authenticated;
grant execute on function public.admin_sorting_center_operations(text) to authenticated;

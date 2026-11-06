create or replace function public.admin_sorting_center_detail(p_center_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_center public.sorting_centers%rowtype;
  v_result jsonb;
begin
  if not private.is_leogo_admin('delivery.manage') then
    raise exception 'Delivery management permission required';
  end if;

  select * into v_center
  from public.sorting_centers c
  where c.id=p_center_id;
  if not found then raise exception 'Sorting center not found'; end if;

  select jsonb_build_object(
    'center',to_jsonb(v_center)||jsonb_build_object(
      'parent_center_name',(select p.center_name from public.sorting_centers p where p.id=v_center.parent_center_id),
      'staff_count',(select count(*) from public.sorting_center_staff s where s.center_id=v_center.id and s.is_active),
      'outgoing_route_count',(select count(*) from public.sorting_center_routes r where r.origin_center_id=v_center.id and r.is_active),
      'incoming_route_count',(select count(*) from public.sorting_center_routes r where r.destination_center_id=v_center.id and r.is_active)
    ),
    'metrics',jsonb_build_object(
      'expected_incoming',
        (select count(*) from public.sorting_parcels p where p.current_center_id=v_center.id and p.status='booked')+
        (select count(*) from public.sorting_shipments sh where sh.destination_center_id=v_center.id and sh.status in ('dispatched','in_transit')),
      'pending_receipt',
        (select count(*) from public.sorting_parcels p where p.current_center_id=v_center.id and p.status='seller_handed_over')+
        (select count(*) from public.sorting_shipments sh where sh.destination_center_id=v_center.id and sh.status in ('dispatched','in_transit')),
      'received_today',(select count(distinct e.parcel_id) from public.sorting_parcel_events e where e.to_center_id=v_center.id and e.event_type in ('center_received','shipment_received') and e.created_at >= date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
      'pending_sorting',(select count(*) from public.sorting_parcels p where p.current_center_id=v_center.id and p.status='received'),
      'sorted',(select count(*) from public.sorting_parcels p where p.current_center_id=v_center.id and p.status in ('sorted','received_next_center')),
      'pending_dispatch',(select count(*) from public.sorting_shipments sh where sh.origin_center_id=v_center.id and sh.status='building'),
      'shipments_in_transit',(select count(*) from public.sorting_shipments sh where (sh.origin_center_id=v_center.id or sh.destination_center_id=v_center.id) and sh.status in ('dispatched','in_transit')),
      'parcels_pending_handover',(select count(*) from public.sorting_parcels p where p.current_center_id=v_center.id and p.status in ('ready_for_last_mile','handed_to_rider')),
      'open_incidents',(select count(*) from public.sorting_parcel_incidents i where i.center_id=v_center.id and i.status<>'resolved'),
      'completed_deliveries',(select count(distinct e.parcel_id) from public.sorting_parcel_events e where e.event_type='delivered' and e.verified and (e.from_center_id=v_center.id or e.to_center_id=v_center.id))
    ),
    'staff',(select coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id',a.id,'user_id',a.user_id,'name',s.display_name,'phone',s.phone,
      'staff_role',s.staff_role,'center_role',a.role,'assignment_active',a.is_active,
      'staff_status',s.status,'assigned_at',a.created_at,'updated_at',a.updated_at
    ) order by a.is_active desc,s.display_name),'[]'::jsonb)
      from public.sorting_center_staff a join public.leogo_staff s on s.user_id=a.user_id where a.center_id=v_center.id),
    'routes',(select coalesce(jsonb_agg(jsonb_build_object(
      'route_id',r.id,'direction',case when r.origin_center_id=v_center.id then 'outgoing' else 'incoming' end,
      'origin_center_id',r.origin_center_id,'origin_center',o.center_name,
      'destination_center_id',r.destination_center_id,'destination_center',d.center_name,
      'estimated_hours',r.estimated_hours,'is_active',r.is_active,'updated_at',r.updated_at
    ) order by r.is_active desc,o.center_name,d.center_name),'[]'::jsonb)
      from public.sorting_center_routes r join public.sorting_centers o on o.id=r.origin_center_id join public.sorting_centers d on d.id=r.destination_center_id
      where r.origin_center_id=v_center.id or r.destination_center_id=v_center.id),
    'parcels',(select coalesce(jsonb_agg(x.row_data order by x.updated_at desc),'[]'::jsonb) from (
      select p.updated_at,jsonb_build_object(
        'parcel_id',p.id,'parcel_reference',p.parcel_reference,'status',p.status,
        'order_id',o.id,'order_reference',o.order_reference,'customer_name',o.receiver_name,'customer_phone',o.contact_number,
        'seller_order_id',p.seller_order_id,'seller',sa.business_name,'seller_phone',sa.phone,
        'county',o.county,'sub_county',o.sub_county,'estate',o.estate,
        'origin_center',oc.center_name,'current_center',cc.center_name,'destination_center',dc.center_name,
        'shipment_tracking_number',sh.tracking_number,'package_weight_kg',p.package_weight_kg,
        'booked_at',p.booked_at,'updated_at',p.updated_at
      ) as row_data
      from public.sorting_parcels p
      join public.marketplace_orders o on o.id=p.order_id
      join public.marketplace_seller_orders so on so.id=p.seller_order_id
      join public.seller_accounts sa on sa.user_id=so.seller_id
      join public.sorting_centers oc on oc.id=p.origin_center_id
      left join public.sorting_centers cc on cc.id=p.current_center_id
      left join public.sorting_centers dc on dc.id=p.destination_center_id
      left join public.sorting_shipments sh on sh.id=p.current_shipment_id
      where p.origin_center_id=v_center.id or p.current_center_id=v_center.id or p.destination_center_id=v_center.id
        or exists(select 1 from public.sorting_shipment_parcels sp join public.sorting_shipments rel on rel.id=sp.shipment_id where sp.parcel_id=p.id and (rel.origin_center_id=v_center.id or rel.destination_center_id=v_center.id))
    ) x),
    'shipments',(select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb) from (
      select sh.created_at,jsonb_build_object(
        'shipment_id',sh.id,'tracking_number',sh.tracking_number,'status',sh.status,
        'origin_center',o.center_name,'destination_center',d.center_name,
        'parcel_count',(select count(*) from public.sorting_shipment_parcels sp where sp.shipment_id=sh.id),
        'active_parcel_count',(select count(*) from public.sorting_shipment_parcels sp where sp.shipment_id=sh.id and sp.is_active),
        'assigned_transport_provider_id',sh.assigned_transport_provider_id,
        'prepared_by',ps.display_name,'verified_by',vs.display_name,'dispatched_by',ds.display_name,'received_by',rs.display_name,
        'created_at',sh.created_at,'dispatched_at',sh.dispatched_at,'received_at',sh.received_at,
        'dispatch_remarks',sh.dispatch_remarks,'receive_remarks',sh.receive_remarks,
        'parcels',(select coalesce(jsonb_agg(jsonb_build_object(
          'parcel_id',p.id,'parcel_reference',p.parcel_reference,'order_reference',ord.order_reference,
          'seller',seller.business_name,'county',ord.county,'sub_county',ord.sub_county,
          'weight_kg',p.package_weight_kg,'status',p.status,'is_active',sp.is_active
        ) order by ord.order_reference),'[]'::jsonb)
          from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id
          join public.marketplace_orders ord on ord.id=p.order_id
          join public.marketplace_seller_orders so on so.id=p.seller_order_id
          join public.seller_accounts seller on seller.user_id=so.seller_id
          where sp.shipment_id=sh.id)
      ) as row_data
      from public.sorting_shipments sh
      join public.sorting_centers o on o.id=sh.origin_center_id
      join public.sorting_centers d on d.id=sh.destination_center_id
      left join public.leogo_staff ps on ps.user_id=sh.prepared_by
      left join public.leogo_staff vs on vs.user_id=sh.verified_by
      left join public.leogo_staff ds on ds.user_id=sh.dispatched_by
      left join public.leogo_staff rs on rs.user_id=sh.received_by
      where sh.origin_center_id=v_center.id or sh.destination_center_id=v_center.id
    ) x),
    'incidents',(select coalesce(jsonb_agg(jsonb_build_object(
      'incident_id',i.id,'incident_type',i.incident_type,'details',i.details,'status',i.status,
      'parcel_id',i.parcel_id,'parcel_reference',p.parcel_reference,'order_reference',o.order_reference,
      'shipment_id',i.shipment_id,'shipment_tracking_number',sh.tracking_number,
      'reported_by',rep.display_name,'resolved_by',res.display_name,
      'evidence_photo_path',i.evidence_photo_path,'created_at',i.created_at,'resolved_at',i.resolved_at
    ) order by i.created_at desc),'[]'::jsonb)
      from public.sorting_parcel_incidents i
      left join public.sorting_parcels p on p.id=i.parcel_id
      left join public.marketplace_orders o on o.id=p.order_id
      left join public.sorting_shipments sh on sh.id=i.shipment_id
      left join public.leogo_staff rep on rep.user_id=i.reported_by
      left join public.leogo_staff res on res.user_id=i.resolved_by
      where i.center_id=v_center.id),
    'movements',(select coalesce(jsonb_agg(jsonb_build_object(
      'event_id',e.id,'event_type',e.event_type,'created_at',e.created_at,'verified',e.verified,
      'order_reference',o.order_reference,'parcel_reference',p.parcel_reference,
      'shipment_tracking_number',sh.tracking_number,'from_center',fc.center_name,'to_center',tc.center_name,
      'actor',coalesce(e.actor_label,s.display_name),'remarks',e.remarks,'evidence_photo_path',e.evidence_photo_path
    ) order by e.created_at desc),'[]'::jsonb)
      from public.sorting_parcel_events e
      join public.sorting_parcels p on p.id=e.parcel_id
      join public.marketplace_orders o on o.id=e.order_id
      left join public.sorting_shipments sh on sh.id=e.shipment_id
      left join public.sorting_centers fc on fc.id=e.from_center_id
      left join public.sorting_centers tc on tc.id=e.to_center_id
      left join public.leogo_staff s on s.user_id=e.actor_user_id
      where e.from_center_id=v_center.id or e.to_center_id=v_center.id),
    'audit_activity',(select coalesce(jsonb_agg(jsonb_build_object(
      'action',a.action,'entity_type',a.entity_type,'entity_id',a.entity_id,'actor_email',a.actor_email,
      'created_at',a.created_at,'before_data',a.before_data,'after_data',a.after_data,'metadata',a.metadata
    ) order by a.created_at desc),'[]'::jsonb) from (
      select log.* from public.admin_audit_log log
      where log.action like 'sorting.%' and (
        (log.entity_type='sorting_center' and log.entity_id=v_center.id::text)
        or exists(select 1 from public.sorting_center_staff a where a.center_id=v_center.id and log.entity_type='sorting_center_staff' and log.entity_id=a.id::text)
        or exists(select 1 from public.sorting_center_routes r where (r.origin_center_id=v_center.id or r.destination_center_id=v_center.id) and log.entity_type='sorting_center_route' and log.entity_id=r.id::text)
        or exists(select 1 from public.sorting_parcels p where log.entity_type='sorting_parcel' and log.entity_id=p.id::text and (
          p.origin_center_id=v_center.id or p.current_center_id=v_center.id or p.destination_center_id=v_center.id
          or exists(select 1 from public.sorting_parcel_events e where e.parcel_id=p.id and (e.from_center_id=v_center.id or e.to_center_id=v_center.id))
        ))
        or exists(select 1 from public.sorting_shipments sh where log.entity_type='sorting_shipment' and log.entity_id=sh.id::text and (sh.origin_center_id=v_center.id or sh.destination_center_id=v_center.id))
        or exists(select 1 from public.sorting_parcel_incidents i where log.entity_type='sorting_parcel_incident' and log.entity_id=i.id::text and i.center_id=v_center.id)
      ) order by log.created_at desc limit 300
    ) a)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.admin_sorting_center_detail(uuid) from public,anon;
grant execute on function public.admin_sorting_center_detail(uuid) to authenticated;

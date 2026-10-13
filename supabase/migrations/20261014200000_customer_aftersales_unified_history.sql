create or replace function public.customer_aftersales_unified_history()
returns jsonb language sql stable security definer set search_path='' as $fn$
with own as (select c.id,c.case_reference,c.created_at,c.status from public.marketplace_aftersales_cases c where c.customer_id=auth.uid()),
events as (
 select c.id case_id,e.created_at at,e.actor_role actor,e.event_type event,e.comment note,'case'::text category
 from own c join public.marketplace_aftersales_negotiation_events e on e.case_id=c.id
 union all
 select c.id,e.created_at,e.actor_id::text,e.step,e.notes,'return'
 from own c join public.aftersales_return_transport_events e on e.aftersales_case_id=c.id
 union all
 select c.id,e.changed_at,'delivery',e.new_status,null::text,'exchange'
 from own c join public.aftersales_exchange_events e on e.case_id=c.id
 union all
 select c.id,r.updated_at,'pickup_station',r.status,r.return_reference,'return'
 from own c join public.pickup_station_return_parcels r on r.aftersales_case_id=c.id
 union all
 select c.id,s.updated_at,'delivery',s.status,s.reference,'exchange'
 from own c join public.aftersales_exchange_shipments s on s.case_id=c.id
)
select coalesce(jsonb_agg(jsonb_build_object('case_id',o.id,'case_reference',o.case_reference,
'events',coalesce((select jsonb_agg(jsonb_build_object('at',e.at,'actor',e.actor,'event',e.event,'note',e.note,'category',e.category) order by e.at) from events e where e.case_id=o.id),'[]'::jsonb),
'return', (select jsonb_build_object('reference',r.return_reference,'status',r.status,'station',p.station_name,'dispatched_at',r.dispatched_at) from public.pickup_station_return_parcels r left join public.pickup_stations p on p.id=r.pickup_station_id where r.aftersales_case_id=o.id order by r.updated_at desc limit 1),
'exchange',(select jsonb_build_object('reference',s.reference,'status',s.status,'station',p.station_name,'delivery_choice',s.customer_delivery_choice) from public.aftersales_exchange_shipments s left join public.pickup_stations p on p.id=s.pickup_station_id where s.case_id=o.id order by s.updated_at desc limit 1)
)),'[]'::jsonb) from own o;
$fn$;
revoke all on function public.customer_aftersales_unified_history() from public,anon;
grant execute on function public.customer_aftersales_unified_history() to authenticated;
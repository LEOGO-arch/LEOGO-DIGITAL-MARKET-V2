create or replace function public.pickup_partner_aftersales_return_listing()
returns jsonb language sql stable security definer set search_path='' as $fn$
select coalesce(jsonb_agg(jsonb_build_object(
 'id',r.id,'case_reference',c.case_reference,'status',r.status,
 'received_at',(select min(e.created_at) from public.pickup_station_parcel_events e where e.return_parcel_id=r.id and e.event_type='received')
 ) order by r.booked_at desc),'[]'::jsonb)
 from public.pickup_station_return_parcels r
 join public.marketplace_aftersales_cases c on c.id=r.aftersales_case_id
 where r.pickup_station_id=private.pickup_partner_station_id();
$fn$;
revoke all on function public.pickup_partner_aftersales_return_listing() from public,anon;
grant execute on function public.pickup_partner_aftersales_return_listing() to authenticated;
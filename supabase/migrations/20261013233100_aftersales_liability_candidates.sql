create or replace function public.admin_aftersales_liability_candidates(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement permission required';end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.party,q.label),'[]'::jsonb) from (
 select distinct 'seller'::text party,n.seller_id id,'Seller - '||n.seller_id::text label,null::uuid return_id
 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id
 union all
 select distinct 'pickup_station',r.pickup_station_id,'Pickup Station - '||s.station_name,r.id
 from public.pickup_station_return_parcels r join public.pickup_stations s on s.id=r.pickup_station_id
 where r.aftersales_case_id=p_case_id
 union all
 select distinct 'staff_rider',w.assignee_id,'LEOGO Rider - '||w.courier_name,r.id
 from public.aftersales_return_waybills w join public.pickup_station_return_parcels r on r.id=w.return_id
 where r.aftersales_case_id=p_case_id and w.assignee_type='rider' and w.assignee_id is not null
 union all
 select distinct 'transport_provider',w.assignee_id,'Transport Provider - '||w.courier_name,r.id
 from public.aftersales_return_waybills w join public.pickup_station_return_parcels r on r.id=w.return_id
 where r.aftersales_case_id=p_case_id and w.assignee_type='courier' and w.assignee_id is not null
 ) q);
end;$fn$;
revoke all on function public.admin_aftersales_liability_candidates(uuid) from public,anon;
grant execute on function public.admin_aftersales_liability_candidates(uuid) to authenticated;
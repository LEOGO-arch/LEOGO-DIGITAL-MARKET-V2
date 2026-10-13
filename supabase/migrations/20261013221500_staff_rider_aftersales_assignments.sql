-- Rider-scoped Aftersales assignments, read-only; normal delivery jobs remain separate.
create or replace function public.staff_list_assigned_aftersales_returns()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not exists(
  select 1 from public.leogo_staff s where s.user_id=v_uid and s.staff_role='rider' and s.status='active'
 ) then raise exception 'Active LEOGO rider access required';end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc),'[]'::jsonb)
 from (
  select w.return_id,w.assigned_at,w.route_destination,
   r.return_reference,r.status as return_status,r.dispatched_at,
   c.case_reference as aftersales_number,
   coalesce(i.product_name,nullif(r.item_description,''),'Item not specified') as item_name,
   r.original_order_reference as order_reference,
   r.customer_name,r.customer_phone,
   p.station_name as pickup_station_name,
   (w.waybill_path is not null) as has_waybill
  from public.aftersales_return_waybills w
  join public.pickup_station_return_parcels r on r.id=w.return_id
  join public.marketplace_aftersales_cases c on c.id=r.aftersales_case_id
  left join public.marketplace_order_items i on i.id=c.order_item_id
  join public.pickup_stations p on p.id=r.pickup_station_id
  where w.assignee_id=v_uid and w.assignee_type='rider'
 ) x);
end;$fn$;
revoke all on function public.staff_list_assigned_aftersales_returns() from public,anon;
grant execute on function public.staff_list_assigned_aftersales_returns() to authenticated;
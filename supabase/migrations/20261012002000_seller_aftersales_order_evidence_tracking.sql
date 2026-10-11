-- Seller-scoped aftersales lifecycle: assigned case only; keep customer/admin access unchanged.
create or replace function public.aftersales_list_negotiations()
returns jsonb language sql stable security definer set search_path='' as $fn$
select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb) from (
 select n.*,c.customer_id,c.order_id,c.case_reference,c.issue_type,c.details,c.preferred_solution,
  c.requested_refund_amount_kes,c.return_pickup_station_id,c.evidence_path,c.created_at as complaint_created_at,
  o.order_reference,
  i.product_name,
  (select jsonb_build_object('return_reference',r.return_reference,'status',r.status,
      'booked_at',r.booked_at,'dispatched_at',r.dispatched_at,'updated_at',r.updated_at,
      'item_description',r.item_description,'return_reason',r.return_reason,
      'pickup_station_id',r.pickup_station_id)
   from public.pickup_station_return_parcels r
   where r.aftersales_case_id=c.id order by r.updated_at desc limit 1) as return_tracking,
  coalesce((select jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_role',e.actor_role,
    'comment',e.comment,'created_at',e.created_at) order by e.created_at)
   from public.marketplace_aftersales_negotiation_events e where e.case_id=n.case_id),'[]'::jsonb) as history
 from public.marketplace_aftersales_negotiations n
 join public.marketplace_aftersales_cases c on c.id=n.case_id
 join public.marketplace_orders o on o.id=c.order_id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 where private.is_leogo_admin('orders.manage') or n.seller_id=(select auth.uid()) or c.customer_id=(select auth.uid())
) q
$fn$;
-- A seller may view exactly the evidence file referenced by a case assigned to that seller.
create policy "Assigned sellers view customer aftersales evidence"
on storage.objects for select to authenticated
using (
 bucket_id='marketplace-aftersales-evidence'
 and exists (
  select 1 from public.marketplace_aftersales_cases c
  join public.marketplace_aftersales_negotiations n on n.case_id=c.id
  where n.seller_id=(select auth.uid()) and c.evidence_path=storage.objects.name
 )
);
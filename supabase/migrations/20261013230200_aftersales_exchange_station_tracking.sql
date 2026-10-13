create or replace function public.aftersales_exchange_list(p_role text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from(
 select s.*,c.case_reference,o.order_reference,o.receiver_name,o.contact_number,coalesce(i.product_name,'Exchange product') as item_name,p.station_name
 from public.aftersales_exchange_shipments s
 join public.marketplace_aftersales_cases c on c.id=s.case_id
 join public.marketplace_orders o on o.id=s.original_order_id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 left join public.pickup_stations p on p.id=s.pickup_station_id
 where (p_role='seller' and s.seller_id=auth.uid())
 or (p_role='rider' and s.rider_id=auth.uid() and exists(select 1 from public.leogo_staff where user_id=auth.uid() and status='active' and staff_role='rider'))
 or (p_role='station' and s.pickup_station_id=private.pickup_partner_station_id() and private.pickup_partner_station_id() is not null)
 or (p_role='admin' and private.is_leogo_admin('delivery.manage'))
 or (p_role='customer' and o.customer_id=auth.uid())
 ) x);
end;$fn$;
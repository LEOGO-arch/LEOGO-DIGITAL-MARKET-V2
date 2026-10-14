create or replace function public.aftersales_order_sellers_named(p_case_id uuid)
returns table(seller_id uuid,business_name text,owner_name text)
language sql stable security definer set search_path='' as $fn$
 select distinct so.seller_id,
 nullif(btrim(sa.business_name),'')::text,
 nullif(btrim(sa.owner_name),'')::text
 from public.marketplace_seller_orders so
 join public.marketplace_aftersales_cases c on c.order_id=so.order_id
 left join public.seller_accounts sa on sa.user_id=so.seller_id
 where c.id=p_case_id and private.is_leogo_admin('orders.manage');
$fn$;
revoke all on function public.aftersales_order_sellers_named(uuid) from public,anon;
grant execute on function public.aftersales_order_sellers_named(uuid) to authenticated;
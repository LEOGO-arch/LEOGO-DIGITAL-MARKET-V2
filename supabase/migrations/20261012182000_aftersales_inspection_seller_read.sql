-- Seller-only readout of physical return inspection state.
create or replace function public.aftersales_seller_list_inspections()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb)
 from public.aftersales_seller_inspections i where i.seller_id=(select auth.uid())
$fn$;
revoke all on function public.aftersales_seller_list_inspections() from public,anon;
grant execute on function public.aftersales_seller_list_inspections() to authenticated;

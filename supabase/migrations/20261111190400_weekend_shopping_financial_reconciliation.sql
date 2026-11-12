-- LEOGO Weekend Shopping, staged read-only finance reconciliation.
CREATE OR REPLACE FUNCTION public.admin_weekend_shopping_reconciliation()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when not (private.is_leogo_admin('reports.view') or private.is_leogo_admin('settlements.read') or private.is_leogo_admin()) then null
else jsonb_build_object(
 'total_plans',(select count(*) from public.weekend_shopping_plans),
 'total_cycles',(select count(*) from public.weekend_shopping_cycles),
 'total_cycle_targets_kes',(select coalesce(sum(amount_due_kes),0) from public.weekend_shopping_cycles where status<>'cancelled'),
 'verified_funding_kes',(select coalesce(sum(verified_paid_kes),0) from public.weekend_shopping_cycles where status<>'cancelled'),
 'awaiting_funding_kes',(select coalesce(sum(greatest(amount_due_kes-verified_paid_kes,0)),0) from public.weekend_shopping_cycles where status='funding'),
 'pending_payment_claims_kes',(select coalesce(sum(amount_kes),0) from public.weekend_shopping_payments where status='pending'),
 'pending_claims_count',(select count(*) from public.weekend_shopping_payments where status='pending'),
 'fully_funded_cycles',(select count(*) from public.weekend_shopping_cycles where status='funded'),
 'release_ready_cycles',(select count(*) from public.weekend_shopping_cycles where status='release_ready'),
 'released_cycles',(select count(*) from public.weekend_shopping_cycles where status='released'),
 'released_order_total_kes',(select coalesce(sum(o.grand_total_kes),0) from public.weekend_shopping_cycles c join public.marketplace_orders o on o.id=c.released_order_id where c.status='released'),
 'released_seller_subtotals_kes',(select coalesce(sum(so.seller_subtotal_kes),0) from public.weekend_shopping_cycles c join public.marketplace_seller_orders so on so.order_id=c.released_order_id where c.status='released'),
 'generated_at',now()
) end
$function$
;
revoke execute on function public.admin_weekend_shopping_reconciliation() from public,anon;
grant execute on function public.admin_weekend_shopping_reconciliation() to authenticated;

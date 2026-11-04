-- Admin financial roll-up for Savings Wallet marketplace checkout.
-- Wallet receipts and seller earnings are linked to wallet orders; seller payouts
-- remain recorded across all payment methods until per-order allocation is implemented.
create or replace function public.admin_get_wallet_checkout_financial_report()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_collected numeric(14,2);
 v_refunded numeric(14,2);
 v_paid_orders bigint;
 v_refund_orders bigint;
 v_seller_earned numeric(14,2);
 v_seller_awaiting_delivery numeric(14,2);
 v_seller_settlements_all_methods numeric(14,2);
 v_pending_all_methods numeric(14,2);
begin
 if not (private.is_leogo_admin('reports.view') or private.is_leogo_admin('settlements.manage')) then
   raise exception 'Financial reports permission required';
 end if;
 select coalesce(sum(amount_kes),0),coalesce(sum(amount_kes) filter(where status='refunded'),0),
   count(*),count(*) filter(where status='refunded')
 into v_collected,v_refunded,v_paid_orders,v_refund_orders
 from public.wallet_checkout_payments;
 select
   coalesce(sum(so.seller_subtotal_kes) filter(where so.fulfilment_status='delivered'
     and o.payment_status='verified_paid' and wp.status='paid' and o.order_status<>'cancelled'),0),
   coalesce(sum(so.seller_subtotal_kes) filter(where so.fulfilment_status<>'delivered'
     and wp.status='paid' and o.order_status<>'cancelled'),0)
 into v_seller_earned,v_seller_awaiting_delivery
 from public.wallet_checkout_payments wp
 join public.marketplace_orders o on o.id=wp.order_id
 join public.marketplace_seller_orders so on so.order_id=o.id;
 select coalesce(sum(amount_kes),0) into v_seller_settlements_all_methods
 from public.seller_settlements where status='paid';
 select coalesce(sum(requested_amount_kes),0) into v_pending_all_methods
 from public.seller_settlement_requests where status in ('pending','under_review');
 return jsonb_build_object(
   'wallet_cash_collected_kes',v_collected,
   'wallet_cash_refunded_kes',v_refunded,
   'wallet_cash_net_kes',v_collected-v_refunded,
   'wallet_paid_order_count',v_paid_orders,
   'wallet_refunded_order_count',v_refund_orders,
   'wallet_seller_earned_delivered_kes',v_seller_earned,
   'wallet_seller_awaiting_delivery_kes',v_seller_awaiting_delivery,
   'all_methods_seller_settlements_paid_kes',v_seller_settlements_all_methods,
   'all_methods_seller_settlement_requests_pending_kes',v_pending_all_methods,
   'wallet_to_seller_payout_attribution_available',false,
   'generated_at',now()
 );
end $$;
revoke execute on function public.admin_get_wallet_checkout_financial_report() from public,anon;
grant execute on function public.admin_get_wallet_checkout_financial_report() to authenticated;

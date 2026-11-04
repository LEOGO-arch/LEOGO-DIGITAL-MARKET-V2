-- Wallet-to-seller settlement visibility; staged for review, no external funds movement.
-- Existing private.partner_available_balance already credits delivered seller orders
-- when marketplace_orders.payment_status='verified_paid', including wallet orders.
-- This report does not attribute aggregate seller settlements to particular orders.
create or replace function public.admin_list_wallet_order_settlement_reconciliation()
returns table (
  wallet_payment_id uuid,
  order_id uuid,
  order_reference text,
  seller_id uuid,
  seller_order_id uuid,
  seller_subtotal_kes numeric,
  wallet_amount_paid_kes numeric,
  wallet_payment_status text,
  seller_fulfilment_status text,
  order_status text,
  eligible_for_settlement boolean,
  seller_approved_account_count bigint,
  seller_available_balance_kes numeric,
  wallet_payment_created_at timestamptz
)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_leogo_admin('settlements.manage') then
    raise exception 'Settlement management permission required';
  end if;
  return query
    select wp.id, o.id, o.order_reference, so.seller_id, so.id,
      so.seller_subtotal_kes, wp.amount_kes, wp.status,
      so.fulfilment_status, o.order_status,
      (wp.status='paid' and o.payment_status='verified_paid'
        and so.fulfilment_status='delivered' and o.order_status<>'cancelled'),
      (select count(*) from public.seller_settlement_accounts sa
        where sa.seller_id=so.seller_id and sa.status='approved'),
      private.partner_available_balance('seller',so.seller_id),
      wp.created_at
    from public.wallet_checkout_payments wp
    join public.marketplace_orders o on o.id=wp.order_id
    join public.marketplace_seller_orders so on so.order_id=o.id
    order by wp.created_at desc, so.id;
end $$;
revoke all on function public.admin_list_wallet_order_settlement_reconciliation() from public,anon;
grant execute on function public.admin_list_wallet_order_settlement_reconciliation() to authenticated;

-- Do not treat 'paid' seller-settlement rows as an automatic SACCO transfer.
-- Admin must verify the real transfer reference under the existing settlement workflow.

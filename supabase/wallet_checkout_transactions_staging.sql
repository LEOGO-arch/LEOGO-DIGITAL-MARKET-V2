-- STAGING ONLY. Do not apply to production until authenticated end-to-end, settlement and refund tests pass.

-- Staging-only wallet checkout. Activation stays OFF until partner and QA checks pass.
create table if not exists public.wallet_checkout_payments(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 client_request_id uuid not null,
 amount_kes numeric(14,2) not null check(amount_kes>0),
 purchase_ledger_entry_id uuid not null unique references public.wallet_ledger_entries(id) on delete restrict,
 refund_ledger_entry_id uuid unique references public.wallet_ledger_entries(id) on delete restrict,
 status text not null default 'paid' check(status in ('paid','refunded')),
 created_at timestamptz not null default now(),
 refunded_at timestamptz,
 unique(user_id,client_request_id)
);
create index if not exists wallet_checkout_payments_user_created_idx on public.wallet_checkout_payments(user_id,created_at desc);
alter table public.wallet_checkout_payments enable row level security;
revoke all on public.wallet_checkout_payments from anon,authenticated;
-- Existing enum-style constraint must permit the new payment method, even with the feature disabled.
alter table public.marketplace_orders drop constraint if exists marketplace_orders_payment_method_check;
alter table public.marketplace_orders add constraint marketplace_orders_payment_method_check
 check(payment_method in ('till','paybill','cod','points','lipa_pole_pole','wallet'));

create or replace function public.customer_create_marketplace_wallet_order(
 p_items jsonb,p_receiver_name text,p_contact_number text,p_delivery_zone text,
 p_county text,p_sub_county text,p_estate text,p_landmark text,p_location_link text,
 p_pickup_station_id uuid,p_client_request_id uuid,p_use_reward_points boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();
 v_existing public.wallet_checkout_payments%rowtype;
 v_order public.marketplace_orders%rowtype;
 v_result jsonb;
 v_order_id uuid;
 v_amount numeric(14,2);
 v_cash numeric(14,2);
 v_reserved numeric(14,2);
 v_ledger_id uuid;
 v_payment_id uuid;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if p_client_request_id is null then raise exception 'Idempotency request ID required'; end if;
 -- Server-side kill switch; no SQL client parameter can bypass it.
 if not exists(
   select 1 from public.wallet_checkout_activation
   where id=1 and enabled and custody_partner_approved and atomic_ledger_verified
     and refund_flow_verified and settlement_reconciliation_verified
 ) then raise exception 'Wallet checkout is not activated by LEOGO'; end if;
 select * into v_existing from public.wallet_checkout_payments
 where user_id=v_uid and client_request_id=p_client_request_id;
 if found then
   return jsonb_build_object('ok',true,'order_id',v_existing.order_id,'wallet_payment_id',v_existing.id,
     'amount_paid_kes',v_existing.amount_kes,'already_processed',true);
 end if;
 -- Existing marketplace function owns validation, price calculation, stock reservation,
 -- delivery fees, seller sub-orders and reward redemption. A failure below rolls it all back.
 v_result:=public.customer_create_marketplace_order_v2(
   p_items,p_receiver_name,p_contact_number,p_delivery_zone,p_county,p_sub_county,
   p_estate,p_landmark,p_location_link,p_pickup_station_id,'till',
   'WALLET PENDING '||p_client_request_id::text,p_use_reward_points);
 v_order_id:=(v_result->>'order_id')::uuid;
 select * into v_order from public.marketplace_orders where id=v_order_id for update;
 if not found or v_order.customer_id<>v_uid then raise exception 'Order ownership could not be confirmed'; end if;
 if v_order.order_status<>'placed' or v_order.payment_status<>'submitted' then
   raise exception 'Order is not eligible for wallet payment';
 end if;
 v_amount:=coalesce(v_order.external_amount_due_kes,
     v_order.grand_total_kes-coalesce(v_order.reward_points_redeemed_kes,0));
 if v_amount<=0 then raise exception 'No wallet cash payment is due for this order'; end if;
 -- Same lock as the withdrawal request function, serializing spending and reservations.
 perform 1 from public.wallet_accounts where user_id=v_uid and account_status='active' for update;
 if not found then raise exception 'Active Savings Wallet required'; end if;
 select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
 into v_cash from public.wallet_ledger_entries
 where user_id=v_uid and entry_type not in
 ('shopping_reward','reward_redemption','reward_redemption_restore');
 select coalesce(sum(requested_amount_kes),0) into v_reserved
 from public.wallet_withdrawal_requests where user_id=v_uid and request_status='pending_call';
 if v_amount>greatest(0,v_cash-v_reserved) then raise exception 'Insufficient available wallet savings'; end if;
 -- The ledger and order change commit in this same function transaction.
 insert into public.wallet_ledger_entries(user_id,entry_type,direction,amount_kes,external_reference,description)
 values(v_uid,'purchase','debit',v_amount,'wallet-order:'||v_order_id::text,
   'Marketplace purchase '||left(v_order.order_reference,100))
 returning id into v_ledger_id;
 insert into public.wallet_checkout_payments(order_id,user_id,client_request_id,amount_kes,purchase_ledger_entry_id)
 values(v_order_id,v_uid,p_client_request_id,v_amount,v_ledger_id) returning id into v_payment_id;
 update public.marketplace_orders set payment_method='wallet',payment_status='verified_paid',
   payment_verified_at=now(),payment_verified_by=null,external_amount_due_kes=0,
   payment_message='Wallet ledger payment '||v_payment_id::text,updated_at=now()
 where id=v_order_id;
 return jsonb_build_object('ok',true,'order_id',v_order_id,'wallet_payment_id',v_payment_id,
   'amount_paid_kes',v_amount,'already_processed',false);
end $$;
revoke execute on function public.customer_create_marketplace_wallet_order(
jsonb,text,text,text,text,text,text,text,text,uuid,uuid,boolean) from public,anon;
grant execute on function public.customer_create_marketplace_wallet_order(
jsonb,text,text,text,text,text,text,text,text,uuid,uuid,boolean) to authenticated;

alter table public.wallet_checkout_payments
 add column if not exists refund_request_id uuid unique,
 add column if not exists refund_reason text,
 add column if not exists reconciliation_reference text;

create or replace function public.admin_refund_marketplace_wallet_order(
 p_order_id uuid,p_refund_request_id uuid,p_reason text,
 p_reconciliation_reference text,p_settlement_reconciled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tx public.wallet_checkout_payments%rowtype;v_order public.marketplace_orders%rowtype;v_ledger_id uuid;
begin
 if not (private.is_leogo_admin('orders.payment_verify') and private.is_leogo_admin('settings.manage'))
 then raise exception 'Wallet refund authorization required'; end if;
 if p_order_id is null or p_refund_request_id is null then raise exception 'Order and unique refund request required'; end if;
 if length(btrim(coalesce(p_reason,'')))<8 or length(coalesce(p_reason,''))>240 then raise exception 'Explain the refund reason'; end if;
 if p_settlement_reconciled is distinct from true or length(btrim(coalesce(p_reconciliation_reference,'')))<6
 then raise exception 'Settlement reconciliation confirmation and reference required'; end if;
 select * into v_tx from public.wallet_checkout_payments where order_id=p_order_id for update;
 if not found then raise exception 'No wallet purchase found'; end if;
 if v_tx.status='refunded' then
  if v_tx.refund_request_id=p_refund_request_id then
   return jsonb_build_object('ok',true,'already_refunded',true,'payment_id',v_tx.id);
  end if;
  raise exception 'This order was already refunded';
 end if;
 select * into v_order from public.marketplace_orders where id=p_order_id for update;
 if v_order.order_status<>'cancelled' then raise exception 'Cancel the order through the approved workflow before refund'; end if;
 perform 1 from public.wallet_accounts where user_id=v_tx.user_id for update;
 if not found then raise exception 'Customer wallet account missing'; end if;
 insert into public.wallet_ledger_entries(user_id,entry_type,direction,amount_kes,external_reference,description)
 values(v_tx.user_id,'refund','credit',v_tx.amount_kes,
   'wallet-refund:'||v_tx.order_id::text,'Marketplace refund '||left(v_order.order_reference,100))
 returning id into v_ledger_id;
 update public.wallet_checkout_payments
 set status='refunded',refund_ledger_entry_id=v_ledger_id,
     refunded_at=now(),refund_request_id=p_refund_request_id,
     refund_reason=btrim(p_reason),reconciliation_reference=btrim(p_reconciliation_reference)
 where id=v_tx.id;
 perform private.write_admin_audit('wallet.order.refund','marketplace_order',p_order_id::text,
   to_jsonb(v_tx),jsonb_build_object('refund_ledger_entry_id',v_ledger_id),
   jsonb_build_object('reason',p_reason,'reconciliation_reference',p_reconciliation_reference));
 return jsonb_build_object('ok',true,'already_refunded',false,'payment_id',v_tx.id,
   'amount_refunded_kes',v_tx.amount_kes);
end $$;
revoke execute on function public.admin_refund_marketplace_wallet_order(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_refund_marketplace_wallet_order(uuid,uuid,text,text,boolean) to authenticated;

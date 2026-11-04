-- Staging-only wallet refund vs seller settlement reconciliation.
-- Existing seller settlements are aggregate. This declaration records the review
-- rather than assuming an aggregate payout belongs to any particular order.
create table if not exists public.wallet_refund_seller_reviews(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.marketplace_orders(id) on delete restrict,
 seller_order_id uuid not null unique references public.marketplace_seller_orders(id) on delete restrict,
 seller_id uuid not null,
 seller_paid boolean not null,
 settlement_id uuid references public.seller_settlements(id) on delete restrict,
 liability_treatment text not null check(liability_treatment in ('not_paid','recovery_pending','recovered','leogo_absorbs')),
 liability_amount_kes numeric(14,2) not null check(liability_amount_kes>=0),
 evidence_reference text not null,
 review_notes text not null,
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 check((seller_paid and liability_treatment<>'not_paid') or (not seller_paid and liability_treatment='not_paid')),
 check((seller_paid and liability_amount_kes>0) or (not seller_paid and liability_amount_kes=0)),
 unique(order_id,seller_order_id)
);
create index if not exists wallet_refund_reviews_order_idx on public.wallet_refund_seller_reviews(order_id);
alter table public.wallet_refund_seller_reviews enable row level security;
revoke all on public.wallet_refund_seller_reviews from anon,authenticated;

create or replace function public.admin_review_wallet_refund_seller(
 p_order_id uuid,p_seller_order_id uuid,p_seller_paid boolean,
 p_settlement_id uuid,p_liability_treatment text,p_liability_amount_kes numeric,
 p_evidence_reference text,p_review_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_order public.marketplace_orders%rowtype;
 v_seller_order public.marketplace_seller_orders%rowtype;
 v_payment public.wallet_checkout_payments%rowtype;
 v_settlement public.seller_settlements%rowtype;
 v_treatment text:=btrim(coalesce(p_liability_treatment,''));
 v_amount numeric(14,2):=round(coalesce(p_liability_amount_kes,0),2);
begin
 if not (private.is_leogo_admin('orders.payment_verify') and private.is_leogo_admin('settings.manage')) then
   raise exception 'Wallet refund review authorization required';
 end if;
 select * into v_order from public.marketplace_orders where id=p_order_id for update;
 if not found or v_order.order_status<>'cancelled' then
   raise exception 'Cancel the marketplace order through the approved workflow first';
 end if;
 select * into v_payment from public.wallet_checkout_payments where order_id=p_order_id for update;
 if not found or v_payment.status<>'paid' then raise exception 'An unrefunded wallet payment is required'; end if;
 select * into v_seller_order from public.marketplace_seller_orders
   where id=p_seller_order_id and order_id=p_order_id;
 if not found then raise exception 'Seller order does not belong to this wallet purchase'; end if;
 if p_seller_paid is null then raise exception 'Explicit seller payment confirmation required'; end if;
 if length(btrim(coalesce(p_evidence_reference,'')))<6 or length(p_evidence_reference)>160 then
   raise exception 'Provide a reconciliation evidence reference';
 end if;
 if length(btrim(coalesce(p_review_notes,'')))<12 or length(p_review_notes)>500 then
   raise exception 'Explain settlement verification and recovery responsibility';
 end if;
 if p_seller_paid then
   if v_treatment not in ('recovery_pending','recovered','leogo_absorbs')
     or v_amount<=0 or v_amount>v_seller_order.seller_subtotal_kes then
     raise exception 'Record a valid paid-seller recovery or LEOGO liability amount';
   end if;
 else
   if v_treatment<>'not_paid' or v_amount<>0 or p_settlement_id is not null then
     raise exception 'An unpaid seller must have zero liability and no payout reference';
   end if;
 end if;
 if p_settlement_id is not null then
   select * into v_settlement from public.seller_settlements
   where id=p_settlement_id and seller_id=v_seller_order.seller_id and status='paid';
   if not found then raise exception 'The referenced seller payout is not a verified paid settlement'; end if;
 end if;
 insert into public.wallet_refund_seller_reviews(
   order_id,seller_order_id,seller_id,seller_paid,settlement_id,
   liability_treatment,liability_amount_kes,evidence_reference,review_notes,reviewed_by)
 values(p_order_id,p_seller_order_id,v_seller_order.seller_id,p_seller_paid,p_settlement_id,
   v_treatment,v_amount,btrim(p_evidence_reference),btrim(p_review_notes),auth.uid())
 on conflict(seller_order_id) do update
 set seller_paid=excluded.seller_paid,settlement_id=excluded.settlement_id,
   liability_treatment=excluded.liability_treatment,liability_amount_kes=excluded.liability_amount_kes,
   evidence_reference=excluded.evidence_reference,review_notes=excluded.review_notes,
   reviewed_by=excluded.reviewed_by,reviewed_at=now();
 perform private.write_admin_audit('wallet.refund.seller_review','marketplace_order',p_order_id::text,
   null,jsonb_build_object('seller_order_id',p_seller_order_id,'seller_paid',p_seller_paid,
   'liability_treatment',v_treatment,'liability_amount_kes',v_amount),
   jsonb_build_object('evidence_reference',btrim(p_evidence_reference),'settlement_id',p_settlement_id));
 return jsonb_build_object('ok',true,'seller_order_id',p_seller_order_id,'treatment',v_treatment);
end $$;
revoke execute on function public.admin_review_wallet_refund_seller(uuid,uuid,boolean,uuid,text,numeric,text,text) from public,anon;
grant execute on function public.admin_review_wallet_refund_seller(uuid,uuid,boolean,uuid,text,numeric,text,text) to authenticated;

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
 -- Every seller portion must receive a documented payout/recovery determination.
 if not exists(select 1 from public.marketplace_seller_orders where order_id=p_order_id) then
   raise exception 'Seller order details are missing; refund review is blocked';
 end if;
 if exists(
   select 1 from public.marketplace_seller_orders so
   left join public.wallet_refund_seller_reviews rr
     on rr.seller_order_id=so.id and rr.order_id=p_order_id and rr.seller_id=so.seller_id
   where so.order_id=p_order_id and rr.id is null
 ) then raise exception 'Complete settlement review for every seller before wallet refund'; end if;
 if exists(
   select 1 from public.wallet_refund_seller_reviews rr
   where rr.order_id=p_order_id
     and rr.seller_paid and rr.liability_treatment not in ('recovered','recovery_pending','leogo_absorbs')
 ) then raise exception 'Seller payout recovery responsibility is unresolved'; end if;
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

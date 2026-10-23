-- Run ONLY against isolated staging. Every fixture and business effect rolls back.
begin;
do $$ begin
 if not exists(select 1 from auth.users where email like 'phase1-customer@%') then raise exception 'Isolated staging fixtures required; refusing to run'; end if;
end $$;
insert into public.lipa_pole_pole_settings(id) values(1) on conflict do nothing;
update public.lipa_pole_pole_settings set cancellation_deduction_percent=25 where id=1;
insert into public.delivery_rate_settings(id) values(1) on conflict do nothing;
select set_config('qa.customer',(select id::text from auth.users where email like 'phase1-customer@%' limit 1),true),
 set_config('qa.admin',(select user_id::text from public.admin_users where role='super_admin' and status='active' limit 1),true),
 set_config('qa.product',(select id::text from public.seller_products where fulfilment_type='normal' and product_approval_status='approved' and not has_variants limit 1),true);
select set_config('qa.seller',(select seller_id::text from public.seller_products where id=current_setting('qa.product')::uuid),true);
insert into public.partner_billing_payments(user_id,partner_type,payment_kind,billing_period,unit_amount_kes,payment_reference,payment_status)
values(current_setting('qa.seller')::uuid,'seller','subscription','monthly',500,'QA-ROLLBACK-SUBSCRIPTION','confirmed');
insert into public.partner_subscriptions(user_id,partner_type,last_payment_id,starts_at,ends_at)
select current_setting('qa.seller')::uuid,'seller',id,now(),now()+interval '30 days' from public.partner_billing_payments where payment_reference='QA-ROLLBACK-SUBSCRIPTION';
update public.seller_products set accepts_lipa_pole_pole=true,lipa_pole_pole_first_deposit_kes=50,lipa_pole_pole_max_days=30,quantity_available=20,price_kes=100 where id=current_setting('qa.product')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.customer'),true);
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.customer_open_lipa_pole_pole_account(current_setting('qa.product')::uuid,null,1,'Staging QA','0700000000','cbd',p_payment_reference=>'QA-ROLLBACK-DEPOSIT-001');
 assert r->>'ok'='true','Account creation failed';
 perform set_config('qa.account',r->>'account_id',true);
 perform set_config('qa.total',r->>'total_payable_kes',true);
end $$;
reset role;
do $$ begin
 assert (select status='deposit_pending' and approved_paid_kes=0 and marketplace_order_id is null from public.lipa_pole_pole_accounts where id=current_setting('qa.account')::uuid),'Deposit must require Admin verification';
 assert (select quantity_available=19 from public.seller_products where id=current_setting('qa.product')::uuid),'Stock reservation failed';
end $$;
select set_config('qa.deposit',(select id::text from public.lipa_pole_pole_payments where account_id=current_setting('qa.account')::uuid),true);
set local role authenticated;
do $$ begin
 begin
  perform public.admin_review_lipa_pole_pole_payment(current_setting('qa.deposit')::uuid,true,'Payment notification reference: QA000001');
  raise exception 'QA FAILURE: customer approved payment';
 exception when others then
  if sqlerrm not like '%permission required%' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
set local role authenticated;
select public.admin_review_lipa_pole_pole_payment(current_setting('qa.deposit')::uuid,true,'Payment notification reference: QA000001');
reset role;
do $$ begin
 assert (select status='active' and approved_paid_kes=50 and marketplace_order_id is null from public.lipa_pole_pole_accounts where id=current_setting('qa.account')::uuid),'Partial payment must not create an order';
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.customer'),true);
set local role authenticated;
select public.customer_submit_lipa_pole_pole_payment(current_setting('qa.account')::uuid,current_setting('qa.total')::numeric-50,'QA-ROLLBACK-INSTALMENT-001');
reset role;
select set_config('qa.balance_payment',(select id::text from public.lipa_pole_pole_payments where account_id=current_setting('qa.account')::uuid and payment_type='instalment'),true);
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
set local role authenticated;
select public.admin_review_lipa_pole_pole_payment(current_setting('qa.balance_payment')::uuid,true,'Payment notification reference: QA000002');
reset role;
do $$ begin
 assert (select status='fully_paid' and marketplace_order_id is not null and approved_paid_kes=total_payable_kes from public.lipa_pole_pole_accounts where id=current_setting('qa.account')::uuid),'Fully paid order transition failed';
 assert (select count(*)=1 from public.marketplace_orders where lipa_pole_pole_account_id=current_setting('qa.account')::uuid),'Exactly one normal order must be created';
 assert (select count(*)>0 from public.customer_notifications where source_id=current_setting('qa.account')::uuid),'Customer notification missing';
 assert (select count(*)>0 from public.lipa_pole_pole_events where account_id=current_setting('qa.account')::uuid),'Audit events missing';
end $$;
-- Duplicate verification cannot create a second order.
set local role authenticated;
do $$ begin
 begin
  perform public.admin_review_lipa_pole_pole_payment(current_setting('qa.balance_payment')::uuid,true,'Payment notification reference: QA000002');
  raise exception 'QA FAILURE: duplicate review accepted';
 exception when others then if sqlerrm<>'This payment has already been reviewed' then raise; end if; end;
end $$;
reset role;
-- Independent cancellation/refund account.
select set_config('request.jwt.claim.sub',current_setting('qa.customer'),true);
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.customer_open_lipa_pole_pole_account(current_setting('qa.product')::uuid,null,1,'Staging QA','0700000000','cbd',p_payment_reference=>'QA-ROLLBACK-CANCEL-001');
 perform set_config('qa.cancel_account',r->>'account_id',true);
end $$;
reset role;
select set_config('qa.cancel_deposit',(select id::text from public.lipa_pole_pole_payments where account_id=current_setting('qa.cancel_account')::uuid),true);
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
set local role authenticated;
select public.admin_review_lipa_pole_pole_payment(current_setting('qa.cancel_deposit')::uuid,true,'Payment notification reference: QA000003');
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.customer'),true);
set local role authenticated;
select public.customer_request_lipa_pole_pole_cancellation(current_setting('qa.cancel_account')::uuid,'QA rollback cancellation');
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
set local role authenticated;
select public.admin_review_lipa_pole_pole_cancellation(current_setting('qa.cancel_account')::uuid,true,'QA rollback cancellation approval');
reset role;
do $$ begin
 assert (select status='refund_pending' and refund_due_kes=37.5 and cancellation_deduction_kes=12.5 and stock_released and marketplace_order_id is null from public.lipa_pole_pole_accounts where id=current_setting('qa.cancel_account')::uuid),'Cancellation calculation/stock release failed';
 assert (select quantity_available=19 from public.seller_products where id=current_setting('qa.product')::uuid),'Cancelled reservation must restore stock exactly once';
 assert (select count(*)=1 from public.marketplace_orders where lipa_pole_pole_account_id=current_setting('qa.account')::uuid),'Duplicate review created an order';
end $$;
select 'PASS: reservation, Admin-only verification, partial-payment hold, fully paid order, duplicate review rejection, cancellation/refund calculation, stock, notifications and events; all fixtures rolled back' as result;
rollback;

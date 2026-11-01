-- Execute ONLY on LEOGO Phase 1 Staging. All fixture writes roll back.
begin;
do $$ begin
 if not exists(select 1 from auth.users where email like 'phase1-customer@%') then
  raise exception 'Dedicated staging fixture absent: refusing test';
 end if;
end $$;
select set_config('qa.rent_customer',(select id::text from auth.users where email like 'phase1-customer@%' limit 1),true),
 set_config('qa.rent_admin',(select user_id::text from public.admin_users where role='super_admin' and status='active' limit 1),true);
do $$ begin
 assert current_setting('qa.rent_customer',true) is not null and current_setting('qa.rent_admin',true) is not null,'Fixture IDs missing';
end $$;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_customer'),true);
set local role authenticated;
insert into public.rent_installment_applications(customer_id,full_name,identity_number,house_type,monthly_rent,deposit_amount,payment_frequency,county,sub_county,estate)
values(current_setting('qa.rent_customer')::uuid,'Staging Rent Test','STAGING-ONLY-0001','single_room',12000,4000,'quarterly','047','Nairobi','Test Estate')
returning id;
select set_config('qa.rent_app',(select id::text from public.rent_installment_applications where identity_number='STAGING-ONLY-0001'),true);

-- Customer cannot approve own application or read all applications.
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'review');
  raise exception 'QA FAIL customer performed admin review';
 exception when others then
  if sqlerrm not like '%permission required%' then raise; end if;
 end;
end $$;
insert into public.rent_change_requests(application_id,customer_id,proposed_landlord_account,reason)
values(current_setting('qa.rent_app')::uuid,current_setting('qa.rent_customer')::uuid,'Bank QA Account 001','Landlord supplied updated account details');
reset role;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_admin'),true);
set local role authenticated;
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'review');
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'apply_change',jsonb_build_object('request_id',(select id from public.rent_change_requests where application_id=current_setting('qa.rent_app')::uuid)));
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'verify_landlord','{"landlord_name":"Staging Landlord","account":"Bank QA Account 001"}');
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'approve',jsonb_build_object('starts_on',current_date::text));
do $$ begin
 assert (select count(*)=5 from public.rent_payment_schedule where application_id=current_setting('qa.rent_app')::uuid),'Expected 4 quarterly rent bills and one deposit';
 assert (select sum(amount)=148000 from public.rent_payment_schedule where application_id=current_setting('qa.rent_app')::uuid),'Annual rent and deposit total wrong';
end $$;
-- Activation cannot proceed before customer accepts terms.
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'activate');
  raise exception 'QA FAIL activated without customer approval';
 exception when others then if sqlerrm not like '%acceptance required%' then raise; end if;
 end;
end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_customer'),true);
set local role authenticated;
select public.rent_accept_terms(current_setting('qa.rent_app')::uuid);
reset role;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_admin'),true);
set local role authenticated;
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'activate');
reset role;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_customer'),true);
set local role authenticated;
insert into public.rent_payment_claims(application_id,schedule_id,customer_id,provider,transaction_reference,amount,paid_on)
values(current_setting('qa.rent_app')::uuid,(select id from public.rent_payment_schedule where application_id=current_setting('qa.rent_app')::uuid and category='rent' and sequence_no=1),current_setting('qa.rent_customer')::uuid,'Staging Bank','QA-RENT-RECEIPT-01',36000,current_date);
select set_config('qa.rent_claim',(select id::text from public.rent_payment_claims where transaction_reference='QA-RENT-RECEIPT-01'),true);
-- Customer cannot verify a receipt.
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'verify_payment',jsonb_build_object('claim_id',current_setting('qa.rent_claim')));
  raise exception 'QA FAIL customer verified own receipt';
 exception when others then if sqlerrm not like '%permission required%' then raise; end if;
 end;
end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('qa.rent_admin'),true);
set local role authenticated;
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'verify_payment',jsonb_build_object('claim_id',current_setting('qa.rent_claim')));
-- Reviewing the same receipt twice must fail; no duplicate ledger credit.
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'verify_payment',jsonb_build_object('claim_id',current_setting('qa.rent_claim')));
  raise exception 'QA FAIL receipt verified twice';
 exception when others then if sqlerrm not like '%Unreviewed claim%' then raise; end if;
 end;
end $$;
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'settle','{"amount":36001,"external_reference":"QA-RENT-PAYOUT-OVER","settled_on":"2026-11-01"}');
  raise exception 'QA FAIL settled above verified funds';
 exception when others then if sqlerrm not like '%Insufficient externally verified%' then raise; end if;
 end;
end $$;
select public.rent_admin_action(current_setting('qa.rent_app')::uuid,'settle',jsonb_build_object('amount',36000,'external_reference','QA-RENT-PAYOUT-01','settled_on',current_date::text));
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'settle',jsonb_build_object('amount',1,'external_reference','QA-RENT-PAYOUT-02','settled_on',current_date::text));
  raise exception 'QA FAIL double settlement';
 exception when others then if sqlerrm not like '%Insufficient externally verified%' then raise; end if;
 end;
end $$;
do $$ begin
 assert (select sum(amount)=36000 from public.rent_landlord_settlements where application_id=current_setting('qa.rent_app')::uuid),'Payout record wrong';
 assert (select status='active' from public.rent_installment_applications where id=current_setting('qa.rent_app')::uuid),'Plan not active';
end $$;
reset role;
-- The same external reference cannot be approved against a second scheduled bill.
select set_config('request.jwt.claim.sub',current_setting('qa.rent_customer'),true);
set local role authenticated;
insert into public.rent_payment_claims(application_id,schedule_id,customer_id,provider,transaction_reference,amount,paid_on)
values(current_setting('qa.rent_app')::uuid,(select id from public.rent_payment_schedule where application_id=current_setting('qa.rent_app')::uuid and category='rent' and sequence_no=2),current_setting('qa.rent_customer')::uuid,'Staging Bank','QA-RENT-RECEIPT-01',1000,current_date);
select set_config('qa.duplicate_claim',(select id::text from public.rent_payment_claims where transaction_reference='QA-RENT-RECEIPT-01' and status='submitted'),true);
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.rent_admin'),true);
set local role authenticated;
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'verify_payment',jsonb_build_object('claim_id',current_setting('qa.duplicate_claim')));
  raise exception 'QA FAIL duplicated reference verified';
 exception when unique_violation then null;
 end;
end $$;
reset role;
-- Pending customer-requested account changes freeze payout even when funds were verified.
select set_config('request.jwt.claim.sub',current_setting('qa.rent_customer'),true);
set local role authenticated;
insert into public.rent_change_requests(application_id,customer_id,proposed_landlord_account,reason)
values(current_setting('qa.rent_app')::uuid,current_setting('qa.rent_customer')::uuid,'New unverified bank account','Need to correct landlord destination');
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.rent_admin'),true);
set local role authenticated;
do $$ begin
 begin
  perform public.rent_admin_action(current_setting('qa.rent_app')::uuid,'settle',jsonb_build_object('amount',1,'external_reference','QA-RENT-PAYOUT-03','settled_on',current_date::text));
  raise exception 'QA FAIL settlement during pending landlord amendment';
 exception when others then if sqlerrm not like '%Pending change blocks settlement%' then raise; end if;
 end;
end $$;
reset role;
-- Unrelated authenticated identity cannot read applicant, changes, receipts or settlements.
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from public.rent_installment_applications where id=current_setting('qa.rent_app')::uuid),'Cross-tenant application leak';
 assert (select count(*)=0 from public.rent_payment_claims where application_id=current_setting('qa.rent_app')::uuid),'Cross-tenant payment leak';
 assert (select count(*)=0 from public.rent_landlord_settlements where application_id=current_setting('qa.rent_app')::uuid),'Cross-tenant settlement leak';
end $$;
reset role;
rollback;

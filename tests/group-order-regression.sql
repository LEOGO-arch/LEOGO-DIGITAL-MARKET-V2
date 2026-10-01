-- Run against the LEOGO schema. Every fixture and notification is rolled back.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table qa_results (scenario text, result text) on commit drop;
create function pg_temp.expect_error(q text, fragment text) returns text language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(fragment in sqlerrm)>0 then return 'PASS: '||sqlerrm; end if;
    return 'UNEXPECTED ERROR: '||sqlerrm;
  end;
  return 'FAIL: accepted';
end $$;
do $$
declare seller uuid; cust uuid; cust2 uuid; adm uuid; prod uuid; camp uuid; part uuid; part2 uuid; r jsonb; s jsonb; g jsonb; n numeric;
begin
 select id,seller_id into prod,seller from public.seller_products where product_approval_status='approved' and not has_variants and availability_status='available' limit 1;
 select user_id into cust from public.customer_profiles limit 1;
 select id into cust2 from auth.users where id<>cust and id<>seller and id not in (select user_id from public.admin_users) limit 1;
 select user_id into adm from public.admin_users where status='active' and role in ('admin','super_admin') limit 1;
 if prod is null or cust is null or cust2 is null or adm is null then raise exception 'Missing QA fixture'; end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 s:=jsonb_build_object('fulfilment_type','normal','origin_type','local','origin_country','Kenya','origin_county_region','Siaya','origin_town_city','Siaya Town','same_town_min',30,'same_town_max',60,'same_town_unit','minutes');
 perform public.seller_save_product_shipping(prod,s,null);
 insert into qa_results select 'Normal shipping profile persists',case when exists(select 1 from public.product_shipping_profiles where product_id=prod and same_town_unit='minutes') then 'PASS' else 'FAIL' end;
 perform public.seller_save_product_shipping(prod,s||'{"fulfilment_type":"preorder"}',null);
 insert into qa_results select 'Pre-Order type persists',case when exists(select 1 from public.seller_products where id=prod and fulfilment_type='preorder') then 'PASS' else 'FAIL' end;
 g:=jsonb_build_object('minimum_quantity',3,'maximum_quantity',4,'customer_unit_price_kes',100,'opening_at',now()-interval '1 day','closing_at',now()+interval '2 days','expected_dispatch_date',current_date+3,'expected_delivery_from',current_date+4,'expected_delivery_to',current_date+5,'close_policy','deadline');
 r:=public.seller_save_product_shipping(prod,s||'{"fulfilment_type":"group_order"}',g-'expected_dispatch_date');camp:=(r->>'campaign_id')::uuid;
 insert into qa_results
 select 'Optional Group dispatch date',
        case when expected_dispatch_date is null then 'PASS' else 'FAIL: dispatch date unexpectedly required' end
 from public.group_order_campaigns where id=camp;
 r:=public.seller_save_product_shipping(prod,s||'{"fulfilment_type":"group_order"}',g);camp:=(r->>'campaign_id')::uuid;
 perform set_config('request.jwt.claim.sub',cust::text,true);
 insert into qa_results values ('Reject zero quantity',pg_temp.expect_error(format('select public.customer_join_group_order(%L::uuid,0,''till'',''QA-REF'')',camp),'Quantity must be greater'));
 r:=public.customer_join_group_order(camp,2,'till','QA-REF-ONE');part:=(r->>'participation_id')::uuid;
 perform set_config('request.jwt.claim.sub',cust2::text,true);
 r:=public.customer_join_group_order(camp,1,'till','QA-REF-TWO');part2:=(r->>'participation_id')::uuid;
 insert into qa_results select 'Multi-customer quantity based MOQ',case when quantity_committed=3 and participant_count=2 and status='moq_reached' then 'PASS' else 'FAIL' end from public.group_order_campaigns where id=camp;
 insert into qa_results values ('Maximum quantity',pg_temp.expect_error(format('select public.customer_join_group_order(%L::uuid,2,''till'',''QA-MAX'')',camp),'units remain'));
 perform set_config('request.jwt.claim.sub',seller::text,true);
 insert into qa_results values ('Seller cannot bypass Admin confirmation',pg_temp.expect_error(format('select public.seller_update_group_order_status(%L::uuid,''seller_preparing'',null)',camp),'Admin must confirm'));
 insert into qa_results values ('Seller campaign terms locked after join',pg_temp.expect_error(format('select public.seller_save_product_shipping(%L::uuid,%L::jsonb,%L::jsonb)',prod,s||'{"fulfilment_type":"group_order"}',g||jsonb_build_object('closing_at',now()+interval '3 days')),'terms are locked'));
 insert into qa_results values ('Joined campaign price is immutable',pg_temp.expect_error(format('select public.seller_save_product_shipping(%L::uuid,%L::jsonb,%L::jsonb)',prod,s||'{"fulfilment_type":"group_order"}',g||'{"customer_unit_price_kes":999}'),'terms are locked'));
 insert into qa_results values ('Joined Group cannot be removed by Seller',pg_temp.expect_error(format('select public.seller_save_product_shipping(%L::uuid,%L::jsonb,null)',prod,s),'already joined'));
 perform set_config('request.jwt.claim.sub',adm::text,true);
 insert into qa_results values ('Admin must review submitted payments',pg_temp.expect_error(format('select public.admin_manage_group_order(%L::uuid,''confirm'',null,null)',camp),'Review all submitted'));
 perform public.admin_review_group_order_payment(part,'verify',null);
 perform public.admin_review_group_order_payment(part2,'verify',null);
 insert into qa_results select 'Verified payments remain held',case when count(*)=2 then 'PASS' else 'FAIL' end from public.group_order_participations where campaign_id=camp and payment_status='verified_paid' and settlement_status='held';
 perform public.admin_manage_group_order(camp,'confirm',null,null);
 perform set_config('request.jwt.claim.sub',seller::text,true);
 perform public.seller_save_product_shipping(prod,s||'{"fulfilment_type":"group_order"}',g);
 insert into qa_results values ('Unchanged Shipping edit after Admin confirmation','PASS');
 insert into qa_results values ('Seller cannot skip preparation',pg_temp.expect_error(format('select public.seller_update_group_order_status(%L::uuid,''in_transit'',null)',camp),'previous Group Order stage'));
 perform public.seller_update_group_order_status(camp,'seller_preparing',null);
 perform public.seller_update_group_order_status(camp,'dispatched_origin',null);
 perform public.seller_update_group_order_status(camp,'in_transit',null);
 perform public.seller_update_group_order_status(camp,'arrived_destination',null);
 insert into qa_results values ('Seller sequence progresses','PASS');
 perform set_config('request.jwt.claim.sub',adm::text,true);
 insert into qa_results values ('Admin cannot skip final delivery sequence',pg_temp.expect_error(format('select public.admin_manage_group_order(%L::uuid,''delivered_collected'',null,null)',camp),'Ready for Pickup'));
 perform public.admin_manage_group_order(camp,'at_sorting_center',null,null);
 perform public.admin_manage_group_order(camp,'out_for_delivery',null,null);
 perform public.admin_manage_group_order(camp,'ready_pickup',null,null);
 perform public.admin_manage_group_order(camp,'delivered_collected',null,null);
 insert into qa_results select 'Settlement only eligible after delivery',case when count(*)=2 then 'PASS' else 'FAIL' end from public.group_order_participations where campaign_id=camp and settlement_status='eligible';
 perform set_config('request.jwt.claim.sub',seller::text,true);
 r:=public.seller_save_product_shipping(prod,s||'{"fulfilment_type":"group_order"}',g||'{"minimum_quantity":10,"maximum_quantity":20}');camp:=(r->>'campaign_id')::uuid;
 perform set_config('request.jwt.claim.sub',cust::text,true);
 r:=public.customer_join_group_order(camp,1,'till','QA-REFUND-A');part:=(r->>'participation_id')::uuid;
 perform set_config('request.jwt.claim.sub',cust2::text,true);
 r:=public.customer_join_group_order(camp,1,'till','QA-REFUND-B');part2:=(r->>'participation_id')::uuid;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform public.admin_review_group_order_payment(part,'verify',null);
 update public.group_order_campaigns set closing_at=now()-interval '1 minute' where id=camp;
 perform private.close_expired_group_campaigns();
 insert into qa_results select 'Failed deadline blocks verified settlement',case when status='moq_failed_closed' and refund_status='resolution_required' then 'PASS' else 'FAIL' end from public.group_order_campaigns where id=camp;
 perform public.admin_complete_group_order_refund(part,'QA-REFUND-COMPLETED',null);
 insert into qa_results select 'Refund completion with unreviewed second payment',status||' / '||refund_status from public.group_order_campaigns where id=camp;
 perform public.admin_review_group_order_payment(part2,'verify',null);
 insert into qa_results values ('Late payment verification after first refund','PASS');
 perform public.admin_complete_group_order_refund(part2,'QA-REFUND-TWO-COMPLETED',null);
 insert into qa_results select 'Campaign completed after final refund',status||' / '||refund_status from public.group_order_campaigns where id=camp;
 insert into qa_results select 'Refund audit exists',case when exists(select 1 from public.admin_audit_log where action='group_order.refund.completed') then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
 if exists(select 1 from qa_results where result not like 'PASS%' and not
   (scenario='Refund completion with unreviewed second payment' and result='moq_failed_closed / resolution_required') and not
   (scenario='Campaign completed after final refund' and result='refunded / completed')) then
   raise exception 'Group Order regression failed';
 end if;
end $$;
select * from qa_results;
rollback;

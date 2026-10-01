-- Run against the LEOGO schema. All changes are rolled back.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table qa_results (scenario text, result text) on commit drop;
do $$
declare prod uuid; seller uuid; cust uuid; adm uuid; r jsonb; camp uuid; part uuid; second uuid; s jsonb; g jsonb; rows jsonb;
begin
 select id,seller_id into prod,seller from public.seller_products where product_approval_status='approved' and not has_variants limit 1;
 select user_id into cust from public.customer_profiles limit 1;
 select user_id into adm from public.admin_users where status='active' and role in ('admin','super_admin') limit 1;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 s:=jsonb_build_object('fulfilment_type','group_order','origin_type','international','origin_country','China','international_min',20,'international_max',25,'international_unit','days');
 g:=jsonb_build_object('minimum_quantity',2,'maximum_quantity',3,'customer_unit_price_kes',100,'opening_at',now()-interval '2 days','closing_at',now()+interval '1 day','expected_dispatch_date',current_date+3,'expected_delivery_from',current_date+4,'close_policy','moq');
 r:=public.seller_save_product_shipping(prod,s,g);camp:=(r->>'campaign_id')::uuid;
 perform set_config('request.jwt.claim.sub',cust::text,true);
 r:=public.customer_join_group_order(camp,1,'till','QA-MOQ-ONE');part:=(r->>'participation_id')::uuid;
 r:=public.customer_join_group_order(camp,1,'till','QA-MOQ-TWO');second:=(r->>'participation_id')::uuid;
 rows:=public.customer_list_group_orders();
 insert into qa_results values ('Customer own participation screen RPC',case when jsonb_array_length(rows)=2 then 'PASS' else 'FAIL' end);
 begin perform public.customer_join_group_order(camp,1,'till','QA-MOQ-THREE');insert into qa_results values ('Close at MOQ','FAIL: accepted'); exception when others then insert into qa_results values ('Close at MOQ',sqlerrm);end;
 begin perform public.admin_manage_group_order(camp,'confirm',null,null);insert into qa_results values ('Customer cannot act as Admin','FAIL: accepted');exception when others then insert into qa_results values ('Customer cannot act as Admin',sqlerrm);end;
 begin perform public.seller_save_product_shipping(prod,s,g);insert into qa_results values ('Customer cannot edit seller shipping','FAIL: accepted');exception when others then insert into qa_results values ('Customer cannot edit seller shipping',sqlerrm);end;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 rows:=public.seller_list_group_orders();insert into qa_results values ('Seller campaign screen RPC',case when jsonb_array_length(rows)=1 then 'PASS' else 'FAIL' end);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 rows:=public.admin_list_group_orders();insert into qa_results values ('Admin campaign participant screen RPC',case when jsonb_array_length(rows->0->'participants')=2 then 'PASS' else 'FAIL' end);
 perform public.admin_review_group_order_payment(part,'verify',null);
 perform public.admin_review_group_order_payment(second,'reject',null);
 insert into qa_results select 'Reject drops below MOQ before deadline',status||' / qty '||quantity_committed from public.group_order_campaigns where id=camp;
 perform set_config('request.jwt.claim.sub',cust::text,true);
 r:=public.customer_join_group_order(camp,1,'till','QA-MOQ-REPLACEMENT');second:=(r->>'participation_id')::uuid;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 update public.group_order_campaigns set closing_at=now()-interval '1 minute' where id=camp;
 perform public.admin_review_group_order_payment(second,'reject',null);
 perform private.close_expired_group_campaigns();
 insert into qa_results select 'Reject drops below MOQ after deadline',status||' / refund '||refund_status||' / qty '||quantity_committed from public.group_order_campaigns where id=camp;
 insert into qa_results select 'Verified participant after below-MOQ expired campaign',payment_status||' / settlement '||settlement_status||' / refund '||refund_status from public.group_order_participations where id=part;
 begin perform public.admin_manage_group_order(camp,'confirm',null,null);insert into qa_results values ('Confirm after expired below MOQ','accepted');exception when others then insert into qa_results values ('Confirm after expired below MOQ',sqlerrm);end;
end $$;
do $$ begin
 if exists(select 1 from qa_results where result<>'PASS' and not
  (scenario='Close at MOQ' and result='This campaign closed when MOQ was reached') and not
  (scenario='Customer cannot act as Admin' and result='Admin order management permission required') and not
  (scenario='Customer cannot edit seller shipping' and result='Seller product not found') and not
  (scenario='Reject drops below MOQ before deadline' and result='collecting_orders / qty 1') and not
  (scenario='Reject drops below MOQ after deadline' and result='moq_failed_closed / refund resolution_required / qty 1') and not
  (scenario='Verified participant after below-MOQ expired campaign' and result='verified_paid / settlement blocked_refund / refund pending') and not
  (scenario='Confirm after expired below MOQ' and result='MOQ must be reached before Admin confirmation')) then
  raise exception 'MOQ boundary regression failed';
 end if;
end $$;
select * from qa_results;
rollback;

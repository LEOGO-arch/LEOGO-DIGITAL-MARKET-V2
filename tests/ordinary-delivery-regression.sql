-- Run against the LEOGO schema. Storage metadata fixtures and orders are rolled back.
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
declare prod uuid; seller uuid; cust uuid; adm uuid; rider uuid; partner uuid; station uuid; r jsonb; v_order_id uuid; seller_order uuid; job uuid; typ text; zone text; photo text; qty numeric;
begin
 select id,seller_id,quantity_available into prod,seller,qty from public.seller_products where product_approval_status='approved' and not has_variants and availability_status='available' limit 1;
 select user_id into cust from public.customer_profiles limit 1;
 select user_id into adm from public.admin_users where status='active' and role in ('admin','super_admin') limit 1;
 select user_id into rider from public.leogo_staff where staff_role='rider' and status='active' and availability_status<>'off_duty' limit 1;
 select pa.user_id,pa.pickup_station_id into partner,station from public.pickup_station_partner_accounts pa join public.pickup_stations ps on ps.id=pa.pickup_station_id where pa.status='active' and ps.is_active limit 1;
 if prod is null or cust is null or adm is null or rider is null or partner is null then raise exception 'Missing checkout fixture'; end if;
 update public.seller_products set quantity_available=100,availability_status='available' where id=prod;
 foreach typ in array array['normal','preorder','group_order'] loop
  perform set_config('request.jwt.claim.sub',adm::text,true);
  update public.seller_products set fulfilment_type=typ where id=prod;
  perform set_config('request.jwt.claim.sub',cust::text,true);
  if typ='group_order' then
   insert into qa_results values ('Group excluded from ordinary cart RPC',pg_temp.expect_error(format('select public.customer_create_marketplace_order(%L::jsonb,''QA Receiver'',''0700000000'',''cbd'',''Siaya'',''Siaya'',''QA Estate'',''QA Landmark'',null,null,''till'',''QA'')',jsonb_build_array(jsonb_build_object('product_id',prod,'quantity',1))),'Use Join Group Order'));
  else
   r:=public.customer_create_marketplace_order(jsonb_build_array(jsonb_build_object('product_id',prod,'quantity',1)),'QA Receiver','0700000000','cbd','Siaya','Siaya','QA Estate','QA Landmark',null,null,'cod','QA rollback only');
   insert into qa_results values (typ||' ordinary COD checkout',case when r->>'payment_status'='cod_due' and (r->>'grand_total_kes')::numeric=(r->>'items_subtotal_kes')::numeric+(r->>'service_fee_kes')::numeric+(r->>'delivery_fee_kes')::numeric then 'PASS' else 'FAIL' end);
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',adm::text,true);update public.seller_products set fulfilment_type='normal' where id=prod;
 foreach zone in array array['cbd','pickup'] loop
  perform set_config('request.jwt.claim.sub',cust::text,true);
  r:=public.customer_create_marketplace_order(jsonb_build_array(jsonb_build_object('product_id',prod,'quantity',1)),'QA Receiver','0700000000',zone,'Siaya','Siaya','QA Estate','QA Landmark',null,case when zone='pickup' then station else null end,'cod','QA rollback only');v_order_id:=(r->>'order_id')::uuid;
  insert into qa_results values (zone||' checkout fee calculation',case when (r->>'grand_total_kes')::numeric=(r->>'items_subtotal_kes')::numeric+(r->>'service_fee_kes')::numeric+(r->>'pickup_fee_kes')::numeric+(r->>'delivery_fee_kes')::numeric then 'PASS' else 'FAIL' end);
  perform set_config('request.jwt.claim.sub',seller::text,true);
  select so.id into seller_order from public.marketplace_seller_orders so where so.order_id=v_order_id;
  perform public.seller_update_order_status(seller_order,'received');
  perform public.seller_update_order_status(seller_order,'packed_ready');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  r:=public.admin_assign_rider_to_order(v_order_id,rider);job:=(r->>'delivery_job_id')::uuid;
  perform set_config('request.jwt.claim.sub',rider::text,true);
  perform public.rider_update_delivery_status_v3(job,'picked_up',null,false);
  perform public.rider_update_delivery_status_v3(job,'arrived_sorting_center',null,false);
  perform set_config('request.jwt.claim.sub',adm::text,true);
  perform public.admin_update_sorting_center_status(v_order_id,'sorting_received');
  perform public.admin_update_sorting_center_status(v_order_id,'ready_for_dispatch');
  perform set_config('request.jwt.claim.sub',rider::text,true);
  perform public.rider_update_delivery_status_v3(job,'on_the_way',null,false);
  if zone='cbd' then
   insert into qa_results values ('Rider COD handover requires confirmation',pg_temp.expect_error(format('select public.rider_update_delivery_status_v3(%L::uuid,''delivered'',null,false)',job),'Confirm that full COD'));
   perform public.rider_update_delivery_status_v3(job,'delivered',null,true);
   insert into qa_results select 'Normal Rider delivery and COD completion',case when order_status='delivered' and payment_status='cod_paid' then 'PASS' else 'FAIL' end from public.marketplace_orders where id=v_order_id;
  else
   insert into qa_results values ('Rider cannot complete Pickup Station order',pg_temp.expect_error(format('select public.rider_update_delivery_status_v3(%L::uuid,''delivered'',null,true)',job),'completed by the Pickup Station Partner'));
   perform public.rider_update_delivery_status_v3(job,'delivered_to_pickup_station',null,false);
   insert into qa_results select 'Rider arrival awaits station receipt',case when status='arrived_pending_receipt' then 'PASS' else 'FAIL' end from public.pickup_station_parcels where pickup_station_parcels.order_id=v_order_id;
   perform set_config('request.jwt.claim.sub',partner::text,true);
   photo:=partner::text||'/qa-rollback-only.jpg';
   insert into storage.objects(bucket_id,name) values ('pickup-station-proof',photo);
   perform public.pickup_partner_receive_parcel((select order_reference from public.marketplace_orders where id=v_order_id),photo,null);
   insert into qa_results select 'Station receipt sets ready for pickup',case when status='ready_for_pickup' then 'PASS' else 'FAIL' end from public.marketplace_delivery_jobs where id=job;
   perform public.pickup_partner_handover_parcel((select order_reference from public.marketplace_orders where id=v_order_id),photo,'QA-ID-0000',null);
   insert into qa_results select 'Station handover completes COD order',case when order_status='delivered' and payment_status='cod_paid' then 'PASS' else 'FAIL' end from public.marketplace_orders where id=v_order_id;
  end if;
 end loop;
end $$;
do $$ begin
 if exists(select 1 from qa_results where result not like 'PASS%') then
  raise exception 'Ordinary delivery regression failed';
 end if;
end $$;
select * from qa_results;
rollback;

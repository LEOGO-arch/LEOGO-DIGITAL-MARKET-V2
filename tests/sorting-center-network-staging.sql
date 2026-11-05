-- Run only on a disposable/staging project. All records are rolled back.
begin;
do $$
declare
  v_seller uuid;
  v_customer uuid;
  v_dispatcher uuid;
  v_seller_county text;
  v_destination_county text;
  v_origin uuid:=gen_random_uuid();
  v_destination uuid:=gen_random_uuid();
  v_order1 uuid;
  v_order2 uuid;
  v_seller_order1 uuid;
  v_seller_order2 uuid;
  v_parcel1 uuid;
  v_parcel2 uuid;
  v_shipment jsonb;
  v_duplicate_denied boolean:=false;
  v_events jsonb;
  v_incidents integer;
  v_notifications integer;
begin
  select user_id,county into v_seller,v_seller_county
  from public.seller_accounts where application_status='approved' and county is not null limit 1;
  select id into v_customer from auth.users
  where id<>v_seller and not exists(select 1 from public.seller_accounts s where s.user_id=auth.users.id) limit 1;
  select id into v_dispatcher from auth.users where id not in (v_seller,v_customer) limit 1;
  if v_seller is null or v_customer is null or v_dispatcher is null then
    raise exception 'Insufficient synthetic staging identities';
  end if;
  v_destination_county:=case when lower(v_seller_county)='nairobi' then 'Siaya' else 'Nairobi' end;
  insert into public.sorting_centers(id,center_code,center_name,center_type,county,physical_address)
  values(v_origin,'TST'||upper(substr(replace(v_origin::text,'-',''),1,4)),'Staging Origin Center','county',v_seller_county,'staging-only'),
        (v_destination,'TST'||upper(substr(replace(v_destination::text,'-',''),1,4)),'Staging Destination Center','county',v_destination_county,'staging-only');
  update public.sorting_centers set is_active=false where id=v_destination;
  insert into public.sorting_center_routes(origin_center_id,destination_center_id,estimated_hours)
  values(v_origin,v_destination,24);
  insert into public.marketplace_orders(order_reference,customer_id,receiver_name,contact_number,delivery_zone,county,sub_county,items_subtotal_kes,grand_total_kes,external_amount_due_kes,payment_method,payment_status)
  values('STG-SORT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_customer,'Staging Customer','0700000000','outside',v_destination_county,'Test Subcounty',100,100,100,'cod','cod_due') returning id into v_order1;
  insert into public.marketplace_orders(order_reference,customer_id,receiver_name,contact_number,delivery_zone,county,sub_county,items_subtotal_kes,grand_total_kes,external_amount_due_kes,payment_method,payment_status)
  values('STG-SORT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_customer,'Staging Customer','0700000000','outside',v_destination_county,'Test Subcounty',100,100,100,'cod','cod_due') returning id into v_order2;
  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes,fulfilment_status,packed_ready_at)
  values(v_order1,v_seller,100,'packed_ready',now()) returning id into v_seller_order1;
  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes,fulfilment_status,packed_ready_at)
  values(v_order2,v_seller,100,'packed_ready',now()) returning id into v_seller_order2;
  insert into public.leogo_staff(user_id,display_name,staff_role,status)
  values(v_seller,'Staging Sorting Manager','rider','active') on conflict(user_id) do update set display_name=excluded.display_name,status='active';
  insert into public.leogo_staff(user_id,display_name,staff_role,status)
  values(v_dispatcher,'Staging Dispatch Receiver','rider','active') on conflict(user_id) do update set display_name=excluded.display_name,status='active';
  insert into public.sorting_center_staff(center_id,user_id,role)
  values(v_origin,v_seller,'manager'),(v_origin,v_dispatcher,'dispatch_officer'),(v_destination,v_dispatcher,'receiving_officer'),(v_destination,v_seller,'manager');
  perform set_config('request.jwt.claim.sub',v_seller::text,true);
  begin
    perform public.sorting_staff_list_parcels(v_destination,null);
    raise exception 'Inactive center records were accessible';
  exception when others then
    if sqlerrm<>'Sorting center access required' then raise; end if;
  end;
  update public.sorting_centers set is_active=true where id=v_destination;
  perform set_config('request.jwt.claim.sub',v_seller::text,true);
  v_parcel1:=(public.seller_book_order_to_sorting_center(v_seller_order1,v_origin,null)->>'parcel_id')::uuid;
  v_parcel2:=(public.seller_book_order_to_sorting_center(v_seller_order2,v_origin,null)->>'parcel_id')::uuid;
  perform public.seller_confirm_sorting_center_handover(v_parcel1,'staging test');
  perform public.seller_confirm_sorting_center_handover(v_parcel2,'staging test');
  perform public.sorting_staff_record_parcel(v_parcel1,'receive',null,null,'staging scan');
  perform public.sorting_staff_record_parcel(v_parcel2,'receive',null,null,'staging scan');
  perform public.sorting_staff_record_parcel(v_parcel1,'sort',v_destination,null,'staging sort');
  perform public.sorting_staff_record_parcel(v_parcel2,'sort',v_destination,null,'staging sort');
  v_shipment:=public.sorting_staff_create_shipment(v_origin,v_destination,array[v_parcel1,v_parcel2]);
  begin
    perform public.sorting_staff_create_shipment(v_origin,v_destination,array[v_parcel1]);
  exception when others then
    if sqlerrm like '%not active in another shipment%' then v_duplicate_denied:=true; else raise; end if;
  end;
  if not v_duplicate_denied then raise exception 'Active parcel was allowed into a second shipment'; end if;
  perform set_config('request.jwt.claim.sub',v_dispatcher::text,true);
  perform public.sorting_staff_update_shipment((v_shipment->>'shipment_id')::uuid,'verify',null,null,null,null);
  perform set_config('request.jwt.claim.sub',v_seller::text,true);
  perform public.sorting_staff_update_shipment((v_shipment->>'shipment_id')::uuid,'dispatch',null,'staging handover',null,null);
  perform set_config('request.jwt.claim.sub',v_dispatcher::text,true);
  perform public.sorting_staff_update_shipment((v_shipment->>'shipment_id')::uuid,'receive',null,'one parcel missing, one damaged',array[v_parcel1],array[v_parcel1]);
  select count(*) into v_incidents from public.sorting_parcel_incidents
  where shipment_id=(v_shipment->>'shipment_id')::uuid and incident_type in ('missing','damaged');
  select count(*) into v_notifications from public.sorting_center_notifications where parcel_id in (v_parcel1,v_parcel2);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_events:=public.customer_list_sorting_order_tracking(v_order1)->'events';
  if v_incidents<>2 then raise exception 'Expected missing and damaged incidents, got %',v_incidents; end if;
  if v_notifications<4 then raise exception 'Expected center booking and handover notifications, got %',v_notifications; end if;
  if jsonb_array_length(v_events)<5 then raise exception 'Customer verified tracking events missing'; end if;
  if exists(select 1 from public.sorting_shipment_parcels where parcel_id in (v_parcel1,v_parcel2) and is_active) then raise exception 'Shipment parcel links were not released at receipt'; end if;
  raise notice 'PASS: booking, handover notices, physical receipt, sort, consolidation, second-person verification, dispatch, missing/damaged handling, customer tracking and active-shipment guard.';
end $$;
rollback;

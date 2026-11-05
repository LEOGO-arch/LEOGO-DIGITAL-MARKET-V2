-- Staging only. Direct Rider delivery and Pickup Station collection; rollback all fixtures.
begin;
do $$
declare
  v_seller uuid; v_customer uuid; v_rider uuid; v_center uuid:=gen_random_uuid(); v_station uuid:=gen_random_uuid();
  v_order uuid; v_seller_order uuid; v_parcel uuid; v_job uuid; v_station_parcel uuid;
  v_county text; v_zone text; v_pickup_order uuid; v_details jsonb;
begin
  select user_id,county into v_seller,v_county from public.seller_accounts where application_status='approved' and county is not null limit 1;
  select u.id into v_customer from auth.users u where u.id<>v_seller and not exists(select 1 from public.seller_accounts x where x.user_id=u.id) limit 1;
  select id into v_rider from auth.users where id not in (v_seller,v_customer) limit 1;
  if v_seller is null or v_customer is null or v_rider is null then raise exception 'Need seller, customer, and Rider test identities'; end if;
  insert into public.wallet_settings(id,reward_minimum_spend_kes,reward_rate)
    values(1,999999999,0.001) on conflict(id) do update set reward_minimum_spend_kes=excluded.reward_minimum_spend_kes;
  insert into public.leogo_staff(user_id,display_name,staff_role,status) values(v_rider,'Staging Rider','rider','active')
    on conflict(user_id) do update set staff_role='rider',status='active';
  insert into public.sorting_centers(id,center_code,center_name,center_type,county,physical_address)
    values(v_center,'LM'||upper(substr(replace(v_center::text,'-',''),1,5)),'Staging Last Mile Center','county',v_county,'staging');
  insert into public.pickup_stations(id,station_name,county,sub_county,town,address_line)
    values(v_station,'Staging Pickup Station',v_county,'Staging Subcounty','Staging Town','staging');

  foreach v_zone in array array['outside','pickup'] loop
    insert into public.marketplace_orders(order_reference,customer_id,receiver_name,contact_number,delivery_zone,
      county,sub_county,pickup_station_id,items_subtotal_kes,grand_total_kes,external_amount_due_kes,payment_method,payment_status,order_status)
    values('STG-LM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_customer,'Test Customer','0700000000',v_zone,
      v_county,'Staging Subcounty',case when v_zone='pickup' then v_station end,100,100,100,'cod','cod_paid','processing') returning id into v_order;
    if v_zone='pickup' then v_pickup_order:=v_order; end if;
    insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes,fulfilment_status,packed_ready_at)
      values(v_order,v_seller,100,'packed_ready',now()) returning id into v_seller_order;
    insert into public.sorting_parcels(order_id,seller_order_id,origin_center_id,current_center_id,status,booked_by)
      values(v_order,v_seller_order,v_center,v_center,'ready_for_last_mile',v_seller) returning id into v_parcel;
    insert into public.marketplace_delivery_jobs(order_id,rider_id,status,assigned_at,assigned_by,updated_at)
      values(v_order,v_rider,'assigned',now(),v_customer,now()) returning id into v_job;

    perform set_config('request.jwt.claim.sub',v_rider::text,true);
    v_details:=public.rider_list_sorting_center_pickups();
    if not exists(select 1 from jsonb_array_elements(v_details) x where x->>'order_id'=v_order::text) then
      raise exception 'Assigned Rider cannot see Sorting Center pickup details';
    end if;
    perform public.rider_update_delivery_status_v3(v_job,'picked_up','Staging center handover',false);
    if (select status from public.marketplace_delivery_jobs where id=v_job)<>'ready_for_dispatch'
       or (select status from public.sorting_parcels where id=v_parcel)<>'handed_to_rider' then
      raise exception 'Rider handover did not move parcel into existing delivery flow';
    end if;
    perform public.rider_update_delivery_status_v3(v_job,'on_the_way','Staging final leg',false);
    if v_zone='pickup' then
      perform public.rider_update_delivery_status_v3(v_job,'delivered_to_pickup_station','Staging station arrival',false);
      select p.id into v_station_parcel from public.pickup_station_parcels p where p.order_id=v_order;
      update public.pickup_station_parcels set status='received',received_at=now(),received_by=v_customer,
        receive_photo_path='staging/receive.jpg',updated_at=now() where id=v_station_parcel;
      update public.marketplace_delivery_jobs set status='ready_for_pickup',updated_at=now() where id=v_job;
      update public.pickup_station_parcels set status='handed_over',handed_over_at=now(),handed_over_by=v_customer,
        handover_photo_path='staging/handover.jpg',updated_at=now() where id=v_station_parcel;
      update public.marketplace_delivery_jobs set status='delivered',delivered_at=now(),updated_at=now() where id=v_job;
    else
      perform public.rider_update_delivery_status_v3(v_job,'delivered','Staging verified delivery',false);
    end if;
    if (select status from public.sorting_parcels where id=v_parcel)<>'delivered' then
      raise exception 'Existing Rider/Station delivery did not close Sorting Center parcel custody';
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_details:=public.customer_list_sorting_order_tracking(v_pickup_order)->'events';
  if not exists(select 1 from jsonb_array_elements(v_details) x where x->>'event_type'='pickup_station_arrived')
     or not exists(select 1 from jsonb_array_elements(v_details) x where x->>'event_type'='pickup_station_received')
     or not exists(select 1 from jsonb_array_elements(v_details) x where x->>'event_type'='delivered') then
    raise exception 'Customer tracking missed verified Pickup Station custody events';
  end if;
  raise notice 'PASS: sorting center -> assigned Rider -> direct delivery and sorting center -> Rider -> Pickup Station receipt -> customer handover.';
end $$;
rollback;

create or replace function private.notify_customer_sorting_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_customer uuid; v_center text; v_title text; v_message text; v_order_ref text;
begin
  if not new.verified or new.event_type not in ('center_received','sorted','shipment_dispatched','shipment_received','last_mile_assigned','out_for_delivery','delivered') then return new; end if;
  select customer_id,order_reference into v_customer,v_order_ref from public.marketplace_orders where id=new.order_id;
  if v_customer is null then return new; end if;
  select center_name into v_center from public.sorting_centers where id=coalesce(new.to_center_id,new.from_center_id);
  v_title:=case new.event_type when 'center_received' then 'Parcel received at sorting center' when 'sorted' then 'Parcel sorted for delivery' when 'shipment_dispatched' then 'Parcel dispatched to next center' when 'shipment_received' then 'Parcel arrived at next sorting center' when 'last_mile_assigned' then 'Parcel assigned for local delivery' when 'out_for_delivery' then 'Parcel is out for delivery' else 'Parcel delivered' end;
  v_message:=case new.event_type when 'center_received' then 'Order '||v_order_ref||' was physically received at '||coalesce(v_center,'a LEOGO sorting center')||'.' when 'sorted' then 'Order '||v_order_ref||' was sorted and prepared for its next delivery stage.' when 'shipment_dispatched' then 'Order '||v_order_ref||' was dispatched to '||coalesce(v_center,'the next LEOGO sorting center')||'.' when 'shipment_received' then 'Order '||v_order_ref||' arrived at '||coalesce(v_center,'the next LEOGO sorting center')||'.' when 'last_mile_assigned' then 'Order '||v_order_ref||' was assigned for local delivery.' when 'out_for_delivery' then 'Order '||v_order_ref||' is out for delivery.' else 'Order '||v_order_ref||' was marked delivered.' end;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_customer,'marketplace_order',v_title,v_message,'marketplace_order',new.order_id,'sorting:'||new.id::text,'orders',jsonb_build_object('order_id',new.order_id,'parcel_event_id',new.id));
  return new;
end
$function$;

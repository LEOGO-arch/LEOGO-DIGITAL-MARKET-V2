-- Avoid relying on a unique event_key constraint when notifying customer Pickup Station updates.
CREATE OR REPLACE FUNCTION private.pickup_notify_order_parties(p_order_id uuid, p_event text, p_station_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_title text;
  v_message text;
  v_event_key text;
  v_seller record;
begin
  select * into v_order from public.marketplace_orders where id=p_order_id;
  if not found then return; end if;

  if p_event='received' then
    v_title:='Parcel received at Pickup Station';
    v_message:='Order '||v_order.order_reference||' has arrived at '||p_station_name||' and is ready for collection.';
  elsif p_event='handed_over' then
    v_title:='Parcel collected';
    v_message:='Order '||v_order.order_reference||' has been handed over to the customer at '||p_station_name||'.';
  else
    v_title:='Pickup Station update';
    v_message:='Order '||v_order.order_reference||' has a new Pickup Station update.';
  end if;

  v_event_key:='pickup_'||p_event||'_'||v_order.id::text;

  if not exists(select 1 from public.customer_notifications where event_key=v_event_key) then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values (
      v_order.customer_id,'pickup_station',v_title,v_message,
      'marketplace_order',v_order.id,v_event_key,'orders',
      jsonb_build_object('order_reference',v_order.order_reference,'pickup_station',p_station_name,'event',p_event)
    );
  end if;

  for v_seller in
    select distinct so.seller_id
    from public.marketplace_seller_orders so
    where so.order_id=v_order.id
  loop
    perform private.notify_partner(
      v_seller.seller_id,'seller','pickup_'||p_event,
      v_title,
      case when p_event='received'
        then 'Order '||v_order.order_reference||' was received at '||p_station_name||'.'
        else 'Order '||v_order.order_reference||' was collected by the customer at '||p_station_name||'.'
      end,
      'marketplace_order',v_order.id,'orders',
      jsonb_build_object('order_reference',v_order.order_reference,'pickup_station',p_station_name,'event',p_event)
    );
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_book_return(p_original_order_reference text, p_customer_name text, p_customer_phone text, p_item_description text, p_return_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_original public.marketplace_orders%rowtype;
  v_return_id uuid;
  v_ref text;
  v_event_key text;
  v_seller record;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  if char_length(btrim(coalesce(p_customer_name,'')))<2 then raise exception 'Enter customer name'; end if;
  if char_length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'))<9 then raise exception 'Enter customer phone'; end if;
  if char_length(btrim(coalesce(p_item_description,'')))<3 then raise exception 'Describe the return parcel'; end if;
  if char_length(btrim(coalesce(p_return_reason,'')))<3 then raise exception 'Enter the return reason'; end if;

  if nullif(btrim(coalesce(p_original_order_reference,'')),'') is not null then
    select * into v_original
    from public.marketplace_orders
    where upper(order_reference)=upper(btrim(p_original_order_reference))
      and pickup_station_id=v_station
    limit 1;
    if not found then raise exception 'Original order was not found for this Pickup Station'; end if;
  end if;

  v_ref:='RET-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.pickup_station_return_parcels(
    return_reference,pickup_station_id,original_order_id,original_order_reference,
    customer_name,customer_phone,item_description,return_reason,booked_by
  ) values (
    v_ref,v_station,
    case when v_original.id is null then null else v_original.id end,
    case when v_original.id is null then null else v_original.order_reference end,
    btrim(p_customer_name),btrim(p_customer_phone),btrim(p_item_description),btrim(p_return_reason),v_uid
  ) returning id into v_return_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,return_parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_return_id,case when v_original.id is null then null else v_original.id end,
    'return_booked',v_ref,v_uid,
    'Return parcel received at station: '||btrim(p_item_description)||'. Reason: '||btrim(p_return_reason)
  );

  if v_original.id is not null then
    v_event_key:='pickup_return_'||v_return_id::text;
    if not exists(select 1 from public.customer_notifications where event_key=v_event_key) then
      insert into public.customer_notifications(
        user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
      ) values (
        v_original.customer_id,'pickup_return','Return parcel booked',
        'Return '||v_ref||' linked to order '||v_original.order_reference||' has been received at the Pickup Station.',
        'marketplace_order',v_original.id,v_event_key,'orders',
        jsonb_build_object('return_reference',v_ref,'order_reference',v_original.order_reference)
      );
    end if;

    for v_seller in select distinct seller_id from public.marketplace_seller_orders where order_id=v_original.id
    loop
      perform private.notify_partner(
        v_seller.seller_id,'seller','pickup_return_booked','Return parcel booked',
        'Return '||v_ref||' linked to order '||v_original.order_reference||' has been received at the Pickup Station.',
        'marketplace_order',v_original.id,'orders',jsonb_build_object('return_reference',v_ref)
      );
    end loop;
  end if;

  perform private.write_admin_audit(
    'pickup.return.booked','pickup_station_return',v_return_id::text,
    null,jsonb_build_object('return_reference',v_ref,'pickup_station_id',v_station,'original_order_reference',v_original.order_reference),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object('ok',true,'return_id',v_return_id,'return_reference',v_ref,'status','received_at_station');
end
$function$;

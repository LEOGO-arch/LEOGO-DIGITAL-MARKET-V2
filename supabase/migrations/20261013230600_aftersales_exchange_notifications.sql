-- Exchange progress appears in existing customer and seller notification feeds.
create or replace function public.notify_aftersales_exchange_progress()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_customer uuid;v_seller uuid;v_ref text;
begin
 select o.customer_id,s.seller_id,s.reference into v_customer,v_seller,v_ref
 from public.aftersales_exchange_shipments s join public.marketplace_orders o on o.id=s.original_order_id
 where s.id=new.shipment_id;
 if v_customer is not null then
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_customer,'aftersales_exchange','Aftersales exchange update',
  'Replacement '||v_ref||' is now '||replace(new.new_status,'_',' '),
  'aftersales_exchange',new.shipment_id,'aftersales_exchange_'||new.id::text,'aftersales',
  jsonb_build_object('status',new.new_status,'shipment_id',new.shipment_id));
 end if;
 if v_seller is not null then
  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(v_seller,'seller','aftersales_exchange','Aftersales replacement update',
  'Exchange '||v_ref||' is now '||replace(new.new_status,'_',' '),
  'aftersales_exchange',new.shipment_id,'aftersales',jsonb_build_object('status',new.new_status,'shipment_id',new.shipment_id));
 end if;
 return new;
end;$fn$;
drop trigger if exists trg_aftersales_exchange_notify on public.aftersales_exchange_events;
create trigger trg_aftersales_exchange_notify after insert on public.aftersales_exchange_events
for each row execute function public.notify_aftersales_exchange_progress();
-- Phase 1: send newly submitted single-seller aftersales cases to their order seller.
-- Multi-seller cases remain for Admin routing until item-level selection is available.
create or replace function private.route_new_aftersales_to_seller()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid; v_seller_count integer; v_order_reference text;
begin
  select count(distinct so.seller_id),min(so.seller_id::text)::uuid
    into v_seller_count,v_seller
    from public.marketplace_seller_orders so where so.order_id=new.order_id;
  if v_seller_count<>1 or v_seller is null then return new; end if;
  select order_reference into v_order_reference from public.marketplace_orders where id=new.order_id;
  insert into public.marketplace_aftersales_negotiations(case_id,seller_id,stage,admin_comment)
    values(new.id,v_seller,'forwarded','Automatically sent to the seller of this order');
  insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
    values(new.id,new.customer_id,'customer','submitted_to_seller','Customer submitted an Aftersales case');
  insert into public.partner_notifications
   (user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
    values(v_seller,'seller','aftersales_submitted','Customer Aftersales request',
    'Customer requested Aftersales for order '||coalesce(v_order_reference,'')||'. Review the case under Orders.',
    'marketplace_aftersales_case',new.id,'orders',
    jsonb_build_object('case_id',new.id,'order_id',new.order_id,'case_reference',new.case_reference));
  return new;
end;$fn$;
drop trigger if exists leogo_route_new_aftersales_to_seller on public.marketplace_aftersales_cases;
create trigger leogo_route_new_aftersales_to_seller
after insert on public.marketplace_aftersales_cases for each row
execute function private.route_new_aftersales_to_seller();
-- Manual Admin re-forwarding should also notify the selected seller.
create or replace function private.notify_aftersales_forwarded_seller()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_ref text;
begin
 if new.stage='forwarded' and
    (tg_op='INSERT' or old.stage is distinct from 'forwarded' or old.seller_id is distinct from new.seller_id) then
   select case_reference into v_ref from public.marketplace_aftersales_cases where id=new.case_id;
   insert into public.partner_notifications
     (user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
   values(new.seller_id,'seller','aftersales_forwarded','Aftersales case assigned',
     'Case '||coalesce(v_ref,'')||' has been assigned to you. Open Seller Orders to respond.',
     'marketplace_aftersales_case',new.case_id,'orders',jsonb_build_object('case_id',new.case_id));
 end if;
 return new;
end;$fn$;
drop trigger if exists leogo_aftersales_seller_forward_notification on public.marketplace_aftersales_negotiations;
create trigger leogo_aftersales_seller_forward_notification
after insert or update on public.marketplace_aftersales_negotiations
for each row execute function private.notify_aftersales_forwarded_seller();

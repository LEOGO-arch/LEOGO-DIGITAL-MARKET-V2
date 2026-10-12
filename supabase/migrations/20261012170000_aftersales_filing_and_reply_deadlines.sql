-- Phase A: enforce filing within 7 days of handover/delivery and response within 72h.
-- Keep existing customer-care deadline exception support. No financial transitions.
create or replace function private.aftersales_case_filing_window_guard()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_delivery timestamptz;v_pickup timestamptz;v_extended timestamptz;
begin
 select delivered_at into v_delivery from public.marketplace_orders where id=new.order_id;
 select max(handed_over_at) into v_pickup from public.pickup_station_parcels
 where order_id=new.order_id and handed_over_at is not null;
 select valid_until into v_extended from public.aftersales_deadline_extensions where order_id=new.order_id;
 if coalesce(v_pickup,v_delivery) is null then
   raise exception 'Aftersales opens only after the customer receives the parcel';
 end if;
 if clock_timestamp()>greatest(coalesce(v_pickup,v_delivery)+interval '7 days',coalesce(v_extended,'-infinity'::timestamptz)) then
   raise exception 'The 7-day aftersales period has expired. Contact LEOGO Customer Care for assistance.';
 end if;
 return new;
end;$fn$;
drop trigger if exists aftersales_case_filing_window_guard on public.marketplace_aftersales_cases;
create trigger aftersales_case_filing_window_guard before insert on public.marketplace_aftersales_cases
for each row execute function private.aftersales_case_filing_window_guard();

create or replace function private.aftersales_customer_reply_deadline_guard()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.stage='seller_proposed' and old.stage is distinct from 'seller_proposed' then
   new.proposed_at=now();
   new.response_due_at=now()+interval '3 days';
 end if;
 if new.stage in ('customer_accepted','customer_rejected')
    and old.stage='seller_proposed' then
   if old.response_due_at is not null and now()>old.response_due_at then
      raise exception 'The 3-day response period expired. Contact LEOGO Customer Care for intervention.';
   end if;
 end if;
 return new;
end;$fn$;
drop trigger if exists aftersales_customer_reply_deadline_guard on public.marketplace_aftersales_negotiations;
create trigger aftersales_customer_reply_deadline_guard
before update on public.marketplace_aftersales_negotiations for each row
execute function private.aftersales_customer_reply_deadline_guard();
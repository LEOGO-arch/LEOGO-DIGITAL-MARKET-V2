-- LEOGO Aftersales canonical deadline implementation.
-- Reuse production's existing triggers and remove staging's duplicate experimental guards.
create or replace function private.enforce_aftersales_filing_window()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_delivery timestamptz;v_handover timestamptz;v_extension timestamptz;v_received timestamptz;
begin
 select delivered_at into v_delivery from public.marketplace_orders where id=new.order_id;
 select max(handed_over_at) into v_handover from public.pickup_station_parcels
 where order_id=new.order_id and handed_over_at is not null;
 v_received:=coalesce(v_handover,v_delivery);
 if v_received is null then
  raise exception 'Aftersales opens only after delivery or customer pickup is confirmed';
 end if;
 select valid_until into v_extension from public.aftersales_deadline_extensions where order_id=new.order_id;
 if now()>v_received+interval '7 days' and now()>coalesce(v_extension,'-infinity'::timestamptz) then
  raise exception 'The seven-day aftersales period has expired. Contact LEOGO Customer Care to request an extension';
 end if;
 return new;
end;$fn$;
-- Existing production proposal deadline trigger already supplies the 72-hour rule.
drop trigger if exists aftersales_case_filing_window_guard on public.marketplace_aftersales_cases;
drop trigger if exists aftersales_customer_reply_deadline_guard on public.marketplace_aftersales_negotiations;

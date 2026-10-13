alter table public.aftersales_exchange_shipments add column if not exists customer_delivery_choice text check(customer_delivery_choice in ('pickup_station','door'));
alter table public.aftersales_exchange_shipments add column if not exists preferred_pickup_station_id uuid references public.pickup_stations(id);
create or replace function public.customer_aftersales_exchange_choose_delivery(p_shipment_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.aftersales_exchange_shipments%rowtype;
begin
 if p_method not in ('pickup_station','door') then raise exception 'Select Pickup Station or door delivery';end if;
 select x.* into v from public.aftersales_exchange_shipments x join public.marketplace_orders o on o.id=x.original_order_id
 where x.id=p_shipment_id and o.customer_id=auth.uid() for update of x;
 if not found then raise exception 'Exchange shipment not found for customer';end if;
 if v.status not in ('packed_ready') or v.rider_id is not null then raise exception 'Delivery choice is locked once a rider is assigned or delivery begins';end if;
 if p_method='pickup_station' and coalesce(v.preferred_pickup_station_id,v.pickup_station_id) is null then raise exception 'No Pickup Station recorded. Contact LEOGO Customer Care to choose a station';end if;
 update public.aftersales_exchange_shipments
 set customer_delivery_choice=p_method,
 preferred_pickup_station_id=coalesce(v.preferred_pickup_station_id,v.pickup_station_id),
 pickup_station_id=case when p_method='door' then null else coalesce(v.preferred_pickup_station_id,v.pickup_station_id) end,
 payer=null,delivery_cost_kes=null,payment_verified=false,delivery_payment_reference=null,
 cost_decided_by=null,cost_decided_at=null,updated_at=now()
 where id=v.id;
 return jsonb_build_object('ok',true,'delivery_choice',p_method,'requires_fee',p_method='door');
end;$fn$;
-- Guard all later assignments (including legacy assign entry points) without altering in-transit jobs.
create or replace function public.enforce_exchange_door_payment_on_assignment()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if new.status='assigned' and old.status is distinct from 'assigned' then
  if new.customer_delivery_choice is null then raise exception 'Customer must choose exchange delivery method before rider assignment';end if;
  if new.customer_delivery_choice='pickup_station' and new.pickup_station_id is null then raise exception 'Pickup Station must be assigned for customer collection';end if;
  if new.customer_delivery_choice='door' and (new.pickup_station_id is not null or new.payer is distinct from 'customer'
     or coalesce(new.delivery_cost_kes,0)<=0 or new.payment_verified is distinct from true
     or length(btrim(coalesce(new.delivery_payment_reference,'')))<5) then
   raise exception 'Door delivery requires verified customer-paid delivery fee before rider assignment';end if;
 end if;
 return new;
end;$fn$;
drop trigger if exists enforce_exchange_door_payment_assignment on public.aftersales_exchange_shipments;
create trigger enforce_exchange_door_payment_assignment before update on public.aftersales_exchange_shipments
for each row execute function public.enforce_exchange_door_payment_on_assignment();
revoke all on function public.customer_aftersales_exchange_choose_delivery(uuid,text) from public,anon;
grant execute on function public.customer_aftersales_exchange_choose_delivery(uuid,text) to authenticated;
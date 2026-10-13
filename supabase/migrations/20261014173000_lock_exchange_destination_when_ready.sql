-- Lock the existing customer exchange delivery-choice endpoint as soon as the parcel is ready.
-- This protects packed, assigned, dispatched and in-transit replacement shipments.
create or replace function public.customer_aftersales_exchange_choose_delivery(p_shipment_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.aftersales_exchange_shipments%rowtype;
begin
 if p_method not in ('pickup_station','door') then raise exception 'Choose Pickup Station or door delivery';end if;
 select x.* into v from public.aftersales_exchange_shipments x
 join public.marketplace_orders o on o.id=x.original_order_id
 where x.id=p_shipment_id and o.customer_id=auth.uid() for update of x;
 if not found then raise exception 'Replacement shipment not found';end if;
 if v.status<>'awaiting_pack' or v.packed_at is not null or v.rider_id is not null then
  raise exception 'Delivery address and method are locked once the replacement is ready for delivery';
 end if;
 if p_method='pickup_station' and coalesce(v.preferred_pickup_station_id,v.pickup_station_id) is null
 then raise exception 'Select an approved Pickup Station before saving';end if;
 update public.aftersales_exchange_shipments
 set customer_delivery_choice=p_method,
 preferred_pickup_station_id=coalesce(v.preferred_pickup_station_id,v.pickup_station_id),
 pickup_station_id=case when p_method='door' then null else coalesce(v.preferred_pickup_station_id,v.pickup_station_id) end,
 payer=null,delivery_cost_kes=null,payment_verified=false,delivery_payment_reference=null,
 cost_decided_by=null,cost_decided_at=null,updated_at=now()
 where id=v.id;
 return jsonb_build_object('ok',true,'delivery_choice',p_method);
end;$fn$;
revoke all on function public.customer_aftersales_exchange_choose_delivery(uuid,text) from public,anon;
grant execute on function public.customer_aftersales_exchange_choose_delivery(uuid,text) to authenticated;
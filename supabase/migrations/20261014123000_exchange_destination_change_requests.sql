create table if not exists public.aftersales_exchange_destination_requests(
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null references public.aftersales_exchange_shipments(id),
 customer_id uuid not null references auth.users(id),
 requested_method text not null check(requested_method in ('door','pickup_station')),
 requested_station_id uuid references public.pickup_stations(id),
 requested_address text,
 request_reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,reviewed_by uuid,review_note text,
 check ((requested_method='door' and length(btrim(coalesce(requested_address,'')))>=10 and requested_station_id is null)
 or (requested_method='pickup_station' and requested_station_id is not null))
);
create unique index if not exists one_pending_exchange_destination_request on public.aftersales_exchange_destination_requests(shipment_id) where status='pending';
alter table public.aftersales_exchange_destination_requests enable row level security;
revoke all on public.aftersales_exchange_destination_requests from public,anon,authenticated;
alter table public.aftersales_exchange_shipments add column if not exists door_delivery_address text;
create or replace function public.customer_request_aftersales_exchange_destination(p_shipment_id uuid,p_method text,p_station_id uuid,p_address text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare s public.aftersales_exchange_shipments%rowtype;v uuid;
begin
 if p_method not in ('door','pickup_station') then raise exception 'Choose door or Pickup Station';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Please explain the change';end if;
 if p_method='door' and length(btrim(coalesce(p_address,'')))<10 then raise exception 'Enter complete door delivery address';end if;
 if p_method='pickup_station' and not exists(select 1 from public.pickup_stations where id=p_station_id) then raise exception 'Choose a registered Pickup Station';end if;
 select x.* into s from public.aftersales_exchange_shipments x join public.marketplace_orders o on o.id=x.original_order_id
 where x.id=p_shipment_id and o.customer_id=auth.uid() for update of x;
 if not found or s.status in ('delivered','at_pickup_station','collected','cancelled') then raise exception 'Destination cannot change after final handover';end if;
 insert into public.aftersales_exchange_destination_requests(shipment_id,customer_id,requested_method,requested_station_id,requested_address,request_reason)
 values(s.id,auth.uid(),p_method,case when p_method='pickup_station' then p_station_id end,
 case when p_method='door' then btrim(p_address) end,btrim(p_reason)) returning id into v;
 return jsonb_build_object('ok',true,'request_id',v,'status','pending_admin_review');
end;$fn$;
create or replace function public.aftersales_exchange_destination_requests_list(p_shipment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not (private.is_leogo_admin('delivery.manage') or exists(
 select 1 from public.aftersales_exchange_shipments s join public.marketplace_orders o on o.id=s.original_order_id
 where s.id=p_shipment_id and o.customer_id=auth.uid())) then raise exception 'Not authorized';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'method',r.requested_method,
 'address',r.requested_address,'station_id',r.requested_station_id,'reason',r.request_reason,'at',r.created_at,
 'review_note',r.review_note) order by r.created_at desc),'[]'::jsonb)
 from public.aftersales_exchange_destination_requests r where r.shipment_id=p_shipment_id);
end;$fn$;
create or replace function public.admin_review_aftersales_exchange_destination(p_request_id uuid,p_approve boolean,p_note text,p_delivery_fee numeric default null,p_payment_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.aftersales_exchange_destination_requests%rowtype;s public.aftersales_exchange_shipments%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin delivery permission required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Give reason for decision';end if;
 select * into r from public.aftersales_exchange_destination_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'No pending destination request';end if;
 select * into s from public.aftersales_exchange_shipments where id=r.shipment_id for update;
 if s.status in ('delivered','at_pickup_station','collected','cancelled') then raise exception 'Shipment already reached final handover';end if;
 if p_approve then
  if r.requested_method='door' and (coalesce(p_delivery_fee,0)<=0 or length(btrim(coalesce(p_payment_reference,'')))<5) then
   raise exception 'Verify customer-paid delivery fee and reference before approving door redirection';end if;
  update public.aftersales_exchange_shipments
   set customer_delivery_choice=r.requested_method,pickup_station_id=case when r.requested_method='door' then null else r.requested_station_id end,
   preferred_pickup_station_id=coalesce(r.requested_station_id,preferred_pickup_station_id),
   door_delivery_address=case when r.requested_method='door' then r.requested_address else null end,
   payer=case when r.requested_method='door' then 'customer' else payer end,
   delivery_cost_kes=case when r.requested_method='door' then p_delivery_fee else delivery_cost_kes end,
   delivery_payment_reference=case when r.requested_method='door' then btrim(p_payment_reference) else delivery_payment_reference end,
   payment_verified=case when r.requested_method='door' then true else payment_verified end,
   updated_at=now() where id=s.id;
 end if;
 update public.aftersales_exchange_destination_requests
 set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_at=now(),reviewed_by=auth.uid(),review_note=btrim(p_note) where id=r.id;
 return jsonb_build_object('ok',true,'approved',p_approve);
end;$fn$;
revoke all on function public.customer_request_aftersales_exchange_destination(uuid,text,uuid,text,text),
public.aftersales_exchange_destination_requests_list(uuid),
public.admin_review_aftersales_exchange_destination(uuid,boolean,text,numeric,text) from public,anon;
grant execute on function public.customer_request_aftersales_exchange_destination(uuid,text,uuid,text,text),
public.aftersales_exchange_destination_requests_list(uuid),
public.admin_review_aftersales_exchange_destination(uuid,boolean,text,numeric,text) to authenticated;
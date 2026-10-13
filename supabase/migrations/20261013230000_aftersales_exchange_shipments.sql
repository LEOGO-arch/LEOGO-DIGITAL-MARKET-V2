-- Isolated outbound exchange logistics. Never create a new paid order or station earning.
create table if not exists public.aftersales_exchange_shipments(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null unique references public.marketplace_aftersales_cases(id),
 original_order_id uuid not null references public.marketplace_orders(id),
 seller_id uuid not null,
 reference text not null unique default ('AEX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 status text not null default 'awaiting_pack'
  check(status in ('awaiting_pack','packed_ready','assigned','picked_up','sorting_received','on_the_way','at_pickup_station','ready_for_collection','delivered','cancelled')),
 pack_note text,packed_at timestamptz,
 payer text check(payer in ('seller','customer','leogo')),
 responsibility_reason text,delivery_cost_kes numeric(12,2) check(delivery_cost_kes>=0),
 payment_verified boolean not null default false,
 cost_decided_by uuid, cost_decided_at timestamptz,
 rider_id uuid references auth.users(id),assigned_at timestamptz,
 rider_condition text,rider_condition_notes text,picked_up_at timestamptz,
 sorting_received_at timestamptz,on_the_way_at timestamptz,
 pickup_station_received_at timestamptz,customer_collected_at timestamptz,
 delivered_at timestamptz,delivery_proof_note text,
 pickup_station_id uuid references public.pickup_stations(id),
 pickup_station_commission_kes numeric(12,2) not null default 0 check(pickup_station_commission_kes=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.aftersales_exchange_shipments enable row level security;
revoke all on public.aftersales_exchange_shipments from public,anon,authenticated;
create or replace function public.aftersales_exchange_seller_pack(p_case_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.marketplace_aftersales_negotiations%rowtype; i public.aftersales_seller_inspections%rowtype; o uuid; x public.aftersales_exchange_shipments%rowtype;
begin
 select * into v from public.marketplace_aftersales_negotiations where case_id=p_case_id and seller_id=auth.uid();
 if not found or v.stage<>'customer_accepted' then raise exception 'Customer-approved seller exchange required';end if;
 select * into i from public.aftersales_seller_inspections where case_id=p_case_id and seller_id=auth.uid();
 if not found or i.inspected_at is null or i.recommendation not in ('exchange','replacement') then raise exception 'Completed exchange inspection is required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Provide packing details';end if;
 select order_id into o from public.marketplace_aftersales_cases where id=p_case_id;
 insert into public.aftersales_exchange_shipments(case_id,original_order_id,seller_id,pack_note,packed_at,status)
 values(p_case_id,o,auth.uid(),btrim(p_note),now(),'packed_ready')
 on conflict(case_id) do update set pack_note=excluded.pack_note,packed_at=excluded.packed_at,status='packed_ready',updated_at=now()
 where public.aftersales_exchange_shipments.status='awaiting_pack'
 returning * into x;
 if not found then raise exception 'Exchange already progressed';end if;
 return jsonb_build_object('id',x.id,'reference',x.reference,'status',x.status);
end;$fn$;
create or replace function public.admin_aftersales_exchange_decide_cost(p_case_id uuid,p_payer text,p_cost numeric,p_reason text,p_payment_verified boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin required';end if;
 if p_payer not in ('seller','customer','leogo') or p_cost is null or p_cost<0 or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Record who is responsible, delivery cost and reason';end if;
 select * into x from public.aftersales_exchange_shipments where case_id=p_case_id for update;
 if not found or x.status not in ('packed_ready','assigned') then raise exception 'Exchange not ready for cost decision';end if;
 update public.aftersales_exchange_shipments set payer=p_payer,delivery_cost_kes=p_cost,responsibility_reason=btrim(p_reason),payment_verified=p_payment_verified,cost_decided_by=auth.uid(),cost_decided_at=now(),updated_at=now() where id=x.id;
 return jsonb_build_object('ok',true);
end;$fn$;
create or replace function public.admin_aftersales_exchange_assign(p_case_id uuid,p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin required';end if;
 if not exists(select 1 from public.leogo_staff where user_id=p_rider_id and staff_role='rider' and status='active') then raise exception 'Select active registered rider';end if;
 select * into x from public.aftersales_exchange_shipments where case_id=p_case_id for update;
 if not found or x.status<>'packed_ready' or x.payer is null or not x.payment_verified then raise exception 'Pack exchange and verify delivery-cost responsibility/payment first';end if;
 update public.aftersales_exchange_shipments set rider_id=p_rider_id,status='assigned',assigned_at=now(),updated_at=now() where id=x.id;
 return jsonb_build_object('ok',true);
end;$fn$;
create or replace function public.aftersales_exchange_rider_update(p_shipment_id uuid,p_action text,p_condition text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype; v_next text;
begin
 select * into x from public.aftersales_exchange_shipments where id=p_shipment_id and rider_id=auth.uid() for update;
 if not found or not exists(select 1 from public.leogo_staff where user_id=auth.uid() and staff_role='rider' and status='active') then raise exception 'Not assigned to an active rider';end if;
 if p_action='pickup' and x.status='assigned' and p_condition in ('good','damaged','tampered','other') and length(btrim(coalesce(p_note,'')))>=5 then
 update public.aftersales_exchange_shipments set status='picked_up',picked_up_at=now(),rider_condition=p_condition,rider_condition_notes=btrim(p_note),updated_at=now() where id=x.id;
 elsif p_action='sorting' and x.status='picked_up' then
 update public.aftersales_exchange_shipments set status='sorting_received',sorting_received_at=now(),updated_at=now() where id=x.id;
 elsif p_action='transit' and x.status in ('picked_up','sorting_received') then
 update public.aftersales_exchange_shipments set status='on_the_way',on_the_way_at=now(),updated_at=now() where id=x.id;
 elsif p_action='deliver_customer' and x.status='on_the_way' and x.pickup_station_id is null and length(btrim(coalesce(p_note,'')))>=5 then
 update public.aftersales_exchange_shipments set status='delivered',delivered_at=now(),delivery_proof_note=btrim(p_note),updated_at=now() where id=x.id;
 elsif p_action='arrive_station' and x.status='on_the_way' and x.pickup_station_id is not null then
 update public.aftersales_exchange_shipments set status='at_pickup_station',pickup_station_received_at=now(),updated_at=now() where id=x.id;
 else raise exception 'Invalid exchange delivery transition or missing parcel condition/proof';end if;
 return jsonb_build_object('ok',true);
end;$fn$;
create or replace function public.aftersales_exchange_list(p_role text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from(
 select s.*,c.case_reference,o.order_reference,o.receiver_name,o.contact_number,
 coalesce(i.product_name,'Exchange product') as item_name
 from public.aftersales_exchange_shipments s
 join public.marketplace_aftersales_cases c on c.id=s.case_id
 join public.marketplace_orders o on o.id=s.original_order_id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 where (p_role='seller' and s.seller_id=auth.uid())
 or (p_role='rider' and s.rider_id=auth.uid() and exists(select 1 from public.leogo_staff where user_id=auth.uid() and status='active' and staff_role='rider'))
 or (p_role='admin' and private.is_leogo_admin('delivery.manage'))
 or (p_role='customer' and o.customer_id=auth.uid())
 ) x);
end;$fn$;
revoke all on function public.aftersales_exchange_seller_pack(uuid,text),public.admin_aftersales_exchange_decide_cost(uuid,text,numeric,text,boolean),public.admin_aftersales_exchange_assign(uuid,uuid),public.aftersales_exchange_rider_update(uuid,text,text,text),public.aftersales_exchange_list(text) from public,anon;
grant execute on function public.aftersales_exchange_seller_pack(uuid,text),public.admin_aftersales_exchange_decide_cost(uuid,text,numeric,text,boolean),public.admin_aftersales_exchange_assign(uuid,uuid),public.aftersales_exchange_rider_update(uuid,text,text,text),public.aftersales_exchange_list(text) to authenticated;
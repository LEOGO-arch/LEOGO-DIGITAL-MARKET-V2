-- Aftersales station earnings, separate from regular customer collection fees.
create table if not exists public.aftersales_station_settings (
 singleton boolean primary key default true check(singleton),
 completion_fee_kes numeric(12,2) not null default 20 check(completion_fee_kes>=0),
 changed_at timestamptz not null default now(),changed_by uuid
);
insert into public.aftersales_station_settings(singleton,completion_fee_kes) values(true,20) on conflict do nothing;
alter table public.aftersales_station_settings enable row level security;
revoke all on public.aftersales_station_settings from public,anon,authenticated;
create table if not exists public.aftersales_station_commissions(
 return_id uuid primary key references public.pickup_station_return_parcels(id),
 pickup_station_id uuid not null references public.pickup_stations(id),
 amount_kes numeric(12,2) not null check(amount_kes>=0),
 earned_at timestamptz not null default now(),
 source text not null default 'seller_confirmed_receipt'
);
alter table public.aftersales_station_commissions enable row level security;
revoke all on public.aftersales_station_commissions from public,anon,authenticated;
alter table public.aftersales_return_waybills add column if not exists route_destination text not null default 'seller'
 check(route_destination in ('seller','sorting_center'));
create or replace function public.admin_set_aftersales_station_fee(p_amount numeric)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin delivery permission required';end if;
 if p_amount is null or p_amount<0 or p_amount>10000 then raise exception 'Invalid station return commission';end if;
 update public.aftersales_station_settings set completion_fee_kes=p_amount,changed_at=now(),changed_by=auth.uid() where singleton;
 return jsonb_build_object('ok',true,'rate',p_amount);
end;$fn$;
create or replace function public.admin_aftersales_station_fee()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select case when private.is_leogo_admin('delivery.manage')
 then jsonb_build_object('amount_kes',completion_fee_kes) else null end
 from public.aftersales_station_settings where singleton;
$fn$;
create or replace function public.pickup_partner_return_dashboard()
returns jsonb language sql stable security definer set search_path='' as $fn$
with r as (
select p.id,p.status,p.booked_at,p.updated_at,p.aftersales_case_id,
exists(select 1 from public.aftersales_seller_inspections i where i.case_id=p.aftersales_case_id) as seller_received
from public.pickup_station_return_parcels p where p.pickup_station_id=private.pickup_partner_station_id()
and p.aftersales_case_id is not null
),income as (select coalesce(sum(amount_kes),0) amount,count(*) count from public.aftersales_station_commissions where pickup_station_id=private.pickup_partner_station_id())
select jsonb_build_object(
'pending_receive',count(*) filter(where status='awaiting_dispatch'),
'received',count(*) filter(where status='received_at_station'),
'dispatched',count(*) filter(where status='dispatched' and not seller_received),
'complete',count(*) filter(where seller_received),
'overdue',count(*) filter(where status='received_at_station' and updated_at<now()-interval '2 days'),
'earnings_total_kes',(select amount from income),
'completed_returns',(select count from income)
) from r;
$fn$;
create or replace function public.pickup_partner_confirm_return_handover(p_return_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;w public.aftersales_return_waybills%rowtype;v_step text;
begin
 select * into v from public.pickup_station_return_parcels where id=p_return_id and pickup_station_id=private.pickup_partner_station_id() and aftersales_case_id is not null for update;
 if not found or v.status<>'received_at_station' then raise exception 'Return must be received and not already dispatched';end if;
 select * into w from public.aftersales_return_waybills where return_id=p_return_id for update;
 if not found or w.waybill_path is null then raise exception 'Upload the rider waybill first';end if;
 v_step:=case when w.route_destination='sorting_center' then 'station_dispatched_to_sorting' else 'station_dispatched_to_seller' end;
 if exists(select 1 from public.aftersales_return_transport_events where return_parcel_id=p_return_id) then raise exception 'Return routing already recorded; refresh';end if;
 update public.pickup_station_return_parcels set status='dispatched',dispatched_at=now(),updated_at=now() where id=p_return_id;
 insert into public.aftersales_return_transport_events(return_parcel_id,aftersales_case_id,step,notes,actor_id)
 values(v.id,v.aftersales_case_id,v_step,'Physical handover to assigned '||w.courier_name||' with waybill proof',auth.uid());
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,auth.uid(),'pickup_station','return_handed_to_courier','Return dispatched to '||w.route_destination||' by '||w.courier_name);
 return jsonb_build_object('ok',true,'status','dispatched','return_reference',v.return_reference);
end;$fn$;
create or replace function public.pickup_partner_return_commission_summary()
returns jsonb language sql stable security definer set search_path='' as $fn$
select jsonb_build_object('total_kes',coalesce(sum(amount_kes),0),'completed_returns',count(*))
from public.aftersales_station_commissions where pickup_station_id=private.pickup_partner_station_id();
$fn$;
revoke all on function public.admin_set_aftersales_station_fee(numeric),public.admin_aftersales_station_fee(),public.pickup_partner_return_dashboard(),public.pickup_partner_confirm_return_handover(uuid),public.pickup_partner_return_commission_summary() from public,anon;
grant execute on function public.admin_set_aftersales_station_fee(numeric),public.admin_aftersales_station_fee(),public.pickup_partner_return_dashboard(),public.pickup_partner_confirm_return_handover(uuid),public.pickup_partner_return_commission_summary() to authenticated;
-- Credit exactly once, on the first confirmed seller physical receipt; no credit for inspection alone.
create or replace function public.record_aftersales_return_completion()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_return public.pickup_station_return_parcels%rowtype;v_fee numeric;
begin
 select * into v_return from public.pickup_station_return_parcels
 where aftersales_case_id=new.case_id and status='dispatched' order by dispatched_at desc limit 1;
 if not found then return new;end if;
 select completion_fee_kes into v_fee from public.aftersales_station_settings where singleton;
 insert into public.aftersales_station_commissions(return_id,pickup_station_id,amount_kes)
 values(v_return.id,v_return.pickup_station_id,coalesce(v_fee,20))
 on conflict(return_id) do nothing;
 update public.pickup_station_return_parcels set status='completed',updated_at=now() where id=v_return.id;
 return new;
end;$fn$;
drop trigger if exists trg_aftersales_return_completion on public.aftersales_seller_inspections;
create trigger trg_aftersales_return_completion after insert on public.aftersales_seller_inspections
for each row execute function public.record_aftersales_return_completion();
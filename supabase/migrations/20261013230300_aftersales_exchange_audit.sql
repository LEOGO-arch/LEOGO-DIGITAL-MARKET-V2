-- Auditable exchange shipment history, linked to the parent Aftersales case.
create table if not exists public.aftersales_exchange_events(
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null references public.aftersales_exchange_shipments(id),
 case_id uuid not null references public.marketplace_aftersales_cases(id),
 previous_status text, new_status text not null,
 changed_by uuid, changed_at timestamptz not null default now()
);
alter table public.aftersales_exchange_events enable row level security;
revoke all on public.aftersales_exchange_events from public,anon,authenticated;
create or replace function public.record_aftersales_exchange_status()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.aftersales_exchange_events(shipment_id,case_id,previous_status,new_status,changed_by)
  values(new.id,new.case_id,case when tg_op='INSERT' then null else old.status end,new.status,auth.uid());
 end if;
 return new;
end;$fn$;
drop trigger if exists trg_aftersales_exchange_status on public.aftersales_exchange_shipments;
create trigger trg_aftersales_exchange_status after insert or update of status on public.aftersales_exchange_shipments
for each row execute function public.record_aftersales_exchange_status();
create or replace function public.aftersales_exchange_history(p_shipment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v public.aftersales_exchange_shipments%rowtype;
begin
 select * into v from public.aftersales_exchange_shipments where id=p_shipment_id;
 if not found or not(
   v.seller_id=auth.uid() or v.rider_id=auth.uid()
   or private.is_leogo_admin('orders.manage')
   or exists(select 1 from public.marketplace_orders where id=v.original_order_id and customer_id=auth.uid())
   or (v.pickup_station_id is not null and v.pickup_station_id=private.pickup_partner_station_id())
 ) then raise exception 'Exchange not accessible';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('from',previous_status,'to',new_status,'at',changed_at) order by changed_at,id),'[]'::jsonb)
 from public.aftersales_exchange_events where shipment_id=p_shipment_id);
end;$fn$;
revoke all on function public.aftersales_exchange_history(uuid) from public,anon;
grant execute on function public.aftersales_exchange_history(uuid) to authenticated;
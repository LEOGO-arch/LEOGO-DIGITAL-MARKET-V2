create table if not exists public.aftersales_exchange_delivery_preferences(
 case_id uuid primary key references public.marketplace_aftersales_cases(id),
 customer_id uuid not null references auth.users(id),
 delivery_method text not null check(delivery_method in ('pickup_station','door')),
 station_id uuid references public.pickup_stations(id),
 door_address text,
 updated_at timestamptz not null default now(),
 check ((delivery_method='pickup_station' and station_id is not null)
 or (delivery_method='door' and length(btrim(coalesce(door_address,'')))>=10))
);
alter table public.aftersales_exchange_delivery_preferences enable row level security;
revoke all on public.aftersales_exchange_delivery_preferences from public,anon,authenticated;
create or replace function public.customer_set_aftersales_exchange_delivery_preference(p_case_id uuid,p_method text,p_station_id uuid,p_door_address text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_customer uuid;
begin
 select c.customer_id into v_customer from public.marketplace_aftersales_cases c
 join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 where c.id=p_case_id and c.customer_id=auth.uid() and n.stage='customer_accepted';
 if v_customer is null then raise exception 'This exchange is not ready for customer delivery selection';end if;
 if exists(select 1 from public.aftersales_exchange_shipments s where s.case_id=p_case_id and
 (s.status<>'awaiting_pack' or s.packed_at is not null or s.rider_id is not null))
 then raise exception 'Delivery choice is locked: item already ready or dispatched';end if;
 if p_method not in ('pickup_station','door') then raise exception 'Choose Pickup Station or door delivery';end if;
 if p_method='pickup_station' and not exists(select 1 from public.pickup_stations where id=p_station_id)
 then raise exception 'Choose a registered Pickup Station';end if;
 if p_method='door' and length(btrim(coalesce(p_door_address,'')))<10 then raise exception 'Provide full delivery address and landmark';end if;
 insert into public.aftersales_exchange_delivery_preferences(case_id,customer_id,delivery_method,station_id,door_address)
 values(p_case_id,auth.uid(),p_method,case when p_method='pickup_station' then p_station_id end,
 case when p_method='door' then btrim(p_door_address) end)
 on conflict(case_id) do update set delivery_method=excluded.delivery_method,station_id=excluded.station_id,
 door_address=excluded.door_address,updated_at=now();
 return jsonb_build_object('ok',true,'delivery_method',p_method);
end;$fn$;
create or replace function public.customer_get_aftersales_exchange_delivery_preferences()
returns jsonb language sql stable security definer set search_path='' as $fn$
select coalesce(jsonb_agg(jsonb_build_object('case_id',p.case_id,'delivery_method',p.delivery_method,
 'station_id',p.station_id,'door_address',p.door_address)),'[]'::jsonb)
from public.aftersales_exchange_delivery_preferences p where p.customer_id=auth.uid();
$fn$;
create or replace function public.apply_aftersales_exchange_delivery_preference()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare p public.aftersales_exchange_delivery_preferences%rowtype;
begin
 if new.status<>'packed_ready' or (tg_op='UPDATE' and old.status<>'awaiting_pack') then return new;end if;
 select * into p from public.aftersales_exchange_delivery_preferences where case_id=new.case_id;
 if found then
  new.customer_delivery_choice:=p.delivery_method;
  new.pickup_station_id:=case when p.delivery_method='pickup_station' then p.station_id else null end;
  new.preferred_pickup_station_id:=p.station_id;
  new.door_delivery_address:=p.door_address;
 end if;
 return new;
end;$fn$;
drop trigger if exists apply_aftersales_exchange_delivery_preference_on_pack on public.aftersales_exchange_shipments;
create trigger apply_aftersales_exchange_delivery_preference_on_pack
before insert or update on public.aftersales_exchange_shipments
for each row execute function public.apply_aftersales_exchange_delivery_preference();
revoke all on function public.customer_set_aftersales_exchange_delivery_preference(uuid,text,uuid,text),
public.customer_get_aftersales_exchange_delivery_preferences() from public,anon;
grant execute on function public.customer_set_aftersales_exchange_delivery_preference(uuid,text,uuid,text),
public.customer_get_aftersales_exchange_delivery_preferences() to authenticated;
-- Explicit role-gated return route chain: pickup -> sorting -> seller OR pickup -> seller.
create table if not exists public.aftersales_return_transport_events(
 id uuid primary key default gen_random_uuid(),
 return_parcel_id uuid not null references public.pickup_station_return_parcels(id) on delete restrict,
 aftersales_case_id uuid not null references public.marketplace_aftersales_cases(id) on delete restrict,
 step text not null check(step in ('station_dispatched_to_sorting','sorting_received','sorting_dispatched_to_seller','station_dispatched_to_seller')),
 notes text not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(return_parcel_id,step)
);
alter table public.aftersales_return_transport_events enable row level security;
revoke all on public.aftersales_return_transport_events from anon,authenticated;
create or replace function public.admin_aftersales_route_return(p_return_id uuid,p_step text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;v_last text;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if length(btrim(coalesce(p_notes,'')))<5 or length(p_notes)>1000 then raise exception 'Provide physical handover notes (5-1000 characters)';end if;
 if p_step not in ('station_dispatched_to_sorting','sorting_received','sorting_dispatched_to_seller','station_dispatched_to_seller') then
   raise exception 'Unsupported physical parcel movement';end if;
 select * into v from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id is not null for update;
 if not found then raise exception 'Aftersales return not found';end if;
 select step into v_last from public.aftersales_return_transport_events
 where return_parcel_id=p_return_id order by created_at desc,id desc limit 1;
 if p_step in ('station_dispatched_to_sorting','station_dispatched_to_seller') then
   if v.status<>'received_at_station' or v_last is not null then
     raise exception 'Pickup Station must physically receive the return before first dispatch';end if;
   perform public.admin_update_pickup_return_status(v.id,'dispatched',p_notes);
 elsif p_step='sorting_received' then
   if v_last<>'station_dispatched_to_sorting' or v.status<>'dispatched' then
     raise exception 'Return must be dispatched to the sorting center first';end if;
 elsif p_step='sorting_dispatched_to_seller' then
   if v_last<>'sorting_received' or v.status<>'dispatched' then
     raise exception 'Sorting Center must first confirm physical receipt';end if;
 end if;
 insert into public.aftersales_return_transport_events(return_parcel_id,aftersales_case_id,step,notes,actor_id)
 values(v.id,v.aftersales_case_id,p_step,btrim(p_notes),(select auth.uid()));
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,(select auth.uid()),'admin','return_'||p_step,left(p_notes,1000));
 return jsonb_build_object('ok',true,'case_id',v.aftersales_case_id,'return_reference',v.return_reference,'route_step',p_step);
end;$fn$;
revoke all on function public.admin_aftersales_route_return(uuid,text,text) from public,anon;
grant execute on function public.admin_aftersales_route_return(uuid,text,text) to authenticated;

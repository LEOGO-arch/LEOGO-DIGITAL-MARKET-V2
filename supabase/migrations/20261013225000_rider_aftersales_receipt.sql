create table if not exists public.aftersales_rider_receipts (
 return_id uuid primary key references public.pickup_station_return_parcels(id),
 rider_id uuid not null references auth.users(id),
 condition_code text not null check(condition_code in ('good','damaged','tampered','other')),
 condition_notes text not null check(length(btrim(condition_notes)) between 5 and 1000),
 received_at timestamptz not null default now()
);
alter table public.aftersales_rider_receipts enable row level security;
revoke all on public.aftersales_rider_receipts from public,anon,authenticated;
alter table public.marketplace_aftersales_negotiation_events drop constraint marketplace_aftersales_negotiation_events_actor_role_check;
alter table public.marketplace_aftersales_negotiation_events add constraint marketplace_aftersales_negotiation_events_actor_role_check check(actor_role in ('admin','seller','customer','pickup_station','rider'));
create or replace function public.staff_confirm_aftersales_rider_receipt(p_return_id uuid,p_condition text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;
begin
 if not exists(select 1 from public.leogo_staff where user_id=auth.uid() and staff_role='rider' and status='active') then raise exception 'Active rider required';end if;
 if p_condition not in ('good','damaged','tampered','other') or length(btrim(coalesce(p_notes,''))) not between 5 and 1000 then raise exception 'Provide parcel condition and notes';end if;
 select r.* into v from public.pickup_station_return_parcels r
 join public.aftersales_return_waybills w on w.return_id=r.id
 where r.id=p_return_id and r.aftersales_case_id is not null and r.status='dispatched'
 and w.assignee_type='rider' and w.assignee_id=auth.uid() and w.waybill_path is not null for update of r;
 if not found then raise exception 'Return not dispatched to this rider with a waybill';end if;
 insert into public.aftersales_rider_receipts(return_id,rider_id,condition_code,condition_notes)
 values(p_return_id,auth.uid(),p_condition,btrim(p_notes))
 on conflict(return_id) do nothing;
 if not found then raise exception 'Receipt already confirmed';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,auth.uid(),'rider','rider_received_return','Rider confirmed receipt; condition: '||p_condition||'; notes: '||btrim(p_notes));
 return jsonb_build_object('ok',true);
end;$fn$;
revoke all on function public.staff_confirm_aftersales_rider_receipt(uuid,text,text) from public,anon;
grant execute on function public.staff_confirm_aftersales_rider_receipt(uuid,text,text) to authenticated;
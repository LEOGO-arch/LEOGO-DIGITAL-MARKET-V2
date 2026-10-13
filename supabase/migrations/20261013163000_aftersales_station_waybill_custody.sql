-- Isolated custody evidence; ordinary order/parcel workflows are unchanged.
create table if not exists public.aftersales_return_waybills (
 return_id uuid primary key references public.pickup_station_return_parcels(id) on delete restrict,
 courier_name text not null check(length(btrim(courier_name)) between 2 and 120),
 assigned_by uuid not null, assigned_at timestamptz not null default now(),
 waybill_path text, uploaded_by uuid, uploaded_at timestamptz
);
alter table public.aftersales_return_waybills enable row level security;
revoke all on public.aftersales_return_waybills from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aftersales-return-waybills','aftersales-return-waybills',false,5242880,array['image/jpeg','image/png','application/pdf'])
 on conflict(id) do nothing;
drop policy if exists "Assigned station uploads aftersales waybill" on storage.objects;
create policy "Assigned station uploads aftersales waybill" on storage.objects for insert to authenticated
with check(bucket_id='aftersales-return-waybills' and exists(
 select 1 from public.aftersales_return_waybills w
 join public.pickup_station_return_parcels r on r.id=w.return_id
 where w.return_id::text=split_part(name,'/',1) and r.pickup_station_id=private.pickup_partner_station_id()
 and r.aftersales_case_id is not null and r.status in ('received_at_station','dispatched')
 and w.waybill_path is null
));
drop policy if exists "Authorized aftersales waybill readers" on storage.objects;
create policy "Authorized aftersales waybill readers" on storage.objects for select to authenticated
using(bucket_id='aftersales-return-waybills' and exists (
 select 1 from public.aftersales_return_waybills w
 join public.pickup_station_return_parcels r on r.id=w.return_id
 where w.waybill_path=name and
 (private.is_leogo_admin('delivery.manage') or r.pickup_station_id=private.pickup_partner_station_id())
));
create or replace function public.admin_assign_aftersales_return_courier(p_return_id uuid,p_courier_name text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin delivery permission required'; end if;
 if length(btrim(coalesce(p_courier_name,''))) not between 2 and 120 then raise exception 'Provide the assigned rider or courier name'; end if;
 select * into v from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id is not null for update;
 if not found or v.status not in ('received_at_station','dispatched') then raise exception 'Return must first be received at the Pickup Station';end if;
 insert into public.aftersales_return_waybills(return_id,courier_name,assigned_by)
 values(p_return_id,btrim(p_courier_name),auth.uid())
 on conflict(return_id) do update set courier_name=excluded.courier_name,assigned_by=excluded.assigned_by,assigned_at=now()
 where public.aftersales_return_waybills.waybill_path is null;
 if not found then raise exception 'Waybill already recorded. Courier assignment cannot be changed';end if;
 return jsonb_build_object('ok',true,'return_reference',v.return_reference);
end;$fn$;
create or replace function public.pickup_partner_aftersales_waybill_status(p_return_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;w public.aftersales_return_waybills%rowtype;
begin
 select * into v from public.pickup_station_return_parcels where id=p_return_id and pickup_station_id=private.pickup_partner_station_id() and aftersales_case_id is not null;
 if not found then raise exception 'This aftersales return is not assigned to your station';end if;
 select * into w from public.aftersales_return_waybills where return_id=p_return_id;
 return jsonb_build_object('assigned',w.return_id is not null,'courier_name',w.courier_name,'waybill_path',w.waybill_path,'status',v.status);
end;$fn$;
create or replace function public.pickup_partner_submit_aftersales_waybill(p_return_id uuid,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;w public.aftersales_return_waybills%rowtype;
begin
 select * into v from public.pickup_station_return_parcels where id=p_return_id and pickup_station_id=private.pickup_partner_station_id() and aftersales_case_id is not null for update;
 if not found or v.status not in ('received_at_station','dispatched') then raise exception 'Return is not ready for handover';end if;
 select * into w from public.aftersales_return_waybills where return_id=p_return_id for update;
 if not found then raise exception 'Admin must assign a rider or courier first';end if;
 if w.waybill_path is not null then raise exception 'Waybill already submitted';end if;
 if p_path is null or p_path !~ ('^'||p_return_id::text||'/[a-zA-Z0-9_-]+[.](jpg|png|pdf)$')
 or not exists(select 1 from storage.objects where bucket_id='aftersales-return-waybills' and name=p_path) then raise exception 'Valid uploaded waybill required';end if;
 update public.aftersales_return_waybills set waybill_path=p_path,uploaded_by=auth.uid(),uploaded_at=now() where return_id=p_return_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,auth.uid(),'pickup_station','return_waybill_uploaded','Waybill received for '||v.return_reference||' · Courier: '||w.courier_name);
 return jsonb_build_object('ok',true,'return_reference',v.return_reference);
end;$fn$;
create or replace function public.admin_aftersales_waybill_status(p_return_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare w public.aftersales_return_waybills%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin delivery permission required';end if;
 select * into w from public.aftersales_return_waybills where return_id=p_return_id;
 return jsonb_build_object('assigned',w.return_id is not null,'courier_name',w.courier_name,'waybill_path',w.waybill_path,'assigned_at',w.assigned_at,'uploaded_at',w.uploaded_at);
end;$fn$;
revoke all on function public.admin_assign_aftersales_return_courier(uuid,text),public.pickup_partner_aftersales_waybill_status(uuid),public.pickup_partner_submit_aftersales_waybill(uuid,text),public.admin_aftersales_waybill_status(uuid) from public,anon;
grant execute on function public.admin_assign_aftersales_return_courier(uuid,text),public.pickup_partner_aftersales_waybill_status(uuid),public.pickup_partner_submit_aftersales_waybill(uuid,text),public.admin_aftersales_waybill_status(uuid) to authenticated;
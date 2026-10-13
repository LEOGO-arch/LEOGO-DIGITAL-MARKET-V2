-- Storage policy helpers avoid direct table grants to browser roles.
create or replace function private.can_upload_aftersales_waybill(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists (
 select 1 from public.aftersales_return_waybills w
 join public.pickup_station_return_parcels r on r.id=w.return_id
 where w.return_id::text=split_part(p_path,'/',1)
 and r.pickup_station_id=private.pickup_partner_station_id()
 and r.aftersales_case_id is not null
 and r.status in ('received_at_station','dispatched')
 and w.waybill_path is null
 );$fn$;
create or replace function private.can_read_aftersales_waybill(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists (
 select 1 from public.aftersales_return_waybills w
 join public.pickup_station_return_parcels r on r.id=w.return_id
 where w.waybill_path=p_path and
 (private.is_leogo_admin('delivery.manage') or r.pickup_station_id=private.pickup_partner_station_id())
 );$fn$;
drop policy if exists "Assigned station uploads aftersales waybill" on storage.objects;
create policy "Assigned station uploads aftersales waybill" on storage.objects for insert to authenticated
with check(bucket_id='aftersales-return-waybills' and private.can_upload_aftersales_waybill(name));
drop policy if exists "Authorized aftersales waybill readers" on storage.objects;
create policy "Authorized aftersales waybill readers" on storage.objects for select to authenticated
using(bucket_id='aftersales-return-waybills' and private.can_read_aftersales_waybill(name));
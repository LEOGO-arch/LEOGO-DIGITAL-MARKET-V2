-- Pickup Station registration business documents and delivery-fee earning source.
alter table public.pickup_station_applications
  add column if not exists business_id_document_path text,
  add column if not exists business_licence_path text,
  add column if not exists registration_certificate_path text,
  add column if not exists other_permit_paths text[] not null default '{}'::text[];

alter table public.pickup_station_finance_settings
  add column if not exists earning_source text not null default 'delivery_fee';

alter table public.pickup_station_finance_settings
  drop constraint if exists pickup_station_finance_settings_earning_source_check;
alter table public.pickup_station_finance_settings
  add constraint pickup_station_finance_settings_earning_source_check
  check (earning_source='delivery_fee');

alter table public.pickup_station_parcels
  add column if not exists earning_source text not null default 'delivery_fee';

alter table public.pickup_station_parcels
  drop constraint if exists pickup_station_parcels_earning_source_check;
alter table public.pickup_station_parcels
  add constraint pickup_station_parcels_earning_source_check
  check (earning_source='delivery_fee');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pickup-station-verification','pickup-station-verification',false,8388608,
       array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do update
set public=false,file_size_limit=8388608,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf']::text[];

drop policy if exists "Pickup station applicant uploads own verification" on storage.objects;
create policy "Pickup station applicant uploads own verification"
on storage.objects for insert to authenticated
with check (bucket_id='pickup-station-verification' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "Pickup station applicant reads own verification" on storage.objects;
create policy "Pickup station applicant reads own verification"
on storage.objects for select to authenticated
using (bucket_id='pickup-station-verification' and (
  (storage.foldername(name))[1]=(select auth.uid())::text
  or private.is_leogo_admin('approvals.read')
  or private.is_leogo_admin('delivery.manage')
));

drop policy if exists "Pickup station applicant updates own verification" on storage.objects;
create policy "Pickup station applicant updates own verification"
on storage.objects for update to authenticated
using (bucket_id='pickup-station-verification' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='pickup-station-verification' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "Pickup station applicant deletes own verification" on storage.objects;
create policy "Pickup station applicant deletes own verification"
on storage.objects for delete to authenticated
using (bucket_id='pickup-station-verification' and (storage.foldername(name))[1]=(select auth.uid())::text);

update public.pickup_station_finance_settings set earning_source='delivery_fee' where id=1;
update public.pickup_station_parcels set earning_source='delivery_fee';

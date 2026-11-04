-- Daily eligibility scan, never automatically deletes or approves any file.
create extension if not exists pg_cron with schema pg_catalog;
create or replace function private.media_housekeeping_daily_scan()
returns integer language plpgsql security definer set search_path='' as $$
declare v_days integer; v_count integer;
begin
 select retention_days into v_days from public.media_housekeeping_settings where id=1 and automatic_scan=true;
 if v_days is null then return 0; end if;
 with eligible as (
  select o.bucket_id,o.name,o.id object_id,p.id parcel_id,
   case when p.receive_photo_path=o.name then 'receive' else 'handover' end proof_kind,
   o.created_at object_created_at,p.handed_over_at completed_at,
   case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end size_bytes
  from storage.objects o join public.pickup_station_parcels p
    on p.receive_photo_path=o.name or p.handover_photo_path=o.name
  where o.bucket_id='pickup-station-proof'
    and coalesce(o.is_delete_marker,false)=false
    and p.status='handed_over' and p.handed_over_at is not null
    and p.handed_over_at < now()-make_interval(days=>v_days)
    and o.created_at < now()-make_interval(days=>v_days)
    and not exists(select 1 from public.marketplace_aftersales_cases c where c.order_id=p.order_id)
 )
 insert into public.media_housekeeping_jobs(bucket_id,object_name,object_id,parcel_id,proof_kind,object_created_at,completed_at,size_bytes)
 select bucket_id,name,object_id,parcel_id,proof_kind,object_created_at,completed_at,size_bytes from eligible
 on conflict(bucket_id,object_name,object_id) do nothing;
 get diagnostics v_count = row_count;
 return v_count;
end $$;
revoke all on function private.media_housekeeping_daily_scan() from public,anon,authenticated;
select cron.schedule('leogo-media-housekeeping-eligibility-scan','15 2 * * *','select private.media_housekeeping_daily_scan();');
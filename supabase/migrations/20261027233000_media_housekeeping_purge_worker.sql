-- Server-only claim/complete functions for approved media cleanup; do not schedule unattended deletion.
alter table public.media_housekeeping_jobs drop constraint if exists media_housekeeping_jobs_status_check;
alter table public.media_housekeeping_jobs add constraint media_housekeeping_jobs_status_check
 check(status in ('pending','approved','processing','deleted','skipped','failed'));

create or replace function public.media_housekeeping_claim(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.media_housekeeping_jobs%rowtype; v_retention integer;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role only'; end if;
 select * into v from public.media_housekeeping_jobs where id=p_job_id and status='approved' for update;
 if not found then return null; end if;
 select retention_days into v_retention from public.media_housekeeping_settings where id=1;
 if now()-v.approved_at > interval '24 hours' then
  update public.media_housekeeping_jobs set status='skipped',processed_at=now(),error_message='Approval expired; re-scan required' where id=v.id;
  return null;
 end if;
 if not exists(
  select 1 from storage.objects o
  join public.pickup_station_parcels p on p.id=v.parcel_id
  where o.id=v.object_id and o.name=v.object_name and o.bucket_id=v.bucket_id
    and o.created_at=v.object_created_at
    and coalesce(o.is_delete_marker,false)=false
    and p.status='handed_over' and p.handed_over_at=v.completed_at
    and p.handed_over_at<now()-make_interval(days=>v_retention)
    and o.created_at<now()-make_interval(days=>v_retention)
    and (p.receive_photo_path=v.object_name or p.handover_photo_path=v.object_name)
    and not exists(select 1 from public.marketplace_aftersales_cases c where c.order_id=p.order_id)
 ) then
   update public.media_housekeeping_jobs set status='skipped',processed_at=now(),error_message='Candidate no longer eligible' where id=v.id;
   return null;
 end if;
 update public.media_housekeeping_jobs set status='processing',error_message=null where id=v.id;
 return jsonb_build_object('id',v.id,'bucket',v.bucket_id,'path',v.object_name,'parcel_id',v.parcel_id,'proof_kind',v.proof_kind);
end $$;

create or replace function public.media_housekeeping_complete(p_job_id uuid,p_removed boolean,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.media_housekeeping_jobs%rowtype;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role only'; end if;
 select * into v from public.media_housekeeping_jobs where id=p_job_id and status='processing' for update;
 if not found then return jsonb_build_object('updated',false); end if;
 if p_removed then
  -- Remove stale pointers only after the Storage API confirms deletion.
  if v.proof_kind='receive' then
   update public.pickup_station_parcels set receive_photo_path=null
   where id=v.parcel_id and receive_photo_path=v.object_name and status='handed_over';
  else
   update public.pickup_station_parcels set handover_photo_path=null
   where id=v.parcel_id and handover_photo_path=v.object_name and status='handed_over';
  end if;
 end if;
 update public.media_housekeeping_jobs
 set status=case when p_removed then 'deleted' else 'failed' end,
     error_message=left(p_error,500),processed_at=now()
 where id=v.id;
 return jsonb_build_object('updated',true,'deleted',p_removed);
end $$;
revoke all on function public.media_housekeeping_claim(uuid),public.media_housekeeping_complete(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.media_housekeeping_claim(uuid),public.media_housekeeping_complete(uuid,boolean,text) to service_role;

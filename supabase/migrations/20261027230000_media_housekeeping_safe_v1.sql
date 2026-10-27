-- Media housekeeping V1. Isolated from existing retention and order workflows.
-- Only pickup proof files linked to completed parcels may enter the approval queue.
create table if not exists public.media_housekeeping_settings (
 id integer primary key default 1 check (id=1),
 retention_days integer not null default 180 check (retention_days between 180 and 3650),
 automatic_scan boolean not null default false,
 approval_required boolean not null default true check (approval_required),
 updated_at timestamptz not null default now()
);
insert into public.media_housekeeping_settings(id) values (1) on conflict do nothing;
create table if not exists public.media_housekeeping_jobs (
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null check(bucket_id='pickup-station-proof'),
 object_name text not null,
 object_id uuid not null,
 parcel_id uuid not null references public.pickup_station_parcels(id),
 proof_kind text not null check(proof_kind in ('receive','handover')),
 object_created_at timestamptz not null,
 completed_at timestamptz not null,
 size_bytes bigint not null default 0,
 status text not null default 'pending' check(status in ('pending','approved','deleted','skipped','failed')),
 scanned_at timestamptz not null default now(),
 approved_at timestamptz,
 approved_by uuid,
 processed_at timestamptz,
 error_message text,
 unique(bucket_id,object_name,object_id)
);
create index if not exists media_housekeeping_jobs_status_idx on public.media_housekeeping_jobs(status,scanned_at);
alter table public.media_housekeeping_settings enable row level security;
alter table public.media_housekeeping_jobs enable row level security;
revoke all on public.media_housekeeping_settings,public.media_housekeeping_jobs from public,anon,authenticated;
create or replace function public.admin_media_housekeeping_scan()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer := 0; v_days integer;
begin
 if not private.is_leogo_super_admin() then raise exception 'Super Admin required'; end if;
 select retention_days into v_days from public.media_housekeeping_settings where id=1;
 -- Freeze candidates to pickup images whose exact path is still referenced by a completed parcel.
 with eligible as (
  select o.bucket_id,o.name,o.id object_id,p.id parcel_id,
  case when p.receive_photo_path=o.name then 'receive' else 'handover' end proof_kind,
  o.created_at object_created_at,p.handed_over_at completed_at,
  case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end size_bytes
  from storage.objects o
  join public.pickup_station_parcels p on
   (p.receive_photo_path=o.name or p.handover_photo_path=o.name)
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
 return jsonb_build_object('new_candidates',v_count,'summary',public.admin_media_housekeeping_summary());
end $$;
create or replace function public.admin_media_housekeeping_summary()
returns jsonb language sql security definer set search_path='' as $$
 select case when private.is_leogo_super_admin() then
 jsonb_build_object('retention_days',(select retention_days from public.media_housekeeping_settings where id=1),
 'automatic_scan',(select automatic_scan from public.media_housekeeping_settings where id=1),
 'pending',(select count(*) from public.media_housekeeping_jobs where status='pending'),
 'approved',(select count(*) from public.media_housekeeping_jobs where status='approved'),
 'deleted',(select count(*) from public.media_housekeeping_jobs where status='deleted'),
 'failed',(select count(*) from public.media_housekeeping_jobs where status='failed'),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',object_name,'bytes',size_bytes,'completed_at',completed_at)) from (select * from public.media_housekeeping_jobs where status='pending' order by scanned_at desc limit 100) a),'[]'::jsonb))
 else null end
$$;
create or replace function public.admin_media_housekeeping_save(p_retention_days integer,p_automatic_scan boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_leogo_super_admin() then raise exception 'Super Admin required'; end if;
 if p_retention_days < 180 or p_retention_days > 3650 then raise exception 'Retention out of range'; end if;
 update public.media_housekeeping_settings set retention_days=p_retention_days,automatic_scan=p_automatic_scan,updated_at=now() where id=1;
 return public.admin_media_housekeeping_summary();
end $$;
create or replace function public.admin_media_housekeeping_approve(p_job_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if not private.is_leogo_super_admin() then raise exception 'Super Admin required'; end if;
 update public.media_housekeeping_jobs set status='approved',approved_by=auth.uid(),approved_at=now()
 where id=any(p_job_ids) and status='pending'
 and exists(select 1 from storage.objects o join public.pickup_station_parcels p on
   p.id=parcel_id and (p.receive_photo_path=object_name or p.handover_photo_path=object_name)
   where o.id=object_id and o.bucket_id=bucket_id and o.name=object_name and o.created_at=object_created_at
   and p.status='handed_over' and p.handed_over_at=completed_at
   and p.handed_over_at<now()-make_interval(days=>(select retention_days from public.media_housekeeping_settings where id=1))
   and not exists(select 1 from public.marketplace_aftersales_cases c where c.order_id=p.order_id));
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.admin_media_housekeeping_scan(),public.admin_media_housekeeping_summary(),public.admin_media_housekeeping_save(integer,boolean),public.admin_media_housekeeping_approve(uuid[]) from public,anon;
grant execute on function public.admin_media_housekeeping_scan(),public.admin_media_housekeeping_summary(),public.admin_media_housekeeping_save(integer,boolean),public.admin_media_housekeeping_approve(uuid[]) to authenticated;

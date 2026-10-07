-- LEOGO Admin safe data cleanup and retention controls.
-- This migration intentionally does NOT delete customers, auth users, orders,
-- payments, wallet/loan records, audit history, or Storage objects.

create table if not exists public.data_retention_settings (
  id smallint primary key default 1 check (id = 1),
  read_notification_days integer not null default 180 check (read_notification_days between 30 and 3650),
  diagnostic_event_days integer not null default 90 check (diagnostic_event_days between 14 and 3650),
  monitoring_run_days integer not null default 90 check (monitoring_run_days between 30 and 3650),
  inactive_customer_review_days integer not null default 365 check (inactive_customer_review_days between 180 and 3650),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.data_retention_settings(id)
values (1)
on conflict (id) do nothing;

alter table public.data_retention_settings enable row level security;
revoke all on table public.data_retention_settings from anon, authenticated;

create or replace function public.admin_get_data_cleanup_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.data_retention_settings%rowtype;
  v_buckets jsonb := '[]'::jsonb;
  v_storage_bytes bigint := 0;
  v_storage_objects bigint := 0;
  v_customer_notifications bigint := 0;
  v_partner_notifications bigint := 0;
  v_runtime_events bigint := 0;
  v_monitoring_runs bigint := 0;
  v_inactive_customers bigint := 0;
  v_database_bytes bigint := 0;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select * into v_settings
  from public.data_retention_settings
  where id = 1;

  select
    coalesce(sum(object_count),0),
    coalesce(sum(total_bytes),0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket_id', bucket_id,
          'object_count', object_count,
          'bytes', total_bytes
        )
        order by total_bytes desc, bucket_id
      ),
      '[]'::jsonb
    )
  into v_storage_objects, v_storage_bytes, v_buckets
  from (
    select
      o.bucket_id,
      count(*)::bigint as object_count,
      coalesce(sum(
        case
          when coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
            then (o.metadata->>'size')::bigint
          else 0
        end
      ),0)::bigint as total_bytes
    from storage.objects o
    where coalesce(o.is_delete_marker,false) = false
    group by o.bucket_id
  ) s;

  select count(*) into v_customer_notifications
  from public.customer_notifications n
  where n.read_at is not null
    and n.created_at < now() - make_interval(days => v_settings.read_notification_days);

  select count(*) into v_partner_notifications
  from public.partner_notifications n
  where n.read_at is not null
    and n.created_at < now() - make_interval(days => v_settings.read_notification_days);

  select count(*) into v_runtime_events
  from private.system_runtime_error_events e
  where e.recorded_at < now() - make_interval(days => v_settings.diagnostic_event_days)
    and exists (
      select 1
      from private.system_runtime_issues i
      where i.fingerprint = e.fingerprint
        and i.status in ('resolved','ignored')
    );

  select count(*) into v_monitoring_runs
  from private.system_monitoring_runs r
  where r.started_at < now() - make_interval(days => v_settings.monitoring_run_days)
    and not exists (
      select 1
      from private.system_monitoring_incidents i
      where i.last_run_id = r.id
    )
    and r.id not in (
      select keep.id
      from private.system_monitoring_runs keep
      order by keep.started_at desc
      limit 30
    );

  select count(*) into v_inactive_customers
  from public.customer_profiles p
  join auth.users u on u.id = p.user_id
  where coalesce(u.last_sign_in_at, u.created_at)
    < now() - make_interval(days => v_settings.inactive_customer_review_days);

  select pg_database_size(current_database()) into v_database_bytes;

  return jsonb_build_object(
    'generated_at', now(),
    'database_bytes', v_database_bytes,
    'storage_bytes', v_storage_bytes,
    'storage_objects', v_storage_objects,
    'storage_buckets', v_buckets,
    'settings', jsonb_build_object(
      'read_notification_days', v_settings.read_notification_days,
      'diagnostic_event_days', v_settings.diagnostic_event_days,
      'monitoring_run_days', v_settings.monitoring_run_days,
      'inactive_customer_review_days', v_settings.inactive_customer_review_days
    ),
    'cleanup_candidates', jsonb_build_object(
      'read_customer_notifications', v_customer_notifications,
      'read_partner_notifications', v_partner_notifications,
      'resolved_runtime_error_events', v_runtime_events,
      'old_monitoring_runs', v_monitoring_runs,
      'total', v_customer_notifications + v_partner_notifications + v_runtime_events + v_monitoring_runs
    ),
    'review_only', jsonb_build_object(
      'inactive_customers', v_inactive_customers,
      'note', 'Inactive customers are review-only and are never deleted automatically.'
    ),
    'protected', jsonb_build_array(
      'Customer and Auth accounts',
      'Orders and order items',
      'Payments and settlements',
      'Wallet, savings and loans',
      'Aftersales and dispute evidence',
      'Admin audit log',
      'Storage files and identity documents'
    )
  );
end;
$$;

create or replace function public.admin_save_data_retention_settings(
  p_read_notification_days integer,
  p_diagnostic_event_days integer,
  p_monitoring_run_days integer,
  p_inactive_customer_review_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  if p_read_notification_days not between 30 and 3650 then
    raise exception 'Read notification retention must be between 30 and 3650 days';
  end if;
  if p_diagnostic_event_days not between 14 and 3650 then
    raise exception 'Diagnostic event retention must be between 14 and 3650 days';
  end if;
  if p_monitoring_run_days not between 30 and 3650 then
    raise exception 'Monitoring run retention must be between 30 and 3650 days';
  end if;
  if p_inactive_customer_review_days not between 180 and 3650 then
    raise exception 'Inactive customer review period must be between 180 and 3650 days';
  end if;

  select to_jsonb(s) into v_before
  from public.data_retention_settings s
  where s.id = 1
  for update;

  update public.data_retention_settings
  set
    read_notification_days = p_read_notification_days,
    diagnostic_event_days = p_diagnostic_event_days,
    monitoring_run_days = p_monitoring_run_days,
    inactive_customer_review_days = p_inactive_customer_review_days,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1;

  select to_jsonb(s) into v_after
  from public.data_retention_settings s
  where s.id = 1;

  perform private.write_admin_audit(
    'settings.data_retention.updated',
    'data_retention_settings',
    '1',
    v_before,
    v_after
  );

  return v_after;
end;
$$;

create or replace function public.admin_run_safe_data_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.data_retention_settings%rowtype;
  v_customer_notifications integer := 0;
  v_partner_notifications integer := 0;
  v_runtime_events integer := 0;
  v_monitoring_runs integer := 0;
  v_result jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select * into v_settings
  from public.data_retention_settings
  where id = 1
  for update;

  delete from public.customer_notifications n
  where n.read_at is not null
    and n.created_at < now() - make_interval(days => v_settings.read_notification_days);
  get diagnostics v_customer_notifications = row_count;

  delete from public.partner_notifications n
  where n.read_at is not null
    and n.created_at < now() - make_interval(days => v_settings.read_notification_days);
  get diagnostics v_partner_notifications = row_count;

  delete from private.system_runtime_error_events e
  where e.recorded_at < now() - make_interval(days => v_settings.diagnostic_event_days)
    and exists (
      select 1
      from private.system_runtime_issues i
      where i.fingerprint = e.fingerprint
        and i.status in ('resolved','ignored')
    );
  get diagnostics v_runtime_events = row_count;

  delete from private.system_monitoring_runs r
  where r.started_at < now() - make_interval(days => v_settings.monitoring_run_days)
    and not exists (
      select 1
      from private.system_monitoring_incidents i
      where i.last_run_id = r.id
    )
    and r.id not in (
      select keep.id
      from private.system_monitoring_runs keep
      order by keep.started_at desc
      limit 30
    );
  get diagnostics v_monitoring_runs = row_count;

  v_result := jsonb_build_object(
    'customer_notifications_deleted', v_customer_notifications,
    'partner_notifications_deleted', v_partner_notifications,
    'runtime_error_events_deleted', v_runtime_events,
    'monitoring_runs_deleted', v_monitoring_runs,
    'total_deleted', v_customer_notifications + v_partner_notifications + v_runtime_events + v_monitoring_runs,
    'protected_data_untouched', true,
    'completed_at', now()
  );

  perform private.write_admin_audit(
    'data_cleanup.safe_housekeeping.completed',
    'system_housekeeping',
    null,
    null,
    v_result,
    jsonb_build_object(
      'read_notification_days', v_settings.read_notification_days,
      'diagnostic_event_days', v_settings.diagnostic_event_days,
      'monitoring_run_days', v_settings.monitoring_run_days
    )
  );

  return v_result;
end;
$$;

revoke all on function public.admin_get_data_cleanup_overview() from public;
revoke all on function public.admin_save_data_retention_settings(integer,integer,integer,integer) from public;
revoke all on function public.admin_run_safe_data_cleanup() from public;

grant execute on function public.admin_get_data_cleanup_overview() to authenticated;
grant execute on function public.admin_save_data_retention_settings(integer,integer,integer,integer) to authenticated;
grant execute on function public.admin_run_safe_data_cleanup() to authenticated;

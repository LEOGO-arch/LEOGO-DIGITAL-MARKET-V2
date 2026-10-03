-- LEOGO System Diagnosis Phase 4
-- Preventive monitoring: lightweight 15-minute scans, incident grouping,
-- recovery detection, trend history, maintenance awareness and Super Admin alerts.
-- This layer never applies business-data repairs.

create table if not exists private.system_monitoring_settings (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  maintenance_until timestamptz,
  maintenance_reason text,
  scan_interval_minutes integer not null default 15 check (scan_interval_minutes between 5 and 1440),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table private.system_monitoring_settings enable row level security;
revoke all on table private.system_monitoring_settings from public,anon,authenticated;

insert into private.system_monitoring_settings(id)
values(1)
on conflict(id) do nothing;

create table if not exists private.system_monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null check (trigger_source in ('cron','manual','deploy')),
  run_status text not null check (run_status in ('running','healthy','warning','critical','maintenance','disabled','failed')),
  health_score integer check (health_score between 0 and 100),
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  recovered_count integer not null default 0,
  checks jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table private.system_monitoring_runs enable row level security;
revoke all on table private.system_monitoring_runs from public,anon,authenticated;

create index if not exists system_monitoring_runs_started_idx
  on private.system_monitoring_runs(started_at desc);

create table if not exists private.system_monitoring_incidents (
  id uuid primary key default gen_random_uuid(),
  check_id text not null unique,
  module text not null,
  title text not null,
  base_severity text not null check (base_severity in ('warning','critical')),
  severity text not null check (severity in ('warning','critical')),
  status text not null check (status in ('active','recovered')),
  summary text,
  evidence text,
  suggested_action text,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  recovered_at timestamptz,
  occurrence_count bigint not null default 1,
  consecutive_failures integer not null default 1,
  reopened_count integer not null default 0,
  last_run_id uuid references private.system_monitoring_runs(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.system_monitoring_incidents enable row level security;
revoke all on table private.system_monitoring_incidents from public,anon,authenticated;

create index if not exists system_monitoring_incidents_status_idx
  on private.system_monitoring_incidents(status,severity,last_detected_at desc);

create or replace function private.system_monitoring_checks()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_checks jsonb:=private.system_diagnostic_phase2_checks();
  v_count bigint:=0;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.proname like 'admin_%'
    and has_function_privilege('anon',p.oid,'EXECUTE');

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'security.anon_admin_functions','security','Anonymous Admin Function Exposure',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'No privileged Admin SECURITY DEFINER RPC is executable by anonymous users.' else 'Anonymous users can execute one or more privileged Admin functions.' end,
    v_count::text||' exposed Admin SECURITY DEFINER function(s).',
    'Revoke EXECUTE from PUBLIC/anon on the affected Admin RPCs, preserve authenticated access only where required, then verify again.',
    true
  ));

  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relrowsecurity=false;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'security.public_rls','security','Public Table RLS',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'RLS is enabled on all public application tables.' else 'One or more public tables have RLS disabled.' end,
    v_count::text||' public table(s) without RLS.',
    'Review the affected table access model, enable RLS and add only the policies required by the real workflow.',
    true
  ));

  select count(*) into v_count
  from public.admin_users a
  left join auth.users u on u.id=a.user_id
  where u.id is null;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'auth_staff.admin_auth_links','auth_staff','Admin Authentication Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Every Admin record maps to an Auth user.' else 'An Admin profile is detached from its Auth user.' end,
    v_count::text||' orphan Admin profile(s).',
    'Restore only the missing Admin/Auth relationship after verifying the intended account.',
    true
  ));

  select count(*) into v_count
  from public.leogo_staff s
  left join auth.users u on u.id=s.user_id
  where u.id is null;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'auth_staff.staff_auth_links','auth_staff','Staff Authentication Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Every LEOGO staff/rider record maps to an Auth user.' else 'A staff/rider profile is detached from its Auth user.' end,
    v_count::text||' orphan staff/rider profile(s).',
    'Repair only the affected staff invitation/Auth account link.',
    true
  ));

  select count(*) into v_count
  from public.payment_account_assignments a
  left join public.payment_accounts p on p.id=a.account_id
  where p.id is null or p.status is distinct from 'active';

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'payments.assignment_integrity','payments','Payment Account Assignments',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'All assigned payment destinations point to active accounts.' else 'A payment destination points to a missing or inactive account.' end,
    v_count::text||' broken payment assignment(s).',
    'Stop new payments on the affected function until its destination is reconnected to a verified active account.',
    true
  ));

  select count(*) into v_count
  from public.order_email_outbox e
  where e.sent_at is null
    and e.status in ('failed','configuration_required')
    and (
      e.event_key not like 'admin_test_%'
      or e.updated_at > coalesce(
        (
          select max(s.sent_at)
          from public.order_email_outbox s
          where s.event_key like 'admin_test_%'
            and s.status='sent'
            and s.sent_at is not null
        ),
        '-infinity'::timestamptz
      )
    );

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'notifications.email_failures','notifications','Transactional Email Queue',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'No current failed or configuration-blocked transactional emails are waiting.' else 'Transactional emails need attention.' end,
    v_count::text||' current failed/configuration-blocked email job(s).',
    'Inspect the latest email error and sender configuration, then retry only failed jobs after the cause is fixed.',
    true
  ));

  select count(*) into v_count
  from public.marketplace_order_items i
  left join public.marketplace_orders o on o.id=i.order_id
  where o.id is null;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'orders.orphan_items','orders','Order Item Integrity',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'All marketplace order items belong to an order.' else 'One or more order items are detached from their parent order.' end,
    v_count::text||' orphan order item(s).',
    'Do not delete broadly. Restore only the confirmed parent relationship after checking immutable order history.',
    true
  ));

  select count(*) into v_count
  from public.marketplace_orders o
  where abs(
    coalesce(o.items_subtotal_kes,0)
    -coalesce((
      select sum(i.line_total_kes)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),0)
  )>0.01;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'orders.subtotal_consistency','orders','Order Subtotal Consistency',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Stored order subtotals match their item line totals.' else 'An order subtotal differs from its immutable item lines.' end,
    v_count::text||' order(s) with item subtotal mismatch.',
    'Compare the affected order snapshot with its immutable items and payment history before any correction.',
    true
  ));

  select count(*) into v_count
  from public.marketplace_delivery_jobs d
  left join public.leogo_staff r on r.user_id=d.rider_id
  where d.rider_id is not null
    and (r.user_id is null or r.status<>'active' or r.staff_role<>'rider');

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'orders.delivery_rider_links','transport','Assigned Rider Integrity',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Assigned delivery jobs reference active Rider staff accounts.' else 'A delivery job is assigned to a missing/inactive/non-Rider staff account.' end,
    v_count::text||' invalid Rider assignment(s).',
    'Reassign only the affected delivery job to an active LEOGO Rider while preserving delivery history.',
    true
  ));

  select count(*) into v_count
  from public.wallet_ledger_entries l
  left join public.wallet_accounts a on a.user_id=l.user_id
  where a.user_id is null;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'wallet.ledger_links','wallet','Wallet Ledger Account Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Wallet ledger entries map to Wallet accounts.' else 'A Wallet ledger entry is detached from its account.' end,
    v_count::text||' orphan Wallet ledger entry/entries.',
    'Freeze changes to the affected Wallet account and reconcile the ledger/account relationship without deleting history.',
    true
  ));

  return v_checks;
end;
$function$;

revoke execute on function private.system_monitoring_checks()
  from public,anon,authenticated;

create or replace function private.run_system_monitoring_scan(
  p_trigger text default 'cron'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_trigger text:=case when p_trigger in ('cron','manual','deploy') then p_trigger else 'cron' end;
  v_run_id uuid:=gen_random_uuid();
  v_settings private.system_monitoring_settings%rowtype;
  v_checks jsonb:='[]'::jsonb;
  v_check jsonb;
  v_failed_ids text[]:=array[]::text[];
  v_existing private.system_monitoring_incidents%rowtype;
  v_consecutive integer:=0;
  v_effective_severity text;
  v_critical integer:=0;
  v_warning integer:=0;
  v_recovered integer:=0;
  v_score integer:=100;
  v_status text:='healthy';
begin
  select * into v_settings
  from private.system_monitoring_settings
  where id=1
  for update;

  if v_settings.maintenance_mode
     and v_settings.maintenance_until is not null
     and v_settings.maintenance_until<=now() then
    update private.system_monitoring_settings
    set maintenance_mode=false,
        maintenance_until=null,
        maintenance_reason=null,
        updated_at=now()
    where id=1
    returning * into v_settings;
  end if;

  insert into private.system_monitoring_runs(
    id,trigger_source,run_status,started_at
  ) values(v_run_id,v_trigger,'running',now());

  if not v_settings.enabled then
    update private.system_monitoring_runs
    set run_status='disabled',health_score=null,completed_at=now()
    where id=v_run_id;
    return jsonb_build_object('ok',true,'run_id',v_run_id,'status','disabled');
  end if;

  if v_settings.maintenance_mode
     and (v_settings.maintenance_until is null or v_settings.maintenance_until>now()) then
    update private.system_monitoring_runs
    set run_status='maintenance',health_score=null,completed_at=now()
    where id=v_run_id;
    return jsonb_build_object(
      'ok',true,'run_id',v_run_id,'status','maintenance',
      'maintenance_until',v_settings.maintenance_until
    );
  end if;

  v_checks:=private.system_monitoring_checks();

  for v_check in
    select value from jsonb_array_elements(v_checks)
  loop
    if coalesce(v_check->>'status','healthy')='healthy' then
      continue;
    end if;

    v_failed_ids:=array_append(v_failed_ids,v_check->>'id');

    select * into v_existing
    from private.system_monitoring_incidents
    where check_id=v_check->>'id'
    for update;

    if not found then
      v_consecutive:=1;
      v_effective_severity:=v_check->>'status';

      insert into private.system_monitoring_incidents(
        check_id,module,title,base_severity,severity,status,summary,evidence,
        suggested_action,first_detected_at,last_detected_at,occurrence_count,
        consecutive_failures,reopened_count,last_run_id,updated_at
      ) values(
        v_check->>'id',
        coalesce(v_check->>'module','system'),
        coalesce(v_check->>'title',v_check->>'id'),
        v_check->>'status',
        v_effective_severity,
        'active',
        v_check->>'summary',
        v_check->>'evidence',
        v_check->>'suggested_repair',
        now(),now(),1,1,0,v_run_id,now()
      );
    else
      v_consecutive:=case
        when v_existing.status='active' then v_existing.consecutive_failures+1
        else 1
      end;

      v_effective_severity:=case
        when v_check->>'status'='critical' then 'critical'
        when v_consecutive>=3 then 'critical'
        else 'warning'
      end;

      update private.system_monitoring_incidents
      set module=coalesce(v_check->>'module',module),
          title=coalesce(v_check->>'title',title),
          base_severity=v_check->>'status',
          severity=v_effective_severity,
          status='active',
          summary=v_check->>'summary',
          evidence=v_check->>'evidence',
          suggested_action=v_check->>'suggested_repair',
          last_detected_at=now(),
          recovered_at=null,
          occurrence_count=occurrence_count+1,
          consecutive_failures=v_consecutive,
          reopened_count=reopened_count+case when v_existing.status='recovered' then 1 else 0 end,
          last_run_id=v_run_id,
          updated_at=now()
      where check_id=v_check->>'id';
    end if;
  end loop;

  update private.system_monitoring_incidents
  set status='recovered',
      recovered_at=now(),
      consecutive_failures=0,
      last_run_id=v_run_id,
      updated_at=now()
  where status='active'
    and not (check_id=any(v_failed_ids));

  get diagnostics v_recovered=row_count;

  select
    count(*) filter(where severity='critical'),
    count(*) filter(where severity='warning')
  into v_critical,v_warning
  from private.system_monitoring_incidents
  where status='active';

  v_score:=greatest(0,100-(v_critical*12)-(v_warning*5));
  v_status:=case
    when v_critical>0 then 'critical'
    when v_warning>0 then 'warning'
    else 'healthy'
  end;

  update private.system_monitoring_runs
  set run_status=v_status,
      health_score=v_score,
      critical_count=v_critical,
      warning_count=v_warning,
      recovered_count=v_recovered,
      checks=v_checks,
      completed_at=now()
  where id=v_run_id;

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run_id,
    'status',v_status,
    'health_score',v_score,
    'critical_count',v_critical,
    'warning_count',v_warning,
    'recovered_count',v_recovered,
    'completed_at',now()
  );

exception when others then
  update private.system_monitoring_runs
  set run_status='failed',
      health_score=0,
      critical_count=1,
      error_message=left(sqlerrm,500),
      completed_at=now()
  where id=v_run_id;

  insert into private.system_monitoring_incidents(
    check_id,module,title,base_severity,severity,status,summary,evidence,
    suggested_action,first_detected_at,last_detected_at,occurrence_count,
    consecutive_failures,last_run_id,updated_at
  ) values(
    'monitor.engine_failure','monitoring','Preventive Monitoring Engine',
    'critical','critical','active',
    'The scheduled monitoring engine could not complete its checks.',
    left(sqlerrm,400),
    'Open System Diagnosis, inspect the monitoring run and repair only the failing monitoring dependency.',
    now(),now(),1,1,v_run_id,now()
  )
  on conflict(check_id) do update
  set severity='critical',
      status='active',
      summary=excluded.summary,
      evidence=excluded.evidence,
      suggested_action=excluded.suggested_action,
      last_detected_at=now(),
      recovered_at=null,
      occurrence_count=private.system_monitoring_incidents.occurrence_count+1,
      consecutive_failures=case
        when private.system_monitoring_incidents.status='active'
          then private.system_monitoring_incidents.consecutive_failures+1
        else 1
      end,
      reopened_count=private.system_monitoring_incidents.reopened_count+
        case when private.system_monitoring_incidents.status='recovered' then 1 else 0 end,
      last_run_id=v_run_id,
      updated_at=now();

  return jsonb_build_object(
    'ok',false,'run_id',v_run_id,'status','failed','message','Preventive monitoring scan failed.'
  );
end;
$function$;

revoke execute on function private.run_system_monitoring_scan(text)
  from public,anon,authenticated;

create or replace function public.admin_get_system_monitoring_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_settings jsonb;
  v_summary jsonb;
  v_incidents jsonb;
  v_runs jsonb;
  v_last_started timestamptz;
  v_interval integer:=15;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select jsonb_build_object(
    'enabled',s.enabled,
    'maintenance_mode',s.maintenance_mode,
    'maintenance_until',s.maintenance_until,
    'maintenance_reason',s.maintenance_reason,
    'scan_interval_minutes',s.scan_interval_minutes,
    'updated_at',s.updated_at
  ),s.scan_interval_minutes
  into v_settings,v_interval
  from private.system_monitoring_settings s
  where s.id=1;

  select r.started_at,
         jsonb_build_object(
           'health_score',r.health_score,
           'status',r.run_status,
           'critical_count',r.critical_count,
           'warning_count',r.warning_count,
           'recovered_count',r.recovered_count,
           'last_scan_at',r.completed_at,
           'last_trigger',r.trigger_source,
           'next_scan_at',case
             when r.completed_at is null then null
             else r.completed_at+make_interval(mins=>v_interval)
           end
         )
  into v_last_started,v_summary
  from private.system_monitoring_runs r
  order by r.started_at desc
  limit 1;

  if v_summary is null then
    v_summary:=jsonb_build_object(
      'health_score',null,'status','not_run','critical_count',0,'warning_count',0,
      'recovered_count',0,'last_scan_at',null,'last_trigger',null,'next_scan_at',null
    );
  end if;

  v_summary:=v_summary||jsonb_build_object(
    'active_critical',(select count(*) from private.system_monitoring_incidents where status='active' and severity='critical'),
    'active_warnings',(select count(*) from private.system_monitoring_incidents where status='active' and severity='warning'),
    'recovered_today',(select count(*) from private.system_monitoring_incidents where status='recovered' and recovered_at>=date_trunc('day',now()))
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.status when 'active' then 0 else 1 end,
    case x.severity when 'critical' then 0 else 1 end,
    coalesce(x.last_detected_at,x.recovered_at) desc
  ),'[]'::jsonb)
  into v_incidents
  from (
    select i.id,i.check_id,i.module,i.title,i.base_severity,i.severity,i.status,
           i.summary,i.evidence,i.suggested_action,i.first_detected_at,
           i.last_detected_at,i.recovered_at,i.occurrence_count,
           i.consecutive_failures,i.reopened_count
    from private.system_monitoring_incidents i
    where i.status='active'
       or (i.status='recovered' and i.recovered_at>=now()-interval '24 hours')
    order by
      case i.status when 'active' then 0 else 1 end,
      case i.severity when 'critical' then 0 else 1 end,
      coalesce(i.last_detected_at,i.recovered_at) desc
    limit 60
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at asc),'[]'::jsonb)
  into v_runs
  from (
    select r.id,r.trigger_source,r.run_status,r.health_score,r.critical_count,
           r.warning_count,r.recovered_count,r.started_at,r.completed_at
    from private.system_monitoring_runs r
    where r.started_at>=now()-interval '7 days'
      and r.run_status not in ('running')
    order by r.started_at desc
    limit 40
  ) x;

  return jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'summary',v_summary,
    'incidents',v_incidents,
    'recent_runs',v_runs
  );
end;
$function$;

revoke execute on function public.admin_get_system_monitoring_snapshot()
  from public,anon;
grant execute on function public.admin_get_system_monitoring_snapshot()
  to authenticated;

create or replace function public.admin_update_system_monitoring_settings(
  p_pin text,
  p_enabled boolean,
  p_maintenance_mode boolean,
  p_maintenance_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_verify jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  v_verify:=private.verify_system_diagnostics_pin(p_pin);
  if coalesce((v_verify->>'ok')::boolean,false)=false then
    return v_verify;
  end if;

  if coalesce(p_maintenance_mode,false)
     and p_maintenance_until is not null
     and p_maintenance_until<=now() then
    return jsonb_build_object('ok',false,'message','Maintenance end time must be in the future.');
  end if;

  select to_jsonb(s) into v_before
  from private.system_monitoring_settings s
  where s.id=1;

  update private.system_monitoring_settings
  set enabled=coalesce(p_enabled,true),
      maintenance_mode=coalesce(p_maintenance_mode,false),
      maintenance_until=case when coalesce(p_maintenance_mode,false) then p_maintenance_until else null end,
      maintenance_reason=case
        when coalesce(p_maintenance_mode,false) then nullif(left(btrim(coalesce(p_reason,'')),240),'')
        else null
      end,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1;

  select to_jsonb(s) into v_after
  from private.system_monitoring_settings s
  where s.id=1;

  perform private.write_admin_audit(
    'system_monitoring.settings_updated',
    'system_monitoring_settings',
    '1',
    v_before,
    v_after,
    jsonb_build_object('phase',4)
  );

  return jsonb_build_object('ok',true,'settings',v_after);
end;
$function$;

revoke execute on function public.admin_update_system_monitoring_settings(
  text,boolean,boolean,timestamptz,text
) from public,anon;
grant execute on function public.admin_update_system_monitoring_settings(
  text,boolean,boolean,timestamptz,text
) to authenticated;

create or replace function public.admin_run_system_monitoring_now(
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_verify jsonb;
  v_result jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  v_verify:=private.verify_system_diagnostics_pin(p_pin);
  if coalesce((v_verify->>'ok')::boolean,false)=false then
    return v_verify;
  end if;

  v_result:=private.run_system_monitoring_scan('manual');

  perform private.write_admin_audit(
    'system_monitoring.manual_scan',
    'system_monitoring_run',
    coalesce(v_result->>'run_id','unknown'),
    null,
    v_result,
    jsonb_build_object('phase',4)
  );

  return v_result;
end;
$function$;

revoke execute on function public.admin_run_system_monitoring_now(text)
  from public,anon;
grant execute on function public.admin_run_system_monitoring_now(text)
  to authenticated;

-- Schedule one lightweight in-database scan every 15 minutes.
select cron.schedule(
  'leogo-system-monitoring-15m',
  '*/15 * * * *',
  $$select private.run_system_monitoring_scan('cron');$$
);

-- Seed Phase 4 immediately so the dashboard has a verified baseline.
select private.run_system_monitoring_scan('deploy');

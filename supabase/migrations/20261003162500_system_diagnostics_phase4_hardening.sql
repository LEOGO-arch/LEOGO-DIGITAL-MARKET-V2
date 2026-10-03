-- Phase 4 monitoring hardening.
-- Preserve failed-run history across handled SQL exceptions and align timing
-- summaries with the 15-minute cron and Africa/Nairobi.

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
  insert into private.system_monitoring_runs(
    id,trigger_source,run_status,started_at
  ) values(v_run_id,v_trigger,'running',now());

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
             else to_timestamp(
               (floor(extract(epoch from now())/(v_interval*60))+1)*(v_interval*60)
             )
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
    'recovered_today',(
      select count(*)
      from private.system_monitoring_incidents
      where status='recovered'
        and recovered_at >= ((now() at time zone 'Africa/Nairobi')::date::timestamp at time zone 'Africa/Nairobi')
    )
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

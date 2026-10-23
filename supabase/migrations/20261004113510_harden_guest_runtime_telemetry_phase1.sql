-- Forward-only LEOGO-SEC-001 hardening. Does not rewrite incident history.
create or replace function private.sanitize_runtime_diagnostic(value text,maximum integer)
returns text language sql immutable set search_path='' as $scrub$
 select left(
 regexp_replace(
 regexp_replace(
 regexp_replace(
 regexp_replace(
 regexp_replace(
 regexp_replace(
 regexp_replace(coalesce(value,''),
   'https?://[^[:space:]<>"'']+','[url]','gi'),
   '(password|passwd|authorization|refresh[_ -]?token|access[_ -]?token|api[_ -]?key|service[_ -]?role|national[_ -]?id|passport|account[_ -]?(number|no))[[:space:]]*[:=][[:space:]]*[^[:space:],;]+','[redacted]','gi'),
   'eyJ[A-Za-z0-9_-]{8,}[.][A-Za-z0-9_-]{8,}[.][A-Za-z0-9_-]{8,}','[token]','g'),
   'sb_(publishable|secret)_[A-Za-z0-9_-]+','[key]','gi'),
   '[A-Za-z0-9_-]{64,}','[token]','g'),
   '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}','[email]','gi'),
   '[+]?[0-9][0-9 ()-]{7,}[0-9]','[number]','g'),greatest(0,least(maximum,600)))
$scrub$;
revoke all on function private.sanitize_runtime_diagnostic(text,integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_system_runtime_error(p_portal text, p_module text, p_error_type text, p_message text, p_operation text, p_error_code text, p_page_path text, p_source text, p_line_no integer, p_column_no integer, p_user_type text, p_client_id text, p_severity text, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_portal text:=lower(left(btrim(coalesce(p_portal,'')),30));
  v_module text:=lower(left(btrim(coalesce(p_module,'unknown')),80));
  v_type text:=lower(left(btrim(coalesce(p_error_type,'js_error')),40));
  v_message text:=btrim(coalesce(p_message,'Unknown runtime error'));
  v_operation text:=nullif(left(btrim(coalesce(p_operation,'')),180),'');
  v_error_code text:=nullif(left(btrim(coalesce(p_error_code,'')),80),'');
  v_page text:=nullif(left(regexp_replace(btrim(coalesce(p_page_path,'')),'[?#].*$','','g'),220),'');
  v_source text:=nullif(left(regexp_replace(btrim(coalesce(p_source,'')),'[?#].*$','','g'),260),'');
  v_user_type text:=lower(left(btrim(coalesce(p_user_type,v_portal)),30));
  v_client_hash text;
  v_fingerprint text;
  v_severity text;
  v_recent integer;
  v_status integer:=0;
  v_meta jsonb;
  v_uid uuid := (select auth.uid());
  v_trusted boolean := coalesce((select auth.role()),'anon')='service_role';
begin
  if v_portal not in ('customer','partner','staff','pickup','admin') then
    return jsonb_build_object('ok',false,'reason','invalid_portal');
  end if;

  if v_type not in ('js_error','unhandled_rejection','http_error','resource_error','connectivity_error') then
    return jsonb_build_object('ok',false,'reason','invalid_error_type');
  end if;

  if octet_length(v_message)>8192 then
    return jsonb_build_object('ok',false,'reason','invalid_message');
  end if;

  if char_length(v_message)<2 then
    return jsonb_build_object('ok',false,'reason','empty_error');
  end if;

  if p_metadata is not null and (jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>8192) then
    return jsonb_build_object('ok',false,'reason','invalid_metadata');
  end if;
  v_message:=private.sanitize_runtime_diagnostic(v_message,600);
  v_module:=private.sanitize_runtime_diagnostic(v_module,80);
  v_error_code:=private.sanitize_runtime_diagnostic(v_error_code,80);
  v_operation:=private.sanitize_runtime_diagnostic(v_operation,180);
  v_source:=private.sanitize_runtime_diagnostic(v_source,260);
  v_error_code:=case when v_error_code ~ '^[A-Za-z0-9_-]{1,40}$' then v_error_code else null end;
  v_operation:=case when v_operation ~ '^(rpc|edge):[A-Za-z0-9_-]+$' or v_operation ~ '^storage:object/[A-Za-z0-9_-]+$'
    or v_operation='connectivity:supabase_api' then v_operation else null end;
  v_page:=case when v_page ~ '^/[A-Za-z0-9_/-]*([.]html)?$'
    then private.sanitize_runtime_diagnostic(v_page,220) else null end;
  v_source:=case
    when v_source ~ '/rest/v1/rpc/[A-Za-z0-9_]+$' then '/rest/v1/rpc/'||substring(v_source from '/rest/v1/rpc/([A-Za-z0-9_]+)$')
    when v_source ~ '/functions/v1/[A-Za-z0-9_-]+$' then '/functions/v1/'||substring(v_source from '/functions/v1/([A-Za-z0-9_-]+)$')
    when v_source ~ '/storage/v1/object/[A-Za-z0-9_-]+$' then '/storage/v1/object/'||substring(v_source from '/storage/v1/object/([A-Za-z0-9_-]+)$')
    when v_source ~ '^/[A-Za-z0-9_/-]+[.]js$' then private.sanitize_runtime_diagnostic(v_source,260)
    else null end;
  v_user_type:=case when v_uid is null then 'guest' else 'authenticated' end;

  if coalesce(p_metadata->>'status','') ~ '^[0-9]{3}$' then
    v_status:=(p_metadata->>'status')::integer;
  end if;

  -- Browser reports are unverified observations, never trusted Critical incidents.
  -- Existing Critical/history rows and trusted backend reporting remain intact.
  v_severity:=case
    when v_trusted and (v_type in ('js_error','unhandled_rejection') or v_status>=500) then 'critical'
    else 'warning'
  end;
  -- auth.uid is verified by the API gateway. Guest reports share a bounded portal
  -- bucket; changing p_client_id, messages or headers cannot mint a fresh bucket.
  v_client_hash:=encode(extensions.digest(
    case when v_uid is not null then 'user:'||v_uid::text else 'guest' end||'|'||v_portal,
    'sha256'
  ),'hex');
  -- Serialize this bucket so concurrent submissions cannot race past the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_client_hash,0));

  v_fingerprint:=encode(extensions.digest(
    lower(v_portal||'|'||v_module||'|'||v_type||'|'||v_message||'|'||coalesce(v_operation,'')),
    'sha256'
  ),'hex');

  if exists(
    select 1 from private.system_runtime_error_events e
    where e.fingerprint=v_fingerprint
      and e.client_hash=v_client_hash
      and e.recorded_at>now()-interval '30 seconds'
  ) then
    return jsonb_build_object('ok',true,'deduped',true);
  end if;

  select count(*) into v_recent
  from private.system_runtime_error_events e
  where e.client_hash=v_client_hash
    and e.recorded_at>now()-interval '10 minutes';

  if v_recent>=60 then
    return jsonb_build_object('ok',true,'rate_limited',true);
  end if;

  v_meta:=jsonb_strip_nulls(jsonb_build_object(
    'report_trust',case when v_trusted then 'trusted_backend' else 'client_unverified' end,
    'status',case when v_status>0 then v_status else null end,
    'method',case when upper(coalesce(p_metadata->>'method','')) in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS') then upper(p_metadata->>'method') else null end,
    'host',case when lower(coalesce(p_metadata->>'host','')) in ('leogo-arch.github.io','dzdciuqkqixwutvtfotj.supabase.co') then lower(p_metadata->>'host') else null end,
    'failed_count',case
      when coalesce(p_metadata->>'failed_count','') ~ '^[0-9]{1,3}$'
        then least(500,greatest(1,(p_metadata->>'failed_count')::integer))
      else null
    end
  ));

  insert into private.system_runtime_issues(
    fingerprint,portal,module,error_type,severity,status,title,last_message,
    operation,first_seen,last_seen,event_count,last_page_path,last_source,updated_at
  )
  values(
    v_fingerprint,v_portal,v_module,v_type,v_severity,'new',
    left(initcap(replace(v_module,'_',' '))||' runtime error',140),
    v_message,v_operation,now(),now(),1,v_page,v_source,now()
  )
  on conflict(fingerprint) do update
  set severity=case
        when private.system_runtime_issues.severity='critical' or excluded.severity='critical'
          then 'critical' else 'warning' end,
      status=case
        when private.system_runtime_issues.status='resolved' then 'reopened'
        when private.system_runtime_issues.status='ignored' then 'ignored'
        else 'recurring' end,
      reopened_count=private.system_runtime_issues.reopened_count+
        case when private.system_runtime_issues.status='resolved' then 1 else 0 end,
      last_message=excluded.last_message,
      operation=coalesce(excluded.operation,private.system_runtime_issues.operation),
      last_seen=now(),
      event_count=private.system_runtime_issues.event_count+1,
      last_page_path=coalesce(excluded.last_page_path,private.system_runtime_issues.last_page_path),
      last_source=coalesce(excluded.last_source,private.system_runtime_issues.last_source),
      updated_at=now();

  insert into private.system_runtime_error_events(
    fingerprint,portal,module,error_type,severity,message,operation,error_code,
    page_path,source,line_no,column_no,user_type,client_hash,metadata,occurred_at
  )
  values(
    v_fingerprint,v_portal,v_module,v_type,v_severity,v_message,v_operation,
    v_error_code,v_page,v_source,
    case when coalesce(p_line_no,0)>0 then p_line_no else null end,
    case when coalesce(p_column_no,0)>0 then p_column_no else null end,
    v_user_type,v_client_hash,v_meta,now()
  );

  return jsonb_build_object('ok',true,'fingerprint',v_fingerprint);
end;
$function$

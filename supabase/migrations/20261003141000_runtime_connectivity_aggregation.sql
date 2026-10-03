-- Aggregate transient client/network storms into a single connectivity warning.
-- No business workflow or operational data is changed.

create or replace function public.record_system_runtime_error(
  p_portal text,
  p_module text,
  p_error_type text,
  p_message text,
  p_operation text,
  p_error_code text,
  p_page_path text,
  p_source text,
  p_line_no integer,
  p_column_no integer,
  p_user_type text,
  p_client_id text,
  p_severity text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_portal text:=lower(left(btrim(coalesce(p_portal,'')),30));
  v_module text:=lower(left(btrim(coalesce(p_module,'unknown')),80));
  v_type text:=lower(left(btrim(coalesce(p_error_type,'js_error')),40));
  v_message text:=left(btrim(coalesce(p_message,'Unknown runtime error')),600);
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
begin
  if v_portal not in ('customer','partner','staff','pickup','admin') then
    return jsonb_build_object('ok',false,'reason','invalid_portal');
  end if;

  if v_type not in ('js_error','unhandled_rejection','http_error','resource_error','connectivity_error') then
    v_type:='js_error';
  end if;

  if char_length(v_message)<2 then
    return jsonb_build_object('ok',false,'reason','empty_error');
  end if;

  v_message:=regexp_replace(v_message,'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}','[email]','gi');
  v_message:=regexp_replace(v_message,'\+?[0-9][0-9 ()-]{7,}[0-9]','[number]','g');
  v_message:=regexp_replace(v_message,'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}','[token]','g');
  v_message:=regexp_replace(v_message,'sb_(publishable|secret)_[A-Za-z0-9_-]+','[key]','gi');

  if coalesce(p_metadata->>'status','') ~ '^[0-9]{3}$' then
    v_status:=(p_metadata->>'status')::integer;
  end if;

  v_severity:=case
    when lower(coalesce(p_severity,''))='critical' then 'critical'
    when v_type in ('js_error','unhandled_rejection') then 'critical'
    when v_status>=500 then 'critical'
    else 'warning'
  end;

  v_client_hash:=encode(extensions.digest(
    coalesce(nullif(left(p_client_id,120),''),'missing-client')||'|'||v_portal,
    'sha256'
  ),'hex');

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
    'status',case when v_status>0 then v_status else null end,
    'method',nullif(left(upper(coalesce(p_metadata->>'method','')),12),''),
    'host',nullif(left(lower(coalesce(p_metadata->>'host','')),120),''),
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
$function$;

revoke execute on function public.record_system_runtime_error(
  text,text,text,text,text,text,text,text,integer,integer,text,text,text,jsonb
) from public;
grant execute on function public.record_system_runtime_error(
  text,text,text,text,text,text,text,text,integer,integer,text,text,text,jsonb
) to anon,authenticated;

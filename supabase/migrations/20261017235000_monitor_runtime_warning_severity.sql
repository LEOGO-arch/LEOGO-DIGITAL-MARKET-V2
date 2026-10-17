-- Keep recurring runtime warnings visible, but do not label them critical
-- solely due to scan count when there are zero actual critical runtime errors.
-- All other monitoring checks keep their existing escalation policy.
do $patch$
declare
 v_def text;
 v_old text:='when v_consecutive>=3 then ''critical''';
 v_new text:='when v_consecutive>=3 and v_check->>''id''<>''runtime.live_errors'' then ''critical''';
begin
 select pg_get_functiondef('private.run_system_monitoring_scan(text)'::regprocedure) into v_def;
 if position(v_new in v_def)>0 then return; end if;
 if position(v_old in v_def)=0 then raise exception 'Monitoring escalation implementation changed'; end if;
 execute replace(v_def,v_old,v_new);
end
$patch$;
-- LEOGO Super Admin Security Controls
-- Owner-only security audit endpoint used by password/session recovery flows.

create or replace function public.admin_record_security_event(
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_action text:=btrim(coalesce(p_action,''));
  v_allowed constant text[]:=array[
    'admin.security.password_changed',
    'admin.security.password_recovered',
    'admin.security.other_sessions_revoked',
    'admin.security.all_sessions_revoked',
    'admin.security.recovery_requested'
  ];
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  if not (v_action=any(v_allowed)) then
    raise exception 'Unsupported Admin security event';
  end if;

  perform private.write_admin_audit(
    v_action,
    'admin_security',
    (select auth.uid())::text,
    null,
    null,
    jsonb_build_object('source','admin_security') || coalesce(p_metadata,'{}'::jsonb)
  );

  return jsonb_build_object('ok',true,'action',v_action);
end
$function$;

revoke execute on function public.admin_record_security_event(text,jsonb)
  from public,anon;
grant execute on function public.admin_record_security_event(text,jsonb)
  to authenticated;

comment on function public.admin_record_security_event(text,jsonb)
  is 'Records allowlisted owner-only LEOGO Super Admin password/session security events.';

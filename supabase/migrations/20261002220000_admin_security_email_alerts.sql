-- Queue email alerts for owner-only Admin security events.
-- Security alerts use the existing configured Gmail sender and are dispatched
-- independently of whether customer order emails are currently enabled.

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
  v_email text;
  v_subject text;
  v_message text;
  v_job_id uuid;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  if not (v_action=any(v_allowed)) then
    raise exception 'Unsupported Admin security event';
  end if;

  select nullif(btrim(u.email),'')
  into v_email
  from auth.users u
  where u.id=(select auth.uid());

  v_subject:=case v_action
    when 'admin.security.password_changed' then 'LEOGO Admin password changed'
    when 'admin.security.password_recovered' then 'LEOGO Admin password recovered'
    when 'admin.security.other_sessions_revoked' then 'LEOGO Admin other sessions revoked'
    when 'admin.security.all_sessions_revoked' then 'LEOGO Admin all sessions revoked'
    when 'admin.security.recovery_requested' then 'LEOGO Admin recovery requested'
    else 'LEOGO Admin security alert'
  end;

  v_message:=case v_action
    when 'admin.security.password_changed' then 'The LEOGO Super Admin password was changed and other signed-in devices were revoked.'
    when 'admin.security.password_recovered' then 'The LEOGO Super Admin password was replaced using the secure email recovery flow and all sessions were revoked.'
    when 'admin.security.other_sessions_revoked' then 'Other LEOGO Super Admin sessions were manually revoked.'
    when 'admin.security.all_sessions_revoked' then 'All LEOGO Super Admin sessions were manually revoked.'
    when 'admin.security.recovery_requested' then 'A secure LEOGO Super Admin password recovery email was requested from a signed-in Admin session.'
    else 'A LEOGO Super Admin security action was completed.'
  end;

  perform private.write_admin_audit(
    v_action,
    'admin_security',
    (select auth.uid())::text,
    null,
    null,
    jsonb_build_object('source','admin_security') || coalesce(p_metadata,'{}'::jsonb)
  );

  if v_email is not null then
    insert into public.order_email_outbox(
      order_id,event_key,recipient_email,recipient_name,subject,template_data,status
    )
    values(
      null,
      'admin_security_'||replace(v_action,'.','_')||'_'||gen_random_uuid()::text,
      lower(v_email),
      'LEOGO Super Admin',
      v_subject,
      jsonb_build_object(
        'kind','admin_security',
        'customer_name','Super Admin',
        'security_action',v_action,
        'security_message',v_message,
        'occurred_at',now()
      ),
      'pending'
    )
    returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'action',v_action,
    'security_email_queued',v_job_id is not null
  );
end
$function$;

revoke execute on function public.admin_record_security_event(text,jsonb)
  from public,anon;
grant execute on function public.admin_record_security_event(text,jsonb)
  to authenticated;

-- Separate existing-campaign lookup from new-campaign counter: SELECT INTO sets targets to NULL when no row exists.
-- Does not change recipient permissions, opt-ins, providers, order notices, or OTP messaging.
create or replace function public.admin_queue_customer_message(
  p_customers uuid[],p_channel text,p_purpose text,p_subject text,p_message text,p_request_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  v_id uuid;
  v_row record;
  v_sms_job uuid;
  v_email_job uuid;
  v_mobile text;
  v_address text;
  v_body text;
  v_count int := 0;
  v_existing_count int;
  v_skipped int := 0;
  v_requested int;
  v_seen_sms text[] := '{}';
  v_seen_emails text[] := '{}';
  v_email_allowed boolean;
begin
  if not (private.is_leogo_admin('customers.read') and private.is_leogo_admin('settings.manage')) then
    raise exception 'Customer messaging requires authorized Admin access';
  end if;
  if p_request_key is null then raise exception 'Message request key is required'; end if;
  if p_channel not in ('sms','email','both') or p_purpose not in ('service','promotion') then
    raise exception 'Choose a valid channel and purpose';
  end if;
  if p_message is null or length(btrim(p_message))<3 or length(p_message) >
     (case when p_channel='email' then 4000 else 400 end) then
    raise exception 'Message length exceeds the selected channel limit (SMS: 400, Email: 4000 characters)';
  end if;
  if p_channel in ('email','both') and (p_subject is null or length(btrim(p_subject))<3 or length(p_subject)>120) then
    raise exception 'Email subject must contain 3–120 characters';
  end if;
  v_requested:=coalesce(cardinality(p_customers),0);
  if v_requested<1 or v_requested>100 then
    raise exception 'Select between 1 and 100 customers per send';
  end if;
  if (select count(distinct x) from unnest(p_customers) x where x is not null)<>v_requested then
    raise exception 'Selected customers must be unique and valid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text||p_request_key::text,0));
  select id,queued_messages into v_id,v_existing_count from public.admin_customer_message_campaigns
    where created_by=(select auth.uid()) and request_key=p_request_key;
  if found then
    return jsonb_build_object('ok',true,'campaign_id',v_id,'duplicate',true,
      'queued',v_existing_count,'skipped',0);
  end if;

  -- No marketing email may be queued if the configured sender is disabled.
  if p_channel in ('email','both') then
    select s.enabled and coalesce(nullif(btrim(s.sender_email),''),'')<>'' and
      s.app_password_secret_id is not null into v_email_allowed
    from public.email_notification_settings s where s.id=1;
    if not coalesce(v_email_allowed,false) then
      raise exception 'Set up and enable the LEOGO Gmail SMTP sender before sending email';
    end if;
  end if;
  if (select count(*) from public.admin_customer_message_campaigns
        where created_by=(select auth.uid()) and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Customer messaging limit reached: maximum 10 campaigns per hour';
  end if;

  insert into public.admin_customer_message_campaigns(
    created_by,request_key,channel,purpose,subject,message_body,requested_customers
  ) values (
    (select auth.uid()),p_request_key,p_channel,p_purpose,
    case when p_channel='sms' then null else btrim(p_subject) end,btrim(p_message),v_requested
  ) returning id into v_id;

  for v_row in
    select u.id,u.email,coalesce(nullif(p.phone,''),u.phone) as phone,
      coalesce(nullif(btrim(p.full_name),''),'Customer') as name,
      coalesce(pref.promotion_sms_opt_in,false) as sms_opt_in,
      coalesce(pref.promotion_email_opt_in,false) as email_opt_in
    from auth.users u
    left join public.customer_profiles p on p.user_id=u.id
    left join public.customer_message_preferences pref on pref.user_id=u.id
    where u.id=any(p_customers)
      and not exists(select 1 from public.admin_users au where au.user_id=u.id and au.status='active')
      and not exists(select 1 from public.leogo_staff staff where staff.user_id=u.id and staff.status='active')
    order by u.id
  loop
    v_mobile:=regexp_replace(coalesce(v_row.phone,''),'[^0-9]','','g');
    if v_mobile ~ '^0[71][0-9]{8}$' then
      v_mobile:='254'||substring(v_mobile from 2);
    elsif v_mobile ~ '^[71][0-9]{8}$' then
      v_mobile:='254'||v_mobile;
    end if;
    v_address:=lower(btrim(coalesce(v_row.email,'')));
    v_body:=replace(btrim(p_message),'{name}',left(v_row.name,75));

    if p_channel in ('sms','both') then
      if v_mobile ~ '^254[71][0-9]{8}$'
        and (p_purpose='service' or v_row.sms_opt_in)
        and not v_mobile=any(v_seen_sms) then
        insert into public.order_sms_outbox(order_id,event_key,recipient_phone,recipient_name,message)
        values (null,'admin_custom_'||v_id,v_mobile,v_row.name,
          left(v_body||case when p_purpose='promotion' then ' Manage offers in LEOGO My Profile.' else '' end,480))
        returning id into v_sms_job;
        insert into public.admin_customer_message_recipients(campaign_id,customer_id,channel,sms_job_id)
        values(v_id,v_row.id,'sms',v_sms_job);
        v_seen_sms:=array_append(v_seen_sms,v_mobile);
        v_count:=v_count+1;
      else v_skipped:=v_skipped+1; end if;
    end if;
    if p_channel in ('email','both') then
      if v_address ~ '^[^ @]+@[^ @]+[.][^ @]+$'
        and (p_purpose='service' or v_row.email_opt_in)
        and not v_address=any(v_seen_emails) then
        insert into public.order_email_outbox(order_id,event_key,recipient_email,recipient_name,subject,template_data)
        values(null,'admin_custom_'||v_id,v_address,v_row.name,btrim(p_subject),
          jsonb_build_object('kind','admin_custom','customer_name',v_row.name,
            'custom_message',v_body,'purpose',p_purpose))
        returning id into v_email_job;
        insert into public.admin_customer_message_recipients(campaign_id,customer_id,channel,email_job_id)
        values(v_id,v_row.id,'email',v_email_job);
        v_seen_emails:=array_append(v_seen_emails,v_address);
        v_count:=v_count+1;
      else v_skipped:=v_skipped+1; end if;
    end if;
  end loop;
  if v_count=0 then raise exception 'No eligible customer contacts. Check phone/email and promotional opt-ins'; end if;
  update public.admin_customer_message_campaigns set queued_messages=v_count where id=v_id;
  perform private.write_admin_audit('customers.custom_message.queued','customer_message_campaign',v_id::text,
    null,jsonb_build_object('channel',p_channel,'purpose',p_purpose,'queued',v_count,'skipped',v_skipped),
    jsonb_build_object('requested_customers',v_requested));
  return jsonb_build_object('ok',true,'campaign_id',v_id,'queued',v_count,
    'skipped',v_skipped,'requested_customers',v_requested);
end;
$fn$;

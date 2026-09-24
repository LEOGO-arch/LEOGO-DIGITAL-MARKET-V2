-- Add an Admin-controlled Direct Request Service fee, separate from the
-- existing Admin-controlled Request Quotation fee.

alter table public.service_marketplace_settings
  add column if not exists direct_request_fee_kes numeric(12,2) not null default 50
  check (direct_request_fee_kes >= 0);

update public.service_marketplace_settings
set direct_request_fee_kes = 50
where id = 1;

alter table public.service_requests
  add column if not exists direct_request_fee_kes numeric(12,2) not null default 0
  check (direct_request_fee_kes >= 0);

alter table public.service_requests
  drop constraint if exists service_requests_check;

alter table public.service_requests
  add constraint service_requests_fee_type_check check (
    (
      request_type = 'direct'
      and quotation_fee_kes = 0
    )
    or
    (
      request_type = 'quotation'
      and direct_request_fee_kes = 0
    )
  );

create or replace function public.customer_service_marketplace_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_quotation_fee numeric;
  v_direct_fee numeric;
  v_payment jsonb;
begin
  select quotation_fee_kes, direct_request_fee_kes
    into v_quotation_fee, v_direct_fee
  from public.service_marketplace_settings
  where id = 1;

  if v_uid is not null then
    select jsonb_build_object(
      'display_name', p.display_name,
      'account_type', p.account_type,
      'business_name', p.business_name,
      'account_name', p.account_name,
      'till_number', p.till_number,
      'paybill_number', p.paybill_number,
      'account_number', p.account_number,
      'bank_name', p.bank_name,
      'branch', p.branch,
      'instructions', p.instructions
    )
    into v_payment
    from public.payment_account_assignments a
    join public.payment_accounts p on p.id = a.account_id
    where a.function_code = 'service_payments'
      and p.status = 'active'
    limit 1;
  end if;

  return jsonb_build_object(
    'direct_request_fee_kes', coalesce(v_direct_fee, 50),
    'quotation_fee_kes', coalesce(v_quotation_fee, 50),
    'payment_destination', v_payment
  );
end;
$$;

create or replace function public.customer_create_service_request(
  p_service_id uuid,
  p_request_type text,
  p_request_details text,
  p_service_location text,
  p_nearest_landmark text default null,
  p_preferred_date date default null,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_service record;
  v_fee numeric(12,2) := 0;
  v_direct_fee numeric(12,2) := 0;
  v_quotation_fee numeric(12,2) := 0;
  v_account_id uuid;
  v_payment_reference text := nullif(upper(btrim(coalesce(p_payment_reference, ''))), '');
  v_request_id uuid;
  v_reference text;
  v_payment_status text := 'not_required';
  v_status text := 'submitted';
begin
  if v_uid is null then raise exception 'Sign in to request a service'; end if;
  if p_request_type not in ('direct','quotation') then raise exception 'Choose a valid request type'; end if;
  if char_length(btrim(coalesce(p_request_details,''))) < 10 then raise exception 'Describe the service you need'; end if;
  if char_length(btrim(coalesce(p_service_location,''))) < 3 then raise exception 'Enter the service location'; end if;
  if p_preferred_date is not null and p_preferred_date < (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Preferred date cannot be in the past';
  end if;
  if not exists (select 1 from public.customer_profiles where user_id = v_uid) then
    raise exception 'Complete your customer profile before requesting a service';
  end if;

  select s.id, s.provider_id, s.service_name
  into v_service
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id = s.provider_id
  where s.id = p_service_id
    and s.approval_status = 'approved'
    and s.is_available
    and p.application_status = 'approved'
    and p.availability_status <> 'offline';
  if not found then raise exception 'This service is not currently available'; end if;

  select direct_request_fee_kes, quotation_fee_kes
    into v_direct_fee, v_quotation_fee
  from public.service_marketplace_settings
  where id = 1;

  v_direct_fee := coalesce(v_direct_fee, 50);
  v_quotation_fee := coalesce(v_quotation_fee, 50);
  v_fee := case when p_request_type = 'direct' then v_direct_fee else v_quotation_fee end;

  if v_fee > 0 then
    if v_payment_reference is null or char_length(v_payment_reference) < 6 or char_length(v_payment_reference) > 80 then
      raise exception 'Enter a valid payment reference';
    end if;
    select a.account_id into v_account_id
    from public.payment_account_assignments a
    join public.payment_accounts p on p.id = a.account_id
    where a.function_code = 'service_payments' and p.status = 'active'
    limit 1;
    if v_account_id is null then
      raise exception 'Service payment destination is being configured. Please try again shortly.';
    end if;
    v_payment_status := 'pending_verification';
    v_status := 'awaiting_payment_verification';
  end if;

  v_reference := 'SR-' || to_char(now() at time zone 'Africa/Nairobi','YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.service_requests(
    request_reference, customer_id, service_id, provider_id, request_type,
    request_details, service_location, nearest_landmark, preferred_date,
    direct_request_fee_kes, quotation_fee_kes, quotation_fee_account_id,
    payment_reference, payment_status, request_status
  ) values (
    v_reference, v_uid, v_service.id, v_service.provider_id, p_request_type,
    btrim(p_request_details), btrim(p_service_location),
    nullif(btrim(coalesce(p_nearest_landmark,'')),''),
    p_preferred_date,
    case when p_request_type='direct' then v_direct_fee else 0 end,
    case when p_request_type='quotation' then v_quotation_fee else 0 end,
    v_account_id, v_payment_reference, v_payment_status, v_status
  )
  returning id into v_request_id;

  insert into public.customer_notifications(
    user_id, notification_type, title, message, source_type, source_id,
    event_key, action_view, metadata
  ) values (
    v_uid, 'service_request', 'Service request received',
    'Request ' || v_reference || ' for ' || v_service.service_name ||
      case when v_status = 'awaiting_payment_verification'
        then ' is waiting for ' ||
          case when p_request_type='direct' then 'direct-request fee' else 'quotation fee' end ||
          ' verification.'
        else ' is waiting for LEOGO Admin dispatch.'
      end,
    'service_request', v_request_id, 'service_request_created_' || v_request_id::text,
    'orders', jsonb_build_object('request_reference',v_reference,'request_type',p_request_type)
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'request_reference', v_reference,
    'request_status', v_status,
    'payment_status', v_payment_status,
    'direct_request_fee_kes', case when p_request_type='direct' then v_direct_fee else 0 end,
    'quotation_fee_kes', case when p_request_type='quotation' then v_quotation_fee else 0 end
  );
exception when unique_violation then
  raise exception 'This payment reference has already been submitted';
end;
$$;

create or replace function public.admin_update_service_request_fees(
  p_direct_request_fee_kes numeric,
  p_quotation_fee_kes numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Settings permission required';
  end if;
  if p_direct_request_fee_kes is null
     or p_direct_request_fee_kes < 0
     or p_direct_request_fee_kes > 100000 then
    raise exception 'Enter a valid direct request fee';
  end if;
  if p_quotation_fee_kes is null
     or p_quotation_fee_kes < 0
     or p_quotation_fee_kes > 100000 then
    raise exception 'Enter a valid quotation fee';
  end if;

  select to_jsonb(s) into v_before
  from public.service_marketplace_settings s
  where id = 1
  for update;

  update public.service_marketplace_settings
  set direct_request_fee_kes = round(p_direct_request_fee_kes,2),
      quotation_fee_kes = round(p_quotation_fee_kes,2),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = 1;

  select to_jsonb(s) into v_after
  from public.service_marketplace_settings s
  where id = 1;

  perform private.write_admin_audit(
    'settings.service_request_fees.updated',
    'service_marketplace_settings',
    '1',
    v_before,
    v_after
  );
  return v_after;
end;
$$;

create or replace function public.admin_verify_service_quotation_payment(
  p_request_id uuid,
  p_approved boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests%rowtype;
  v_fee_label text;
begin
  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment verification permission required';
  end if;
  select * into v_request
  from public.service_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Service request not found'; end if;
  if v_request.payment_status <> 'pending_verification' then
    raise exception 'This service request payment is no longer awaiting verification';
  end if;

  v_fee_label := case
    when v_request.request_type='direct' then 'Direct request fee'
    else 'Quotation fee'
  end;

  update public.service_requests
  set payment_status = case when p_approved then 'verified' else 'rejected' end,
      request_status = case when p_approved then 'payment_verified' else 'payment_rejected' end,
      admin_notes = nullif(btrim(coalesce(p_notes,'')),''),
      payment_verified_at = now(),
      payment_verified_by = (select auth.uid()),
      updated_at = now()
  where id = p_request_id;

  insert into public.customer_notifications(
    user_id, notification_type, title, message, source_type, source_id,
    event_key, action_view, metadata
  ) values (
    v_request.customer_id, 'service_payment',
    v_fee_label || case when p_approved then ' verified' else ' not verified' end,
    'Payment for service request ' || v_request.request_reference ||
      case when p_approved
        then ' has been verified and is ready for Admin dispatch.'
        else ' could not be verified. Contact LEOGO Customer Care if you need help.'
      end,
    'service_request', p_request_id,
    'service_payment_' || case when p_approved then 'verified_' else 'rejected_' end || p_request_id::text,
    'orders', jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit(
    'service_request.payment.' || case when p_approved then 'verified' else 'rejected' end,
    'service_request', p_request_id::text, to_jsonb(v_request), null,
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object(
    'ok',true,
    'payment_status',case when p_approved then 'verified' else 'rejected' end
  );
end;
$$;

revoke all on function public.admin_update_service_request_fees(numeric,numeric) from public;
grant execute on function public.admin_update_service_request_fees(numeric,numeric) to authenticated;

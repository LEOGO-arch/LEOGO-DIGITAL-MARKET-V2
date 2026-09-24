-- Capture the customer's preferred service time alongside the existing
-- preferred service date.

alter table public.service_requests
  add column if not exists preferred_time time without time zone;

drop function if exists public.customer_create_service_request(
  uuid, text, text, text, text, date, text
);

create function public.customer_create_service_request(
  p_service_id uuid,
  p_request_type text,
  p_request_details text,
  p_service_location text,
  p_nearest_landmark text default null,
  p_preferred_date date default null,
  p_payment_reference text default null,
  p_preferred_time time without time zone default null
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
  if p_preferred_time is null then raise exception 'Select the preferred service time'; end if;
  if p_preferred_date is not null and p_preferred_date < (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Preferred date cannot be in the past';
  end if;
  if p_preferred_date = (now() at time zone 'Africa/Nairobi')::date
     and p_preferred_time <= (now() at time zone 'Africa/Nairobi')::time then
    raise exception 'Preferred service time must be in the future';
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
    request_details, service_location, nearest_landmark, preferred_date, preferred_time,
    direct_request_fee_kes, quotation_fee_kes, quotation_fee_account_id,
    payment_reference, payment_status, request_status
  ) values (
    v_reference, v_uid, v_service.id, v_service.provider_id, p_request_type,
    btrim(p_request_details), btrim(p_service_location),
    nullif(btrim(coalesce(p_nearest_landmark,'')),''),
    p_preferred_date, p_preferred_time,
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
    'orders', jsonb_build_object(
      'request_reference',v_reference,
      'request_type',p_request_type,
      'preferred_date',p_preferred_date,
      'preferred_time',p_preferred_time
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'request_reference', v_reference,
    'request_status', v_status,
    'payment_status', v_payment_status,
    'preferred_date', p_preferred_date,
    'preferred_time', p_preferred_time,
    'direct_request_fee_kes', case when p_request_type='direct' then v_direct_fee else 0 end,
    'quotation_fee_kes', case when p_request_type='quotation' then v_quotation_fee else 0 end
  );
exception when unique_violation then
  raise exception 'This payment reference has already been submitted';
end;
$$;

revoke all on function public.customer_create_service_request(
  uuid, text, text, text, text, date, text, time without time zone
) from public;
grant execute on function public.customer_create_service_request(
  uuid, text, text, text, text, date, text, time without time zone
) to authenticated;

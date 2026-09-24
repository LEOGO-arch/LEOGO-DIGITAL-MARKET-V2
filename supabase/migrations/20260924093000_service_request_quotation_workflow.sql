-- LEOGO Service Provider -> Admin -> Customer request workflow.
-- Keeps service requests isolated from the locked marketplace product-order workflow.

create table if not exists public.service_marketplace_settings (
  id smallint primary key default 1 check (id = 1),
  quotation_fee_kes numeric(12,2) not null default 50 check (quotation_fee_kes >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.service_marketplace_settings (id, quotation_fee_kes)
values (1, 50)
on conflict (id) do nothing;

alter table public.service_marketplace_settings enable row level security;
revoke all on public.service_marketplace_settings from anon, authenticated;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  customer_id uuid not null references auth.users(id),
  service_id uuid not null references public.service_provider_services(id),
  provider_id uuid not null references auth.users(id),
  request_type text not null check (request_type in ('direct','quotation')),
  request_details text not null check (char_length(btrim(request_details)) between 10 and 2500),
  service_location text not null check (char_length(btrim(service_location)) between 3 and 500),
  nearest_landmark text,
  preferred_date date,
  quotation_fee_kes numeric(12,2) not null default 0 check (quotation_fee_kes >= 0),
  quotation_fee_account_id uuid references public.payment_accounts(id),
  payment_reference text,
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required','pending_verification','verified','rejected')),
  request_status text not null default 'submitted'
    check (request_status in (
      'submitted','awaiting_payment_verification','payment_verified','payment_rejected',
      'dispatched','accepted','declined','quoted','quote_accepted','quote_rejected',
      'in_progress','completed','cancelled'
    )),
  provider_quote_kes numeric(12,2) check (provider_quote_kes is null or provider_quote_kes > 0),
  provider_quote_notes text,
  admin_notes text,
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id),
  dispatched_at timestamptz,
  dispatched_by uuid references auth.users(id),
  responded_at timestamptz,
  quoted_at timestamptz,
  quote_decided_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (request_type = 'direct' and quotation_fee_kes = 0 and payment_status = 'not_required')
    or request_type = 'quotation'
  )
);

create index if not exists service_requests_customer_created_idx
  on public.service_requests (customer_id, created_at desc);
create index if not exists service_requests_provider_status_created_idx
  on public.service_requests (provider_id, request_status, created_at desc);
create index if not exists service_requests_admin_status_created_idx
  on public.service_requests (request_status, created_at desc);
create unique index if not exists service_requests_payment_reference_uidx
  on public.service_requests (upper(payment_reference))
  where payment_reference is not null;

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;

drop policy if exists "Customers read own service requests" on public.service_requests;
create policy "Customers read own service requests"
on public.service_requests for select to authenticated
using ((select auth.uid()) = customer_id);

drop policy if exists "Providers read dispatched service requests" on public.service_requests;
create policy "Providers read dispatched service requests"
on public.service_requests for select to authenticated
using (
  (select auth.uid()) = provider_id
  and request_status in (
    'dispatched','accepted','declined','quoted','quote_accepted','quote_rejected',
    'in_progress','completed','cancelled'
  )
);

drop policy if exists "Admins read service requests" on public.service_requests;
create policy "Admins read service requests"
on public.service_requests for select to authenticated
using (private.is_leogo_admin('approvals.read'));

-- Reuse the existing official service-payments destination. If it has not yet
-- been assigned, initialise it from the marketplace destination or first active account.
insert into public.payment_account_assignments(function_code, account_id, assigned_by)
select
  'service_payments',
  chosen.account_id,
  chosen.assigned_by
from (
  select a.account_id, a.assigned_by, 1 as priority
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id = a.account_id and p.status = 'active'
  where a.function_code = 'marketplace_orders'
  union all
  select p.id, p.created_by, 2
  from public.payment_accounts p
  where p.status = 'active'
  order by priority
  limit 1
) chosen
where not exists (
  select 1 from public.payment_account_assignments where function_code = 'service_payments'
)
on conflict (function_code) do nothing;

create or replace function public.customer_service_marketplace_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fee numeric;
  v_payment jsonb;
begin
  select quotation_fee_kes into v_fee
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
    'quotation_fee_kes', coalesce(v_fee, 50),
    'payment_destination', v_payment
  );
end;
$$;

create or replace function public.customer_public_services()
returns table (
  service_id uuid,
  provider_id uuid,
  service_name text,
  category_name text,
  description text,
  pricing_model text,
  price_from_kes numeric,
  price_to_kes numeric,
  unit_label text,
  service_area text,
  availability_notes text,
  business_name text,
  primary_service text,
  county text,
  sub_county text,
  town text,
  profile_picture_path text
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id, s.provider_id, s.service_name, s.category_name, s.description,
    s.pricing_model, s.price_from_kes, s.price_to_kes, s.unit_label,
    s.service_area, s.availability_notes,
    p.business_name, p.primary_service, p.county, p.sub_county, p.town,
    p.profile_picture_path
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id = s.provider_id
  where s.approval_status = 'approved'
    and s.is_available
    and p.application_status = 'approved'
    and p.availability_status <> 'offline'
  order by s.approved_at desc nulls last, s.service_name;
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

  if p_request_type = 'quotation' then
    select quotation_fee_kes into v_fee
    from public.service_marketplace_settings where id = 1;
    v_fee := coalesce(v_fee, 50);

    if v_fee > 0 then
      if v_payment_reference is null or char_length(v_payment_reference) < 6 or char_length(v_payment_reference) > 80 then
        raise exception 'Enter a valid payment reference';
      end if;
      select a.account_id into v_account_id
      from public.payment_account_assignments a
      join public.payment_accounts p on p.id = a.account_id
      where a.function_code = 'service_payments' and p.status = 'active'
      limit 1;
      if v_account_id is null then raise exception 'Quotation payment destination is being configured. Please try again shortly.'; end if;
      v_payment_status := 'pending_verification';
      v_status := 'awaiting_payment_verification';
    end if;
  end if;

  v_reference := 'SR-' || to_char(now() at time zone 'Africa/Nairobi','YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.service_requests(
    request_reference, customer_id, service_id, provider_id, request_type,
    request_details, service_location, nearest_landmark, preferred_date,
    quotation_fee_kes, quotation_fee_account_id, payment_reference,
    payment_status, request_status
  ) values (
    v_reference, v_uid, v_service.id, v_service.provider_id, p_request_type,
    btrim(p_request_details), btrim(p_service_location),
    nullif(btrim(coalesce(p_nearest_landmark,'')),''),
    p_preferred_date, v_fee, v_account_id, v_payment_reference,
    v_payment_status, v_status
  )
  returning id into v_request_id;

  insert into public.customer_notifications(
    user_id, notification_type, title, message, source_type, source_id,
    event_key, action_view, metadata
  ) values (
    v_uid, 'service_request', 'Service request received',
    'Request ' || v_reference || ' for ' || v_service.service_name ||
      case when v_status = 'awaiting_payment_verification'
        then ' is waiting for quotation-fee verification.'
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
    'quotation_fee_kes', v_fee
  );
exception when unique_violation then
  if p_request_type = 'quotation' then
    raise exception 'This payment reference has already been submitted';
  end if;
  raise;
end;
$$;

create or replace function public.customer_list_service_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'service_name', s.service_name,
      'category_name', s.category_name,
      'business_name', p.business_name,
      'provider_phone', case when r.request_status in ('accepted','quote_accepted','in_progress','completed') then p.phone else null end
    )
    order by r.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.service_requests r
  join public.service_provider_services s on s.id = r.service_id
  join public.service_provider_accounts p on p.user_id = r.provider_id
  where r.customer_id = v_uid;
  return v_rows;
end;
$$;

create or replace function public.customer_decide_service_quote(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.service_requests%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_request
  from public.service_requests
  where id = p_request_id and customer_id = v_uid
  for update;
  if not found then raise exception 'Service request not found'; end if;
  if v_request.request_type <> 'quotation' or v_request.request_status <> 'quoted' then
    raise exception 'This quotation is no longer awaiting your decision';
  end if;

  update public.service_requests
  set request_status = case when p_accept then 'quote_accepted' else 'quote_rejected' end,
      quote_decided_at = now(), updated_at = now()
  where id = p_request_id;

  insert into public.partner_notifications(
    user_id, partner_type, event_type, title, message,
    source_type, source_id, action_view, metadata
  ) values (
    v_request.provider_id, 'service_provider',
    case when p_accept then 'service_quote_accepted' else 'service_quote_rejected' end,
    case when p_accept then 'Quotation accepted' else 'Quotation declined' end,
    'Customer ' || case when p_accept then 'accepted' else 'declined' end ||
      ' quotation for request ' || v_request.request_reference || '.',
    'service_request', p_request_id, 'provider-jobs',
    jsonb_build_object('accepted',p_accept,'quote_kes',v_request.provider_quote_kes)
  );

  return jsonb_build_object('ok',true,'request_status',case when p_accept then 'quote_accepted' else 'quote_rejected' end);
end;
$$;

create or replace function public.admin_get_service_marketplace_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('settings.read') and not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;
  select to_jsonb(s) into v_result from public.service_marketplace_settings s where id = 1;
  return v_result;
end;
$$;

create or replace function public.admin_update_service_quotation_fee(p_fee_kes numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Settings permission required'; end if;
  if p_fee_kes is null or p_fee_kes < 0 or p_fee_kes > 100000 then raise exception 'Enter a valid quotation fee'; end if;
  select to_jsonb(s) into v_before from public.service_marketplace_settings s where id = 1 for update;
  update public.service_marketplace_settings
  set quotation_fee_kes = round(p_fee_kes,2), updated_by = (select auth.uid()), updated_at = now()
  where id = 1;
  select to_jsonb(s) into v_after from public.service_marketplace_settings s where id = 1;
  perform private.write_admin_audit('settings.service_quotation_fee.updated','service_marketplace_settings','1',v_before,v_after);
  return v_after;
end;
$$;

create or replace function public.admin_list_service_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows jsonb;
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'service_name', s.service_name,
      'category_name', s.category_name,
      'business_name', p.business_name,
      'provider_phone', p.phone,
      'customer_name', c.full_name,
      'customer_phone', c.phone,
      'customer_county', c.county,
      'customer_sub_county', c.sub_county,
      'customer_estate', c.estate
    ) order by r.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.service_requests r
  join public.service_provider_services s on s.id = r.service_id
  join public.service_provider_accounts p on p.user_id = r.provider_id
  left join public.customer_profiles c on c.user_id = r.customer_id;
  return v_rows;
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
declare v_request public.service_requests%rowtype;
begin
  if not private.is_leogo_admin('orders.payment_verify') and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment verification permission required';
  end if;
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found'; end if;
  if v_request.request_type <> 'quotation' or v_request.payment_status <> 'pending_verification' then
    raise exception 'This quotation payment is no longer awaiting verification';
  end if;

  update public.service_requests
  set payment_status = case when p_approved then 'verified' else 'rejected' end,
      request_status = case when p_approved then 'payment_verified' else 'payment_rejected' end,
      admin_notes = nullif(btrim(coalesce(p_notes,'')),''),
      payment_verified_at = now(), payment_verified_by = (select auth.uid()), updated_at = now()
  where id = p_request_id;

  insert into public.customer_notifications(
    user_id, notification_type, title, message, source_type, source_id,
    event_key, action_view, metadata
  ) values (
    v_request.customer_id, 'service_payment',
    case when p_approved then 'Quotation fee verified' else 'Quotation fee not verified' end,
    'Payment for service request ' || v_request.request_reference ||
      case when p_approved then ' has been verified and is ready for Admin dispatch.'
           else ' could not be verified. Contact LEOGO Customer Care if you need help.' end,
    'service_request', p_request_id,
    'service_payment_' || case when p_approved then 'verified_' else 'rejected_' end || p_request_id::text,
    'orders', jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit(
    'service_request.payment.' || case when p_approved then 'verified' else 'rejected' end,
    'service_request', p_request_id::text, to_jsonb(v_request), null,
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'payment_status',case when p_approved then 'verified' else 'rejected' end);
end;
$$;

create or replace function public.admin_dispatch_service_request(
  p_request_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests%rowtype;
  v_service_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Admin dispatch permission required'; end if;
  select r.* into v_request
  from public.service_requests r
  where r.id = p_request_id
  for update of r;
  if not found then raise exception 'Service request not found'; end if;
  select s.service_name into v_service_name
  from public.service_provider_services s
  where s.id = v_request.service_id;
  if v_request.request_status not in ('submitted','payment_verified') then
    raise exception 'This request is not ready for dispatch';
  end if;

  update public.service_requests
  set request_status = 'dispatched', admin_notes = nullif(btrim(coalesce(p_notes,'')),''),
      dispatched_at = now(), dispatched_by = (select auth.uid()), updated_at = now()
  where id = p_request_id;

  insert into public.partner_notifications(
    user_id, partner_type, event_type, title, message,
    source_type, source_id, action_view, metadata
  ) values (
    v_request.provider_id, 'service_provider', 'service_request_dispatched',
    'New customer service request',
    v_request.request_reference || ' for ' || v_service_name || ' is ready for your response.',
    'service_request', p_request_id, 'provider-jobs',
    jsonb_build_object('request_type',v_request.request_type)
  );

  insert into public.customer_notifications(
    user_id, notification_type, title, message, source_type, source_id,
    event_key, action_view, metadata
  ) values (
    v_request.customer_id, 'service_request', 'Service request dispatched',
    'LEOGO Admin has sent ' || v_request.request_reference || ' to the approved provider.',
    'service_request', p_request_id, 'service_request_dispatched_' || p_request_id::text,
    'orders', '{}'::jsonb
  );

  perform private.write_admin_audit('service_request.dispatched','service_request',p_request_id::text,to_jsonb(v_request),null,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'request_status','dispatched');
end;
$$;

create or replace function public.admin_cancel_service_request(
  p_request_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.service_requests%rowtype;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Admin permission required'; end if;
  if char_length(btrim(coalesce(p_notes,''))) < 3 then raise exception 'Enter a cancellation reason'; end if;
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found'; end if;
  if v_request.request_status in ('completed','cancelled') then raise exception 'This request is already closed'; end if;
  update public.service_requests
  set request_status='cancelled', admin_notes=btrim(p_notes), cancelled_at=now(), updated_at=now()
  where id=p_request_id;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_request.customer_id,'service_request','Service request cancelled',
    v_request.request_reference || ' was cancelled by LEOGO Admin. Reason: ' || btrim(p_notes),
    'service_request',p_request_id,'service_request_cancelled_'||p_request_id::text,'orders','{}'::jsonb);
  if v_request.request_status in ('dispatched','accepted','quoted','quote_accepted','in_progress') then
    insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
    values(v_request.provider_id,'service_provider','service_request_cancelled','Service request cancelled',
      v_request.request_reference || ' was cancelled by LEOGO Admin.',
      'service_request',p_request_id,'provider-jobs','{}'::jsonb);
  end if;
  perform private.write_admin_audit('service_request.cancelled','service_request',p_request_id::text,to_jsonb(v_request),null,jsonb_build_object('notes',btrim(p_notes)));
  return jsonb_build_object('ok',true,'request_status','cancelled');
end;
$$;

create or replace function public.service_provider_list_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.service_provider_accounts
    where user_id=v_uid and application_status='approved'
  ) then raise exception 'Approved Service Provider account required'; end if;
  select coalesce(jsonb_agg(
    to_jsonb(r) - 'payment_reference' - 'quotation_fee_account_id' ||
    jsonb_build_object(
      'service_name',s.service_name,
      'category_name',s.category_name,
      'customer_name',c.full_name,
      'customer_phone',c.phone,
      'customer_county',c.county,
      'customer_sub_county',c.sub_county,
      'customer_estate',c.estate
    ) order by r.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.service_requests r
  join public.service_provider_services s on s.id=r.service_id
  left join public.customer_profiles c on c.user_id=r.customer_id
  where r.provider_id=v_uid
    and r.request_status in (
      'dispatched','accepted','declined','quoted','quote_accepted','quote_rejected',
      'in_progress','completed','cancelled'
    );
  return v_rows;
end;
$$;

create or replace function public.service_provider_update_job(
  p_request_id uuid,
  p_action text,
  p_quote_kes numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.service_requests%rowtype;
  v_new_status text;
  v_title text;
  v_message text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_request
  from public.service_requests
  where id=p_request_id and provider_id=v_uid
  for update;
  if not found then raise exception 'Service job not found'; end if;

  if p_action='decline' then
    if v_request.request_status<>'dispatched' then raise exception 'This request can no longer be declined'; end if;
    if char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Enter a reason for declining'; end if;
    v_new_status:='declined'; v_title:='Provider declined request';
    v_message:=v_request.request_reference||' was declined by the provider. LEOGO Admin will follow up.';
  elsif p_action='accept' then
    if v_request.request_type<>'direct' or v_request.request_status<>'dispatched' then raise exception 'This direct request cannot be accepted now'; end if;
    v_new_status:='accepted'; v_title:='Service request accepted';
    v_message:='The provider accepted '||v_request.request_reference||'.';
  elsif p_action='quote' then
    if v_request.request_type<>'quotation' or v_request.request_status<>'dispatched' then raise exception 'This quotation request cannot be quoted now'; end if;
    if p_quote_kes is null or p_quote_kes<=0 or p_quote_kes>100000000 then raise exception 'Enter a valid quotation amount'; end if;
    v_new_status:='quoted'; v_title:='Your service quotation is ready';
    v_message:=v_request.request_reference||' has a provider quotation of KSh '||trim(to_char(round(p_quote_kes,2),'FM999999999990.00'))||'. Accept or reject it in My Activity.';
  elsif p_action='start' then
    if not (
      (v_request.request_type='direct' and v_request.request_status='accepted')
      or (v_request.request_type='quotation' and v_request.request_status='quote_accepted')
    ) then raise exception 'This service cannot be started yet'; end if;
    v_new_status:='in_progress'; v_title:='Service work started';
    v_message:=v_request.request_reference||' is now in progress.';
  elsif p_action='complete' then
    if v_request.request_status<>'in_progress' then raise exception 'Only an in-progress service can be completed'; end if;
    v_new_status:='completed'; v_title:='Service completed';
    v_message:=v_request.request_reference||' has been marked completed by the provider.';
  else
    raise exception 'Unsupported service job action';
  end if;

  update public.service_requests
  set request_status=v_new_status,
      provider_quote_kes=case when p_action='quote' then round(p_quote_kes,2) else provider_quote_kes end,
      provider_quote_notes=case when p_action in ('quote','decline') then nullif(btrim(coalesce(p_notes,'')),'') else provider_quote_notes end,
      responded_at=case when p_action in ('accept','decline','quote') then now() else responded_at end,
      quoted_at=case when p_action='quote' then now() else quoted_at end,
      started_at=case when p_action='start' then now() else started_at end,
      completed_at=case when p_action='complete' then now() else completed_at end,
      updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_request.customer_id,'service_request',v_title,v_message,'service_request',p_request_id,
    'service_request_'||v_new_status||'_'||p_request_id::text,'orders',
    jsonb_build_object('request_status',v_new_status,'quote_kes',case when p_action='quote' then round(p_quote_kes,2) else v_request.provider_quote_kes end)
  );
  return jsonb_build_object('ok',true,'request_status',v_new_status);
end;
$$;

revoke all on function public.customer_service_marketplace_config() from public;
revoke all on function public.customer_public_services() from public;
revoke all on function public.customer_create_service_request(uuid,text,text,text,text,date,text) from public;
revoke all on function public.customer_list_service_requests() from public;
revoke all on function public.customer_decide_service_quote(uuid,boolean) from public;
revoke all on function public.admin_get_service_marketplace_settings() from public;
revoke all on function public.admin_update_service_quotation_fee(numeric) from public;
revoke all on function public.admin_list_service_requests() from public;
revoke all on function public.admin_verify_service_quotation_payment(uuid,boolean,text) from public;
revoke all on function public.admin_dispatch_service_request(uuid,text) from public;
revoke all on function public.admin_cancel_service_request(uuid,text) from public;
revoke all on function public.service_provider_list_jobs() from public;
revoke all on function public.service_provider_update_job(uuid,text,numeric,text) from public;

grant execute on function public.customer_service_marketplace_config() to anon, authenticated;
grant execute on function public.customer_public_services() to anon, authenticated;
grant execute on function public.customer_create_service_request(uuid,text,text,text,text,date,text) to authenticated;
grant execute on function public.customer_list_service_requests() to authenticated;
grant execute on function public.customer_decide_service_quote(uuid,boolean) to authenticated;
grant execute on function public.admin_get_service_marketplace_settings() to authenticated;
grant execute on function public.admin_update_service_quotation_fee(numeric) to authenticated;
grant execute on function public.admin_list_service_requests() to authenticated;
grant execute on function public.admin_verify_service_quotation_payment(uuid,boolean,text) to authenticated;
grant execute on function public.admin_dispatch_service_request(uuid,text) to authenticated;
grant execute on function public.admin_cancel_service_request(uuid,text) to authenticated;
grant execute on function public.service_provider_list_jobs() to authenticated;
grant execute on function public.service_provider_update_job(uuid,text,numeric,text) to authenticated;

-- LEOGO transactional order-arrival email notifications.
-- This is isolated from the existing order, Rider and Pickup Station workflows:
-- operational status changes only enqueue email jobs; email delivery failures never block an order update.

create extension if not exists pg_net with schema extensions;

create table if not exists public.email_notification_settings (
  id integer primary key check (id=1),
  enabled boolean not null default false,
  provider text not null default 'gmail_smtp' check (provider in ('gmail_smtp')),
  sender_name text not null default 'LEOGO DIGITAL MARKET',
  sender_email text,
  app_password_secret_id uuid,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.email_notification_settings(id,enabled,provider,sender_name,sender_email)
select
  1,
  false,
  'gmail_smtp',
  coalesce(nullif(btrim(bs.business_name),''),'LEOGO DIGITAL MARKET'),
  nullif(btrim(bs.primary_email),'')
from public.business_settings bs
where bs.id=1
on conflict (id) do nothing;

alter table public.email_notification_settings enable row level security;

create table if not exists public.order_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.marketplace_orders(id) on delete cascade,
  event_key text not null,
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  template_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','configuration_required','failed')),
  delivery_token uuid not null default gen_random_uuid(),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_email_outbox_order_event_uidx
  on public.order_email_outbox(order_id,event_key)
  where order_id is not null;

create unique index if not exists order_email_outbox_delivery_token_uidx
  on public.order_email_outbox(delivery_token);

create index if not exists order_email_outbox_retry_idx
  on public.order_email_outbox(status,next_attempt_at,created_at)
  where sent_at is null;

alter table public.order_email_outbox enable row level security;

create or replace function private.dispatch_order_email_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token uuid;
begin
  select o.delivery_token
  into v_token
  from public.order_email_outbox o
  where o.id=p_job_id
    and o.sent_at is null
    and o.status in ('pending','failed');

  if v_token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://dzdciuqkqixwutvtfotj.supabase.co/functions/v1/send-order-email',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('job_id',p_job_id,'token',v_token),
    timeout_milliseconds := 12000
  );
exception when others then
  -- Email transport must never interrupt order operations.
  return;
end
$function$;

create or replace function private.dispatch_order_email_job_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  begin
    perform private.dispatch_order_email_job(new.id);
  exception when others then
    null;
  end;
  return new;
end
$function$;

drop trigger if exists order_email_outbox_dispatch_insert on public.order_email_outbox;
create trigger order_email_outbox_dispatch_insert
after insert on public.order_email_outbox
for each row
when (new.status='pending')
execute function private.dispatch_order_email_job_trigger();

drop trigger if exists order_email_outbox_dispatch_retry on public.order_email_outbox;
create trigger order_email_outbox_dispatch_retry
after update of status on public.order_email_outbox
for each row
when (new.status='pending' and old.status is distinct from new.status)
execute function private.dispatch_order_email_job_trigger();

create or replace function private.enqueue_pickup_order_email(
  p_order_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_station public.pickup_stations%rowtype;
  v_email text;
  v_subject text;
  v_data jsonb;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id;

  if not found or v_order.delivery_zone<>'pickup' or v_order.pickup_station_id is null then
    return;
  end if;

  select * into v_station
  from public.pickup_stations
  where id=v_order.pickup_station_id;

  select nullif(btrim(u.email),'')
  into v_email
  from auth.users u
  where u.id=v_order.customer_id;

  if v_email is null then
    return;
  end if;

  if p_event_key='pickup_station_arrived' then
    v_subject := 'Your LEOGO order has arrived at '||coalesce(v_station.station_name,'the Pickup Station');
    v_data := jsonb_build_object(
      'kind','pickup_station_arrived',
      'order_reference',v_order.order_reference,
      'customer_name',v_order.receiver_name,
      'station_name',coalesce(v_station.station_name,'LEOGO Pickup Station'),
      'station_address',concat_ws(', ',nullif(v_station.address_line,''),nullif(v_station.town,''),nullif(v_station.county,'')),
      'landmark',v_station.landmark,
      'operating_hours',v_station.operating_hours,
      'station_phone',v_station.contact_phone
    );
  elsif p_event_key='pickup_station_ready' then
    v_subject := 'Your LEOGO order is ready for pickup at '||coalesce(v_station.station_name,'the Pickup Station');
    v_data := jsonb_build_object(
      'kind','pickup_station_ready',
      'order_reference',v_order.order_reference,
      'customer_name',v_order.receiver_name,
      'station_name',coalesce(v_station.station_name,'LEOGO Pickup Station'),
      'station_address',concat_ws(', ',nullif(v_station.address_line,''),nullif(v_station.town,''),nullif(v_station.county,'')),
      'landmark',v_station.landmark,
      'operating_hours',v_station.operating_hours,
      'station_phone',v_station.contact_phone
    );
  else
    return;
  end if;

  insert into public.order_email_outbox(
    order_id,event_key,recipient_email,recipient_name,subject,template_data,status
  )
  values(
    v_order.id,p_event_key,v_email,v_order.receiver_name,v_subject,v_data,'pending'
  )
  on conflict (order_id,event_key) where order_id is not null do nothing;
exception when others then
  -- Never block delivery / station status changes because of notification infrastructure.
  return;
end
$function$;

create or replace function private.enqueue_email_when_rider_arrives_at_station()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='delivered_to_pickup_station'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_pickup_order_email(new.order_id,'pickup_station_arrived');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

drop trigger if exists marketplace_delivery_email_pickup_arrival
on public.marketplace_delivery_jobs;

create trigger marketplace_delivery_email_pickup_arrival
after update of status
on public.marketplace_delivery_jobs
for each row
execute function private.enqueue_email_when_rider_arrives_at_station();

create or replace function private.enqueue_email_when_station_receives_parcel()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='received'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_pickup_order_email(new.order_id,'pickup_station_ready');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

drop trigger if exists pickup_station_email_ready_for_pickup
on public.pickup_station_parcels;

create trigger pickup_station_email_ready_for_pickup
after update of status
on public.pickup_station_parcels
for each row
execute function private.enqueue_email_when_station_receives_parcel();

create or replace function public.edge_get_email_sender_credentials()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text := coalesce((select auth.role()),'');
  v_settings public.email_notification_settings%rowtype;
  v_password text;
begin
  if v_role<>'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_settings
  from public.email_notification_settings
  where id=1;

  if v_settings.app_password_secret_id is not null then
    select ds.decrypted_secret
    into v_password
    from vault.decrypted_secrets ds
    where ds.id=v_settings.app_password_secret_id;
  end if;

  return jsonb_build_object(
    'enabled',coalesce(v_settings.enabled,false),
    'provider',coalesce(v_settings.provider,'gmail_smtp'),
    'sender_name',coalesce(v_settings.sender_name,'LEOGO DIGITAL MARKET'),
    'sender_email',v_settings.sender_email,
    'app_password',v_password
  );
end
$function$;

revoke all on function public.edge_get_email_sender_credentials() from public,anon,authenticated;
grant execute on function public.edge_get_email_sender_credentials() to service_role;

create or replace function public.admin_get_email_notification_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_settings public.email_notification_settings%rowtype;
  v_secret_ready boolean := false;
  v_pending bigint := 0;
  v_failed bigint := 0;
  v_sent bigint := 0;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  select * into v_settings
  from public.email_notification_settings
  where id=1;

  if v_settings.app_password_secret_id is not null then
    select exists(
      select 1 from vault.secrets s where s.id=v_settings.app_password_secret_id
    ) into v_secret_ready;
  end if;

  select
    count(*) filter(where status in ('pending','sending','configuration_required')),
    count(*) filter(where status='failed'),
    count(*) filter(where status='sent')
  into v_pending,v_failed,v_sent
  from public.order_email_outbox;

  return jsonb_build_object(
    'enabled',coalesce(v_settings.enabled,false),
    'provider',coalesce(v_settings.provider,'gmail_smtp'),
    'sender_name',coalesce(v_settings.sender_name,'LEOGO DIGITAL MARKET'),
    'sender_email',v_settings.sender_email,
    'app_password_configured',v_secret_ready,
    'pending_count',v_pending,
    'failed_count',v_failed,
    'sent_count',v_sent,
    'updated_at',v_settings.updated_at
  );
end
$function$;

revoke all on function public.admin_get_email_notification_settings() from public,anon;
grant execute on function public.admin_get_email_notification_settings() to authenticated;

create or replace function public.admin_save_email_notification_settings(
  p_enabled boolean,
  p_sender_name text,
  p_sender_email text,
  p_app_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_settings public.email_notification_settings%rowtype;
  v_secret_id uuid;
  v_password text := regexp_replace(coalesce(p_app_password,''),'\s','','g');
  v_job record;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  if nullif(btrim(coalesce(p_sender_name,'')),'') is null then
    raise exception 'Sender name is required';
  end if;
  if coalesce(p_sender_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid sender email address';
  end if;

  select * into v_settings
  from public.email_notification_settings
  where id=1
  for update;

  v_secret_id := v_settings.app_password_secret_id;

  if v_password<>'' then
    if char_length(v_password)<8 then
      raise exception 'The Gmail App Password looks incomplete';
    end if;

    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_password,
        'leogo_gmail_smtp_app_password',
        'Encrypted Gmail App Password used only by the LEOGO transactional email Edge Function'
      );
    else
      perform vault.update_secret(
        v_secret_id,
        v_password,
        'leogo_gmail_smtp_app_password',
        'Encrypted Gmail App Password used only by the LEOGO transactional email Edge Function'
      );
    end if;
  end if;

  if p_enabled and v_secret_id is null then
    raise exception 'Add the Gmail App Password before enabling customer email notifications';
  end if;

  update public.email_notification_settings
  set enabled=p_enabled,
      provider='gmail_smtp',
      sender_name=btrim(p_sender_name),
      sender_email=lower(btrim(p_sender_email)),
      app_password_secret_id=v_secret_id,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1;

  perform private.write_admin_audit(
    'email_notifications.settings_updated',
    'email_notification_settings',
    '1',
    null,
    jsonb_build_object(
      'enabled',p_enabled,
      'provider','gmail_smtp',
      'sender_name',btrim(p_sender_name),
      'sender_email',lower(btrim(p_sender_email)),
      'app_password_configured',v_secret_id is not null
    ),
    '{}'::jsonb
  );

  if p_enabled and v_secret_id is not null then
    update public.order_email_outbox
    set status='pending',
        last_error=null,
        next_attempt_at=null,
        updated_at=now()
    where sent_at is null
      and status in ('configuration_required','failed')
      and attempt_count<5;

    for v_job in
      select id
      from public.order_email_outbox
      where sent_at is null
        and status='pending'
        and attempt_count<5
      order by created_at
      limit 20
    loop
      begin
        perform private.dispatch_order_email_job(v_job.id);
      exception when others then
        null;
      end;
    end loop;
  end if;

  return public.admin_get_email_notification_settings();
end
$function$;

revoke all on function public.admin_save_email_notification_settings(boolean,text,text,text) from public,anon;
grant execute on function public.admin_save_email_notification_settings(boolean,text,text,text) to authenticated;

create or replace function public.admin_queue_email_test(p_recipient_email text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_settings public.email_notification_settings%rowtype;
  v_job_id uuid;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  if coalesce(p_recipient_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid test email address';
  end if;

  select * into v_settings
  from public.email_notification_settings
  where id=1;

  if not coalesce(v_settings.enabled,false) then
    raise exception 'Enable customer email notifications first';
  end if;
  if v_settings.app_password_secret_id is null then
    raise exception 'Gmail App Password is not configured';
  end if;

  insert into public.order_email_outbox(
    order_id,event_key,recipient_email,recipient_name,subject,template_data,status
  )
  values(
    null,
    'admin_test_'||gen_random_uuid()::text,
    lower(btrim(p_recipient_email)),
    'LEOGO Admin',
    'LEOGO email notifications test',
    jsonb_build_object(
      'kind','test',
      'customer_name','LEOGO Admin',
      'order_reference','TEST',
      'station_name','LEOGO Pickup Station'
    ),
    'pending'
  )
  returning id into v_job_id;

  return jsonb_build_object('ok',true,'job_id',v_job_id);
end
$function$;

revoke all on function public.admin_queue_email_test(text) from public,anon;
grant execute on function public.admin_queue_email_test(text) to authenticated;

create or replace function private.retry_due_order_emails()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job record;
begin
  for v_job in
    select id
    from public.order_email_outbox
    where sent_at is null
      and status in ('pending','failed')
      and attempt_count<5
      and (next_attempt_at is null or next_attempt_at<=now())
    order by created_at
    limit 20
  loop
    begin
      perform private.dispatch_order_email_job(v_job.id);
    exception when others then
      null;
    end;
  end loop;
end
$function$;

do $block$
begin
  if not exists(select 1 from cron.job where jobname='leogo-order-email-retry') then
    perform cron.schedule(
      'leogo-order-email-retry',
      '*/5 * * * *',
      'select private.retry_due_order_emails();'
    );
  end if;
end
$block$;

-- Transactional order SMS notifications through Afrinet.
-- Additive only: existing in-app and email order notifications remain unchanged.

create table if not exists public.order_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.marketplace_orders(id),
  event_key text not null,
  recipient_phone text not null,
  recipient_name text,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed')),
  delivery_token uuid not null default gen_random_uuid(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_sms_outbox_order_event_uq
  on public.order_sms_outbox(order_id,event_key)
  where order_id is not null;

create index if not exists order_sms_outbox_retry_idx
  on public.order_sms_outbox(status,next_attempt_at,created_at)
  where sent_at is null;

alter table public.order_sms_outbox enable row level security;
revoke all on table public.order_sms_outbox from anon, authenticated;

create or replace function private.dispatch_order_sms_job(p_job_id uuid)
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
  from public.order_sms_outbox o
  where o.id=p_job_id
    and o.sent_at is null
    and o.status in ('pending','failed');

  if v_token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://dzdciuqkqixwutvtfotj.supabase.co/functions/v1/send-order-sms',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('job_id',p_job_id,'token',v_token),
    timeout_milliseconds := 12000
  );
exception when others then
  -- SMS transport must never interrupt order or Pickup Station operations.
  return;
end
$function$;

create or replace function private.dispatch_order_sms_job_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.dispatch_order_sms_job(new.id);
  return new;
exception when others then
  return new;
end
$function$;

drop trigger if exists order_sms_outbox_dispatch_insert on public.order_sms_outbox;
create trigger order_sms_outbox_dispatch_insert
after insert on public.order_sms_outbox
for each row
when (new.status='pending')
execute function private.dispatch_order_sms_job_trigger();

drop trigger if exists order_sms_outbox_dispatch_retry on public.order_sms_outbox;
create trigger order_sms_outbox_dispatch_retry
after update of status on public.order_sms_outbox
for each row
when (new.status='pending' and old.status is distinct from new.status)
execute function private.dispatch_order_sms_job_trigger();

create or replace function private.retry_due_order_sms()
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
    from public.order_sms_outbox
    where sent_at is null
      and status in ('pending','failed')
      and attempt_count<5
      and (next_attempt_at is null or next_attempt_at<=now())
    order by created_at
    limit 20
  loop
    begin
      perform private.dispatch_order_sms_job(v_job.id);
    exception when others then
      null;
    end;
  end loop;
end
$function$;

create or replace function private.enqueue_pickup_order_sms(
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
  v_phone text;
  v_message text;
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

  v_phone := nullif(btrim(coalesce(v_order.contact_number,'')),'');
  if v_phone is null then
    select coalesce(
      nullif(btrim(p.phone),''),
      nullif(btrim(u.phone),''),
      nullif(btrim(u.raw_user_meta_data->>'phone'),'')
    )
    into v_phone
    from auth.users u
    left join public.customer_profiles p on p.user_id=u.id
    where u.id=v_order.customer_id;
  end if;

  if v_phone is null then
    return;
  end if;

  if p_event_key='pickup_station_arrived' then
    v_message :=
      'LEOGO: Parcel '||v_order.order_reference||
      ' has arrived at '||coalesce(v_station.station_name,'the Pickup Station')||
      '. Please wait for the ready-for-pickup message before collection.';
  elsif p_event_key='pickup_station_ready' then
    v_message :=
      'LEOGO: Parcel '||v_order.order_reference||
      ' is ready for collection at '||coalesce(v_station.station_name,'the Pickup Station')||
      '. Please carry your ID when collecting.';
  else
    return;
  end if;

  insert into public.order_sms_outbox(
    order_id,event_key,recipient_phone,recipient_name,message,status
  )
  values(
    v_order.id,p_event_key,v_phone,v_order.receiver_name,v_message,'pending'
  )
  on conflict (order_id,event_key) where order_id is not null do nothing;
exception when others then
  -- Never block delivery / station status changes because of SMS infrastructure.
  return;
end
$function$;

create or replace function private.enqueue_sms_when_rider_arrives_at_station()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='delivered_to_pickup_station'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_pickup_order_sms(new.order_id,'pickup_station_arrived');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

create or replace function private.enqueue_sms_when_station_receives_parcel()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='received'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_pickup_order_sms(new.order_id,'pickup_station_ready');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

drop trigger if exists marketplace_delivery_sms_pickup_arrival on public.marketplace_delivery_jobs;
create trigger marketplace_delivery_sms_pickup_arrival
after update of status on public.marketplace_delivery_jobs
for each row
execute function private.enqueue_sms_when_rider_arrives_at_station();

drop trigger if exists pickup_station_sms_ready_for_pickup on public.pickup_station_parcels;
create trigger pickup_station_sms_ready_for_pickup
after update of status on public.pickup_station_parcels
for each row
execute function private.enqueue_sms_when_station_receives_parcel();

do $$
begin
  if not exists(select 1 from cron.job where jobname='leogo-order-sms-retry') then
    perform cron.schedule(
      'leogo-order-sms-retry',
      '*/5 * * * *',
      'select private.retry_due_order_sms();'
    );
  end if;
end
$$;

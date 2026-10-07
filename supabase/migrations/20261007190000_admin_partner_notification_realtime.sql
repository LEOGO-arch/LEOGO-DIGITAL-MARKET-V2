-- LEOGO V2: responsive Admin + Partner notification refresh.
-- Adds one singleton Admin refresh signal, source-table triggers, and Realtime publication entries.
-- No order/payment business rules are changed.

create table if not exists public.admin_notification_signal (
  id smallint primary key,
  version bigint not null default 0,
  approvals_version bigint not null default 0,
  orders_version bigint not null default 0,
  transport_version bigint not null default 0,
  pickup_version bigint not null default 0,
  accommodation_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint admin_notification_signal_singleton check (id = 1)
);

insert into public.admin_notification_signal (id)
values (1)
on conflict (id) do nothing;

alter table public.admin_notification_signal enable row level security;

revoke all on table public.admin_notification_signal from anon;
revoke all on table public.admin_notification_signal from authenticated;
grant select on table public.admin_notification_signal to authenticated;

drop policy if exists "Active Admin reads notification signal" on public.admin_notification_signal;
create policy "Active Admin reads notification signal"
on public.admin_notification_signal
for select
to authenticated
using ((select private.is_leogo_admin()));

create or replace function private.bump_admin_notification_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scope text := coalesce(tg_argv[0], 'approvals');
begin
  update public.admin_notification_signal
  set
    version = version + 1,
    approvals_version = approvals_version + case when v_scope = 'approvals' then 1 else 0 end,
    orders_version = orders_version + case when v_scope = 'orders' then 1 else 0 end,
    transport_version = transport_version + case when v_scope = 'transport' then 1 else 0 end,
    pickup_version = pickup_version + case when v_scope = 'pickup' then 1 else 0 end,
    accommodation_version = accommodation_version + case when v_scope = 'accommodation' then 1 else 0 end,
    updated_at = clock_timestamp()
  where id = 1;
  return null;
end;
$function$;

revoke all on function private.bump_admin_notification_signal() from public;
revoke all on function private.bump_admin_notification_signal() from anon;
revoke all on function private.bump_admin_notification_signal() from authenticated;

do $block$
declare
  r record;
begin
  for r in
    select * from (values
      ('seller_accounts','approvals'),
      ('seller_products','approvals'),
      ('wallet_deposit_requests','approvals'),
      ('wallet_loan_applications','approvals'),
      ('wallet_withdrawal_requests','approvals'),
      ('premium_customers','approvals'),
      ('premium_profiles','approvals'),
      ('premium_membership_payments','approvals'),
      ('customer_personal_sale_listings','approvals'),
      ('customer_looking_requests','approvals'),
      ('service_provider_accounts','approvals'),
      ('service_provider_services','approvals'),
      ('transport_provider_accounts','approvals'),
      ('transport_provider_vehicles','approvals'),
      ('pickup_station_applications','approvals'),
      ('partner_profile_change_requests','approvals'),
      ('seller_settlement_accounts','approvals'),
      ('service_provider_settlement_accounts','approvals'),
      ('transport_provider_settlement_accounts','approvals'),
      ('accommodation_hosts','approvals'),
      ('accommodation_properties','approvals'),
      ('accommodation_units','approvals'),
      ('cyber_provider_accounts','approvals'),
      ('cyber_services','approvals'),
      ('cyber_products','approvals'),
      ('partner_billing_payments','approvals'),
      ('premium_customer_meetup_payments','approvals'),
      ('health_medicine_accounts','approvals'),
      ('health_medicine_products','approvals'),
      ('health_specialist_services','approvals'),
      ('health_medicine_orders','approvals'),
      ('health_specialist_bookings','approvals'),
      ('service_requests','approvals'),
      ('marketplace_orders','orders'),
      ('transport_requests','transport'),
      ('pickup_station_parcel_events','pickup'),
      ('accommodation_bookings','accommodation')
    ) as x(table_name, scope_name)
  loop
    if to_regclass(format('public.%I', r.table_name)) is not null then
      execute format('drop trigger if exists leogo_admin_notification_signal on public.%I', r.table_name);
      execute format(
        'create trigger leogo_admin_notification_signal after insert or update or delete on public.%I for each statement execute function private.bump_admin_notification_signal(%L)',
        r.table_name,
        r.scope_name
      );
    end if;
  end loop;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_notification_signal'
  ) then
    alter publication supabase_realtime add table public.admin_notification_signal;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'partner_notifications'
  ) then
    alter publication supabase_realtime add table public.partner_notifications;
  end if;
end;
$block$;

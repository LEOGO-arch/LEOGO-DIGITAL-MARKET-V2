-- Activate Admin System Settings cards with live Order and Lipa Pole Pole controls.
-- Existing Delivery, Wallet, Premium, Accommodation, Notifications and Security cards
-- route to their already-connected modules.

create table if not exists public.order_settings (
  id smallint primary key default 1 check (id=1),
  cod_limit_kes numeric(12,2) not null default 10000 check (cod_limit_kes>=0),
  service_fee_threshold_kes numeric(12,2) not null default 3000 check (service_fee_threshold_kes>=0),
  service_fee_below_percent numeric(7,4) not null default 2 check (service_fee_below_percent between 0 and 100),
  service_fee_at_or_above_percent numeric(7,4) not null default 1.5 check (service_fee_at_or_above_percent between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.order_settings(id)
values(1)
on conflict(id) do nothing;

alter table public.order_settings enable row level security;
revoke all on table public.order_settings from anon,authenticated;

create table if not exists public.lipa_pole_pole_settings (
  id smallint primary key default 1 check (id=1),
  cancellation_deduction_percent numeric(7,4) not null default 25 check (cancellation_deduction_percent between 0 and 100),
  overdue_refund_deduction_percent numeric(7,4) not null default 25 check (overdue_refund_deduction_percent between 0 and 100),
  overdue_interest_percent numeric(7,4) not null default 5 check (overdue_interest_percent between 0 and 100),
  reminder_days_before_due integer not null default 3 check (reminder_days_before_due between 0 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.lipa_pole_pole_settings(id)
values(1)
on conflict(id) do nothing;

alter table public.lipa_pole_pole_settings enable row level security;
revoke all on table public.lipa_pole_pole_settings from anon,authenticated;

create or replace function public.public_get_order_settings()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'cod_limit_kes',s.cod_limit_kes,
    'service_fee_threshold_kes',s.service_fee_threshold_kes,
    'service_fee_below_percent',s.service_fee_below_percent,
    'service_fee_at_or_above_percent',s.service_fee_at_or_above_percent
  )
  from public.order_settings s
  where s.id=1;
$function$;

revoke all on function public.public_get_order_settings() from public;
grant execute on function public.public_get_order_settings() to anon,authenticated;

create or replace function public.admin_get_order_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;
  return (select to_jsonb(s) from public.order_settings s where s.id=1);
end;
$function$;

revoke all on function public.admin_get_order_settings() from public,anon;
grant execute on function public.admin_get_order_settings() to authenticated;

create or replace function public.admin_save_order_settings(
  p_cod_limit_kes numeric,
  p_service_fee_threshold_kes numeric,
  p_service_fee_below_percent numeric,
  p_service_fee_at_or_above_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;
  if p_cod_limit_kes<0 or p_service_fee_threshold_kes<0 then
    raise exception 'Order amounts cannot be negative';
  end if;
  if p_service_fee_below_percent not between 0 and 100
     or p_service_fee_at_or_above_percent not between 0 and 100 then
    raise exception 'Service fee percentages must be between 0 and 100';
  end if;

  select to_jsonb(s) into v_before from public.order_settings s where s.id=1 for update;

  update public.order_settings
  set cod_limit_kes=p_cod_limit_kes,
      service_fee_threshold_kes=p_service_fee_threshold_kes,
      service_fee_below_percent=p_service_fee_below_percent,
      service_fee_at_or_above_percent=p_service_fee_at_or_above_percent,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1
  returning to_jsonb(order_settings) into v_after;

  perform private.write_admin_audit(
    'settings.order.updated','order_settings','1',v_before,v_after,'{}'::jsonb
  );

  return v_after;
end;
$function$;

revoke all on function public.admin_save_order_settings(numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_save_order_settings(numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.public_get_lipa_pole_pole_settings()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'cancellation_deduction_percent',s.cancellation_deduction_percent,
    'overdue_refund_deduction_percent',s.overdue_refund_deduction_percent,
    'overdue_interest_percent',s.overdue_interest_percent,
    'reminder_days_before_due',s.reminder_days_before_due
  )
  from public.lipa_pole_pole_settings s
  where s.id=1;
$function$;

revoke all on function public.public_get_lipa_pole_pole_settings() from public;
grant execute on function public.public_get_lipa_pole_pole_settings() to anon,authenticated;

create or replace function public.admin_get_lipa_pole_pole_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;
  return (select to_jsonb(s) from public.lipa_pole_pole_settings s where s.id=1);
end;
$function$;

revoke all on function public.admin_get_lipa_pole_pole_settings() from public,anon;
grant execute on function public.admin_get_lipa_pole_pole_settings() to authenticated;

create or replace function public.admin_save_lipa_pole_pole_settings(
  p_cancellation_deduction_percent numeric,
  p_overdue_refund_deduction_percent numeric,
  p_overdue_interest_percent numeric,
  p_reminder_days_before_due integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;
  if p_cancellation_deduction_percent not between 0 and 100
     or p_overdue_refund_deduction_percent not between 0 and 100
     or p_overdue_interest_percent not between 0 and 100 then
    raise exception 'Lipa Pole Pole percentages must be between 0 and 100';
  end if;
  if p_reminder_days_before_due not between 0 and 60 then
    raise exception 'Reminder days must be between 0 and 60';
  end if;

  select to_jsonb(s) into v_before from public.lipa_pole_pole_settings s where s.id=1 for update;

  update public.lipa_pole_pole_settings
  set cancellation_deduction_percent=p_cancellation_deduction_percent,
      overdue_refund_deduction_percent=p_overdue_refund_deduction_percent,
      overdue_interest_percent=p_overdue_interest_percent,
      reminder_days_before_due=p_reminder_days_before_due,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1
  returning to_jsonb(lipa_pole_pole_settings) into v_after;

  perform private.write_admin_audit(
    'settings.lipa_pole_pole.updated','lipa_pole_pole_settings','1',v_before,v_after,'{}'::jsonb
  );

  return v_after;
end;
$function$;

revoke all on function public.admin_save_lipa_pole_pole_settings(numeric,numeric,numeric,integer) from public,anon;
grant execute on function public.admin_save_lipa_pole_pole_settings(numeric,numeric,numeric,integer) to authenticated;

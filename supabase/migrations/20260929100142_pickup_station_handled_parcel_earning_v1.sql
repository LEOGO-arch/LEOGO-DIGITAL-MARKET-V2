-- Pickup Station Partner earns a fixed Admin-managed amount per successfully handled parcel.
create table if not exists public.pickup_station_finance_settings (
  id smallint primary key default 1 check (id=1),
  handled_parcel_earning_kes numeric(12,2) not null default 20 check (handled_parcel_earning_kes>=0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.pickup_station_finance_settings(id,handled_parcel_earning_kes)
values(1,20)
on conflict(id) do nothing;

alter table public.pickup_station_finance_settings enable row level security;

CREATE OR REPLACE FUNCTION private.create_pickup_parcel_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_partner uuid;
  v_station_name text;
  v_parcel_id uuid;
  v_earning numeric := private.pickup_handled_parcel_earning();
begin
  if new.delivery_zone<>'pickup' or new.pickup_station_id is null then
    return new;
  end if;

  insert into public.pickup_station_parcels(
    order_id,pickup_station_id,parcel_reference,status,earnings_amount_kes,booked_at
  ) values (
    new.id,new.pickup_station_id,new.order_reference,
    case when new.order_status='delivered' then 'handed_over' else 'booked' end,
    case when new.order_status='delivered' then v_earning else 0 end,
    new.created_at
  )
  on conflict(order_id) do update
  set pickup_station_id=excluded.pickup_station_id,
      parcel_reference=excluded.parcel_reference,
      earnings_amount_kes=case
        when public.pickup_station_parcels.status='handed_over'
          then public.pickup_station_parcels.earnings_amount_kes
        else excluded.earnings_amount_kes
      end,
      updated_at=now()
  returning id into v_parcel_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes,created_at
  ) values (
    new.pickup_station_id,v_parcel_id,new.id,'booked',new.order_reference,new.customer_id,
    'Customer booked this order for Pickup Station collection.',new.created_at
  );

  select a.user_id,s.station_name
    into v_partner,v_station_name
  from public.pickup_stations s
  left join public.pickup_station_partner_accounts a
    on a.pickup_station_id=s.id and a.status='active'
  where s.id=new.pickup_station_id;

  if v_partner is not null then
    perform private.notify_partner(
      v_partner,'pickup_station','parcel_booked','New parcel booked for your Pickup Station',
      new.order_reference||' is booked for collection at '||coalesce(v_station_name,'your Pickup Station')||'.',
      'marketplace_order',new.id,'pickup-parcels',
      jsonb_build_object('order_reference',new.order_reference,'pickup_station_id',new.pickup_station_id)
    );
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.pickup_handled_parcel_earning()
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select handled_parcel_earning_kes from public.pickup_station_finance_settings where id=1),
    20::numeric
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_pickup_station_finance_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not (
    private.is_leogo_admin('settings.manage')
    or private.is_leogo_admin('fees.manage')
    or private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('approvals.read')
  ) then
    raise exception 'Admin access required';
  end if;

  select to_jsonb(s) into v
  from public.pickup_station_finance_settings s
  where s.id=1;

  return coalesce(v,jsonb_build_object('id',1,'handled_parcel_earning_kes',20));
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_pickup_station_finance_settings(p_handled_parcel_earning_kes numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not (
    private.is_leogo_admin('settings.manage')
    or private.is_leogo_admin('fees.manage')
    or private.is_leogo_admin('delivery.manage')
  ) then
    raise exception 'Pickup Station earning settings permission required';
  end if;

  if p_handled_parcel_earning_kes is null or p_handled_parcel_earning_kes<0 then
    raise exception 'Handled parcel earning must be zero or above';
  end if;

  select to_jsonb(s) into v_before
  from public.pickup_station_finance_settings s
  where s.id=1
  for update;

  update public.pickup_station_finance_settings
  set handled_parcel_earning_kes=round(p_handled_parcel_earning_kes,2),
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1
  returning to_jsonb(pickup_station_finance_settings.*) into v_after;

  perform private.write_admin_audit(
    'pickup.finance.handled_parcel_rate_updated',
    'pickup_station_finance_settings',
    '1',
    v_before,
    v_after,
    jsonb_build_object('scope','Pickup Station Partner earning per successfully handed-over parcel')
  );

  return v_after;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_earnings_report(p_from date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'Africa/Nairobi'::text)))::date, p_to date DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_station uuid := private.pickup_partner_station_id();
  v_period numeric:=0;
  v_total numeric:=0;
  v_reserved numeric:=0;
  v_count bigint:=0;
  v_daily jsonb;
  v_rate numeric := private.pickup_handled_parcel_earning();
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;

  select coalesce(sum(earnings_amount_kes),0),count(*)
  into v_period,v_count
  from public.pickup_station_parcels
  where pickup_station_id=v_station and status='handed_over'
    and (handed_over_at at time zone 'Africa/Nairobi')::date between p_from and p_to;

  select coalesce(sum(earnings_amount_kes),0) into v_total
  from public.pickup_station_parcels
  where pickup_station_id=v_station and status='handed_over';

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_station and status in ('pending','approved','paid');

  select coalesce(jsonb_agg(x order by x.day desc),'[]'::jsonb) into v_daily
  from (
    select
      (handed_over_at at time zone 'Africa/Nairobi')::date as day,
      count(*) as parcels,
      sum(earnings_amount_kes) as earnings_kes
    from public.pickup_station_parcels
    where pickup_station_id=v_station and status='handed_over'
      and (handed_over_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by 1
  ) x;

  return jsonb_build_object(
    'from',p_from,'to',p_to,'parcels',v_count,
    'current_handled_parcel_rate_kes',v_rate,
    'period_earnings_kes',v_period,
    'total_earnings_kes',v_total,
    'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total-v_reserved,0),
    'daily',v_daily
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_get_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_account public.pickup_station_partner_accounts%rowtype;
  v_station public.pickup_stations%rowtype;
  v_month_start timestamptz := date_trunc('month',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_month_earned numeric := 0;
  v_total_earned numeric := 0;
  v_reserved numeric := 0;
  v_booked bigint := 0;
  v_received bigint := 0;
  v_today_received bigint := 0;
  v_today_handed bigint := 0;
  v_rate numeric := private.pickup_handled_parcel_earning();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_account from public.pickup_station_partner_accounts where user_id=v_uid;
  if not found then return jsonb_build_object('assigned',false); end if;
  select * into v_station from public.pickup_stations where id=v_account.pickup_station_id;

  select
    coalesce(sum(case when p.status='handed_over' then p.earnings_amount_kes else 0 end),0),
    coalesce(sum(case when p.status='handed_over' and p.handed_over_at>=v_month_start then p.earnings_amount_kes else 0 end),0),
    count(*) filter(where p.status='booked'),
    count(*) filter(where p.status='received'),
    count(*) filter(where p.received_at is not null and (p.received_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date),
    count(*) filter(where p.handed_over_at is not null and (p.handed_over_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date)
  into v_total_earned,v_month_earned,v_booked,v_received,v_today_received,v_today_handed
  from public.pickup_station_parcels p
  where p.pickup_station_id=v_account.pickup_station_id;

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id and status in ('pending','approved','paid');

  return jsonb_build_object(
    'assigned',true,
    'account',jsonb_build_object(
      'user_id',v_account.user_id,'display_name',v_account.display_name,'phone',v_account.phone,
      'status',v_account.status,'payout_method',v_account.payout_method,
      'payout_account_name',v_account.payout_account_name,'payout_phone',v_account.payout_phone,
      'payout_account_number',v_account.payout_account_number
    ),
    'station',to_jsonb(v_station),
    'handled_parcel_earning_kes',v_rate,
    'booked_parcels',v_booked,
    'parcels_at_station',v_received,
    'received_today',v_today_received,
    'handed_over_today',v_today_handed,
    'month_earnings_kes',v_month_earned,
    'total_earnings_kes',v_total_earned,
    'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total_earned-v_reserved,0)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_handover_parcel(p_code text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
  v_earning numeric := private.pickup_handled_parcel_earning();
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  select * into v_order from public.marketplace_orders where id=v_order_id for update;
  select * into v_parcel from public.pickup_station_parcels where order_id=v_order_id for update;
  select station_name into v_station_name from public.pickup_stations where id=v_station;

  if v_parcel.status='handed_over' then
    return jsonb_build_object(
      'ok',true,'already_handed_over',true,'order_reference',v_order.order_reference,
      'status','handed_over','earnings_amount_kes',v_parcel.earnings_amount_kes
    );
  end if;
  if v_parcel.status<>'received' then raise exception 'Receive this parcel at the Pickup Station before handing it over'; end if;
  if v_order.payment_status in ('submitted','rejected') then
    raise exception 'Payment is not verified. Do not hand over this parcel yet';
  end if;

  update public.pickup_station_parcels
  set status='handed_over',
      handed_over_at=now(),
      handed_over_by=v_uid,
      earnings_amount_kes=v_earning,
      last_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_delivery_jobs
  set status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and status not in ('cancelled','failed');

  update public.marketplace_orders
  set order_status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      payment_status=case when payment_status='cod_due' then 'cod_paid' else payment_status end,
      updated_at=now()
  where id=v_order.id;

  update public.marketplace_seller_orders
  set fulfilment_status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and fulfilment_status<>'cancelled';

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'handed_over',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel handed over to customer. Station earning: KSh '||v_earning::text||'.')
  );

  perform private.pickup_notify_order_parties(v_order.id,'handed_over',coalesce(v_station_name,'Pickup Station'));
  perform private.write_admin_audit(
    'pickup.parcel.handed_over','marketplace_order',v_order.id::text,
    null,jsonb_build_object(
      'order_reference',v_order.order_reference,'pickup_station_id',v_station,
      'parcel_status','handed_over','delivery_status','delivered',
      'earnings_amount_kes',v_parcel.earnings_amount_kes
    ),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,'order_id',v_order.id,'order_reference',v_order.order_reference,
    'status','handed_over','delivery_status','delivered',
    'earnings_amount_kes',v_parcel.earnings_amount_kes
  );
end
$function$;

revoke all on function private.pickup_handled_parcel_earning() from public,anon,authenticated;
revoke all on function public.admin_get_pickup_station_finance_settings() from public,anon;
revoke all on function public.admin_update_pickup_station_finance_settings(numeric) from public,anon;
grant execute on function public.admin_get_pickup_station_finance_settings() to authenticated;
grant execute on function public.admin_update_pickup_station_finance_settings(numeric) to authenticated;

update public.pickup_station_parcels
set earnings_amount_kes=0,
    updated_at=now()
where status in ('booked','received');

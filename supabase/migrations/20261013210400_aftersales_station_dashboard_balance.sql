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
  v_pending_arrivals bigint := 0;
  v_received bigint := 0;
  v_today_received bigint := 0;
  v_today_handed bigint := 0;
  v_rate numeric := private.pickup_handled_parcel_earning();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_account
  from public.pickup_station_partner_accounts
  where user_id=v_uid;

  if not found then
    -- Include only seller-confirmed Aftersales return commission in earnings and balance.
  v_total_earned := v_total_earned + (select coalesce(sum(amount_kes),0)
    from public.aftersales_station_commissions where pickup_station_id=v_account.pickup_station_id);
  v_month_earned := v_month_earned + (select coalesce(sum(amount_kes),0)
    from public.aftersales_station_commissions where pickup_station_id=v_account.pickup_station_id and earned_at>=v_month_start);
  return jsonb_build_object('assigned',false);
  end if;

  select * into v_station
  from public.pickup_stations
  where id=v_account.pickup_station_id;

  select
    coalesce(sum(case when p.status='handed_over' then p.earnings_amount_kes else 0 end),0),
    coalesce(sum(case when p.status='handed_over' and p.handed_over_at>=v_month_start then p.earnings_amount_kes else 0 end),0),
    count(*) filter(where p.status='booked'),
    count(*) filter(where p.status='arrived_pending_receipt'),
    count(*) filter(where p.status='received'),
    count(*) filter(where p.received_at is not null and (p.received_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date),
    count(*) filter(where p.handed_over_at is not null and (p.handed_over_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date)
  into v_total_earned,v_month_earned,v_booked,v_pending_arrivals,v_received,v_today_received,v_today_handed
  from public.pickup_station_parcels p
  where p.pickup_station_id=v_account.pickup_station_id;

  select coalesce(sum(requested_amount_kes),0)
  into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id
    and status in ('pending','approved','paid');

  return jsonb_build_object(
    'assigned',true,
    'account',jsonb_build_object(
      'user_id',v_account.user_id,
      'display_name',v_account.display_name,
      'phone',v_account.phone,
      'status',v_account.status,
      'payout_method',v_account.payout_method,
      'payout_account_name',v_account.payout_account_name,
      'payout_phone',v_account.payout_phone,
      'payout_account_number',v_account.payout_account_number
    ),
    'station',to_jsonb(v_station),
    'handled_parcel_earning_kes',v_rate,
    'booked_parcels',v_booked,
    'pending_arrivals',v_pending_arrivals,
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

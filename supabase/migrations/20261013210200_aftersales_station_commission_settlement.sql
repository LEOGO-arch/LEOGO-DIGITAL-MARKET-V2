-- Include earned seller-confirmed return commissions in existing settlement accounting.
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

  -- One daily statement combining normal handovers and completed Aftersales returns.
  select coalesce(jsonb_agg(x order by x.day desc),'[]'::jsonb) into v_daily from (
    select day,sum(parcels) as parcels,sum(earnings_kes) as earnings_kes from (
      select (handed_over_at at time zone 'Africa/Nairobi')::date as day,
        count(*) as parcels,sum(earnings_amount_kes) as earnings_kes
      from public.pickup_station_parcels
      where pickup_station_id=v_station and status='handed_over'
        and (handed_over_at at time zone 'Africa/Nairobi')::date between p_from and p_to
      group by 1
      union all
      select (earned_at at time zone 'Africa/Nairobi')::date as day,
        count(*) as parcels,sum(amount_kes) as earnings_kes
      from public.aftersales_station_commissions
      where pickup_station_id=v_station
        and (earned_at at time zone 'Africa/Nairobi')::date between p_from and p_to
      group by 1
    ) combined group by day
  ) x;

  -- Completed return commissions are earned only after seller receipt.
  v_total := v_total + (select coalesce(sum(amount_kes),0) from public.aftersales_station_commissions where pickup_station_id=v_station);
  v_period := v_period + (select coalesce(sum(amount_kes),0) from public.aftersales_station_commissions
    where pickup_station_id=v_station and (earned_at at time zone 'Africa/Nairobi')::date between p_from and p_to);
  v_count := v_count + (select count(*) from public.aftersales_station_commissions
    where pickup_station_id=v_station and (earned_at at time zone 'Africa/Nairobi')::date between p_from and p_to);
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


CREATE OR REPLACE FUNCTION public.pickup_partner_request_withdrawal(p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_account public.pickup_station_partner_accounts%rowtype;
  v_total numeric:=0;
  v_reserved numeric:=0;
  v_available numeric:=0;
  v_id uuid;
  v_station_name text;
begin
  select * into v_account
  from public.pickup_station_partner_accounts
  where user_id=v_uid and status='active'
  for update;
  if not found then raise exception 'Your account is not assigned to an active Pickup Station'; end if;

  if p_amount_kes is null or p_amount_kes<=0 then raise exception 'Enter a valid withdrawal amount'; end if;
  if nullif(btrim(coalesce(v_account.payout_account_name,'')),'') is null then
    raise exception 'Save your payout account before requesting a withdrawal';
  end if;
  if v_account.payout_method='mpesa' and nullif(btrim(coalesce(v_account.payout_phone,'')),'') is null then
    raise exception 'Save your M-Pesa payout phone before requesting a withdrawal';
  end if;

  select coalesce(sum(earnings_amount_kes),0) into v_total
  from public.pickup_station_parcels
  where pickup_station_id=v_account.pickup_station_id and status='handed_over';
  -- Include earned returns but not merely booked, received or dispatched returns.
  select v_total+coalesce(sum(amount_kes),0) into v_total from public.aftersales_station_commissions
  where pickup_station_id=v_account.pickup_station_id;

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id and status in ('pending','approved','paid');

  v_available:=greatest(v_total-v_reserved,0);
  if p_amount_kes>v_available then raise exception 'Requested amount is higher than your available balance'; end if;

  insert into public.pickup_station_withdrawal_requests(
    partner_id,pickup_station_id,requested_amount_kes,payout_method,payout_account_name,
    payout_phone,payout_account_number,partner_note
  ) values (
    v_uid,v_account.pickup_station_id,round(p_amount_kes,2),v_account.payout_method,v_account.payout_account_name,
    v_account.payout_phone,v_account.payout_account_number,nullif(btrim(coalesce(p_note,'')),'')
  ) returning id into v_id;

  select station_name into v_station_name from public.pickup_stations where id=v_account.pickup_station_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_account.pickup_station_id,'withdrawal_requested','WITHDRAWAL-'||v_id::text,v_uid,
    'Withdrawal request '||v_id::text||' for KSh '||round(p_amount_kes,2)::text||' from '||coalesce(v_station_name,'Pickup Station')
  );

  perform private.write_admin_audit(
    'pickup.withdrawal.requested','pickup_station_withdrawal',v_id::text,
    null,jsonb_build_object('amount_kes',round(p_amount_kes,2),'pickup_station_id',v_account.pickup_station_id),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object('ok',true,'withdrawal_id',v_id,'requested_amount_kes',round(p_amount_kes,2),'status','pending');
end
$function$;

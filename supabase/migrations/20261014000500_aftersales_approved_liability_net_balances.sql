-- Approved liability findings are the single source of debit amounts. Reversed or pending findings do not debit.
create or replace function private.aftersales_liability_total(p_party text,p_account uuid)
returns numeric language sql stable security definer set search_path='' as $fn$
select coalesce(sum(assessed_amount_kes),0) from public.aftersales_liability_cases
where liability_type=p_party and liable_account_id=p_account and status='approved';
$fn$;
revoke all on function private.aftersales_liability_total(text,uuid) from public,anon,authenticated;

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

  if not found then return jsonb_build_object('assigned',false); end if;

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

  v_total_earned:=v_total_earned+(select coalesce(sum(amount_kes),0) from public.aftersales_station_commissions where pickup_station_id=v_account.pickup_station_id);
  v_month_earned:=v_month_earned+(select coalesce(sum(amount_kes),0) from public.aftersales_station_commissions where pickup_station_id=v_account.pickup_station_id and earned_at>=v_month_start);
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
    'aftersales_liabilities_kes',private.aftersales_liability_total('pickup_station',v_account.pickup_station_id),
    'liability_outstanding_kes',greatest(private.aftersales_liability_total('pickup_station',v_account.pickup_station_id)-greatest(v_total_earned-v_reserved,0),0),
    'available_balance_kes',greatest(v_total_earned-v_reserved-private.aftersales_liability_total('pickup_station',v_account.pickup_station_id),0)
  );
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
    'aftersales_liabilities_kes',private.aftersales_liability_total('pickup_station',v_station),
    'available_balance_kes',greatest(v_total-v_reserved-private.aftersales_liability_total('pickup_station',v_station),0),
    'daily',v_daily
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.partner_available_balance(p_partner_type text, p_uid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_earned numeric:=0;
  v_settled numeric:=0;
  v_pending numeric:=0;
  v_rate numeric:=0.10;
begin
  if p_partner_type='seller' then
    select coalesce(sum(so.seller_subtotal_kes),0)
    into v_earned
    from public.marketplace_seller_orders so
    join public.marketplace_orders o on o.id=so.order_id
    where so.seller_id=p_uid
      and so.fulfilment_status='delivered'
      and o.payment_status='verified_paid';

    select coalesce(sum(s.amount_kes),0)
    into v_settled
    from public.seller_settlements s
    where s.seller_id=p_uid and s.status='paid';

    select coalesce(sum(r.requested_amount_kes),0)
    into v_pending
    from public.seller_settlement_requests r
    where r.seller_id=p_uid and r.status in ('pending','under_review');

  elsif p_partner_type='service_provider' then
    select coalesce(referral_commission_rate,0.10)
    into v_rate
    from public.service_marketplace_settings
    where id=1;

    select coalesce(sum(round(coalesce(r.provider_labour_kes,r.provider_quote_kes,0)*(1-v_rate),2)),0)
    into v_earned
    from public.service_requests r
    where r.provider_id=p_uid
      and r.request_status='completed'
      and coalesce(r.provider_labour_kes,r.provider_quote_kes,0)>0;

    select coalesce(sum(s.amount_kes),0)
    into v_settled
    from public.service_provider_settlements s
    where s.provider_id=p_uid and s.status='paid';

    select coalesce(sum(r.requested_amount_kes),0)
    into v_pending
    from public.service_provider_settlement_requests r
    where r.provider_id=p_uid and r.status in ('pending','under_review');
  else
    raise exception 'Earnings are not connected for this partner type yet';
  end if;

  return greatest(round(v_earned-v_settled-v_pending-private.aftersales_liability_total(p_partner_type,p_uid),2),0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_pay_transport_provider_settlement_request(p_request_id uuid, p_reference text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.transport_provider_settlement_requests%rowtype; v_id uuid; v_other_pending numeric:=0; v_total numeric:=0; v_settled numeric:=0; v_available_for_this numeric:=0;
begin
  if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required'; end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference is required'; end if;
  select * into v from public.transport_provider_settlement_requests where id=p_request_id for update;
  if not found then raise exception 'Settlement request not found'; end if;
  if v.status not in ('pending','under_review') then raise exception 'Settlement request is already closed'; end if;

  select coalesce(sum(coalesce(r.quote_partner_net_kes,round(coalesce(r.provider_quote_kes,0)-coalesce(r.quote_partner_commission_kes,0),2))),0)
    into v_total from public.transport_requests r where r.assigned_provider_id=v.provider_id and r.request_status='completed';
  select coalesce(sum(amount_kes),0) into v_settled from public.transport_provider_settlements where provider_id=v.provider_id and status='paid';
  select coalesce(sum(requested_amount_kes),0) into v_other_pending from public.transport_provider_settlement_requests
    where provider_id=v.provider_id and status in ('pending','under_review') and id<>p_request_id;
  v_available_for_this:=greatest(round(v_total-v_settled-v_other_pending-private.aftersales_liability_total('transport_provider',v.provider_id),2),0);
  if v.requested_amount_kes>v_available_for_this then raise exception 'Requested amount now exceeds available balance'; end if;

  insert into public.transport_provider_settlements(provider_id,settlement_account_id,amount_kes,settlement_reference,processed_by,notes,destination_snapshot)
  select v.provider_id,v.settlement_account_id,v.requested_amount_kes,btrim(p_reference),auth.uid(),nullif(btrim(coalesce(p_notes,'')),''),
    jsonb_build_object('account_type',a.account_type,'account_name',a.account_name,'phone_number',a.phone_number,'till_number',a.till_number,'paybill_number',a.paybill_number,'account_number',a.account_number,'bank_name',a.bank_name,'bank_branch',a.bank_branch)
  from public.transport_provider_settlement_accounts a where a.id=v.settlement_account_id and a.status='approved'
  returning id into v_id;
  if v_id is null then raise exception 'Approved settlement account not found'; end if;

  update public.transport_provider_settlement_requests set status='paid',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    reviewed_at=now(),reviewed_by=auth.uid(),settlement_id=v_id,updated_at=now() where id=p_request_id;

  perform private.notify_partner(v.provider_id,'transport','settlement_paid','Settlement paid',
    'LEOGO paid your Transport Provider settlement request of KSh '||trim(to_char(v.requested_amount_kes,'FM999999990.00'))||' with reference '||btrim(p_reference)||'.',
    'transport_provider_settlement_request',p_request_id,'transport-settlements',
    jsonb_build_object('amount_kes',v.requested_amount_kes,'reference',btrim(p_reference),'status','paid'));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.transport_provider_get_earnings_report(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_today date:=(now() at time zone 'Africa/Nairobi')::date;
  v_from date:=coalesce(p_from,v_today);
  v_to date:=coalesce(p_to,v_today);
  v_today_net numeric:=0;
  v_period_gross numeric:=0;
  v_period_commission numeric:=0;
  v_period_net numeric:=0;
  v_total_net numeric:=0;
  v_settled numeric:=0;
  v_pending numeric:=0;
  v_entries jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if v_from>v_to then raise exception 'From date cannot be after To date'; end if;
  if not exists(select 1 from public.transport_provider_accounts where user_id=v_uid and application_status='approved')
    then raise exception 'Approved Transport Provider account required'; end if;

  with eligible as (
    select r.id,r.request_reference reference,'Transport & Parcel job'::text source_label,
      coalesce(r.provider_quote_kes,0) gross_kes,
      coalesce(r.quote_partner_commission_kes,0) commission_kes,
      coalesce(r.quote_partner_net_kes,round(coalesce(r.provider_quote_kes,0)-coalesce(r.quote_partner_commission_kes,0),2)) net_kes,
      ((r.completed_at at time zone 'Africa/Nairobi')::date) earning_date,
      r.completed_at earning_at
    from public.transport_requests r
    where r.assigned_provider_id=v_uid and r.request_status='completed'
      and r.completed_at is not null and coalesce(r.provider_quote_kes,0)>0
  )
  select
    coalesce(sum(net_kes) filter(where earning_date=v_today),0),
    coalesce(sum(gross_kes) filter(where earning_date between v_from and v_to),0),
    coalesce(sum(commission_kes) filter(where earning_date between v_from and v_to),0),
    coalesce(sum(net_kes) filter(where earning_date between v_from and v_to),0),
    coalesce(sum(net_kes),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'reference',reference,'source',source_label,'earning_date',earning_date,'earning_at',earning_at,
      'gross_kes',gross_kes,'commission_kes',commission_kes,'net_kes',net_kes
    ) order by earning_at desc) filter(where earning_date between v_from and v_to),'[]'::jsonb)
  into v_today_net,v_period_gross,v_period_commission,v_period_net,v_total_net,v_entries
  from eligible;

  select coalesce(sum(amount_kes),0) into v_settled
  from public.transport_provider_settlements where provider_id=v_uid and status='paid';

  select coalesce(sum(requested_amount_kes),0) into v_pending
  from public.transport_provider_settlement_requests where provider_id=v_uid and status in ('pending','under_review');

  return jsonb_build_object(
    'partner_type','transport','from',v_from,'to',v_to,
    'today_net_kes',round(v_today_net,2),
    'period_gross_kes',round(v_period_gross,2),
    'period_commission_kes',round(v_period_commission,2),
    'period_net_kes',round(v_period_net,2),
    'cumulative_net_kes',round(v_total_net,2),
    'settled_total_kes',round(v_settled,2),
    'pending_settlement_kes',round(v_pending,2),
    'aftersales_liabilities_kes',private.aftersales_liability_total('transport_provider',v_uid),
    'available_balance_kes',greatest(round(v_total_net-v_settled-v_pending-private.aftersales_liability_total('transport_provider',v_uid),2),0),
    'entries',v_entries
  );
end $function$;

CREATE OR REPLACE FUNCTION public.transport_provider_request_settlement(p_account_id uuid, p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid; v_total numeric:=0; v_settled numeric:=0; v_pending numeric:=0; v_available numeric:=0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.transport_provider_accounts where user_id=v_uid and application_status='approved')
    then raise exception 'Approved Transport Provider account required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement request amount must be greater than zero'; end if;
  if not exists(select 1 from public.transport_provider_settlement_accounts where id=p_account_id and provider_id=v_uid and status='approved')
    then raise exception 'Choose an approved settlement account'; end if;

  select coalesce(sum(coalesce(r.quote_partner_net_kes,round(coalesce(r.provider_quote_kes,0)-coalesce(r.quote_partner_commission_kes,0),2))),0)
    into v_total from public.transport_requests r
    where r.assigned_provider_id=v_uid and r.request_status='completed' and r.completed_at is not null;
  select coalesce(sum(amount_kes),0) into v_settled from public.transport_provider_settlements where provider_id=v_uid and status='paid';
  select coalesce(sum(requested_amount_kes),0) into v_pending from public.transport_provider_settlement_requests where provider_id=v_uid and status in ('pending','under_review');
  v_available:=greatest(round(v_total-v_settled-v_pending-private.aftersales_liability_total('transport_provider',v_uid),2),0);
  if p_amount_kes>v_available then raise exception 'Requested amount exceeds your available balance of KSh %',to_char(v_available,'FM999,999,999,990.00'); end if;

  insert into public.transport_provider_settlement_requests(provider_id,settlement_account_id,requested_amount_kes,provider_note)
  values(v_uid,p_account_id,round(p_amount_kes,2),nullif(btrim(coalesce(p_note,'')),'')) returning id into v_id;

  perform private.notify_partner(v_uid,'transport','settlement_request_submitted','Settlement request submitted',
    'Your Transport Provider settlement request has been sent to LEOGO Admin for review.',
    'transport_provider_settlement_request',v_id,'transport-settlements',
    jsonb_build_object('amount_kes',round(p_amount_kes,2),'status','pending'));
  return v_id;
end $function$;

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

  v_available:=greatest(v_total-v_reserved-private.aftersales_liability_total('pickup_station',v_account.pickup_station_id),0);
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

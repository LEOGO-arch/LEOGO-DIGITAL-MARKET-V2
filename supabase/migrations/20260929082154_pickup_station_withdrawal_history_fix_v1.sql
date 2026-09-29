-- Preserve Pickup Station withdrawal history independently of current operator assignment.
alter table public.pickup_station_withdrawal_requests
  drop constraint if exists pickup_station_withdrawal_requests_partner_id_fkey;
alter table public.pickup_station_withdrawal_requests
  add constraint pickup_station_withdrawal_requests_partner_id_fkey
  foreign key (partner_id) references auth.users(id) on delete restrict;

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
    'from',p_from,'to',p_to,'parcels',v_count,'period_earnings_kes',v_period,
    'total_earnings_kes',v_total,'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total-v_reserved,0),'daily',v_daily
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

CREATE OR REPLACE FUNCTION public.pickup_partner_list_withdrawals()
 RETURNS TABLE(id uuid, requested_amount_kes numeric, payout_method text, payout_account_name text, payout_phone text, payout_account_number text, status text, partner_note text, admin_notes text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;
  return query
  select w.id,w.requested_amount_kes,w.payout_method,w.payout_account_name,w.payout_phone,
    w.payout_account_number,w.status,w.partner_note,w.admin_notes,w.submitted_at,w.reviewed_at,w.paid_at
  from public.pickup_station_withdrawal_requests w
  where w.pickup_station_id=v_station
  order by w.submitted_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_withdrawals()
 RETURNS TABLE(id uuid, pickup_station_id uuid, station_name text, partner_id uuid, partner_email text, partner_name text, requested_amount_kes numeric, payout_method text, payout_account_name text, payout_phone text, payout_account_number text, partner_note text, status text, admin_notes text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (private.is_leogo_admin('settlements.read') or private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('approvals.read')) then raise exception 'Admin access required'; end if;
  return query
  select w.id,w.pickup_station_id,s.station_name,w.partner_id,u.email::text,a.display_name,
    w.requested_amount_kes,w.payout_method,w.payout_account_name,w.payout_phone,w.payout_account_number,
    w.partner_note,w.status,w.admin_notes,w.submitted_at,w.reviewed_at,w.paid_at
  from public.pickup_station_withdrawal_requests w
  join public.pickup_stations s on s.id=w.pickup_station_id
  left join public.pickup_station_partner_accounts a on a.user_id=w.partner_id
  left join auth.users u on u.id=w.partner_id
  order by case w.status when 'pending' then 0 when 'approved' then 1 else 2 end,w.submitted_at desc;
end
$function$;

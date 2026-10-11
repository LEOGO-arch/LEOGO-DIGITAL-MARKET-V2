-- LEOGO Wallet/SACCO financial safety. Non-cash loyalty and shopping voucher
-- credits remain ONE shared reward balance. Never count them as withdrawable cash.
-- Keep existing public RPC signatures, staff approvals, PIN rules and loan terms.
-- Generated from inspected production function definitions, updated conservatively.

CREATE OR REPLACE FUNCTION public.admin_approve_wallet_withdrawal(p_withdrawal_id uuid, p_staff_user_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_request public.wallet_withdrawal_requests%rowtype;
  v_balance numeric(14,2);
  v_other_reserved numeric(14,2);
begin
  if p_staff_user_id is null then raise exception 'Staff user is required'; end if;
  select * into v_request from public.wallet_withdrawal_requests
  where id=p_withdrawal_id for update;
  if not found or v_request.request_status<>'pending_call' then
    raise exception 'Pending withdrawal request not found';
  end if;
  if v_request.contacted_at is null then
    raise exception 'Customer phone confirmation is required before approval';
  end if;
  -- Serialize cash movement with account-level reservation checks.
  perform 1 from public.wallet_accounts
  where user_id=v_request.user_id and account_status='active' for update;
  if not found then raise exception 'Wallet must be active'; end if;
  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance from public.wallet_ledger_entries
  where user_id=v_request.user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');
  select coalesce(sum(requested_amount_kes),0) into v_other_reserved
  from public.wallet_withdrawal_requests
  where user_id=v_request.user_id and request_status='pending_call' and id<>v_request.id;
  if v_balance-coalesce(v_other_reserved,0) < v_request.requested_amount_kes then
    raise exception 'Wallet balance is no longer sufficient';
  end if;
  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,withdrawal_request_id,
    external_reference,description
  ) values(
    v_request.user_id,'withdrawal','debit',v_request.requested_amount_kes,
    v_request.id,'WDR-'||upper(substr(replace(v_request.id::text,'-',''),1,10)),
    'Approved wallet withdrawal'
  );
  update public.wallet_withdrawal_requests
  set request_status='approved_processing',approved_at=now(),
      approved_by=p_staff_user_id,scheduled_completion_at=now()+interval '24 hours',
      admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes)
  where id=v_request.id;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_wallet_withdrawal_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric(14,2);
  v_reserved numeric(14,2);
begin
  if v_user_id is null or new.user_id <> v_user_id then
    raise exception 'Authentication required';
  end if;
  if new.request_status <> 'pending_call'
    or new.contacted_at is not null or new.contacted_by is not null
    or new.admin_notes is not null or new.approved_at is not null
    or new.approved_by is not null or new.scheduled_completion_at is not null
    or new.completed_at is not null or new.settlement_reference is not null then
    raise exception 'Invalid withdrawal request state';
  end if;
  if not exists (
    select 1 from public.wallet_accounts
    where user_id=v_user_id and account_status='active'
  ) then
    raise exception 'Your wallet account is not active';
  end if;
  -- Prevent concurrent withdrawal insertions from using the same free cash.
  perform 1 from public.wallet_accounts
  where user_id=v_user_id and account_status='active' for update;
  if not found then raise exception 'Wallet account is not active'; end if;
  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance from public.wallet_ledger_entries
  where user_id=v_user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');
  select coalesce(sum(requested_amount_kes),0)
  into v_reserved from public.wallet_withdrawal_requests
  where user_id=v_user_id and request_status='pending_call';
  if new.requested_amount_kes > greatest(0,v_balance-v_reserved) then
    raise exception 'Withdrawal amount exceeds your available withdrawable balance';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.submit_wallet_withdrawal(p_amount_kes numeric, p_settlement_method text, p_account_name text, p_account_number text, p_client_request_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric(14,2);
  v_reserved numeric(14,2);
  v_phone text;
  v_request_id uuid;
  v_pin_result text;
begin
  if v_user_id is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;
  if p_amount_kes is null or p_amount_kes<=0 or p_amount_kes>10000000 then
    return jsonb_build_object('success',false,'code','invalid_amount');
  end if;
  if p_settlement_method not in ('mpesa','bank','sacco','other') then
    return jsonb_build_object('success',false,'code','invalid_settlement_method');
  end if;
  if char_length(btrim(coalesce(p_account_name,''))) not between 2 and 120 then
    return jsonb_build_object('success',false,'code','invalid_account_name');
  end if;
  if char_length(btrim(coalesce(p_account_number,''))) not between 3 and 80 then
    return jsonb_build_object('success',false,'code','invalid_account_number');
  end if;
  if p_client_request_id is null then
    return jsonb_build_object('success',false,'code','request_id_required');
  end if;
  -- Share the wallet row lock used by the withdrawal insert guard.
  perform 1 from public.wallet_accounts
  where user_id=v_user_id and account_status='active' for update;
  if not found then
    return jsonb_build_object('success',false,'code','wallet_not_active');
  end if;

  v_pin_result:=private.verify_wallet_withdrawal_pin(p_pin);
  if v_pin_result<>'ok' then
    return jsonb_build_object('success',false,'code',v_pin_result);
  end if;

  select phone into v_phone from public.customer_profiles where user_id=v_user_id;
  if nullif(btrim(coalesce(v_phone,'')),'') is null then
    return jsonb_build_object('success',false,'code','profile_phone_required');
  end if;

  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance
  from public.wallet_ledger_entries
  where user_id=v_user_id
    and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');
  select coalesce(sum(requested_amount_kes),0)
  into v_reserved from public.wallet_withdrawal_requests
  where user_id=v_user_id and request_status='pending_call';

  if p_amount_kes>greatest(0,v_balance-v_reserved) then
    return jsonb_build_object('success',false,'code','insufficient_withdrawable_balance');
  end if;

  insert into public.wallet_withdrawal_requests(
    user_id,requested_amount_kes,settlement_method,account_name,
    account_number,customer_phone_snapshot,client_request_id
  ) values(
    v_user_id,round(p_amount_kes,2),p_settlement_method,btrim(p_account_name),
    btrim(p_account_number),v_phone,p_client_request_id
  )
  on conflict(user_id,client_request_id) do update
  set client_request_id=excluded.client_request_id
  returning id into v_request_id;

  return jsonb_build_object('success',true,'code','submitted','request_id',v_request_id);
end;
$function$


CREATE OR REPLACE FUNCTION private.charge_wallet_statement_download(p_statement_format text, p_consent_confirmed boolean, p_client_request_id uuid, p_statement_from date, p_statement_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_settings public.wallet_settings%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_existing public.wallet_statement_downloads%rowtype;
  v_download public.wallet_statement_downloads%rowtype;
  v_ledger public.wallet_ledger_entries%rowtype;
  v_transaction_count integer;
  v_tiers integer;
  v_fee numeric(14,2);
  v_balance numeric(14,2);
  v_reserved numeric(14,2);
begin
  if v_user_id is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;
  if p_statement_format not in ('excel','pdf') then
    return jsonb_build_object('success',false,'code','invalid_format');
  end if;
  if p_consent_confirmed is not true then
    return jsonb_build_object('success',false,'code','consent_required');
  end if;
  if p_client_request_id is null then
    return jsonb_build_object('success',false,'code','request_id_required');
  end if;
  if p_statement_from is not null and p_statement_to is not null
    and p_statement_from>p_statement_to then
    return jsonb_build_object('success',false,'code','invalid_statement_period');
  end if;

  select * into v_existing
  from public.wallet_statement_downloads
  where user_id=v_user_id and client_request_id=p_client_request_id;

  if found then
    select * into v_ledger
    from public.wallet_ledger_entries
    where statement_download_id=v_existing.id;
    return jsonb_build_object(
      'success',true,'code','already_charged',
      'download_id',v_existing.id,
      'transaction_count',v_existing.transaction_count,
      'charged_tiers',v_existing.charged_tiers,
      'fee_amount_kes',v_existing.fee_amount_kes,
      'ledger_entry',case when v_ledger.id is null then null else to_jsonb(v_ledger) end
    );
  end if;

  select * into v_account
  from public.wallet_accounts
  where user_id=v_user_id
  for update;

  if not found or v_account.account_status <> 'active' then
    return jsonb_build_object('success',false,'code','wallet_not_active');
  end if;

  select count(*)::integer into v_transaction_count
  from public.wallet_ledger_entries
  where user_id=v_user_id
    and entry_type <> 'statement_download_fee'
    and (p_statement_from is null or (created_at at time zone 'Africa/Nairobi')::date>=p_statement_from)
    and (p_statement_to is null or (created_at at time zone 'Africa/Nairobi')::date<=p_statement_to);

  if v_transaction_count=0 then
    return jsonb_build_object('success',false,'code','no_transactions');
  end if;

  select * into v_settings from public.wallet_settings where id=1;
  v_tiers := ceil(v_transaction_count::numeric/200)::integer;
  v_fee := round(v_tiers*v_settings.statement_fee_per_200_kes,2);

  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance
  from public.wallet_ledger_entries
  where user_id=v_user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');

  select coalesce(sum(requested_amount_kes),0)
  into v_reserved
  from public.wallet_withdrawal_requests
  where user_id=v_user_id and request_status='pending_call';

  if v_balance-v_reserved < v_fee then
    return jsonb_build_object(
      'success',false,'code','insufficient_statement_balance',
      'required_fee_kes',v_fee,
      'available_balance_kes',greatest(0,v_balance-v_reserved),
      'transaction_count',v_transaction_count,
      'charged_tiers',v_tiers
    );
  end if;

  insert into public.wallet_statement_downloads(
    user_id,statement_format,transaction_count,charged_tiers,
    fee_amount_kes,client_request_id,statement_from,statement_to
  ) values (
    v_user_id,p_statement_format,v_transaction_count,v_tiers,
    v_fee,p_client_request_id,p_statement_from,p_statement_to
  ) returning * into v_download;

  if v_fee>0 then
    insert into public.wallet_ledger_entries(
      user_id,entry_type,direction,amount_kes,statement_download_id,
      external_reference,description
    ) values (
      v_user_id,'statement_download_fee','debit',v_fee,v_download.id,
      'STMT-'||upper(p_statement_format)||'-'||left(v_download.id::text,8),
      upper(p_statement_format)||' wallet statement download fee'
    ) returning * into v_ledger;
  end if;

  return jsonb_build_object(
    'success',true,'code','charged',
    'download_id',v_download.id,
    'transaction_count',v_transaction_count,
    'charged_tiers',v_tiers,
    'fee_amount_kes',v_fee,
    'ledger_entry',case when v_ledger.id is null then null else to_jsonb(v_ledger) end
  );
exception
  when unique_violation then
    select * into v_existing
    from public.wallet_statement_downloads
    where user_id=v_user_id and client_request_id=p_client_request_id;
    select * into v_ledger
    from public.wallet_ledger_entries
    where statement_download_id=v_existing.id;
    return jsonb_build_object(
      'success',true,'code','already_charged',
      'download_id',v_existing.id,
      'transaction_count',v_existing.transaction_count,
      'charged_tiers',v_existing.charged_tiers,
      'fee_amount_kes',v_existing.fee_amount_kes,
      'ledger_entry',case when v_ledger.id is null then null else to_jsonb(v_ledger) end
    );
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_monthly_wallet_maintenance_fees()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_settings public.wallet_settings%rowtype;
  v_period date := date_trunc('month',(now() at time zone 'Africa/Nairobi'))::date;
  v_count integer := 0;
  v_row record;
  v_current_cash numeric(14,2);
  v_current_reserved numeric(14,2);
begin
  select * into v_settings from public.wallet_settings where id=1;
  if v_settings.maintenance_fee_kes<=0
    or v_period<v_settings.maintenance_fee_effective_from then
    return 0;
  end if;

  for v_row in
    select a.user_id,
      coalesce(sum(case when l.direction='credit' then l.amount_kes else -l.amount_kes end),0) as balance,
      coalesce((
        select sum(w.requested_amount_kes)
        from public.wallet_withdrawal_requests w
        where w.user_id=a.user_id and w.request_status='pending_call'
      ),0) as reserved
    from public.wallet_accounts a
    left join public.wallet_ledger_entries l on l.user_id=a.user_id
      and l.entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore')
    where a.account_status='active'
      and not exists(
        select 1 from public.wallet_ledger_entries x
        where x.user_id=a.user_id and x.entry_type='maintenance_fee'
          and x.maintenance_period=v_period
      )
    group by a.user_id
  loop
    -- A recent cash payment or withdrawal may have changed the precomputed
    -- totals. Recheck under the same account lock used for withdrawals.
    perform 1 from public.wallet_accounts where user_id=v_row.user_id and account_status='active' for update;
    if not found then continue; end if;
    select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
    into v_current_cash from public.wallet_ledger_entries
    where user_id=v_row.user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');
    select coalesce(sum(requested_amount_kes),0)
    into v_current_reserved from public.wallet_withdrawal_requests
    where user_id=v_row.user_id and request_status='pending_call';
    if v_current_cash-v_current_reserved>=v_settings.maintenance_fee_kes then
      insert into public.wallet_ledger_entries(
        user_id,entry_type,direction,amount_kes,maintenance_period,
        external_reference,description
      ) values(
        v_row.user_id,'maintenance_fee','debit',v_settings.maintenance_fee_kes,
        v_period,'MAINT-'||to_char(v_period,'YYYY-MM'),
        'LEOGO Wallet monthly maintenance fee'
      ) on conflict do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
  end loop;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION private.wallet_loan_eligibility(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.wallet_loan_settings%rowtype;
  v_balance numeric(14,2):=0;
  v_total_saved numeric(14,2):=0;
  v_saving_days integer:=0;
  v_max numeric(14,2):=0;
  v_wallet_active boolean:=false;
  v_has_active_loan boolean:=false;
  v_has_open_application boolean:=false;
  v_eligible boolean:=false;
begin
  select * into s from public.wallet_loan_settings where id=1;

  select exists(
    select 1 from public.wallet_accounts
    where user_id=p_user_id and account_status='active'
  ) into v_wallet_active;

  select
    coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0),
    coalesce(sum(case when direction='credit' and entry_type in ('normal_saving','challenge_saving') then amount_kes else 0 end),0),
    count(distinct (created_at at time zone 'Africa/Nairobi')::date)
      filter (where direction='credit' and entry_type in ('normal_saving','challenge_saving'))
  into v_balance,v_total_saved,v_saving_days
  from public.wallet_ledger_entries
  where user_id=p_user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');

  select exists(select 1 from public.wallet_loans where user_id=p_user_id and status in ('active','overdue'))
    into v_has_active_loan;
  select exists(select 1 from public.wallet_loan_applications where user_id=p_user_id and application_status in ('pending','under_review'))
    into v_has_open_application;

  v_max:=least(
    coalesce(s.max_loan_amount_kes,0),
    round(greatest(0,v_total_saved)*coalesce(s.loan_to_savings_ratio,0),2)
  );

  v_eligible:=
    coalesce(s.applications_enabled,false)
    and v_wallet_active
    and v_total_saved>=s.minimum_total_saved_kes
    and v_saving_days>=s.minimum_saving_days
    and v_max>0
    and not v_has_active_loan
    and not v_has_open_application;

  return jsonb_build_object(
    'eligible',v_eligible,
    'applications_enabled',coalesce(s.applications_enabled,false),
    'wallet_active',v_wallet_active,
    'wallet_balance_kes',greatest(0,v_balance),
    'total_saved_kes',greatest(0,v_total_saved),
    'saving_days',v_saving_days,
    'minimum_total_saved_kes',s.minimum_total_saved_kes,
    'minimum_saving_days',s.minimum_saving_days,
    'max_eligible_amount_kes',greatest(0,v_max),
    'max_loan_amount_kes',s.max_loan_amount_kes,
    'loan_to_savings_ratio',s.loan_to_savings_ratio,
    'interest_percent',s.interest_percent,
    'processing_fee_percent',s.processing_fee_percent,
    'default_term_days',s.default_term_days,
    'grace_days',s.grace_days,
    'overdue_penalty_percent',s.overdue_penalty_percent,
    'allow_partial_repayment',s.allow_partial_repayment,
    'has_active_loan',v_has_active_loan,
    'has_open_application',v_has_open_application
  );
end
$function$


CREATE OR REPLACE FUNCTION private.set_wallet_loan_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.application_status := 'pending';
  new.confirmed_balance_at_application := 0;
  new.total_saved_at_application := 0;
  new.confirmed_saving_days_at_application := 0;
  new.submitted_at := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.partner_notes := null;

  select
    coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0),
    coalesce(sum(case when direction='credit' and entry_type in ('normal_saving','challenge_saving') then amount_kes else 0 end),0)
  into new.confirmed_balance_at_application, new.total_saved_at_application
  from public.wallet_ledger_entries
  where user_id = new.user_id and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');

  select count(distinct challenge_date)::integer
  into new.confirmed_saving_days_at_application
  from public.wallet_deposit_requests
  where user_id = new.user_id
    and deposit_kind = 'daily_challenge'
    and request_status = 'confirmed';

  return new;
end;
$function$


-- A 24-hour SLA is an operational target, NOT evidence that a payout completed.
-- Keep cron compatible but stop it from marking withdrawals completed by elapsed time.
create or replace function public.complete_due_wallet_withdrawals()
returns integer language plpgsql set search_path='' as $function$
begin
  -- Historical cron may still invoke this. Completion requires verified payout.
  return 0;
end;
$function$;
revoke all on function public.complete_due_wallet_withdrawals() from public,anon,authenticated;

-- One verified external payout reference per completed withdrawal; no automatic settlement.
create unique index if not exists wallet_completed_payout_reference_unique
on public.wallet_withdrawal_requests (lower(btrim(settlement_reference)))
where settlement_reference is not null and btrim(settlement_reference) <> '' and request_status='completed';

create or replace function public.admin_complete_wallet_withdrawal(
  p_withdrawal_id uuid, p_settlement_reference text, p_transfer_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_row public.wallet_withdrawal_requests%rowtype;
  v_reference text := upper(btrim(coalesce(p_settlement_reference,'')));
  v_before jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Authorized Admin withdrawal settlement permission required';
  end if;
  if p_transfer_confirmed is not true then
    raise exception 'Confirm the external payout was actually completed';
  end if;
  if length(v_reference)<6 or length(v_reference)>120 then
    raise exception 'Enter the actual payout transaction reference (6–120 characters)';
  end if;
  select * into v_row from public.wallet_withdrawal_requests
  where id=p_withdrawal_id for update;
  if not found or v_row.request_status<>'approved_processing' then
    raise exception 'Only approved withdrawals awaiting settlement can be completed';
  end if;
  if v_row.approved_at is null or v_row.approved_by is null then
    raise exception 'Admin approval is required before payout confirmation';
  end if;
  v_before:=to_jsonb(v_row);
  update public.wallet_withdrawal_requests
  set request_status='completed',completed_at=now(),
      settlement_reference=v_reference
  where id=v_row.id;
  perform private.write_admin_audit(
    'wallet.withdrawal.payout_confirmed','wallet_withdrawal',v_row.id::text,
    v_before,
    (select to_jsonb(w) from public.wallet_withdrawal_requests w where w.id=v_row.id),
    jsonb_build_object('settlement_reference',v_reference)
  );
  return jsonb_build_object('success',true,'status','completed','withdrawal_id',v_row.id);
end;
$function$;
revoke all on function public.admin_complete_wallet_withdrawal(uuid,text,boolean) from public,anon;
grant execute on function public.admin_complete_wallet_withdrawal(uuid,text,boolean) to authenticated;

-- Read-only admin queue, never expose payout destination/account credentials to browser.
create or replace function public.admin_list_wallet_pending_payout_confirmations()
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_out jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Wallet settlement approval permission required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',w.id,'amount_kes',w.requested_amount_kes,
    'submitted_at',w.submitted_at,'approved_at',w.approved_at,
    'scheduled_completion_at',w.scheduled_completion_at,
    'settlement_method',w.settlement_method,
    'customer_name',coalesce(cp.full_name,'Customer'),
    'customer_phone',w.customer_phone_snapshot,
    'account_name',w.account_name,'account_number',w.account_number,
    'status',w.request_status
  ) order by w.approved_at),'[]'::jsonb) into v_out
  from public.wallet_withdrawal_requests w
  left join public.customer_profiles cp on cp.user_id=w.user_id
  where w.request_status='approved_processing';
  return v_out;
end;
$function$;
revoke all on function public.admin_list_wallet_pending_payout_confirmations() from public,anon;
grant execute on function public.admin_list_wallet_pending_payout_confirmations() to authenticated;

comment on function public.complete_due_wallet_withdrawals() is
  'Deprecated clock-driven completion: no-op. Use authorized Admin payout confirmation with external transfer reference.';

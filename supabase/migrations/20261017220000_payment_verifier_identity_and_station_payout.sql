-- Follow-up safeguards for payout confirmations and authenticated verifier identity.
-- The base payment-notification migration is applied first.
do $migration$
declare
  v_wallet text;
  v_pickup text;
  v_anchor text := E'\nbegin\n';
begin
  if to_regprocedure('public.review_wallet_deposit(uuid,boolean,text,uuid)') is not null then
    select pg_get_functiondef('public.review_wallet_deposit(uuid,boolean,text,uuid)'::regprocedure)
      into v_wallet;
    if position('Wallet deposit review permission required' in v_wallet)=0 then
      if position(v_anchor in v_wallet)=0 then raise exception 'Wallet deposit verifier body has changed'; end if;
      v_wallet := replace(v_wallet,v_anchor,v_anchor||
        '  if not private.is_leogo_admin(''approvals.manage'') then raise exception ''Wallet deposit review permission required''; end if;'||E'\n');
      -- Caller-provided reviewer IDs may not impersonate another staff account.
      v_wallet := replace(v_wallet, 'reviewed_by = p_reviewed_by,', 'reviewed_by = (select auth.uid()),');
      execute v_wallet;
    end if;
  end if;

  if to_regprocedure('public.admin_review_pickup_station_withdrawal(uuid,text,text)') is not null then
    select pg_get_functiondef('public.admin_review_pickup_station_withdrawal(uuid,text,text)'::regprocedure)
      into v_pickup;
    if position('private.require_payment_notice(' in v_pickup)=0 then
      if position(v_anchor in v_pickup)=0 then raise exception 'Pickup Station verifier body has changed'; end if;
      v_pickup := replace(v_pickup,v_anchor,v_anchor||
        '  if p_decision=''paid'' then perform private.require_payment_notice(''pickup_station_withdrawal_paid'',p_withdrawal_id,p_notes); end if;'||E'\n');
      execute v_pickup;
    end if;
  end if;
end
$migration$;

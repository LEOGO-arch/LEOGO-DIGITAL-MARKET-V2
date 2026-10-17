-- Pickup Station payouts share the same station's earnings pot even when
-- multiple partner accounts operate there. Serialize every request and decision.
do $patch$
declare
  v_def text;
  v_sign text;
  v_pos integer;
  v_guard text;
begin
  for v_sign in select unnest(array[
    'public.pickup_partner_request_withdrawal(numeric,text)',
    'public.admin_review_pickup_station_withdrawal(uuid,text,text)'
  ])
  loop
    select pg_get_functiondef(to_regprocedure(v_sign)) into v_def;
    if v_def is null then raise exception 'Missing Pickup Station withdrawal workflow: %',v_sign; end if;
    if position('LEOGO-PICKUP-PAYOUT-LOCK-V1' in v_def)>0 then continue; end if;
    if v_sign like '%pickup_partner_request_%' then
      v_guard := E'\n  -- LEOGO-PICKUP-PAYOUT-LOCK-V1: shared station lock across all partners\n'||
        '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('||
        '''LEOGO-PICKUP-PAYOUT:''||v_account.pickup_station_id::text,0));';
      v_pos:=position('  if p_amount_kes is null' in v_def);
    else
      v_guard:=E'\n  -- LEOGO-PICKUP-PAYOUT-LOCK-V1: serialize approval and payout with requests\n'||
        '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('||
        '''LEOGO-PICKUP-PAYOUT:''||(select pickup_station_id from public.pickup_station_withdrawal_requests where id=p_withdrawal_id)::text,0));';
      v_pos:=position(E'  if p_decision in (''approve'',''paid'') then' in v_def);
    end if;
    if v_pos=0 then raise exception 'Pickup Station payout body changed: %',v_sign; end if;
    v_def:=overlay(v_def placing v_guard||E'\n' from v_pos for 0);
    execute v_def;
  end loop;
end
$patch$;

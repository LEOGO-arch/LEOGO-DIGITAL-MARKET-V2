-- Prevent concurrent settlement requests and payouts from using the same
-- partner balance, without changing existing earnings or order workflows.
-- All callers of a given partner's available balance share one advisory xact lock.
do $patch$
declare
  v record;
  v_def text;
  v_pos integer;
  v_lock text;
  v_key text;
  v_owner text;
  v_existing text := 'LEOGO-SETTLEMENT-LOCK-V1';
begin
  for v in
    select * from (values
      ('public.seller_request_settlement(uuid,numeric,text)', 'seller','v_uid'),
      ('public.service_provider_request_settlement(uuid,numeric,text)', 'service_provider','v_uid'),
      ('public.transport_provider_request_settlement(uuid,numeric,text)', 'transport_provider','v_uid'),
      ('public.admin_record_seller_settlement(uuid,uuid,numeric,text,text)', 'seller','p_seller_id'),
      ('public.admin_record_service_provider_settlement(uuid,uuid,numeric,text,text)', 'service_provider','p_provider_id'),
      ('public.admin_record_transport_provider_settlement(uuid,uuid,numeric,text,text)', 'transport_provider','p_provider_id'),
      ('public.admin_pay_seller_settlement_request(uuid,text,text)', 'seller','(select seller_id from public.seller_settlement_requests where id=p_request_id)'),
      ('public.admin_pay_service_provider_settlement_request(uuid,text,text)', 'service_provider','(select provider_id from public.service_provider_settlement_requests where id=p_request_id)'),
      ('public.admin_pay_transport_provider_settlement_request(uuid,text,text)', 'transport_provider','(select provider_id from public.transport_provider_settlement_requests where id=p_request_id)')
    ) x(signature,kind,uid_expr)
  loop
    if to_regprocedure(v.signature) is null then
      raise exception 'Settlement function missing: %', v.signature;
    end if;
    select pg_get_functiondef(to_regprocedure(v.signature)) into v_def;
    if position(v_existing in v_def)>0 then continue; end if;
    v_pos:=position(E'\nbegin\n' in v_def);
    if v_pos=0 then raise exception 'Unexpected settlement function layout: %', v.signature; end if;
    v_lock:=E'\n  -- '||v_existing||
      E': serialize requests and payouts for the same partner\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('||
      quote_literal('LEOGO-SETTLEMENT:'||v.kind||':')||
      '||('||v.uid_expr||')::text,0));';
    v_def:=overlay(v_def placing v_lock from v_pos+length(E'\nbegin\n') for 0);
    if v.kind='transport_provider' and v.signature like 'public.admin_record_%' then
      if position('  if p_amount_kes>v_available then' in v_def)=0 then
        raise exception 'Transport available balance check changed, inspect before release';
      end if;
      v_def:=replace(v_def,
        '  if p_amount_kes>v_available then',
        '  v_available:=greatest(v_available-private.aftersales_liability_total(''transport_provider'',p_provider_id),0);'||E'\n'||
        '  if p_amount_kes>v_available then');
    end if;
    execute v_def;
  end loop;
end
$patch$;

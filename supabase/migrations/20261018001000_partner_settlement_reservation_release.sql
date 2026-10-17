-- Preserve existing approved-account, amount, and permission checks.
-- Seller and Service Provider payout requests are already included in
-- private.partner_available_balance pending-reservation deductions.
-- Inside the same locked, atomic transaction temporarily close only the
-- request being paid BEFORE recording its settlement. A failure rolls back
-- both changes, so there is no paid request without a settlement.
do $patch$
declare
  v_spec record;
  v_def text;
  v_anchor text;
begin
  for v_spec in
    select * from (values
      ('public.admin_pay_seller_settlement_request(uuid,text,text)',
       'public.seller_settlement_requests',
       'v_settlement_id:=public.admin_record_seller_settlement('),
      ('public.admin_pay_service_provider_settlement_request(uuid,text,text)',
       'public.service_provider_settlement_requests',
       'v_settlement_id:=public.admin_record_service_provider_settlement(')
    ) a(signature,request_table,call_anchor)
  loop
    select pg_get_functiondef(to_regprocedure(v_spec.signature)) into v_def;
    if v_def is null then
      raise notice 'Settlement request function absent in this environment: %',v_spec.signature;
      continue;
    end if;
    if position('release request reservation within the locked transaction' in v_def)>0 then continue; end if;
    if position(v_spec.call_anchor in v_def)=0 or
       position('for update' in lower(v_def))=0 or
       position('settlement request is already closed' in lower(v_def))=0 then
       raise exception 'Settlement payout implementation changed: %',v_spec.signature;
    end if;
    v_anchor:='  '||v_spec.call_anchor;
    if position(v_anchor in v_def)=0 then
      raise exception 'Settlement call anchor not found: %',v_spec.signature;
    end if;
    v_def:=replace(v_def,v_anchor,
      '  -- release request reservation within the locked transaction; rollback restores it if payout fails'||E'\n'||
      '  update '||v_spec.request_table||E'\n'||
      '  set status=''paid'' where id=p_request_id;'||E'\n\n'||
      v_anchor);
    execute v_def;
  end loop;
end
$patch$;
-- Close anonymous grants left by the staging snapshot and check verifier permission
-- before recording payment-notification evidence.
do $migration$
declare
  v record;
  v_def text;
  v_marker text := $needle$  if v_user is null then
    raise exception 'Sign in as the authorized payment verifier';
  end if;
$needle$;
  v_guard text := $guard$  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment evidence verification permission required';
  end if;
$guard$;
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.proname in (
      'admin_customer_site_traffic',
      'admin_get_cod_delivery_fee_status',
      'admin_list_cod_delivery_fee_queue',
      'admin_review_cod_delivery_fee'
    );

  if v_count <> 4 then
    raise exception 'Expected four reviewed COD admin RPCs; found %', v_count;
  end if;

  for v in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and p.proname in (
        'admin_customer_site_traffic',
        'admin_get_cod_delivery_fee_status',
        'admin_list_cod_delivery_fee_queue',
        'admin_review_cod_delivery_fee'
      )
  loop
    execute format('revoke execute on function %s from public, anon',v.signature);
    execute format('grant execute on function %s to authenticated',v.signature);
  end loop;

  v_def:=pg_get_functiondef('private.require_payment_notice(text,uuid,text)'::regprocedure);
  if position('Payment evidence verification permission required' in v_def)=0 then
    if position(v_marker in v_def)=0 then
      raise exception 'Payment verification helper changed; inspect before hardening';
    end if;
    v_def:=replace(v_def,v_marker,v_marker||v_guard);
    execute v_def;
  end if;
end
$migration$;

-- Require admin payment-verification permission before writing evidence.
-- Callers keep their own permission checks; this protects shared evidence from
-- unauthorised calls that reach the helper before the caller's guard.
do $migration$
declare
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
begin
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

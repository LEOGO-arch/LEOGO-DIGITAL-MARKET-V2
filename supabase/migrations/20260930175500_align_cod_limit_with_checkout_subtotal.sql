-- Preserve the established checkout rule: COD eligibility is based on the
-- items subtotal, matching the Customer Front's existing behaviour.
do $block$
declare
  v_def text;
  v_old text := 'if p_payment_method=''cod'' and v_total>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then';
  v_new text := 'if p_payment_method=''cod'' and v_subtotal>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then';
begin
  select pg_get_functiondef(
    'public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure
  ) into v_def;
  if position(v_old in v_def)=0 then
    raise exception 'COD settings anchor was not found';
  end if;
  execute replace(v_def,v_old,v_new);
end
$block$;

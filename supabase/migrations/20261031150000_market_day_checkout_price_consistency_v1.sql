-- Any late quota change must abort the entire transaction rather than allow
-- order totals and immutable seller lines to disagree (e.g. duplicate cart lines).
do $patch$
declare v_def text;
  v_old text:='  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes)';
  v_new text:='  if abs(coalesce((select sum(i.line_total_kes) from public.marketplace_order_items i'||chr(10)||
    '    where i.order_id=v_order_id),0)-v_subtotal)>0.01 then'||chr(10)||
    '    raise exception ''Market Day price changed during checkout. Please retry your order.'';'||chr(10)||
    '  end if;'||chr(10)||chr(10)||v_old;
begin
  select pg_get_functiondef('public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 then raise exception 'Seller-order settlement anchor not found'; end if;
  execute replace(v_def,v_old,v_new);
end $patch$;

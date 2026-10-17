-- Expose rejected order's saved Admin note to that order's customer.
do $migration$
declare
  v_def text;
  v_anchor text := $anchor$      'order_reference',o.order_reference,$anchor$;
  v_replacement text := $replacement$      'order_payment_status',o.payment_status,
      'payment_rejection_note',case when o.payment_status='rejected' then (
        select nullif(btrim(n.metadata->>'notes'),'')
        from public.customer_notifications n
        where n.user_id=r.customer_id
          and n.source_type='marketplace_order'
          and n.source_id=r.marketplace_order_id
          and n.event_key='order_payment_rejected'
        order by n.created_at desc
        limit 1
      ) else null end,
      'order_reference',o.order_reference,$replacement$;
begin
  select pg_get_functiondef('public.customer_list_assisted_shopping_requests()'::regprocedure) into v_def;
  if position('payment_rejection_note' in v_def)>0 then return; end if;
  if position(v_anchor in v_def)=0 then raise exception 'Assisted shopping customer request list anchor not found'; end if;
  execute replace(v_def,v_anchor,v_replacement);
end
$migration$;
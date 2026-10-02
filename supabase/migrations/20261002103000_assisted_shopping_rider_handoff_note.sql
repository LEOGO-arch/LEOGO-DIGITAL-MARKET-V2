-- Rider handoff clarity for Assisted Shopping orders.
-- The existing Rider workflow remains unchanged; its admin_notes field now
-- explicitly tells the Rider that LEOGO prepared this order internally.

do $block$
declare
  v_def text;
  v_old text := $old$
  update public.marketplace_orders
  set order_status='processing',updated_at=now()
  where id=r.marketplace_order_id and order_status='placed';

  insert into public.assisted_shopping_events(
$old$;
  v_new text := $new$
  update public.marketplace_orders
  set order_status='processing',updated_at=now()
  where id=r.marketplace_order_id and order_status='placed';

  update public.marketplace_delivery_jobs
  set admin_notes=coalesce(
        nullif(btrim(coalesce(p_note,'')),''),
        'ASSISTED SHOPPING — Order prepared internally by LEOGO. No Seller pickup is required; collect the prepared order from the LEOGO internal preparation / dispatch point.'
      ),
      updated_at=now()
  where order_id=r.marketplace_order_id;

  insert into public.assisted_shopping_events(
$new$;
begin
  select pg_get_functiondef(
    'public.admin_mark_assisted_shopping_ready(uuid,text)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Assisted Shopping Rider handoff anchor was not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;

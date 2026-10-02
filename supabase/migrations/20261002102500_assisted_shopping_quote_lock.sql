-- Assisted Shopping V1 hardening:
-- once the customer accepts a quotation and a fulfilment order exists, Admin
-- must not rebuild that quotation because its payment/order totals are already
-- snapshotted. Payment rejection is handled by customer payment resubmission.

do $block$
declare
  v_def text;
  v_old text := $old$
  if r.status in ('payment_submitted','preparing','ready_for_dispatch','assigned','picked_up','at_sorting_center','on_the_way','at_pickup_station','ready_for_pickup','completed','cancelled') then
    raise exception 'This Shopping List can no longer be re-quoted';
  end if;
$old$;
  v_new text := $new$
  if r.marketplace_order_id is not null then
    raise exception 'Customer already accepted this Shopping List quotation. Use payment verification, payment resubmission, fulfilment or controlled cancellation instead.';
  end if;

  if r.status in ('payment_submitted','payment_rejected','preparing','ready_for_dispatch','assigned','picked_up','at_sorting_center','on_the_way','at_pickup_station','ready_for_pickup','completed','cancelled') then
    raise exception 'This Shopping List can no longer be re-quoted';
  end if;
$new$;
begin
  select pg_get_functiondef(
    'public.admin_prepare_assisted_shopping_quote(uuid,jsonb,text)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Assisted Shopping quote-lock anchor was not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;

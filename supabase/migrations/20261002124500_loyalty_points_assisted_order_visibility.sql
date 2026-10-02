-- LEOGO Loyalty & Rewards V2.1
-- Extend points redemption to Assisted Shopping and expose point/payment split
-- in customer/admin order detail without changing the locked order workflow.

create or replace function public.customer_accept_assisted_shopping_quote_v2(
  p_request_id uuid,
  p_payment_method text,
  p_payment_reference text default null,
  p_use_reward_points boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_order_id uuid;
  v_order public.marketplace_orders%rowtype;
  v_reference_for_base text;
begin
  if p_payment_method not in ('till','paybill','cod') then
    raise exception 'Choose Till, Paybill or Cash on Delivery';
  end if;

  v_reference_for_base:=p_payment_reference;
  if coalesce(p_use_reward_points,false)
     and p_payment_method in ('till','paybill')
     and char_length(btrim(coalesce(v_reference_for_base,'')))<3 then
    -- Temporary internal placeholder. If points do not cover the full order,
    -- this transaction is rejected below and rolls back completely.
    v_reference_for_base:='LEOGO-POINTS-PENDING';
  end if;

  v_base:=public.customer_accept_assisted_shopping_quote(
    p_request_id,
    p_payment_method,
    v_reference_for_base
  );

  v_order_id:=(v_base->>'marketplace_order_id')::uuid;

  perform private.apply_reward_points_to_marketplace_order(
    v_order_id,
    coalesce(p_use_reward_points,false)
  );

  select * into v_order
  from public.marketplace_orders
  where id=v_order_id
  for update;

  if v_order.external_amount_due_kes>0
     and p_payment_method in ('till','paybill')
     and char_length(btrim(coalesce(p_payment_reference,'')))<3 then
    raise exception 'Your LEOGO Points do not cover the full Assisted Shopping order. Enter the payment reference for the remaining KSh %',
      v_order.external_amount_due_kes;
  end if;

  update public.assisted_shopping_requests
  set payment_method=v_order.payment_method,
      payment_reference=case
        when v_order.payment_method='points' then null
        when p_payment_method='cod' then null
        else nullif(btrim(coalesce(p_payment_reference,'')),'')
      end,
      payment_status=v_order.payment_status,
      status=case
        when v_order.payment_status='verified_paid' then 'preparing'
        when p_payment_method='cod' then 'preparing'
        else status
      end,
      updated_at=now()
  where id=p_request_id
    and customer_id=(select auth.uid());

  return v_base || jsonb_build_object(
    'reward_points_redeemed_kes',v_order.reward_points_redeemed_kes,
    'external_amount_due_kes',v_order.external_amount_due_kes,
    'payment_method',v_order.payment_method,
    'payment_status',v_order.payment_status,
    'status',case
      when v_order.payment_status='verified_paid' then 'preparing'
      else v_base->>'status'
    end
  );
end
$function$;

revoke execute on function public.customer_accept_assisted_shopping_quote_v2(uuid,text,text,boolean)
  from public,anon;
grant execute on function public.customer_accept_assisted_shopping_quote_v2(uuid,text,text,boolean)
  to authenticated;

-- Customer order history V3 adds the point split while keeping V2 available
-- for cached clients.
do $block$
declare
  v_def text;
  v_new text;
  v_sig_old text := 'CREATE OR REPLACE FUNCTION public.customer_list_marketplace_orders_v2()';
  v_sig_new text := 'CREATE OR REPLACE FUNCTION public.customer_list_marketplace_orders_v3()';
  v_return_old text := 'delivery_fee_kes numeric, grand_total_kes numeric, payment_method text';
  v_return_new text := 'delivery_fee_kes numeric, grand_total_kes numeric, reward_points_redeemed_kes numeric, external_amount_due_kes numeric, payment_method text';
  v_select_old text := 'o.items_subtotal_kes,o.service_fee_kes,o.pickup_fee_kes,o.delivery_fee_kes,o.grand_total_kes,
    o.payment_method';
  v_select_new text := 'o.items_subtotal_kes,o.service_fee_kes,o.pickup_fee_kes,o.delivery_fee_kes,o.grand_total_kes,
    o.reward_points_redeemed_kes,o.external_amount_due_kes,o.payment_method';
begin
  select pg_get_functiondef(
    'public.customer_list_marketplace_orders_v2()'::regprocedure
  ) into v_def;

  if position(v_sig_old in v_def)=0
     or position(v_return_old in v_def)=0
     or position(v_select_old in v_def)=0 then
    raise exception 'Customer order V2 anchors not found';
  end if;

  v_new:=replace(v_def,v_sig_old,v_sig_new);
  v_new:=replace(v_new,v_return_old,v_return_new);
  v_new:=replace(v_new,v_select_old,v_select_new);
  execute v_new;
end
$block$;

revoke execute on function public.customer_list_marketplace_orders_v3() from public,anon;
grant execute on function public.customer_list_marketplace_orders_v3() to authenticated;

-- Add points/payment split to the existing Admin order detail JSON.
do $block$
declare
  v_def text;
  v_old text := $old$
      'delivery_fee_kes',o.delivery_fee_kes,'grand_total_kes',o.grand_total_kes,'payment_method',o.payment_method,
$old$;
  v_new text := $new$
      'delivery_fee_kes',o.delivery_fee_kes,'grand_total_kes',o.grand_total_kes,
      'reward_points_redeemed_kes',o.reward_points_redeemed_kes,
      'external_amount_due_kes',o.external_amount_due_kes,
      'payment_method',o.payment_method,
$new$;
begin
  select pg_get_functiondef(
    'public.admin_get_marketplace_order_detail(uuid)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Admin order detail points anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;

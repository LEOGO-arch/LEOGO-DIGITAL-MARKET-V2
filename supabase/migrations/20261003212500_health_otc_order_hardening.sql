-- Live hardening patch for Health OTC order V2.
-- Prevent partner-side cancellation without inventory restoration and allow authorized payment-verification staff.

create or replace function public.health_medicine_update_order_status(p_order_id uuid,p_status text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_order public.health_medicine_orders%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_status not in ('accepted','preparing','ready_for_handover','handed_to_leogo') then
    raise exception 'Unsupported Health order status';
  end if;

  select * into v_order
  from public.health_medicine_orders
  where id=p_order_id and provider_id=v_uid
  for update;
  if not found then raise exception 'Health order not found'; end if;

  if v_order.payment_status not in ('verified_paid','cod_due','cod_paid') then
    raise exception 'Wait for LEOGO payment verification before preparing this Health order';
  end if;
  if v_order.order_status in ('delivered','cancelled') then raise exception 'This Health order is already closed'; end if;

  if p_status='accepted' and v_order.order_status<>'placed' then raise exception 'Only a placed order can be accepted'; end if;
  if p_status='preparing' and v_order.order_status not in ('accepted','preparing') then raise exception 'Accept the order before preparing it'; end if;
  if p_status='ready_for_handover' and v_order.order_status not in ('accepted','preparing','ready_for_handover') then raise exception 'Prepare the order before marking it ready'; end if;
  if p_status='handed_to_leogo' and v_order.order_status<>'ready_for_handover' then raise exception 'Mark the order ready before handing it to LEOGO'; end if;

  update public.health_medicine_orders set
    order_status=p_status,
    provider_received_at=case when p_status='accepted' then coalesce(provider_received_at,now()) else provider_received_at end,
    preparing_at=case when p_status='preparing' then coalesce(preparing_at,now()) else preparing_at end,
    ready_for_handover_at=case when p_status='ready_for_handover' then coalesce(ready_for_handover_at,now()) else ready_for_handover_at end,
    handed_to_leogo_at=case when p_status='handed_to_leogo' then coalesce(handed_to_leogo_at,now()) else handed_to_leogo_at end,
    updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,'order','Health order update',
    'Health & Medicine order '||v_order.order_reference||' is now '||replace(p_status,'_',' ')||'.',
    'health_medicine_order',v_order.id,'health_order_status_'||p_status||'_'||v_order.id::text,'orders',
    jsonb_build_object('order_reference',v_order.order_reference,'order_status',p_status)
  );

  return jsonb_build_object('ok',true,'order_status',p_status);
end;
$$;

revoke all on function public.health_medicine_update_order_status(uuid,text) from public,anon;
grant execute on function public.health_medicine_update_order_status(uuid,text) to authenticated;

create or replace function public.admin_review_health_medicine_order_payment(
  p_order_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.health_medicine_orders%rowtype;
  v_status text;
begin
  if not private.is_leogo_admin('approvals.manage')
     and not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Payment verification permission required';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;

  select * into v_order from public.health_medicine_orders where id=p_order_id for update;
  if not found then raise exception 'Health order not found'; end if;
  if v_order.payment_status<>'submitted' then raise exception 'This Health order payment is no longer awaiting verification'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a clear rejection reason';
  end if;

  v_status:=case when p_decision='verify' then 'verified_paid' else 'rejected' end;
  update public.health_medicine_orders set
    payment_status=v_status,
    payment_verified_at=case when p_decision='verify' then now() else null end,
    payment_verified_by=case when p_decision='verify' then auth.uid() else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_order_id;

  perform private.notify_partner(
    v_order.provider_id,'health_medicine','health_order_payment_'||v_status,
    case when p_decision='verify' then 'Health order payment verified' else 'Health order payment rejected' end,
    'Payment for Health & Medicine order '||v_order.order_reference||
      case when p_decision='verify' then ' is verified. You can accept and prepare the order.'
      else ' was not verified. Wait for LEOGO guidance before preparing the order.' end,
    'health_medicine_order',v_order.id,'health-orders',
    jsonb_build_object('order_reference',v_order.order_reference,'payment_status',v_status)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,'payment',
    case when p_decision='verify' then 'Health order payment verified' else 'Health order payment needs attention' end,
    'Payment for Health & Medicine order '||v_order.order_reference||
      case when p_decision='verify' then ' has been verified.'
      else ' could not be verified. Contact LEOGO Customer Care.' end,
    'health_medicine_order',v_order.id,'health_order_payment_'||v_status||'_'||v_order.id::text,'orders',
    jsonb_build_object('order_reference',v_order.order_reference,'payment_status',v_status)
  );

  perform private.write_admin_audit(
    'health_medicine.order_payment.'||p_decision,'health_medicine_order',p_order_id::text,
    to_jsonb(v_order),
    (select to_jsonb(o) from public.health_medicine_orders o where o.id=p_order_id),
    jsonb_build_object('notes',p_notes)
  );

  return jsonb_build_object('ok',true,'payment_status',v_status);
end;
$$;

revoke all on function public.admin_review_health_medicine_order_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_medicine_order_payment(uuid,text,text) to authenticated;

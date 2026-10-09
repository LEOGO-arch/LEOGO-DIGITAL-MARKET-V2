-- Health & Medicine COD delivery-fee verification hold.
-- COD balance remains due at handover; only the transport/delivery fee is verified here.

alter table public.health_medicine_orders
  add column if not exists cod_delivery_fee_status text not null default 'not_required',
  add column if not exists cod_delivery_fee_reference text,
  add column if not exists cod_delivery_fee_submitted_at timestamptz,
  add column if not exists cod_delivery_fee_reviewed_at timestamptz,
  add column if not exists cod_delivery_fee_reviewed_by uuid,
  add column if not exists cod_delivery_fee_review_notes text;

alter table public.health_medicine_orders
  drop constraint if exists health_medicine_orders_cod_fee_status_check;
alter table public.health_medicine_orders
  add constraint health_medicine_orders_cod_fee_status_check
  check (cod_delivery_fee_status in ('not_required','awaiting_payment','submitted','verified','rejected'));

create unique index if not exists health_medicine_orders_cod_delivery_fee_reference_unique
  on public.health_medicine_orders (lower(btrim(cod_delivery_fee_reference)))
  where cod_delivery_fee_reference is not null and btrim(cod_delivery_fee_reference) <> '';

create or replace function private.health_cod_fee_status_on_new_order()
returns trigger
language plpgsql
set search_path=''
as $fn$
begin
  if new.payment_method='cod' and coalesce(new.delivery_fee_kes,0)>0 then
    if length(btrim(coalesce(new.payment_message,'')))>=8 then
      new.cod_delivery_fee_status:='submitted';
      new.cod_delivery_fee_reference:=btrim(new.payment_message);
      new.cod_delivery_fee_submitted_at:=now();
    else
      new.cod_delivery_fee_status:='awaiting_payment';
      new.cod_delivery_fee_reference:=null;
      new.cod_delivery_fee_submitted_at:=null;
    end if;
  else
    new.cod_delivery_fee_status:='not_required';
  end if;
  return new;
end;
$fn$;

drop trigger if exists health_cod_fee_new_order on public.health_medicine_orders;
create trigger health_cod_fee_new_order
before insert on public.health_medicine_orders
for each row execute function private.health_cod_fee_status_on_new_order();

create or replace function public.admin_review_health_cod_delivery_fee(
  p_order_id uuid,
  p_verified boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_order public.health_medicine_orders%rowtype;
  v_next text;
  v_notes text:=btrim(coalesce(p_notes,''));
begin
  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment verification permission required';
  end if;

  select * into v_order
  from public.health_medicine_orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Health order not found'; end if;
  if v_order.payment_method<>'cod' or coalesce(v_order.delivery_fee_kes,0)<=0 then
    raise exception 'This Health order has no COD delivery-fee payment to review';
  end if;
  if v_order.cod_delivery_fee_status='verified' and p_verified then
    return jsonb_build_object('success',true,'status','verified','already_verified',true);
  end if;
  if v_order.cod_delivery_fee_status<>'submitted'
     or nullif(btrim(coalesce(v_order.cod_delivery_fee_reference,'')),'') is null then
    raise exception 'Customer must submit a COD delivery-fee payment reference first';
  end if;
  if not p_verified and length(v_notes)<3 then
    raise exception 'Provide a reason for rejecting the delivery-fee payment';
  end if;

  v_next:=case when p_verified then 'verified' else 'rejected' end;

  update public.health_medicine_orders
  set cod_delivery_fee_status=v_next,
      cod_delivery_fee_reviewed_by=(select auth.uid()),
      cod_delivery_fee_reviewed_at=now(),
      cod_delivery_fee_review_notes=nullif(v_notes,''),
      updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,
    'payment',
    case when p_verified then 'Health COD delivery fee verified' else 'Health COD delivery fee needs attention' end,
    case when p_verified
      then 'The delivery fee for Health & Medicine order '||v_order.order_reference||' has been verified. The remaining COD amount is collected at handover.'
      else 'The delivery-fee payment for Health & Medicine order '||v_order.order_reference||' could not be verified. Contact LEOGO Customer Care before dispatch.'
    end,
    'health_medicine_order',
    v_order.id,
    'health_cod_delivery_fee_'||case when p_verified then 'verified' else 'rejected' end||'_'||v_order.id::text,
    'orders',
    jsonb_build_object(
      'order_reference',v_order.order_reference,
      'cod_delivery_fee_status',v_next,
      'delivery_fee_kes',v_order.delivery_fee_kes
    )
  )
  on conflict do nothing;

  perform private.notify_partner(
    v_order.provider_id,
    'health_medicine',
    'health_cod_delivery_fee_'||v_next,
    case when p_verified then 'COD delivery fee verified' else 'COD delivery fee rejected' end,
    case when p_verified
      then 'LEOGO verified the delivery fee for Health order '||v_order.order_reference||'. You may hand it to LEOGO when ready.'
      else 'The delivery-fee proof for Health order '||v_order.order_reference||' was rejected. Do not hand the order to LEOGO until the fee is verified.'
    end,
    'health_medicine_order',
    v_order.id,
    'health-orders',
    jsonb_build_object(
      'order_reference',v_order.order_reference,
      'cod_delivery_fee_status',v_next,
      'delivery_fee_kes',v_order.delivery_fee_kes
    )
  );

  perform private.write_admin_audit(
    case when p_verified then 'health_medicine.cod_delivery_fee.verified' else 'health_medicine.cod_delivery_fee.rejected' end,
    'health_medicine_order',
    p_order_id::text,
    jsonb_build_object('cod_delivery_fee_status',v_order.cod_delivery_fee_status),
    jsonb_build_object('cod_delivery_fee_status',v_next),
    jsonb_build_object('delivery_fee_kes',v_order.delivery_fee_kes,'notes',v_notes)
  );

  return jsonb_build_object(
    'success',true,
    'status',v_next,
    'order_id',p_order_id
  );
end;
$fn$;

revoke all on function public.admin_review_health_cod_delivery_fee(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_health_cod_delivery_fee(uuid,boolean,text) to authenticated;

create or replace function public.health_medicine_update_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.health_medicine_orders%rowtype;
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
  if v_order.order_status in ('delivered','cancelled') then
    raise exception 'This Health order is already closed';
  end if;

  if p_status='accepted' and v_order.order_status<>'placed' then raise exception 'Only a placed order can be accepted'; end if;
  if p_status='preparing' and v_order.order_status not in ('accepted','preparing') then raise exception 'Accept the order before preparing it'; end if;
  if p_status='ready_for_handover' and v_order.order_status not in ('accepted','preparing','ready_for_handover') then raise exception 'Prepare the order before marking it ready'; end if;
  if p_status='handed_to_leogo' and v_order.order_status<>'ready_for_handover' then raise exception 'Mark the order ready before handing it to LEOGO'; end if;

  if p_status='handed_to_leogo'
     and v_order.payment_method='cod'
     and coalesce(v_order.delivery_fee_kes,0)>0
     and v_order.cod_delivery_fee_status<>'verified' then
    raise exception 'COD delivery fee must be verified by LEOGO Admin before handing this Health order to LEOGO';
  end if;

  update public.health_medicine_orders
  set order_status=p_status,
      provider_received_at=case when p_status='accepted' then coalesce(provider_received_at,now()) else provider_received_at end,
      preparing_at=case when p_status='preparing' then coalesce(preparing_at,now()) else preparing_at end,
      ready_for_handover_at=case when p_status='ready_for_handover' then coalesce(ready_for_handover_at,now()) else ready_for_handover_at end,
      handed_to_leogo_at=case when p_status='handed_to_leogo' then coalesce(handed_to_leogo_at,now()) else handed_to_leogo_at end,
      updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,
    'order',
    'Health order update',
    'Health & Medicine order '||v_order.order_reference||' is now '||replace(p_status,'_',' ')||'.',
    'health_medicine_order',
    v_order.id,
    'health_order_status_'||p_status||'_'||v_order.id::text,
    'orders',
    jsonb_build_object('order_reference',v_order.order_reference,'order_status',p_status)
  );

  return jsonb_build_object('ok',true,'order_status',p_status);
end;
$function$;

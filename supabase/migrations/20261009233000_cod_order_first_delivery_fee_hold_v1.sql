-- COD order-first, separate LEOGO delivery-fee hold.
-- No existing marketplace payment status, item pricing or seller flow is redefined.
-- Existing orders keep not_required so previously processed COD is not retroactively frozen.

alter table public.marketplace_orders
  add column if not exists cod_delivery_fee_status text not null default 'not_required',
  add column if not exists cod_delivery_fee_reference text,
  add column if not exists cod_delivery_fee_submitted_at timestamptz,
  add column if not exists cod_delivery_fee_reviewed_at timestamptz,
  add column if not exists cod_delivery_fee_reviewed_by uuid,
  add column if not exists cod_delivery_fee_review_notes text;

alter table public.marketplace_orders drop constraint if exists marketplace_orders_cod_fee_status_check;
alter table public.marketplace_orders add constraint marketplace_orders_cod_fee_status_check
  check (cod_delivery_fee_status in ('not_required','awaiting_payment','submitted','verified','rejected'));

create unique index if not exists marketplace_orders_cod_delivery_fee_reference_unique
  on public.marketplace_orders (lower(btrim(cod_delivery_fee_reference)))
  where cod_delivery_fee_reference is not null and btrim(cod_delivery_fee_reference) <> '';

create or replace function private.cod_fee_status_on_new_order()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  -- The current order RPC inserts the actual calculated delivery fee, not a client estimate.
  if new.payment_method = 'cod' and coalesce(new.delivery_fee_kes,0) > 0 then
    if length(btrim(coalesce(new.payment_message,''))) >= 8 then
      -- Support stale browser tabs that still submit the fee proof at order creation.
      new.cod_delivery_fee_status := 'submitted';
      new.cod_delivery_fee_reference := btrim(new.payment_message);
      new.cod_delivery_fee_submitted_at := now();
    else
      new.cod_delivery_fee_status := 'awaiting_payment';
      new.cod_delivery_fee_reference := null;
      new.cod_delivery_fee_submitted_at := null;
    end if;
  else
    new.cod_delivery_fee_status := 'not_required';
  end if;
  return new;
end;
$fn$;

drop trigger if exists marketplace_cod_fee_new_order on public.marketplace_orders;
create trigger marketplace_cod_fee_new_order before insert on public.marketplace_orders
for each row execute function private.cod_fee_status_on_new_order();

-- Enforce fee verification even when a caller bypasses a particular rider RPC.
create or replace function private.enforce_cod_delivery_fee_before_dispatch()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_method text; v_fee numeric; v_fee_status text;
begin
  select o.payment_method,o.delivery_fee_kes,o.cod_delivery_fee_status
    into v_method,v_fee,v_fee_status
  from public.marketplace_orders o where o.id=new.order_id;
  if v_method='cod' and coalesce(v_fee,0)>0
    and v_fee_status not in ('verified','not_required') then
    raise exception 'COD delivery fee must be verified by LEOGO Admin before rider assignment or dispatch';
  end if;
  return new;
end;
$fn$;

drop trigger if exists marketplace_cod_fee_dispatch_hold on public.marketplace_delivery_jobs;
create trigger marketplace_cod_fee_dispatch_hold
  before insert or update of order_id,rider_id,status on public.marketplace_delivery_jobs
  for each row execute function private.enforce_cod_delivery_fee_before_dispatch();

-- Protect order-status writers that could bypass delivery_jobs.
create or replace function private.enforce_cod_fee_marketplace_status()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.payment_method='cod' and coalesce(new.delivery_fee_kes,0)>0
    and new.cod_delivery_fee_status not in ('verified','not_required')
    and new.order_status in ('with_rider','delivered') then
    raise exception 'COD delivery fee must be verified before order dispatch or delivery';
  end if;
  return new;
end;
$fn$;

drop trigger if exists marketplace_cod_fee_order_status_hold on public.marketplace_orders;
create trigger marketplace_cod_fee_order_status_hold
  before insert or update of order_status,cod_delivery_fee_status on public.marketplace_orders
  for each row execute function private.enforce_cod_fee_marketplace_status();

-- Only available after this server-side hold is installed. Older frontends remain compatible.
create or replace function public.customer_cod_order_first_ready()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select (select auth.uid()) is not null;
$fn$;
revoke all on function public.customer_cod_order_first_ready() from public,anon;
grant execute on function public.customer_cod_order_first_ready() to authenticated;

-- The locked checkout remains the source of truth for stock, calculations,
-- Seller sub-orders, voucher application and COD subtotal limits.
-- Only change the V2 wrapper to not require an upfront proof for COD.
do $fn$
declare v_definition text;
  v_existing text := 'and p_payment_method in (''till'',''paybill'',''cod'')';
  v_replacement text := 'and p_payment_method in (''till'',''paybill'')';
begin
  select pg_get_functiondef(
    'public.customer_create_marketplace_order_v2(jsonb,text,text,text,text,text,text,text,text,uuid,text,text,boolean)'::regprocedure
  ) into v_definition;
  if position(v_existing in v_definition)=0 then
    raise exception 'COD order-first checkout wrapper anchor was not found: manual migration reconciliation needed';
  end if;
  execute replace(v_definition,v_existing,v_replacement);
end;
$fn$;

create or replace function public.customer_submit_cod_delivery_fee_reference(
  p_order_id uuid, p_payment_reference text
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := (select auth.uid()); v_order public.marketplace_orders%rowtype;
  v_reference text := btrim(coalesce(p_payment_reference,''));
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if length(v_reference)<8 or length(v_reference)>600 then
    raise exception 'Provide the genuine M-Pesa transaction reference or confirmation message (8–600 characters)';
  end if;

  select * into v_order from public.marketplace_orders
  where id=p_order_id and customer_id=v_uid for update;
  if not found then raise exception 'Order not found in your customer account'; end if;
  if v_order.payment_method<>'cod' or coalesce(v_order.delivery_fee_kes,0)<=0 then
    raise exception 'A delivery-fee payment is not required for this order';
  end if;
  if v_order.order_status in ('cancelled','delivered') then
    raise exception 'Delivery-fee proof cannot be changed for this order';
  end if;
  if v_order.cod_delivery_fee_status not in ('awaiting_payment','rejected') then
    raise exception 'Delivery-fee proof is already submitted or verified';
  end if;

  update public.marketplace_orders set
    cod_delivery_fee_reference=v_reference,
    cod_delivery_fee_status='submitted',
    cod_delivery_fee_submitted_at=now(),
    cod_delivery_fee_review_notes=null,
    cod_delivery_fee_reviewed_by=null,
    cod_delivery_fee_reviewed_at=null,
    updated_at=now()
  where id=p_order_id;
  return jsonb_build_object('success',true,'status','submitted','order_id',p_order_id);
end;
$fn$;
revoke all on function public.customer_submit_cod_delivery_fee_reference(uuid,text) from public,anon;
grant execute on function public.customer_submit_cod_delivery_fee_reference(uuid,text) to authenticated;

-- Separate from full COD balance settlement; never call order.payment_verify here.
create or replace function public.admin_review_cod_delivery_fee(
  p_order_id uuid, p_verified boolean, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_order public.marketplace_orders%rowtype; v_next text; v_notes text:=btrim(coalesce(p_notes,''));
begin
  if not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Payment verification permission required';
  end if;
  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method<>'cod' or coalesce(v_order.delivery_fee_kes,0)<=0 then
    raise exception 'This order has no COD delivery-fee payment to review';
  end if;
  if v_order.cod_delivery_fee_status='verified' and p_verified then
    return jsonb_build_object('success',true,'status','verified','already_verified',true);
  end if;
  if v_order.cod_delivery_fee_status<>'submitted' or v_order.cod_delivery_fee_reference is null then
    raise exception 'Customer must submit a COD delivery-fee payment reference first';
  end if;
  if not p_verified and length(v_notes)<3 then
    raise exception 'Provide a reason for rejecting the delivery-fee payment';
  end if;
  v_next:=case when p_verified then 'verified' else 'rejected' end;
  update public.marketplace_orders set
    cod_delivery_fee_status=v_next,
    cod_delivery_fee_reviewed_by=(select auth.uid()),
    cod_delivery_fee_reviewed_at=now(),
    cod_delivery_fee_review_notes=nullif(v_notes,''),
    updated_at=now()
  where id=p_order_id;

  perform private.write_admin_audit(
    case when p_verified then 'order.cod_delivery_fee.verified' else 'order.cod_delivery_fee.rejected' end,
    'marketplace_order',p_order_id::text,
    jsonb_build_object('cod_delivery_fee_status',v_order.cod_delivery_fee_status),
    jsonb_build_object('cod_delivery_fee_status',v_next),
    jsonb_build_object('delivery_fee_kes',v_order.delivery_fee_kes,'notes',v_notes)
  );
  return jsonb_build_object('success',true,'status',v_next,'order_id',p_order_id);
end;
$fn$;
revoke all on function public.admin_review_cod_delivery_fee(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_cod_delivery_fee(uuid,boolean,text) to authenticated;

create or replace function public.admin_get_cod_delivery_fee_status(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then raise exception 'Order access required'; end if;
  select jsonb_build_object(
    'status',o.cod_delivery_fee_status,'reference',o.cod_delivery_fee_reference,
    'amount_kes',least(coalesce(o.delivery_fee_kes,0),greatest(0,o.external_amount_due_kes)),'submitted_at',o.cod_delivery_fee_submitted_at,
    'reviewed_at',o.cod_delivery_fee_reviewed_at,'review_notes',o.cod_delivery_fee_review_notes
  ) into v_result from public.marketplace_orders o where o.id=p_order_id;
  if v_result is null then raise exception 'Order not found'; end if;
  return v_result;
end;
$fn$;
revoke all on function public.admin_get_cod_delivery_fee_status(uuid) from public,anon;
grant execute on function public.admin_get_cod_delivery_fee_status(uuid) to authenticated;

create or replace function public.customer_list_cod_delivery_fee_status()
returns jsonb language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'status',o.cod_delivery_fee_status,
    'reference',o.cod_delivery_fee_reference,'amount_kes',least(coalesce(o.delivery_fee_kes,0),greatest(0,o.external_amount_due_kes)),
    'review_notes',o.cod_delivery_fee_review_notes
  )), '[]'::jsonb)
  from public.marketplace_orders o
  where o.customer_id=(select auth.uid()) and o.payment_method='cod'
    and coalesce(o.delivery_fee_kes,0)>0;
$fn$;
revoke all on function public.customer_list_cod_delivery_fee_status() from public,anon;
grant execute on function public.customer_list_cod_delivery_fee_status() to authenticated;

comment on column public.marketplace_orders.cod_delivery_fee_status is
  'Independent proof/verification of LEOGO COD delivery fee; not verification of order COD balance.';

-- COD: service fee and transport fee prepaid as ONE verified upfront payment on NEW orders.
-- Historical COD orders are preserved using a per-order opt-in flag.
alter table public.marketplace_orders
 add column if not exists cod_upfront_service_fee_required boolean not null default false;

create or replace function private.cod_fee_status_on_new_order()
returns trigger language plpgsql set search_path='' as $fn$
begin
  new.cod_upfront_service_fee_required :=
    new.payment_method='cod' and coalesce(new.service_fee_kes,0)>0;
  if new.payment_method='cod' and
     (coalesce(new.delivery_fee_kes,0)+case when new.cod_upfront_service_fee_required then coalesce(new.service_fee_kes,0) else 0 end)>0 then
    -- Preserve valid payment references from older checkout sessions.
    -- New checkout sessions submit proof after the order is created.
    if length(btrim(coalesce(new.payment_message,''))) >= 8 then
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

create or replace function private.enforce_cod_delivery_fee_before_dispatch()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_method text; v_fee numeric; v_fee_status text;
begin
  select o.payment_method,
         coalesce(o.delivery_fee_kes,0)+case when o.cod_upfront_service_fee_required then coalesce(o.service_fee_kes,0) else 0 end,
         o.cod_delivery_fee_status
    into v_method,v_fee,v_fee_status
  from public.marketplace_orders o where o.id=new.order_id;
  -- A placeholder job without a rider must be allowed when COD order is created.
  if v_method='cod' and coalesce(v_fee,0)>0 and v_fee_status is distinct from 'verified'
     and (new.rider_id is not null or new.status in ('picked_up','arrived_sorting_center','sorting_received','on_the_way','delivered_to_pickup_station','ready_for_pickup','delivered'))
  then
    raise exception 'COD service and transport fees must be paid and Admin-verified before rider assignment or dispatch';
  end if;
  return new;
end;
$fn$;

create or replace function private.enforce_cod_fee_marketplace_status()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  if new.payment_method='cod' and
     (coalesce(new.delivery_fee_kes,0)+case when new.cod_upfront_service_fee_required then coalesce(new.service_fee_kes,0) else 0 end)>0
     and new.cod_delivery_fee_status is distinct from 'verified'
     and new.order_status in ('with_rider','delivered') then
    raise exception 'COD service and transport fees must be verified before dispatch or delivery';
  end if;
  return new;
end;
$fn$;

-- Retain existing ownership checks, reference validation and Admin audit paths.
do $patch$
declare v_name text; v_def text; v_sig regprocedure; v_new text;
  v_sum text := '(coalesce(v_order.delivery_fee_kes,0)+case when v_order.cod_upfront_service_fee_required then coalesce(v_order.service_fee_kes,0) else 0 end)';
  v_order_sum text := '(coalesce(o.delivery_fee_kes,0)+case when o.cod_upfront_service_fee_required then coalesce(o.service_fee_kes,0) else 0 end)';
begin
  foreach v_name in array array['customer_submit_cod_delivery_fee_reference','admin_review_cod_delivery_fee','admin_get_cod_delivery_fee_status',
    'customer_list_cod_delivery_fee_status','admin_list_cod_delivery_fee_queue','rider_list_delivery_jobs_v4','pickup_partner_lookup_parcel']
  loop
    select p.oid::regprocedure,pg_get_functiondef(p.oid) into v_sig,v_def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name limit 1;
    if v_sig is null then raise exception 'Required COD function missing: %',v_name; end if;
    v_new:=v_def;
    if v_name in ('customer_submit_cod_delivery_fee_reference','admin_review_cod_delivery_fee') then
      v_new:=replace(v_new,'coalesce(v_order.delivery_fee_kes,0)<=0',v_sum||'<=0');
      v_new:=replace(v_new,'delivery-fee','service and delivery-fee');
    elsif v_name in ('admin_get_cod_delivery_fee_status','customer_list_cod_delivery_fee_status') then
      v_new:=replace(v_new,'least(coalesce(o.delivery_fee_kes,0),greatest(0,o.external_amount_due_kes))',
        'least('||v_order_sum||',greatest(0,o.external_amount_due_kes))');
      if v_name='customer_list_cod_delivery_fee_status' then
        v_new:=replace(v_new,'coalesce(o.delivery_fee_kes,0)>0',v_order_sum||'>0');
      end if;
    elsif v_name='admin_list_cod_delivery_fee_queue' then
      v_new:=replace(v_new,'coalesce(o.delivery_fee_kes,0)>0',v_order_sum||'>0');
    else
      v_new:=replace(v_new,'least(coalesce(o.delivery_fee_kes,0),greatest(0,o.external_amount_due_kes))',
        'least('||v_order_sum||',greatest(0,o.external_amount_due_kes))');
    end if;
    -- Require exact, unique matches rather than accepting partial SQL rewrites.
    if v_new=v_def then raise exception 'Upfront COD reconciliation required for %',v_name; end if;
    execute v_new;
    v_sig:=null;
  end loop;
end
$patch$;

-- Inform all customers at creation, including marketplace, Assisted Shopping and COD pickup.
create or replace function private.notify_cod_upfront_required()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_service numeric:=case when new.cod_upfront_service_fee_required then coalesce(new.service_fee_kes,0) else 0 end;
  v_shipping numeric:=coalesce(new.delivery_fee_kes,0);
begin
  if new.payment_method='cod' and v_service+v_shipping>0 then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    values(
      new.customer_id,'payment','COD fees required before dispatch',
      'For order '||new.order_reference||', pay LEOGO service fee KSh '||v_service||
      ' plus transport fee KSh '||v_shipping||' (total KSh '||(v_service+v_shipping)||
      ') upfront, then submit your M-Pesa reference. LEOGO must verify the payment before dispatch. The remaining COD balance is paid at handover.',
      'marketplace_order',new.id,'cod_upfront_fees_required','orders',
      jsonb_build_object('service_fee_kes',v_service,'delivery_fee_kes',v_shipping,'upfront_kes',v_service+v_shipping)
    ) on conflict do nothing;
  end if;
  return new;
end;
$fn$;
drop trigger if exists marketplace_notify_cod_upfront_required on public.marketplace_orders;
create trigger marketplace_notify_cod_upfront_required
 after insert on public.marketplace_orders
 for each row execute function private.notify_cod_upfront_required();

-- Notify on Admin approval or rejection of the existing upfront fee proof.
do $patch$
declare v_def text;
 v_anchor text := '  return jsonb_build_object(''success'',true,''status'',v_next,''order_id'',p_order_id);';
 v_replacement text := $body$
  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(
    v_order.customer_id,'payment',
    case when p_verified then 'COD upfront fees verified' else 'COD upfront fee proof rejected' end,
    'Order '||v_order.order_reference||': '||
      case when p_verified then 'Your service and delivery fees have been verified. LEOGO can proceed with dispatch.'
      else 'Your upfront-fee payment reference was rejected. '||v_notes||'. Please submit a valid reference.' end,
    'marketplace_order',p_order_id,
    case when p_verified then 'cod_upfront_verified' else 'cod_upfront_rejected' end,
    'orders',jsonb_build_object('notes',v_notes,'status',v_next)
  ) on conflict do nothing;
  return jsonb_build_object('success',true,'status',v_next,'order_id',p_order_id);$body$;
begin
  select pg_get_functiondef('public.admin_review_cod_delivery_fee(uuid,boolean,text)'::regprocedure) into v_def;
  if position(v_anchor in v_def)=0 then raise exception 'Admin COD notification anchor missing'; end if;
  execute replace(v_def,v_anchor,v_replacement);
end
$patch$;

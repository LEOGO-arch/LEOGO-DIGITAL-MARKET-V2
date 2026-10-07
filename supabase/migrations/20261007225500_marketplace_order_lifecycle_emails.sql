-- LEOGO customer order lifecycle email notifications.
-- Adds idempotent customer emails for order created, actual dispatch, and delivery.
-- Email failures are isolated from order/delivery transactions.

create or replace function private.enqueue_marketplace_order_lifecycle_email(
  p_order_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_email text;
  v_subject text;
  v_data jsonb;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id;

  if not found then
    return;
  end if;

  select nullif(btrim(u.email),'')
  into v_email
  from auth.users u
  where u.id=v_order.customer_id;

  if v_email is null then
    return;
  end if;

  if p_event_key='order_created' then
    v_subject := 'LEOGO Order '||v_order.order_reference||' Created Successfully';
    v_data := jsonb_build_object(
      'kind','order_created',
      'order_reference',v_order.order_reference,
      'customer_name',v_order.receiver_name,
      'order_total_kes',v_order.grand_total_kes,
      'payment_method',v_order.payment_method,
      'payment_status',v_order.payment_status,
      'delivery_zone',v_order.delivery_zone
    );
  elsif p_event_key='order_shipped' then
    v_subject := 'Your LEOGO Order '||v_order.order_reference||' Has Been Shipped';
    v_data := jsonb_build_object(
      'kind','order_shipped',
      'order_reference',v_order.order_reference,
      'customer_name',v_order.receiver_name,
      'order_total_kes',v_order.grand_total_kes,
      'delivery_zone',v_order.delivery_zone
    );
  elsif p_event_key='order_delivered' then
    v_subject := 'LEOGO Order '||v_order.order_reference||' Delivered Successfully';
    v_data := jsonb_build_object(
      'kind','order_delivered',
      'order_reference',v_order.order_reference,
      'customer_name',v_order.receiver_name,
      'order_total_kes',v_order.grand_total_kes,
      'delivery_zone',v_order.delivery_zone
    );
  else
    return;
  end if;

  insert into public.order_email_outbox(
    order_id,event_key,recipient_email,recipient_name,subject,template_data,status
  )
  values(
    v_order.id,p_event_key,v_email,v_order.receiver_name,v_subject,v_data,'pending'
  )
  on conflict (order_id,event_key) where order_id is not null do nothing;
exception when others then
  -- Email infrastructure must never block order creation or lifecycle updates.
  return;
end
$function$;

revoke all on function private.enqueue_marketplace_order_lifecycle_email(uuid,text)
from public,anon,authenticated;

create or replace function private.enqueue_email_when_marketplace_order_created()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  begin
    perform private.enqueue_marketplace_order_lifecycle_email(new.id,'order_created');
  exception when others then
    null;
  end;
  return new;
end
$function$;

revoke all on function private.enqueue_email_when_marketplace_order_created()
from public,anon,authenticated;

drop trigger if exists marketplace_order_email_created on public.marketplace_orders;
create trigger marketplace_order_email_created
after insert on public.marketplace_orders
for each row
execute function private.enqueue_email_when_marketplace_order_created();

create or replace function private.enqueue_email_when_marketplace_order_dispatched()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='on_the_way'
     and old.status is distinct from new.status then
    begin
      perform private.enqueue_marketplace_order_lifecycle_email(new.order_id,'order_shipped');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

revoke all on function private.enqueue_email_when_marketplace_order_dispatched()
from public,anon,authenticated;

drop trigger if exists marketplace_delivery_email_order_shipped on public.marketplace_delivery_jobs;
create trigger marketplace_delivery_email_order_shipped
after update of status on public.marketplace_delivery_jobs
for each row
execute function private.enqueue_email_when_marketplace_order_dispatched();

create or replace function private.enqueue_email_when_marketplace_order_delivered()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.order_status='delivered'
     and old.order_status is distinct from new.order_status then
    begin
      perform private.enqueue_marketplace_order_lifecycle_email(new.id,'order_delivered');
    exception when others then
      null;
    end;
  end if;
  return new;
end
$function$;

revoke all on function private.enqueue_email_when_marketplace_order_delivered()
from public,anon,authenticated;

drop trigger if exists marketplace_order_email_delivered on public.marketplace_orders;
create trigger marketplace_order_email_delivered
after update of order_status on public.marketplace_orders
for each row
execute function private.enqueue_email_when_marketplace_order_delivered();

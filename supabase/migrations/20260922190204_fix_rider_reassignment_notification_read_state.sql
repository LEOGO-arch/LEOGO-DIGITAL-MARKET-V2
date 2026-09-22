create or replace function public.admin_assign_rider_to_order(p_order_id uuid, p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_rider public.leogo_staff%rowtype;
  v_job uuid;
  v_previous_rider uuid;
  v_previous_status text;
begin
  if not private.is_leogo_admin('delivery.manage')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Delivery management permission required';
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status in ('cancelled','delivered') then
    raise exception 'This order cannot be assigned for delivery';
  end if;

  select * into v_rider
  from public.leogo_staff
  where user_id=p_rider_id
    and staff_role='rider'
    and status='active'
    and availability_status<>'off_duty';

  if not found then raise exception 'Choose an active available LEOGO rider'; end if;

  select d.rider_id,d.status
  into v_previous_rider,v_previous_status
  from public.marketplace_delivery_jobs d
  where d.order_id=p_order_id
  for update;

  insert into public.marketplace_delivery_jobs(order_id,rider_id,status,assigned_at,assigned_by,updated_at)
  values(p_order_id,p_rider_id,'assigned',now(),(select auth.uid()),now())
  on conflict(order_id) do update
  set rider_id=excluded.rider_id,status='assigned',assigned_at=now(),assigned_by=(select auth.uid()),updated_at=now()
  returning id into v_job;

  if v_previous_rider is distinct from p_rider_id then
    insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
    values(
      p_rider_id,'transport','delivery_assigned','Delivery assigned',
      'You have been assigned order '||v_order.order_reference||'. Open Rider Jobs to view pickup and customer delivery details.',
      'marketplace_delivery_job',v_job,'rider_jobs',
      jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference)
    );

    if v_previous_rider is not null then
      insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
      values(
        v_previous_rider,'transport','delivery_reassigned','Delivery reassigned',
        'Order '||v_order.order_reference||' has been reassigned by LEOGO Admin and is no longer assigned to you.',
        'marketplace_delivery_job',v_job,'rider_jobs',
        jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference)
      );
    end if;
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_order.customer_id,'delivery','Rider assigned',
    'LEOGO rider '||v_rider.display_name||' has been assigned to order '||v_order.order_reference||'.',
    'marketplace_delivery_job',v_job,'delivery_assigned','orders',
    jsonb_build_object('rider_name',v_rider.display_name,'rider_id',p_rider_id)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  perform private.notify_partner(
    so.seller_id,'seller','delivery_assigned','Rider assigned',
    'LEOGO rider '||v_rider.display_name||' has been assigned to order '||v_order.order_reference||'.',
    'marketplace_delivery_job',v_job,'orders',
    jsonb_build_object('rider_name',v_rider.display_name,'rider_id',p_rider_id)
  )
  from public.marketplace_seller_orders so
  where so.order_id=p_order_id;

  perform private.write_admin_audit(
    case when v_previous_rider is null then 'delivery.rider.assigned' else 'delivery.rider.reassigned' end,
    'marketplace_delivery_job',v_job::text,
    jsonb_build_object('rider_id',v_previous_rider,'status',v_previous_status),
    jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'rider_name',v_rider.display_name)
  );

  return jsonb_build_object(
    'ok',true,'delivery_job_id',v_job,'rider_name',v_rider.display_name,
    'reassigned',v_previous_rider is not null
  );
end
$function$;

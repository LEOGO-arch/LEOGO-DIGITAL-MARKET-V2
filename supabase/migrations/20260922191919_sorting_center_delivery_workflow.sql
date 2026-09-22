alter table public.marketplace_delivery_jobs
  add column if not exists arrived_sorting_center_at timestamptz,
  add column if not exists sorting_received_at timestamptz,
  add column if not exists sorting_received_by uuid references auth.users(id) on delete set null,
  add column if not exists ready_for_dispatch_at timestamptz,
  add column if not exists ready_for_dispatch_by uuid references auth.users(id) on delete set null;

alter table public.marketplace_delivery_jobs
  drop constraint if exists marketplace_delivery_jobs_status_check;

alter table public.marketplace_delivery_jobs
  add constraint marketplace_delivery_jobs_status_check
  check (status = any (array[
    'awaiting_assignment'::text,
    'assigned'::text,
    'picked_up'::text,
    'arrived_sorting_center'::text,
    'sorting_received'::text,
    'ready_for_dispatch'::text,
    'on_the_way'::text,
    'delivered'::text,
    'failed'::text,
    'cancelled'::text
  ]));

create or replace function public.admin_get_delivery_sorting_state(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'delivery_job_id',d.id,
    'status',d.status,
    'arrived_sorting_center_at',d.arrived_sorting_center_at,
    'sorting_received_at',d.sorting_received_at,
    'sorting_received_by',d.sorting_received_by,
    'sorting_received_by_name',aru.display_name,
    'ready_for_dispatch_at',d.ready_for_dispatch_at,
    'ready_for_dispatch_by',d.ready_for_dispatch_by,
    'ready_for_dispatch_by_name',adu.display_name
  )
  into v_result
  from public.marketplace_delivery_jobs d
  left join public.admin_users aru on aru.user_id=d.sorting_received_by
  left join public.admin_users adu on adu.user_id=d.ready_for_dispatch_by
  where d.order_id=p_order_id;

  return coalesce(v_result,'{}'::jsonb);
end
$function$;

create or replace function public.admin_update_sorting_center_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job public.marketplace_delivery_jobs%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_uid uuid:=(select auth.uid());
  v_old_status text;
  v_title text;
  v_message text;
begin
  if not private.is_leogo_admin('delivery.manage')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Delivery management permission required';
  end if;

  if p_status not in ('sorting_received','ready_for_dispatch') then
    raise exception 'Unsupported sorting-center status';
  end if;

  select * into v_job
  from public.marketplace_delivery_jobs
  where order_id=p_order_id
  for update;

  if not found then raise exception 'Delivery job not found'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;

  if v_job.status in ('delivered','cancelled','failed') then
    raise exception 'This delivery can no longer be updated at the sorting center';
  end if;

  if v_job.status=p_status then
    return jsonb_build_object('ok',true,'status',v_job.status,'already_set',true);
  end if;

  v_old_status:=v_job.status;

  if p_status='sorting_received' then
    if v_job.status not in ('picked_up','arrived_sorting_center') then
      raise exception 'Order must be picked up or marked arrived at the sorting center first';
    end if;

    update public.marketplace_delivery_jobs
    set status='sorting_received',
        arrived_sorting_center_at=coalesce(arrived_sorting_center_at,now()),
        sorting_received_at=coalesce(sorting_received_at,now()),
        sorting_received_by=v_uid,
        updated_at=now()
    where id=v_job.id;

    v_title:='Order received at LEOGO Sorting Center';
    v_message:='Order '||v_order.order_reference||' has been received at the LEOGO Sorting Center.';
  else
    if v_job.status<>'sorting_received' then
      raise exception 'Confirm receipt at the LEOGO Sorting Center before marking ready for dispatch';
    end if;

    update public.marketplace_delivery_jobs
    set status='ready_for_dispatch',
        ready_for_dispatch_at=coalesce(ready_for_dispatch_at,now()),
        ready_for_dispatch_by=v_uid,
        updated_at=now()
    where id=v_job.id;

    v_title:='Order ready for dispatch';
    v_message:='Order '||v_order.order_reference||' is ready for dispatch from the LEOGO Sorting Center.';
  end if;

  update public.marketplace_orders
  set order_status='with_rider',updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_order.customer_id,'delivery',v_title,v_message,
    'marketplace_delivery_job',v_job.id,'delivery_'||p_status,'orders',
    jsonb_build_object('status',p_status)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  if v_job.rider_id is not null then
    insert into public.partner_notifications(
      user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
    )
    values(
      v_job.rider_id,'transport','delivery_'||p_status,v_title,
      case when p_status='ready_for_dispatch'
        then 'Order '||v_order.order_reference||' is ready. You can continue delivery from the LEOGO Sorting Center.'
        else 'Order '||v_order.order_reference||' has been confirmed received at the LEOGO Sorting Center.'
      end,
      'marketplace_delivery_job',v_job.id,'rider_jobs',
      jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference,'status',p_status)
    );
  end if;

  perform private.write_admin_audit(
    'delivery.sorting.'||p_status,
    'marketplace_delivery_job',
    v_job.id::text,
    jsonb_build_object('status',v_old_status),
    jsonb_build_object('status',p_status,'order_id',p_order_id)
  );

  return jsonb_build_object('ok',true,'status',p_status,'order_id',p_order_id);
end
$function$;

create or replace function public.rider_list_delivery_jobs_v3()
returns table(
  delivery_job_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  status text,
  payment_method text,
  payment_status text,
  grand_total_kes numeric,
  admin_notes text,
  rider_notes text,
  cod_payment_required boolean,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  arrived_sorting_center_at timestamptz,
  sorting_received_at timestamptz,
  ready_for_dispatch_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  seller_pickups jsonb
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from public.leogo_staff ls
    where ls.user_id=(select auth.uid())
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  return query
  select
    d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,
    o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    d.status,o.payment_method,o.payment_status,o.grand_total_kes,
    d.admin_notes,d.rider_notes,
    (o.payment_method='cod' and o.payment_status not in ('cod_paid','verified_paid')) as cod_payment_required,
    d.assigned_at,d.picked_up_at,d.arrived_sorting_center_at,d.sorting_received_at,
    d.ready_for_dispatch_at,d.on_the_way_at,d.delivered_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id',so.seller_id,
        'seller_name',s.business_name,
        'seller_phone',s.phone,
        'seller_location',s.location_details,
        'fulfilment_status',so.fulfilment_status,
        'seller_subtotal_kes',so.seller_subtotal_kes
      ) order by s.business_name)
      from public.marketplace_seller_orders so
      join public.seller_accounts s on s.user_id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb)
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  where d.rider_id=(select auth.uid())
  order by
    case d.status
      when 'assigned' then 0
      when 'picked_up' then 1
      when 'arrived_sorting_center' then 2
      when 'sorting_received' then 3
      when 'ready_for_dispatch' then 4
      when 'on_the_way' then 5
      else 6
    end,
    o.created_at desc;
end
$function$;

create or replace function public.rider_update_delivery_status_v3(
  p_delivery_job_id uuid,
  p_status text,
  p_note text default null,
  p_cod_payment_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_job public.marketplace_delivery_jobs%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_title text;
  v_message text;
begin
  if p_status not in ('picked_up','arrived_sorting_center','on_the_way','delivered') then
    raise exception 'Unsupported delivery status';
  end if;

  if not exists(
    select 1 from public.leogo_staff ls
    where ls.user_id=v_uid
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  select * into v_job
  from public.marketplace_delivery_jobs d
  where d.id=p_delivery_job_id and d.rider_id=v_uid
  for update;

  if not found then raise exception 'Delivery job not found'; end if;

  select * into v_order
  from public.marketplace_orders o
  where o.id=v_job.order_id
  for update;

  if p_status='picked_up' then
    if v_job.status<>'assigned' then
      raise exception 'Job must be assigned before pickup';
    end if;
    if exists(
      select 1 from public.marketplace_seller_orders so
      where so.order_id=v_job.order_id
        and so.fulfilment_status not in ('packed_ready','handed_to_rider','delivered')
    ) then
      raise exception 'One or more Seller portions are not packed and ready yet';
    end if;
    update public.marketplace_seller_orders so
    set fulfilment_status='handed_to_rider',
        handed_to_rider_at=coalesce(so.handed_to_rider_at,now()),
        updated_at=now()
    where so.order_id=v_job.order_id
      and so.fulfilment_status='packed_ready';
    v_title:='Order picked up';
    v_message:='Order '||v_order.order_reference||' has been picked up from the Seller and is heading to the LEOGO Sorting Center.';
  elsif p_status='arrived_sorting_center' then
    if v_job.status<>'picked_up' then
      raise exception 'Mark the order picked up before arriving at the sorting center';
    end if;
    v_title:='Order arrived at LEOGO Sorting Center';
    v_message:='Order '||v_order.order_reference||' has arrived at the LEOGO Sorting Center and is awaiting receipt confirmation.';
  elsif p_status='on_the_way' then
    if v_job.status<>'ready_for_dispatch' then
      raise exception 'Order must be marked ready for dispatch at the LEOGO Sorting Center first';
    end if;
    v_title:='Order dispatched';
    v_message:='Order '||v_order.order_reference||' has left the LEOGO Sorting Center and is on the way to the customer.';
  else
    if v_job.status<>'on_the_way' then
      raise exception 'Mark the order on the way before delivered';
    end if;
    if v_order.payment_method='cod'
       and v_order.payment_status not in ('cod_paid','verified_paid')
       and coalesce(p_cod_payment_confirmed,false)=false then
      raise exception 'Confirm that full COD payment has been collected before handing over the order';
    end if;
    v_title:='Order delivered';
    v_message:='Order '||v_order.order_reference||' has been delivered.';
  end if;

  update public.marketplace_delivery_jobs d
  set status=p_status,
      picked_up_at=case when p_status='picked_up' then coalesce(d.picked_up_at,now()) else d.picked_up_at end,
      arrived_sorting_center_at=case when p_status='arrived_sorting_center' then coalesce(d.arrived_sorting_center_at,now()) else d.arrived_sorting_center_at end,
      on_the_way_at=case when p_status='on_the_way' then coalesce(d.on_the_way_at,now()) else d.on_the_way_at end,
      delivered_at=case when p_status='delivered' then coalesce(d.delivered_at,now()) else d.delivered_at end,
      rider_notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),d.rider_notes),
      updated_at=now()
  where d.id=p_delivery_job_id;

  update public.marketplace_orders o
  set order_status=case when p_status='delivered' then 'delivered' else 'with_rider' end,
      delivered_at=case when p_status='delivered' then coalesce(o.delivered_at,now()) else o.delivered_at end,
      payment_status=case when p_status='delivered' and o.payment_method='cod' then 'cod_paid' else o.payment_status end,
      updated_at=now()
  where o.id=v_job.order_id;

  if p_status='delivered' then
    update public.marketplace_seller_orders so
    set fulfilment_status='delivered',
        delivered_at=coalesce(so.delivered_at,now()),
        updated_at=now()
    where so.order_id=v_job.order_id
      and so.fulfilment_status<>'cancelled';
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_order.customer_id,'delivery',v_title,v_message,
    'marketplace_delivery_job',p_delivery_job_id,'delivery_'||p_status,'orders',
    jsonb_build_object('status',p_status)
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
    so.seller_id,'seller','delivery_'||p_status,v_title,v_message,
    'marketplace_delivery_job',p_delivery_job_id,'orders',
    jsonb_build_object('status',p_status)
  )
  from public.marketplace_seller_orders so
  where so.order_id=v_job.order_id;

  return jsonb_build_object('ok',true,'status',p_status,'order_id',v_job.order_id);
end
$function$;

create or replace function public.admin_list_delivery_jobs()
returns table(
  delivery_job_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  rider_id uuid,
  rider_name text,
  rider_phone text,
  status text,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  order_status text,
  payment_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Admin access required';
  end if;

  insert into public.marketplace_delivery_jobs(order_id)
  select o.id
  from public.marketplace_orders o
  where o.order_status not in ('cancelled','delivered')
    and not exists(
      select 1 from public.marketplace_delivery_jobs d
      where d.order_id=o.id
    )
  on conflict on constraint marketplace_delivery_jobs_order_id_key do nothing;

  return query
  select
    d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,
    o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    d.rider_id,s.display_name,s.phone,d.status,d.assigned_at,d.picked_up_at,
    d.on_the_way_at,d.delivered_at,o.order_status,o.payment_status,o.created_at
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  left join public.leogo_staff s on s.user_id=d.rider_id
  order by case d.status
    when 'awaiting_assignment' then 0
    when 'assigned' then 1
    when 'picked_up' then 2
    when 'arrived_sorting_center' then 3
    when 'sorting_received' then 4
    when 'ready_for_dispatch' then 5
    when 'on_the_way' then 6
    else 7
  end,o.created_at desc;
end
$function$;

revoke execute on function public.admin_get_delivery_sorting_state(uuid) from public,anon;
revoke execute on function public.admin_update_sorting_center_status(uuid,text) from public,anon;
revoke execute on function public.rider_list_delivery_jobs_v3() from public,anon;
revoke execute on function public.rider_update_delivery_status_v3(uuid,text,text,boolean) from public,anon;

grant execute on function public.admin_get_delivery_sorting_state(uuid) to authenticated;
grant execute on function public.admin_update_sorting_center_status(uuid,text) to authenticated;
grant execute on function public.rider_list_delivery_jobs_v3() to authenticated;
grant execute on function public.rider_update_delivery_status_v3(uuid,text,text,boolean) to authenticated;

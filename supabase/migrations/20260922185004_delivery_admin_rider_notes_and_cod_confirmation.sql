create or replace function public.admin_update_delivery_instructions(
  p_order_id uuid,
  p_admin_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job record;
  v_before text;
  v_after text;
begin
  if not private.is_leogo_admin('delivery.manage')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Delivery management permission required';
  end if;

  if char_length(coalesce(p_admin_notes,'')) > 2000 then
    raise exception 'Rider instructions must be 2000 characters or fewer';
  end if;

  select d.id,d.rider_id,d.admin_notes,o.order_reference
  into v_job
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  where d.order_id=p_order_id
  for update of d;

  if not found then
    raise exception 'Delivery job not found for this order';
  end if;

  v_before:=v_job.admin_notes;
  v_after:=nullif(btrim(coalesce(p_admin_notes,'')),'');

  update public.marketplace_delivery_jobs
  set admin_notes=v_after,
      updated_at=now()
  where id=v_job.id;

  if v_job.rider_id is not null then
    insert into public.partner_notifications(
      user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
    )
    values(
      v_job.rider_id,'transport','delivery_instructions_updated',
      'Delivery instructions updated',
      'Admin updated instructions for order '||v_job.order_reference||'. Open Rider Jobs to review them.',
      'marketplace_delivery_job',v_job.id,'rider_jobs',
      jsonb_build_object('order_id',p_order_id,'order_reference',v_job.order_reference)
    );
  end if;

  perform private.write_admin_audit(
    'delivery.instructions.updated',
    'marketplace_delivery_job',
    v_job.id::text,
    jsonb_build_object('admin_notes',v_before),
    jsonb_build_object('admin_notes',v_after),
    jsonb_build_object('order_id',p_order_id,'order_reference',v_job.order_reference)
  );

  return jsonb_build_object('ok',true,'admin_notes',v_after);
end
$function$;

create or replace function public.rider_update_delivery_notes(
  p_delivery_job_id uuid,
  p_rider_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_notes text;
begin
  if char_length(coalesce(p_rider_notes,'')) > 2000 then
    raise exception 'Rider notes must be 2000 characters or fewer';
  end if;

  if not exists(
    select 1
    from public.leogo_staff ls
    where ls.user_id=v_uid
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  if not exists(
    select 1
    from public.marketplace_delivery_jobs d
    where d.id=p_delivery_job_id
      and d.rider_id=v_uid
  ) then
    raise exception 'Delivery job not found';
  end if;

  v_notes:=nullif(btrim(coalesce(p_rider_notes,'')),'');

  update public.marketplace_delivery_jobs
  set rider_notes=v_notes,
      updated_at=now()
  where id=p_delivery_job_id
    and rider_id=v_uid;

  return jsonb_build_object('ok',true,'rider_notes',v_notes);
end
$function$;

create or replace function public.rider_list_delivery_jobs_v2()
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
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  seller_pickups jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists(
    select 1
    from public.leogo_staff ls
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
    d.assigned_at,d.picked_up_at,d.on_the_way_at,d.delivered_at,
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
      when 'on_the_way' then 2
      else 3
    end,
    o.created_at desc;
end
$function$;

create or replace function public.rider_update_delivery_status_v2(
  p_delivery_job_id uuid,
  p_status text,
  p_note text default null,
  p_cod_payment_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_payment_method text;
  v_payment_status text;
begin
  if p_status='delivered' then
    select o.payment_method,o.payment_status
    into v_payment_method,v_payment_status
    from public.marketplace_delivery_jobs d
    join public.marketplace_orders o on o.id=d.order_id
    where d.id=p_delivery_job_id
      and d.rider_id=v_uid;

    if not found then raise exception 'Delivery job not found'; end if;

    if v_payment_method='cod'
       and v_payment_status not in ('cod_paid','verified_paid')
       and coalesce(p_cod_payment_confirmed,false)=false then
      raise exception 'Confirm that full COD payment has been collected before handing over the order';
    end if;
  end if;

  return public.rider_update_delivery_status(p_delivery_job_id,p_status,p_note);
end
$function$;

revoke execute on function public.admin_update_delivery_instructions(uuid,text) from public,anon;
revoke execute on function public.rider_update_delivery_notes(uuid,text) from public,anon;
revoke execute on function public.rider_list_delivery_jobs_v2() from public,anon;
revoke execute on function public.rider_update_delivery_status_v2(uuid,text,text,boolean) from public,anon;

grant execute on function public.admin_update_delivery_instructions(uuid,text) to authenticated;
grant execute on function public.rider_update_delivery_notes(uuid,text) to authenticated;
grant execute on function public.rider_list_delivery_jobs_v2() to authenticated;
grant execute on function public.rider_update_delivery_status_v2(uuid,text,text,boolean) to authenticated;

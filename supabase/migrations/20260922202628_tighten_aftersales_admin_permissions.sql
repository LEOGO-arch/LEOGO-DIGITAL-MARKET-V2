
create or replace function public.admin_list_marketplace_aftersales()
returns table(
  case_id uuid,
  case_reference text,
  order_id uuid,
  order_reference text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  grand_total_kes numeric,
  delivered_at timestamptz,
  issue_type text,
  preferred_solution text,
  details text,
  evidence_path text,
  status text,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Orders read permission required';
  end if;

  return query
  select
    c.id,
    c.case_reference,
    o.id,
    o.order_reference,
    c.customer_id,
    coalesce(cp.full_name,o.receiver_name),
    coalesce(cp.phone,o.contact_number),
    o.grand_total_kes,
    coalesce(o.delivered_at,d.delivered_at),
    c.issue_type,
    c.preferred_solution,
    c.details,
    c.evidence_path,
    c.status,
    c.admin_notes,
    c.created_at,
    c.updated_at,
    c.resolved_at
  from public.marketplace_aftersales_cases c
  join public.marketplace_orders o on o.id=c.order_id
  left join public.customer_profiles cp on cp.user_id=c.customer_id
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  order by
    case c.status
      when 'submitted' then 0
      when 'in_review' then 1
      when 'contacted' then 2
      when 'resolved' then 3
      when 'rejected' then 4
      else 5
    end,
    c.created_at desc;
end
$function$;

create or replace function public.admin_update_marketplace_aftersales(
  p_case_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_case public.marketplace_aftersales_cases%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_before jsonb;
  v_title text;
  v_message text;
begin
  if not private.is_leogo_admin('orders.manage') then
    raise exception 'Orders management permission required';
  end if;

  if p_status not in ('submitted','in_review','contacted','resolved','rejected','cancelled') then
    raise exception 'Unsupported Aftersales status';
  end if;

  if char_length(coalesce(p_admin_notes,''))>3000 then
    raise exception 'Admin notes must be 3000 characters or fewer';
  end if;

  select * into v_case
  from public.marketplace_aftersales_cases
  where id=p_case_id
  for update;

  if not found then raise exception 'Aftersales case not found'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_case.order_id;

  v_before=to_jsonb(v_case);

  update public.marketplace_aftersales_cases
  set status=p_status,
      admin_notes=nullif(btrim(coalesce(p_admin_notes,'')),''),
      resolved_at=case when p_status='resolved' then coalesce(resolved_at,now()) else resolved_at end,
      updated_at=now()
  where id=p_case_id
  returning * into v_case;

  v_title=case p_status
    when 'in_review' then 'Aftersales case under review'
    when 'contacted' then 'LEOGO Customer Care follow-up'
    when 'resolved' then 'Aftersales case resolved'
    when 'rejected' then 'Aftersales case closed'
    when 'cancelled' then 'Aftersales case cancelled'
    else 'Aftersales case updated'
  end;

  v_message=case p_status
    when 'in_review' then 'LEOGO Customer Care is reviewing case '||v_case.case_reference||' for order '||v_order.order_reference||'.'
    when 'contacted' then 'LEOGO Customer Care has moved case '||v_case.case_reference||' to customer follow-up.'
    when 'resolved' then 'Aftersales case '||v_case.case_reference||' for order '||v_order.order_reference||' has been marked resolved.'
    when 'rejected' then 'Aftersales case '||v_case.case_reference||' for order '||v_order.order_reference||' has been closed after review.'
    when 'cancelled' then 'Aftersales case '||v_case.case_reference||' has been cancelled.'
    else 'Aftersales case '||v_case.case_reference||' has been updated.'
  end;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_case.customer_id,'aftersales',v_title,v_message,
    'marketplace_aftersales_case',v_case.id,'aftersales_status_'||p_status,'aftersales',
    jsonb_build_object(
      'case_reference',v_case.case_reference,
      'order_id',v_case.order_id,
      'order_reference',v_order.order_reference,
      'status',p_status
    )
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  perform private.write_admin_audit(
    'aftersales.case.'||p_status,
    'marketplace_aftersales_case',
    v_case.id::text,
    v_before,
    to_jsonb(v_case),
    jsonb_build_object('order_reference',v_order.order_reference)
  );

  return jsonb_build_object(
    'ok',true,
    'case_id',v_case.id,
    'case_reference',v_case.case_reference,
    'status',v_case.status
  );
end
$function$;

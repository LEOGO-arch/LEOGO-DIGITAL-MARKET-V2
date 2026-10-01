-- Enforce Seller shipment progression for Group / Global Orders.
-- Admin confirmation remains required before a Seller can begin preparation.

create or replace function public.seller_update_group_order_status(
  p_campaign_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  c public.group_order_campaigns%rowtype;
  v_expected_status text;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select *
  into c
  from public.group_order_campaigns
  where id=p_campaign_id
    and seller_id=v_uid
  for update;

  if not found then
    raise exception 'Seller campaign not found';
  end if;

  if p_status not in ('seller_preparing','dispatched_origin','in_transit','arrived_destination') then
    raise exception 'Seller cannot set that campaign status';
  end if;

  if c.status in ('moq_failed_closed','cancelled','refund_pending','refunded','delivered_collected') then
    raise exception 'Closed campaigns cannot be updated by Seller';
  end if;

  v_expected_status := case p_status
    when 'seller_preparing' then 'order_confirmed'
    when 'dispatched_origin' then 'seller_preparing'
    when 'in_transit' then 'dispatched_origin'
    when 'arrived_destination' then 'in_transit'
  end;

  if c.status<>v_expected_status then
    if p_status='seller_preparing' and c.status='moq_reached' then
      raise exception 'LEOGO Admin must confirm the Group Order before Seller preparation can begin';
    end if;
    raise exception 'Complete the previous Group Order stage before marking %',replace(p_status,'_',' ');
  end if;

  update public.group_order_campaigns
  set status=p_status,
      updated_at=now()
  where id=c.id;

  insert into public.group_order_shipment_events(
    campaign_id,status,event_note,actor_user_id,actor_role
  )
  values(
    c.id,
    p_status,
    nullif(btrim(coalesce(p_note,'')),''),
    v_uid,
    'seller'
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  select distinct
    customer_id,
    'group_order',
    'Group order update',
    replace(initcap(p_status),'_',' ')||coalesce(': '||nullif(btrim(coalesce(p_note,'')),''),''),
    'group_order_campaign',
    c.id,
    'group_order_'||p_status||'_'||extract(epoch from now())::bigint,
    'orders',
    jsonb_build_object('campaign_reference',c.campaign_reference)
  from public.group_order_participations
  where campaign_id=c.id
    and payment_status not in ('rejected','refunded');

  return jsonb_build_object('ok',true,'status',p_status);
end
$function$;

revoke execute on function public.seller_update_group_order_status(uuid,text,text)
from public,anon;
grant execute on function public.seller_update_group_order_status(uuid,text,text)
to authenticated;

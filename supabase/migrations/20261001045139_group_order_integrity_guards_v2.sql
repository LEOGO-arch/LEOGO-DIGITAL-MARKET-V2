-- LEOGO Group/Global Order integrity hardening.
-- Additive safeguards only; ordinary marketplace ordering remains unchanged.

create or replace function private.refresh_group_campaign_totals(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_total numeric;
  v_people int;
  v_amount numeric;
  v_paid numeric;
  v_campaign public.group_order_campaigns%rowtype;
begin
  select
    coalesce(sum(quantity),0),
    count(distinct customer_id),
    coalesce(sum(amount_kes),0),
    coalesce(sum(amount_kes) filter(where payment_status='verified_paid'),0)
  into v_total,v_people,v_amount,v_paid
  from public.group_order_participations
  where campaign_id=p_campaign_id
    and payment_status not in ('rejected','refunded');

  select *
  into v_campaign
  from public.group_order_campaigns
  where id=p_campaign_id
  for update;

  if not found then
    return;
  end if;

  update public.group_order_campaigns
  set quantity_committed=v_total,
      participant_count=v_people,
      amount_committed_kes=v_amount,
      amount_paid_kes=v_paid,
      status=case
        when status='moq_reached'
          and v_total < minimum_quantity
          and confirmed_at is null
          and now() < closing_at
        then 'collecting_orders'
        else status
      end,
      moq_reached_at=case
        when status='moq_reached'
          and v_total < minimum_quantity
          and confirmed_at is null
          and now() < closing_at
        then null
        else moq_reached_at
      end,
      closed_at=case
        when status='moq_reached'
          and v_total < minimum_quantity
          and confirmed_at is null
          and now() < closing_at
        then null
        else closed_at
      end,
      updated_at=now()
  where id=p_campaign_id;
end
$function$;

create or replace function private.close_expired_group_campaigns()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign record;
begin
  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  select distinct
    p.customer_id,
    'group_order',
    'Group order closing soon',
    'Campaign '||g.campaign_reference||' closes within 24 hours. Current quantity: '||g.quantity_committed||'/'||g.minimum_quantity||'.',
    'group_order_campaign',
    g.id,
    'group_order_closing_soon_'||g.id::text,
    'orders',
    jsonb_build_object('campaign_reference',g.campaign_reference,'closing_at',g.closing_at)
  from public.group_order_campaigns g
  join public.group_order_participations p on p.campaign_id=g.id
  where g.status in ('collecting_orders','moq_reached')
    and g.closing_at>now()
    and g.closing_at<=now()+interval '24 hours'
    and (g.closed_at is null or g.close_policy='deadline')
    and p.payment_status not in ('rejected','refunded')
  on conflict do nothing;

  insert into public.partner_notifications(
    user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
  )
  select
    g.seller_id,
    'seller',
    'group_order_closing_soon',
    'Group order closing soon',
    'Campaign '||g.campaign_reference||' closes within 24 hours at '||g.quantity_committed||'/'||g.minimum_quantity||'.',
    'group_order_campaign',
    g.id,
    'group_orders',
    jsonb_build_object('campaign_reference',g.campaign_reference,'closing_at',g.closing_at)
  from public.group_order_campaigns g
  where g.status in ('collecting_orders','moq_reached')
    and g.closing_at>now()
    and g.closing_at<=now()+interval '24 hours'
    and (g.closed_at is null or g.close_policy='deadline')
    and not exists (
      select 1
      from public.partner_notifications n
      where n.user_id=g.seller_id
        and n.source_type='group_order_campaign'
        and n.source_id=g.id
        and n.event_type='group_order_closing_soon'
    );

  for v_campaign in
    select *
    from public.group_order_campaigns
    where status in ('collecting_orders','paused','moq_reached')
      and closing_at<=now()
      and not (
        status='moq_reached'
        and close_policy='moq'
        and closed_at is not null
      )
    for update skip locked
  loop
    if v_campaign.quantity_committed < v_campaign.minimum_quantity then
      update public.group_order_campaigns
      set status='moq_failed_closed',
          closed_at=coalesce(closed_at,now()),
          refund_status=case
            when amount_paid_kes>0 then 'resolution_required'
            else 'not_required'
          end,
          updated_at=now()
      where id=v_campaign.id;

      update public.group_order_participations
      set settlement_status='blocked_refund',
          refund_status=case
            when payment_status='verified_paid' then 'pending'
            else refund_status
          end,
          updated_at=now()
      where campaign_id=v_campaign.id
        and payment_status not in ('rejected','refunded');

      insert into public.customer_notifications(
        user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
      )
      select distinct
        customer_id,
        'group_order',
        'Group order MOQ was not reached',
        'The campaign closed below its MOQ. LEOGO Admin will resolve any verified payment safely.',
        'group_order_campaign',
        v_campaign.id,
        'group_order_failed_'||v_campaign.id::text,
        'orders',
        jsonb_build_object('campaign_reference',v_campaign.campaign_reference)
      from public.group_order_participations
      where campaign_id=v_campaign.id
      on conflict do nothing;

      insert into public.partner_notifications(
        user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
      )
      select
        v_campaign.seller_id,
        'seller',
        'group_order_moq_failed',
        'Group order MOQ was not reached',
        'The campaign closed below MOQ and has been sent to Admin for resolution.',
        'group_order_campaign',
        v_campaign.id,
        'group_orders',
        jsonb_build_object('campaign_reference',v_campaign.campaign_reference)
      where not exists (
        select 1
        from public.partner_notifications n
        where n.user_id=v_campaign.seller_id
          and n.source_type='group_order_campaign'
          and n.source_id=v_campaign.id
          and n.event_type='group_order_moq_failed'
      );
    else
      update public.group_order_campaigns
      set status='moq_reached',
          moq_reached_at=coalesce(moq_reached_at,now()),
          closed_at=coalesce(closed_at,now()),
          updated_at=now()
      where id=v_campaign.id;
    end if;
  end loop;
end
$function$;

create or replace function private.guard_group_campaign_seller_term_edits()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if (select auth.uid())=old.seller_id
     and not private.is_leogo_admin('orders.manage')
     and exists (
       select 1
       from public.group_order_participations p
       where p.campaign_id=old.id
     )
     and (
       new.minimum_quantity is distinct from old.minimum_quantity
       or new.maximum_quantity is distinct from old.maximum_quantity
       or new.customer_unit_price_kes is distinct from old.customer_unit_price_kes
       or new.opening_at is distinct from old.opening_at
       or new.closing_at is distinct from old.closing_at
       or new.expected_dispatch_date is distinct from old.expected_dispatch_date
       or new.expected_delivery_from is distinct from old.expected_delivery_from
       or new.expected_delivery_to is distinct from old.expected_delivery_to
       or new.close_policy is distinct from old.close_policy
     )
  then
    raise exception 'Group order terms are locked after the first customer joins. Use LEOGO Admin controls for changes.';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_group_campaign_lock_seller_terms on public.group_order_campaigns;
create trigger trg_group_campaign_lock_seller_terms
before update on public.group_order_campaigns
for each row
execute function private.guard_group_campaign_seller_term_edits();

create or replace function private.guard_group_product_fulfilment_change()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if old.fulfilment_type='group_order'
     and new.fulfilment_type<>'group_order'
     and (select auth.uid())=old.seller_id
     and not private.is_leogo_admin('orders.manage')
     and exists (
       select 1
       from public.group_order_campaigns g
       where g.product_id=old.id
         and g.status in (
           'collecting_orders','paused','moq_reached','order_confirmed',
           'seller_preparing','dispatched_origin','in_transit',
           'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup'
         )
     )
  then
    raise exception 'An active Group Order exists for this product. LEOGO Admin must close or cancel it before changing the order type.';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_group_product_fulfilment_guard on public.seller_products;
create trigger trg_group_product_fulfilment_guard
before update of fulfilment_type on public.seller_products
for each row
execute function private.guard_group_product_fulfilment_change();

create or replace function public.customer_join_group_order(
  p_campaign_id uuid,
  p_quantity numeric,
  p_payment_method text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  c public.group_order_campaigns%rowtype;
  v_id uuid;
  v_ref text;
  v_new_qty numeric;
  v_moq_new boolean:=false;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  if p_quantity is null or p_quantity<=0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_payment_method not in ('till','paybill','bank','wallet','cod') then
    raise exception 'Choose a supported LEOGO payment method';
  end if;
  if p_payment_method in ('till','paybill','bank')
     and char_length(btrim(coalesce(p_payment_reference,'')))<3 then
    raise exception 'Enter the payment reference';
  end if;

  perform private.close_expired_group_campaigns();

  select *
  into c
  from public.group_order_campaigns
  where id=p_campaign_id
  for update;

  if not found then
    raise exception 'Group order not found';
  end if;

  if not exists (
    select 1
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    where p.id=c.product_id
      and p.seller_id=c.seller_id
      and p.fulfilment_type='group_order'
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and s.application_status='approved'
  ) then
    raise exception 'This Group Order product is not currently available';
  end if;

  if c.status not in ('collecting_orders','moq_reached') then
    raise exception 'This campaign is not accepting new orders';
  end if;
  if now()<c.opening_at then
    raise exception 'This campaign has not opened yet';
  end if;
  if now()>=c.closing_at then
    raise exception 'This campaign has closed';
  end if;
  if c.close_policy='moq' and c.quantity_committed>=c.minimum_quantity then
    raise exception 'This campaign closed when MOQ was reached';
  end if;

  v_new_qty:=c.quantity_committed+p_quantity;
  if c.maximum_quantity is not null and v_new_qty>c.maximum_quantity then
    raise exception 'Only % units remain available',greatest(c.maximum_quantity-c.quantity_committed,0);
  end if;

  v_ref:='JOIN-'||to_char(clock_timestamp() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.group_order_participations(
    participation_reference,campaign_id,customer_id,quantity,unit_price_kes,amount_kes,
    payment_method,payment_reference,payment_status
  )
  values(
    v_ref,c.id,v_uid,p_quantity,c.customer_unit_price_kes,
    round(p_quantity*c.customer_unit_price_kes,2),
    p_payment_method,
    nullif(btrim(coalesce(p_payment_reference,'')),''),
    'submitted'
  )
  returning id into v_id;

  perform private.refresh_group_campaign_totals(c.id);
  select * into c from public.group_order_campaigns where id=c.id;

  if c.quantity_committed>=c.minimum_quantity and c.status='collecting_orders' then
    v_moq_new:=true;
    update public.group_order_campaigns
    set status='moq_reached',
        moq_reached_at=now(),
        closed_at=case when close_policy='moq' then now() else closed_at end,
        updated_at=now()
    where id=c.id;

    insert into public.partner_notifications(
      user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
    )
    values(
      c.seller_id,'seller','group_order_moq_reached','Group order MOQ reached',
      'Your campaign reached its MOQ. You may begin preparation after Admin confirms the order.',
      'group_order_campaign',c.id,'group_orders',
      jsonb_build_object('campaign_reference',c.campaign_reference)
    );

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    select distinct
      customer_id,'group_order','Group order MOQ reached',
      'The MOQ target has been reached. Follow shipment progress in My Activity.',
      'group_order_campaign',c.id,'group_order_moq_'||c.id::text,'orders',
      jsonb_build_object('campaign_reference',c.campaign_reference)
    from public.group_order_participations
    where campaign_id=c.id
    on conflict do nothing;
  end if;

  insert into public.partner_notifications(
    user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
  )
  values(
    c.seller_id,'seller','group_order_joined','Customer joined group order',
    'A customer committed '||p_quantity||' unit(s) to '||c.campaign_reference||'.',
    'group_order_campaign',c.id,'group_orders',
    jsonb_build_object('participation_id',v_id,'quantity',p_quantity)
  );

  return jsonb_build_object(
    'ok',true,
    'participation_id',v_id,
    'participation_reference',v_ref,
    'campaign_id',c.id,
    'quantity_committed',c.quantity_committed,
    'minimum_quantity',c.minimum_quantity,
    'moq_reached_now',v_moq_new
  );
end
$function$;

create or replace function public.admin_manage_group_order(
  p_campaign_id uuid,
  p_action text,
  p_value text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  c public.group_order_campaigns%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_status text;
begin
  if not private.is_leogo_admin('orders.manage') then
    raise exception 'Admin order management permission required';
  end if;

  perform private.close_expired_group_campaigns();

  select *
  into c
  from public.group_order_campaigns
  where id=p_campaign_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  v_before:=to_jsonb(c);

  if p_action='pause' then
    if c.status not in ('collecting_orders','moq_reached') then
      raise exception 'Only an open Group Order can be paused';
    end if;
    v_status:='paused';

  elsif p_action='resume' then
    if c.status<>'paused' then
      raise exception 'Only a paused Group Order can be resumed';
    end if;
    if c.closing_at<=now() then
      raise exception 'Extend the closing date before resuming this campaign';
    end if;
    v_status:=case
      when c.quantity_committed>=c.minimum_quantity then 'moq_reached'
      else 'collecting_orders'
    end;

  elsif p_action='extend' then
    if c.status not in ('collecting_orders','paused','moq_reached') then
      raise exception 'This Group Order can no longer be extended';
    end if;
    if p_value is null or p_value::timestamptz<=now() then
      raise exception 'Choose a future closing date';
    end if;
    if c.close_policy='moq' and c.quantity_committed>=c.minimum_quantity then
      raise exception 'This campaign is configured to close when MOQ is reached';
    end if;
    update public.group_order_campaigns
    set closing_at=p_value::timestamptz,
        closed_at=null,
        updated_at=now(),
        admin_notes=nullif(btrim(coalesce(p_notes,'')),'')
    where id=c.id;

  elsif p_action='close' then
    if c.status not in ('collecting_orders','paused','moq_reached') then
      raise exception 'This Group Order cannot be manually closed from its current stage';
    end if;
    v_status:=case
      when c.quantity_committed>=c.minimum_quantity then 'moq_reached'
      else 'moq_failed_closed'
    end;

  elsif p_action='confirm' then
    if c.status<>'moq_reached' then
      raise exception 'MOQ must be reached before Admin confirmation';
    end if;
    if c.quantity_committed<c.minimum_quantity then
      raise exception 'MOQ has not been reached';
    end if;
    if exists (
      select 1
      from public.group_order_participations p
      where p.campaign_id=c.id
        and p.payment_status='submitted'
    ) then
      raise exception 'Review all submitted Group Order payments before confirming the order';
    end if;
    v_status:='order_confirmed';

  elsif p_action='cancel' then
    if c.status in ('delivered_collected','refunded','cancelled') then
      raise exception 'This Group Order is already closed';
    end if;
    v_status:='cancelled';

  elsif p_action='start_refund' then
    if c.status not in ('moq_failed_closed','cancelled','refund_pending') then
      raise exception 'Refund resolution is available only for a failed or cancelled Group Order';
    end if;
    if not exists (
      select 1
      from public.group_order_participations p
      where p.campaign_id=c.id
        and p.payment_status='verified_paid'
        and p.refund_status in ('pending','processing','not_required')
    ) then
      raise exception 'There are no verified payments requiring refund';
    end if;
    v_status:='refund_pending';

  elsif p_action='arrived_destination' then
    if c.status<>'in_transit' then
      raise exception 'The Group Order must be In Transit before it can arrive at destination';
    end if;
    v_status:='arrived_destination';

  elsif p_action='at_sorting_center' then
    if c.status<>'arrived_destination' then
      raise exception 'Arrival at destination must be recorded before Sorting Center receipt';
    end if;
    v_status:='at_sorting_center';

  elsif p_action='out_for_delivery' then
    if c.status<>'at_sorting_center' then
      raise exception 'Sorting Center receipt must be recorded before dispatch';
    end if;
    v_status:='out_for_delivery';

  elsif p_action='ready_pickup' then
    if c.status<>'out_for_delivery' then
      raise exception 'Out for Delivery must be recorded before Ready for Pickup';
    end if;
    v_status:='ready_pickup';

  elsif p_action='delivered_collected' then
    if c.status<>'ready_pickup' then
      raise exception 'Ready for Pickup must be recorded before Delivered / Collected';
    end if;
    v_status:='delivered_collected';

  else
    raise exception 'Unsupported Admin action';
  end if;

  if v_status is not null then
    update public.group_order_campaigns
    set status=v_status,
        closed_at=case
          when p_action='close' then coalesce(closed_at,now())
          when v_status in ('moq_failed_closed','cancelled') then coalesce(closed_at,now())
          else closed_at
        end,
        confirmed_at=case
          when v_status='order_confirmed' then now()
          else confirmed_at
        end,
        refund_status=case
          when v_status='refund_pending' then 'in_progress'
          when v_status in ('moq_failed_closed','cancelled') and amount_paid_kes>0 then 'resolution_required'
          else refund_status
        end,
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        updated_at=now()
    where id=c.id;

    if v_status in ('moq_failed_closed','cancelled','refund_pending') then
      update public.group_order_participations
      set settlement_status='blocked_refund',
          refund_status=case
            when payment_status='verified_paid' then
              case when v_status='refund_pending' then 'processing' else 'pending' end
            else refund_status
          end,
          updated_at=now()
      where campaign_id=c.id
        and payment_status not in ('rejected','refunded');
    end if;

    if v_status='delivered_collected' then
      update public.group_order_participations
      set settlement_status='eligible',
          updated_at=now()
      where campaign_id=c.id
        and payment_status='verified_paid'
        and settlement_status='held';
    end if;

    insert into public.group_order_shipment_events(
      campaign_id,status,event_note,actor_user_id,actor_role
    )
    values(
      c.id,v_status,nullif(btrim(coalesce(p_notes,'')),''),(select auth.uid()),'admin'
    );
  end if;

  select to_jsonb(x)
  into v_after
  from public.group_order_campaigns x
  where id=c.id;

  perform private.write_admin_audit(
    'group_order.'||p_action,
    'group_order_campaign',
    c.id::text,
    v_before,
    v_after,
    jsonb_build_object('value',p_value,'notes',p_notes)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  select distinct
    customer_id,
    'group_order',
    'Group order status updated',
    'Campaign '||c.campaign_reference||' is now '||
      replace(coalesce(v_status,case when p_action='extend' then 'deadline extended' else 'updated' end),'_',' ')||'.',
    'group_order_campaign',
    c.id,
    'group_order_admin_'||p_action||'_'||extract(epoch from now())::bigint,
    'orders',
    jsonb_build_object('campaign_reference',c.campaign_reference)
  from public.group_order_participations
  where campaign_id=c.id;

  return v_after;
end
$function$;

create or replace function public.admin_review_group_order_payment(
  p_participation_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  p public.group_order_participations%rowtype;
  c public.group_order_campaigns%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_terminal_refund boolean:=false;
begin
  if not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Payment verification permission required';
  end if;
  if p_decision not in ('verify','reject') then
    raise exception 'Unsupported payment decision';
  end if;

  perform private.close_expired_group_campaigns();

  select *
  into p
  from public.group_order_participations
  where id=p_participation_id
  for update;

  if not found then
    raise exception 'Participation not found';
  end if;
  if p.payment_status<>'submitted' then
    raise exception 'Payment has already been reviewed';
  end if;

  select *
  into c
  from public.group_order_campaigns
  where id=p.campaign_id
  for update;

  if c.status='refunded' then
    raise exception 'This Group Order has already completed refund resolution';
  end if;

  v_before:=to_jsonb(p);
  v_terminal_refund:=c.status in ('moq_failed_closed','cancelled','refund_pending');

  update public.group_order_participations
  set payment_status=case when p_decision='verify' then 'verified_paid' else 'rejected' end,
      payment_verified_at=now(),
      payment_verified_by=(select auth.uid()),
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      settlement_status=case
        when p_decision='reject' then 'blocked_refund'
        when c.status='delivered_collected' then 'eligible'
        when v_terminal_refund then 'blocked_refund'
        else 'held'
      end,
      refund_status=case
        when p_decision='verify' and v_terminal_refund then
          case when c.status='refund_pending' then 'processing' else 'pending' end
        else refund_status
      end,
      updated_at=now()
  where id=p.id;

  perform private.refresh_group_campaign_totals(p.campaign_id);

  if p_decision='verify' and v_terminal_refund then
    update public.group_order_campaigns
    set refund_status=case
          when status='refund_pending' then 'in_progress'
          else 'resolution_required'
        end,
        updated_at=now()
    where id=p.campaign_id;
  end if;

  select to_jsonb(x)
  into v_after
  from public.group_order_participations x
  where id=p.id;

  perform private.write_admin_audit(
    'group_order.payment.'||p_decision,
    'group_order_participation',
    p.id::text,
    v_before,
    v_after,
    jsonb_build_object('campaign_id',p.campaign_id,'notes',p_notes)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    p.customer_id,
    'group_order',
    case when p_decision='verify' then 'Group order payment verified' else 'Group order payment rejected' end,
    case
      when p_decision='verify' and v_terminal_refund
        then 'Your payment was verified after the campaign closed and is queued for Admin refund resolution.'
      when p_decision='verify'
        then 'Your group order payment is verified and remains safely held until campaign conditions are met.'
      else 'Your group order payment proof was rejected. Open My Activity for details.'
    end,
    'group_order_participation',
    p.id,
    'group_order_payment_'||p_decision,
    'orders',
    jsonb_build_object('campaign_id',p.campaign_id)
  );

  return v_after;
end
$function$;

create or replace function public.admin_complete_group_order_refund(
  p_participation_id uuid,
  p_reference text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  p public.group_order_participations%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('orders.manage')
     and not private.is_leogo_admin('settlements.manage') then
    raise exception 'Refund management permission required';
  end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then
    raise exception 'Refund reference is required';
  end if;

  select *
  into p
  from public.group_order_participations
  where id=p_participation_id
  for update;

  if not found then
    raise exception 'Participation not found';
  end if;
  if p.payment_status<>'verified_paid'
     or p.refund_status not in ('pending','processing') then
    raise exception 'Participation is not eligible for refund completion';
  end if;

  v_before:=to_jsonb(p);

  update public.group_order_participations
  set payment_status='refunded',
      settlement_status='blocked_refund',
      refund_status='refunded',
      refund_reference=btrim(p_reference),
      refunded_at=now(),
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=p.id;

  perform private.refresh_group_campaign_totals(p.campaign_id);

  if not exists (
    select 1
    from public.group_order_participations
    where campaign_id=p.campaign_id
      and payment_status='verified_paid'
      and refund_status in ('pending','processing')
  ) then
    update public.group_order_campaigns
    set refund_status='completed',
        status='refunded',
        updated_at=now()
    where id=p.campaign_id
      and status in ('refund_pending','moq_failed_closed','cancelled');
  end if;

  select to_jsonb(x)
  into v_after
  from public.group_order_participations x
  where id=p.id;

  perform private.write_admin_audit(
    'group_order.refund.completed',
    'group_order_participation',
    p.id::text,
    v_before,
    v_after,
    jsonb_build_object('reference',btrim(p_reference),'notes',p_notes)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    p.customer_id,
    'group_order',
    'Group order refund completed',
    'LEOGO completed your refund. Reference: '||btrim(p_reference)||'.',
    'group_order_participation',
    p.id,
    'group_order_refunded',
    'orders',
    jsonb_build_object('refund_reference',btrim(p_reference))
  );

  return v_after;
end
$function$;

revoke execute on function private.refresh_group_campaign_totals(uuid) from public,anon,authenticated;
revoke execute on function private.close_expired_group_campaigns() from public,anon,authenticated;
revoke execute on function private.guard_group_campaign_seller_term_edits() from public,anon,authenticated;
revoke execute on function private.guard_group_product_fulfilment_change() from public,anon,authenticated;

revoke execute on function public.customer_join_group_order(uuid,numeric,text,text) from public,anon;
grant execute on function public.customer_join_group_order(uuid,numeric,text,text) to authenticated;

revoke execute on function public.admin_manage_group_order(uuid,text,text,text) from public,anon;
grant execute on function public.admin_manage_group_order(uuid,text,text,text) to authenticated;

revoke execute on function public.admin_review_group_order_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_group_order_payment(uuid,text,text) to authenticated;

revoke execute on function public.admin_complete_group_order_refund(uuid,text,text) from public,anon;
grant execute on function public.admin_complete_group_order_refund(uuid,text,text) to authenticated;

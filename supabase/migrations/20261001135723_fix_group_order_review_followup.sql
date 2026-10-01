-- Focused PR4 follow-up. Preserve ordinary marketplace, Rider and Pickup RPCs.
-- Replace existing functions with the same signatures and existing ACLs.
CREATE OR REPLACE FUNCTION private.close_expired_group_campaigns()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and quantity_committed>=minimum_quantity
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

CREATE OR REPLACE FUNCTION public.admin_complete_group_order_refund(p_participation_id uuid, p_reference text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and payment_status in ('submitted','verified_paid')
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

CREATE OR REPLACE FUNCTION public.admin_review_group_order_payment(p_participation_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- A rejected commitment can invalidate MOQ even after close-at-MOQ.
  if p_decision='reject' then
    perform private.close_expired_group_campaigns();
  end if;

  -- Reviewing the final outstanding proof also finishes refund resolution.
  update public.group_order_campaigns g
  set status='refunded',refund_status='completed',updated_at=now()
  where g.id=p.campaign_id
    and g.status in ('moq_failed_closed','cancelled','refund_pending')
    and exists(select 1 from public.group_order_participations gp
      where gp.campaign_id=g.id and gp.payment_status='refunded')
    and not exists(select 1 from public.group_order_participations gp
      where gp.campaign_id=g.id and gp.payment_status in ('submitted','verified_paid'));

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

CREATE OR REPLACE FUNCTION public.seller_save_product_shipping(p_product_id uuid, p_shipping jsonb, p_campaign jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid()); v_product public.seller_products%rowtype; v_campaign_id uuid; v_type text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_product from public.seller_products where id=p_product_id and seller_id=v_uid for update;
  if not found then raise exception 'Seller product not found'; end if;
  v_type:=coalesce(nullif(p_shipping->>'fulfilment_type',''),'normal');
  if v_type not in ('normal','preorder','group_order') then raise exception 'Invalid order type'; end if;
  update public.seller_products set fulfilment_type=v_type,updated_at=now() where id=p_product_id;
  insert into public.product_shipping_profiles(product_id,seller_id,origin_type,origin_country,origin_county_region,origin_town_city,dispatch_details,
    same_town_min,same_town_max,same_town_unit,same_county_min,same_county_max,same_county_unit,inter_county_min,inter_county_max,inter_county_unit,
    international_min,international_max,international_unit,expected_dispatch_date,expected_delivery_from,expected_delivery_to,updated_at)
  values(p_product_id,v_uid,coalesce(nullif(p_shipping->>'origin_type',''),'domestic'),nullif(btrim(coalesce(p_shipping->>'origin_country','')),''),
    nullif(btrim(coalesce(p_shipping->>'origin_county_region','')),''),nullif(btrim(coalesce(p_shipping->>'origin_town_city','')),''),nullif(btrim(coalesce(p_shipping->>'dispatch_details','')),''),
    nullif(p_shipping->>'same_town_min','')::numeric,nullif(p_shipping->>'same_town_max','')::numeric,nullif(p_shipping->>'same_town_unit',''),
    nullif(p_shipping->>'same_county_min','')::numeric,nullif(p_shipping->>'same_county_max','')::numeric,nullif(p_shipping->>'same_county_unit',''),
    nullif(p_shipping->>'inter_county_min','')::numeric,nullif(p_shipping->>'inter_county_max','')::numeric,nullif(p_shipping->>'inter_county_unit',''),
    nullif(p_shipping->>'international_min','')::numeric,nullif(p_shipping->>'international_max','')::numeric,nullif(p_shipping->>'international_unit',''),
    nullif(p_shipping->>'expected_dispatch_date','')::date,nullif(p_shipping->>'expected_delivery_from','')::date,nullif(p_shipping->>'expected_delivery_to','')::date,now())
  on conflict(product_id) do update set origin_type=excluded.origin_type,origin_country=excluded.origin_country,origin_county_region=excluded.origin_county_region,
    origin_town_city=excluded.origin_town_city,dispatch_details=excluded.dispatch_details,same_town_min=excluded.same_town_min,same_town_max=excluded.same_town_max,
    same_town_unit=excluded.same_town_unit,same_county_min=excluded.same_county_min,same_county_max=excluded.same_county_max,same_county_unit=excluded.same_county_unit,
    inter_county_min=excluded.inter_county_min,inter_county_max=excluded.inter_county_max,inter_county_unit=excluded.inter_county_unit,
    international_min=excluded.international_min,international_max=excluded.international_max,international_unit=excluded.international_unit,
    expected_dispatch_date=excluded.expected_dispatch_date,expected_delivery_from=excluded.expected_delivery_from,expected_delivery_to=excluded.expected_delivery_to,updated_at=now();
  if v_type='group_order' then
    if p_campaign is null then raise exception 'Group order settings are required'; end if;
    if coalesce((p_campaign->>'minimum_quantity')::numeric,0)<=0 then raise exception 'MOQ must be greater than zero'; end if;
    select id into v_campaign_id from public.group_order_campaigns where product_id=p_product_id and status in ('collecting_orders','paused','moq_reached','order_confirmed','seller_preparing','dispatched_origin','in_transit','arrived_destination','at_sorting_center','out_for_delivery','ready_pickup') order by created_at desc limit 1 for update;
    if v_campaign_id is null then
      insert into public.group_order_campaigns(campaign_reference,product_id,seller_id,minimum_quantity,maximum_quantity,customer_unit_price_kes,opening_at,closing_at,expected_dispatch_date,expected_delivery_from,expected_delivery_to,close_policy)
      values(private.group_campaign_reference(),p_product_id,v_uid,(p_campaign->>'minimum_quantity')::numeric,nullif(p_campaign->>'maximum_quantity','')::numeric,
        (p_campaign->>'customer_unit_price_kes')::numeric,(p_campaign->>'opening_at')::timestamptz,(p_campaign->>'closing_at')::timestamptz,
        (p_campaign->>'expected_dispatch_date')::date,(p_campaign->>'expected_delivery_from')::date,nullif(p_campaign->>'expected_delivery_to','')::date,
        coalesce(nullif(p_campaign->>'close_policy',''),'deadline')) returning id into v_campaign_id;
    else
      -- Reuse the active campaign without resetting status or creating a second one.
      -- Existing triggers reject changes to committed terms, including price/MOQ.
      update public.group_order_campaigns
      set minimum_quantity=(p_campaign->>'minimum_quantity')::numeric,
          maximum_quantity=nullif(p_campaign->>'maximum_quantity','')::numeric,
          customer_unit_price_kes=(p_campaign->>'customer_unit_price_kes')::numeric,
          opening_at=(p_campaign->>'opening_at')::timestamptz,
          closing_at=(p_campaign->>'closing_at')::timestamptz,
          expected_dispatch_date=(p_campaign->>'expected_dispatch_date')::date,
          expected_delivery_from=(p_campaign->>'expected_delivery_from')::date,
          expected_delivery_to=nullif(p_campaign->>'expected_delivery_to','')::date,
          close_policy=coalesce(nullif(p_campaign->>'close_policy',''),'deadline'),
          updated_at=now()
      where id=v_campaign_id;
    end if;
  end if;
  return jsonb_build_object('ok',true,'product_id',p_product_id,'campaign_id',v_campaign_id);
end $function$;


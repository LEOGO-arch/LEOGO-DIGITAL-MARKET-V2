-- Fix PL/pgSQL record-variable shadowing in Group/Global Order expiry processing.
-- The previous function declared "c record" and also used "c" as a SQL table alias,
-- which caused public customer/seller catalogue RPCs to fail before any campaigns existed.

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
    where status in ('collecting_orders','paused')
      and closing_at<=now()
    for update skip locked
  loop
    if v_campaign.quantity_committed < v_campaign.minimum_quantity then
      update public.group_order_campaigns
      set status='moq_failed_closed',
          closed_at=now(),
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

    elsif v_campaign.quantity_committed >= v_campaign.minimum_quantity then
      update public.group_order_campaigns
      set status='moq_reached',
          moq_reached_at=coalesce(moq_reached_at,now()),
          closed_at=now(),
          updated_at=now()
      where id=v_campaign.id;
    end if;
  end loop;
end
$function$;

revoke execute on function private.close_expired_group_campaigns()
from public,anon,authenticated;

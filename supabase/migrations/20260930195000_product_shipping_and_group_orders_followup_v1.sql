-- LEOGO shipping/MOQ follow-up: FK indexes and idempotent closing-soon notifications.
create index if not exists group_order_participations_payment_verified_by_idx
  on public.group_order_participations(payment_verified_by)
  where payment_verified_by is not null;
create index if not exists group_order_shipment_events_actor_user_idx
  on public.group_order_shipment_events(actor_user_id)
  where actor_user_id is not null;

create or replace function private.close_expired_group_campaigns()
returns void language plpgsql security definer set search_path='' as $$
declare c record;
begin
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  select distinct p.customer_id,'group_order','Group order closing soon',
    'Campaign '||c.campaign_reference||' closes within 24 hours. Current quantity: '||c.quantity_committed||'/'||c.minimum_quantity||'.',
    'group_order_campaign',c.id,'group_order_closing_soon_'||c.id::text,'orders',
    jsonb_build_object('campaign_reference',c.campaign_reference,'closing_at',c.closing_at)
  from public.group_order_campaigns c
  join public.group_order_participations p on p.campaign_id=c.id
  where c.status in ('collecting_orders','moq_reached')
    and c.closing_at>now() and c.closing_at<=now()+interval '24 hours'
    and p.payment_status not in ('rejected','refunded')
  on conflict do nothing;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  select c.seller_id,'seller','group_order_closing_soon','Group order closing soon',
    'Campaign '||c.campaign_reference||' closes within 24 hours at '||c.quantity_committed||'/'||c.minimum_quantity||'.',
    'group_order_campaign',c.id,'group_orders',jsonb_build_object('campaign_reference',c.campaign_reference,'closing_at',c.closing_at)
  from public.group_order_campaigns c
  where c.status in ('collecting_orders','moq_reached')
    and c.closing_at>now() and c.closing_at<=now()+interval '24 hours'
    and not exists (
      select 1 from public.partner_notifications n
      where n.user_id=c.seller_id and n.source_type='group_order_campaign' and n.source_id=c.id
        and n.event_type='group_order_closing_soon'
    );

  for c in select * from public.group_order_campaigns
    where status in ('collecting_orders','paused') and closing_at<=now() for update skip locked
  loop
    if c.quantity_committed < c.minimum_quantity then
      update public.group_order_campaigns set status='moq_failed_closed',closed_at=now(),
        refund_status=case when amount_paid_kes>0 then 'resolution_required' else 'not_required' end,updated_at=now()
      where id=c.id;
      update public.group_order_participations set settlement_status='blocked_refund',
        refund_status=case when payment_status='verified_paid' then 'pending' else refund_status end,updated_at=now()
      where campaign_id=c.id and payment_status not in ('rejected','refunded');
      insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
      select distinct customer_id,'group_order','Group order MOQ was not reached',
        'The campaign closed below its MOQ. LEOGO Admin will resolve any verified payment safely.',
        'group_order_campaign',c.id,'group_order_failed_'||c.id::text,'orders',
        jsonb_build_object('campaign_reference',c.campaign_reference)
      from public.group_order_participations where campaign_id=c.id on conflict do nothing;
      insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
      select c.seller_id,'seller','group_order_moq_failed','Group order MOQ was not reached',
        'The campaign closed below MOQ and has been sent to Admin for resolution.',
        'group_order_campaign',c.id,'group_orders',jsonb_build_object('campaign_reference',c.campaign_reference)
      where not exists (
        select 1 from public.partner_notifications n
        where n.user_id=c.seller_id and n.source_type='group_order_campaign' and n.source_id=c.id
          and n.event_type='group_order_moq_failed'
      );
    elsif c.quantity_committed>=c.minimum_quantity then
      update public.group_order_campaigns set status='moq_reached',
        moq_reached_at=coalesce(moq_reached_at,now()),closed_at=now(),updated_at=now() where id=c.id;
    end if;
  end loop;
end $$;

revoke execute on function private.close_expired_group_campaigns() from public,anon,authenticated;
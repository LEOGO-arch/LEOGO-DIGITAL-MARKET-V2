-- Seller subscription reminders and expiry notifications.
-- Keeps the current billing/approval workflow unchanged; this only produces
-- idempotent Partner Portal notifications around the existing ends_at value.

create unique index if not exists partner_subscription_notification_dedupe_uidx
  on public.partner_notifications(user_id,partner_type,event_type,source_id)
  where source_type='partner_subscription'
    and event_type in ('subscription_expiry_reminder','subscription_expired')
    and source_id is not null;

create or replace function private.process_seller_subscription_notifications()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reminders integer:=0;
  v_expired integer:=0;
begin
  insert into public.partner_notifications(
    user_id,partner_type,event_type,title,message,
    source_type,source_id,action_view,metadata
  )
  select
    s.user_id,
    'seller',
    'subscription_expiry_reminder',
    'Seller subscription expires in 5 days',
    'Your Seller subscription is due to expire on '
      ||to_char(timezone('Africa/Nairobi',s.ends_at),'DD Mon YYYY, HH24:MI')
      ||'. Open Subscription & Billing to submit your renewal early so Admin can verify it before expiry.',
    'partner_subscription',
    s.last_payment_id,
    'subscription',
    jsonb_build_object(
      'subscription_ends_at',s.ends_at,
      'reminder_window','5_days_before',
      'last_payment_id',s.last_payment_id
    )
  from public.partner_subscriptions s
  where s.partner_type='seller'
    and s.subscription_status='active'
    and s.ends_at>now()
    and s.ends_at<=now()+interval '5 days'
  on conflict do nothing;

  get diagnostics v_reminders = row_count;

  insert into public.partner_notifications(
    user_id,partner_type,event_type,title,message,
    source_type,source_id,action_view,metadata
  )
  select
    s.user_id,
    'seller',
    'subscription_expired',
    'Seller subscription expired',
    'Your Seller subscription expired on '
      ||to_char(timezone('Africa/Nairobi',s.ends_at),'DD Mon YYYY, HH24:MI')
      ||'. Open Subscription & Billing to submit a renewal payment for Admin verification.',
    'partner_subscription',
    s.last_payment_id,
    'subscription',
    jsonb_build_object(
      'subscription_ends_at',s.ends_at,
      'last_payment_id',s.last_payment_id
    )
  from public.partner_subscriptions s
  where s.partner_type='seller'
    and s.subscription_status='active'
    and s.ends_at<=now()
  on conflict do nothing;

  get diagnostics v_expired = row_count;

  return jsonb_build_object(
    'ok',true,
    'reminders_created',v_reminders,
    'expiry_notifications_created',v_expired,
    'processed_at',now()
  );
end
$function$;

revoke execute on function private.process_seller_subscription_notifications()
  from public,anon,authenticated;

-- Run hourly so the five-day reminder and expiry notice are created promptly.
do $cron$
begin
  if exists(
    select 1 from cron.job
    where jobname='leogo-seller-subscription-notifications'
  ) then
    perform cron.unschedule('leogo-seller-subscription-notifications');
  end if;

  perform cron.schedule(
    'leogo-seller-subscription-notifications',
    '17 * * * *',
    'select private.process_seller_subscription_notifications();'
  );
end
$cron$;

-- Seed any reminder/expiry that is already due when this migration is applied.
select private.process_seller_subscription_notifications();

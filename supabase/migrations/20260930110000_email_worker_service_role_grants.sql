-- Explicit least-privilege grants for the transactional email Edge Function.
-- Customer and Admin browser roles retain no direct access to the outbox or encrypted sender settings.

revoke all on table public.order_email_outbox from anon,authenticated;
revoke all on table public.email_notification_settings from anon,authenticated;

grant select,update on table public.order_email_outbox to service_role;
grant select on table public.email_notification_settings to service_role;

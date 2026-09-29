-- Allow Pickup Station Partner notifications in the shared Partner notification channel.
alter table public.partner_notifications
  drop constraint if exists partner_notifications_partner_type_check;
alter table public.partner_notifications
  add constraint partner_notifications_partner_type_check
  check (partner_type = any(array[
    'seller'::text,'transport'::text,'service'::text,'service_provider'::text,
    'cyber'::text,'premium'::text,'accommodation'::text,'pickup_station'::text
  ]));

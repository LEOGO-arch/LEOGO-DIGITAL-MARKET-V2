-- LEOGO DIGITAL MARKET
-- Allow Service Provider notifications in the shared partner notification table.
-- Keeps all previously allowed partner types unchanged.

alter table public.partner_notifications
  drop constraint if exists partner_notifications_partner_type_check;

alter table public.partner_notifications
  add constraint partner_notifications_partner_type_check
  check (
    partner_type = any (
      array[
        'seller'::text,
        'transport'::text,
        'service'::text,
        'service_provider'::text,
        'cyber'::text,
        'premium'::text,
        'accommodation'::text
      ]
    )
  );

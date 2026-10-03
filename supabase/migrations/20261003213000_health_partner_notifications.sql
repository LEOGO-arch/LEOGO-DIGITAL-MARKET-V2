-- Allow Health & Medicine partner notifications through the existing shared notification table.
alter table public.partner_notifications
  drop constraint if exists partner_notifications_partner_type_check;

alter table public.partner_notifications
  add constraint partner_notifications_partner_type_check
  check (partner_type in (
    'seller','transport','service','service_provider','cyber','premium','accommodation','pickup_station','health_medicine'
  ));

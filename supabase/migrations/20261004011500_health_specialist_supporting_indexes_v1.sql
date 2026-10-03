-- Health Specialist V1 supporting indexes identified by Supabase performance advisor.
create index if not exists health_specialist_services_approved_by_idx
  on public.health_specialist_services(approved_by)
  where approved_by is not null;

create index if not exists health_specialist_bookings_service_idx
  on public.health_specialist_bookings(service_id);

create index if not exists health_specialist_bookings_payment_account_idx
  on public.health_specialist_bookings(payment_account_id)
  where payment_account_id is not null;

create index if not exists health_specialist_bookings_payment_verified_by_idx
  on public.health_specialist_bookings(payment_verified_by)
  where payment_verified_by is not null;

create index if not exists health_medicine_settings_updated_by_idx
  on public.health_medicine_settings(updated_by)
  where updated_by is not null;

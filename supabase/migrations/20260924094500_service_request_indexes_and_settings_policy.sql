-- Complete FK coverage and give Admin a policy-backed read path for the
-- singleton service marketplace settings record.

create index if not exists service_requests_service_id_idx
  on public.service_requests (service_id);
create index if not exists service_requests_fee_account_id_idx
  on public.service_requests (quotation_fee_account_id)
  where quotation_fee_account_id is not null;
create index if not exists service_requests_payment_verified_by_idx
  on public.service_requests (payment_verified_by)
  where payment_verified_by is not null;
create index if not exists service_requests_dispatched_by_idx
  on public.service_requests (dispatched_by)
  where dispatched_by is not null;
create index if not exists service_marketplace_settings_updated_by_idx
  on public.service_marketplace_settings (updated_by)
  where updated_by is not null;

drop policy if exists "Admins read service marketplace settings"
  on public.service_marketplace_settings;
create policy "Admins read service marketplace settings"
on public.service_marketplace_settings for select to authenticated
using (
  private.is_leogo_admin('settings.read')
  or private.is_leogo_admin('approvals.read')
);

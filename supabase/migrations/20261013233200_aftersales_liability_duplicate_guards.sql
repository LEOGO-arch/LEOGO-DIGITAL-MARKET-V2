-- Avoid duplicate pending/approved charges when the Aftersales case has no return ID.
drop index if exists public.afs_liability_active_unique;
create unique index if not exists afs_liability_active_unique on public.aftersales_liability_cases
 (aftersales_case_id,coalesce(return_id,'00000000-0000-0000-0000-000000000000'::uuid),liability_type,liable_account_id,charge_reason)
 where status in ('pending_review','approved');
-- Require full documented parcel value for loss charges.
alter table public.aftersales_liability_cases add constraint afs_liability_total_loss_amount_guard
 check(charge_reason not in ('total_loss','station_loss') or assessed_amount_kes=parcel_value_kes);
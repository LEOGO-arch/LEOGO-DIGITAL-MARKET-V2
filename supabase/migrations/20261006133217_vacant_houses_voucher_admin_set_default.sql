
alter table public.vacant_house_settings
  alter column voucher_enabled set default false,
  alter column submission_voucher_kes set default 0;

update public.vacant_house_settings
set voucher_enabled=false,
    submission_voucher_kes=0,
    updated_at=now()
where id=1
  and updated_by is null
  and submission_voucher_kes=100;

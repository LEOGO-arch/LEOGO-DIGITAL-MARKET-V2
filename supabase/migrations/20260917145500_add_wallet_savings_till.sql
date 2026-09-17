alter table public.wallet_settings
  add column if not exists savings_till_number text,
  add column if not exists savings_till_name text not null default 'LEOGO Savings Wallet';

alter table public.wallet_settings
  drop constraint if exists wallet_settings_savings_till_number_format;

alter table public.wallet_settings
  add constraint wallet_settings_savings_till_number_format
  check (savings_till_number is null or savings_till_number ~ '^[0-9]{5,12}$');

comment on column public.wallet_settings.savings_till_number is
  'Admin-managed M-Pesa Till used for customer wallet savings and daily challenges.';

comment on column public.wallet_settings.savings_till_name is
  'Customer-facing name displayed beside the wallet savings Till.';

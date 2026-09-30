-- Supporting indexes for partner billing foreign keys and Admin review lookups.
create index if not exists partner_subscription_settings_updated_by_idx on public.partner_subscription_settings(updated_by);
create index if not exists partner_billing_reviewed_by_idx on public.partner_billing_payments(reviewed_by);
create index if not exists partner_subscriptions_last_payment_idx on public.partner_subscriptions(last_payment_id);
create index if not exists premium_acceptance_credits_user_idx on public.premium_acceptance_credits(user_id);

-- Prevent one customer from opening duplicate simultaneous Lipa Pole Pole
-- reservations for the same product/variant. This protects Seller stock from
-- repeated pending reservations while still allowing a new purchase after the
-- previous account is completed, cancelled or refunded.

create unique index if not exists lpp_active_customer_product_no_variant_uq
  on public.lipa_pole_pole_accounts(customer_id,product_id)
  where variant_id is null
    and status in ('deposit_pending','active','overdue','cancellation_pending');

create unique index if not exists lpp_active_customer_product_variant_uq
  on public.lipa_pole_pole_accounts(customer_id,product_id,variant_id)
  where variant_id is not null
    and status in ('deposit_pending','active','overdue','cancellation_pending');

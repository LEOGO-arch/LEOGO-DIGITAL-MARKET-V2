-- Remove the temporary Seller-category assertion RPC.
-- The permanent protection is the private seller_products trigger, so no public helper is needed.

drop function if exists public.health_medicine_assert_seller_category_allowed(uuid);

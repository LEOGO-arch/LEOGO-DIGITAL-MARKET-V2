const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const checkout=fs.readFileSync(path.join(root,'supabase/migrations/20261001180055_seller_flash_sale_checkout_pricing_v1.sql'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261031140000_market_day_checkout_atomic_v1.sql'),'utf8');
const control=fs.readFileSync(path.join(root,'supabase/migrations/20261031120000_market_day_offer_control_v1.sql'),'utf8');
const quote=fs.readFileSync(path.join(root,'supabase/migrations/20261031160000_market_day_customer_quote_v1.sql'),'utf8');
const customer=fs.readFileSync(path.join(root,'js/app.js'),'utf8');

// These assertions guard the intended insertion points. Actual pg_get_functiondef
// and authenticated checkout testing remain prerequisites for deployment.
for(const anchor of [
  'v_seller_approved boolean;',
  'v_subtotal:=v_subtotal+(v_unit_price*v_qty);',
  'v_total:=v_subtotal+v_service+v_pickup+v_delivery;',
  '-- Create immutable order lines and reserve stock.',
  'order_id,seller_id,product_id,product_name,unit_price_kes,quantity,line_total_kes'
]){
  assert.ok(checkout.includes(anchor),`Checkout anchor missing: ${anchor}`);
  assert.ok(migration.includes(anchor),`Migration anchor missing: ${anchor}`);
}
assert.match(migration,/quantity_limit=quantity_limit-p_quantity/);
assert.match(migration,/budget_kes=budget_kes-p_delivery_fee/);
assert.match(migration,/leogo_delivery_subsidy_redemptions\(order_id,campaign_id,funded_fee_kes\)/);
assert.match(migration,/v_delivery:=0/);
assert.match(migration,/v_flash_active,false/);
assert.match(control,/approval_status='approved'/);
assert.match(control,/p\.has_variants=false/);
assert.ok(!migration.includes('drop function public.customer_create_marketplace_order'));
assert.match(quote,/customer_market_day_checkout_quote/);
assert.match(quote,/market_day_checkout_unit_price/);
assert.match(quote,/leogo_delivery_subsidy_kes/);
assert.match(customer,/refreshMarketplacePromotionQuote\(true\)/);
assert.match(customer,/checkoutMarketDaySavingsValue/);
assert.match(customer,/checkoutLeogoDeliveryOfferValue/);
console.log('Market Day checkout source contract assertions passed.');

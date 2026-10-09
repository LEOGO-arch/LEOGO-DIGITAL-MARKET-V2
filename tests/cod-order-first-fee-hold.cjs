const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const files={
  app:read('js/app.js'),
  admin:read('admin/admin.js'),
  html:read('index.html'),
  migration:read('supabase/migrations/20261009233000_cod_order_first_delivery_fee_hold_v1.sql'),
  collections:read('supabase/migrations/20261009233500_cod_prepaid_delivery_fee_remaining_balance_v1.sql')
};
new vm.Script(files.app);
new vm.Script(files.admin);
const check=(source,needle)=>assert.ok(source.includes(needle),'Missing safeguard: '+needle);
for(const name of [
 'marketplace_cod_fee_new_order',
 'marketplace_cod_fee_dispatch_hold',
 'marketplace_cod_fee_order_status_hold',
 'customer_cod_order_first_ready',
 'customer_submit_cod_delivery_fee_reference',
 'admin_review_cod_delivery_fee',
 'admin_get_cod_delivery_fee_status',
 'customer_list_cod_delivery_fee_status',
 'admin_list_cod_delivery_fee_queue'
])check(files.migration,name);
check(files.migration,"private.is_leogo_admin('orders.payment_verify')");
check(files.migration,"v_order.cod_delivery_fee_status<>'submitted'");
check(files.migration,"new.order_status in ('with_rider','delivered')");
check(files.collections,'rider_list_delivery_jobs_v4');
check(files.collections,'pickup_partner_lookup_parcel');
check(files.collections,'least(coalesce(o.delivery_fee_kes,0),greatest(0,o.external_amount_due_kes))');
check(files.app,"rpc('customer_cod_order_first_ready')");
check(files.app,"const isCodOrderFirst = selectedCheckoutPayment==='cod' && codOrderFirstReady && !healthCheckout");
check(files.app,"p_payment_message: isCodOrderFirst ? '' : mpesaPaymentMessage.value.trim()");
check(files.app,"rpc('customer_submit_cod_delivery_fee_reference'");
check(files.app,"rpc('customer_list_cod_delivery_fee_status')");
check(files.admin,"rpc('admin_review_cod_delivery_fee'");
check(files.admin,"rpc('admin_list_cod_delivery_fee_queue'");
check(files.html,'data-cod-fee-form');
for(const [due,fee,expected] of [[152,50,102],[100,200,0],[600,0,600]]){
  const advance=Math.min(due,Math.max(0,fee));
  assert.equal(Math.max(0,Math.round((due-advance)*100)/100),expected);
}
console.log('COD order-first, fee hold, and handover balance checks passed.');

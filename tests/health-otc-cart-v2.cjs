const fs=require('node:fs');
const vm=require('node:vm');

const read=(path)=>fs.readFileSync(path,'utf8');
const customerHtml=read('index.html');
const customerJs=read('js/app.js');
const healthCustomerJs=read('js/health.js');
const partnerHtml=read('partner/index.html');
const healthPartnerJs=read('partner/health.js');
const adminHtml=read('admin/index.html');
const healthAdminJs=read('admin/health.js');
const migration=read('supabase/migrations/20261003211000_health_otc_cart_orders_v2.sql');

for(const [name,source] of [
  ['js/app.js',customerJs],
  ['js/health.js',healthCustomerJs],
  ['partner/health.js',healthPartnerJs],
  ['admin/health.js',healthAdminJs]
]) new vm.Script(source,{filename:name});

const requireMarker=(source,marker,message)=>{
  if(!source.includes(marker))throw new Error(message+': '+marker);
};

// Medicine seller classification is explicit and simple.
requireMarker(partnerHtml,'OTC — No prescription required','OTC choice missing');
requireMarker(partnerHtml,'Prescription Required','Prescription choice missing');
if(partnerHtml.includes('value="pharmacy_only"'))throw new Error('Obsolete pharmacy-only seller choice is still visible');
requireMarker(healthPartnerJs,"p_medicine_classification:classification",'Partner product classification is not submitted');

// OTC customer cart.
requireMarker(healthCustomerJs,'data-health-add-cart','OTC Add to Cart button missing');
requireMarker(healthCustomerJs,'row.cart_eligible','Customer Health cart eligibility check missing');
requireMarker(customerJs,'window.leogoAddHealthOtcToCart','Shared cart does not accept eligible Health products');
requireMarker(customerJs,"sourceType:'health_medicine'",'Health cart source marker missing');
requireMarker(customerJs,"customer_create_health_medicine_order",'Dedicated Health checkout RPC missing');
requireMarker(customerJs,"Health & Medicine items and ordinary Seller items use separate checkout",'Mixed cart safety boundary missing');
requireMarker(customerJs,"client.rpc('customer_list_health_medicine_orders')",'Health orders are not included in Customer Activity');

// Locked Seller checkout remains present and separate.
requireMarker(customerJs,"customer_create_marketplace_order_v2",'Locked Seller checkout RPC missing');
requireMarker(customerJs,"item.productId",'Seller checkout product mapping missing');
requireMarker(customerJs,"item.healthProductId",'Health checkout product mapping missing');

// Health Partner order workflow.
requireMarker(partnerHtml,'data-health-view="orders"','Health Partner Orders navigation missing');
requireMarker(partnerHtml,'id="healthMedicineOrderList"','Health Partner order list missing');
requireMarker(healthPartnerJs,"health_medicine_list_own_orders",'Health Partner order loading RPC missing');
requireMarker(healthPartnerJs,"health_medicine_update_order_status",'Health Partner order status RPC missing');

// Admin payment control.
requireMarker(adminHtml,'id="adminHealthOrderList"','Admin Health order queue missing');
requireMarker(healthAdminJs,"admin_list_health_medicine_orders",'Admin Health order RPC missing');
requireMarker(healthAdminJs,"admin_review_health_medicine_order_payment",'Admin Health payment verification missing');

// Database invariants.
for(const marker of [
  "medicine_classification in ('non_medicine','otc','prescription_required')",
  "order_mode in ('cart','enquiry_only')",
  'create table if not exists public.health_medicine_orders',
  'create table if not exists public.health_medicine_order_items',
  "p.medicine_classification<>'otc'",
  "p.requires_prescription=false",
  "raise exception '% is not an OTC medicine and cannot use normal cart checkout'",
  'create or replace function public.customer_create_health_medicine_order',
  'create or replace function public.health_medicine_list_own_orders',
  'create or replace function public.customer_list_health_medicine_orders',
  'create or replace function public.admin_list_health_medicine_orders',
  'create or replace function public.admin_review_health_medicine_order_payment',
  "'health_medicine_payment'",
  "'health'"
]) requireMarker(migration,marker,'Health OTC migration safeguard missing');

// HTML remains structurally balanced for the edited surfaces.
for(const [name,html] of [['index.html',customerHtml],['partner/index.html',partnerHtml],['admin/index.html',adminHtml]]){
  const open=(tag)=>(html.match(new RegExp('<'+tag+'\\b','g'))||[]).length;
  const close=(tag)=>(html.match(new RegExp('</'+tag+'>','g'))||[]).length;
  for(const tag of ['section','div','form']){
    if(open(tag)!==close(tag))throw new Error(name+' unbalanced '+tag+': '+open(tag)+' vs '+close(tag));
  }
}

console.log('health OTC cart V2 regression checks passed');

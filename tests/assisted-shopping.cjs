const fs=require('node:fs');
const vm=require('node:vm');

const customerHtml=fs.readFileSync('index.html','utf8');
const customerJs=fs.readFileSync('js/assisted-shopping.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/assisted-shopping.js','utf8');
const coreAdminJs=fs.readFileSync('admin/admin.js','utf8');

new vm.Script(customerJs,{filename:'js/assisted-shopping.js'});
new vm.Script(adminJs,{filename:'admin/assisted-shopping.js'});
new vm.Script(coreAdminJs,{filename:'admin/admin.js'});

const once=(source,needle,label)=>{
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(label+' expected once, found '+count);
};

once(customerHtml,'id="openAssistedShopping"','Customer Assisted Shopping card');
once(customerHtml,'id="assistedShoppingModal"','Customer Assisted Shopping modal');
once(customerHtml,'id="assistedShoppingForm"','Customer Shopping List form');
once(customerHtml,'js/assisted-shopping.js?v=assisted-shopping-v1','Customer Assisted Shopping script');

once(adminHtml,'data-admin-panel="assisted"','Admin Assisted Shopping panel');
once(adminHtml,'id="sidebarAssistedShoppingCount"','Admin Assisted Shopping badge');
once(adminHtml,'id="assistedShoppingSettingsForm"','Admin Assisted Shopping settings');
once(adminHtml,'id="assistedShoppingAdminModal"','Admin Assisted Shopping modal');
once(adminHtml,'assisted-shopping.js?v=assisted-shopping-v1','Admin Assisted Shopping script');

const customerRpcMarkers=[
  'public_get_assisted_shopping_settings',
  'public_get_assisted_shopping_payment_account',
  'customer_submit_assisted_shopping_request',
  'customer_list_assisted_shopping_requests',
  'customer_request_assisted_shopping_changes',
  'customer_accept_assisted_shopping_quote'
];
for(const marker of customerRpcMarkers){
  if(!customerJs.includes(marker))throw new Error('Missing customer Assisted Shopping RPC: '+marker);
}

const adminRpcMarkers=[
  'admin_list_assisted_shopping_requests',
  'admin_prepare_assisted_shopping_quote',
  'admin_get_assisted_shopping_settings',
  'admin_save_assisted_shopping_settings',
  'admin_verify_marketplace_order_payment',
  'admin_mark_assisted_shopping_ready',
  'admin_assign_rider_to_order',
  'admin_cancel_assisted_shopping_request'
];
for(const marker of adminRpcMarkers){
  if(!adminJs.includes(marker))throw new Error('Missing Admin Assisted Shopping RPC: '+marker);
}

if(!coreAdminJs.includes("assisted: 'Assisted Shopping'"))throw new Error('Assisted Shopping Admin view title missing');
if(!coreAdminJs.includes("assisted: () => adminHas('orders.read')"))throw new Error('Assisted Shopping Admin permission gate missing');

const quoteLockSql=fs.readFileSync('supabase/migrations/20261002102500_assisted_shopping_quote_lock.sql','utf8');
const riderNoteSql=fs.readFileSync('supabase/migrations/20261002103000_assisted_shopping_rider_handoff_note.sql','utf8');
if(!quoteLockSql.includes('Customer already accepted this Shopping List quotation'))throw new Error('Accepted quotation lock regression');
if(!riderNoteSql.includes('No Seller pickup is required'))throw new Error('Assisted Shopping Rider handoff note regression');

console.log('assisted shopping regression checks passed');

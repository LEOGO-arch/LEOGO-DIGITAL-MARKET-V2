const fs=require('node:fs');
const vm=require('node:vm');

const customerHtml=fs.readFileSync('index.html','utf8');
const customerJs=fs.readFileSync('js/assisted-shopping.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/assisted-shopping.js','utf8');
const coreAdminJs=fs.readFileSync('admin/admin.js','utf8');
const staffHtml=fs.readFileSync('staff/index.html','utf8');
const staffJs=fs.readFileSync('staff/staff.js','utf8');
const sharedPdfJs=fs.readFileSync('js/assisted-shopping-pdf.js','utf8');

new vm.Script(customerJs,{filename:'js/assisted-shopping.js'});
new vm.Script(adminJs,{filename:'admin/assisted-shopping.js'});
new vm.Script(coreAdminJs,{filename:'admin/admin.js'});
new vm.Script(staffJs,{filename:'staff/staff.js'});
new vm.Script(sharedPdfJs,{filename:'js/assisted-shopping-pdf.js'});

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
once(adminHtml,'id="assistedAdminAssignedStaffSelect"','Admin assigned-staff selector');
once(adminHtml,'id="downloadAssistedShoppingPdf"','Admin Shopping List PDF download');
once(adminHtml,'../js/assisted-shopping-pdf.js?v=assisted-download-v1','Admin shared PDF helper');

once(staffHtml,'id="assistedStaffApp"','Staff Assisted Shopping workspace');
once(staffHtml,'id="assistedStaffList"','Staff assigned Shopping List area');
once(staffHtml,'../js/assisted-shopping-pdf.js?v=assisted-download-v1','Staff shared PDF helper');

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
  'admin_cancel_assisted_shopping_request',
  'admin_list_assisted_shopping_staff',
  'admin_list_assisted_shopping_assignments',
  'admin_assign_assisted_shopping_staff'
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

if(!staffJs.includes('staff_list_assigned_assisted_shopping_requests'))throw new Error('Assigned staff Shopping List RPC missing');
if(!staffJs.includes('data-download-assisted-staff'))throw new Error('Assigned staff PDF download control missing');
if(!adminJs.includes('data-download-assisted-admin'))throw new Error('Admin PDF download control missing');
if(!sharedPdfJs.includes('LEOGO DIGITAL MARKET'))throw new Error('Shared Assisted Shopping PDF helper missing branding');

const staffAccessSql=fs.readFileSync('supabase/migrations/20261002113000_assisted_shopping_staff_download_access.sql','utf8');
const adminStaffSql=fs.readFileSync('supabase/migrations/20261002114500_assisted_shopping_admin_staff_assignments.sql','utf8');
if(!staffAccessSql.includes('staff_list_assigned_assisted_shopping_requests'))throw new Error('Assigned staff access migration regression');
if(!staffAccessSql.includes('private.can_access_assisted_shopping_request'))throw new Error('Private attachment access guard regression');
if(!adminStaffSql.includes('admin_list_assisted_shopping_staff'))throw new Error('Admin staff assignment expansion regression');

console.log('assisted shopping regression checks passed');

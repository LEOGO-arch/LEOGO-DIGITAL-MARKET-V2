const fs=require('node:fs');
const vm=require('node:vm');

const adminJs=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-create-staff/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002193000_staff_management_all_admin_responsibilities.sql','utf8');

new vm.Script(adminJs,{filename:'admin/admin.js'});

const expected=[
  'dashboard.read',
  'approvals.read','approvals.manage',
  'orders.read','orders.write','orders.manage','orders.payment_verify',
  'delivery.manage',
  'customers.read','support.chat','sellers.read',
  'settlements.read','settlements.manage',
  'products.read','products.manage',
  'premium.read','premium.manage',
  'reports.export','data.read',
  'payments.manage',
  'settings.read','fees.manage','settings.manage'
].sort();

const block=adminJs.slice(
  adminJs.indexOf('const STAFF_PERMISSION_DEFS'),
  adminJs.indexOf('const STAFF_PERMISSION_GROUP_INFO')
);
const actual=[...block.matchAll(/\['([^']+)','/g)].map(m=>m[1]).sort();

if(JSON.stringify(actual)!==JSON.stringify(expected)){
  throw new Error('Admin Staff permission catalogue mismatch: '+JSON.stringify({actual,expected}));
}

for(const code of expected){
  if(!edge.includes('"'+code+'"'))throw new Error('Edge staff creator is missing permission '+code);
  if(!migration.includes("'"+code+"'"))throw new Error('Staff permission migration is missing '+code);
}

for(const code of [
  'approvals.manage','orders.write','orders.manage','orders.payment_verify',
  'settlements.manage','products.manage','premium.manage','settings.manage'
]){
  if(!adminJs.includes("'"+code+"':["))throw new Error('Frontend dependency missing for '+code);
}

if(!edge.includes('PERMISSION_DEPENDENCIES'))throw new Error('Edge permission dependency normalization missing');
if(!migration.includes('normalize_admin_staff_permissions'))throw new Error('Database permission dependency normalization missing');

if(!edge.includes('"support.chat"'))throw new Error('Customer Support role cannot receive support.chat');
if(!edge.includes('"orders.write"'))throw new Error('Operations role cannot receive orders.write');
if(!migration.includes("'support.chat'"))throw new Error('Support role preset missing support.chat');
if(!migration.includes("'orders.write'"))throw new Error('Operations role preset missing orders.write');

for(const id of [
  'selectAllStaffPermissions','clearStaffPermissions',
  'selectAllEditorPermissions','clearEditorPermissions'
]){
  if(!adminHtml.includes('id="'+id+'"'))throw new Error('Missing Staff permission action '+id);
}

if(!adminHtml.includes('Owner-only controls'))throw new Error('Owner-only responsibility notice missing');
if(!adminJs.includes("loyalty: () => adminHas('settings.manage') || adminHas('fees.manage') || adminHas('reports.export')")){
  throw new Error('Loyalty navigation does not match backend access options');
}

console.log('staff responsibility regression checks passed: '+expected.length+' assignable permissions');

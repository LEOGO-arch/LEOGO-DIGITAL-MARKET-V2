const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const diagnosticsJs=fs.readFileSync('admin/system-diagnostics.js','utf8');
const diagnosticsCss=fs.readFileSync('admin/system-diagnostics.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002232000_admin_system_diagnostics.sql','utf8');
const resetEdge=fs.readFileSync('supabase/functions/admin-reset-diagnostics-pin/index.ts','utf8');
const quoteFix=fs.readFileSync('supabase/migrations/20261003071000_fix_system_diagnostics_main_image_query.sql','utf8');

new vm.Script(adminJs,{filename:'admin/admin.js'});
new vm.Script(diagnosticsJs,{filename:'admin/system-diagnostics.js'});

for(const required of [
  'data-admin-view="diagnostics"',
  'data-admin-panel="diagnostics"',
  'id="diagnosticsSetupPinForm"',
  'id="diagnosticsRunForm"',
  'id="diagnosticsChangePinForm"',
  'id="diagnosticsResetPinForm"'
]){
  if(!html.includes(required))throw new Error('Missing diagnostics UI: '+required);
}

for(const required of [
  "admin_system_diagnostics_status",
  "admin_system_diagnostics_setup_pin",
  "admin_system_diagnostics_change_pin",
  "admin_run_system_diagnosis",
  "admin_list_system_diagnostic_runs",
  "admin-reset-diagnostics-pin"
]){
  if(!diagnosticsJs.includes(required))throw new Error('Missing diagnostics client behavior: '+required);
}

for(const required of [
  "extensions.crypt",
  "extensions.gen_salt",
  "interval '15 minutes'",
  "'repair_mode','advisory_only'",
  "private.is_leogo_super_admin()",
  "admin_list_approval_queue",
  "revoke execute on function public.service_reset_system_diagnostics_pin(uuid,text)",
  "to service_role"
]){
  if(!migration.includes(required))throw new Error('Missing diagnostics backend safeguard: '+required);
}

for(const required of [
  'signInWithPassword',
  'role!=="super_admin"',
  'service_reset_system_diagnostics_pin',
  'signOut({scope:"local"})'
]){
  if(!resetEdge.includes(required))throw new Error('Missing diagnostics reset safeguard: '+required);
}

if(!diagnosticsCss.includes('.diagnostic-check.critical'))throw new Error('Diagnostics severity styling missing');

const asyncFormHandlers=['setupPin','changePin','resetPin'];
for(const name of asyncFormHandlers){
  const start=diagnosticsJs.indexOf('const '+name+'=async(event)=>');
  if(start<0)throw new Error('Missing async form handler: '+name);
  const end=diagnosticsJs.indexOf('\n  };',start);
  const block=diagnosticsJs.slice(start,end);
  if(!block.includes('const form=event.currentTarget'))throw new Error('Async handler does not preserve form reference: '+name);
  const afterAwait=block.slice(block.indexOf('await '));
  if(afterAwait.includes('event.currentTarget'))throw new Error('Async handler reuses event.currentTarget after await: '+name);
}
if(!diagnosticsJs.includes('setConfiguredUi(true)'))throw new Error('Successful PIN setup/reset does not reveal diagnostics controls immediately');

if(!quoteFix.includes("coalesce(p.main_image_path,'''')),'''') is null")){
  throw new Error('Diagnostics main-image dynamic SQL is not correctly escaped');
}
if(quoteFix.includes("coalesce(p.main_image_path,'')),'''') is null")){
  throw new Error('Broken diagnostics main-image quoting has returned');
}

console.log('admin system diagnostics regression checks passed');

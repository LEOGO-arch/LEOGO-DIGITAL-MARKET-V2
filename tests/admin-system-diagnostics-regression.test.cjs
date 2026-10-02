const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const diagnosticsJs=fs.readFileSync('admin/system-diagnostics.js','utf8');
const diagnosticsCss=fs.readFileSync('admin/system-diagnostics.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002232000_admin_system_diagnostics.sql','utf8');
const resetEdge=fs.readFileSync('supabase/functions/admin-reset-diagnostics-pin/index.ts','utf8');

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
  "revoke execute on function public.service_reset_system_diagnostics_pin(uuid,text)",
  "to service_role"
]){
  if(!migration.includes(required))throw new Error('Missing diagnostics backend safeguard: '+required);
}

for(const required of [
  'signInWithPassword',
  'role!=="super_admin"',
  'service_reset_system_diagnostics_pin'
]){
  if(!resetEdge.includes(required))throw new Error('Missing diagnostics reset safeguard: '+required);
}

if(!diagnosticsCss.includes('.diagnostic-check.critical'))throw new Error('Diagnostics severity styling missing');

console.log('admin system diagnostics regression checks passed');

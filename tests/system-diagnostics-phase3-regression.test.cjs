const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('admin/index.html','utf8');
const js=fs.readFileSync('admin/system-diagnostics.js','utf8');
const css=fs.readFileSync('admin/system-diagnostics.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003152000_system_diagnostics_phase3.sql','utf8');

new vm.Script(js,{filename:'admin/system-diagnostics.js'});

for(const required of [
  'id="diagnosticsRepairCenter"',
  'id="diagnosticsRepairQueue"',
  'id="diagnosticsRepairHistory"',
  'id="diagnosticsFindingModal"',
  'id="diagnosticsPhase3Pin"',
  'id="diagnosticsVerifyCheck"'
]){
  if(!html.includes(required))throw new Error('Phase 3 UI missing: '+required);
}

for(const required of [
  "admin_diagnostic_finding_details",
  "admin_verify_system_diagnostic_check",
  "admin_apply_system_diagnostic_repair",
  "admin_list_system_diagnostic_repairs",
  "admin_get_latest_system_diagnostic_run",
  "View Affected Records",
  "Verify This Check",
  "Apply Safe Repair"
]){
  if(!js.includes(required))throw new Error('Phase 3 client behavior missing: '+required);
}

for(const required of [
  "private.system_diagnostic_repairs",
  "private.system_diagnostic_repair_policy",
  "private.system_diagnostic_finding_data",
  "public.admin_diagnostic_finding_details",
  "public.admin_verify_system_diagnostic_check",
  "public.admin_apply_system_diagnostic_repair",
  "public.admin_list_system_diagnostic_repairs",
  "public.admin_get_latest_system_diagnostic_run"
]){
  if(!migration.includes(required))throw new Error('Phase 3 backend missing: '+required);
}

if(!migration.includes("'resolve_runtime_issue'"))throw new Error('Allowlisted runtime safe repair missing');
if(!migration.includes("'expire_membership'"))throw new Error('Allowlisted Premium safe repair missing');

for(const unsafe of [
  "'orders.orphan_items' and p_action",
  "'orders.subtotal_consistency' and p_action",
  "'wallet.ledger_links' and p_action",
  "'wallet.confirmed_deposit_ledger' and p_action",
  "'payments.assignment_integrity' and p_action",
  "'auth_staff.admin_auth_links' and p_action",
  "'auth_staff.staff_auth_links' and p_action"
]){
  if(migration.includes(unsafe))throw new Error('Unsafe Phase 3 repair branch detected: '+unsafe);
}

if(!migration.includes("v_policy->>'repair_mode'<>'safe'")){
  throw new Error('Repair executor does not enforce backend safe-only policy');
}
if(!migration.includes("private.verify_system_diagnostics_pin(p_pin)")){
  throw new Error('Repair/verification PIN re-authorization missing');
}
if(!migration.includes("before_data")||!migration.includes("after_data")||!migration.includes("verification_data")){
  throw new Error('Immutable repair evidence snapshot fields missing');
}
if(!migration.includes("revoke all on table private.system_diagnostic_repairs from public,anon,authenticated")){
  throw new Error('Repair audit table direct access not revoked');
}
if(!migration.includes("revoke execute on function public.admin_apply_system_diagnostic_repair")||!migration.includes("from public,anon")){
  throw new Error('Anonymous repair execution not revoked');
}

if(!html.includes('system-diagnostics.js?v=diagnostics-phase3-1')||!html.includes('system-diagnostics.css?v=diagnostics-phase3-1')){
  throw new Error('Phase 3 cache version missing');
}
if(!css.includes('.diagnostics-repair-center')||!css.includes('.diagnostics-phase3-modal-card')){
  throw new Error('Phase 3 responsive styles missing');
}

console.log('system diagnostics Phase 3 regression checks passed');

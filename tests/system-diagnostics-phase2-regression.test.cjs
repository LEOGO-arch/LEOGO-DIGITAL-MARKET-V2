const fs=require('node:fs');
const vm=require('node:vm');

const runtime=fs.readFileSync('js/runtime-monitor.js','utf8');
const diagnostics=fs.readFileSync('admin/system-diagnostics.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003074000_system_diagnostics_phase2.sql','utf8');

new vm.Script(runtime,{filename:'js/runtime-monitor.js'});
new vm.Script(diagnostics,{filename:'admin/system-diagnostics.js'});

for(const path of ['index.html','partner/index.html','staff/index.html','pickup/index.html','admin/index.html']){
  const html=fs.readFileSync(path,'utf8');
  if(!html.includes('runtime-monitor.js?v=diagnostics-phase2-1')){
    throw new Error('Runtime monitor missing from '+path);
  }
}

for(const required of [
  'record_system_runtime_error',
  'admin_list_system_runtime_issues',
  'system_runtime_issues',
  'system_runtime_error_events',
  'system_diagnostic_phase2_checks',
  "'runtime.live_errors'",
  "'products.customer_visibility_chain'",
  "'orders.workflow_sequence'",
  "'wallet.confirmed_deposit_ledger'"
]){
  if(!migration.includes(required))throw new Error('Missing Phase 2 migration safeguard/check: '+required);
}

for(const forbidden of ['response.text(', 'response.json(', 'location.search', 'payment_reference', 'current_password']){
  if(runtime.includes(forbidden))throw new Error('Runtime monitor must not collect sensitive/request payload data: '+forbidden);
}

if(!migration.includes("to anon,authenticated"))throw new Error('Write-only runtime reporter is not available to customer sessions');
if(!migration.includes("private.is_leogo_super_admin()"))throw new Error('Admin runtime issue reader is not Super Admin guarded');
if(!migration.includes("interval '30 seconds'")||!migration.includes("interval '10 minutes'"))throw new Error('Server-side telemetry dedupe/rate limit missing');

for(const required of [
  'id="diagnosticsRuntimeCard"',
  'id="diagnosticsRuntimeIssues"',
  'id="diagnosticsRuntimeHours"',
  '<option value="runtime">Live Runtime Errors</option>'
]){
  if(!adminHtml.includes(required))throw new Error('Admin runtime console missing: '+required);
}

if(!diagnostics.includes("db.rpc('admin_list_system_runtime_issues'"))throw new Error('Admin runtime issue loader missing');
if(!diagnostics.includes('loadRuntimeIssues()'))throw new Error('Runtime issues are not refreshed with diagnostics');

const fixMigration=fs.readFileSync('supabase/migrations/20261003104500_fix_diagnosis_product_image_query.sql','utf8');
if(fixMigration.includes("coalesce(p.main_image_path,'')),'''')")){
  throw new Error('product-image dynamic SQL quote regression');
}
if(!fixMigration.includes("nullif(btrim(coalesce(p.main_image_path,'')),\'\') is null")){
  throw new Error('static product-image diagnostic check missing');
}


const shippingAdmin=fs.readFileSync('admin/shipping-moq.js','utf8');
const securityRepair=fs.readFileSync('supabase/migrations/20261003114500_revoke_anon_admin_rpc_access.sql','utf8');
const premiumEmailRepair=fs.readFileSync('supabase/migrations/20261003120500_repair_premium_expiry_and_email_health.sql','utf8');
const resolvedRuntimeRepair=fs.readFileSync('supabase/migrations/20261003122500_resolved_runtime_health.sql','utf8');

new vm.Script(shippingAdmin,{filename:'admin/shipping-moq.js'});

if(!shippingAdmin.includes('client.auth.getSession()')||!shippingAdmin.includes('client.auth.onAuthStateChange')){
  throw new Error('Group Orders must wait for restored Admin authentication');
}
if(shippingAdmin.includes('const init=()=>{loadStyle();ensureUI();loadDefaults();loadGroups();')){
  throw new Error('Group Orders still loads privileged RPCs before Admin auth restore');
}

const revokeCount=(securityRepair.match(/revoke execute on function public\.admin_/g)||[]).length;
if(revokeCount!==13)throw new Error('Expected 13 anonymous Admin RPC revocations, found '+revokeCount);
if(!securityRepair.includes('from public,anon'))throw new Error('Admin RPC repair must revoke PUBLIC and anon');
if(!securityRepair.includes('to authenticated'))throw new Error('Admin RPC repair must preserve authenticated Admin access');

for(const required of [
  "membership_status='expired'",
  "leogo-premium-membership-expiry",
  "event_key not like 'admin_test_%'",
  "select max(s.sent_at)"
]){
  if(!premiumEmailRepair.includes(required))throw new Error('Premium/email repair missing: '+required);
}

if(!resolvedRuntimeRepair.includes("status not in ('ignored','resolved')")){
  throw new Error('Resolved runtime errors still lower active health');
}

if(!runtime.includes('confirmSameOriginResourceFailure'))throw new Error('same-origin resource retry missing');
if(!runtime.includes("cache:'no-store'"))throw new Error('resource retry must bypass cache');
if(!runtime.includes("Resource failed to load after retry"))throw new Error('resource error should be reported only after retry');

for(const path of ['index.html','partner/index.html','staff/index.html','pickup/index.html','admin/index.html']){
  const html=fs.readFileSync(path,'utf8');
  if(!html.includes('runtime-monitor.js?v=resource-retry-1')){
    throw new Error('Resource-retry runtime monitor cache version missing from '+path);
  }
}

if(!runtime.includes("errorType:'network_error'"))throw new Error('network_error should be grouped as connectivity warning');
if(!runtime.includes("module:'connectivity'"))throw new Error('network failures should be reported under connectivity module');
if(!runtime.includes("operation:'connectivity:'"))throw new Error('network failures should be grouped by backend host');
if(!runtime.includes("severity:'warning'"))throw new Error('network failures must not be classified as critical code failures');
if(runtime.includes("message:'Network request failed: '+cleanText(error?.message||error,300)"))throw new Error('per-RPC network failure flood path still exists');

for(const path of ['index.html','partner/index.html','staff/index.html','pickup/index.html','admin/index.html']){
  const html=fs.readFileSync(path,'utf8');
  if(!html.includes('runtime-monitor.js?v=network-burst-fix-1')){
    throw new Error('Network-burst runtime monitor cache version missing from '+path);
  }
}

const networkMigration=fs.readFileSync('supabase/migrations/20261003142000_runtime_network_incident_grouping.sql','utf8');
if(!networkMigration.includes("'resource_error','network_error'"))throw new Error('network_error missing from backend reporter allowlist');
if(!diagnostics.includes("host.innerHTML=activeRows.length?activeRows.map"))throw new Error('Resolved runtime history should not clutter live runtime list');

console.log('system diagnostics Phase 2 regression checks passed');

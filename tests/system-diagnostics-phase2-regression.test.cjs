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
  if(!html.includes('runtime-monitor.js?v=network-storm-fix-2')){
    throw new Error('Resource-retry runtime monitor cache version missing from '+path);
  }
}

const adminJs=fs.readFileSync('admin/admin.js','utf8');
const connectivityMigration=fs.readFileSync('supabase/migrations/20261003141000_runtime_connectivity_aggregation.sql','utf8');

new vm.Script(adminJs,{filename:'admin/admin.js'});

for(const required of [
  'const connectivityBurst=',
  'queueConnectivityFailure',
  'flushConnectivityBurst',
  "connectivity:supabase_api",
  "errorType:'connectivity_error'",
  "module:'connectivity'",
  'failedCount:affectedCount',
  'probeSupabaseReachability'
]){
  if(!runtime.includes(required))throw new Error('Network storm aggregation missing: '+required);
}
if(runtime.includes("message:'Network request failed: '+cleanText(error?.message||error,300),\n            operation:operationFromUrl(url),\n            source:url,\n            method,\n            severity:'critical'")){
  throw new Error('Supabase network failures are still emitted as per-request critical errors');
}
for(const required of [
  "'connectivity_error'",
  "'failed_count'",
  "to anon,authenticated"
]){
  if(!connectivityMigration.includes(required))throw new Error('Connectivity migration missing: '+required);
}
if(!adminJs.includes('settleLoadersWithConcurrency'))throw new Error('Bounded Admin loader helper missing');
if(!adminJs.includes('settleLoadersWithConcurrency(loaders, 2)'))throw new Error('Admin startup concurrency is not capped at 2');
if(adminJs.includes('Promise.allSettled(loaders.map((load) => load()))')){
  throw new Error('Admin startup still launches all permitted loaders simultaneously');
}
if(!fs.readFileSync('admin/index.html','utf8').includes('admin.js?v=network-storm-fix-1')){
  throw new Error('Admin cache version missing for network storm fix');
}
if(!diagnostics.includes('host.innerHTML=activeRows.length?activeRows.map')){
  throw new Error('Resolved runtime history should not clutter the live error list');
}
const connectivityHealth=fs.readFileSync('supabase/migrations/20261003144000_connectivity_health_scoring.sql','utf8');
if(!connectivityHealth.includes("event_count>=3")){
  throw new Error('Isolated connectivity incidents should not lower overall system health');
}

const partnerShipping=fs.readFileSync('partner/shipping-moq.js','utf8');
new vm.Script(partnerShipping,{filename:'partner/shipping-moq.js'});
if(!partnerShipping.includes('client.auth.getSession()')||!partnerShipping.includes('client.auth.onAuthStateChange')){
  throw new Error('Partner Seller shipping data must wait for auth');
}
if(partnerShipping.includes('await Promise.all([loadProducts(),loadCampaigns(),loadDeliveryRates()]);\n  }catch(error){')){
  throw new Error('Partner Seller shipping data still loads directly during DOM init');
}
if(!fs.readFileSync('partner/index.html','utf8').includes('shipping-moq.js?v=auth-timing-2')){
  throw new Error('Partner shipping auth-timing cache version missing');
}

console.log('system diagnostics Phase 2 regression checks passed');

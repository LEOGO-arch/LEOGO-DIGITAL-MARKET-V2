const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('admin/index.html','utf8');
const diagnostics=fs.readFileSync('admin/system-diagnostics.js','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const css=fs.readFileSync('admin/system-diagnostics.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003161000_system_diagnostics_phase4.sql','utf8');
const hardening=fs.readFileSync('supabase/migrations/20261003162500_system_diagnostics_phase4_hardening.sql','utf8');

new vm.Script(diagnostics,{filename:'admin/system-diagnostics.js'});
new vm.Script(admin,{filename:'admin/admin.js'});

for(const required of [
  'id="diagnosticsMonitoringCenter"',
  'id="monitoringHealthScore"',
  'id="monitoringCriticalCount"',
  'id="monitoringWarningCount"',
  'id="monitoringRecoveredToday"',
  'id="monitoringLastScan"',
  'id="monitoringNextScan"',
  'id="monitoringEnabled"',
  'id="monitoringMaintenance"',
  'id="monitoringPin"',
  'id="runMonitoringNow"',
  'id="diagnosticsMonitoringIncidents"',
  'id="diagnosticsMonitoringTrend"'
]){
  if(!html.includes(required))throw new Error('Phase 4 UI missing: '+required);
}

for(const required of [
  'admin_get_system_monitoring_snapshot',
  'admin_update_system_monitoring_settings',
  'admin_run_system_monitoring_now',
  'renderSystemMonitoring',
  'loadSystemMonitoring'
]){
  if(!diagnostics.includes(required))throw new Error('Phase 4 diagnostics client missing: '+required);
}

for(const required of [
  'systemMonitoring: null',
  'loadSystemMonitoringSnapshot',
  'startSystemMonitoringPolling',
  "category:'System Diagnosis'",
  "view:'diagnostics'"
]){
  if(!admin.includes(required))throw new Error('Admin bell monitoring integration missing: '+required);
}

for(const required of [
  'private.system_monitoring_settings',
  'private.system_monitoring_runs',
  'private.system_monitoring_incidents',
  'private.system_monitoring_checks',
  'private.run_system_monitoring_scan',
  'public.admin_get_system_monitoring_snapshot',
  'public.admin_update_system_monitoring_settings',
  'public.admin_run_system_monitoring_now',
  'leogo-system-monitoring-15m',
  '*/15 * * * *'
]){
  if(!migration.includes(required))throw new Error('Phase 4 backend missing: '+required);
}

if(!migration.includes("status='recovered'")||!migration.includes('reopened_count')){
  throw new Error('Incident recovery/reopen tracking missing');
}
if(!migration.includes('consecutive_failures')||!migration.includes('when v_consecutive>=3 then \'critical\'')){
  throw new Error('Repeated-warning escalation missing');
}
if(!migration.includes('maintenance_mode')||!migration.includes("run_status='maintenance'")){
  throw new Error('Maintenance-mode suppression missing');
}
if(!migration.includes("revoke execute on function private.run_system_monitoring_scan(text)")){
  throw new Error('Scheduled monitoring engine is exposed');
}
if(!migration.includes("from public,anon;")||!migration.includes("to authenticated;")){
  throw new Error('Admin monitoring RPC grants are not explicit');
}

const automaticScan=migration.slice(
  migration.indexOf('create or replace function private.run_system_monitoring_scan('),
  migration.indexOf('create or replace function public.admin_get_system_monitoring_snapshot()')
);
for(const forbidden of [
  'update public.marketplace_orders',
  'update public.marketplace_order_items',
  'update public.marketplace_delivery_jobs',
  'update public.wallet_ledger_entries',
  'update public.wallet_accounts',
  'update public.payment_accounts',
  'update public.payment_account_assignments',
  'update public.admin_users',
  'update public.leogo_staff',
  'update public.seller_products',
  'update public.service_requests',
  'update public.transport_requests',
  'update public.premium_memberships',
  'delete from public.'
]){
  if(automaticScan.toLowerCase().includes(forbidden)){
    throw new Error('Phase 4 automatic scan must not mutate operational data: '+forbidden);
  }
}

if(!html.includes('system-diagnostics.js?v=diagnostics-phase4-1')||
   !html.includes('system-diagnostics.css?v=diagnostics-phase4-1')||
   !html.includes('admin.js?v=diagnostics-phase4-1')){
  throw new Error('Phase 4 cache versions missing');
}
if(!css.includes('.diagnostics-monitoring-center')||!css.includes('.diagnostics-monitoring-trend')){
  throw new Error('Phase 4 responsive styles missing');
}
if(!hardening.includes("run_status='failed'")||!hardening.includes("'monitor.engine_failure'")){
  throw new Error('Phase 4 failed-run durability hardening missing');
}
if(!hardening.includes("to_timestamp(")||!hardening.includes("Africa/Nairobi")){
  throw new Error('Phase 4 cron-boundary/Nairobi summary hardening missing');
}
for(const forbidden of [
  'update public.marketplace_orders',
  'update public.wallet_ledger_entries',
  'update public.payment_accounts',
  'update public.leogo_staff',
  'update public.seller_products',
  'delete from public.'
]){
  if(hardening.toLowerCase().includes(forbidden)){
    throw new Error('Phase 4 hardening must not mutate operational data: '+forbidden);
  }
}

console.log('system diagnostics Phase 4 regression checks passed');

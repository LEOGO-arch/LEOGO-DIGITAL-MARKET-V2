const fs=require('node:fs');
const vm=require('node:vm');

const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const recoverHtml=fs.readFileSync('admin/recover.html','utf8');
const recoverJs=fs.readFileSync('admin/recover.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002214500_admin_security_controls.sql','utf8');
const securityEmailMigration=fs.readFileSync('supabase/migrations/20261002220000_admin_security_email_alerts.sql','utf8');
const emailFunction=fs.readFileSync('supabase/functions/send-order-email/index.ts','utf8');

new vm.Script(adminJs,{filename:'admin/admin.js'});
new vm.Script(recoverJs,{filename:'admin/recover.js'});

for(const id of [
  'adminRecoveryRequest',
  'adminSecuritySettingsTab',
  'adminSecuritySettingsPanel',
  'adminChangePasswordForm',
  'adminSignOutOtherSessions',
  'adminSignOutAllSessions',
  'adminSendRecoveryEmail'
]){
  if(!adminHtml.includes('id="'+id+'"'))throw new Error('Missing Admin security UI: '+id);
}

for(const required of [
  "resetPasswordForEmail",
  "updateUser({password:next})",
  "signOut({scope:'others'})",
  "signOut({scope:'global'})",
  "admin_record_security_event",
  "tab==='security'&&!isSuperAdmin()",
  "Current password is incorrect."
]){
  if(!adminJs.includes(required))throw new Error('Missing Admin security logic: '+required);
}

for(const required of [
  'INITIAL_RECOVERY_SIGNAL',
  "data.role==='super_admin'",
  "data.status==='active'",
  "updateUser({password:next})",
  "signOut({scope:'global'})",
  "admin.security.password_recovered"
]){
  if(!recoverJs.includes(required))throw new Error('Missing recovery safeguard: '+required);
}

if(!recoverHtml.includes('Set New Password &amp; Sign Out All Devices')){
  throw new Error('Recovery page final action is unclear');
}

for(const required of [
  'private.is_leogo_super_admin()',
  'private.write_admin_audit',
  'admin.security.password_changed',
  'admin.security.password_recovered',
  'revoke execute',
  'grant execute'
]){
  if(!migration.includes(required))throw new Error('Missing security migration guard: '+required);
}

for(const required of [
  "kind === \"admin_security\"",
  "Admin Security Alert",
  "const securityEmail = emailKind === \"admin_security\""
]){
  if(!emailFunction.includes(required))throw new Error('Missing security email function behavior: '+required);
}
for(const required of [
  "'kind','admin_security'",
  "security_email_queued",
  "admin.security.all_sessions_revoked"
]){
  if(!securityEmailMigration.includes(required))throw new Error('Missing security email migration behavior: '+required);
}

console.log('admin security regression checks passed');

const fs=require('node:fs');
const vm=require('node:vm');

const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const recoverHtml=fs.readFileSync('admin/recover.html','utf8');
const recoverJs=fs.readFileSync('admin/recover.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002214500_admin_security_controls.sql','utf8');

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

console.log('admin security regression checks passed');

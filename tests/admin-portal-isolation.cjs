const fs=require('fs');
const assert=require('assert');

const customer=fs.readFileSync('js/auth.js','utf8');
const partner=fs.readFileSync('partner/partner.js','utf8');
const pickup=fs.readFileSync('pickup/pickup.js','utf8');
const staff=fs.readFileSync('staff/staff.js','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const rootHtml=fs.readFileSync('index.html','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const pickupHtml=fs.readFileSync('pickup/index.html','utf8');

assert.match(admin,/storageKey:\s*STAFF_AUTH_STORAGE_KEY/,'Admin session must remain isolated from public Customer/Partner auth storage');
assert.match(admin,/const STAFF_AUTH_STORAGE_KEY\s*=\s*'leogo-staff-auth-v2'/,'Admin/Staff storage key must remain explicit');

assert.match(customer,/const isAdminIdentity = async \(session\)/,'Customer portal must verify whether the signed-in identity is an Admin');
assert.match(customer,/\.from\('admin_users'\)/,'Customer Admin check must be verified against the database, not user metadata');
assert.match(customer,/signOut\(\{ scope: 'local' \}\)/,'Customer rejection must clear only the public-site session, not revoke the isolated Admin session');
assert.match(customer,/Admin credentials can only sign in at the LEOGO Admin Center/,'Customer portal must explain Admin-only sign-in');
assert.match(customer,/continue browsing the customer website as a guest/,'Admin must still be allowed to browse the Customer site publicly');
assert.match(customer,/if \(await rejectAdminCustomerSession\(data\.session\)\)/,'Email/password Customer login must reject Admin identity before opening Customer dashboard');
assert.match(customer,/applyCustomerSession\(session, event\)/,'Customer auth-state events must pass through the Admin guard');
assert.match(customer,/applyCustomerSession\(data\.session, 'INITIAL_SESSION'\)/,'Persisted Customer sessions must also pass through the Admin guard');
assert.match(rootHtml,/js\/auth\.js\?v=admin-portal-isolation-1/,'Customer auth cache key must be refreshed');

assert.match(partner,/const isAdminIdentity=async\(user\)/,'Partner portal must verify Admin identity');
assert.match(partner,/\.from\('admin_users'\)/,'Partner Admin check must use server-backed admin_users');
assert.match(partner,/signOut\(\{scope:'local'\}\)/,'Partner rejection must clear only the public Partner session');
assert.match(partner,/Admin credentials can only sign in at the LEOGO Admin Center/,'Partner portal must reject Admin credentials');
assert.match(partner,/Admin password recovery is only available through the LEOGO Admin Center/,'Partner recovery must not reset Admin credentials');
assert.match(partnerHtml,/partner\.js\?v=admin-portal-isolation-1/,'Partner cache key must be refreshed');

assert.match(pickup,/const redirectAdminIdentity=async\(user\)/,'Pickup portal must guard against an Admin public-session');
assert.match(pickup,/signOut\(\{scope:'local'\}\)/,'Pickup guard must clear only the public auth session');
assert.match(pickup,/location\.replace\('\.\.\/admin\/'\)/,'Pickup Admin identity must return to Admin Center');
assert.match(pickupHtml,/pickup\.js\?v=admin-portal-isolation-1/,'Pickup cache key must be refreshed');

assert.match(staff,/\.from\('admin_users'\)/,'Staff portal must distinguish Admin identity');
assert.match(staff,/window\.location\.replace\('\.\.\/admin\/'\)/,'Staff portal must never open Rider/Staff workspace for an active Admin');

console.log('Admin portal isolation regression checks passed.');

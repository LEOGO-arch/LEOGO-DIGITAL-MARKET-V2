const fs = require('fs');
const assert = require('assert');

const admin = fs.readFileSync('admin/admin.js', 'utf8');
const adminHtml = fs.readFileSync('admin/index.html', 'utf8');
const partner = fs.readFileSync('partner/partner.js', 'utf8');
const partnerHtml = fs.readFileSync('partner/index.html', 'utf8');
const cyber = fs.readFileSync('partner/cyber.js', 'utf8');
const health = fs.readFileSync('partner/health.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261007190000_admin_partner_notification_realtime.sql', 'utf8');

assert.match(migration, /create table if not exists public\.admin_notification_signal/i, 'Admin notification signal table must exist');
assert.match(migration, /private\.bump_admin_notification_signal/i, 'Admin signal trigger function must exist');
assert.match(migration, /alter publication supabase_realtime add table public\.admin_notification_signal/i, 'Admin signal must be published to Realtime');
assert.match(migration, /alter publication supabase_realtime add table public\.partner_notifications/i, 'Partner notifications must be published to Realtime');
assert.match(migration, /using \(\(select private\.is_leogo_admin\(\)\)\)/i, 'Admin signal must remain protected by active-admin RLS');
assert.doesNotMatch(migration, /grant\s+(insert|update|delete)\s+on\s+table\s+public\.admin_notification_signal\s+to\s+authenticated/i, 'Authenticated clients must not be allowed to mutate the Admin signal');

assert.match(admin, /channel\('leogo-admin-notification-signal-'/, 'Admin portal must open a Realtime notification signal channel');
assert.match(admin, /table:'admin_notification_signal'/, 'Admin Realtime channel must subscribe only to the signal table');
assert.match(admin, /loadApprovals\(\)/, 'Admin signal refresh must retain Approval Center loader');
assert.match(admin, /loadMarketplaceOrders\(\{refreshActiveDetail:true\}\)/, 'Order changes must refresh Admin order data safely');
assert.match(admin, /loadTransportNetwork\(\)/, 'Transport changes must refresh Transport data');
assert.match(admin, /loadPickupStations\(\)/, 'Pickup changes must refresh Pickup Station data');
assert.match(admin, /loadAccommodationSummary\(\)/, 'Accommodation changes must refresh Accommodation data');
assert.match(admin, /30000/, 'Admin portal must keep a low-frequency fallback sync');
assert.match(adminHtml, /admin\.js\?v=notification-realtime-1/, 'Admin cache key must be refreshed');

assert.match(partner, /table:'partner_notifications'/, 'Partner portal must subscribe to partner_notifications');
assert.match(partner, /filter:'user_id=eq\.'\+currentUser\.id/, 'Partner Realtime subscription must be scoped to the signed-in user');
assert.match(partner, /resolved==='seller'.*loadPartnerNotifications\(\)/s, 'Seller notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='service_provider'.*loadProviderNotifications\(\)/s, 'Service Provider notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='transport'.*loadTransportNotifications\(\)/s, 'Transport notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='premium'.*loadPremiumNotifications\(\)/s, 'Premium notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='accommodation'.*loadAccommodationNotifications\(\)/s, 'Accommodation notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='cyber'.*leogoRefreshCyberNotifications/s, 'Cyber notifications must refresh from the shared Realtime handler');
assert.match(partner, /resolved==='health_medicine'.*leogoRefreshHealthMedicineNotifications/s, 'Health notifications must refresh from the shared Realtime handler');
assert.match(partner, /30000/, 'Partner portal must keep a low-frequency fallback sync');
assert.match(cyber, /window\.leogoRefreshCyberNotifications/, 'Cyber module must expose its notification refresh');
assert.match(health, /window\.leogoRefreshHealthMedicineNotifications/, 'Health module must expose its notification refresh');
assert.match(partnerHtml, /partner\.js\?v=notification-realtime-1/, 'Partner cache key must be refreshed');

console.log('Admin + Partner realtime notification refresh regression checks passed.');

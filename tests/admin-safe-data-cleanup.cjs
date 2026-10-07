const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('admin/index.html', 'utf8');
const js = fs.readFileSync('admin/admin.js', 'utf8');
const css = fs.readFileSync('admin/admin.css', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261007122000_admin_safe_data_cleanup.sql', 'utf8');

assert.match(html, /id="dataManagementSettingsTab"[^>]*hidden/, 'Data Cleanup tab must start hidden until Super Admin is verified');
assert.match(html, /id="refreshDataCleanupOverview"/, 'storage scan control must exist');
assert.match(html, /id="runSafeDataCleanup"/, 'safe cleanup action must exist');
assert.match(html, /id="dataRetentionSettingsForm"/, 'retention settings form must exist');
assert.match(html, /Storage files are not deleted by this tool|Storage files will NOT be deleted|File deletion is report-only/i, 'UI must clearly protect Storage media');

assert.match(js, /dataTab\.hidden=!isSuperAdmin\(\)/, 'Data Cleanup tab must remain Super Admin only');
assert.match(js, /admin_get_data_cleanup_overview/, 'frontend must load the cleanup overview RPC');
assert.match(js, /admin_run_safe_data_cleanup/, 'frontend must use the safe cleanup RPC');
assert.match(js, /Customer accounts, orders, payments, Wallet\/SACCO, loans, audit history, disputes and Storage files will NOT be deleted/, 'destructive confirmation must state protected data');

assert.match(migration, /private\.is_leogo_super_admin\(\)/, 'cleanup RPCs must require Super Admin');
assert.match(migration, /n\.read_at is not null/, 'only read notifications may be purged');
assert.match(migration, /i\.status in \('resolved','ignored'\)/, 'only resolved or ignored runtime issue events may be purged');
assert.match(migration, /limit 30/, 'newest monitoring runs must be protected');
assert.doesNotMatch(migration, /delete\s+from\s+auth\.users/i, 'cleanup must never delete Auth users');
assert.doesNotMatch(migration, /delete\s+from\s+public\.marketplace_orders/i, 'cleanup must never delete marketplace orders');
assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i, 'cleanup must never delete Storage objects');

assert.match(css, /Safe Data Cleanup & Retention/, 'cleanup UI styles must exist');

console.log('Admin safe data cleanup regression checks passed.');

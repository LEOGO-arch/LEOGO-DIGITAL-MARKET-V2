const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const admin = fs.readFileSync(path.join(__dirname, '../admin/admin.js'), 'utf8');
const lookup = fs.readFileSync(path.join(__dirname, '../admin/payment-reference-lookup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../admin/index.html'), 'utf8');

assert.match(lookup, /moduleName==='Wallet deposit'/, 'Wallet deposits need a dedicated navigation path');
assert.match(lookup, /leogoOpenWalletDepositReview\?\.\(match\.record_id\)/, 'Use the exact matching deposit record ID');
assert.match(admin, /viewAllowed\('approvals'\)/, 'Respect Admin Approval Center permissions');
assert.match(admin, /row\.kind==='wallet_deposit'&&String\(row\.record_id\)===id/, 'Reject mismatched approval kinds and records');
assert.match(admin, /await loadApprovals\(\)/, 'Refresh stale approvals when necessary');
assert.match(admin, /await openApproval\('wallet_deposit',id\)/, 'Open the existing secured deposit review modal');
assert.match(html, /payment-reference-lookup\.js\?v=wallet-deposit-review-link-1/, 'Bust cached lookup script');
console.log('Wallet deposit lookup navigation regression checks passed.');

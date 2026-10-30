const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8');
const lookup = fs.readFileSync(path.join(root, 'admin/payment-reference-lookup.js'), 'utf8');

assert.match(html, /id="approvalPaymentReferenceLookupPanel"/, 'Approval Center needs a payment reference search');
assert.equal((html.match(/data-payment-reference-lookup(?=[ >])/g) || []).length, 2, 'Both panels must use the same search handler');
assert.match(lookup, /querySelectorAll\('\[data-payment-reference-lookup\]'\)/, 'Both forms must be initialized');
assert.match(lookup, /db\.auth\.refreshSession\(\)/, 'Expired JWT requires session recovery');
assert.match(lookup, /if\(result\.error&&isExpiredToken\(result\.error\)\)/, 'Refresh must only run on auth expiry');
assert.match(lookup, /db\.rpc\('admin_search_payment_reference'/, 'Existing read-only search RPC must remain in use');
assert.doesNotMatch(lookup, /admin_approve|admin_verify_payment/, 'Lookup must never make approval decisions');
console.log('Payment reference Approval Center and JWT recovery regression checks passed.');

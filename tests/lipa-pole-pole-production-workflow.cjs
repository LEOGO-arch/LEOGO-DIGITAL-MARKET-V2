const fs=require('fs');
const assert=require('assert');

const customer=fs.readFileSync('js/app.js','utf8');
const customerHtml=fs.readFileSync('index.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const partner=fs.readFileSync('partner/partner.js','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261010003000_lipa_pole_pole_production_workflow.sql','utf8');

assert.doesNotThrow(()=>new Function(customer),'customer app.js must parse');
assert.doesNotThrow(()=>new Function(admin),'admin.js must parse');
assert.doesNotThrow(()=>new Function(partner),'partner.js must parse');

assert.doesNotMatch(customer,/leogo_phase1_lipa_pole_pole/,'browser-only LPP localStorage must be removed');
assert.match(customer,/customer_open_lipa_pole_pole_account/,'customer must create permanent LPP account');
assert.match(customer,/customer_list_lipa_pole_pole_accounts/,'customer must load server LPP accounts');
assert.match(customer,/customer_submit_lipa_pole_pole_payment/,'customer instalments must reach backend');
assert.match(customer,/customer_request_lipa_pole_pole_cancellation/,'customer cancellation must reach backend');
assert.match(customer,/get_customer_payment_destination'.*lipa_pole_pole/s,'customer must use Admin-assigned LPP payment destination');
assert.match(customerHtml,/id="lppPaymentDestination"/,'LPP payment destination must be visible at checkout');
assert.match(customerHtml,/id="refreshLppAccounts"/,'customer must be able to refresh permanent LPP accounts');

assert.match(admin,/admin_list_lipa_pole_pole_accounts/,'Admin must load permanent LPP accounts');
assert.match(admin,/admin_review_lipa_pole_pole_payment/,'Admin must verify/reject LPP payments');
assert.match(admin,/admin_review_lipa_pole_pole_cancellation/,'Admin must review cancellations');
assert.match(admin,/admin_resolve_lipa_pole_pole_overdue/,'Admin must resolve overdue accounts');
assert.match(admin,/admin_mark_lipa_pole_pole_refund_paid/,'Admin must record completed refunds');
assert.match(adminHtml,/id="lppOperationsCard"/,'Admin LPP operations console must exist');
assert.match(adminHtml,/data-settings-tab="lipa"/,'Admin sidebar must expose LPP directly');

assert.match(partner,/seller_list_lipa_pole_pole_accounts/,'Seller must see LPP reservations');
assert.match(partnerHtml,/id="sellerLppAccountList"/,'Seller Orders view must show LPP reservations');
assert.doesNotMatch(migration,/seller_list_lipa_pole_pole_accounts[\s\S]*payment_reference[\s\S]*return v_result;/,'Seller LPP RPC must not expose customer payment references');

assert.match(migration,/create table if not exists public\.lipa_pole_pole_accounts/);
assert.match(migration,/create table if not exists public\.lipa_pole_pole_payments/);
assert.match(migration,/create table if not exists public\.lipa_pole_pole_events/);
assert.match(migration,/alter table public\.lipa_pole_pole_accounts enable row level security/);
assert.match(migration,/revoke all on public\.lipa_pole_pole_accounts from anon,authenticated/);
assert.match(migration,/payment_method in \('till','paybill','cod','points','lipa_pole_pole'\)/);
assert.match(migration,/private\.lpp_create_marketplace_order/,'full payment must convert to normal fulfilment');
assert.match(migration,/when v_new_paid>=total_payable_kes then 'fully_paid'/);
assert.match(migration,/perform private\.lpp_release_reserved_stock/,'cancel/refund must release reserved stock');
assert.match(migration,/leogo-lpp-overdue-scan/,'overdue accounts must be scanned automatically');
assert.match(migration,/leogo-lpp-deadline-reminders/,'deadline reminders must be automated');
assert.match(migration,/lpp_payment_admin_signal/,'new payments must wake Admin activity');
assert.match(migration,/This M-Pesa reference has already been submitted/,'payment references must be duplicate-protected');

console.log('Lipa Pole Pole production workflow regression checks passed.');

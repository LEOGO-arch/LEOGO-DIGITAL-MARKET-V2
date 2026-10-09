const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const read = (path) => fs.readFileSync(path, 'utf8');
const html = read('index.html');
const app = read('js/app.js');
const css = read('css/style.css');

new vm.Script(app, { filename: 'js/app.js' });

const requireSource = (source, needle, label) => {
  assert.ok(source.includes(needle), label);
};

for (const method of ['till', 'paybill', 'cod', 'lipapolepole', 'wallet']) {
  requireSource(html, `data-payment-method="${method}"`, `Missing payment choice: ${method}`);
}
requireSource(html, 'id="checkoutWalletRewards"', 'Wallet vouchers/details accordion missing');
requireSource(html, 'id="checkoutPointsPanel"', 'Existing voucher controls missing');
requireSource(html, 'id="checkoutUsePoints"', 'Existing voucher opt-in missing');
requireSource(html, 'checkout total must be greater than your available voucher balance',
  'Voucher eligibility explanation must be preserved');
requireSource(html, 'id="checkoutAdminPaymentDestination" aria-live="polite" hidden',
  'M-Pesa destination must start collapsed');
requireSource(html, 'data-admin-managed="cod-payment-rules" hidden',
  'COD notice must start collapsed');
requireSource(html, 'id="standardPaymentProof" hidden',
  'Payment reference form must start collapsed');
requireSource(html, 'class="payment-order-summary" hidden',
  'Payment totals must start collapsed');
requireSource(html, 'id="makeCheckoutOrder" hidden',
  'Make Order must not appear without selection');

const presentation = app.split('function syncSelectedPaymentPresentation() {')[1]
  ?.split('const clearUnavailableMarketplaceSelection =')[0];
assert.ok(presentation, 'Selected payment presentation function missing');
for (const needle of [
  "checkoutPaymentDestination.hidden=!['till','paybill'].includes(selectedCheckoutPayment)",
  "paymentRuleNotice.hidden=selectedCheckoutPayment!=='cod'",
  'makeCheckoutOrder.hidden=isLipaPolePole||isWallet',
  'standardPaymentProof.hidden=isLipaPolePole||isWallet',
  'if(isWallet && checkoutWalletRewards)checkoutWalletRewards.open=true',
  'syncHealthPrescriptionPanel()'
]) requireSource(presentation, needle, 'Selected payment detail regression: ' + needle);

requireSource(app, 'const eligible=!healthOnlyCart&&balance>0&&total>balance;',
  'Existing Shopping Voucher eligibility must remain');
requireSource(app, 'p_use_reward_points:usePoints',
  'Voucher must still reach marketplace server');
requireSource(app, "if (!mpesaPaymentMessage.value.trim())",
  'Do not bypass the backend payment confirmation requirement');
requireSource(app, "const prescriptionRequired=healthCheckout&&healthCartRequiresPrescription()",
  'Prescription-only checkout validation must remain');
requireSource(app, "Wallet cash checkout pending activation",
  'Unsupported cash-wallet checkout must not be represented as enabled');

for (const selector of [
  '.checkout-admin-payment[hidden]',
  '.payment-proof-panel[hidden]',
  '.payment-rule-notice[hidden]',
  '.payment-order-summary[hidden]',
  '.wallet-checkout-panel[hidden]'
]) requireSource(css, selector, 'Native hidden styling regression: ' + selector);

// Exercise the actual view-selection function with lightweight stand-in elements.
// This catches regressions where an unrelated payment's instructions become visible.
const fnStart = app.indexOf('  function syncSelectedPaymentPresentation() {');
const fnEnd = app.indexOf('\n  const clearUnavailableMarketplaceSelection =', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'Selected-payment function boundaries changed');
const presentationSource = app.slice(fnStart, fnEnd);
for (const mode of ['', 'till', 'paybill', 'cod', 'lipapolepole', 'wallet']) {
  const element = () => ({ hidden: null, textContent: '' });
  const context = {
    selectedCheckoutPayment: mode,
    checkoutExternalAmountDueNumber: () => 152,
    checkoutPointsAppliedNumber: () => 25,
    lppDepositForm: element(),
    walletCheckoutPanel: element(),
    standardPaymentProof: element(),
    checkoutPaymentDestination: element(),
    paymentRuleNotice: element(),
    paymentOrderSummary: element(),
    makeCheckoutOrder: element(),
    standardPaymentActions: element(),
    selectedPaymentLabel: element(),
    selectedPaymentStatus: element(),
    checkoutWalletRewards: { open: false },
    paymentProofLabel: element(),
    markPaymentPaidLabel: element(),
    openLppDepositForm: () => {},
    syncHealthPrescriptionPanel: () => {},
    deliveryMoney: (amount) => 'KSh ' + amount,
    marketplacePaymentDestination: null,
    window: { leogoPayments: { paymentNumber: () => '' } },
    document: { getElementById: () => ({ textContent: '' }) }
  };
  const render = new Function(...Object.keys(context),
    presentationSource + '\nreturn syncSelectedPaymentPresentation;')(...Object.values(context));
  render();
  const label = mode || 'nothing selected';
  assert.equal(context.checkoutPaymentDestination.hidden,
    !['till', 'paybill'].includes(mode), label + ': M-Pesa destination');
  assert.equal(context.paymentRuleNotice.hidden, mode !== 'cod',
    label + ': COD rules');
  assert.equal(context.makeCheckoutOrder.hidden,
    !mode || ['lipapolepole', 'wallet'].includes(mode), label + ': make-order action');
  assert.equal(context.standardPaymentProof.hidden,
    !mode || ['lipapolepole', 'wallet'].includes(mode), label + ': payment confirmation');
  assert.equal(context.paymentOrderSummary.hidden, !Boolean(mode),
    label + ': payment summary');
  assert.equal(context.walletCheckoutPanel.hidden, mode !== 'wallet',
    label + ': cash-wallet status');
  assert.equal(context.lppDepositForm.hidden, mode !== 'lipapolepole',
    label + ': instalment deposit');
  assert.equal(context.standardPaymentActions.hidden, false,
    label + ': Back action must remain accessible');
}

console.log('Compact checkout payment selection regression checks passed.');

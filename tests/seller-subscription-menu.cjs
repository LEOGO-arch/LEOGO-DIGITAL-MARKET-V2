const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('partner/index.html', 'utf8');
const js = fs.readFileSync('partner/partner.js', 'utf8');

new vm.Script(js, { filename: 'partner/partner.js' });

const count = (needle) => html.split(needle).length - 1;

if (count('data-seller-view="subscription"') !== 1) {
  throw new Error('Seller Subscription & Billing menu entry must exist exactly once');
}
if (count('data-seller-content="subscription"') !== 1) {
  throw new Error('Seller subscription view must exist exactly once');
}
if (count('data-partner-subscription-slot') !== 1) {
  throw new Error('Seller subscription slot must exist exactly once');
}

const requiredJs = [
  "subscription:'Review your Seller subscription, renewal plan and payment status.'",
  "['overview','products','orders','reviews','flashsale','earnings','settlements','subscription','notifications','profile','data']",
  "['overview','subscription','notifications','profile','data']",
  "if(resolved==='subscription'&&seller)",
  "subscriptionSlot.replaceChildren(panel)",
  "['products','earnings','settlements','subscription','notifications','profile','data','flashsale']"
];

for (const marker of requiredJs) {
  if (!js.includes(marker)) throw new Error('Missing Seller subscription navigation safeguard: ' + marker);
}

console.log('seller subscription menu regression checks passed');

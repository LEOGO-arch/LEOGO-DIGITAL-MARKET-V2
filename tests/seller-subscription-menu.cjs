const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('partner/index.html', 'utf8');
const js = fs.readFileSync('partner/partner.js', 'utf8');

new vm.Script(js, { filename: 'partner/partner.js' });

const sellerStart = html.indexOf('<section id="sellerDashboard"');
const sellerEnd = html.indexOf('</section>\n  </section>\n</main>', sellerStart);
if (sellerStart < 0 || sellerEnd < 0) throw new Error('Seller dashboard boundary not found');
const sellerHtml = html.slice(sellerStart, sellerEnd);
const count = (source, needle) => source.split(needle).length - 1;

if (count(sellerHtml, 'data-seller-view="subscription"') !== 1) {
  throw new Error('Seller Subscription & Billing menu entry must exist exactly once');
}
if (count(sellerHtml, 'data-seller-content="subscription"') !== 1) {
  throw new Error('Seller subscription view must exist exactly once');
}
if (count(sellerHtml, 'data-partner-subscription-slot') !== 1) {
  throw new Error('Seller subscription slot must exist exactly once inside the Seller dashboard');
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

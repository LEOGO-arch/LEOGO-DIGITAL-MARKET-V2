const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('partner/index.html', 'utf8');
const css = fs.readFileSync('partner/partner.css', 'utf8');
const js = fs.readFileSync('partner/partner.js', 'utf8');

new vm.Script(js, { filename: 'partner/partner.js' });

const transportStart = html.indexOf('<section id="transportDashboard"');
const transportEnd = html.indexOf('<section class="seller-shell provider-shell premium-shell"', transportStart);
if (transportStart < 0 || transportEnd < 0) throw new Error('Transport dashboard boundary not found');
const transportHtml = html.slice(transportStart, transportEnd);
const count = (source, needle) => source.split(needle).length - 1;

if (count(transportHtml, 'data-transport-view="subscription"') !== 1) {
  throw new Error('Transport Subscription & Billing menu entry must exist exactly once');
}
if (count(transportHtml, 'data-transport-content="subscription"') !== 1) {
  throw new Error('Transport subscription view must exist exactly once');
}
if (count(transportHtml, 'data-partner-subscription-slot') !== 1) {
  throw new Error('Transport subscription panel must mount into its dedicated dashboard slot');
}
if (!transportHtml.includes('Loading Transport Provider subscription details')) {
  throw new Error('Transport subscription view loading card is missing');
}
if (!html.includes('partner.css?v=transport-layout-v2') || !html.includes('partner.js?v=transport-layout-v2')) {
  throw new Error('Transport layout cache version is missing');
}

const requiredJs = [
  "subscription:'Review your Transport Provider subscription, renewal plan and payment status.'",
  "['overview','jobs','vehicles','earnings','settlements','subscription','notifications','profile']",
  "['overview','subscription','notifications','profile']",
  "if(resolved==='subscription')mountPartnerSubscription('transport',transportDashboard)",
  "await mountPartnerSubscription('transport',transportDashboard).catch(()=>{})"
];
for (const marker of requiredJs) {
  if (!js.includes(marker)) throw new Error('Missing Transport subscription navigation safeguard: ' + marker);
}

const requiredCss = [
  '#transportDashboard>.transport-sidebar{grid-column:1;grid-row:1',
  '#transportDashboard>.seller-portal-main{grid-column:2;grid-row:1',
  'width:min(72vw,260px)',
  'max-height:100dvh',
  'overflow-y:auto',
  'overscroll-behavior:contain'
];
for (const marker of requiredCss) {
  if (!css.includes(marker)) throw new Error('Missing Transport sidebar layout safeguard: ' + marker);
}

console.log('transport sidebar + subscription layout regression checks passed');

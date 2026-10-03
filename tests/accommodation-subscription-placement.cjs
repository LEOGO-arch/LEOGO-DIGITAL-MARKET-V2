const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('partner/index.html','utf8');
const js = fs.readFileSync('partner/partner.js','utf8');

new vm.Script(js,{filename:'partner/partner.js'});

const start=html.indexOf('<section id="accommodationDashboard"');
const end=html.indexOf('<section class="seller-shell cyber-shell" id="cyberShell"',start);
if(start<0||end<0)throw new Error('Accommodation dashboard boundary not found');
const accommodation=html.slice(start,end);
const count=(needle)=>accommodation.split(needle).length-1;

if(count('data-accommodation-view="subscription"')!==1){
  throw new Error('Accommodation Subscription & Billing menu entry must exist exactly once');
}
if(count('data-accommodation-content="subscription"')!==1){
  throw new Error('Accommodation subscription content view must exist exactly once');
}
if(count('data-partner-subscription-slot')!==1){
  throw new Error('Accommodation subscription panel must mount inside the dedicated view');
}
if(!accommodation.includes('Loading Accommodation Provider subscription details')){
  throw new Error('Accommodation subscription loading card missing');
}
if(!html.includes('partner.css?v=accommodation-subscription-v1')||
   !html.includes('partner.js?v=accommodation-subscription-v1')){
  throw new Error('Accommodation subscription cache version missing');
}

const required=[
  "subscription:'Review your Accommodation Provider subscription, renewal plan and payment status.'",
  "['overview','properties','bookings','availability','earnings','settlements','subscription','notifications','profile']",
  "['overview','subscription','notifications','profile']",
  "if(resolved==='subscription')mountPartnerSubscription('accommodation',accommodationDashboard)",
  "await mountPartnerSubscription('accommodation',accommodationDashboard).catch(()=>{})"
];
for(const marker of required){
  if(!js.includes(marker))throw new Error('Missing accommodation subscription safeguard: '+marker);
}

console.log('accommodation subscription placement regression checks passed');

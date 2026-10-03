const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('partner/index.html','utf8');
const partner=fs.readFileSync('partner/partner.js','utf8');
const cyber=fs.readFileSync('partner/cyber.js','utf8');

new vm.Script(partner,{filename:'partner/partner.js'});
new vm.Script(cyber,{filename:'partner/cyber.js'});

const premiumStart=html.indexOf('<section id="premiumDashboard"');
const premiumEnd=html.indexOf('<section class="seller-shell provider-shell accommodation-shell"',premiumStart);
if(premiumStart<0||premiumEnd<0)throw new Error('Premium dashboard boundary missing');
const premium=html.slice(premiumStart,premiumEnd);

const cyberStart=html.indexOf('<section id="cyberDashboard"');
const cyberEnd=html.indexOf('<section class="seller-shell" id="sellerShell"',cyberStart);
if(cyberStart<0||cyberEnd<0)throw new Error('Cyber dashboard boundary missing');
const cyberHtml=html.slice(cyberStart,cyberEnd);

const count=(source,needle)=>source.split(needle).length-1;

if(count(premium,'data-premium-view="subscription"')!==1)throw new Error('Premium Subscription & Billing menu must exist once');
if(count(premium,'data-premium-content="subscription"')!==1)throw new Error('Premium subscription view must exist once');
if(count(premium,'data-partner-subscription-slot')!==1)throw new Error('Premium billing panel must mount into dedicated subscription view');
if(count(premium,'data-premium-acceptance-slot')!==1)throw new Error('Premium overview must keep exactly one extra-acceptance slot');
if(!partner.includes("acceptancePanel.className='premium-acceptance-panel'"))throw new Error('Premium extra acceptance card was not separated from subscription payment');
if(!partner.includes("if(partnerType==='premium')"))throw new Error('Premium billing specialization missing');
if(!partner.includes("if(resolved==='subscription')mountPartnerSubscription('premium',premiumDashboard)"))throw new Error('Premium subscription view does not refresh billing');
if(!partner.includes("const allowed=['overview','requests','profile','subscription','notifications']"))throw new Error('Premium billing navigation is not enabled');
if(!partner.includes("Extra acceptance payment becomes available after your Premium Partner subscription is active."))throw new Error('Premium extra acceptance activation guard missing');

if(count(cyberHtml,'data-cyber-view="subscription"')!==1)throw new Error('Cyber Subscription & Billing menu must exist once');
if(count(cyberHtml,'data-cyber-content="subscription"')!==1)throw new Error('Cyber subscription view must exist once');
if(count(cyberHtml,'data-partner-subscription-slot')!==1)throw new Error('Cyber billing panel must mount into dedicated subscription view');
if(!cyber.includes("if(view==='subscription')window.leogoMountPartnerSubscription?.('cyber',shell)"))throw new Error('Cyber subscription view does not refresh billing');

if(!html.includes('partner.css?v=premium-cyber-subscription-v1')||
   !html.includes('partner.js?v=premium-cyber-subscription-v1')||
   !html.includes('cyber.js?v=premium-cyber-subscription-v1')){
  throw new Error('Premium/Cyber subscription cache versions missing');
}
if(!html.includes('.partner-subscription-grid{display:grid;grid-template-columns:1fr;')){
  throw new Error('Dedicated subscription payment card should use full available width');
}

console.log('premium + cyber subscription placement regression checks passed');

const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261006193000_shopping_voucher_checkout_rule.sql');
const app=read('js/app.js');
const wallet=read('js/wallet.js');
const property=read('js/vacant-houses.js');
const assisted=read('js/assisted-shopping.js');
const html=read('index.html');

new vm.Script(app,{filename:'js/app.js'});
new vm.Script(wallet,{filename:'js/wallet.js'});
new vm.Script(property,{filename:'js/vacant-houses.js'});
new vm.Script(assisted,{filename:'js/assisted-shopping.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const needle of [
  "round(v_order.grand_total_kes,2)<=v_available",
  "round(v_order.grand_total_kes*0.50,2)",
  "least(",
  "'shopping_voucher_balance_kes',v_points",
  "'max_checkout_cover_percent',50",
  "'requires_checkout_above_voucher_balance',true",
  "'shopping_voucher_checkout_max_percent',50",
  "LEOGO Shopping Voucher used on marketplace order"
]) must(migration.includes(needle),'Missing Shopping Voucher server rule: '+needle);

must(!migration.includes("payment_method=case when round(grand_total_kes-v_redeem,2)<=0 then 'points'"),'Voucher must never become an independent full-payment method.');
must(app.includes('let checkoutRewardMaxShare = 0.5;'),'Checkout 50% cap state missing.');
must(app.includes('const eligible=!healthOnlyCart&&balance>0&&total>balance;'),'Checkout must require total above voucher balance.');
must(app.includes('const maxByRule=Math.round(total*maxShare*100)/100;'),'Checkout 50% preview cap missing.');
must(app.includes('Shopping Voucher balance '),'Checkout must show voucher balance.');
must(app.includes('p_use_reward_points:usePoints'),'Server voucher redemption flag missing.');
must(wallet.includes('elements.pointsEarned.textContent = money(totals.points)'),'Wallet must show voucher balance as KSh value.');
must(html.includes('Shopping Voucher Balance'),'Customer Wallet Shopping Voucher card missing.');
must(html.includes('Use my LEOGO Shopping Voucher'),'Checkout voucher toggle missing.');
must(html.includes('Voucher applied'),'Checkout voucher applied label missing.');
must(html.includes('checkout total must be greater than your available voucher balance'),'Checkout rule explanation missing.');
must(property.includes('Approved customer property submission can earn LEOGO Shopping Voucher.'),'Simple property voucher message missing.');
must(!property.includes('id="vhPublicFee">Loading…'),'Property header must not show a permanent fee Loading state.');
must(!/\$\('#vh(?:Rent|Deposit|AvailableFrom|SalePrice|PropertySize|Ownership)Field'\)/.test(property),'Property field selector regression returned.');
must(property.includes('Promise.allSettled'),'Property settings failure must not block public listing load.');
must(assisted.includes('🎁 Use my LEOGO Shopping Voucher'),'Assisted Shopping voucher wording missing.');
must(assisted.includes('const voucherEligible=rewardPointsBalance>0&&total>rewardPointsBalance;'),'Assisted Shopping total-above-balance rule missing.');
must(assisted.includes('const maxByRule=Math.round(total*rewardMaxShare*100)/100;'),'Assisted Shopping 50% preview cap missing.');
must(assisted.includes("button.textContent=usePoints?'Applying Voucher…':'Submitting…';"),'Assisted Shopping voucher submission state missing.');
must(html.includes('js/assisted-shopping.js?v=shopping-voucher-rule-1'),'Assisted Shopping voucher cache-bust missing.');

console.log('Shopping Voucher checkout rule regression checks passed.');

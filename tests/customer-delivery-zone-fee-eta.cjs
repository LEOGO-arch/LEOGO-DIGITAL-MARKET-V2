const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const shipping=read('js/shipping-moq.js');
const eta=read('js/delivery-eta.js');
const html=read('index.html');
for(const zone of ['cbd','estate','outside']){
  assert.match(shipping,new RegExp("rate\\('[^']+',rates\\.[a-z_]+_fee_kes,'"+zone+"'"));
}
assert.match(shipping,/window\.leogoDeliveryEta\?\.zoneEstimate/);
assert.match(shipping,/leogo:delivery-estimates-ready/);
assert.match(eta,/Math\.max\(adminMinutes,sellerMinutes,handlingMinutes\)/);
assert.match(eta,/zoneEstimate,showCheckout/);
assert.match(html,/shipping-moq\.js\?v=zone-fee-eta-1/);
assert.match(html,/delivery-eta\.js\?v=zone-fee-eta-1/);
console.log('Customer fee + admin zone ETA contracts passed.');

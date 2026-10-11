const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('admin/admin.js','utf8');
const detailStart=source.indexOf('const renderMarketplaceOrderDetail=');
assert.notEqual(detailStart,-1,'marketplace order detail renderer should exist');
const detailEnd=source.indexOf('\n  const updateActiveOrderSortingStatus',detailStart);
assert.notEqual(detailEnd,-1,'order detail renderer boundary should exist');
const detailRenderer=source.slice(detailStart,detailEnd);

for(const selector of ['[data-detail-payment]','[data-cod-fee-review]']){
  assert.ok(
    detailRenderer.includes(`$$('${selector}').forEach(`),
    selector+' controls should be queried as a collection so an empty match is safe'
  );
  assert.ok(
    !detailRenderer.split('\n').some(line=>line.trimStart().startsWith(`$('${selector}').forEach(`)),
    selector+' controls must not use the single element selector'
  );
}

console.log('Admin order detail optional-control selector checks passed.');

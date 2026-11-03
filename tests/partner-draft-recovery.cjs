const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const portal=read('partner/partner.js');
const drafts=read('partner/draft-recovery.js');
const html=read('partner/index.html');
assert.match(portal,/\['TOKEN_REFRESHED','USER_UPDATED'\]\.includes\(event\)/);
assert.match(portal,/s\?\.user&&currentUser\?\.id===s\.user\.id/);
assert.match(html,/draft-recovery\.js\?v=partner-drafts-1/);
for(const name of ['sellerProductForm','providerServiceForm','transportVehicleForm','accommodationPropertyForm','accommodationUnitForm','cyberProductForm','cyberServiceForm','healthMedicineProductForm','healthSpecialistServiceForm']){
 assert.match(drafts,new RegExp(`'${name}'`));
 assert.ok(html.includes(`id="${name}"`),`${name} does not exist`);
}
assert.match(drafts,/leogo:partner-item-draft:v1:\$\{userId\}/);
assert.match(drafts,/event\.target\?\.type==='file'/);
assert.match(drafts,/\['SIGNED_OUT','SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED','USER_UPDATED'\]/);
assert.match(drafts,/pagehide/);
assert.match(drafts,/leogo:seller-product-saved/);
assert.match(drafts,/draft\.editProductId!==document\.getElementById\('sellerProductId'\)/);
assert.match(drafts,/data-variant-name/);
console.log('Partner draft recovery static checks passed.');

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html');
const app=read('js/app.js');
const migration=read('supabase/migrations/20261104140000_bar_adult_declaration_catalogue.sql');
for(const type of ['beer','wine','spirits','cider','all']){
 assert.match(html,new RegExp('data-bar-drink="'+type+'"'));
}
assert.match(app,/barCards\?\.addEventListener\('click'/);
assert.match(app,/barCards\?\.addEventListener\('keydown'/);
assert.match(app,/customer_confirm_bar_adult/);
assert.match(app,/customer_bar_declaration_status/);
assert.match(app,/customer_leogo_bar_catalogue/);
assert.match(app,/selectedMarketplaceCategory='alcoholic_leogo_bar'/);
assert.match(migration,/c\.code='alcoholic_leogo_bar'/);
assert.match(migration,/auth\.uid\(\) is null or not exists/);
assert.match(migration,/revoke all on function public\.customer_leogo_bar_catalogue\(\) from public,anon/);
assert.match(migration,/enable row level security/);
console.log('LEOGO BAR card wiring and adult-declared catalogue contracts passed.');

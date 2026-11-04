const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const script=read('js/delivery-eta.js');
const partner=read('partner/shipping-moq.js');
const admin=read('admin/admin.js');
const sql=read('supabase/migrations/20261104100000_product_delivery_duration_estimates.sql');
const zoneSql=read('supabase/migrations/20261104123000_seller_zone_delivery_minimums.sql');

assert.match(partner,/Local item delivery time/);
assert.match(partner,/International item delivery time/);
assert.doesNotMatch(partner,/Expected local delivery date/);
assert.match(admin,/Different counties/);
assert.match(sql,/seller_id=v_uid/);
assert.match(sql,/private\.is_leogo_admin\('delivery\.manage'\)/);
assert.match(sql,/enable row level security/);
assert.match(partner,/sellerZoneMinutes/);
assert.match(zoneSql,/seller_id=v_uid/);
assert.match(zoneSql,/v_value::integer < v_min/);
assert.match(script,/Math.max\(handling,travel,sellerZone\)/);
const atomicSql=read('supabase/migrations/20261104113000_atomic_delivery_rates_and_eta.sql');
assert.match(atomicSql,/security invoker/);
assert.match(atomicSql,/public\.admin_update_delivery_rate_settings/);
assert.match(atomicSql,/public\.admin_set_delivery_eta_settings/);
assert.match(admin,/admin_update_delivery_rates_and_eta/);
assert.doesNotMatch(admin,/Delivery fees saved, but timing settings failed/);


const events=[];
const context={
 Date,Intl,Map,Number,String,Math,Promise,Event:class Event{constructor(type){this.type=type;}},
 document:{querySelector:()=>null,addEventListener:()=>{},dispatchEvent:e=>events.push(e.type)},
 window:{leogoAuth:{client:{rpc:async name=>({data:name==='public_product_delivery_durations'
   ?[{product_id:'p1',seller_county:'Siaya',seller_town:'Siaya Town',local_minutes:2880,zone_minutes:{inter_county:4320,cbd:3600}}]
   :{cbd:120,estate:240,outside:1440,inter_county:2880,pickup:1440},error:null})}}}
};
vm.runInNewContext(script,context);
(async()=>{
 await context.window.leogoDeliveryEta.load();
 const base='2026-11-05T10:00:00+03:00';
 const cross=context.window.leogoDeliveryEta.estimate('p1','Nairobi','cbd',base);
 assert.equal(cross.route,'inter_county');
 assert.equal(cross.minutes,4320);
 assert.match(cross.date,/8 November 2026/);
 const local=context.window.leogoDeliveryEta.estimate('p1','Siaya','cbd',base);
 assert.equal(local.route,'cbd');
 assert.equal(local.minutes,3600);
 assert.equal(context.window.leogoDeliveryEta.estimate('p1','','cbd',base),null);
 assert.ok(events.includes('leogo:delivery-estimates-ready'));
 console.log('Delivery duration/date and cross-county checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261101120000_rent_pole_pole_workflow_v2.sql');
const customer=read('js/rent-pole-pole-workflow.js');
const admin=read('admin/rent-pole-pole-workflow.js');
for(const name of ['rent_change_requests','rent_payment_schedule','rent_payment_claims','rent_landlord_settlements']){
 assert.match(sql,new RegExp(`create table public\\.${name} \\(`));
 assert.match(sql,new RegExp(`alter table public\\.${name} enable row level security`));
}
for(const action of ['verify_landlord','approve','activate','verify_payment','settle','apply_change']){
 assert.ok(sql.includes(`p_action='${action}'`),`Missing ${action} state transition`);
}
assert.match(sql,/v_amount>v_paid-v_settled/,'Settlement limited to verified unsettled funds');
assert.match(sql,/rent_verified_reference_unique/,'Payment references cannot verify twice');
assert.match(sql,/not exists\s*\(select 1 from public\.rent_change_requests/,'Changes block acceptance');
assert.match(sql,/Pending change blocks settlement/);
assert.match(sql,/if a\.customer_accepted_at is null/);
assert.match(customer,/rent_accept_terms/);
assert.match(customer,/rent_change_requests/);
assert.match(customer,/rent_payment_claims/);
assert.match(customer,/getDestination\('marketplace_orders'/,'Rent shares assigned seller checkout account');
assert.match(customer,/renderInstructions\(el,paymentDestination/,'Use existing seller payment guide');
assert.match(customer,/No LEOGO Till\/Paybill is currently assigned/,'Missing account blocks receipt form');
assert.match(customer,/a\.status==='active'&&canPay/,'Only active plans show receipt submission');
assert.match(customer,/M-Pesa confirmation message \/ transaction reference/);
assert.match(admin,/rent_admin_action/);
assert.match(admin,/This does not transfer funds/);
assert.match(read('index.html'),/js\/rent-pole-pole-workflow\.js/);
assert.match(read('admin/index.html'),/rent-pole-pole-workflow\.js/);
console.log('Rent Pole Pole workflow static checks passed; database integration and PSP reconciliation still require staging tests.');

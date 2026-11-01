const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const customer=read('js/rent-pole-pole.js');
const admin=read('admin/rent-pole-pole.js');
const sql=read('supabase/migrations/20261101150000_rent_instalment_preferences.sql');

for(const cadence of ['daily','weekly','monthly']){
 assert.match(customer,new RegExp(`<option value="${cadence}">`));
 assert.match(sql,new RegExp(`'${cadence}'`));
}
for(const field of ['preferred_installment_cadence','preferred_minimum_installment','reminder_opt_in']){
 assert.ok(customer.includes(field),`${field} absent from customer form`);
 assert.ok(admin.includes(field),`${field} absent from admin review`);
 assert.ok(sql.includes(field),`${field} absent from migration`);
}
assert.match(customer,/fd\.get\('reminder_opt_in'\)==='yes'/);
assert.match(customer,/minInstalment > monthlyRent/);
assert.match(sql,/reminder_opt_in boolean not null default false/);
assert.match(sql,/preferred_minimum_installment <= monthly_rent/);
assert.match(sql,/rent_preference_pair/);
assert.match(customer,/do not change the approved rent billing terms/);
console.log('Rent instalment preference checks passed.');

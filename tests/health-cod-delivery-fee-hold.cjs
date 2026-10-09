const fs=require('fs');
const assert=require('assert');

const adminHealth=fs.readFileSync('admin/health.js','utf8');
const partnerHealth=fs.readFileSync('partner/health.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261009235000_health_cod_delivery_fee_hold_v1.sql','utf8');

assert.doesNotThrow(()=>new Function(adminHealth));
assert.doesNotThrow(()=>new Function(partnerHealth));

assert.match(adminHealth,/admin_review_health_cod_delivery_fee/);
assert.match(adminHealth,/Verify COD Delivery Fee/);
assert.match(adminHealth,/remaining COD balance stays due at handover/);

assert.match(partnerHealth,/COD delivery fee must be verified by LEOGO Admin before this order is handed to LEOGO/);

assert.match(migration,/cod_delivery_fee_status text not null default 'not_required'/);
assert.match(migration,/admin_review_health_cod_delivery_fee/);
assert.match(migration,/p_status='handed_to_leogo'/);
assert.match(migration,/COD delivery fee must be verified by LEOGO Admin before handing this Health order to LEOGO/);

console.log('Health COD delivery-fee hold regression checks passed.');

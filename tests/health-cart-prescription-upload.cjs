const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('js/app.js','utf8');
const health=fs.readFileSync('js/health.js','utf8');
const partnerHealth=fs.readFileSync('partner/health.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261007184500_health_cart_prescription_upload.sql','utf8');

assert.doesNotThrow(()=>new Function(app),'customer app must parse');
assert.doesNotThrow(()=>new Function(health),'health marketplace must parse');
assert.doesNotThrow(()=>new Function(partnerHealth),'Health Partner portal must parse');

assert.match(html,/id="healthPrescriptionPanel"[^>]*hidden/,'prescription panel must start hidden');
assert.match(html,/id="healthPrescriptionFile"/,'prescription upload input must exist');
assert.match(html,/doctor prescription must be uploaded at checkout/i,'customer marketplace must explain prescription checkout');

assert.match(app,/healthCartRequiresPrescription/,'checkout must detect prescription items');
assert.match(app,/from\('health-prescriptions'\)\s*\.upload/,'checkout must upload prescription to private bucket');
assert.match(app,/prescription_path:uploadedPrescriptionPath/,'order request must attach uploaded prescription path');
assert.doesNotMatch(app,/!item\.healthProductId \|\| !item\.providerId \|\| item\.requiresPrescription/,'prescription items must not be rejected from Health cart checkout');
assert.match(app,/requiresPrescription:Boolean\(product\.requires_prescription\)/,'cart must preserve authoritative prescription flag from listing');
assert.match(app,/8\*1024\*1024/,'client must enforce 8 MB prescription limit');

assert.match(health,/data-health-add-cart/,'approved Health products must expose Add to Cart');
assert.match(health,/Upload prescription at checkout/,'prescription products must be clearly labelled');

assert.match(partnerHealth,/View Doctor Prescription/,'fulfilling Health Partner must be able to view prescription');
assert.match(partnerHealth,/createSignedUrl\(path,300\)/,'prescription must use short-lived signed URL');
assert.match(partnerHtml,/health\.js\?v=health-prescription-cart-1/,'partner Health cache key must refresh');

assert.match(migration,/health-prescriptions/,'private prescription bucket must be configured');
assert.match(migration,/prescription_required boolean/,'orders must persist prescription requirement');
assert.match(migration,/p\.order_mode='cart'/,'backend must still require cart-eligible approved product');
assert.match(migration,/if v_product\.requires_prescription then/,'backend must independently detect prescription requirement');
assert.match(migration,/Upload the doctor prescription before placing this Health & Medicine order/,'backend must block missing prescriptions');
assert.match(migration,/split_part\(v_prescription_path,'\/',1\)<>v_uid::text/,'backend must require prescription path to belong to customer');
assert.match(migration,/o\.provider_id=\(select auth\.uid\(\)\)/,'only fulfilling Health Partner gets prescription read access');
assert.match(migration,/private\.is_leogo_admin\('orders\.read'\)/,'authorized Admin can read prescription');
assert.match(migration,/v_order_mode:='cart'/,'prescription medicines must remain cart-capable after partner save');

console.log('Health cart prescription checkout regression checks passed.');

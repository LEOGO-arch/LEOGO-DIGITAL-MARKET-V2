const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261005203000_admin_pickup_handover_evidence.sql','utf8');

new vm.Script(admin,{filename:'admin/admin.js'});
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(html.includes('id="adminOrderPickupHandoverEvidenceCard"'),'Admin order handover evidence card missing.');
must(html.includes('id="adminOrderPickupHandoverEvidence"'),'Admin order handover evidence host missing.');
must(html.includes('admin.js?v=pickup-handover-evidence-1'),'Admin JS cache marker missing.');

must(admin.includes("db.rpc('admin_get_pickup_handover_evidence'"),'Admin order detail must load Pickup Station handover evidence.');
must(admin.includes("db.storage.from('pickup-station-proof').createSignedUrl"),'Admin must use a secure signed URL for Pickup Station evidence.');
must(admin.includes('Customer Handover Evidence'),'Admin handover evidence label missing.');
must(admin.includes("String(order.delivery_zone||'').toLowerCase()!=='pickup'"),'Non-Pickup orders must not show Pickup Station evidence.');

must(migration.includes('private.is_leogo_admin(\'orders.read\')'),'Evidence RPC must require Admin order-read permission.');
must(migration.includes("'handover_photo_path',p.handover_photo_path"),'Evidence RPC must return the handover image path.');
must(!migration.includes('handover_customer_id_number'),'Handover evidence response must not expose the customer ID number unnecessarily.');

console.log('Admin Pickup Station handover evidence regression checks passed.');

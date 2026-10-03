const fs=require('node:fs');
const vm=require('node:vm');

const customerHtml=fs.readFileSync('index.html','utf8');
const customerJs=fs.readFileSync('js/app.js','utf8');
const healthCustomerJs=fs.readFileSync('js/health.js','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const partnerJs=fs.readFileSync('partner/partner.js','utf8');
const healthPartnerJs=fs.readFileSync('partner/health.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const healthAdminJs=fs.readFileSync('admin/health.js','utf8');
const schema=fs.readFileSync('supabase/migrations/20261003203000_health_medicine_partner_v1.sql','utf8');
const guard=fs.readFileSync('supabase/migrations/20261003203500_health_medicine_seller_guard.sql','utf8');
const region=fs.readFileSync('supabase/migrations/20261003204000_health_medicine_region_search.sql','utf8');

for(const [name,source] of [
  ['js/app.js',customerJs],
  ['js/health.js',healthCustomerJs],
  ['partner/partner.js',partnerJs],
  ['partner/health.js',healthPartnerJs],
  ['admin/admin.js',adminJs],
  ['admin/health.js',healthAdminJs]
]) new vm.Script(source,{filename:name});

const requireMarker=(source,marker,message)=>{
  if(!source.includes(marker))throw new Error(message+': '+marker);
};

// Partner separation
requireMarker(partnerHtml,'data-role-target="health_medicine"','Health partner role missing');
requireMarker(partnerHtml,'id="healthMedicineShell"','Health partner shell missing');
requireMarker(partnerHtml,'id="healthBusinessType"','Health business type selector missing');
requireMarker(partnerHtml,'value="pharmacy"','Pharmacy partner option missing');
requireMarker(partnerHtml,'value="optics"','Optics partner option missing');
requireMarker(partnerHtml,'value="medical_supplies"','Medical supplies partner option missing');
requireMarker(partnerHtml,'value="orthopaedic_rehab"','Orthopaedic/Rehab partner option missing');
requireMarker(partnerHtml,'value="laboratory_diagnostics"','Laboratory/Diagnostics partner option missing');
requireMarker(partnerJs,"target==='health_medicine'","Partner router does not open Health module");
requireMarker(partnerJs,'window.leogoPartnerClient=client','Health module must reuse Partner auth client');
requireMarker(healthPartnerJs,'const client=window.leogoPartnerClient','Health module is not using isolated Partner auth');
requireMarker(healthPartnerJs,"businessType==='pharmacy'","Pharmacy document validation missing");
requireMarker(healthPartnerJs,"row.approval_status==='under_review'","Health product edit lock missing");
requireMarker(partnerJs,"item.code!=='pharmacy'","Seller fallback taxonomy still exposes Pharmacy");

// Customer separation
if(customerHtml.includes('data-product-category-code="pharmacy"')){
  throw new Error('Ordinary customer Seller Pharmacy category card must be removed');
}
requireMarker(customerHtml,'data-system-category="health-medicine"','Health & Medicine customer category card missing');
requireMarker(customerHtml,'id="health-medicine"','Health customer marketplace missing');
requireMarker(healthCustomerJs,"client.rpc('public_list_health_medicine')",'Health customer marketplace RPC missing');
requireMarker(healthCustomerJs,'data-health-product-id','Health product search target missing');
requireMarker(customerJs,"client.rpc('public_search_health_medicine'","Global customer search does not include Health');
requireMarker(customerJs,"health_product:{label:'Health Product'","Global search Health result type missing");

// Admin separation
requireMarker(adminHtml,'data-admin-view="health"','Health Admin navigation missing');
requireMarker(adminHtml,'data-admin-panel="health"','Health Admin panel missing');
requireMarker(adminHtml,'data-approval-filter="health"','Health Approval Center filter missing');
requireMarker(adminJs,"db.rpc('admin_list_health_medicine_approvals')",'Health approval queue not loaded');
requireMarker(adminJs,"'admin_review_health_medicine_application'",'Health application review routing missing');
requireMarker(adminJs,"'admin_review_health_medicine_product'",'Health product review routing missing');
requireMarker(adminJs,"kind.startsWith('health_medicine_') ? 'health'",'Health approval grouping missing');
requireMarker(healthAdminJs,"db.rpc('admin_list_health_medicine_network')",'Health Admin network RPC missing');

// Database safeguards
for(const marker of [
  'create table if not exists public.health_medicine_accounts',
  'create table if not exists public.health_medicine_products',
  "'pharmacy','optics','medical_supplies','orthopaedic_rehab','laboratory_diagnostics','other_health'",
  "business_type <> 'pharmacy'",
  "medicine_classification in ('non_medicine','otc','prescription_required','pharmacy_only')",
  "order_mode text not null default 'enquiry_only'",
  "Only an approved Pharmacy partner can list pharmaceutical products",
  "create or replace function public.admin_list_health_medicine_approvals()",
  "create or replace function public.public_list_health_medicine()",
  "where c.is_active=true and c.code<>'pharmacy'",
  "where c.is_active and c.code<>'pharmacy'"
]) requireMarker(schema,marker,'Health schema safeguard missing');

requireMarker(guard,'seller_products_health_medicine_guard','Seller Health category guard trigger missing');
requireMarker(guard,"c.code='pharmacy'",'Seller Pharmacy guard condition missing');
requireMarker(region,'v_location_only boolean','Health official-region precision missing');
requireMarker(region,'public.kenya_counties','Health county recognition missing');
requireMarker(region,'public.kenya_subcounties','Health sub-county recognition missing');

// The Health Admin panel must be closed before settlements starts.
const healthPanelStart=adminHtml.indexOf('<section class="admin-panel" data-admin-panel="health">');
const settlementsStart=adminHtml.indexOf('<section class="admin-panel" data-admin-panel="settlements">',healthPanelStart);
if(healthPanelStart<0||settlementsStart<0)throw new Error('Health/settlements Admin panel boundaries missing');
const healthBlock=adminHtml.slice(healthPanelStart,settlementsStart);
if(!healthBlock.trimEnd().endsWith('</section>'))throw new Error('Health Admin panel is not closed before Settlements');

console.log('health & medicine partner v1 regression checks passed');

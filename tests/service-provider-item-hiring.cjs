const fs=require('node:fs');
const vm=require('node:vm');

const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const partnerJs=fs.readFileSync('partner/partner.js','utf8');
const partnerCss=fs.readFileSync('partner/partner.css','utf8');
const customerHtml=fs.readFileSync('index.html','utf8');
const customerJs=fs.readFileSync('js/app.js','utf8');
const customerCss=fs.readFileSync('css/style.css','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261005223000_service_provider_item_hiring_v1.sql','utf8');

new vm.Script(partnerJs,{filename:'partner/partner.js'});
new vm.Script(customerJs,{filename:'js/app.js'});
new vm.Script(adminJs,{filename:'admin/admin.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Partner: Normal Service remains present and Item for Hire is an additive branch.
must(partnerHtml.includes('<option value="normal">Normal Service</option>'),'Normal Service option missing.');
must(partnerHtml.includes('<option value="item_hire">Item for Hire</option>'),'Item for Hire option missing.');
for(const id of [
  'providerHireItemName','providerHireItemImage','providerHireChargeBasis','providerHireRate',
  'providerHireMinimumUnits','providerHireQuantity','providerHireFulfilment',
  'providerHireSecurityDeposit','providerHireDamagePenalty','providerHireDamageTerms',
  'providerHireLatePenaltyBasis','providerHireLatePenalty','providerHireTerms'
]) must(partnerHtml.includes('id="'+id+'"'),'Partner hire field missing: '+id);

must(partnerJs.includes("client.rpc('service_provider_save_service_v2'"),'Item for Hire must save through the additive v2 service RPC.');
must(partnerJs.includes("saveResult=await client.rpc('service_provider_save_service'"),'Normal Service must keep the existing save RPC.');
must(partnerJs.includes("$('#providerServiceType').disabled=true"),'Existing listing service type must be locked during edit so Normal and Hire workflows cannot be silently converted.');
must(partnerJs.includes("client.rpc('service_provider_update_hire_job'"),'Provider hire lifecycle RPC missing.');
must(partnerJs.includes("uploadProviderHireItemPhoto"),'Hire item photo upload missing.');
must(partnerJs.includes("item.service_type!=='item_hire'&&item.approval_status==='approved'"),'Item hire must stay out of the existing Service Flash Sale workflow.');
must(partnerJs.includes('Confirm Availability'),'Provider hire Confirm Availability action missing.');
must(partnerJs.includes('Item Handed Over'),'Provider hire handover action missing.');
must(partnerJs.includes('Item Returned / Complete Hire'),'Provider hire return/completion action missing.');
must(partnerJs.includes("startsWith('HR-')?'Item hire'"),'Item hire earnings must be labelled correctly in Provider statements.');
must(partnerCss.includes('/* Service Provider Item Hiring */'),'Partner hire styling missing.');

// Customer: dedicated hire request with transparent owner-set terms.
for(const id of [
  'serviceHireBookingFields','serviceHireUnits','serviceHireQuantity','serviceHireFulfilment',
  'serviceHireDeposit','serviceHireDamagePenalty','serviceHireLatePenalty','serviceHireTerms',
  'serviceHireTermsAccepted'
]) must(customerHtml.includes('id="'+id+'"'),'Customer hire element missing: '+id);
must(customerJs.includes("client.rpc('customer_create_hire_request'"),'Customer hire booking RPC missing.');
must(customerJs.includes("configuredSeconds === 5 || configuredSeconds === 3 ? 5 : 0"),'Unrelated 5-second advertisement fix must remain intact.');
must(customerJs.includes("service_type==='item_hire'"),'Customer must branch on item-hire listings.');
must(customerJs.includes('hire_security_deposit_total_kes'),'Customer deposit calculation/activity missing.');
must(customerJs.includes('hire_damage_penalty_applied_kes'),'Customer return damage settlement missing.');
must(customerJs.includes('hire_late_penalty_applied_kes'),'Customer late-return settlement missing.');
must(customerCss.includes('/* Service Provider Item Hiring — Customer Front */'),'Customer hire styling missing.');

// Admin: approval and operational visibility.
must(adminJs.includes("hire_item_image_path: { label: 'Hire Item Picture'"),'Admin hire item image preview mapping missing.');
must(adminJs.includes("item.service_type==='item_hire'"),'Admin hire listing branch missing.');
must(adminJs.includes('hire_security_deposit_total_kes'),'Admin refundable deposit visibility missing.');
must(adminJs.includes('hire_damage_penalty_kes_snapshot'),'Admin owner-set damage terms visibility missing.');
must(adminJs.includes('hire_late_penalty_kes_snapshot'),'Admin owner-set late terms visibility missing.');

// Database: normal is default; owner terms are snapshotted; booking is serialized to prevent overbooking.
must(migration.includes("service_type text not null default 'normal'"),'Existing services must default to Normal Service.');
must(migration.includes("service_type in ('normal','item_hire')"),'Service type constraint missing.');
must(migration.includes('hire_security_deposit_kes numeric(12,2) not null default 0'),'Owner security deposit column missing.');
must(migration.includes('hire_damage_penalty_kes numeric(12,2) not null default 0'),'Owner damage penalty column missing.');
must(migration.includes('hire_late_penalty_kes numeric(12,2) not null default 0'),'Owner late-return penalty column missing.');
must(migration.includes('hire_damage_penalty_kes_snapshot'),'Damage penalty snapshot missing.');
must(migration.includes('hire_late_penalty_kes_snapshot'),'Late penalty snapshot missing.');
must(migration.includes('hire_terms_snapshot'),'Hire terms snapshot missing.');
must(migration.includes('for update of s;'),'Hire availability check must serialize on the service row.');
must(migration.includes("r.request_status in ('accepted','in_progress') and r.hire_actual_return_at is null"),'Confirmed or active hires must keep inventory reserved until the item is returned.');
must(migration.includes("'New item hire request'"),'Admin dispatch must use item-hire wording for the provider.');
must(migration.includes("request_type in ('direct','quotation','hire')"),'Hire request type extension missing.');
must(migration.includes('v_refund_due:=greatest'),'Deposit refund calculation missing.');
must(migration.includes('v_additional_due:=greatest'),'Additional penalty calculation missing.');
must(migration.includes('provider_labour_kes=case when p_action=\'return\' then hire_charge_kes'),'Only the base hire charge should feed existing provider earnings/commission.');
must(migration.includes("if v_service.service_type='item_hire' then"),'Backend must keep Item for Hire out of Service Flash Sale.');

must(partnerHtml.includes('partner.js?v=item-hire-1')&&partnerHtml.includes('partner.css?v=item-hire-1'),'Partner item-hire asset cache markers missing.');
must(customerHtml.includes('js/app.js?v=item-hire-1')&&customerHtml.includes('css/style.css?v=item-hire-1'),'Customer item-hire asset cache markers missing.');
must(adminHtml.includes('admin.js?v=item-hire-1'),'Admin item-hire cache marker missing.');

console.log('Service Provider Item Hiring regression checks passed.');

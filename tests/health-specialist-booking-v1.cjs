const fs=require('fs');
const path=require('path');

const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(message);};
const count=(text,needle)=>text.split(needle).length-1;

const migration=read('supabase/migrations/20261004010000_health_specialist_services_bookings_v1.sql');
const customer=read('js/health-specialist.js');
const health=read('js/health.js');
const index=read('index.html');
const partner=read('partner/health-specialist.js');
const partnerHealth=read('partner/health.js');
const partnerIndex=read('partner/index.html');
const admin=read('admin/health-specialist.js');
const adminHealth=read('admin/health.js');
const adminCore=read('admin/admin.js');
const adminIndex=read('admin/index.html');

must(migration.includes("'health_specialist'"),'Health Specialist business type missing from migration.');
must(migration.includes('health_specialist_services'),'Health Specialist services table missing.');
must(migration.includes('health_specialist_bookings'),'Health Specialist bookings table missing.');
must(migration.includes('specialist_booking_fee_kes'),'Admin-controlled booking fee missing.');
must(migration.includes('admin_health_specialist_set_booking_fee'),'Admin booking fee RPC missing.');
must(migration.includes('customer_create_health_specialist_booking'),'Customer booking RPC missing.');
must(migration.includes("payment_status='verified_paid'"),'Provider access must require verified booking fee.');
must(migration.includes('admin_review_health_specialist_booking_payment'),'Admin booking-fee verification RPC missing.');
must(migration.includes("'service_payments'"),'Existing LEOGO service payment destination must be reused.');
must(migration.includes('admin_list_pending_payment_actions'),'Booking-fee payment must join Admin Action Required queue.');
must(migration.includes('guard_health_specialist_product_listing'),'Specialist product-listing guard missing.');

must(index.includes('Health Specialist / Doctor'),'Customer Health filter is missing Health Specialist / Doctor.');
must(index.includes('healthSpecialistServiceGrid'),'Customer specialist service grid missing.');
must(index.includes('healthSpecialistBookingModal'),'Customer specialist booking modal missing.');
must(index.includes('js/health-specialist.js?v=health-specialist-v1'),'Customer specialist script missing.');
must(customer.includes('public_list_health_specialist_services'),'Customer public specialist service RPC missing.');
must(customer.includes('customer_create_health_specialist_booking'),'Customer booking submission missing.');
must(customer.includes('customer_list_health_specialist_bookings'),'Customer booking history missing.');
must(customer.includes('LEOGO booking fee'),'Customer fee separation wording missing.');
must(health.includes("health_specialist:'Health Specialist / Doctor'"),'Health directory does not recognize specialists.');

must(partnerIndex.includes('healthSpecialistServiceForm'),'Partner specialist service form missing.');
must(partnerIndex.includes('healthSpecialistBookingList'),'Partner specialist booking list missing.');
must(partnerIndex.includes('partner/health-specialist.js')===false,'Partner script should use local relative filename, not duplicated directory.');
must(partnerIndex.includes('health-specialist.js?v=health-specialist-v1'),'Partner specialist script missing.');
must(partnerHealth.includes("'services','bookings'"),'Partner Health navigation does not allow specialist views.');
must(partner.includes('health_specialist_save_service'),'Partner service-save RPC missing.');
must(partner.includes('health_specialist_list_own_bookings'),'Partner booking RPC missing.');
must(partner.includes('health_specialist_update_booking_status'),'Partner booking response RPC missing.');

must(adminIndex.includes('adminHealthSpecialistFeeForm'),'Admin specialist fee control missing.');
must(adminIndex.includes('adminHealthSpecialistBookingList'),'Admin specialist bookings UI missing.');
must(adminIndex.includes('health-specialist.js?v=health-specialist-v1'),'Admin specialist script missing.');
must(admin.includes('admin_health_specialist_set_booking_fee'),'Admin fee-save RPC missing.');
must(admin.includes('admin_review_health_specialist_booking_payment'),'Admin payment verification missing.');
must(!admin.includes("$('[data-admin-view=\"health\"]').forEach"),'Admin Health navigation must not call forEach on querySelector.');
must(admin.includes("document.querySelectorAll('[data-admin-view=\"health\"]').forEach"),'Admin Health navigation multi-element listener binding missing.');
must(!adminHealth.includes("$('[data-health-payment-action]',orderList).forEach"),'Admin Health payment actions must not call forEach on querySelector.');
must(adminHealth.includes("orderList.querySelectorAll('[data-health-payment-action]').forEach"),'Admin Health payment action multi-element listener binding missing.');
must(adminCore.includes("db.rpc('admin_list_health_specialist_approvals')"),'Approval Center does not load specialist services.');
must(adminCore.includes("'admin_review_health_specialist_service'"),'Approval Center does not review specialist services.');
must(count(adminCore,"health_medicine_service")>=4,'Health Specialist approval kind is not fully integrated.');

for(const [name,source] of [['customer specialist',customer],['partner specialist',partner],['partner health',partnerHealth],['admin specialist',admin],['admin health',adminHealth]]){
  new Function(source);
}

console.log('Health Specialist / Doctor V1 static checks passed.');

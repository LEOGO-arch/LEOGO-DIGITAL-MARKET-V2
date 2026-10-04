const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message);};

const admin=read('admin/admin.js');
const html=read('admin/index.html');
const migration=read('supabase/migrations/20261004173000_admin_financial_service_accommodation.sql');

new vm.Script(admin,{filename:'admin/admin.js'});

must(admin.includes("admin_financial_overview_service_accommodation"),'Admin dashboard must load the connected revenue RPC.');
must(admin.includes("Service Fees & Commission"),'Service financial row must be connected and clearly labelled.');
must(admin.includes("Accommodation Revenue"),'Accommodation financial row must be connected and clearly labelled.');
must(admin.includes("data.revenue.total_leogo="),'Connected revenue must be included in Total LEOGO Revenue.');
must(admin.includes("request_fees_kes"),'Service request-fee breakdown must be retained.');
must(admin.includes("referral_commission_kes"),'Service referral commission breakdown must be retained.');
must(admin.includes("hotel_commission_kes"),'Accommodation hotel commission breakdown must be retained.');
must(admin.includes("customer_service_fee_kes"),'Accommodation customer service-fee breakdown must be retained.');
must(html.includes('admin.js?v=financial-service-accommodation-1'),'Admin dashboard cache version missing.');

must(migration.includes("private.is_leogo_admin('dashboard.read')"),'Connected revenue RPC must keep Admin dashboard authorization.');
must(migration.includes("payment_status='verified'"),'Service request fees must require verified payment.');
must(migration.includes("payment_verified_at >= v_from"),'Service request fee reporting must use payment verification date.');
must(migration.includes("request_status='completed'"),'Service referral commission must require a completed job.');
must(migration.includes("completed_at >= v_from"),'Service commission reporting must use completion date.');
must(migration.includes("booking_status in ('accepted','completed')"),'Accommodation revenue must exclude pending/rejected/cancelled bookings.');
must(migration.includes("leogo_revenue_kes"),'Accommodation LEOGO revenue snapshot must be used.');
must(migration.includes("revoke all on function public.admin_financial_overview_service_accommodation"),'Connected revenue RPC must not be public/anon executable.');
must(migration.includes("grant execute on function public.admin_financial_overview_service_accommodation"),'Authenticated Admin execution grant missing.');

console.log('Admin service/accommodation financial overview checks passed.');

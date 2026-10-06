const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261006131644_vacant_houses_marketplace_v1.sql');
const safeDefaults=read('supabase/migrations/20261006133217_vacant_houses_voucher_admin_set_default.sql');
const hardening=read('supabase/migrations/20261006133848_vacant_houses_security_index_hardening.sql');
const customer=read('js/vacant-houses.js');
const customerCss=read('css/vacant-houses.css');
const admin=read('admin/vacant-houses.js');
const adminCss=read('admin/vacant-houses.css');
const customerHtml=read('index.html');
const adminHtml=read('admin/index.html');
const adminCore=read('admin/admin.js');
const loyalty=read('admin/loyalty-rewards.js');

new vm.Script(customer,{filename:'js/vacant-houses.js'});
new vm.Script(admin,{filename:'admin/vacant-houses.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const needle of [
  'create table if not exists public.vacant_house_settings',
  'create table if not exists public.vacant_house_listings',
  'create table if not exists private.vacant_house_private_details',
  'create table if not exists public.vacant_house_viewing_requests',
  'vacant-house-public-media',
  "viewing_access_fee_kes numeric(12,2) not null default 300",
  "credit_source in (",
  "'vacant_house_submission'",
  "private.credit_vacant_house_submission_voucher",
  "customer_submit_vacant_house",
  "public_list_vacant_houses",
  "customer_get_vacant_house_access_quote",
  "customer_submit_vacant_house_viewing_request",
  "customer_get_my_vacant_house_viewing_requests",
  "admin_review_vacant_house_listing",
  "admin_review_vacant_house_viewing_payment",
  "admin_save_vacant_house_settings",
  "private.is_leogo_admin('approvals.manage')",
  "private.is_leogo_admin('payments.manage')",
  "private.write_admin_audit",
  "revoke all on table private.vacant_house_private_details from public,anon,authenticated"
]) must(migration.includes(needle),'Missing Vacant Houses database behavior: '+needle);

must(safeDefaults.includes('submission_voucher_kes set default 0') && safeDefaults.includes('voucher_enabled set default false'),'Submission voucher must start disabled at KSh 0 until Admin sets it.');
must(hardening.includes('vacant_house_settings_deny_direct_api') && hardening.includes('vacant_house_listings_deny_direct_api') && hardening.includes('vacant_house_viewing_requests_deny_direct_api'),'Explicit deny-direct-access RLS policies missing.');
must(hardening.includes('vacant_house_listings_approved_by_idx') && hardening.includes('vacant_house_listings_voucher_reward_idx') && hardening.includes('vacant_house_viewing_verified_by_idx'),'Vacant House FK hardening indexes missing.');
must(migration.includes("'shopping_reward','credit'"),'House submission voucher must use non-withdrawable LEOGO Points.');
must(migration.includes("approval_status='approved'") && migration.includes("availability_status='vacant'"),'Public feed must expose only approved vacant houses.');
must(!/returns table\([\s\S]{0,1200}(contact_phone|exact_address|latitude|longitude)/.test(migration.match(/create or replace function public\.public_list_vacant_houses[\s\S]*?\$function\$;/)?.[0]||''),'Public listing RPC must not return protected location/contact.');
must(migration.includes("case when r.payment_status in ('verified','waived') then d.exact_address else null end"),'Exact address must remain gated by verified viewing access.');
must(migration.includes("case when r.payment_status in ('verified','waived') then d.contact_phone else null end"),'Contact phone must remain gated by verified viewing access.');

must(customerHtml.includes('href="#vacant-houses"'),'Vacant Houses customer category/navigation missing.');
must(customerHtml.includes('js/vacant-houses.js?v=vacant-houses-v1'),'Vacant Houses customer script missing.');
must(customerHtml.includes('css/vacant-houses.css?v=vacant-houses-v1'),'Vacant Houses customer CSS missing.');
must(customer.includes("public_list_vacant_houses"),'Customer public house feed RPC missing.');
must(customer.includes("customer_submit_vacant_house"),'Customer house submission RPC missing.');
must(customer.includes("customer_submit_vacant_house_viewing_request"),'Customer viewing request/payment flow missing.');
must(customer.includes("contact_reveal_consent"),'Submitter consent gate missing.');
must(customer.includes("It is not rent, booking deposit or tenancy deposit."),'Viewing fee must be distinguished from rent/deposit.');
must(customer.includes("customer_set_my_vacant_house_status"),'Customer owner must be able to mark a house occupied/archive it.');
must(customer.includes("voucher_enabled:false, submission_voucher_kes:0"),'Customer fallback must not invent a Shopping Voucher value.');

must(adminHtml.includes('data-admin-view="vacant_houses"'),'Vacant Houses Admin navigation missing.');
must(adminHtml.includes('vacant-houses.js?v=vacant-houses-v1'),'Vacant Houses Admin script missing.');
must(adminHtml.includes('vacant-houses.css?v=vacant-houses-v1'),'Vacant Houses Admin CSS missing.');
must(adminCore.includes("vacant_houses: () =>"),'Vacant Houses Admin permission gate missing.');
must(admin.includes("admin_get_vacant_house_dashboard"),'Vacant Houses Admin dashboard load missing.');
must(admin.includes("admin_review_vacant_house_listing"),'Vacant Houses Admin approval action missing.');
must(admin.includes("admin_review_vacant_house_viewing_payment"),'Vacant Houses Admin payment verification missing.');
must(admin.includes("admin_assign_payment_account") && admin.includes("vacant_house_viewing"),'Viewing payment account assignment missing.');
must(loyalty.includes("HOUSE LISTING VOUCHER"),'Admin Loyalty & Rewards must label house submission vouchers.');

must(customerCss.includes('.vh-grid'),'Customer Vacant Houses styles missing.');
must(adminCss.includes('.vh-admin-summary'),'Admin Vacant Houses styles missing.');

console.log('Vacant Houses marketplace V1 regression checks passed.');

const fs=require('node:fs');
const vm=require('node:vm');

const read=(p)=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261004200000_referral_share_earn_v1.sql');
const referrals=read('js/referrals.js');
const wallet=read('js/wallet.js');
const admin=read('admin/loyalty-rewards.js');
const customerHtml=read('index.html');
const adminHtml=read('admin/index.html');
const customerCss=read('css/style.css');
const adminCss=read('admin/admin.css');

new vm.Script(referrals,{filename:'js/referrals.js'});
new vm.Script(wallet,{filename:'js/wallet.js'});
new vm.Script(admin,{filename:'admin/loyalty-rewards.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const needle of [
  'create table if not exists public.customer_referral_settings',
  'create table if not exists public.customer_referral_codes',
  'create table if not exists public.customer_referrals',
  'customer_get_referral_program',
  'customer_claim_referral_code',
  'customer_mark_referral_shared',
  'trg_auto_process_referral_qualification',
  "payment_status in ('verified_paid','cod_paid')",
  "order_status='delivered'",
  'minimum_qualifying_order_kes',
  'max_rewarded_referrals_per_customer',
  'referral_referrer',
  'referral_welcome',
  'self_referral_not_allowed',
  'first_order_already_completed',
  'for update;'
]) must(migration.includes(needle),'Missing referral safety/database behavior: '+needle);

must(migration.includes("'shopping_reward','credit'"),'Referral vouchers must reuse the non-withdrawable LEOGO Points ledger class.');
must(migration.includes('admin_update_referral_reward_settings'),'Admin referral reward settings RPC missing.');
must(migration.includes("private.is_leogo_admin('settings.manage')"),'Admin settings permission guard missing.');
must(migration.includes("private.write_admin_audit"),'Referral settings changes must be audited.');

must(customerHtml.includes('id="referralShareEarnCard"'),'Customer Share & Earn card missing.');
must(customerHtml.includes('data-open-referral-rewards'),'Customer Dashboard Share & Earn shortcut missing.');
must(customerHtml.includes('id="registerReferralCode"'),'Optional registration referral field missing.');
must(customerHtml.includes('js/referrals.js?v=referral-share-earn-v1'),'Referral customer asset missing.');
must(referrals.includes("customer_get_referral_program"),'Customer referral load RPC missing.');
must(referrals.includes("customer_claim_referral_code"),'Customer referral claim RPC missing.');
must(referrals.includes("navigator.share"),'Native Share action missing.');
must(referrals.includes("https://wa.me/?text="),'WhatsApp referral sharing missing.');

must(wallet.includes(".from('wallet_ledger_entries')"),'Wallet statement must continue reading ledger entries.');
must(wallet.includes(".select('*')"),'Wallet statement must include reward ledger rows.');
must(customerHtml.includes('referral vouchers, fees and running balance'),'Wallet Statement copy must mention referral vouchers.');

must(adminHtml.includes('id="referralRewardsSettingsForm"'),'Admin referral reward settings form missing.');
must(adminHtml.includes('id="loyaltyRecentReferrals"'),'Admin referral activity list missing.');
must(adminHtml.includes('loyalty-rewards.js?v=referral-share-earn-v1'),'Admin referral asset cache version missing.');
must(admin.includes("admin_get_referral_rewards_dashboard"),'Admin referral dashboard RPC missing.');
must(admin.includes("admin_update_referral_reward_settings"),'Admin referral settings save RPC missing.');
must(admin.includes("REFERRAL VOUCHER"),'Admin reward source label missing.');

must(customerCss.includes('.referral-share-card'),'Customer referral styles missing.');
must(adminCss.includes('.referral-admin-settings-form'),'Admin referral styles missing.');

console.log('Share & Earn referral reward regression checks passed.');

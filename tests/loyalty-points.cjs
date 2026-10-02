const fs=require('node:fs');
const vm=require('node:vm');

const files={
  app:fs.readFileSync('js/app.js','utf8'),
  wallet:fs.readFileSync('js/wallet.js','utf8'),
  assisted:fs.readFileSync('js/assisted-shopping.js','utf8'),
  rider:fs.readFileSync('staff/staff.js','utf8'),
  pickup:fs.readFileSync('pickup/pickup.js','utf8'),
  admin:fs.readFileSync('admin/admin.js','utf8'),
  loyaltyAdmin:fs.readFileSync('admin/loyalty-rewards.js','utf8'),
  index:fs.readFileSync('index.html','utf8'),
  adminHtml:fs.readFileSync('admin/index.html','utf8')
};

for(const [name,source] of Object.entries(files)){
  if(name.endsWith('Html')||name==='index')continue;
  new vm.Script(source,{filename:name+'.js'});
}

const need=(source,needle,label)=>{
  if(!source.includes(needle))throw new Error('Missing '+label+': '+needle);
};

need(files.index,'id="checkoutUsePoints"','checkout points switch');
need(files.index,'id="checkoutAmountDue"','checkout amount due');
need(files.app,'get_my_reward_points_balance','points balance RPC');
need(files.app,'customer_create_marketplace_order_v2','points marketplace checkout RPC');
need(files.app,'customer_list_marketplace_orders_v3','points-aware order history');
need(files.app,'p_use_reward_points: usePoints','server redemption flag');
need(files.wallet,'points · worth','wallet points cash-value label');
need(files.wallet,'leogo:walletrefresh','wallet refresh after point use');
need(files.assisted,'customer_accept_assisted_shopping_quote_v2','Assisted Shopping points RPC');
need(files.rider,'rider_list_delivery_jobs_v4','Rider post-points amount due');
need(files.rider,'external_amount_due_kes??job.grand_total_kes','Rider COD reduced amount');
need(files.pickup,'pickup_partner_list_parcels_v2','Pickup Station points-aware parcel list');
need(files.pickup,'external_amount_due_kes??p.grand_total_kes','Pickup Station COD reduced amount');
need(files.admin,'reward_points_redeemed_kes','Admin order point split');
need(files.adminHtml,'id="loyaltyRewardsIssued"','live Loyalty dashboard');
need(files.loyaltyAdmin,'admin_get_loyalty_rewards_dashboard','live Loyalty dashboard RPC');

const migration=fs.readFileSync('supabase/migrations/20261002123000_loyalty_auto_credit_points_checkout.sql','utf8');
need(migration,'trg_auto_credit_marketplace_reward','automatic reward trigger');
need(migration,'reward_redemption_restore','cancelled-order point restoration');
need(migration,'entry_type not in (\'shopping_reward\',\'reward_redemption\',\'reward_redemption_restore\')','points excluded from wallet withdrawals');
need(migration,'external_amount_due_kes','remaining payment snapshot');
need(migration,'1 point = KSh 1','point conversion');

const cashSeparation=fs.readFileSync('supabase/migrations/20261002130000_loyalty_points_separate_cash_balance.sql','utf8');
need(cashSeparation,"'balance',greatest(0,v_cash_balance)",'cash balance excludes points');

const pickupMigration=fs.readFileSync('supabase/migrations/20261002131500_loyalty_points_pickup_station_due.sql','utf8');
need(pickupMigration,'external_amount_due_kes','Pickup Station reduced amount exposure');

console.log('loyalty points regression checks passed');

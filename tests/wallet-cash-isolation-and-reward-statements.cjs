// Pure wallet-safety invariants and actual statementData execution fixtures.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261011091500_wallet_cash_isolation_and_payout_proof_v1.sql');
const wallet=read('js/wallet.js');
const admin=read('admin/wallet-payouts.js');
const adminHtml=read('admin/index.html');
const customerHtml=read('index.html');
new vm.Script(wallet,{filename:'js/wallet.js'});
new vm.Script(admin,{filename:'admin/wallet-payouts.js'});
const must=(needle,msg)=>assert.ok(sql.includes(needle),msg||('Missing SQL guard: '+needle));
const rewards="entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore')";
assert.ok(sql.split(rewards).length>=7,'Every cash-only money path must exclude rewards');
for(const fn of [
  'public.admin_approve_wallet_withdrawal','public.enforce_wallet_withdrawal_insert',
  'private.submit_wallet_withdrawal','private.charge_wallet_statement_download',
  'public.apply_monthly_wallet_maintenance_fees','private.wallet_loan_eligibility',
  'private.set_wallet_loan_snapshot','public.complete_due_wallet_withdrawals',
  'public.admin_complete_wallet_withdrawal',
  'public.admin_list_wallet_pending_payout_confirmations'
])must(fn,'Missing wallet guard '+fn);
must('p_transfer_confirmed is not true','Payout confirmation requires positive proof assertion');
must("v_row.request_status<>'approved_processing'",'Only approved processing payouts can complete');
must('private.is_leogo_admin(\'approvals.manage\')','Admin payout permission required');
must('wallet_completed_payout_reference_unique','Prevent duplicate settlement references');
must('return 0;\nend;\n$function$;','Elapsed time must no longer mark payouts completed');
must('private.write_admin_audit(','Payout proof audit required');
must('user_id=v_request.user_id and account_status=\'active\' for update',
  'Withdrawal approval must serialize on wallet row');
must("id<>v_request.id",'Must reserve money for other pending withdrawals');
must("where user_id=v_user_id and entry_type not in",
  'Statement charge must exclude reward points');
assert.ok(wallet.includes('rewardCreditSources'),'Reward source labels must be available');
assert.ok(wallet.includes('Loyalty points earned from completed order'),'Loyalty credit label missing');
assert.ok(wallet.includes('Referral Shopping Voucher credited'),'Voucher credit label missing');
assert.ok(wallet.includes('Shopping Voucher restored after cancellation'),'Reward restore label missing');
assert.ok(wallet.includes('running_cash_balance') && wallet.includes('running_rewards_balance'),
  'Separate cash/reward statement running balances required');
assert.ok(admin.includes("rpc('admin_complete_wallet_withdrawal'"),
  'Admin must confirm actual payout through protected RPC');
assert.ok(adminHtml.includes('id="walletPayoutList"'),'Admin payout queue missing');
assert.ok(customerHtml.includes('It is marked completed only when LEOGO verifies'),
  'Customer must not be told elapsed time means transfer succeeded');

const start=wallet.indexOf('  const statementData = (statementEntries) => {');
const end=wallet.indexOf('  const saveDownload = (blob, filename) => {',start);
assert.ok(start>=0&&end>start);
const source=wallet.slice(start,end);
const flags=new Set(['shopping_reward','reward_redemption','reward_redemption_restore']);
const label=e=>e.description;
const doc={getElementById:()=>null};
const statementData=new Function('document','rewardLedgerTypes','rewardSourceLabel',
  source+'\nreturn statementData;')(doc,flags,label);
const entries=[
  {id:'1',created_at:'2026-10-01T10:00:00Z',entry_type:'normal_saving',direction:'credit',amount_kes:500,description:'Saving'},
  {id:'2',created_at:'2026-10-02T10:00:00Z',entry_type:'shopping_reward',direction:'credit',amount_kes:50,description:'Loyalty'},
  {id:'3',created_at:'2026-10-03T10:00:00Z',entry_type:'reward_redemption',direction:'debit',amount_kes:20,description:'Voucher used'},
  {id:'4',created_at:'2026-10-04T10:00:00Z',entry_type:'withdrawal',direction:'debit',amount_kes:100,description:'Withdrawal'},
  {id:'5',created_at:'2026-10-05T10:00:00Z',entry_type:'reward_redemption_restore',direction:'credit',amount_kes:20,description:'Voucher restored'},
  {id:'6',created_at:'2026-10-06T10:00:00Z',entry_type:'maintenance_fee',direction:'debit',amount_kes:10,description:'Maintenance fee'}
];
const result=statementData(entries);
assert.equal(result.closingCash,390,'Cash cannot count voucher credits');
assert.equal(result.closingRewards,50,'Rewards track loyalty, voucher use and restoration');
assert.equal(result.rows[1].cash_credit,0,'Loyalty credits never enter cash credit column');
assert.equal(result.rows[1].rewards_credit,50,'Loyalty credit is separately stated');
assert.equal(result.rows[2].running_cash_balance,500,'Voucher use never debits cash');
assert.equal(result.rows[2].running_rewards_balance,30,'Voucher redemption reduces only rewards');
assert.equal(result.rows[4].rewards_credit,20,'Cancelled voucher redemption restores only rewards');
assert.equal(result.rows[5].running_cash_balance,390,'Maintenance debits cash only');
const cashOnly=entries.reduce((sum,x)=>{
  if(flags.has(x.entry_type))return sum;
  return sum+(x.direction==='credit'?1:-1)*x.amount_kes;
},0);
assert.equal(cashOnly,result.closingCash);
console.log('Wallet cash isolation, payout proof, and combined rewards statement checks passed.');

const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/assisted-shopping.js','utf8');
const block=source.slice(source.indexOf('  const loadSettings=async()=>{'),source.indexOf('\n  };',source.indexOf('  const loadSettings=async()=>{'))+5);
function harness(user){
 const calls=[];let pointsResolve;const auth={user};
 const context={window:{leogoAuth:{getUser:()=>auth.user,isAuthenticated:()=>!!auth.user}},client:()=>({rpc:async(name)=>{calls.push(name);if(name==='get_my_reward_points_balance')return new Promise(resolve=>{pointsResolve=resolve;});return {data:{},error:null};}}),feeNote:{textContent:''},requests:[],renderRequests(){}};
 vm.createContext(context);vm.runInContext('let settings={},orderSettings={},paymentAccount=null,rewardPointsBalance=0,rewardMaxShare=.5;'+block+';this.load=loadSettings;this.balance=()=>rewardPointsBalance;',context);
 return {context,calls,auth,resolve:(value)=>pointsResolve(value)};
}
(async()=>{
 let h=harness(null);await h.context.load();assert.ok(!h.calls.includes('get_my_reward_points_balance'),'guests must not make protected voucher requests');
 h=harness({id:'customer-a'});const pending=h.context.load();h.auth.user={id:'customer-b'};h.resolve({data:{success:true,points:500}});await pending;assert.equal(h.context.balance(),0,'an old customer response must not enter the new customer session');
 h=harness({id:'customer-a'});const signed=h.context.load();h.resolve({data:{success:true,points:500}});await signed;assert.equal(h.context.balance(),500);
 console.log('Assisted Shopping guest and session response checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

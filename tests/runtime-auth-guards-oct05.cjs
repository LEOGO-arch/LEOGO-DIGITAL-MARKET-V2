const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const adminSource=fs.readFileSync(path.join(__dirname,'../admin/health-specialist.js'),'utf8');
const sellerSource=fs.readFileSync(path.join(__dirname,'../partner/shipping-moq.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(__dirname,'../admin/index.html'),'utf8');
const partnerHtml=fs.readFileSync(path.join(__dirname,'../partner/index.html'),'utf8');

new vm.Script(adminSource,{filename:'admin/health-specialist.js'});
new vm.Script(sellerSource,{filename:'partner/shipping-moq.js'});

const adminLoad=adminSource.slice(
  adminSource.indexOf('  const load=async()=>{'),
  adminSource.indexOf('  window.leogoLoadHealthSpecialistAdmin=load;')
);

async function runAdmin(session,error=null){
  let protectedCalls=0;
  const context={
    db:{auth:{getSession:async()=>({data:{session},error})}},
    loadSettings:async()=>{protectedCalls++;},
    loadOperations:async()=>{protectedCalls++;},
    console:{warn(){}},setStatus(){},$:()=>null,Promise
  };
  vm.runInNewContext(adminLoad+';this.run=load;',context);
  await context.run();
  return protectedCalls;
}

test('signed-out Admin never calls protected Health Specialist RPCs',async()=>{
  assert.equal(await runAdmin(null),0);
});
test('expired/failed Admin session never calls protected Health Specialist RPCs',async()=>{
  assert.equal(await runAdmin(null,{message:'expired'}),0);
});
test('authenticated Admin can load Health Specialist settings and operations',async()=>{
  assert.equal(await runAdmin({user:{id:'admin-test'}}),2);
});

const begin=sellerSource.indexOf('let authenticatedDataLoaded=false;');
const end=sellerSource.indexOf('const watchSellerAuth=');
const sellerBoot=sellerSource.slice(begin,end);

function sellerHarness(session,account,accountError=null){
  const calls=[];
  const context={
    client:{
      auth:{getSession:async()=>({data:{session},error:null})},
      rpc:async(name)=>{
        calls.push(name);
        if(name==='seller_get_own_account')return {data:account,error:accountError};
        return {data:null,error:null};
      }
    },
    loadProducts:async()=>calls.push('products'),
    loadCampaigns:async()=>calls.push('campaigns'),
    loadDeliveryRates:async()=>calls.push('rates'),
    $:()=>null,Promise
  };
  vm.runInNewContext(sellerBoot+';this.run=loadAuthenticatedSellerData;',context);
  return {context,calls};
}

test('signed-out Partner does not call Seller RPCs',async()=>{
  const h=sellerHarness(null,null);
  assert.equal(await h.context.run(),false);
  assert.deepEqual(h.calls,[]);
});

for(const account of [null,{application_status:'submitted'},{application_status:'changes_requested'}]){
  test('non-approved Partner does not call Seller product/campaign RPCs '+JSON.stringify(account),async()=>{
    const h=sellerHarness({user:{id:'partner-test'}},account);
    assert.equal(await h.context.run(),false);
    assert.deepEqual(h.calls,['seller_get_own_account']);
  });
}

test('approved Seller loads protected product data once',async()=>{
  const h=sellerHarness({user:{id:'seller-test'}},{application_status:'approved'});
  assert.equal(await h.context.run(),true);
  assert.equal(await h.context.run(),true);
  assert.deepEqual(h.calls,['seller_get_own_account','products','campaigns','rates']);
});

test('runtime guard assets are cache-busted',()=>{
  assert.ok(adminHtml.includes('health-specialist.js?v=runtime-auth-guard-1'));
  assert.ok(partnerHtml.includes('shipping-moq.js?v=runtime-auth-guard-1'));
});

console.log('Runtime authentication guard checks passed.');

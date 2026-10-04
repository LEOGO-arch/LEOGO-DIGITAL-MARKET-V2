const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../partner/shipping-moq.js'),'utf8');
const begin=source.indexOf('let authenticatedDataLoaded=false;');const end=source.indexOf('const watchSellerAuth=');const boot=source.slice(begin,end);
function harness(session,account){
 const calls=[];const context={client:{auth:{getSession:async()=>({data:{session},error:null})},rpc:async name=>{calls.push(name);return {data:account,error:null};}},loadProducts:async()=>calls.push('products'),loadCampaigns:async()=>calls.push('campaigns'),loadDeliveryRates:async()=>calls.push('rates'),$:()=>null,Promise};
 vm.runInNewContext(boot+';this.boot=loadAuthenticatedSellerData;',context);return {context,calls};
}
test('signed-out Partner does not call Seller RPCs',async()=>{const h=harness(null,null);assert.equal(await h.context.boot(),false);assert.deepEqual(h.calls,[]);});
for(const account of [null,{application_status:'submitted'},{application_status:'changes_requested'}])test('non-approved Partner does not load protected products/campaigns: '+JSON.stringify(account),async()=>{const h=harness({user:{id:'artificial-partner'}},account);assert.equal(await h.context.boot(),false);assert.deepEqual(h.calls,['seller_get_own_account']);});
test('approved Seller loads once during repeated dashboard calls',async()=>{const h=harness({user:{id:'artificial-seller'}},{application_status:'approved'});assert.equal(await h.context.boot(),true);assert.equal(await h.context.boot(),true);assert.deepEqual(h.calls,['seller_get_own_account','products','campaigns','rates']);});
test('expired session does not rely on the previously loaded flag',async()=>{const h=harness({user:{id:'artificial-seller'}},{application_status:'approved'});await h.context.boot();h.context.client.auth.getSession=async()=>({data:{session:null},error:null});assert.equal(await h.context.boot(),false);assert.equal(h.calls.filter(x=>x==='products').length,1);});

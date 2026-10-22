const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('admin/admin.js','utf8');
const preview={};const ctx={$:()=>preview};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('  const renderOrderSettingsPreview='),source.indexOf('  const loadOrderSettings='))+';globalThis.render=renderOrderSettingsPreview;',ctx);
ctx.render({service_fee_threshold_kes:3000,service_fee_below_percent:0,service_fee_at_or_above_percent:0,cod_limit_kes:10000});assert.match(preview.textContent,/→ 0%.*→ 0%/);
vm.runInContext(source.slice(source.indexOf('  const renderLipaPolePoleSettingsPreview='),source.indexOf('  const loadLipaPolePoleSettings='))+';globalThis.render=renderLipaPolePoleSettingsPreview;',ctx);
ctx.render({cancellation_deduction_percent:0,overdue_refund_deduction_percent:0,overdue_interest_percent:0,reminder_days_before_due:0});assert.match(preview.textContent,/deduction 0%;.*deduction 0%;.*interest 0%; reminder 0 day/);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(session,rpc){
 const field={value:''},save={disabled:false},status={textContent:''},handlers={},tab={};let authChange,calls=0;
 const form={elements:{amount:field},querySelector:()=>save,reportValidity:()=>true,addEventListener:(event,fn)=>handlers[event]=fn};
 const db={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{authChange=fn;}},rpc:async(...args)=>{calls++;return rpc(...args);}};
 const context={document:{getElementById:id=>id==='aftersalesStationCommissionSettingsForm'?form:status,querySelectorAll:()=>[{addEventListener:(event,fn)=>tab.click=fn}]},window:{leogoAdminDb:db,setTimeout:fn=>fn()}};
 vm.runInNewContext(fs.readFileSync('admin/aftersales-fee-settings.js','utf8'),context);await tick();
 return {field,save,status,handlers,tab,authChange,db,calls:()=>calls};
}
(async()=>{
 let f=await fixture(null,()=>{throw Error('Must not call anonymously');});assert.equal(f.calls(),0);assert.equal(f.save.disabled,true);
 f=await fixture({user:{id:'admin'}},async()=>({data:{amount_kes:0}}));assert.equal(f.field.value,0);assert.equal(f.save.disabled,false);
 f.authChange('SIGNED_OUT');assert.equal(f.field.value,'');assert.equal(f.save.disabled,true);await f.handlers.submit({preventDefault(){}});assert.equal(f.calls(),1);
 f=await fixture({},async()=>{throw Error('offline');});assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/offline/);
 f=await fixture({},async()=>({data:null}));assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/unavailable/);
 let release;f=await fixture({},()=>new Promise(resolve=>{release=resolve}));f.authChange('SIGNED_OUT');release({data:{amount_kes:20}});await tick();assert.equal(f.save.disabled,true);assert.equal(f.field.value,'');
 f=await fixture({},async()=>({data:{amount_kes:20}}));f.db.rpc=async()=>{throw Error('save offline')};await f.handlers.submit({preventDefault(){}});assert.match(f.status.textContent,/save offline/);assert.equal(f.save.disabled,false);
 console.log('PASS: zero-rate previews; no anonymous commission requests; zero commission; denied/malformed/network loads; sign-out race; save failure recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});

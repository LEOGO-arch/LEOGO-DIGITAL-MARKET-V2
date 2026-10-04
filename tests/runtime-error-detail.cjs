const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/runtime-monitor.js'),'utf8');
const projectUrl=source.match(/const PROJECT_URL='([^']+)'/)[1];
function harness(response,authenticated=false){
 const sent=[];const window={location:{origin:'https://example.invalid',hostname:'example.invalid',pathname:'/partner/',href:'https://example.invalid/partner/'},addEventListener(){},fetch:async(url,init)=>{if(String(url).includes('record_system_runtime_error')){sent.push(JSON.parse(init.body));return new Response('{}');}return response;}};
 if(authenticated)window.leogoPartnerClient={auth:{getSession:async()=>({data:{session:{access_token:'artificial-secret-test-token'}}})}};
 vm.runInNewContext(source,{window,URL,Date,Number,String,Map,Set,crypto:{randomUUID:()=> 'artificial-client'},localStorage:{getItem:()=>null,setItem(){}},setTimeout(){},console});
 return {window,sent,flush:async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('PostgREST code and sanitized message survive without consuming response',async()=>{
 const detail={code:'P0001',message:'Approved Seller account required for "private name"; email=test@example.invalid phone=+254700000000 access_token=SECRET_VALUE https://example.invalid/private/document.pdf'};
 const response=new Response(JSON.stringify(detail),{status:400});const h=harness(response,true);
 const result=await h.window.fetch(projectUrl+'/rest/v1/rpc/seller_list_own_products',{method:'POST'});
 assert.deepEqual(await result.json(),detail);await h.flush();assert.equal(h.sent.length,1);
 const p=h.sent[0];assert.equal(p.p_error_code,'P0001');assert.equal(p.p_metadata.status,400);assert.equal(p.p_metadata.method,'POST');assert.equal(p.p_operation,'rpc:seller_list_own_products');assert.match(p.p_message,/Approved Seller account required/);
 assert.doesNotMatch(JSON.stringify(p),/SECRET_VALUE|private name|test@example|254700000000|private\/document|artificial-secret-test-token/);
});
test('expected session 401 keeps its code and is still reported',async()=>{const h=harness(new Response(JSON.stringify({code:'PGRST301',message:'JWT expired'}),{status:401}));await h.window.fetch(projectUrl+'/rest/v1/rpc/seller_list_own_products');await h.flush();assert.equal(h.sent[0].p_error_code,'PGRST301');assert.match(h.sent[0].p_message,/JWT expired/);assert.equal(h.sent[0].p_severity,'warning');});
test('non-JSON 500 retains status and guest telemetry',async()=>{const h=harness(new Response('<html>internal</html>',{status:500}));await h.window.fetch(projectUrl+'/functions/v1/test-operation');await h.flush();assert.equal(h.sent[0].p_metadata.status,500);assert.equal(h.sent[0].p_operation,'edge:test-operation');assert.doesNotMatch(h.sent[0].p_message,/internal/);});
test('private Storage object paths never enter source or operation',async()=>{const h=harness(new Response('{}',{status:400}));await h.window.fetch(projectUrl+'/storage/v1/object/sign/accommodation-verification/private-user/passport.pdf?token=secret');await h.flush();assert.equal(h.sent[0].p_operation,'storage:object/accommodation-verification');assert.doesNotMatch(JSON.stringify(h.sent[0]),/private-user|passport.pdf|token=secret/);});
test('monitoring failures never recursively report themselves',async()=>{const h=harness(new Response('{}',{status:400}));await h.window.fetch(projectUrl+'/rest/v1/rpc/record_system_runtime_error',{body:'{}'});await h.flush();assert.equal(h.sent.length,1);});

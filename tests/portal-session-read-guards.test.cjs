const fs=require('node:fs'),assert=require('node:assert/strict');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const cases=[['partner/aftersales-negotiation.js','async function load(){','db'],['partner/health.js','const loadAccount=async()=>{','client'],['partner/health-specialist.js','const refreshAccount=async()=>{','client'],['pickup/aftersales-liabilities.js','async function refresh(){','client'],['partner/aftersales-liability-statement.js','async function update(){','db']];
(async()=>{
 for(const [file,start,clientName] of cases){
  const source=fs.readFileSync(file,'utf8');const begin=source.indexOf(start)+start.length;const end=source.indexOf('const {data,error}=await '+clientName+'.rpc(',begin);
  assert.ok(begin>=start.length&&end>begin,file+' loader must exist');
  let prefix=source.slice(begin,end);if(prefix.includes('try{'))prefix=prefix.replace('try{','');
  const run=new AsyncFunction(clientName,'root',prefix+'return '+clientName+'.rpc("protected-read");');
  for(const result of [{data:{session:null}},{data:{session:{user:{id:'user-a'}}}},{error:Error('session unavailable')}]){
   let calls=0;await run({auth:{getSession:async()=>result},rpc:async()=>{calls++;}},{hidden:false});
   assert.equal(calls,result.data?.session?1:0,file+' should make protected reads only for a signed-in session');
  }
 }
 console.log('Partner/Pickup protected startup read guards passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

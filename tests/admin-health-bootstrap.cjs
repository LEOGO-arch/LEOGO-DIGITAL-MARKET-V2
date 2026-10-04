const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../admin/health-specialist.js'),'utf8');
const load=source.slice(source.indexOf('  const load=async()=>{'),source.indexOf('  window.leogoLoadHealthSpecialistAdmin=load;'));
async function run(session,error=null){
 let calls=0;const context={db:{auth:{getSession:async()=>({data:{session},error})}},loadSettings:async()=>{calls++;},loadOperations:async()=>{calls++;},console:{warn(){}},setStatus(){},$:()=>null,Promise};
 vm.runInNewContext(load+';this.testLoad=load;',context);await context.testLoad();return calls;
}
test('signed-out Admin initialization never calls protected Health RPCs',async()=>assert.equal(await run(null),0));
test('failed/expired session lookup never calls protected Health RPCs',async()=>assert.equal(await run(null,{message:'Artificial expired session'}),0));
test('signed-in Admin Health loads both settings and operations',async()=>assert.equal(await run({user:{id:'artificial-admin'}}),2));
test('login after signed-out initialization can load normally',async()=>{assert.equal(await run(null),0);assert.equal(await run({user:{id:'artificial-admin'}}),2);});

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/runtime-monitor.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(status=204){
 const requests=[],timers=[],events={};
 const window={location:{pathname:'/staff/',origin:'https://example.test',hostname:'example.test',href:'https://example.test/staff/'},fetch:async(url,init)=>{requests.push({url,body:init?.body&&JSON.parse(init.body)});if(status==='reject')throw Error('Failed to fetch');return {status,ok:status<400};},addEventListener:(name,fn)=>{events[name]=fn;}};
 const context={window,document:{visibilityState:'visible',addEventListener(){}},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=> 'anonymous-test-id'},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},setInterval(){},Date,Math,JSON,Map,Set,URL,Number,String,Promise};
 vm.runInNewContext(source,context);return {window,requests,timers,events,context};
}
(async()=>{
 let h=harness();await tick();
 assert.equal(h.requests.length,1);assert.ok(h.requests[0].url.endsWith('/record_system_portal_heartbeat'));
 assert.deepEqual(Object.keys(h.requests[0].body).sort(),['p_portal','p_version']);
 h.window.leogoRuntimeMonitor.report({message:'Failed for person@example.com +254700192545',source:'https://example.test/file?token=secret'});await tick();
 assert.ok(!JSON.stringify(h.requests).includes('person@example.com'));assert.ok(!JSON.stringify(h.requests).includes('token=secret'));
 h=harness(503);await tick();for(let i=0;i<4;i++){const t=h.timers.shift();if(t)t.fn();await tick();}
 assert.equal(h.requests.length,3,'delivery must stop after three attempts');
 h=harness(403);await tick();assert.equal(h.timers.length,0,'permanent authorization failures must not be retried');
 h=harness('reject');await tick();for(let i=0;i<50;i++)h.window.leogoRuntimeMonitor.report({message:'distinct '+i});
 let count=0;while(h.timers.length&&count++<100){h.timers.shift().fn();await tick();}
 assert.ok(h.requests.length<=63,'memory queue must remain bounded');
 console.log('Runtime reporting retry, privacy, heartbeat and queue checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

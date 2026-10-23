const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('js/vacant-houses.js','utf8'),start=s.indexOf('  const loadMine=async()=>{'),code=s.slice(start,s.indexOf('\n  };',start)+5);
function setup(session){const calls=[],node={hidden:false},state={user:{id:'old'},mySubmissions:[1],myRequests:[1]};const client={auth:{getSession:async()=>session,getUser:async()=>{calls.push('user');return {data:{user:{id:'qa'}}};}},rpc:async(name)=>{calls.push(name);return {data:[]};}};const c={client,state,$:()=>node,renderMine(){},console:{warn(){}}};vm.createContext(c);vm.runInContext('let mineLoadVersion=0;'+code+';this.load=loadMine;',c);return {c,client,calls,node,state};}
(async()=>{
 let h=setup({data:{session:null}});await h.c.load();assert.deepEqual(h.calls,[]);assert.equal(h.state.user,null);assert.equal(h.node.hidden,true);assert.equal(h.state.mySubmissions.length,0);
 h=setup({data:{session:{user:{id:'qa'}}}});await h.c.load();assert.equal(h.calls.length,3);assert.equal(h.node.hidden,false);
 h=setup({error:Error('offline')});await h.c.load();assert.deepEqual(h.calls,[]);assert.equal(h.state.myRequests.length,0);
 h=setup({data:{session:{user:{id:'qa'}}}});let release;h.client.auth.getSession=()=>new Promise(r=>{release=r;});const old=h.c.load();h.client.auth.getSession=async()=>({data:{session:null}});await h.c.load();release({data:{session:{user:{id:'qa'}}}});await old;assert.deepEqual(h.calls,[]);assert.equal(h.state.user,null);
 console.log('Property guest, signed-in, failure and overlapping refresh checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

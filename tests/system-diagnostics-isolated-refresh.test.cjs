const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('admin/system-diagnostics.js','utf8');

const makeNode=()=>({
  hidden:false,
  textContent:'',
  innerHTML:'',
  className:'',
  value:'',
  checked:false,
  disabled:false,
  dataset:{},
  listeners:{},
  addEventListener(type,listener){this.listeners[type]=listener;},
  querySelector(){return makeNode();},
  querySelectorAll(){return [];},
  reset(){},
  focus(){},
  closest(){return null;}
});

const makeHarness=()=>{
  const nodes=new Map();
  const getNode=(selector)=>{
    if(!nodes.has(selector))nodes.set(selector,makeNode());
    return nodes.get(selector);
  };
  const calls=[];
  const db={rpc:async(name)=>{
    calls.push(name);
    if(name==='admin_get_diagnostic_coverage')return {data:{portals:[],checks:[]}};
    if(name==='admin_system_diagnostics_status')return {data:{configured:true}};
    if(name==='admin_list_system_diagnostic_runs')return {data:[]};
    if(name==='admin_list_system_runtime_issues')throw new Error('runtime monitor temporarily unavailable');
    if(name==='admin_get_latest_system_diagnostic_run')return {data:{checks:[]}};
    if(name==='admin_list_system_diagnostic_repairs')return {data:[]};
    if(name==='admin_get_system_monitoring_snapshot')return {data:{
      settings:{enabled:true},
      summary:{health_score:92,status:'healthy'},
      incidents:[],
      recent_runs:[]
    }};
    if(name==='admin_run_system_diagnosis')return {data:{
      ok:true,mode:'full',score:100,health:'healthy',critical_count:0,warning_count:0,checks:[]
    }};
    throw new Error('Unexpected RPC: '+name);
  }};
  const document={
    querySelector:getNode,
    querySelectorAll:()=>[],
    addEventListener(){},
    dispatchEvent(){}
  };
  const owner={userId:"test-admin",epoch:1,superAdmin:true};
  const window={leogoAdminAccess:()=>({...owner}),leogoAdminDb:db,setTimeout,confirm:()=>true};
  vm.runInNewContext(source,{window,document,CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},console,Promise,Date,Number,String,Array,Object,Math,JSON,Error,RegExp});
  return {window,nodes,getNode,calls,owner,db};
};

(async()=>{
  const {window,nodes,getNode,calls,owner}=makeHarness();
  await Promise.all([window.leogoDiagnostics.activate(),window.leogoDiagnostics.activate()]);
  assert.equal(calls.filter(name=>name==='admin_system_diagnostics_status').length,1);
  assert.ok(calls.includes('admin_list_system_diagnostic_repairs'),'repair history must load on first activation');

  assert.equal(getNode('#diagnosticsRuntimeStatus').textContent,'runtime monitor temporarily unavailable');
  assert.equal(getNode('#monitoringHealthScore').textContent,'92%');
  assert.ok(calls.includes('admin_get_system_monitoring_snapshot'),'monitoring should load despite a runtime issue request failure');

  const form=getNode('#diagnosticsRunForm');
  const submit=form.listeners.submit;
  getNode('#diagnosticsRunPin').value='123456';
  await submit({preventDefault(){},currentTarget:form});

  assert.equal(getNode('#diagnosticsScore').textContent,'100%','successful scan results should remain visible');
  assert.equal(getNode('#diagnosticsRunStatus').textContent,'Diagnosis complete. No repair was applied automatically.','a secondary refresh failure must not make the scan look failed');
  assert.equal(getNode('#diagnosticsRuntimeStatus').textContent,'runtime monitor temporarily unavailable');
  owner.superAdmin=false;
  const before=calls.length;await window.leogoDiagnostics.activate();
  assert.equal(calls.length,before,'signed-out activation must not call protected RPCs');
  const stale=makeHarness();let release;
  stale.db.rpc=()=>new Promise(resolve=>{release=resolve;});
  const pending=stale.window.leogoDiagnostics.activate();
  stale.owner.epoch++;stale.owner.superAdmin=false;
  release({data:{configured:true}});await pending;
  assert.equal(stale.getNode('#diagnosticsRepairHistory').innerHTML,'','stale response must not render old repairs');
  console.log('System Diagnosis independent-panel refresh checks passed');
})().catch((error)=>{
  console.error(error);
  process.exitCode=1;
});

const fs=require('node:fs');
const vm=require('node:vm');

const diagnostics=fs.readFileSync('admin/system-diagnostics.js','utf8');
const css=fs.readFileSync('admin/system-diagnostics.css','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

new vm.Script(diagnostics,{filename:'admin/system-diagnostics.js'});

for(const required of [
  'monitoringTrendVisible:4',
  'const initialVisible=4',
  'runs.slice(0,state.monitoringTrendVisible)',
  'data-monitoring-trend-more',
  'data-monitoring-trend-less',
  'Showing ${visibleRuns.length} of ${runs.length} checks'
]){
  if(!diagnostics.includes(required))throw new Error('Collapsed monitoring trend behavior missing: '+required);
}

if(!css.includes('.diagnostics-monitoring-trend-actions')){
  throw new Error('Collapsed monitoring trend controls are not styled');
}

if(!html.includes('system-diagnostics.js?v=diagnostics-trend-collapse-1')||
   !html.includes('system-diagnostics.css?v=diagnostics-trend-collapse-1')){
  throw new Error('Collapsed monitoring trend cache versions missing');
}

console.log('System Diagnosis 7-day trend collapse checks passed');

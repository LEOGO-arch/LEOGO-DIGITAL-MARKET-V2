const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('admin/admin.js','utf8');
new vm.Script(js,{filename:'admin/admin.js'});

if(js.includes("$('[data-open-view]', $('#networkOverview')).forEach(")){
  throw new Error('Admin dashboard still calls forEach on the single-element $ helper');
}
if(!js.includes("$$('[data-open-view]', $('#networkOverview')).forEach(")){
  throw new Error('Admin dashboard network buttons are not iterated through the multi-element $$ helper');
}

console.log('admin selector forEach regression check passed');

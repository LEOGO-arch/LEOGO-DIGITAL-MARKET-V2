const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('admin/admin.js','utf8');
const c={state:{staffRolePresets:[]},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('  const STAFF_PERMISSION_DEFS'),source.indexOf('  const renderStaffRoleOptions'))+'\nglobalThis.api={defs:STAFF_PERMISSION_DEFS,functions:STAFF_FUNCTION_DEFS,render:renderPermissionGrid,normalize:normalizeStaffPermissionValues};',c);
const api=c.api,codes=new Set(api.defs.map(x=>x[0]));
assert.equal(api.functions.length,36);for(const [name,permissions] of api.functions){assert.ok(permissions.length,name);for(const code of permissions)assert.ok(codes.has(code),name+': '+code);assert.doesNotMatch(name,/Staff Management|Admin Security|Data Cleanup|System Diagnosis|Audit Log/);}
function control(){return {value:'',disabled:false,textContent:'',listeners:{},addEventListener(e,f){this.listeners[e]=f;}};}
const picker=control(),add=control(),scope=control();let inputs=[];
const container={set innerHTML(html){inputs=[...html.matchAll(/<input type="checkbox" data-staff-permission value="([^"]+)" ([^>]*)>/g)].map(m=>({value:m[1],checked:m[2].includes('checked'),addEventListener(){}}));assert.match(html,/Shared permissions/);},querySelector(s){return s==='[data-staff-function]'?picker:s==='[data-add-staff-function]'?add:scope;},querySelectorAll(s){return s.includes(':checked')?inputs.filter(x=>x.checked):inputs;}};
api.render(container,['support.chat']);
assert.equal(inputs.filter(x=>x.checked).length,1);
const index=api.functions.findIndex(([name])=>name==='Customer SMS & Email campaigns');picker.value=String(index);picker.listeners.change();assert.equal(inputs.filter(x=>x.checked).length,1,'Choosing a function must not grant access');assert.match(scope.textContent,/settings.manage/);
add.listeners.click();assert.deepEqual(inputs.filter(x=>x.checked).map(x=>x.value).sort(),['customers.read','settings.manage','settings.read','support.chat']);assert.match(scope.textContent,/Access already included/);
add.listeners.click();assert.equal(inputs.filter(x=>x.checked).length,4,'Adding twice must not duplicate or replace access');
assert.deepEqual(Array.from(api.normalize(['orders.manage','orders.manage'])).sort(),['orders.manage','orders.read']);
const html=fs.readFileSync('admin/index.html','utf8');assert.match(html,/id="staffPermissionGrid"/);assert.match(html,/id="staffEditorPermissionGrid"/);
console.log('PASS: 36 named functions, existing permission codes only, additive assignment, explicit shared access, dependency normalization, no owner-only functions or automatic grants.');

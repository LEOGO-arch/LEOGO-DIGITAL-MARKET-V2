const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
class Element {
  constructor(){this.textContent='';this.value='';this.listeners={};this.dataset={};this.children=[];}
  addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
  async emit(type){for(const callback of this.listeners[type]||[])await callback({currentTarget:this,target:this,preventDefault(){}});}
  set innerHTML(html){this.html=html;this.children=[...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(m=>{const e=new Element();e.textContent=m[2];for(const a of m[1].matchAll(/data-([\w-]+)="([^"]*)"/g))e.dataset[a[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];return e;});}
  get innerHTML(){return this.html||'';}
  querySelectorAll(selector){const key=selector.match(/^\[data-([\w-]+)\]/)?.[1]?.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.filter(e=>key in e.dataset);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function harness(file,responder){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const navigation=[new Element(),new Element()];const timers=[];const calls=[];
  const document={querySelector:s=>s.startsWith('#')?get(s.slice(1)):navigation[0],querySelectorAll:s=>s.includes('data-admin-view')?navigation:[],getElementById:get,dispatchEvent(){},addEventListener(){}};
  const client={rpc:async(name,args)=>{calls.push({name,args});return responder(name,args);},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://example.invalid/image.jpg'}})})},auth:{getSession:async()=>({data:{session:null},error:null})}};
  const window={leogoAuth:{client,getUser:()=>null},leogoAdminDb:client,setTimeout:fn=>timers.push(fn),prompt:()=> 'Artificial test rejection'};
  vm.runInNewContext(read(file),{window,document,console:{warn(){}},CustomEvent:class{},setTimeout:window.setTimeout,Date,Number,String,Boolean,Set,Array,Promise});
  return {get,navigation,timers,calls,window,flush:async()=>{for(const f of timers.splice(0))await f();await new Promise(resolve=>setImmediate(resolve));}};
}
test('successful empty Health RPC renders an empty state instead of an outage',async()=>{
 const h=harness('js/health.js',()=>({data:{providers:[],products:[]},error:null}));await h.flush();
 assert.match(h.get('healthMarketStatus').textContent,/No approved Health & Medicine listings/);
 assert.doesNotMatch(h.get('healthProductGrid').innerHTML,/could not be loaded/);
});
test('Health request failures retain the genuine unavailable state',async()=>{
 const h=harness('js/health.js',()=>({data:null,error:{code:'PGRST_TEST',message:'Artificial failure'}}));await h.flush();
 assert.match(h.get('healthMarketStatus').textContent,/temporarily unavailable/);
});
test('OTC cart and prescription enquiry remain separate and bind once after filtering',async()=>{
 const base={provider_id:'test-provider',provider_name:'Artificial Health Provider',availability_status:'available',quantity_available:3,product_kind:'pharmaceutical',price_kes:50};
 const h=harness('js/health.js',()=>({data:{providers:[],products:[{...base,id:'otc',product_name:'Artificial OTC',cart_eligible:true,medicine_classification:'otc',requires_prescription:false},{...base,id:'rx',product_name:'Artificial Rx',cart_eligible:false,medicine_classification:'prescription_required',requires_prescription:true}]},error:null}));await h.flush();
 const buttons=h.get('healthProductGrid');assert.equal(buttons.querySelectorAll('[data-health-add-cart]').length,1);assert.equal(buttons.querySelectorAll('[data-health-enquiry]').length,1);
 assert.equal(buttons.children.every(x=>x.listeners.click.length===1),true);
 for(let i=0;i<5;i++)await h.get('healthMarketSearch').emit('input');
 assert.equal(buttons.children.every(x=>x.listeners.click.length===1),true);
});
test('PR57 Admin payment controls render and dispatch exactly once across reloads',async()=>{
 const actions=[];const row={id:'artificial-health-order',payment_status:'submitted',order_status:'awaiting_payment',created_at:'2026-10-04',items:[]};
 const h=harness('admin/health.js',(name,args)=>{if(name==='admin_review_health_medicine_order_payment')actions.push(args);return {data:name==='admin_list_health_medicine_orders'?[row]:{partners:[],products:[]},error:null};});
 for(let i=0;i<8;i++)await h.window.leogoLoadHealthMedicineAdmin();
 assert.equal(h.navigation.every(n=>n.listeners.click.length===1),true);
 const controls=h.get('adminHealthOrderList');assert.equal(controls.children.length,2);assert.equal(controls.children.every(n=>n.listeners.click.length===1),true);
 await controls.children[0].emit('click');await controls.children[1].emit('click');
 assert.deepEqual(actions.map(x=>x.p_decision),['verify','reject']);
 assert.equal(actions[1].p_notes,'Artificial test rejection');
});
test('PR57 specialist initializes navigation and renders settings/services/bookings',async()=>{
 const h=harness('admin/health-specialist.js',name=>({data:name==='admin_health_specialist_get_settings'?{specialist_booking_fee_kes:300}:{services:[],bookings:[]},error:null}));
 await h.window.leogoLoadHealthSpecialistAdmin();
 assert.equal(h.get('adminHealthSpecialistBookingFeeInput').value,300);
 assert.match(h.get('adminHealthSpecialistServiceTable').innerHTML,/No Health Specialist services/);
 assert.match(h.get('adminHealthSpecialistBookingList').innerHTML,/No Health Specialist bookings/);
 assert.equal(h.navigation.every(n=>n.listeners.click.length===1),true);
});

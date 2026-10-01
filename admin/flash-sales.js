(() => {
'use strict';
const client=window.leogoAdminDb;
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmt=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(v)):'—';
const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
let rows=[],loading=false;

function isActive(item){
 const now=Date.now(),start=new Date(item.starts_at||0).getTime(),end=new Date(item.ends_at||0).getTime();
 return item.flash_status==='approved'&&Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&end>now&&(item.partner_type!=='seller'||Number(item.flash_quantity||0)>0);
}
function publishCounts(){
 const pending=rows.filter(r=>r.flash_status==='requested');
 const counts={
  total:pending.length,
  seller:pending.filter(r=>r.partner_type==='seller').length,
  service_provider:pending.filter(r=>r.partner_type==='service_provider').length,
  cyber:pending.filter(r=>r.partner_type==='cyber').length
 };
 window.leogoFlashSaleActionCounts=counts;
 const badge=$('#sidebarFlashSaleCount');
 if(badge){badge.textContent=counts.total;badge.hidden=false;badge.setAttribute('aria-label',counts.total+' Flash Sale request'+(counts.total===1?'':'s')+' awaiting Admin review');}
 document.dispatchEvent(new CustomEvent('leogo:flash-sale-action-counts',{detail:counts}));
}
function filtered(){
 const partner=$('#flashAdminPartnerFilter')?.value||'all';
 const status=$('#flashAdminStatusFilter')?.value||'all';
 return rows.filter(r=>(partner==='all'||r.partner_type===partner)&&(status==='all'||r.flash_status===status));
}
function render(){
 const pending=rows.filter(r=>r.flash_status==='requested').length;
 const active=rows.filter(isActive).length;
 if($('#flashAdminPending'))$('#flashAdminPending').textContent=pending;
 if($('#flashAdminActive'))$('#flashAdminActive').textContent=active;
 if($('#flashAdminSeller'))$('#flashAdminSeller').textContent=rows.filter(r=>r.partner_type==='seller').length;
 if($('#flashAdminProvider'))$('#flashAdminProvider').textContent=rows.filter(r=>r.partner_type==='service_provider').length;
 if($('#flashAdminCyber'))$('#flashAdminCyber').textContent=rows.filter(r=>r.partner_type==='cyber').length;
 publishCounts();

 const host=$('#adminFlashSaleList');if(!host)return;
 const list=filtered();
 host.innerHTML=list.length?list.map(item=>{
  const save=Math.max(0,Number(item.normal_price_kes||0)-Number(item.flash_price_kes||0));
  const percent=Number(item.normal_price_kes||0)>0?Math.round((save/Number(item.normal_price_kes))*100):0;
  const pending=item.flash_status==='requested';
  return '<article class="flash-admin-card '+(isActive(item)?'is-active':'')+'">'+
    '<header><div><span>'+esc(label(item.partner_type))+' · '+esc(label(item.item_type))+'</span><h3>'+esc(item.item_name)+'</h3><p>'+esc(item.partner_name||'LEOGO Partner')+'</p></div><b class="flash-admin-status '+esc(item.flash_status)+'">'+esc(label(item.flash_status))+'</b></header>'+
    '<div class="flash-admin-prices"><div><small>Normal</small><strong>'+money(item.normal_price_kes)+'</strong></div><div><small>Flash Sale</small><strong>'+money(item.flash_price_kes)+'</strong></div><div><small>Customer saves</small><strong>'+money(save)+(percent?' · '+percent+'%':'')+'</strong></div>'+(item.partner_type==='seller'?'<div><small>Sale quantity</small><strong>'+Number(item.flash_quantity||0).toLocaleString('en-KE')+'</strong></div>':'')+'</div>'+
    '<div class="flash-admin-window"><span>Starts <b>'+esc(fmt(item.starts_at))+'</b></span><span>Ends <b>'+esc(fmt(item.ends_at))+'</b></span></div>'+
    (item.admin_notes?'<p class="flash-admin-note"><b>Admin note:</b> '+esc(item.admin_notes)+'</p>':'')+
    (pending?'<div class="flash-admin-actions"><button type="button" data-flash-review="approve" data-partner-type="'+esc(item.partner_type)+'" data-item-id="'+esc(item.item_id)+'">Approve Flash Sale</button><button type="button" class="danger" data-flash-review="reject" data-partner-type="'+esc(item.partner_type)+'" data-item-id="'+esc(item.item_id)+'">Reject</button></div>':'')+
  '</article>';
 }).join(''):'<div class="loading-card">No Flash Sale requests match this filter.</div>';
}
async function load(){
 if(loading)return;loading=true;
 const host=$('#adminFlashSaleList');if(host)host.innerHTML='<div class="loading-card">Loading partner Flash Sale requests…</div>';
 try{
  const {data,error}=await client.rpc('admin_list_partner_flash_sales');
  if(error)throw error;
  rows=Array.isArray(data)?data:[];
  render();
 }catch(error){
  if(host)host.innerHTML='<div class="loading-card admin-load-error">'+esc(error?.message||'Flash Sale requests could not load.')+'</div>';
 }finally{loading=false;}
}
async function review(button){
 const decision=button.dataset.flashReview;
 const partnerType=button.dataset.partnerType;
 const itemId=button.dataset.itemId;
 let notes='';
 if(decision==='reject'){
   notes=(window.prompt('Reason for rejecting this Flash Sale request:','')||'').trim();
   if(notes.length<3)return;
 }else{
   notes=(window.prompt('Optional Admin approval note:','')||'').trim();
   if(!window.confirm('Approve this Flash Sale? It will become customer-facing only during its submitted time window.'))return;
 }
 const old=button.textContent;button.disabled=true;button.textContent=decision==='approve'?'Approving…':'Rejecting…';
 try{
  const {error}=await client.rpc('admin_review_partner_flash_sale',{
    p_partner_type:partnerType,p_item_id:itemId,p_decision:decision,p_notes:notes||null
  });
  if(error)throw error;
  await load();
  const global=$('#adminGlobalStatus');
  if(global){global.textContent=decision==='approve'?'Flash Sale approved.':'Flash Sale rejected and partner notified.';global.className='global-status show success';window.setTimeout(()=>{global.className='global-status';global.textContent='';},4000);}
 }catch(error){
  window.alert(error?.message||'Flash Sale decision could not be saved.');
  button.disabled=false;button.textContent=old;
 }
}
function init(){
 $('#refreshAdminFlashSales')?.addEventListener('click',load);
 $('#flashAdminPartnerFilter')?.addEventListener('change',render);
 $('#flashAdminStatusFilter')?.addEventListener('change',render);
 $('#adminFlashSaleList')?.addEventListener('click',e=>{const b=e.target.closest('[data-flash-review]');if(b)review(b);});
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-view="flashsales"]'))setTimeout(load,40);});
 client.auth.getSession().then(({data})=>{if(data?.session?.user)load();});
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user)setTimeout(load,80);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
// Isolated media housekeeping UI; never alters the existing database-cleanup controls.
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const db = () => window.leogoAdminDb;
 const msg = (s, error=false) => { const el=$('mediaHousekeepingStatus'); if(el) {el.textContent=s;el.style.color=error?'#a42832':'#147c45';} };
 let jobs=[];
 const bytes = n => (Number(n||0)/1048576).toFixed(2)+' MB';
 const safe = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function rpc(name,args={}) {
  if(!db()) throw new Error('Admin database connection unavailable');
  const {data,error}=await db().rpc(name,args);
  if(error) throw error;
  return data;
 }
 async function load(){
  try {
   const x=await rpc('admin_media_housekeeping_summary');
   if(!x) throw new Error('Super Admin access required');
   jobs=Array.isArray(x.candidates)?x.candidates:[];
   $('mediaRetentionDays').value=x.retention_days||180;
   $('mediaAutoScan').checked=!!x.automatic_scan;
   $('mediaHousekeepingSummary').textContent=
    'Pending '+(x.pending||0)+' · Approved '+(x.approved||0)+
    ' · Deleted '+(x.deleted||0)+' · Failed '+(x.failed||0);
   const list=$('mediaHousekeepingCandidates');
   list.replaceChildren();
   if(!jobs.length){list.textContent='No eligible pickup proof images. Protected and active media are excluded.';return;}
   for(const item of jobs){
    const row=document.createElement('label');
    row.style.cssText='display:flex;gap:10px;align-items:start;border-bottom:1px solid #e5eaf0;padding:10px 0;overflow-wrap:anywhere';
    const check=document.createElement('input');check.type='checkbox';check.value=item.id;check.className='media-candidate';
    const desc=document.createElement('span');
    desc.textContent=item.bucket+' / '+item.path+' · '+bytes(item.bytes)+' · completed '+new Date(item.completed_at).toLocaleDateString();
    row.append(check,desc);list.append(row);
   }
  } catch(e){msg(e.message||'Unable to load media housekeeping',true);}
 }
 async function task(fn,button) {button.disabled=true;try{await fn();}catch(e){msg(e.message||'Request failed',true);}finally{button.disabled=false;}}
 function csv(){const rows=[['Bucket','Object path','Size bytes','Completion date'],...jobs.map(x=>[x.bucket,x.path,x.bytes,x.completed_at])];const text=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const blob=new Blob([text],{type:'text/csv'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='leogo-media-housekeeping-candidates.csv';a.click();URL.revokeObjectURL(url);}
 document.addEventListener('DOMContentLoaded',()=>{
  const area=$('mediaHousekeepingPanel');if(!area)return;
  $('mediaScan').addEventListener('click',e=>task(async()=>{const x=await rpc('admin_media_housekeeping_scan');msg('Scan complete: '+(x.new_candidates||0)+' newly eligible objects. Nothing deleted.');await load();},e.currentTarget));
  $('mediaRefresh').addEventListener('click',e=>task(load,e.currentTarget));
  $('mediaSave').addEventListener('click',e=>task(async()=>{await rpc('admin_media_housekeeping_save',{p_retention_days:Number($('mediaRetentionDays').value),p_automatic_scan:$('mediaAutoScan').checked});msg('Media retention settings saved. This does not enable unattended deletion.');await load();},e.currentTarget));
  $('mediaApprove').addEventListener('click',e=>task(async()=>{
   const ids=[...document.querySelectorAll('.media-candidate:checked')].map(x=>x.value);
   if(!ids.length)throw new Error('Select candidate files first');
   if(!window.confirm('Approve '+ids.length+' checked pickup proof file(s) for a future controlled purge? This does not delete them immediately.'))return;
   const n=await rpc('admin_media_housekeeping_approve',{p_job_ids:ids});
   msg(n+' files approved; none deleted.');await load();
  },e.currentTarget));
  $('mediaExport').addEventListener('click',csv);
  // Load only when the System Settings view is opened; auth may not yet be initialized.
  let previous=0; const observer=new MutationObserver(()=>{
   if(area.offsetParent!==null && Date.now()-previous>10000){previous=Date.now();load();}
  }); observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class','style']});
 });
})();
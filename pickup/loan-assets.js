(() => {
'use strict';
const PROJECT_URL='https://uxikemfrzqatsbqutida.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_4eMZCkb3NOGEtR664VOpXQ_IkWgDRM1';
const client=window.leogoPickupDb||window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const BUCKET='loan-asset-media';
const MAX_BYTES=8*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
let assets=[],currentUser=null,loading=false;

function style(){
 if($('#loanAssetStationCss'))return;
 const l=document.createElement('link');l.id='loanAssetStationCss';l.rel='stylesheet';l.href='loan-assets.css?v=loan-assets-1';document.head.appendChild(l);
}
function ensureUI(){
 const nav=$('#pickupNav'),portal=$('#portal');if(!nav||!portal||$('#loanAssetNav'))return;
 const b=document.createElement('button');b.id='loanAssetNav';b.type='button';b.textContent='Asset Collateral';nav.appendChild(b);
 const panel=document.createElement('section');panel.id='loanAssetPanel';panel.className='portal-view';panel.innerHTML='<article class="card"><div class="card-head"><div><span>ASSET LOAN CUSTODY</span><h2>Inspection & Secure Storage Register</h2><p>Receive, inspect, store and release Asset Loan collateral assigned to this Pickup Station. Loan approval is blocked until inspection and storage are recorded.</p></div><button id="refreshLoanAssets" type="button">↻ Refresh</button></div><div id="loanAssetList" class="loan-asset-list"><div class="loan-asset-empty">Loading assigned assets…</div></div></article>';
 portal.appendChild(panel);
 b.addEventListener('click',()=>{
   $$('#pickupNav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
   $$('[data-panel]').forEach(x=>x.classList.remove('active'));panel.classList.add('active');
   load();
   window.scrollTo({top:0,behavior:'smooth'});
 });
 $('#refreshLoanAssets')?.addEventListener('click',load);
 $('#loanAssetList')?.addEventListener('submit',handleSubmit);
 $('#loanAssetList')?.addEventListener('click',handleMediaClick);
}
function ext(f){if(f.type==='image/png')return'png';if(f.type==='image/webp')return'webp';return'jpg';}
function validate(f,label){
 if(!f)throw new Error(label+' is required.');
 if(f.size>MAX_BYTES)throw new Error(label+' must be 8 MB or smaller.');
 if(!TYPES.has(f.type))throw new Error(label+' must be JPG, PNG or WEBP.');
}
async function upload(f,prefix){
 validate(f,prefix);
 const path=currentUser.id+'/'+prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.'+ext(f);
 const {error}=await client.storage.from(BUCKET).upload(path,f,{upsert:false,contentType:f.type});
 if(error)throw error;
 return path;
}
async function remove(paths){const clean=(paths||[]).filter(Boolean);if(clean.length)try{await client.storage.from(BUCKET).remove(clean);}catch{}}
function note(a){
 const map={
  awaiting_dropoff:'Customer is expected to bring this item to this station for physical receiving.',
  received:'Asset received. Complete inspection and store it before Admin can approve the loan.',
  stored:'Asset is under secure station custody. Do not release unless status changes to Release Ready or Return Required.',
  return_required:'Loan was not approved. Return the asset to the customer and record release evidence.',
  release_ready:'Loan has been fully settled. Return the asset to the customer and record release evidence.',
  released:'Asset release has been completed.',
  recovery_review:'Asset must remain in custody while Admin performs recovery/legal review.',
  sale_authorized:'Asset remains secured pending the authorized recovery-sale process.',
  sold:'Admin has recorded the recovery sale.'
 };
 return map[a.custody_status]||'';
}
function mediaButtons(a){
 const items=[];
 (a.asset_photo_paths||[]).forEach((p,i)=>items.push({label:'Submitted Asset Photo '+(i+1),path:p}));
 (a.received_photo_paths||[]).forEach((p,i)=>items.push({label:'Receiving Photo '+(i+1),path:p}));
 (a.inspection_photo_paths||[]).forEach((p,i)=>items.push({label:'Inspection Photo '+(i+1),path:p}));
 if(a.release_photo_path)items.push({label:'Release Photo',path:a.release_photo_path});
 return items.length?'<div class="loan-asset-media">'+items.map(x=>'<button type="button" data-asset-media="'+esc(x.path)+'">'+esc(x.label)+'</button>').join('')+'</div>':'';
}
async function handleMediaClick(e){
 const b=e.target.closest('[data-asset-media]');if(!b)return;
 const popup=window.open('about:blank','_blank');
 try{
  const {data,error}=await client.storage.from(BUCKET).createSignedUrl(b.dataset.assetMedia,900);
  if(error)throw error;
  if(popup)popup.location=data.signedUrl;else window.location.href=data.signedUrl;
 }catch(error){if(popup)popup.close();alert(error.message||'Photo could not be opened.');}
}
function render(){
 const host=$('#loanAssetList');if(!host)return;
 if(!assets.length){host.innerHTML='<div class="loan-asset-empty">No Asset Loan collateral is currently assigned to this station.</div>';return;}
 host.innerHTML=assets.map(a=>{
  let action='';
  if(a.custody_status==='awaiting_dropoff'){
   action='<form class="loan-asset-action" data-asset-action="receive" data-id="'+a.id+'"><h4>Receive Asset</h4><label>Receiving photos <small>At least 1 clear photo is required.</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple required></label><label>Receiving / condition note<textarea name="notes" rows="2" placeholder="Optional visible condition or accessories received"></textarea></label><button class="primary" type="submit">Confirm Physical Receipt</button><p class="status"></p></form>';
  }else if(a.custody_status==='received'){
   action='<form class="loan-asset-action" data-asset-action="inspect" data-id="'+a.id+'"><h4>Inspect & Store Asset</h4><div class="loan-asset-grid"><label>Inspected market value (KSh)<input name="value" type="number" min="1" step="1" required></label><label>Condition<select name="condition" required><option value="">Select condition</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></label></div><label>Inspection notes<textarea name="notes" rows="3" minlength="5" required placeholder="State condition, accessories, serial match and any defects"></textarea></label><label>Inspection photos <small>At least 2 clear photos are required.</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple required></label><button class="primary" type="submit">Complete Inspection & Store</button><p class="status"></p></form>';
  }else if(['return_required','release_ready'].includes(a.custody_status)){
   action='<form class="loan-asset-action" data-asset-action="release" data-id="'+a.id+'"><h4>Release Asset to Customer</h4><label>Release / handover photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></label><label>Release note<textarea name="notes" rows="2" placeholder="Optional handover note"></textarea></label><button class="primary" type="submit">Confirm Asset Release</button><p class="status"></p></form>';
  }
  return '<article class="loan-asset-card '+(a.custody_status==='recovery_review'?'is-warning':'')+'"><header><div><b>'+esc(a.asset_name)+'</b><h3>'+pretty(a.custody_status)+'</h3><small>'+esc(a.asset_type)+(a.brand?' · '+esc(a.brand):'')+(a.model?' · '+esc(a.model):'')+'</small></div><strong>'+money(a.requested_amount_kes)+'</strong></header><div class="loan-asset-grid"><div><small>Customer</small><b>'+esc(a.customer_name||'Customer')+'</b><span>'+esc(a.customer_phone||'')+'</span></div><div><small>Serial</small><b>'+esc(a.serial_number||'Not provided')+'</b></div><div><small>Declared value</small><b>'+(a.declared_value_kes?money(a.declared_value_kes):'—')+'</b></div><div><small>Inspected value</small><b>'+(a.inspection_value_kes?money(a.inspection_value_kes):'Pending')+'</b></div><div><small>Loan</small><b>'+esc(a.loan_reference||pretty(a.application_status))+'</b></div><div><small>Outstanding</small><b>'+(a.loan_outstanding_kes!=null?money(a.loan_outstanding_kes):'—')+'</b></div></div><p class="loan-asset-desc">'+esc(a.asset_description||'')+'</p>'+mediaButtons(a)+'<div class="loan-asset-rule">'+esc(note(a))+'</div>'+action+'</article>';
 }).join('');
}
async function load(){
 if(loading)return;loading=true;
 try{
  const {data:session}=await client.auth.getSession();currentUser=session?.session?.user||null;
  if(!currentUser)throw new Error('Sign in to the Pickup Station portal.');
  const {data,error}=await client.rpc('pickup_partner_list_loan_assets');if(error)throw error;
  assets=Array.isArray(data)?data:[];render();
 }catch(e){const h=$('#loanAssetList');if(h)h.innerHTML='<div class="loan-asset-empty error">'+esc(e.message||'Asset collateral could not load.')+'</div>';}finally{loading=false;}
}
async function handleSubmit(e){
 const form=e.target.closest('[data-asset-action]');if(!form)return;e.preventDefault();
 const action=form.dataset.assetAction,id=form.dataset.id,status=form.querySelector('.status'),button=form.querySelector('button[type="submit"]');
 const uploads=[];if(button)button.disabled=true;if(status)status.textContent='Saving secure custody record…';
 try{
  if(action==='receive'){
   const files=[...(form.elements.photos.files||[])];if(files.length<1)throw new Error('Take at least one receiving photo.');
   const paths=[];for(let i=0;i<files.length;i++){const p=await upload(files[i],'asset-receive-'+(i+1));paths.push(p);uploads.push(p);}
   const {error}=await client.rpc('pickup_partner_receive_loan_asset',{p_collateral_id:id,p_received_photo_paths:paths,p_notes:form.elements.notes.value.trim()||null});if(error)throw error;
  }else if(action==='inspect'){
   const files=[...(form.elements.photos.files||[])];if(files.length<2)throw new Error('Take at least two inspection photos.');
   const paths=[];for(let i=0;i<files.length;i++){const p=await upload(files[i],'asset-inspection-'+(i+1));paths.push(p);uploads.push(p);}
   const {error}=await client.rpc('pickup_partner_inspect_loan_asset',{p_collateral_id:id,p_inspection_value_kes:Number(form.elements.value.value),p_condition_grade:form.elements.condition.value,p_notes:form.elements.notes.value.trim(),p_inspection_photo_paths:paths});if(error)throw error;
  }else if(action==='release'){
   const file=form.elements.photo.files?.[0];const p=await upload(file,'asset-release');uploads.push(p);
   const {error}=await client.rpc('pickup_partner_release_loan_asset',{p_collateral_id:id,p_release_photo_path:p,p_notes:form.elements.notes.value.trim()||null});if(error)throw error;
  }
  if(status){status.textContent='Asset custody record updated successfully.';status.classList.add('success');}
  await load();
 }catch(error){await remove(uploads);if(status){status.textContent=error.message||'Could not update asset custody.';status.classList.add('error');}if(button)button.disabled=false;}
}
function init(){style();ensureUI();client.auth.onAuthStateChange((_e,s)=>{currentUser=s?.user||null;if(currentUser&&$('#loanAssetPanel')?.classList.contains('active'))load();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
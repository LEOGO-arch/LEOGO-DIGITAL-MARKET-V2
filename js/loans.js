(() => {
'use strict';
const client=window.leogoAuth?.client;
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:2});
const date=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(String(v).length===10?v+'T12:00:00+03:00':v)):'—';
const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const PRIVATE_BUCKET='loan-private-documents';
const ASSET_BUCKET='loan-asset-media';
const MAX_BYTES=8*1024*1024;
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const PRIVATE_TYPES=new Set([...IMAGE_TYPES,'application/pdf']);
let overview=null,user=null,loading=false,pickupStations=[];

function loadStyle(){
 if($('#leogoLoanV1Css'))return;
 const l=document.createElement('link');l.id='leogoLoanV1Css';l.rel='stylesheet';l.href='css/loans.css?v=loan-v2-1';document.head.appendChild(l);
}
function destinationNumber(d){return d?.till_number||d?.paybill_number||d?.account_number||'';}
function setStatus(msg,type=''){
 const el=$('#walletLoanStatus');if(!el)return;el.textContent=msg||'';el.classList.toggle('is-error',type==='error');el.classList.toggle('is-success',type==='success');
}
function extension(file){
 if(file.type==='image/png')return 'png';
 if(file.type==='image/webp')return 'webp';
 if(file.type==='application/pdf')return 'pdf';
 return 'jpg';
}
function validateFile(file,label,allowed=IMAGE_TYPES){
 if(!file)throw new Error(label+' is required.');
 if(file.size>MAX_BYTES)throw new Error(label+' must be 8 MB or smaller.');
 if(!allowed.has(file.type))throw new Error(label+' has an unsupported file type.');
}
async function uploadFile(file,bucket,prefix,allowed=IMAGE_TYPES){
 validateFile(file,prefix,allowed);
 const path=user.id+'/'+prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.'+extension(file);
 const {error}=await client.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
 if(error)throw error;
 return path;
}
async function cleanupUploads(group){
 const byBucket=new Map();
 group.forEach(x=>{if(!x?.path)return;if(!byBucket.has(x.bucket))byBucket.set(x.bucket,[]);byBucket.get(x.bucket).push(x.path);});
 for(const [bucket,paths] of byBucket.entries()){try{await client.storage.from(bucket).remove(paths);}catch{}}
}
function reason(e){
 if(!e)return '';
 if(e.has_active_loan)return 'Complete your current loan before applying for another.';
 if(e.has_open_application)return 'You already have a loan application awaiting Admin review.';
 if(!e.wallet_active)return 'Your LEOGO Wallet must be active before you can apply.';
 if(!e.applications_enabled)return 'Saving-history loan applications are currently closed.';
 if(Number(e.total_saved_kes||0)<Number(e.minimum_total_saved_kes||0))return 'Build your verified savings history to at least '+money(e.minimum_total_saved_kes)+'.';
 if(Number(e.saving_days||0)<Number(e.minimum_saving_days||0))return 'You need at least '+Number(e.minimum_saving_days||0)+' verified saving days.';
 return 'Your current verified saving history does not yet meet the saving-history loan rules.';
}
function currentLoanType(){return $('#walletLoanType')?.value||'savings_history';}
function canApply(){
 const e=overview?.eligibility||{},s=overview?.settings||{},type=currentLoanType();
 if(e.has_active_loan||e.has_open_application||!e.wallet_active)return false;
 return type==='asset_secured'?Boolean(s.asset_applications_enabled):Boolean(e.eligible);
}
function ensureUI(){
 const form=$('#walletLoanPreviewForm');if(!form)return;
 const head=form.querySelector('.wallet-card-head');
 if(!$('#walletLoanType')){
   const wrap=document.createElement('div');wrap.className='loan-v2-section loan-v2-type';
   wrap.innerHTML='<label><span>Loan type</span><select id="walletLoanType" required><option value="savings_history">1. Saving-History Loan</option><option value="asset_secured">2. Asset Loan (secured by an item)</option></select></label><p id="walletLoanTypeHelp">Eligibility is based on your verified LEOGO saving history.</p>';
   head?.insertAdjacentElement('afterend',wrap);
 }
 if(!$('#walletLoanTermsPreview')){
   const box=document.createElement('div');box.id='walletLoanTermsPreview';box.className='loan-v1-terms';box.innerHTML='<strong>Loan terms loading…</strong><span>Eligibility and repayment terms are controlled by LEOGO Admin.</span>';
   $('#walletLoanType')?.closest('.loan-v2-section')?.insertAdjacentElement('afterend',box);
 }
 if(!$('#walletLoanIdentitySection')){
   const identity=document.createElement('section');identity.id='walletLoanIdentitySection';identity.className='loan-v2-section';
   identity.innerHTML='<div class="loan-v2-section-head"><div><b>Identity Verification</b><small>Private — visible only to you and authorized LEOGO Admin/loan reviewers.</small></div></div><div class="loan-v2-grid"><label><span>Identification type</span><select id="walletLoanIdentityType" required><option value="national_id">National ID</option><option value="passport">Passport</option></select></label><label><span>ID / Passport number</span><input id="walletLoanIdentityNumber" maxlength="30" autocomplete="off" required placeholder="Enter ID or passport number"></label></div><div class="loan-v2-files"><label><span>ID / Passport front or photo page</span><small>Upload or take a clear picture.</small><input id="walletLoanIdFront" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></label><label><span>ID / Passport back</span><small>Upload or take a clear picture of the back.</small><input id="walletLoanIdBack" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></label><label><span>Passport-size / face photo</span><small>Take or upload a clear recent photo of yourself.</small><input id="walletLoanPassportPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="user" required></label></div>';
   $('#walletLoanTermsPreview')?.insertAdjacentElement('afterend',identity);
 }
 if(!$('#walletLoanTerm')){
   const purpose=$('#walletLoanPurpose')?.closest('label');
   const label=document.createElement('label');label.innerHTML='<span>Requested repayment period</span><div class="loan-v1-term-row"><input id="walletLoanTerm" type="number" min="1" max="3650" step="1" required><small>days</small></div>';
   purpose?.insertAdjacentElement('beforebegin',label);
 }
 if(!$('#walletLoanAssetSection')){
   const asset=document.createElement('section');asset.id='walletLoanAssetSection';asset.className='loan-v2-section loan-v2-asset' ;asset.hidden=true;
   asset.innerHTML='<div class="loan-v2-section-head"><div><b>Asset Security</b><small>The item is physically inspected and stored at the selected LEOGO Pickup Station while the loan is active.</small></div></div><div class="loan-v2-grid"><label><span>Asset type</span><input id="walletAssetType" placeholder="e.g. Television, laptop, fridge"></label><label><span>Item name</span><input id="walletAssetName" placeholder="e.g. Samsung 55-inch TV"></label><label><span>Brand</span><input id="walletAssetBrand" placeholder="Optional"></label><label><span>Model</span><input id="walletAssetModel" placeholder="Optional"></label><label><span>Serial number</span><input id="walletAssetSerial" placeholder="If available"></label><label><span>Estimated value (KSh)</span><input id="walletAssetDeclaredValue" type="number" min="1" step="1" placeholder="Optional"></label></div><label><span>Asset description / current condition</span><textarea id="walletAssetDescription" rows="3" minlength="10" maxlength="1200" placeholder="Describe the item, condition, accessories and any visible marks"></textarea></label><label><span>Pickup Station for inspection & storage</span><select id="walletAssetPickupStation"><option value="">Loading active Pickup Stations…</option></select></label><div class="loan-v2-files"><label><span>Asset pictures — minimum 4, maximum 8</span><small>Take clear pictures from different sides, including serial/identifying marks where possible.</small><input id="walletAssetPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple></label><label><span>Proof of ownership</span><select id="walletAssetProofType"><option value="receipt">Receipt</option><option value="police_abstract">Police abstract</option><option value="other">Other ownership document</option></select></label><label><span>Ownership proof file</span><small>JPG, PNG, WEBP or PDF.</small><input id="walletAssetProofFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><label class="payment-paid-check"><input id="walletAssetTerms" type="checkbox"><span>I understand that the asset will be held at the selected LEOGO Pickup Station until this loan is fully settled. If the loan remains unpaid beyond the configured default period, the asset may enter an Admin/legal recovery and sale process to recover the outstanding balance. Sale is not automatic.</span></label><p id="walletAssetPhotoCount" class="loan-v2-note">0 asset pictures selected.</p>';
   $('#walletLoanPurpose')?.closest('label')?.insertAdjacentElement('afterend',asset);
 }
 if(!$('#walletLoanPortfolio')){
   const panel=document.createElement('section');panel.id='walletLoanPortfolio';panel.className='loan-v1-customer';panel.innerHTML='<div class="loan-v1-head"><div><span>LOAN ACCOUNT</span><h4>My Loans & Repayments</h4><p>Approved loans are credited to your LEOGO Wallet. Asset Loans also show the custody status of the held item.</p></div><button id="refreshWalletLoans" type="button">Refresh</button></div><div id="walletLoanPortfolioBody" class="loan-v1-list"><div class="loan-v1-empty">Sign in to view your loan account.</div></div>';
   form.insertAdjacentElement('afterend',panel);
 }
 if(!form.dataset.loanV2Bound){
   form.dataset.loanV2Bound='1';
   form.addEventListener('submit',submitApplication,true);
 }
 $('#walletLoanType')?.addEventListener('change',()=>{applyTypeUI();render();});
 $('#walletAssetPhotos')?.addEventListener('change',()=>{
   const n=$('#walletAssetPhotos')?.files?.length||0;
   const el=$('#walletAssetPhotoCount');if(el)el.textContent=n+' asset picture'+(n===1?'':'s')+' selected. Minimum required: 4.';
 });
 $('#refreshWalletLoans')?.addEventListener('click',()=>load());
 $('#walletLoanPortfolio')?.addEventListener('submit',submitRepayment);
 $('#walletLoanPortfolio')?.addEventListener('click',async e=>{
   const b=e.target.closest('[data-copy-loan-destination]');if(!b)return;
   const number=destinationNumber(overview?.repayment_destination);if(!number)return;
   try{await navigator.clipboard.writeText(number);b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1400);}catch{}
 });
 applyTypeUI();
}
function applyTypeUI(){
 const type=currentLoanType(),asset=type==='asset_secured',sec=$('#walletLoanAssetSection');
 if(sec)sec.hidden=!asset;
 const help=$('#walletLoanTypeHelp');
 if(help)help.textContent=asset?'Your loan amount is limited by Admin settings and the Pickup Station inspected value of the asset.':'Eligibility is based on your verified LEOGO saving history.';
 ['#walletAssetType','#walletAssetName','#walletAssetDescription','#walletAssetPickupStation','#walletAssetPhotos','#walletAssetProofType','#walletAssetProofFile','#walletAssetTerms'].forEach(sel=>{
   const el=$(sel);if(el)el.required=asset;
 });
}
async function loadPickupStations(){
 const select=$('#walletAssetPickupStation');if(!select)return;
 try{
   const {data,error}=await client.rpc('customer_list_loan_pickup_stations');
   if(error)throw error;
   pickupStations=Array.isArray(data)?data:[];
   select.innerHTML='<option value="">Select Pickup Station</option>'+pickupStations.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.station_name)+' — '+esc([s.town,s.sub_county,s.county].filter(Boolean).join(', '))+'</option>').join('');
   if(!pickupStations.length)select.innerHTML='<option value="">No active Pickup Stations available</option>';
 }catch(e){select.innerHTML='<option value="">Pickup Stations could not load</option>';}
}
function eligibilityBadgeText(){
 const e=overview?.eligibility||{},s=overview?.settings||{},type=currentLoanType();
 if(e.has_active_loan)return 'Active loan';
 if(e.has_open_application)return 'Under review';
 if(type==='asset_secured')return s.asset_applications_enabled?'Asset Loan open':'Asset Loans closed';
 return e.eligible?('Eligible up to '+money(e.max_eligible_amount_kes)):e.applications_enabled?'Building eligibility':'Applications closed';
}
function syncEligibilityBadge(){
 const badge=$('#walletLoanEligibility');if(!badge||!overview)return;
 const expected=eligibilityBadgeText();if(badge.textContent!==expected)badge.textContent=expected;
}
function render(){
 const e=overview?.eligibility||{},s=overview?.settings||{},type=currentLoanType(),asset=type==='asset_secured';
 const form=$('#walletLoanPreviewForm'),button=form?.querySelector('button[type="submit"]'),amount=$('#walletLoanAmount'),term=$('#walletLoanTerm');
 syncEligibilityBadge();
 const defaultTerm=asset?Number(s.asset_default_term_days||30):Number(e.default_term_days||30);
 if(term&&!term.matches(':focus'))term.value=defaultTerm;
 const max=asset?Number(s.asset_max_loan_amount_kes||0):Number(e.max_eligible_amount_kes||0);
 if(amount)amount.max=String(Math.max(1,max||1));
 const allowed=canApply();
 if(button){button.disabled=!allowed;button.textContent=allowed?(asset?'Submit Asset Loan Application':'Submit Saving-History Loan Application'):'Not Eligible / Applications Closed';}
 const terms=$('#walletLoanTermsPreview');
 if(terms){
   if(asset){
     terms.innerHTML='<div><span>Asset Loan maximum</span><strong>'+money(s.asset_max_loan_amount_kes)+'</strong></div><div><span>Maximum LTV</span><strong>'+Number(s.asset_loan_to_value_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Interest</span><strong>'+Number(s.asset_interest_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Default term</span><strong>'+Number(s.asset_default_term_days||0)+' days</strong></div><p>'+esc(s.asset_applications_enabled?'Final approved amount cannot exceed the configured loan-to-value percentage of the Pickup Station inspected value.':'Asset Loan applications are currently closed by Admin.')+'</p>';
   }else{
     terms.innerHTML='<div><span>Indicative maximum</span><strong>'+money(e.max_eligible_amount_kes)+'</strong></div><div><span>Interest</span><strong>'+Number(e.interest_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Processing fee</span><strong>'+Number(e.processing_fee_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Default term</span><strong>'+Number(e.default_term_days||0)+' days</strong></div><p>'+esc(e.eligible?'You currently meet the configured saving-history rules. Final approval is still required.':reason(e))+'</p>';
   }
 }
 renderPortfolio();
}
function assetMessage(c){
 const map={
  awaiting_dropoff:'Take this asset to the selected Pickup Station for physical receiving, inspection and secure storage.',
  received:'The Pickup Station has received the asset. Inspection is still pending.',
  stored:'The asset has been inspected and is securely stored while the loan application/loan is processed.',
  return_required:'The loan was not approved. The asset is authorized for return; contact the Pickup Station.',
  release_ready:'The loan is fully settled. The asset is authorized for return; collect it from the Pickup Station.',
  released:'The Pickup Station recorded the asset as released.',
  recovery_review:'The configured default period has passed. The asset is under Admin recovery review; no sale is automatic.',
  sale_authorized:'Admin has authorized a controlled recovery sale after review.',
  sold:'The asset recovery sale has been recorded.'
 };
 return map[c?.custody_status]||'';
}
function renderPortfolio(){
 const loans=Array.isArray(overview?.loans)?overview.loans:[];
 const apps=Array.isArray(overview?.applications)?overview.applications:[];
 const repayments=Array.isArray(overview?.repayments)?overview.repayments:[];
 const assets=Array.isArray(overview?.asset_collateral)?overview.asset_collateral:[];
 const dest=overview?.repayment_destination||null;
 const host=$('#walletLoanPortfolioBody');if(!host)return;
 let html='';
 const current=loans.find(l=>['active','overdue'].includes(l.status));
 if(current){
   const pct=Math.min(100,Math.max(0,Number(current.repayment_progress_percent||0)));
   const number=destinationNumber(dest);
   html+='<article class="loan-v1-card '+(current.status==='overdue'?'is-overdue':'')+'"><header><div><b>'+esc(current.loan_reference)+'</b><h5>'+pretty(current.loan_type)+' · '+pretty(current.status)+'</h5></div><strong>'+money(current.outstanding_kes)+' outstanding</strong></header><div class="loan-v1-progress"><span style="width:'+pct+'%"></span></div><div class="loan-v1-grid"><div><small>Principal</small><b>'+money(current.principal_kes)+'</b></div><div><small>Total due</small><b>'+money(current.total_due_kes)+'</b></div><div><small>Repaid</small><b>'+money(current.amount_repaid_kes)+'</b></div><div><small>Due date</small><b>'+date(current.due_date)+'</b></div><div><small>Grace until</small><b>'+date(current.grace_until)+'</b></div><div><small>Progress</small><b>'+pct+'%</b></div></div>'+
   (number?'<div class="loan-v1-destination"><div><small>Repay to '+esc(dest.display_name||dest.account_type||'LEOGO account')+'</small><strong>'+esc(number)+'</strong><span>'+esc(dest.account_name||dest.business_name||'')+'</span></div><button type="button" data-copy-loan-destination>Copy</button></div>':'<p class="loan-v1-warning">Admin has not assigned the Loan Repayment payment account yet.</p>')+
   '<form class="loan-v1-repay" data-loan-repayment-form="'+esc(current.id)+'"><label><span>Repayment amount</span><input name="amount" type="number" min="1" max="'+Number(current.outstanding_kes||0)+'" step="0.01" required></label><label><span>Payment transaction/reference</span><input name="reference" minlength="6" maxlength="120" required placeholder="Paste M-Pesa / bank reference"></label><button type="submit" '+(number?'':'disabled')+'>Submit Repayment for Verification</button><p class="loan-v1-form-status" aria-live="polite"></p></form></article>';
 }
 const latestApp=apps[0];
 if(latestApp){
   html+='<article class="loan-v1-card"><header><div><b>Latest application</b><h5>'+pretty(latestApp.loan_type)+' · '+pretty(latestApp.application_status)+'</h5></div><strong>'+money(latestApp.requested_amount_kes)+'</strong></header><div class="loan-v1-grid"><div><small>Requested term</small><b>'+Number(latestApp.requested_term_days||0)+' days</b></div><div><small>Identity type</small><b>'+pretty(latestApp.identity_type)+'</b></div><div><small>Submitted</small><b>'+date(String(latestApp.submitted_at||'').slice(0,10))+'</b></div></div>'+(latestApp.partner_notes?'<p>'+esc(latestApp.partner_notes)+'</p>':'')+'</article>';
 }
 assets.slice(0,3).forEach(c=>{
   html+='<article class="loan-v1-card loan-v2-collateral"><header><div><b>'+esc(c.asset_name)+'</b><h5>Asset custody · '+pretty(c.custody_status)+'</h5></div><strong>'+esc(c.pickup_station_name||'Pickup Station')+'</strong></header><div class="loan-v1-grid"><div><small>Asset type</small><b>'+esc(c.asset_type)+'</b></div><div><small>Inspected value</small><b>'+(c.inspection_value_kes?money(c.inspection_value_kes):'Pending')+'</b></div><div><small>Station</small><b>'+esc(c.pickup_station_location||'')+'</b></div></div><p>'+esc(assetMessage(c))+'</p>'+(c.pickup_station_phone?'<small>Station contact: '+esc(c.pickup_station_phone)+(c.pickup_station_hours?' · '+esc(c.pickup_station_hours):'')+'</small>':'')+'</article>';
 });
 if(repayments.length){
   html+='<article class="loan-v1-card"><header><div><b>Repayment history</b><h5>Latest submissions</h5></div></header><div class="loan-v1-history">'+repayments.slice(0,8).map(r=>'<div><span>'+esc(r.payment_reference)+' · '+pretty(r.payment_status)+'</span><strong>'+money(r.amount_kes)+'</strong></div>').join('')+'</div></article>';
 }
 if(!html)html='<div class="loan-v1-empty">'+(user?'No loan application or loan account yet.':'Sign in to view your loan account.')+'</div>';
 host.innerHTML=html;
}
async function load(forUser){
 if(loading)return;
 loading=true;
 try{
   if(forUser!==undefined)user=forUser;
   if(user===null){const {data}=await client.auth.getSession();user=data?.session?.user||null;}
   if(!user){overview=null;render();return;}
   const [{data,error}]=await Promise.all([client.rpc('get_my_wallet_loan_overview'),loadPickupStations()]);
   if(error)throw error;
   overview=data||{};render();
 }catch(error){
   const host=$('#walletLoanPortfolioBody');if(host)host.innerHTML='<div class="loan-v1-empty error">'+esc(error?.message||'Loan account could not load.')+'</div>';
 }finally{loading=false;}
}
async function submitApplication(event){
 event.preventDefault();event.stopImmediatePropagation();
 const form=event.currentTarget;if(!user||!form.reportValidity())return;
 const type=currentLoanType(),e=overview?.eligibility||{},s=overview?.settings||{};
 if(!canApply()){
   setStatus(type==='asset_secured'?(s.asset_applications_enabled?'You cannot apply while another loan/application is active.':'Asset Loan applications are currently closed.'):reason(e),'error');
   return;
 }
 const amount=Number($('#walletLoanAmount')?.value||0),purpose=$('#walletLoanPurpose')?.value.trim(),consent=$('#walletLoanConsent')?.checked,term=Number($('#walletLoanTerm')?.value||0);
 if(!consent){setStatus('Accept the loan review and repayment conditions before submitting.','error');return;}
 const identityType=$('#walletLoanIdentityType')?.value,identityNumber=$('#walletLoanIdentityNumber')?.value.trim();
 const front=$('#walletLoanIdFront')?.files?.[0],back=$('#walletLoanIdBack')?.files?.[0],face=$('#walletLoanPassportPhoto')?.files?.[0];
 const uploads=[];const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
 try{
   validateFile(front,'ID / Passport front');validateFile(back,'ID / Passport back');validateFile(face,'Passport-size / face photo');
   setStatus('Uploading private identity verification files…');
   const identityFront=await uploadFile(front,PRIVATE_BUCKET,'identity-front');uploads.push({bucket:PRIVATE_BUCKET,path:identityFront});
   const identityBack=await uploadFile(back,PRIVATE_BUCKET,'identity-back');uploads.push({bucket:PRIVATE_BUCKET,path:identityBack});
   const passportPhoto=await uploadFile(face,PRIVATE_BUCKET,'passport-photo');uploads.push({bucket:PRIVATE_BUCKET,path:passportPhoto});

   const payload={
     loan_type:type,requested_amount_kes:amount,purpose,requested_term_days:term,consent_accepted:true,
     identity_type:identityType,identity_number:identityNumber,
     identity_front_path:identityFront,identity_back_path:identityBack,applicant_passport_photo_path:passportPhoto,
     asset_terms_accepted:false
   };

   if(type==='asset_secured'){
     const photos=[...($('#walletAssetPhotos')?.files||[])];
     if(photos.length<4||photos.length>8)throw new Error('Select at least 4 and at most 8 clear asset pictures.');
     photos.forEach((f,i)=>validateFile(f,'Asset picture '+(i+1)));
     const proof=$('#walletAssetProofFile')?.files?.[0];validateFile(proof,'Proof of ownership',PRIVATE_TYPES);
     setStatus('Uploading asset pictures and ownership proof…');
     const assetPaths=[];
     for(let i=0;i<photos.length;i++){const p=await uploadFile(photos[i],ASSET_BUCKET,'asset-'+(i+1));assetPaths.push(p);uploads.push({bucket:ASSET_BUCKET,path:p});}
     const proofPath=await uploadFile(proof,PRIVATE_BUCKET,'ownership-proof',PRIVATE_TYPES);uploads.push({bucket:PRIVATE_BUCKET,path:proofPath});
     payload.asset_terms_accepted=Boolean($('#walletAssetTerms')?.checked);
     payload.asset={
       pickup_station_id:$('#walletAssetPickupStation')?.value,
       asset_type:$('#walletAssetType')?.value.trim(),asset_name:$('#walletAssetName')?.value.trim(),
       brand:$('#walletAssetBrand')?.value.trim(),model:$('#walletAssetModel')?.value.trim(),serial_number:$('#walletAssetSerial')?.value.trim(),
       declared_value_kes:$('#walletAssetDeclaredValue')?.value||null,asset_description:$('#walletAssetDescription')?.value.trim(),
       asset_photo_paths:assetPaths,ownership_proof_type:$('#walletAssetProofType')?.value,ownership_proof_path:proofPath
     };
   }

   setStatus('Submitting your loan application securely…');
   const {data,error}=await client.rpc('submit_wallet_loan_application_v3',{p_application:payload});
   if(error)throw error;
   form.reset();applyTypeUI();
   setStatus(type==='asset_secured'?'Asset Loan application submitted. Take the asset to the selected Pickup Station for inspection and secure storage.':'Saving-History Loan application submitted for Admin review.','success');
   await load(user);
 }catch(error){
   await cleanupUploads(uploads);
   setStatus(error?.message||'Loan application could not be submitted.','error');
   if(btn)btn.disabled=false;
 }
}
async function submitRepayment(event){
 const form=event.target.closest('[data-loan-repayment-form]');if(!form)return;
 event.preventDefault();
 const id=form.dataset.loanRepaymentForm,amount=Number(form.elements.amount.value||0),reference=form.elements.reference.value.trim(),status=form.querySelector('.loan-v1-form-status'),btn=form.querySelector('button[type="submit"]');
 if(btn)btn.disabled=true;if(status)status.textContent='Submitting repayment for verification…';
 const {error}=await client.rpc('submit_wallet_loan_repayment',{p_loan_id:id,p_amount_kes:amount,p_payment_reference:reference});
 if(error){if(status){status.textContent=error.message;status.classList.add('is-error');}if(btn)btn.disabled=false;return;}
 if(status){status.textContent='Repayment submitted. Your outstanding balance changes only after Admin verification.';status.classList.add('is-success');}
 form.reset();await load(user);
}
function init(){
 loadStyle();ensureUI();load();
 const badge=$('#walletLoanEligibility');
 if(badge&&window.MutationObserver){new MutationObserver(()=>syncEligibilityBadge()).observe(badge,{childList:true,characterData:true,subtree:true});}
 client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;load(user);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
(() => {
'use strict';
const client=window.leogoAdminDb;
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const date=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(String(v).length===10?v+'T12:00:00+03:00':v)):'—';
const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
let settings={},summary={},applications=[],loans=[],repayments=[],busy=false;

function loadStyle(){if($('#leogoLoanV1Css'))return;const l=document.createElement('link');l.id='leogoLoanV1Css';l.rel='stylesheet';l.href='../css/loans.css?v=loan-v2-1';document.head.appendChild(l);}
function input(name,label,step='0.01',min='0'){return '<label><span>'+label+'</span><input name="'+name+'" type="number" min="'+min+'" step="'+step+'" required></label>';}
function ensureUI(){
 const panel=$('[data-admin-panel="wallet"]');if(!panel||$('#adminLoanModule'))return;
 const module=document.createElement('section');module.id='adminLoanModule';module.className='loan-v1-admin';
 module.innerHTML=
 '<div class="loan-v1-head"><div><span>LOANS</span><h3>Loan Rules, Applications & Portfolio</h3><p>Saving-History Loans and Asset Loans use one audited loan book. Identity documents remain private.</p></div><div class="loan-v1-actions"><button id="refreshAdminLoans" type="button">Refresh</button><button type="button" data-open-view="approvals" data-filter-target="wallet">Open Approval Center</button></div></div>'+
 '<div id="adminLoanSummary" class="loan-v1-summary"></div>'+
 '<form id="adminLoanSettings" class="loan-v1-settings">'+
   '<section class="loan-v2-settings-section"><header><span>TYPE 1</span><h4>Saving-History Loan</h4></header><div class="loan-v1-switch"><label><input name="applications_enabled" type="checkbox"> <strong>Accept Saving-History Loan applications</strong></label></div><div class="loan-v1-settings-grid">'+
   input('minimum_total_saved_kes','Minimum verified savings')+input('minimum_saving_days','Minimum saving days','1')+input('max_loan_amount_kes','Maximum loan amount')+input('loan_to_savings_ratio','Loan-to-savings ratio')+input('interest_percent','Interest %')+input('processing_fee_percent','Processing fee %')+input('default_term_days','Default term (days)','1','1')+input('grace_days','Grace period (days)','1')+input('overdue_penalty_percent','Overdue penalty %')+
   '</div></section>'+
   '<section class="loan-v2-settings-section"><header><span>TYPE 2</span><h4>Asset Loan</h4></header><div class="loan-v1-switch"><label><input name="asset_applications_enabled" type="checkbox"> <strong>Accept Asset Loan applications</strong></label><small>Asset must be received, inspected and stored at the chosen Pickup Station before approval.</small></div><div class="loan-v1-settings-grid">'+
   input('asset_max_loan_amount_kes','Maximum Asset Loan')+input('asset_loan_to_value_percent','Maximum loan-to-value %')+input('asset_interest_percent','Asset Loan interest %')+input('asset_processing_fee_percent','Asset processing fee %')+input('asset_default_term_days','Default Asset Loan term (days)','1','1')+input('asset_grace_days','Asset grace period (days)','1')+input('asset_overdue_penalty_percent','Asset overdue penalty %')+input('asset_recovery_after_overdue_days','Recovery review after overdue days','1')+
   '</div><p class="loan-v2-sale-note">No asset is sold automatically. After the configured overdue period the item enters Recovery Review; an authorized Admin must separately approve the sale and later record the actual sale proceeds.</p></section>'+
   '<label class="loan-v1-check"><input name="allow_partial_repayment" type="checkbox"> Allow partial loan repayments</label><div class="loan-v1-actions"><button type="submit">Save Loan Rules</button><span id="adminLoanSettingsStatus"></span></div>'+
 '</form>'+
 '<section><div class="section-title compact"><span>APPLICATIONS</span><h4>Loan Applications & Verification</h4><p>Review identity documents and, for Asset Loans, Pickup Station custody and inspection before approval.</p></div><div id="adminLoanApplicationList" class="loan-v1-list"></div></section>'+
 '<div class="loan-v1-admin-columns"><section><div class="section-title compact"><span>LOAN BOOK</span><h4>Active / Historical Loans</h4></div><div id="adminLoanList" class="loan-v1-list"></div></section><section><div class="section-title compact"><span>REPAYMENTS</span><h4>Repayment Verification</h4></div><div id="adminLoanRepaymentList" class="loan-v1-list"></div></section></div>';
 panel.appendChild(module);
 $('#refreshAdminLoans')?.addEventListener('click',loadAll);
 $('#adminLoanSettings')?.addEventListener('submit',saveSettings);
 $('#adminLoanApplicationList')?.addEventListener('click',applicationAction);
 $('#adminLoanList')?.addEventListener('click',loanAction);
 $('#adminLoanRepaymentList')?.addEventListener('click',reviewRepayment);
}
function patchDashboardLoanMetrics(){
 const host=$('#walletSnapshot');if(!host)return;
 const values={'Active Loans':summary.active_loans??0,'Overdue Loans':summary.overdue_loans??0,'Loan Applications':summary.pending_applications??0};
 [...host.querySelectorAll('div')].forEach(row=>{
   const label=row.querySelector('span')?.textContent?.trim();if(!(label in values))return;
   const strong=row.querySelector('strong');if(strong)strong.textContent=Number(values[label]||0).toLocaleString('en-KE');
   const small=row.querySelector('small');if(small)small.textContent='';
 });
}
function fileButtons(app){
 const items=[];
 const push=(label,bucket,path)=>{if(path)items.push({label,bucket,path});};
 push('ID / Passport Front','loan-private-documents',app.identity_front_path);
 push('ID / Passport Back','loan-private-documents',app.identity_back_path);
 push('Applicant Passport Photo','loan-private-documents',app.applicant_passport_photo_path);
 const c=app.collateral;
 if(c){
   push('Proof of Ownership','loan-private-documents',c.ownership_proof_path);
   (c.asset_photo_paths||[]).forEach((p,i)=>push('Asset Photo '+(i+1),'loan-asset-media',p));
   (c.received_photo_paths||[]).forEach((p,i)=>push('Station Receiving Photo '+(i+1),'loan-asset-media',p));
   (c.inspection_photo_paths||[]).forEach((p,i)=>push('Inspection Photo '+(i+1),'loan-asset-media',p));
 }
 return items.length?'<div class="loan-v1-actions">'+items.map(x=>'<button type="button" class="secondary" data-loan-file="'+esc(x.path)+'" data-loan-bucket="'+esc(x.bucket)+'">'+esc(x.label)+'</button>').join('')+'</div>':'';
}
function renderApplications(){
 const host=$('#adminLoanApplicationList');if(!host)return;
 if(!applications.length){host.innerHTML='<div class="loan-v1-empty">No loan applications yet.</div>';return;}
 host.innerHTML=applications.slice(0,80).map(a=>{
   const c=a.collateral||null;
   const assetDetails=c?'<div class="loan-v1-grid"><div><small>Asset</small><b>'+esc(c.asset_name)+' · '+esc(c.asset_type)+'</b></div><div><small>Pickup Station</small><b>'+esc(c.pickup_station_name||'—')+'</b></div><div><small>Custody</small><b>'+pretty(c.custody_status)+'</b></div><div><small>Declared value</small><b>'+(c.declared_value_kes?money(c.declared_value_kes):'—')+'</b></div><div><small>Inspection value</small><b>'+(c.inspection_value_kes?money(c.inspection_value_kes):'Pending')+'</b></div><div><small>Condition</small><b>'+pretty(c.condition_grade||'Pending')+'</b></div></div><p class="loan-v2-muted">'+esc(c.asset_description||'')+'</p>':'';
   const canApprove=a.application_status==='pending'||a.application_status==='under_review';
   const assetReady=a.loan_type!=='asset_secured'||c?.custody_status==='stored';
   return '<article class="loan-v1-card"><header><div><b>'+esc(a.customer_name||'Customer')+'</b><h5>'+pretty(a.loan_type)+' · '+pretty(a.application_status)+'</h5><small>'+esc(a.customer_phone||'')+' · '+esc(a.customer_email||'')+'</small></div><strong>'+money(a.requested_amount_kes)+'</strong></header>'+
   '<div class="loan-v1-grid"><div><small>ID type</small><b>'+pretty(a.identity_type)+'</b></div><div><small>ID / Passport No.</small><b>'+esc(a.identity_number||'—')+'</b></div><div><small>Requested term</small><b>'+Number(a.requested_term_days||0)+' days</b></div><div><small>Purpose</small><b>'+esc(a.purpose||'')+'</b></div><div><small>Saving history</small><b>'+money(a.total_saved_at_application)+' · '+Number(a.confirmed_saving_days_at_application||0)+' days</b></div><div><small>Submitted</small><b>'+date(a.submitted_at)+'</b></div></div>'+
   assetDetails+fileButtons(a)+
   (canApprove?'<div class="loan-v1-actions"><button type="button" data-loan-app="'+a.id+'" data-decision="under_review">Mark Under Review</button><button type="button" data-loan-app="'+a.id+'" data-decision="approve" '+(assetReady?'':'disabled title="Asset must be stored after inspection"')+'>Approve</button><button type="button" class="secondary" data-loan-app="'+a.id+'" data-decision="reject">Reject</button>'+(a.loan_type==='asset_secured'&&!assetReady?'<span class="loan-v2-muted">Approval unlocks after Pickup Station inspection & storage.</span>':'')+'</div>':'')+
   (a.partner_notes?'<p><b>Admin note:</b> '+esc(a.partner_notes)+'</p>':'')+'</article>';
 }).join('');
}
function render(){
 const sum=$('#adminLoanSummary');if(sum)sum.innerHTML=[
  ['Pending applications',summary.pending_applications],['Active loans',summary.active_loans],['Overdue loans',summary.overdue_loans],['Paid loans',summary.paid_loans],
  ['Principal disbursed',money(summary.principal_disbursed_kes)],['Outstanding',money(summary.outstanding_kes)],['Pending repayments',summary.pending_repayments],['Verified repayments',money(summary.verified_repayments_kes)]
 ].map(([l,v])=>'<article><small>'+l+'</small><strong>'+String(v??0)+'</strong></article>').join('');
 const form=$('#adminLoanSettings');if(form)Object.entries(settings||{}).forEach(([k,v])=>{const el=form.elements[k];if(!el)return;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v??'';});
 renderApplications();
 const loanHost=$('#adminLoanList');if(loanHost)loanHost.innerHTML=loans.length?loans.map(l=>{
   const c=l.collateral;
   const recovery=c?.custody_status==='recovery_review'?'<button type="button" class="loan-v2-danger" data-collateral-action="authorize_sale" data-collateral-id="'+c.id+'">Authorize Recovery Sale</button>':c?.custody_status==='sale_authorized'?'<button type="button" class="loan-v2-danger" data-collateral-action="record_sale" data-collateral-id="'+c.id+'">Record Asset Sale</button>':'';
   return '<article class="loan-v1-card '+(l.status==='overdue'?'is-overdue':'')+'"><header><div><b>'+esc(l.loan_reference)+'</b><h5>'+pretty(l.loan_type)+' · '+esc(l.customer_name||'Customer')+'</h5><small>'+esc(l.customer_phone||'')+'</small></div><strong>'+pretty(l.status)+'</strong></header><div class="loan-v1-grid"><div><small>Principal</small><b>'+money(l.principal_kes)+'</b></div><div><small>Total due</small><b>'+money(l.total_due_kes)+'</b></div><div><small>Repaid</small><b>'+money(l.amount_repaid_kes)+'</b></div><div><small>Outstanding</small><b>'+money(l.outstanding_kes)+'</b></div><div><small>Due</small><b>'+date(l.due_date)+'</b></div><div><small>Grace until</small><b>'+date(l.grace_until)+'</b></div></div>'+
   (c?'<div class="loan-v2-sale-note"><b>Held asset:</b> '+esc(c.asset_name)+' · '+pretty(c.custody_status)+' · '+esc(c.pickup_station_name||'')+(c.inspection_value_kes?' · inspected '+money(c.inspection_value_kes):'')+'</div>':'')+
   (recovery?'<div class="loan-v1-actions">'+recovery+'</div>':'')+'</article>';
 }).join(''):'<div class="loan-v1-empty">No approved loans yet.</div>';
 const repayHost=$('#adminLoanRepaymentList');if(repayHost)repayHost.innerHTML=repayments.length?repayments.slice(0,50).map(r=>'<article class="loan-v1-card"><header><div><b>'+esc(r.repayment_reference)+'</b><h5>'+esc(r.customer_name||'Customer')+'</h5><small>'+esc(r.loan_reference||'')+'</small></div><strong>'+money(r.amount_kes)+'</strong></header><div class="loan-v1-grid"><div><small>Payment ref</small><b>'+esc(r.payment_reference)+'</b></div><div><small>Status</small><b>'+pretty(r.payment_status)+'</b></div><div><small>Loan outstanding</small><b>'+money(r.loan_outstanding_kes)+'</b></div></div>'+(r.payment_status==='pending'?'<div class="loan-v1-actions"><button type="button" data-repay-review="'+r.id+'" data-decision="verify">Verify</button><button type="button" class="secondary" data-repay-review="'+r.id+'" data-decision="reject">Reject</button></div>':'')+'</article>').join(''):'<div class="loan-v1-empty">No loan repayment submissions yet.</div>';
 patchDashboardLoanMetrics();
}
async function loadAll(){
 if(busy)return;busy=true;
 try{
  const [a,b,c,d,e]=await Promise.all([
   client.rpc('admin_get_wallet_loan_settings'),client.rpc('admin_wallet_loan_summary'),
   client.rpc('admin_list_wallet_loan_applications_v2'),client.rpc('admin_list_wallet_loans'),client.rpc('admin_list_wallet_loan_repayments')
  ]);
  const error=[a,b,c,d,e].find(x=>x.error)?.error;if(error)throw error;
  settings=a.data||{};summary=b.data||{};applications=Array.isArray(c.data)?c.data:[];loans=Array.isArray(d.data)?d.data:[];repayments=Array.isArray(e.data)?e.data:[];render();
 }catch(error){const h=$('#adminLoanApplicationList');if(h)h.innerHTML='<div class="loan-v1-empty error">'+esc(error?.message||'Loan module could not load.')+'</div>';}finally{busy=false;}
}
async function saveSettings(e){
 e.preventDefault();const form=e.currentTarget,st=$('#adminLoanSettingsStatus'),o={};
 ['minimum_total_saved_kes','minimum_saving_days','max_loan_amount_kes','loan_to_savings_ratio','interest_percent','processing_fee_percent','default_term_days','grace_days','overdue_penalty_percent','asset_max_loan_amount_kes','asset_loan_to_value_percent','asset_interest_percent','asset_processing_fee_percent','asset_default_term_days','asset_grace_days','asset_overdue_penalty_percent','asset_recovery_after_overdue_days'].forEach(k=>o[k]=Number(form.elements[k].value));
 o.applications_enabled=form.elements.applications_enabled.checked;
 o.asset_applications_enabled=form.elements.asset_applications_enabled.checked;
 o.allow_partial_repayment=form.elements.allow_partial_repayment.checked;
 st.textContent='Saving…';const {error}=await client.rpc('admin_save_wallet_loan_settings',{p_settings:o});
 st.textContent=error?error.message:'Loan rules saved and audited.';if(!error)await loadAll();
}
async function openSecure(bucket,path){
 const popup=window.open('about:blank','_blank');
 try{const {data,error}=await client.storage.from(bucket).createSignedUrl(path,900);if(error)throw error;if(popup)popup.location=data.signedUrl;else window.location.href=data.signedUrl;}
 catch(e){if(popup)popup.close();alert(e.message||'File could not be opened.');}
}
async function applicationAction(e){
 const file=e.target.closest('[data-loan-file]');
 if(file){await openSecure(file.dataset.loanBucket,file.dataset.loanFile);return;}
 const b=e.target.closest('[data-loan-app]');if(!b)return;
 const decision=b.dataset.decision;
 let notes='';
 if(decision==='reject'){notes=prompt('Enter a clear rejection reason:')||'';if(notes.trim().length<3)return;}
 else if(decision==='under_review'){notes=prompt('Review note (optional):')||'';}
 else {notes=prompt('Approval note (optional):')||'';}
 b.disabled=true;
 const {error}=await client.rpc('admin_review_approval',{p_kind:'wallet_loan',p_record_id:b.dataset.loanApp,p_decision:decision,p_notes:notes||null});
 if(error){alert(error.message);b.disabled=false;return;}
 await loadAll();
}
async function loanAction(e){
 const b=e.target.closest('[data-collateral-action]');if(!b)return;
 const id=b.dataset.collateralId,action=b.dataset.collateralAction;
 if(action==='authorize_sale'){
   const notes=prompt('Record the recovery/legal review basis before authorizing sale. This action does not sell the asset:')||'';
   if(notes.trim().length<10)return;
   b.disabled=true;const {error}=await client.rpc('admin_authorize_asset_recovery_sale',{p_collateral_id:id,p_notes:notes});
   if(error){alert(error.message);b.disabled=false;return;}
 }else if(action==='record_sale'){
   const amount=Number(prompt('Actual asset sale amount (KSh):')||0);if(!Number.isFinite(amount)||amount<0)return;
   const reference=prompt('Sale / disposal reference:')||'';if(reference.trim().length<3)return;
   const notes=prompt('Sale notes (optional):')||'';
   b.disabled=true;const {error}=await client.rpc('admin_record_asset_sale',{p_collateral_id:id,p_sale_amount_kes:amount,p_sale_reference:reference,p_notes:notes||null});
   if(error){alert(error.message);b.disabled=false;return;}
 }
 await loadAll();
}
async function reviewRepayment(e){
 const b=e.target.closest('[data-repay-review]');if(!b)return;
 const decision=b.dataset.decision,notes=prompt(decision==='reject'?'Reason for rejection:':'Verification note (optional):')||'';
 if(decision==='reject'&&notes.trim().length<3)return;
 b.disabled=true;const {error}=await client.rpc('admin_review_wallet_loan_repayment',{p_repayment_id:b.dataset.repayReview,p_decision:decision,p_notes:notes||null});
 if(error){alert(error.message);b.disabled=false;return;}await loadAll();
}
function init(){
 loadStyle();ensureUI();
 client.auth.getSession().then(({data})=>{if(data?.session?.user)loadAll();});
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user)setTimeout(loadAll,50);});
 document.addEventListener('click',e=>{
   if(e.target.closest('[data-admin-view="wallet"]'))setTimeout(loadAll,80);
   if(e.target.closest('[data-admin-view="dashboard"]'))setTimeout(patchDashboardLoanMetrics,120);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
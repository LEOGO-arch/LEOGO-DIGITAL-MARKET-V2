(() => {
'use strict';
const client=window.leogoAdminDb;
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const date=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(String(v).length===10?v+'T12:00:00+03:00':v)):'—';
const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
let settings={},summary={},loans=[],repayments=[],busy=false;

function loadStyle(){if($('#leogoLoanV1Css'))return;const l=document.createElement('link');l.id='leogoLoanV1Css';l.rel='stylesheet';l.href='../css/loans.css?v=loan-v1-1';document.head.appendChild(l);}
function ensureUI(){
 const panel=$('[data-admin-panel="wallet"]');if(!panel||$('#adminLoanModule'))return;
 const module=document.createElement('section');module.id='adminLoanModule';module.className='loan-v1-admin';
 module.innerHTML='<div class="loan-v1-head"><div><span>LOANS</span><h3>Loan Rules & Portfolio</h3><p>Configure eligibility and terms, then review applications in Approval Center. Approved principal is credited to the customer wallet.</p></div><div class="loan-v1-actions"><button id="refreshAdminLoans" type="button">Refresh</button><button type="button" data-open-view="approvals" data-filter-target="wallet">Open Loan Applications</button></div></div>'+
 '<div id="adminLoanSummary" class="loan-v1-summary"></div>'+
 '<form id="adminLoanSettings" class="loan-v1-settings"><div class="loan-v1-switch"><label><input name="applications_enabled" type="checkbox"> <strong>Accept new loan applications</strong></label><small>Keep OFF until LEOGO has approved the lending rules and repayment account.</small></div><div class="loan-v1-settings-grid">'+
 ['minimum_total_saved_kes|Minimum verified savings|number|0.01','minimum_saving_days|Minimum saving days|number|1','max_loan_amount_kes|Maximum loan amount|number|0.01','loan_to_savings_ratio|Loan-to-savings ratio|number|0.01','interest_percent|Interest %|number|0.01','processing_fee_percent|Processing fee %|number|0.01','default_term_days|Default term (days)|number|1','grace_days|Grace period (days)|number|1','overdue_penalty_percent|Overdue penalty %|number|0.01'].map(x=>{const [n,l,t,step]=x.split('|');return '<label><span>'+l+'</span><input name="'+n+'" type="'+t+'" min="0" step="'+step+'" required></label>';}).join('')+
 '</div><label class="loan-v1-check"><input name="allow_partial_repayment" type="checkbox"> Allow partial repayments</label><div class="loan-v1-actions"><button type="submit">Save Loan Rules</button><span id="adminLoanSettingsStatus"></span></div></form>'+
 '<div class="loan-v1-admin-columns"><section><div class="section-title compact"><span>LOAN BOOK</span><h4>Active / Historical Loans</h4></div><div id="adminLoanList" class="loan-v1-list"></div></section><section><div class="section-title compact"><span>REPAYMENTS</span><h4>Repayment Verification</h4></div><div id="adminLoanRepaymentList" class="loan-v1-list"></div></section></div>';
 panel.appendChild(module);
 $('#refreshAdminLoans')?.addEventListener('click',loadAll);
 $('#adminLoanSettings')?.addEventListener('submit',saveSettings);
 $('#adminLoanRepaymentList')?.addEventListener('click',reviewRepayment);
}
function patchDashboardLoanMetrics(){
 const host=$('#walletSnapshot');if(!host)return;
 const values={'Active Loans':summary.active_loans??0,'Overdue Loans':summary.overdue_loans??0};
 [...host.querySelectorAll('div')].forEach(row=>{
   const label=row.querySelector('span')?.textContent?.trim();
   if(!(label in values))return;
   const strong=row.querySelector('strong');if(strong)strong.textContent=Number(values[label]||0).toLocaleString('en-KE');
   const small=row.querySelector('small');if(small)small.textContent='';
 });
}
function render(){
 const sum=$('#adminLoanSummary');if(sum)sum.innerHTML=[
  ['Pending applications',summary.pending_applications],['Active loans',summary.active_loans],['Overdue loans',summary.overdue_loans],['Paid loans',summary.paid_loans],
  ['Principal disbursed',money(summary.principal_disbursed_kes)],['Outstanding',money(summary.outstanding_kes)],['Pending repayments',summary.pending_repayments],['Verified repayments',money(summary.verified_repayments_kes)]
 ].map(([l,v])=>'<article><small>'+l+'</small><strong>'+String(v??0)+'</strong></article>').join('');
 const f=$('#adminLoanSettings');if(f){
  Object.entries(settings||{}).forEach(([k,v])=>{const el=f.elements[k];if(!el)return;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v??'';});
 }
 const loanHost=$('#adminLoanList');if(loanHost)loanHost.innerHTML=loans.length?loans.map(l=>'<article class="loan-v1-card '+(l.status==='overdue'?'is-overdue':'')+'"><header><div><b>'+esc(l.loan_reference)+'</b><h5>'+esc(l.customer_name||'Customer')+'</h5><small>'+esc(l.customer_phone||'')+'</small></div><strong>'+pretty(l.status)+'</strong></header><div class="loan-v1-grid"><div><small>Principal</small><b>'+money(l.principal_kes)+'</b></div><div><small>Total due</small><b>'+money(l.total_due_kes)+'</b></div><div><small>Repaid</small><b>'+money(l.amount_repaid_kes)+'</b></div><div><small>Outstanding</small><b>'+money(l.outstanding_kes)+'</b></div><div><small>Due</small><b>'+date(l.due_date)+'</b></div><div><small>Grace until</small><b>'+date(l.grace_until)+'</b></div></div></article>').join(''):'<div class="loan-v1-empty">No approved loans yet.</div>';
 const repayHost=$('#adminLoanRepaymentList');if(repayHost)repayHost.innerHTML=repayments.length?repayments.slice(0,50).map(r=>'<article class="loan-v1-card"><header><div><b>'+esc(r.repayment_reference)+'</b><h5>'+esc(r.customer_name||'Customer')+'</h5><small>'+esc(r.loan_reference||'')+'</small></div><strong>'+money(r.amount_kes)+'</strong></header><div class="loan-v1-grid"><div><small>Payment ref</small><b>'+esc(r.payment_reference)+'</b></div><div><small>Status</small><b>'+pretty(r.payment_status)+'</b></div><div><small>Loan outstanding</small><b>'+money(r.loan_outstanding_kes)+'</b></div></div>'+(r.payment_status==='pending'?'<div class="loan-v1-actions"><button type="button" data-repay-review="'+r.id+'" data-decision="verify">Verify</button><button type="button" class="secondary" data-repay-review="'+r.id+'" data-decision="reject">Reject</button></div>':'')+'</article>').join(''):'<div class="loan-v1-empty">No loan repayment submissions yet.</div>';
 patchDashboardLoanMetrics();
}
async function loadAll(){
 if(busy)return;busy=true;
 try{
  const [a,b,c,d]=await Promise.all([client.rpc('admin_get_wallet_loan_settings'),client.rpc('admin_wallet_loan_summary'),client.rpc('admin_list_wallet_loans'),client.rpc('admin_list_wallet_loan_repayments')]);
  const error=[a,b,c,d].find(x=>x.error)?.error;if(error)throw error;
  settings=a.data||{};summary=b.data||{};loans=Array.isArray(c.data)?c.data:[];repayments=Array.isArray(d.data)?d.data:[];render();
 }catch(e){const h=$('#adminLoanList');if(h)h.innerHTML='<div class="loan-v1-empty error">'+esc(e?.message||'Loan module could not load.')+'</div>';}finally{busy=false;}
}
async function saveSettings(e){
 e.preventDefault();const f=e.currentTarget,st=$('#adminLoanSettingsStatus'),o={};
 new FormData(f).forEach((v,k)=>o[k]=v);
 o.applications_enabled=f.elements.applications_enabled.checked;o.allow_partial_repayment=f.elements.allow_partial_repayment.checked;
 ['minimum_total_saved_kes','minimum_saving_days','max_loan_amount_kes','loan_to_savings_ratio','interest_percent','processing_fee_percent','default_term_days','grace_days','overdue_penalty_percent'].forEach(k=>o[k]=Number(f.elements[k].value));
 st.textContent='Saving…';const {error}=await client.rpc('admin_save_wallet_loan_settings',{p_settings:o});
 st.textContent=error?error.message:'Loan rules saved and audited.';if(!error)await loadAll();
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
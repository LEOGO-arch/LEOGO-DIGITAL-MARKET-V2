(() => {
'use strict';
const client=window.leogoAuth?.client;
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:2});
const date=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(v+'T12:00:00+03:00')):'—';
const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
let overview=null,user=null,loading=false;

function loadStyle(){
 if($('#leogoLoanV1Css'))return;
 const l=document.createElement('link');l.id='leogoLoanV1Css';l.rel='stylesheet';l.href='css/loans.css?v=loan-v1-1';document.head.appendChild(l);
}
function destinationNumber(d){return d?.till_number||d?.paybill_number||d?.account_number||'';}
function setStatus(msg,type=''){
 const el=$('#walletLoanStatus');if(!el)return;el.textContent=msg||'';el.classList.toggle('is-error',type==='error');el.classList.toggle('is-success',type==='success');
}
function reason(e){
 if(!e)return '';
 if(!e.applications_enabled)return 'Loan applications are currently closed while Admin finalizes the lending terms.';
 if(e.has_active_loan)return 'Complete your current loan before applying for another.';
 if(e.has_open_application)return 'You already have a loan application awaiting Admin review.';
 if(!e.wallet_active)return 'Your LEOGO Wallet must be active before you can apply.';
 if(Number(e.total_saved_kes||0)<Number(e.minimum_total_saved_kes||0))return 'Build your verified savings history to at least '+money(e.minimum_total_saved_kes)+'.';
 if(Number(e.saving_days||0)<Number(e.minimum_saving_days||0))return 'You need at least '+Number(e.minimum_saving_days||0)+' verified saving days.';
 return 'Your current verified saving history does not yet meet the loan rules.';
}
function ensureUI(){
 const form=$('#walletLoanPreviewForm');if(!form)return;
 if(!$('#walletLoanTermsPreview')){
   const box=document.createElement('div');box.id='walletLoanTermsPreview';box.className='loan-v1-terms';box.innerHTML='<strong>Loan terms loading…</strong><span>Eligibility and repayment terms are controlled by LEOGO Admin.</span>';
   form.querySelector('.wallet-card-head')?.insertAdjacentElement('afterend',box);
 }
 if(!$('#walletLoanTerm')){
   const purpose=$('#walletLoanPurpose')?.closest('label');
   const label=document.createElement('label');label.innerHTML='<span>Requested repayment period</span><div class="loan-v1-term-row"><input id="walletLoanTerm" type="number" min="1" max="3650" step="1" required><small>days</small></div>';
   purpose?.insertAdjacentElement('beforebegin',label);
 }
 if(!$('#walletLoanPortfolio')){
   const panel=document.createElement('section');panel.id='walletLoanPortfolio';panel.className='loan-v1-customer';panel.innerHTML='<div class="loan-v1-head"><div><span>LOAN ACCOUNT</span><h4>My Loans & Repayments</h4><p>Approved loans are credited to your LEOGO Wallet. Repayments are verified before reducing the outstanding balance.</p></div><button id="refreshWalletLoans" type="button">Refresh</button></div><div id="walletLoanPortfolioBody" class="loan-v1-list"><div class="loan-v1-empty">Sign in to view your loan account.</div></div>';
   form.insertAdjacentElement('afterend',panel);
 }
 if(!form.dataset.loanV1Bound){
   form.dataset.loanV1Bound='1';
   form.addEventListener('submit',submitApplication,true);
 }
 $('#refreshWalletLoans')?.addEventListener('click',()=>load());
 $('#walletLoanPortfolio')?.addEventListener('submit',submitRepayment);
 $('#walletLoanPortfolio')?.addEventListener('click',async e=>{
   const b=e.target.closest('[data-copy-loan-destination]');if(!b)return;
   const number=destinationNumber(overview?.repayment_destination);if(!number)return;
   try{await navigator.clipboard.writeText(number);b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1400);}catch{}
 });
}
function render(){
 const e=overview?.eligibility||{};
 const form=$('#walletLoanPreviewForm'), button=form?.querySelector('button[type="submit"]'), amount=$('#walletLoanAmount'), term=$('#walletLoanTerm');
 const badge=$('#walletLoanEligibility');
 if(badge){
   badge.textContent=e.has_active_loan?'Active loan':e.has_open_application?'Under review':e.eligible?('Eligible up to '+money(e.max_eligible_amount_kes)):e.applications_enabled?'Building eligibility':'Applications closed';
 }
 if(term){term.value=Number(e.default_term_days||30);term.max='3650';}
 if(amount){amount.max=String(Math.max(1,Number(e.max_eligible_amount_kes||1)));}
 if(button){button.disabled=!e.eligible;button.textContent=e.eligible?'Submit Loan Application':'Not Eligible to Apply Yet';}
 const terms=$('#walletLoanTermsPreview');
 if(terms)terms.innerHTML='<div><span>Indicative maximum</span><strong>'+money(e.max_eligible_amount_kes)+'</strong></div><div><span>Interest</span><strong>'+Number(e.interest_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Processing fee</span><strong>'+Number(e.processing_fee_percent||0).toLocaleString('en-KE')+'%</strong></div><div><span>Default term</span><strong>'+Number(e.default_term_days||0)+' days</strong></div><p>'+esc(e.eligible?'You currently meet the configured saving-history rules. Final approval is still required.':reason(e))+'</p>';

 const loans=Array.isArray(overview?.loans)?overview.loans:[];
 const apps=Array.isArray(overview?.applications)?overview.applications:[];
 const repayments=Array.isArray(overview?.repayments)?overview.repayments:[];
 const dest=overview?.repayment_destination||null;
 const host=$('#walletLoanPortfolioBody');if(!host)return;
 let html='';
 const current=loans.find(l=>['active','overdue'].includes(l.status));
 if(current){
   const pct=Math.min(100,Math.max(0,Number(current.repayment_progress_percent||0)));
   const number=destinationNumber(dest);
   html+='<article class="loan-v1-card '+(current.status==='overdue'?'is-overdue':'')+'"><header><div><b>'+esc(current.loan_reference)+'</b><h5>'+pretty(current.status)+'</h5></div><strong>'+money(current.outstanding_kes)+' outstanding</strong></header><div class="loan-v1-progress"><span style="width:'+pct+'%"></span></div><div class="loan-v1-grid"><div><small>Principal</small><b>'+money(current.principal_kes)+'</b></div><div><small>Total due</small><b>'+money(current.total_due_kes)+'</b></div><div><small>Repaid</small><b>'+money(current.amount_repaid_kes)+'</b></div><div><small>Due date</small><b>'+date(current.due_date)+'</b></div><div><small>Grace until</small><b>'+date(current.grace_until)+'</b></div><div><small>Progress</small><b>'+pct+'%</b></div></div>'+
   (number?'<div class="loan-v1-destination"><div><small>Repay to '+esc(dest.display_name||dest.account_type||'LEOGO account')+'</small><strong>'+esc(number)+'</strong><span>'+esc(dest.account_name||dest.business_name||'')+'</span></div><button type="button" data-copy-loan-destination>Copy</button></div>':'<p class="loan-v1-warning">Admin has not assigned the Loan Repayment payment account yet.</p>')+
   '<form class="loan-v1-repay" data-loan-repayment-form="'+esc(current.id)+'"><label><span>Repayment amount</span><input name="amount" type="number" min="1" max="'+Number(current.outstanding_kes||0)+'" step="0.01" required></label><label><span>Payment transaction/reference</span><input name="reference" minlength="6" maxlength="120" required placeholder="Paste M-Pesa / bank reference"></label><button type="submit" '+(number?'':'disabled')+'>Submit Repayment for Verification</button><p class="loan-v1-form-status" aria-live="polite"></p></form></article>';
 }
 const latestApp=apps[0];
 if(latestApp){
   html+='<article class="loan-v1-card"><header><div><b>Latest application</b><h5>'+pretty(latestApp.application_status)+'</h5></div><strong>'+money(latestApp.requested_amount_kes)+'</strong></header><div class="loan-v1-grid"><div><small>Requested term</small><b>'+Number(latestApp.requested_term_days||0)+' days</b></div><div><small>Saved at application</small><b>'+money(latestApp.total_saved_at_application)+'</b></div><div><small>Saving days</small><b>'+Number(latestApp.confirmed_saving_days_at_application||0)+'</b></div></div>'+(latestApp.partner_notes?'<p>'+esc(latestApp.partner_notes)+'</p>':'')+'</article>';
 }
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
   if(user===null){
     const {data}=await client.auth.getSession();user=data?.session?.user||null;
   }
   if(!user){overview=null;render();return;}
   const {data,error}=await client.rpc('get_my_wallet_loan_overview');
   if(error)throw error;
   overview=data||{};render();
 }catch(error){
   const host=$('#walletLoanPortfolioBody');if(host)host.innerHTML='<div class="loan-v1-empty error">'+esc(error?.message||'Loan account could not load.')+'</div>';
 }finally{loading=false;}
}
async function submitApplication(event){
 event.preventDefault();event.stopImmediatePropagation();
 const form=event.currentTarget;
 if(!user||!form.reportValidity())return;
 const e=overview?.eligibility||{};
 if(!e.eligible){setStatus(reason(e),'error');return;}
 const amount=Number($('#walletLoanAmount')?.value||0),purpose=$('#walletLoanPurpose')?.value.trim(),consent=$('#walletLoanConsent')?.checked,term=Number($('#walletLoanTerm')?.value||e.default_term_days||30);
 if(!consent){setStatus('Accept the loan review and repayment conditions before submitting.','error');return;}
 const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
 setStatus('Submitting your loan application with the current eligibility snapshot…');
 const {error}=await client.rpc('submit_wallet_loan_application_v2',{p_requested_amount_kes:amount,p_purpose:purpose,p_consent_accepted:true,p_requested_term_days:term});
 if(error){setStatus(error.message,'error');if(btn)btn.disabled=false;return;}
 form.reset();setStatus('Loan application submitted for Admin review. Approval is not automatic.','success');await load(user);
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
 client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;load(user);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
// Manual verification console; actions record externally completed transactions only.
(() => {
 'use strict';
 const db=window.leogoAdminDb,root=document.getElementById('adminRentPolePole');
 if(!db||!root)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const box=document.createElement('div');box.id='rentAdminWorkflow';root.append(box);
 const note=document.createElement('p');note.setAttribute('role','status');box.before(note);
 const action=async(id,name,payload={})=>{
  const {error}=await db.rpc('rent_admin_action',{p_application:id,p_action:name,p_payload:payload});
  note.textContent=error?'Action failed: '+error.message:'Action recorded. Verify external evidence and audit trail.';
  if(!error)await load();
 };
 const load=async()=>{
  const {data:apps,error}=await db.from('rent_installment_applications').select('id,full_name,estate,status,landlord_name,landlord_account,verified_account_snapshot,landlord_verified_at,customer_accepted_at,plan_starts_on,monthly_rent,deposit_amount,payment_frequency').order('created_at',{ascending:false}).limit(80);
  if(error){note.textContent='Workflow unavailable: '+error.message;return;}
  const ids=apps.map(a=>a.id);if(!ids.length){box.textContent='No applications yet.';return;}
  const [requests,claims,settlements,advances,verified]=await Promise.all([
   db.from('rent_change_requests').select('id,application_id,status,reason,proposed_county,proposed_sub_county,proposed_estate,proposed_map_pin,proposed_landlord_name,proposed_landlord_account').in('application_id',ids).eq('status','pending'),
   db.from('rent_payment_claims').select('id,application_id,amount,provider,transaction_reference,paid_on,status').in('application_id',ids).eq('status','submitted'),
   db.from('rent_landlord_settlements').select('application_id,amount').in('application_id',ids),
   db.from('rent_advance_simulations').select('application_id,simulated_advance,created_at,status').in('application_id',ids),
   db.from('rent_payment_claims').select('application_id,amount,verified_at').in('application_id',ids).eq('status','verified')
  ]);
  if([requests,claims,settlements,advances,verified].some(r=>r.error)){note.textContent='Cannot read rent workflow or staging simulation records. Check admin permissions.';return;}
  box.innerHTML=apps.map(a=>{
   const req=(requests.data||[]).filter(r=>r.application_id===a.id);
   const receipts=(claims.data||[]).filter(c=>c.application_id===a.id);
   const paidOut=(settlements.data||[]).filter(s=>s.application_id===a.id).reduce((n,s)=>n+Number(s.amount),0);
   const advance=(advances.data||[]).find(s=>s.application_id===a.id);
   const pastVerified=(verified.data||[]).filter(s=>s.application_id===a.id);
   const sinceAdvance=advance?pastVerified.filter(s=>s.verified_at&&new Date(s.verified_at)>new Date(advance.created_at)).reduce((n,s)=>n+Number(s.amount),0):0;
   const advanceOutstanding=advance?Math.max(0,Number(advance.simulated_advance)-sinceAdvance):0;
   return `<details class="rent-application-item" data-app="${esc(a.id)}"><summary><strong>${esc(a.full_name)} • ${esc(a.estate)}</strong> • ${esc(a.status)} • ${esc(a.payment_frequency)}</summary>
    <p>Rent KSh ${Number(a.monthly_rent).toLocaleString('en-KE')} per month; deposit KSh ${Number(a.deposit_amount).toLocaleString('en-KE')}. Confirmed external payouts: KSh ${paidOut.toLocaleString('en-KE')}.</p>
    <p>Landlord: ${esc(a.landlord_name||'Not verified')} • Destination: ${esc(a.landlord_account||'Not provided')} • ${a.landlord_verified_at?'Verified':'UNVERIFIED'}. Customer acceptance: ${a.customer_accepted_at?'Yes':'No'}.</p>
    <section class="rent-application-item"><strong>Rent Advance — STAGING SIMULATION ONLY</strong><p>No advance is paid to a landlord, and no legal debt is created by this record.</p>
    ${advance?`<p>Simulated advance: KSh ${Number(advance.simulated_advance).toLocaleString('en-KE')} • Simulated balance: <strong>−KSh ${advanceOutstanding.toLocaleString('en-KE')}</strong> • Verified instalments after simulation: KSh ${sinceAdvance.toLocaleString('en-KE')}.</p>`:
      a.status==='active'&&a.landlord_verified_at&&a.customer_accepted_at&&pastVerified.length>=2?`<form data-action="simulate_advance"><label>Simulated advance (KSh; maximum one month's rent)<input name="amount" type="number" min="0.01" max="${Number(a.monthly_rent)}" step="0.01" required></label><label>Verified loyalty/history assessment<textarea name="note" minlength="15" maxlength="1000" required></textarea></label><button type="submit">Approve staging-only simulation</button></form>`:`<p>Unavailable until the plan is active, landlord verified, terms accepted, and at least two receipts independently verified (${pastVerified.length} verified).</p>`}</section>
    ${req.map(r=>`<div class="rent-application-item"><b>Amendment request</b><p>${esc(r.reason)}</p><p>${['proposed_county','proposed_sub_county','proposed_estate','proposed_map_pin','proposed_landlord_name','proposed_landlord_account'].filter(k=>r[k]).map(k=>`${esc(k.replace('proposed_',''))}: ${esc(r[k])}`).join(' • ')}</p><button data-action="apply_change" data-request="${esc(r.id)}">Apply and require reverification</button><button data-action="reject_change" data-request="${esc(r.id)}">Reject change</button></div>`).join('')}
    ${a.status==='under_review'||a.status==='suspended'?`<form data-action="verify_landlord"><h4>Verify landlord and exact payment destination</h4><label>Verified landlord name<input name="landlord_name" required minlength="2" value="${esc(a.landlord_name||'')}"></label><label>Verified payment destination<input name="account" required minlength="5" value="${esc(a.landlord_account||'')}"></label><button type="submit">Record verification</button></form>`:''}
    ${a.status==='under_review'&&a.landlord_verified_at?`<form data-action="approve"><label>First due date<input type="date" name="starts_on" required></label><button type="submit">Issue 12-month instalment schedule</button></form>`:''}
    ${a.status==='verified'?`<button data-action="activate" ${a.customer_accepted_at?'':'disabled'}>Activate customer-accepted plan</button>`:''}
    ${receipts.map(c=>`<div class="rent-application-item"><p>Unverified claim: ${esc(c.provider)} ${esc(c.transaction_reference)} • KSh ${Number(c.amount).toLocaleString('en-KE')} • ${esc(c.paid_on)}</p><button data-action="verify_payment" data-claim="${esc(c.id)}">External payment reconciled — verify</button><button data-action="reject_payment" data-claim="${esc(c.id)}">Reject claim</button></div>`).join('')}
    ${a.status==='active'?`<form data-action="settle"><h4>Record a completed external landlord payout</h4><p>Confirm the verified destination: ${esc(a.verified_account_snapshot)}. This does not transfer funds.</p><label>Amount (KSh)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>External payout reference<input name="external_reference" minlength="5" required></label><label>Payout date<input name="settled_on" type="date" required></label><button type="submit" ${req.length?'disabled':''}>Record completed settlement</button></form>`:''}
    ${['submitted','needs_information'].includes(a.status)?'<button data-action="review">Start review</button>':''}
    ${['submitted','under_review','needs_information','verified'].includes(a.status)?'<button data-action="reject">Reject application</button>':''}
    ${['active','verified'].includes(a.status)?'<button data-action="suspend">Suspend plan</button>':''}</details>`;
  }).join('');
 };
 box.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-action]');if(!form)return;e.preventDefault();
  const id=form.closest('[data-app]').dataset.app,name=form.dataset.action;
  const values=Object.fromEntries(new FormData(form));
  if(!confirm(`Confirm ${name.replaceAll('_',' ')} for this application?`))return;
  if(name==='simulate_advance'){
   const {error}=await db.rpc('rent_admin_simulate_advance',{p_application:id,p_amount:Number(values.amount),p_note:values.note});
   note.textContent=error?'Simulation failed: '+error.message:'Staging-only simulation recorded; no money has been transferred.';
   if(!error)await load();
  }else await action(id,name,values);
 });
 box.addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-action]');if(!btn)return;
  const id=btn.closest('[data-app]').dataset.app,name=btn.dataset.action;
  if(!confirm(`Confirm ${name.replaceAll('_',' ')}? For payment verification and settlement, evidence MUST already be checked with the PSP/bank.`))return;
  await action(id,name,{request_id:btn.dataset.request,claim_id:btn.dataset.claim});
 });
 document.getElementById('rentAdminRefresh')?.addEventListener('click',load);
 document.querySelector('[data-admin-view="wallet"]')?.addEventListener('click',load);
 load();
})();

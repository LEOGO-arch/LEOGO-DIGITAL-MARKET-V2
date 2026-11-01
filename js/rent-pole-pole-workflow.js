// Customer actions never mark money received or transfer money.
(() => {
 'use strict';
 const db=window.leogoAuth?.client;
 if(!db)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const host=document.getElementById('walletTabRent');
 if(!host)return;
 const content=document.createElement('section');content.id='rentWorkflowDetails';host.append(content);
 const notice=document.createElement('p');notice.setAttribute('role','status');content.before(notice);
 const destinationIsUsable=d=>d?.account_type==='mpesa_till'&&/^\d{5,12}$/.test(d.till_number||'')
  ||d?.account_type==='mpesa_paybill'&&/^\d{5,12}$/.test(d.paybill_number||'')&&!!d.account_number;
 const show=async()=>{
  const user=(await db.auth.getUser()).data?.user;
  if(!user){content.textContent='Sign in to view rent plans.';return;}
  const {data:apps,error}=await db.from('rent_installment_applications').select('id,estate,county,sub_county,landlord_account,landlord_name,status,monthly_rent,payment_frequency,customer_accepted_at,plan_starts_on').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(20);
  if(error){content.textContent='Plan details are unavailable until the workflow database update is deployed.';return;}
  const ids=apps.map(a=>a.id);
  if(!ids.length){content.innerHTML='';return;}
  const payment=window.leogoPayments;
  const paymentResult=payment?.getDestination ? await payment.getDestination('marketplace_orders',{force:true}) : {data:null,error:new Error('Payment instructions unavailable')};
  const paymentDestination=paymentResult.error?null:paymentResult.data;
  const canPay=destinationIsUsable(paymentDestination);
  const provider=paymentDestination?.account_type==='mpesa_paybill'?'M-Pesa Paybill':'M-Pesa Till';
  const [schedule,claims,changes,settlements,advances]=await Promise.all([
   db.from('rent_payment_schedule').select('id,application_id,category,due_on,amount').in('application_id',ids).order('due_on'),
   db.from('rent_payment_claims').select('application_id,schedule_id,amount,status,transaction_reference,verified_at').in('application_id',ids),
   db.from('rent_change_requests').select('application_id,status,reason,created_at').in('application_id',ids).order('created_at',{ascending:false}),
   db.from('rent_landlord_settlements').select('application_id,amount,settled_on').in('application_id',ids),
   db.from('rent_advance_simulations').select('application_id,simulated_advance,created_at,status').in('application_id',ids)
  ]);
  if([schedule,claims,changes,settlements,advances].some(r=>r.error)){content.textContent='Plan or staging-simulation records are temporarily unavailable.';return;}
  content.innerHTML=apps.map(a=>{
   const entries=(schedule.data||[]).filter(s=>s.application_id===a.id);
   const paid=(claims.data||[]).filter(c=>c.application_id===a.id);
   const released=(settlements.data||[]).filter(s=>s.application_id===a.id).reduce((n,s)=>n+Number(s.amount),0);
   const pending=(changes.data||[]).some(r=>r.application_id===a.id&&r.status==='pending');
   const advance=(advances.data||[]).find(x=>x.application_id===a.id);
   const recovered=advance?paid.filter(x=>x.status==='verified'&&x.verified_at&&new Date(x.verified_at)>new Date(advance.created_at)).reduce((n,x)=>n+Number(x.amount),0):0;
   const negative=advance?Math.max(0,Number(advance.simulated_advance)-recovered):0;
   return `<article class="rent-application-item" data-rent-app="${esc(a.id)}"><h4>${esc(a.estate)} • ${esc(a.status.replaceAll('_',' '))}</h4>
    ${advance?`<div class="rent-application-item"><strong>Rent Advance — staging simulation only</strong><p>Simulated outstanding balance: <strong>−KSh ${negative.toLocaleString('en-KE')}</strong> ${negative===0?'• Cleared':''}</p><small>Simulated advance KSh ${Number(advance.simulated_advance).toLocaleString('en-KE')}; verified later instalments KSh ${recovered.toLocaleString('en-KE')}. This is not a real loan, payment to landlord, or savings-wallet deduction.</small></div>`:''}
    <p>Monthly rent: KSh ${Number(a.monthly_rent).toLocaleString('en-KE')} • ${esc(a.payment_frequency)}. Landlord payouts confirmed: KSh ${released.toLocaleString('en-KE')}.</p>
    <p>${pending?'A change request awaits review. Further settlement is paused.':'Only LEOGO-admin-verified payment receipts count toward your schedule.'}</p>
    ${a.status==='active'?`<div class="rent-payment-destination"><strong>Pay LEOGO for rent instalments</strong><p>Use the same Admin-assigned LEOGO payment account as ordinary marketplace orders. Never send an instalment to an unverified landlord account.</p><div data-rent-payment-guide="${esc(a.id)}"></div>${canPay?'':'<p role="status">No LEOGO Till/Paybill is currently assigned. Payment reference submission is unavailable; contact LEOGO Admin.</p>'}</div>`:''}
    ${a.status==='verified'?`<button type="button" data-rent-accept="${esc(a.id)}" ${a.customer_accepted_at?'disabled':''}>${a.customer_accepted_at?'Terms accepted; awaiting activation':'Accept approved 12-month schedule'}</button>`:''}
    <details><summary>Payment schedule and receipts</summary>${entries.length?entries.map(s=>{
     const verified=paid.filter(c=>c.schedule_id===s.id&&c.status==='verified').reduce((n,c)=>n+Number(c.amount),0);
     return `<div class="rent-application-item"><strong>${esc(s.category)} • ${esc(s.due_on)} • KSh ${Number(s.amount).toLocaleString('en-KE')}</strong><span>Verified: KSh ${verified.toLocaleString('en-KE')}</span>
      ${a.status==='active'&&canPay&&Number(s.amount)>verified?`<form data-rent-claim="${esc(a.id)}"><input type="hidden" name="schedule_id" value="${esc(s.id)}"><input type="hidden" name="provider" value="${esc(provider)}"><label>M-Pesa confirmation message / transaction reference<input name="transaction_reference" required minlength="8" maxlength="120" placeholder="Paste the genuine M-Pesa reference"></label><label>Amount paid (KSh)<input name="amount" type="number" min="0.01" step="0.01" max="${Number(s.amount)-verified}" required></label><label>Payment date<input name="paid_on" type="date" required></label><button type="submit">Submit M-Pesa payment for verification</button></form>`:''}
      ${paid.filter(c=>c.schedule_id===s.id).map(c=>`<small>${esc(c.transaction_reference)}: ${esc(c.status)}</small>`).join('')}</div>`;
    }).join(''):'Not yet approved.'}</details>
    <details><summary>Request location or landlord detail changes</summary><form data-rent-change="${esc(a.id)}"><p>Enter only fields to change. The landlord must be reverified before settlement resumes.</p>
    <label>County<input name="proposed_county" maxlength="100" placeholder="${esc(a.county)}"></label><label>Sub-county<input name="proposed_sub_county" maxlength="100" placeholder="${esc(a.sub_county)}"></label>
    <label>Estate<input name="proposed_estate" maxlength="150" placeholder="${esc(a.estate)}"></label><label>Location pin<input name="proposed_map_pin" maxlength="400"></label>
    <label>Landlord name<input name="proposed_landlord_name" maxlength="150" placeholder="${esc(a.landlord_name||'')}"></label><label>Landlord payment account<input name="proposed_landlord_account" maxlength="180" placeholder="${esc(a.landlord_account||'')}"></label>
    <label>Reason<input name="reason" required minlength="5" maxlength="1000"></label><button type="submit" ${pending?'disabled':''}>${pending?'Change pending':'Request change'}</button></form></details></article>`;
  }).join('');
  if(canPay)content.querySelectorAll('[data-rent-payment-guide]').forEach(el=>payment.renderInstructions(el,paymentDestination,'LEOGO Rent Instalment Payment Instructions'));
 };
 content.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-rent-accept]');if(!btn)return;
  if(!confirm('Accept the approved schedule and terms displayed for this application?'))return;
  btn.disabled=true;const {error}=await db.rpc('rent_accept_terms',{p_application:btn.dataset.rentAccept});
  notice.textContent=error?error.message:'Terms accepted; LEOGO Admin can now activate the plan.';await show();
 });
 content.addEventListener('submit',async e=>{
  const form=e.target.closest('[data-rent-change],[data-rent-claim]');if(!form)return;e.preventDefault();
  const fd=new FormData(form),claim=form.hasAttribute('data-rent-claim');
  if(claim){const result=await window.leogoPayments?.getDestination('marketplace_orders',{force:true});if(!destinationIsUsable(result?.data)){notice.textContent='LEOGO payment details are unavailable. Do not submit a payment reference.';return;}}
  const record=Object.fromEntries([...fd.entries()].filter(([k,v])=>String(v).trim()).map(([k,v])=>[k,String(v).trim()]));
  const app=form.dataset.rentChange||form.dataset.rentClaim;
  record.application_id=app;
  if(claim)record.amount=Number(record.amount);
  const {data:{user}}=await db.auth.getUser();if(!user){notice.textContent='Sign in first.';return;}
  record.customer_id=user.id;const button=form.querySelector('[type=submit]');button.disabled=true;
  const {error}=await db.from(claim?'rent_payment_claims':'rent_change_requests').insert(record);
  notice.textContent=error?error.message:claim?'Receipt submitted for independent payment verification.':'Change requested; LEOGO will reverify the details.';
  if(!error)await show();else button.disabled=false;
 });
 document.querySelector('[data-wallet-tab="rent"]')?.addEventListener('click',show);
 document.addEventListener('leogo:authchange',show);
 show();
})();

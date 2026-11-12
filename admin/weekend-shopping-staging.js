// LEOGO Weekend Shopping Admin staging queue; separate from production Admin auth.
(()=>{
 'use strict';
 const url='https://uxikemfrzqatsbqutida.supabase.co';
 const key='sb_publishable_4eMZCkb3NOGEtR664VOpXQ_IkWgDRM1';
 const db=window.supabase?.createClient?.(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'leogo-weekend-admin-staging-auth-v1'}});
 if(!db)return;
 const html=(v)=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const section=document.createElement('section');section.id='weekendAdminStaging';
 section.style.cssText='background:#fff;border:1px solid #d5dfed;border-radius:16px;margin:20px;padding:22px;max-width:1050px;color:#09213e';
 section.innerHTML=`<h2>Weekend Shopping — Staging Review</h2>
 <p>Test payment references only. Approvals increase a dedicated staging ledger, not a real wallet balance.</p>
 <div id="weekendAdminLogin">
 <label>Staging Admin email <input type="email" id="weekendAdminEmail" autocomplete="username"></label>
 <label>Staging password <input type="password" id="weekendAdminPassword" autocomplete="current-password"></label>
 <button type="button" id="weekendAdminSignIn">Sign in to staging</button>
 <button type="button" id="weekendAdminSignOut">Sign out</button></div>
 <p id="weekendAdminNotice" role="status" aria-live="polite"></p>
 <button type="button" id="weekendAdminRefresh">Refresh pending payments</button>
 <div id="weekendAdminRows"></div><h3>Weekend Shopping financial reconciliation</h3><p id="weekendAdminSummary">Sign in to see reconciliation totals.</p><h3>Funded Weekend Shopping cycles</h3><button type="button" id="weekendAdminReadyRefresh">Refresh funded cycles</button><div id="weekendAdminReadyRows"></div><h3>Cancellation refunds</h3><button type="button" id="weekendRefundRefresh">Refresh refunds</button><div id="weekendRefundRows"></div>`;
 document.querySelector('main')?.append(section);
 const $=id=>document.getElementById(id),say=t=>{$('weekendAdminNotice').textContent=t;};
 const load=async()=>{
   const {data,error}=await db.rpc('admin_list_weekend_payments');
   if(error){say(error.message);return;}
   if(!Array.isArray(data)||!data.length){$('weekendAdminRows').innerHTML='<p>No pending Weekend Shopping references, or this login has no Admin permissions.</p>';return;}
   $('weekendAdminRows').innerHTML=data.map(p=>`<article style="padding:14px;margin:10px 0;border:1px solid #d5dfed;border-radius:12px">
   <strong>Reference: ${html(p.reference)}</strong>
   <p>Claimed: KSh ${html(p.amount_kes)} · Cycle: ${html(p.cycle_id)}<br>
   Target: KSh ${html(p.target_kes)} · Verified: KSh ${html(p.verified_kes)}<br>
   Delivery date: ${html(p.delivery_date)} · ${html(p.cadence)}</p>
   <button type="button" data-weekend-evidence="${html(p.payment_id)}">Record matched receipt evidence</button><button type="button" data-weekend-verify="${html(p.payment_id)}" data-approved="true">Second reviewer: approve payment</button>
   <button type="button" data-weekend-verify="${html(p.payment_id)}" data-approved="false">Reject reference</button>
   </article>`).join('');
 };

 const loadSummary=async()=>{
   const {data,error}=await db.rpc('admin_weekend_shopping_reconciliation');
   if(error){say(error.message);return;}
   if(!data){$('weekendAdminSummary').textContent='An authorized LEOGO staging Admin login is required.';return;}
   $('weekendAdminSummary').textContent='Cycles: '+data.total_cycles+' · Verified savings: KSh '+data.verified_funding_kes+' · Pending claims: KSh '+data.pending_payment_claims_kes+' · Release-ready: '+data.release_ready_cycles+' · Released marketplace orders: '+data.released_cycles+' · Seller subtotals: KSh '+data.released_seller_subtotals_kes;
 };
 const loadRefunds=async()=>{
   const {data,error}=await db.rpc('admin_list_weekend_refunds');
   if(error){say(error.message);return;}
   $('weekendRefundRows').innerHTML=(data||[]).map(r=>'<article><p>KSh '+html(r.amount_kes)+' · '+html(r.status)+' · '+html(r.reason)+'</p>'+(r.status==='requested'?'<button data-refund="'+html(r.id)+'" data-action="approve">Approve refund</button>':r.status==='approved'?'<button data-refund="'+html(r.id)+'" data-action="complete">Record completed refund</button>':'')+'</article>').join('')||'<p>No refund requests.</p>';
 };
 $('weekendRefundRefresh').addEventListener('click',()=>void loadRefunds());
 $('weekendRefundRows').addEventListener('click',async e=>{
   const b=e.target.closest('[data-refund]');if(!b)return;
   const action=b.dataset.action;
   if(!confirm('This records a staging decision only. It does not transfer money. Continue?'))return;
   const ref=action==='complete'?prompt('Actual refund transaction reference (staging test only)'):null;
   const evidence=action==='complete'?prompt('Independent refund receipt evidence locator'):null;
   if(action==='complete'&&(!ref||!evidence))return;
   const {error}=await db.rpc('admin_review_weekend_refund',{p_refund_id:b.dataset.refund,p_action:action,p_reference:ref,p_evidence_locator:evidence});
   say(error?error.message:'Refund record updated.');await loadRefunds();
 });
 const loadReady=async()=>{
   const {data,error}=await db.rpc('admin_list_weekend_ready');
   if(error){say(error.message);return;}
   if(!Array.isArray(data)||!data.length){$('weekendAdminReadyRows').innerHTML='<p>No funded Weekend Shopping cycles requiring release.</p>';return;}
   $('weekendAdminReadyRows').innerHTML=data.map(c=>'<article style="padding:14px;border:1px solid #d5dfed;margin:10px 0;border-radius:12px"><strong>'+html(c.customer)+'</strong><p>Delivery: '+html(c.delivery_date)+' · '+html(c.county)+' / '+html(c.delivery_zone)+'</p><p>Verified savings: KSh '+html(c.verified_paid_kes)+' / '+html(c.amount_due_kes)+'</p><p>Status: '+html(c.status)+'</p><button type="button" data-prep="'+html(c.cycle_id)+'">Plan advance preparation</button>'+(c.status==='funded'?'<button type="button" data-weekend-ready="'+html(c.cycle_id)+'">Authorize customer order release</button>':'Awaiting customer order creation')+'</article>').join('');
 };
 $('weekendAdminReadyRefresh').addEventListener('click',()=>void loadReady());
 $('weekendAdminReadyRows').addEventListener('click',async(e)=>{
  const prep=e.target.closest('[data-prep]');
  if(prep){
   const date=prompt('Preparation date YYYY-MM-DD');if(!date)return;
   const notes=prompt('Seller stock and delivery preparation notes');if(!notes)return;
   const checked=confirm('Have the preparation arrangements been checked? Cancel records as planned only.');
   const {error}=await db.rpc('admin_plan_weekend_preparation',{p_cycle_id:prep.dataset.prep,p_preparation_date:date,p_checked:checked,p_notes:notes});
   say(error?error.message:'Preparation record saved. No order dispatched.');await loadReady();return;
  }
  const btn=e.target.closest('[data-weekend-ready]');if(!btn)return;
  if(!confirm('Authorize release only after independently reconciling every installment and confirming the delivery date has arrived. Continue?'))return;
  btn.disabled=true;
  const {error}=await db.rpc('admin_mark_weekend_release_ready',{p_cycle_id:btn.dataset.weekendReady});
  say(error?error.message:'Released for customer checkout into existing Marketplace order processing.');
  await loadReady();await loadSummary();
  btn.disabled=false;
 });
 $('weekendAdminSignIn').addEventListener('click',async()=>{
   const {error}=await db.auth.signInWithPassword({email:$('weekendAdminEmail').value.trim(),password:$('weekendAdminPassword').value});
   $('weekendAdminPassword').value='';say(error?error.message:'Staging sign-in succeeded.');if(!error){await load();await loadReady();await loadSummary();await loadRefunds();}
 });
 $('weekendAdminSignOut').addEventListener('click',async()=>{await db.auth.signOut();$('weekendAdminRows').replaceChildren();$('weekendAdminReadyRows').replaceChildren();$('weekendRefundRows').replaceChildren();$('weekendAdminSummary').textContent='Sign in to see reconciliation totals.';say('Signed out of staging.');});
 $('weekendAdminRefresh').addEventListener('click',()=>{void load();void loadReady();void loadSummary();});
 $('weekendAdminRows').addEventListener('click',async(e)=>{
   const evidenceButton=e.target.closest('[data-weekend-evidence]');
   if(evidenceButton){
     const account=prompt('Assigned Weekend Shopping receiving account UUID');if(!account)return;
     const reference=prompt('Matched provider transaction reference');if(!reference)return;
     const amount=prompt('Amount independently received in KSh');if(!amount)return;
     const received=prompt('Receipt timestamp ISO format, e.g. 2026-11-12T08:00:00+03:00');if(!received)return;
     const locator=prompt('Independent statement or receipt evidence locator');if(!locator)return;
     const {error}=await db.rpc('admin_record_weekend_payment_evidence',{p_payment_id:evidenceButton.dataset.weekendEvidence,p_account_id:account,p_provider_reference:reference,p_received_amount:Number(amount),p_received_at:received,p_evidence_locator:locator});
     say(error?error.message:'Evidence recorded. A different authorized finance reviewer must approve.');return;
   }
   const button=e.target.closest('[data-weekend-verify]');if(!button)return;
   const approved=button.dataset.approved==='true';
   if(approved&&!confirm('Have you independently verified this transaction with the staging payment records? Do not approve from a customer-provided reference alone.'))return;
   button.disabled=true;
   const {error}=await db.rpc('admin_review_weekend_payment',{p_payment_id:button.dataset.weekendVerify,p_approve:approved});
   say(error?error.message:(approved?'Staging reference verified.':'Reference rejected.'));await load();await loadSummary();await loadReady();button.disabled=false;
 });
 db.auth.getSession().then(({data})=>{if(data?.session){void load();void loadReady();void loadSummary();}});
})();

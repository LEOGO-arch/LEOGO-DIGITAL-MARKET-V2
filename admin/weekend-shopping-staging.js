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
 <div id="weekendAdminRows"></div><h3>Funded Weekend Shopping cycles</h3><button type="button" id="weekendAdminReadyRefresh">Refresh funded cycles</button><div id="weekendAdminReadyRows"></div>`;
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
   <button type="button" data-weekend-verify="${html(p.payment_id)}" data-approved="true">Verify matching payment</button>
   <button type="button" data-weekend-verify="${html(p.payment_id)}" data-approved="false">Reject reference</button>
   </article>`).join('');
 };

 const loadReady=async()=>{
   const {data,error}=await db.rpc('admin_list_weekend_ready');
   if(error){say(error.message);return;}
   if(!Array.isArray(data)||!data.length){$('weekendAdminReadyRows').innerHTML='<p>No funded Weekend Shopping cycles requiring release.</p>';return;}
   $('weekendAdminReadyRows').innerHTML=data.map(c=>'<article style="padding:14px;border:1px solid #d5dfed;margin:10px 0;border-radius:12px"><strong>'+html(c.customer)+'</strong><p>Delivery: '+html(c.delivery_date)+' · '+html(c.county)+' / '+html(c.delivery_zone)+'</p><p>Verified savings: KSh '+html(c.verified_paid_kes)+' / '+html(c.amount_due_kes)+'</p><p>Status: '+html(c.status)+'</p>'+(c.status==='funded'?'<button type="button" data-weekend-ready="'+html(c.cycle_id)+'">Authorize customer order release</button>':'Awaiting customer order creation')+'</article>').join('');
 };
 $('weekendAdminReadyRefresh').addEventListener('click',()=>void loadReady());
 $('weekendAdminReadyRows').addEventListener('click',async(e)=>{
  const btn=e.target.closest('[data-weekend-ready]');if(!btn)return;
  if(!confirm('Authorize release only after independently reconciling every installment and confirming the delivery date has arrived. Continue?'))return;
  btn.disabled=true;
  const {error}=await db.rpc('admin_mark_weekend_release_ready',{p_cycle_id:btn.dataset.weekendReady});
  say(error?error.message:'Released for customer checkout into existing Marketplace order processing.');
  await loadReady();
  btn.disabled=false;
 });
 $('weekendAdminSignIn').addEventListener('click',async()=>{
   const {error}=await db.auth.signInWithPassword({email:$('weekendAdminEmail').value.trim(),password:$('weekendAdminPassword').value});
   $('weekendAdminPassword').value='';say(error?error.message:'Staging sign-in succeeded.');if(!error){await load();await loadReady();}
 });
 $('weekendAdminSignOut').addEventListener('click',async()=>{await db.auth.signOut();$('weekendAdminRows').replaceChildren();say('Signed out of staging.');});
 $('weekendAdminRefresh').addEventListener('click',()=>{void load();void loadReady();});
 $('weekendAdminRows').addEventListener('click',async(e)=>{
   const button=e.target.closest('[data-weekend-verify]');if(!button)return;
   const approved=button.dataset.approved==='true';
   if(approved&&!confirm('Have you independently verified this transaction with the staging payment records? Do not approve from a customer-provided reference alone.'))return;
   button.disabled=true;
   const {error}=await db.rpc('admin_review_weekend_payment',{p_payment_id:button.dataset.weekendVerify,p_approve:approved});
   say(error?error.message:(approved?'Staging reference verified.':'Reference rejected.'));await load();button.disabled=false;
 });
 db.auth.getSession().then(({data})=>{if(data?.session){void load();void loadReady();}});
})();

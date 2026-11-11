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
 <div id="weekendAdminRows"></div>`;
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
 $('weekendAdminSignIn').addEventListener('click',async()=>{
   const {error}=await db.auth.signInWithPassword({email:$('weekendAdminEmail').value.trim(),password:$('weekendAdminPassword').value});
   $('weekendAdminPassword').value='';say(error?error.message:'Staging sign-in succeeded.');if(!error)await load();
 });
 $('weekendAdminSignOut').addEventListener('click',async()=>{await db.auth.signOut();$('weekendAdminRows').replaceChildren();say('Signed out of staging.');});
 $('weekendAdminRefresh').addEventListener('click',()=>void load());
 $('weekendAdminRows').addEventListener('click',async(e)=>{
   const button=e.target.closest('[data-weekend-verify]');if(!button)return;
   const approved=button.dataset.approved==='true';
   if(approved&&!confirm('Have you independently verified this transaction with the staging payment records? Do not approve from a customer-provided reference alone.'))return;
   button.disabled=true;
   const {error}=await db.rpc('admin_review_weekend_payment',{p_payment_id:button.dataset.weekendVerify,p_approve:approved});
   say(error?error.message:(approved?'Staging reference verified.':'Reference rejected.'));await load();button.disabled=false;
 });
 db.auth.getSession().then(({data})=>{if(data?.session)void load();});
})();

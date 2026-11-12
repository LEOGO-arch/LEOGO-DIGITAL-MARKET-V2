// Staging-only Weekend Shopping interface. Not wired to production checkout.
// This module uses a separate staging Supabase session and cannot submit a live payment.
(() => {
  'use strict';
  const STAGING_URL='https://uxikemfrzqatsbqutida.supabase.co';
  const STAGING_KEY='sb_publishable_4eMZCkb3NOGEtR664VOpXQ_IkWgDRM1';
  const client=window.supabase?.createClient?.(STAGING_URL,STAGING_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
      storageKey:'leogo-weekend-staging-auth-v1'}
  });
  const shell=document.getElementById('cartShellItems');
  if(!shell||!client)return;
  const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(n)=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const box=document.createElement('section');
  box.id='weekendShoppingStage';
  box.className='weekend-stage';
  box.innerHTML=`
    <div class="weekend-head"><strong>🛍️ Weekend Shopping</strong><span>STAGING ONLY</span></div>
    <p>Save towards a selected shopping date. Submitted references are not credited until verified by Admin.</p>
    <button type="button" id="weekendStageToggle" class="weekend-action">Add cart to Weekend Shopping</button>
    <div id="weekendStageForm" hidden>
      <label>Delivery date <input id="weekendStageDate" type="date" required></label>
      <label>Schedule <select id="weekendStageCadence"><option value="once">One-time order</option><option value="weekly">Repeat every week</option></select></label>
      <label>Receiver name <input id="weekendStageReceiver" required></label><label>Contact phone <input id="weekendStagePhone" type="tel" required></label><label>Delivery zone <select id="weekendStageZone"><option value="cbd">CBD</option><option value="estate">Estate</option><option value="outside">Outside town</option></select></label><label>County <input id="weekendStageCounty" required></label><label>Sub-county <input id="weekendStageSubCounty"></label><label>Estate <input id="weekendStageEstate"></label><label>Landmark <input id="weekendStageLandmark"></label><p class="weekend-hint">Server-calculated delivery and service fees. No automatic payment.</p>
      <button type="button" id="weekendStageCreate" class="weekend-action">Save Weekend Shopping plan</button>
    </div>
    <div id="weekendStageLogin" hidden>
      <label>Staging email <input id="weekendStageEmail" type="email" autocomplete="username"></label>
      <label>Staging password <input id="weekendStagePassword" type="password" autocomplete="current-password"></label>
      <button type="button" id="weekendStageSignIn" class="weekend-action">Sign in to staging</button>
      <button type="button" id="weekendStageSignOut">Sign out of staging</button>
    </div>
    <p role="status" id="weekendStageNotice" aria-live="polite"></p>
    <div id="weekendStageReminders"></div><div id="weekendStagePlans"></div>`;
  const styles=document.createElement('style');
  styles.textContent=`
  .weekend-stage{padding:18px;margin:18px 0;border:1px solid #e3e8ef;border-radius:16px;background:#f8fafc;color:#0a2345}
  .weekend-stage .weekend-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
  .weekend-stage .weekend-head span{font-size:11px;font-weight:800;color:#ab5700}
  .weekend-stage p{line-height:1.5;margin:8px 0}
  .weekend-stage label{display:block;font-weight:600;margin:12px 0}
  .weekend-stage input,.weekend-stage select{display:block;width:100%;max-width:350px;padding:10px;border:1px solid #ccd4df;border-radius:8px;margin-top:5px}
  .weekend-stage .weekend-action{background:#ff8100;border:0;border-radius:9px;color:white;padding:10px 15px;font-weight:800;cursor:pointer}
  .weekend-stage button{margin:6px 6px 6px 0;cursor:pointer}
  .weekend-stage .weekend-hint{font-size:12px;color:#52606f}
  .weekend-stage .weekend-cycle{border-top:1px solid #dce2eb;padding:12px 0}
  `;
  document.head.append(styles);
  shell.insertAdjacentElement('afterend',box);
  const $=(id)=>document.getElementById(id);
  const note=(s)=>{$('weekendStageNotice').textContent=s;};
  const open=()=>{$('weekendStageForm').hidden=false;$('weekendStageLogin').hidden=false;};
  $('weekendStageToggle').addEventListener('click',()=>{open();void load();});
  $('weekendStageDate').min=new Date(Date.now()+86400000).toISOString().slice(0,10);

  const session=async()=>{const {data}=await client.auth.getSession();return data?.session||null;};
  const cartItems=()=>{
    let cart=[];try{cart=JSON.parse(localStorage.getItem('leogo_marketplace_cart_v1')||'[]');}catch{}
    if(!Array.isArray(cart))return [];
    if(cart.some(i=>i?.sourceType==='health_medicine'))throw Error('Health & Medicine items require the existing checkout and cannot be scheduled here.');
    const lines=cart.filter(i=>i.productId&&Number.isInteger(Number(i.quantity))&&Number(i.quantity)>0)
       .map(i=>({product_id:i.productId,variant_id:i.variantId||null,quantity:Number(i.quantity)}));
    if(lines.length!==cart.length||lines.length===0)throw Error('Add regular marketplace products to the cart first.');
    return lines;
  };
  const load=async()=>{
    const auth=await session();
    if(!auth){note('Sign in with a LEOGO STAGING account to view your Weekend Shopping plans.');$('weekendStagePlans').replaceChildren();$('weekendStageReminders').replaceChildren();return;}
    const reminders=await client.rpc('customer_weekend_reminders');
    $('weekendStageReminders').innerHTML=reminders.error?'':(reminders.data||[]).map(r=>'<div class="weekend-cycle"><strong>Delivery reminder: '+esc(r.delivery_date)+'</strong><p>'+esc(r.message)+' Remaining: '+money(r.remaining_kes)+'</p></div>').join('');
    const {data:plans,error}=await client.from('weekend_shopping_plans')
      .select('id,cadence,delivery_date,status,weekend_shopping_cycles(id,cycle_no,delivery_date,items_total_kes,service_fee_kes,delivery_fee_kes,amount_due_kes,verified_paid_kes,status,released_order_id)')
      .order('created_at',{ascending:false}).limit(20);
    if(error){note(error.message);return;}
    const target=$('weekendStagePlans');
    target.innerHTML='<h4>My Weekend Shopping plans</h4>'+(plans||[]).map(p=>`
      <div class="weekend-cycle"><strong>${esc(p.cadence==='weekly'?'Weekly shopping':'One-time shopping')}</strong>
      <div>Preferred delivery: ${esc(p.delivery_date)}</div>
      ${(p.weekend_shopping_cycles||[]).map(c=>`
        <div>Cycle ${esc(c.cycle_no)} · ${esc(c.delivery_date)} · ${esc(c.status)}<br>
        Items: ${money(c.items_total_kes)} · Service: ${money(c.service_fee_kes)} · Delivery: ${money(c.delivery_fee_kes)}<br>Saved: ${money(c.verified_paid_kes)} / ${money(c.amount_due_kes)}
        ${c.status==='release_ready'?'<button type="button" data-weekend-release="'+esc(c.id)+'">Create verified marketplace order</button>':''}
        ${["funding","funded","release_ready"].includes(c.status)?'<button type="button" data-weekend-cancel="'+esc(c.id)+'">Cancel shopping cycle</button>':''}
        ${c.released_order_id?'<small>Order: '+esc(c.released_order_id)+'</small>':''}
        <div><input aria-label="Partial amount" data-amount="${esc(c.id)}" type="number" min="1" step="0.01" placeholder="Amount KSh">
        <input aria-label="Payment reference" data-reference="${esc(c.id)}" placeholder="Payment reference (test only)">
        <button type="button" data-weekend-payment="${esc(c.id)}">Submit reference</button></div>
        </div>`).join('')}
      ${p.cadence==='weekly'?'<button type="button" data-weekend-next="'+esc(p.id)+'">Create next weekly cycle</button>':''}
      </div>`).join('');
  };
  $('weekendStageSignIn').addEventListener('click',async()=>{
    const email=$('weekendStageEmail').value.trim(),password=$('weekendStagePassword').value;
    if(!email||!password){note('Enter your staging login details.');return;}
    const {error}=await client.auth.signInWithPassword({email,password});
    $('weekendStagePassword').value='';
    note(error?error.message:'Signed in to staging.');if(!error)void load();
  });
  $('weekendStageSignOut').addEventListener('click',async()=>{await client.auth.signOut();note('Signed out of staging.');void load();});
  $('weekendStageCreate').addEventListener('click',async(e)=>{
    const b=e.currentTarget;b.disabled=true;
    try{
      if(!await session())throw Error('Sign in to staging first.');
      const items=cartItems(),date=$('weekendStageDate').value,cadence=$('weekendStageCadence').value;
      if(!date)throw Error('Select a preferred delivery date.');
      const {error}=await client.rpc('customer_create_weekend_shopping_quoted',{p_items:items,p_date:date,p_cadence:cadence,p_receiver_name:$('weekendStageReceiver').value.trim(),p_contact_number:$('weekendStagePhone').value.trim(),p_delivery_zone:$('weekendStageZone').value,p_county:$('weekendStageCounty').value.trim(),p_sub_county:$('weekendStageSubCounty').value.trim(),p_estate:$('weekendStageEstate').value.trim(),p_landmark:$('weekendStageLandmark').value.trim()});
      if(error)throw error;
      note('Weekend Shopping plan saved in staging. This is not a paid order.');
      await load();
    }catch(e){note(e.message);}finally{b.disabled=false;}
  });
  $('weekendStagePlans').addEventListener('click',async(e)=>{
    const pay=e.target.closest('[data-weekend-payment]');
    const next=e.target.closest('[data-weekend-next]');
    const release=e.target.closest('[data-weekend-release]');
    const cancel=e.target.closest('[data-weekend-cancel]');
    if(!pay&&!next&&!release&&!cancel)return;
    e.target.disabled=true;
    try{
      let error;
      if(pay){
        const id=pay.dataset.weekendPayment;
        const amount=Number(box.querySelector('[data-amount="'+id+'"]')?.value);
        const reference=box.querySelector('[data-reference="'+id+'"]')?.value.trim();
        if(!Number.isFinite(amount)||amount<=0||!reference)throw Error('Enter a positive amount and payment reference.');
        ({error}=await client.rpc('customer_submit_weekend_payment',{p_cycle_id:id,p_amount:amount,p_reference:reference}));
      }else if(cancel){
        const reason=prompt('Reason for cancellation');if(!reason)return;
        ({error}=await client.rpc('customer_cancel_weekend_cycle',{p_cycle_id:cancel.dataset.weekendCancel,p_reason:reason}));
      }else if(release){
        ({error}=await client.rpc('customer_release_weekend_order',{p_cycle_id:release.dataset.weekendRelease}));
      }else{
        ({error}=await client.rpc('customer_generate_next_weekend_cycle',{p_plan_id:next.dataset.weekendNext}));
      }
      if(error)throw error;
      note(pay?'Reference sent for Admin verification. No funds credited yet.':release?'Verified marketplace order created.':cancel?'Cycle cancelled. Any verified funds require a manually reviewed refund.':'Next weekly cycle created.');
      await load();
    }catch(err){note(err.message);}finally{e.target.disabled=false;}
  });
})();

/* Partner agreement gate. This adds UI defense in depth; production rollout also
 * requires database-side registration enforcement and validated legal text. */
(() => {
  'use strict';
  const client = () => window.leogoPartnerClient;
  const entries = [
    ['seller','sellerRegistrationForm','showSellerRegistration'],
    ['service_provider','providerRegistrationForm','showProviderRegistration'],
    ['transport','transportRegistrationForm','showTransportRegistration'],
    ['pickup_station','pickupStationRegistrationForm','showPickupStationRegistration'],
    ['accommodation','accommodationRegistrationForm','showAccommodationRegistration'],
    ['cyber','cyberRegistrationForm','showCyberRegistration'],
    ['premium','premiumRegistrationForm','showPremiumRegistration']
  ];
  const approved = new WeakSet();
  let processing = false;
  const overlay = document.createElement('div');
  overlay.id='leogoPartnerTermsGate';
  overlay.hidden = true;
  overlay.style.cssText='position:fixed;inset:0;z-index:20000;background:#07152acc;display:none;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="leogoTermsTitle" style="width:min(95vw,690px);max-height:90vh;overflow:auto;background:white;border-radius:16px;padding:22px;color:#172b44"><h2 id="leogoTermsTitle">LEOGO Partner Terms & Conditions</h2><p id="leogoTermsVersion"></p><pre id="leogoTermsText" tabindex="0" style="white-space:pre-wrap;font:14px/1.6 sans-serif;max-height:45vh;overflow:auto;padding:12px;background:#f3f6fa;border-radius:8px"></pre><label style="display:flex;gap:10px;align-items:flex-start"><input id="leogoTermsCheck" type="checkbox"> I have read and agree to this version of the Partner Terms & Conditions.</label><p id="leogoTermsStatus" role="status"></p><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:15px"><button type="button" id="leogoTermsCancel">Cancel</button><button type="button" id="leogoTermsAccept" disabled>Accept & Continue</button></div></section>';
  document.body.append(overlay);
  const q=id=>overlay.querySelector('#'+id);
  const close=()=>{overlay.style.display='none';overlay.hidden=true;q('leogoTermsCheck').checked=false;};
  q('leogoTermsCancel').addEventListener('click',close);
  q('leogoTermsCheck').addEventListener('change',()=>q('leogoTermsAccept').disabled=!q('leogoTermsCheck').checked);
  async function requireTerms(type) {
    if(processing)return false;
    processing=true;
    try {
      const db=client();
      if(!db)throw Error('Partner sign-in is not ready. Please retry.');
      const {data:auth,error:authError}=await db.auth.getUser();
      if(authError||!auth?.user)throw Error('Please sign in before registering as a partner.');
      const {data,error}=await db.rpc('leogo_get_partner_terms',{p_partner_type:type});
      if(error)throw error;
      if(!data?.terms_text)throw Error('Terms for this partner category have not been published yet. Please contact LEOGO Admin.');
      if(data.accepted)return true;
      q('leogoTermsVersion').textContent='Version '+data.version+' · Effective '+new Date(data.effective_at).toLocaleDateString('en-KE');
      q('leogoTermsText').textContent=data.terms_text;
      q('leogoTermsStatus').textContent='';
      q('leogoTermsCheck').checked=false;q('leogoTermsAccept').disabled=true;
      overlay.hidden=false;overlay.style.display='flex';q('leogoTermsText').focus();
      return await new Promise(resolve=>{
        const cancel=()=>{cleanup();resolve(false)};
        const submit=async()=>{
          q('leogoTermsAccept').disabled=true;
          q('leogoTermsStatus').textContent='Recording acceptance…';
          const {error:saveError}=await db.rpc('leogo_accept_partner_terms',{p_partner_type:type,p_version:data.version});
          if(saveError){q('leogoTermsStatus').textContent=saveError.message;q('leogoTermsAccept').disabled=false;return;}
          cleanup();resolve(true);
        };
        const cleanup=()=>{q('leogoTermsCancel').removeEventListener('click',cancel);q('leogoTermsAccept').removeEventListener('click',submit);close();};
        q('leogoTermsCancel').addEventListener('click',cancel);
        q('leogoTermsAccept').addEventListener('click',submit);
      });
    } catch(err) {
      alert(err?.message||'Unable to load Partner Terms.');
      return false;
    } finally {processing=false;}
  }
  for(const [type,formId,buttonId] of entries){
    const form=document.getElementById(formId),button=document.getElementById(buttonId);
    if(!form)continue;
    if(button)button.addEventListener('click',async event=>{
      if(approved.has(button)){approved.delete(button);return;}
      event.preventDefault();event.stopImmediatePropagation();
      if(await requireTerms(type)){approved.add(button);button.click();}
    },true);
    form.addEventListener('submit',async event=>{
      if(approved.has(form)){approved.delete(form);return;}
      event.preventDefault();event.stopImmediatePropagation();
      if(await requireTerms(type)){approved.add(form);form.requestSubmit();}
    },true);
  }
})();

Warning: truncated output (original token count: 87608)
Total output lines: 5653

(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const PARTNER_URL='https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/partner/';
const INITIAL_PARTNER_URL=new URL(window.location.href);
const INITIAL_PARTNER_HASH=new URLSearchParams(INITIAL_PARTNER_URL.hash.replace(/^#/,''));
let passwordRecoveryMode=
  INITIAL_PARTNER_URL.searchParams.get('mode')==='reset-password' ||
  INITIAL_PARTNER_URL.searchParams.get('type')==='recovery' ||
  INITIAL_PARTNER_HASH.get('type')==='recovery' ||
  Boolean(INITIAL_PARTNER_URL.searchParams.get('code'));
const passwordRecoveryUrlHasTokens=
  INITIAL_PARTNER_HASH.get('type')==='recovery' &&
  Boolean(INITIAL_PARTNER_HASH.get('access_token')&&INITIAL_PARTNER_HASH.get('refresh_token'));
const passwordRecoveryAccessToken=INITIAL_PARTNER_HASH.get('access_token')||'';
const passwordRecoveryRefreshToken=INITIAL_PARTNER_HASH.get('refresh_token')||'';
const passwordRecoveryCode=INITIAL_PARTNER_URL.searchParams.get('code')||'';
const passwordRecoveryUrlError=
  INITIAL_PARTNER_URL.searchParams.get('error') ||
  INITIAL_PARTNER_HASH.get('error') ||
  INITIAL_PARTNER_URL.searchParams.get('error_code') ||
  INITIAL_PARTNER_HASH.get('error_code') ||
  '';
const passwordRecoveryUrlErrorDescription=(()=>{
  const raw=
    INITIAL_PARTNER_URL.searchParams.get('error_description') ||
    INITIAL_PARTNER_HASH.get('error_description') ||
    '';
  try{return decodeURIComponent(String(raw).replace(/\+/g,' '));}catch(_error){return String(raw);}
})();
let passwordRecoverySessionVerified=false;
let passwordRecoverySessionPromise=null;
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const status=(el,msg='',type='')=>{if(!el)return;el.textContent=msg;el.className='status'+(type?' '+type:'');};
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const uid=()=>currentUser?.id||'';
let currentUser=null,seller=null,categories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.categories)?window.LEOGO_PRODUCT_TAXONOMY.categories:[],subcategories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.subcategories)?window.LEOGO_PRODUCT_TAXONOMY.subcategories:[],products=[],editingProduct=null,kenyaCounties=[],kenyaSubcounties=[],settlementAccounts=[],sellerSettlements=[],settlementRequests=[],sellerEarningsReport=null,partnerNotifications=[],sellerOrders=[],sellerReviews=[],sellerOrderFilter='all';
let provider=null,providerServices=[],providerNotifications=[],providerJobs=[],providerSettlementAccounts=[],providerSettlementRequests=[],providerSettlements=[],providerEarningsReport=null,editingProviderService=null;
let transportProvider=null,transportVehicles=[],transportJobs=[],transportNotifications=[],transportSettlementAccounts=[],transportSettlementRequests=[],transportSettlements=[],transportEarningsReport=null,editingTransportVehicle=null,transportBasePinOnly=false;
let accommodationProvider=null,accommodationNotifications=[],accommodationCatalogue=[],accommodationBookings=[];
let premiumProfile=null,premiumNotifications=[],premiumMeetupRequests=[];
let premiumPartnerChatRequestId=null,premiumPartnerChatTimer=null,premiumPartnerChatLoading=false;
const INITIAL_SERVICE_AREAS=[
  {code:'KE041',name:'Siaya'},{code:'KE042',name:'Kisumu'},{code:'KE047',name:'Nairobi'},
  {code:'KE040',name:'Busia'},{code:'KE043',name:'Homa Bay'},{code:'KE044',name:'Migori'},
  {code:'KE037',name:'Kakamega'},{code:'KE039',name:'Bungoma'},
  {code:'KE026',name:'Trans Nzoia',display:'Trans Nzoia (Kitale)'},
  {code:'KE027',name:'Uasin Gishu',display:'Uasin Gishu (Eldoret)'}
];
const applyInitialServiceAreas=()=>{
  kenyaCounties=INITIAL_SERVICE_AREAS.map(({code,name,display})=>({code,name,display_name:display||name}));
  kenyaSubcounties=[];
};

const authShell=$('#partnerAuthShell'),rolePicker=$('#partnerRolePicker'),sellerShell=$('#sellerShell'),providerShell=$('#providerShell'),transportShell=$('#transportShell'),premiumShell=$('#premiumShell'),accommodationShell=$('#accommodationShell'),cyberShell=$('#cyberShell'),logout=$('#partnerLogout'),hero=$('.hero');
const partnerNotificationBell=$('#partnerNotificationBell'),partnerNotificationBadge=$('#partnerNotificationBadge');
const resetRequestForm=$('#partnerResetRequestForm'),resetUpdateForm=$('#partnerResetUpdateForm');
const sellerReg=$('#sellerRegistrationForm'),approvedArea=$('#sellerApprovedArea'),sellerOnboarding=$('#sellerOnboarding'),sellerDashboard=$('#sellerDashboard'),sellerDocsForm=$('#sellerVerificationDocumentsForm');
const sellerProfilePanel=$('#sellerProfilePanel'),sellerNotificationPanel=$('#sellerNotificationPanel'),sellerSettlementPanel=$('#sellerSettlementPanel'),sellerPendingArea=$('#sellerPendingArea'),sellerSidebar=$('#sellerSidebar'),sellerBootStatus=$('#sellerBootStatus');
let activeRole='';

const partnerTypeLabel=(value)=>({premium:'Premium Partner',seller:'Seller',service_provider:'Service Provider',cyber:'Cyber',accommodation:'Accommodation',transport:'Transporter'}[value]||value);
const partnerPaymentDestination=(account)=>{
  if(!account)return 'Ask LEOGO Admin for the current payment destination.';
  const number=account.till_number||account.paybill_number||account.account_number||'';
  return [account.display_name,number,account.account_name||account.business_name,account.instructions].filter(Boolean).join(' · ');
};
async function mountPartnerSubscription(partnerType,shell){
  if(!currentUser||!shell)return;
  const {data,error}=await client.rpc('partner_get_billing_status',{p_partner_type:partnerType});
  if(error){console.warn('Partner subscription status unavailable:',error);return;}
  shell.querySelector('.partner-subscription-panel')?.remove();
  const panel=document.createElement('section');
  panel.className='partner-subscription-panel';
  const latest=data.latest_payment||{},active=Boolean(data.active);
  const endCopy=active&&data.ends_at?'Active until '+new Date(data.ends_at).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}):latest.payment_status==='pending'?'Payment awaiting Admin verification':'Subscription required';
  panel.innerHTML='<header><div><span>PARTNER SUBSCRIPTION</span><h3>'+escapeHtml(partnerTypeLabel(partnerType))+' access</h3><p>'+escapeHtml(endCopy)+'</p></div><b class="'+(active?'active':'')+'">'+(active?'ACTIVE':latest.payment_status==='pending'?'PENDING':'INACTIVE')+'</b></header><div class="partner-subscription-grid"><form data-partner-subscription-form><label>Plan<select name="period"><option value="monthly">Monthly — KSh '+Number(data.monthly_amount_kes||0).toLocaleString('en-KE')+'</option><option value="yearly">Yearly — KSh '+Number(data.yearly_amount_kes||0).toLocaleString('en-KE')+'</option></select></label><label>Payment reference<input name="reference" minlength="4" maxlength="80" required placeholder="M-Pesa / payment code"></label><small>Pay to '+escapeHtml(partnerPaymentDestination(data.payment_destination))+'. Admin must confirm the payment before activation.</small><button type="submit">Submit subscription payment</button><p class="status" data-partner-subscription-status></p></form>'+(partnerType==='premium'?'<form data-premium-credit-form><strong>Need another acceptance now?</strong><small>One acceptance is free per rolling 24 hours. Extra acceptances cost KSh '+Number(data.extra_acceptance_amount_kes||0).toLocaleString('en-KE')+' each. Approved credits available: '+Number(data.acceptance_credits||0)+'.</small><label>Extra acceptances<input name="quantity" type="number" min="1" max="100" value="1" required></label><label>Payment reference<input name="reference" minlength="4" maxlength="80" required></label><button type="submit">Submit extra acceptance payment</button><p class="status" data-premium-credit-status></p></form>':'')+'</div>';
  const workspace=shell.querySelector('.seller-workspace,.cyber-main,.cyber-workspace')||shell;
  const head=workspace.querySelector(':scope > header');
  if(head)head.insertAdjacentElement('afterend',panel);else workspace.prepend(panel);
  panel.querySelector('[data-partner-subscription-form]')?.addEventListener('submit',async(event)=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;const original=button.textContent;button.textContent='Submitting…';const output=panel.querySelector('[data-partner-subscription-status]');
    try{const form=new FormData(event.currentTarget),result=await client.rpc('partner_submit_subscription_payment',{p_partner_type:partnerType,p_billing_period:form.get('period'),p_payment_reference:String(form.get('reference')||'').trim()});if(result.error)throw result.error;status(output,'Payment submitted. Admin verification is required before activation.','success');event.currentTarget.reset();}
    catch(err){status(output,err?.message||'Payment could not be submitted.','error');}finally{button.disabled=false;button.textContent=original;}
  });
  panel.querySelector('[data-premium-credit-form]')?.addEventListener('submit',async(event)=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;const original=button.textContent;button.textContent='Submitting…';const output=panel.querySelector('[data-premium-credit-status]');
    try{const form=new FormData(event.currentTarget),result=await client.rpc('premium_submit_extra_acceptance_payment',{p_quantity:Number(form.get('quantity')),p_payment_reference:String(form.get('reference')||'').trim()});if(result.error)throw result.error;status(output,'Extra acceptance payment submitted for Admin verification.','success');event.currentTarget.reset();}
    catch(err){status(output,err?.message||'Payment could not be submitted.','error');}finally{button.disabled=false;button.textContent=original;}
  });
}
window.leogoMountPartnerSubscription=mountPartnerSubscription;
async function hydratePremiumApplicationBilling(){
  const {data,error}=await client.rpc('partner_get_billing_status',{p_partner_type:'premium'});if(error||!data)return;
  const select=$('#premiumPartnerSubscriptionPeriod');
  if(select)select.innerHTML='<option value="monthly">Monthly — KSh '+Number(data.monthly_amount_kes||0).toLocaleString('en-KE')+'</option><option value="yearly">Yearly — KSh '+Number(data.yearly_amount_kes||0).toLocaleString('en-KE')+'</option>';
  if($('#premiumApplicationPaymentDestination'))$('#premiumApplicationPaymentDestination').textContent='Pay to '+partnerPaymentDestination(data.payment_destination)+'. Admin will verify the reference before activation.';
}
window.leogoSetPartnerActiveRole=(role='')=>{activeRole=String(role||'');};

const waitTimeout=(ms,message='Request timed out')=>new Promise((_,reject)=>window.setTimeout(()=>reject(new Error(message)),ms));

function primeSellerLocationOptions(){
  if(!kenyaCounties.length)applyInitialServiceAreas();
  const county=$('#sellerCounty');
  if(county){
    const current=county.value;
    county.innerHTML='<option value="">Select county</option>'+kenyaCounties.map(item=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.display_name||item.name)+'</option>').join('');
    if(current&&kenyaCounties.some(item=>item.code===current))county.value=current;
  }
}

function showSellerBoot(message='Loading your Seller account…',isError=false){
  if(!sellerBootStatus)return;
  sellerBootStatus.hidden=false;
  $('#sellerBootTitle').textContent=isError?'Seller Portal needs attention':'Opening your Seller dashboard…';
  $('#sellerBootMessage').textContent=message;
  $('.seller-boot-spinner',sellerBootStatus).hidden=isError;
  $('#retrySellerBoot').hidden=!isError;
}

function hideSellerBoot(){
  if(sellerBootStatus)sellerBootStatus.hidden=true;
}

function showSellerBootError(error){
  console.error('Seller portal boot failed:',error);
  showSellerBoot(error?.message||'The Seller dashboard could not finish loading. Tap Retry.',true);
  sellerOnboarding.hidden=true;
  sellerDashboard.hidden=true;
  sellerReg.hidden=true;
  sellerShell.hidden=false;
}

$('#retrySellerBoot')?.addEventListener('click',()=>openSellerRole());


$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>{$$('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('[data-auth-form]').forEach(f=>f.classList.toggle('active',f.dataset.authForm===b.dataset.authTab));}));

async function establishPasswordRecoverySession(){
  if(passwordRecoverySessionPromise)return passwordRecoverySessionPromise;

  passwordRecoverySessionPromise=(async()=>{
    if(passwordRecoveryUrlError){
      throw new Error(passwordRecoveryUrlErrorDescription||'This password reset link is invalid or has expired.');
    }

    // First accept a session that Supabase has already created from the recovery URL.
    const current=await client.auth.getSession();
    if(current.error)throw current.error;
    if(current.data?.session?.user){
      currentUser=current.data.session.user;
      passwordRecoverySessionVerified=true;
      return current.data.session;
    }

    // Some mobile/email browsers leave the implicit recovery tokens in the URL
    // without persisting them quickly enough. Establish that session explicitly.
    if(passwordRecoveryUrlHasTokens){
      const recovered=await client.auth.setSession({
        access_token:passwordRecoveryAccessToken,
        refresh_token:passwordRecoveryRefreshToken
      });
      if(recovered.error)throw recovered.error;
      if(recovered.data?.session?.user){
        currentUser=recovered.data.session.user;
        passwordRecoverySessionVerified=true;
        return recovered.data.session;
      }
    }

    // Also support PKCE-style recovery links that return ?code=...
    if(passwordRecoveryCode){
      const exchanged=await client.auth.exchangeCodeForSession(passwordRecoveryCode);
      if(exchanged.error)throw exchanged.error;
      if(exchanged.data?.session?.user){
        currentUser=exchanged.data.session.user;
        passwordRecoverySessionVerified=true;
        return exchanged.data.session;
      }
    }

    throw new Error('The password reset session could not be created. Request a fresh reset link and open the newest email.');
  })();

  try{
    return await passwordRecoverySessionPromise;
  }catch(error){
    passwordRecoverySessionVerified=false;
    passwordRecoverySessionPromise=null;
    throw error;
  }
}

function passwordRecoveryFriendlyMessage(message=''){
  const value=String(message||'').trim();
  if(/Email link is invalid or has expired|One-time token not found|otp_expired/i.test(value)){
    return 'This reset link is no longer the current one-time LEOGO reset link. Open only the newest password-reset email. If you requested several links, older emails stop working immediately.';
  }
  return value;
}

function showPasswordRecoveryScreen({valid=false,message='',type=''}={}){
  passwordRecoveryMode=true;
  authShell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  if(hero)hero.hidden=false;
  if(partnerNotificationBell)partnerNotificationBell.hidden=true;
  logout.hidden=true;

  $('#partnerLoginForm').hidden=true;
  $('#partnerLoginForm').classList.remove('active');
  $('#partnerRegisterForm').hidden=true;
  $('#partnerRegisterForm').classList.remove('active');
  resetRequestForm.hidden=valid;
  resetUpdateForm.hidden=!valid;
  resetRequestForm.classList.toggle('active',!valid);
  resetUpdateForm.classList.toggle('active',valid);

  if(valid){
    status($('#partnerAuthStatus'),message||'Create a new password for your LEOGO account.','success');
    window.setTimeout(()=>$('#partnerRecoveryPassword')?.focus(),50);
  }else{
    status($('#partnerAuthStatus'),passwordRecoveryFriendlyMessage(message)||'This password reset link is invalid or has expired. Request a new reset link below.',type||'error');
    window.setTimeout(()=>$('#partnerResetEmail')?.focus(),50);
  }
}

function showLoginForm(){
  $('#partnerLoginForm').hidden=false;
  $('#partnerLoginForm').classList.add('active');
  $('#partnerRegisterForm').hidden=true;
  $('#partnerRegisterForm').classList.remove('active');
  resetRequestForm.hidden=true;
  resetUpdateForm.hidden=true;
  $$('[data-auth-tab]').forEach((button)=>button.classList.toggle('active',button.dataset.authTab==='login'));
}
$('#showPartnerResetPassword').addEventListener('click',()=>{
  $('#partnerLoginForm').hidden=true;
  $('#partnerLoginForm').classList.remove('active');
  $('#partnerRegisterForm').hidden=true;
  $('#partnerRegisterForm').classList.remove('active');
  resetUpdateForm.hidden=true;
  resetRequestForm.hidden=false;
  resetRequestForm.classList.add('active');
  $('#partnerResetEmail').value=$('#partnerLoginEmail').value.trim();
  $('#partnerResetEmail').focus();
  status($('#partnerAuthStatus'),'');
});
$('#cancelPartnerReset').addEventListener('click',()=>{resetRequestForm.classList.remove('active');showLoginForm();status($('#partnerAuthStatus'),'');});

const PARTNER_RESET_COOLDOWN_MS=120000;
const PARTNER_RESET_SENT_KEY='leogo_partner_reset_sent_at';
let partnerResetCountdownTimer=null;
const readPartnerResetSentAt=()=>{
  try{return Number(localStorage.getItem(PARTNER_RESET_SENT_KEY)||0);}catch(_error){return 0;}
};
const writePartnerResetSentAt=(value)=>{
  try{localStorage.setItem(PARTNER_RESET_SENT_KEY,String(value));}catch(_error){}
};

function updatePartnerResetCooldown(){
  const button=$('#sendPartnerResetLink');
  if(!button)return;
  const sentAt=readPartnerResetSentAt();
  const remaining=Math.max(0,PARTNER_RESET_COOLDOWN_MS-(Date.now()-sentAt));
  if(remaining<=0){
    button.disabled=false;
    button.textContent='Send Reset Link';
    if(partnerResetCountdownTimer){clearInterval(partnerResetCountdownTimer);partnerResetCountdownTimer=null;}
    return;
  }
  button.disabled=true;
  button.textContent='Use newest email · '+Math.ceil(remaining/1000)+'s';
  if(!partnerResetCountdownTimer){
    partnerResetCountdownTimer=setInterval(updatePartnerResetCooldown,1000);
  }
}

resetRequestForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!resetRequestForm.reportValidity())return;
  const sentAt=readPartnerResetSentAt();
  if(Date.now()-sentAt<PARTNER_RESET_COOLDOWN_MS){
    updatePartnerResetCooldown();
    status($('#partnerAuthStatus'),'A reset email was already sent recently. Open the newest LEOGO reset email instead of requesting another link.','error');
    return;
  }
  const email=$('#partnerResetEmail').value.trim().toLowerCase();
  const button=$('#sendPartnerResetLink');
  if(button){button.disabled=true;button.textContent='Sending…';}
  status($('#partnerAuthStatus'),'Sending password reset link…');
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:PARTNER_URL+'?mode=reset-password'});
  if(error){
    if(button){button.disabled=false;button.textContent='Send Reset Link';}
    status($('#partnerAuthStatus'),error.message,'error');
    return;
  }
  writePartnerResetSentAt(Date.now());
  updatePartnerResetCooldown();
  status($('#partnerAuthStatus'),'Password reset link sent. Open the newest LEOGO reset email only. Earlier reset emails are no longer valid.','success');
});
updatePartnerResetCooldown();

resetUpdateForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!resetUpdateForm.reportValidity())return;
  const password=$('#partnerRecoveryPassword').value;
  const confirm=$('#partnerRecoveryPasswordConfirm').value;
  if(password.length<8){status($('#partnerAuthStatus'),'Use at least 8 characters.','error');return;}
  if(password!==confirm){status($('#partnerAuthStatus'),'The two passwords do not match.','error');return;}
  status($('#partnerAuthStatus'),'Verifying secure reset session…');
  try{
    await establishPasswordRecoverySession();
  }catch(error){
    showPasswordRecoveryScreen({
      valid:false,
      message:error?.message||'This reset link is invalid or expired. Request a fresh password reset link below.',
      type:'error'
    });
    return;
  }

  // Re-check immediately before updateUser. This prevents "Auth session missing"
  // if the browser did not persist the recovery session from the email redirect.
  const verified=await client.auth.getSession();
  if(verified.error||!verified.data?.session?.user){
    passwordRecoverySessionVerified=false;
    showPasswordRecoveryScreen({
      valid:false,
      message:'The secure reset session was not available. Request a fresh password reset link and open the newest email.',
      type:'error'
    });
    return;
  }

  status($('#partnerAuthStatus'),'Updating password…');
  const {error}=await client.auth.updateUser({password});
  if(error){status($('#partnerAuthStatus'),error.message,'error');return;}
  resetUpdateForm.reset();

  // End the recovery session deliberately so the customer proves the new password on the next sign-in.
  await client.auth.signOut({scope:'local'}).catch(()=>{});
  passwordRecoveryMode=false;
  passwordRecoverySessionVerified=false;
  history.replaceState({},document.title,PARTNER_URL);
  currentUser=null;
  logout.hidden=true;
  authShell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  showLoginForm();
  status($('#partnerAuthStatus'),'Password updated successfully. Sign in with your new password.','success');
});

$('#partnerLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.submitter||$('#partnerLoginForm button[type="submit"]');
  const original=button?.textContent||'Sign In';
  if(button){button.disabled=true;button.textContent='Signing in…';}
  status($('#partnerAuthStatus'),'Signing in…');
  try{
    const {data,error}=await client.auth.signInWithPassword({email:$('#partnerLoginEmail').value.trim(),password:$('#partnerLoginPassword').value});
    if(error){status($('#partnerAuthStatus'),error.message,'error');return;}
    status($('#partnerAuthStatus'),'Signed in successfully.','success');
    await handleSession(data.session);
  }catch(error){
    status($('#partnerAuthStatus'),error?.message||'Sign in failed. Please try again.','error');
  }finally{
    if(button){button.disabled=false;button.textContent=original;}
  }
});
$('#partnerRegisterForm').addEventListener('submit',async e=>{e.preventDefault();status($('#partnerAuthStatus'),'Creating account…');const {data,error}=await client.auth.signUp({email:$('#partnerRegisterEmail').value.trim(),password:$('#partnerRegisterPassword').value,options:{data:{full_name:$('#partnerRegisterName').value.trim()}}});if(error){status($('#partnerAuthStatus'),error.message,'error');return;}status($('#partnerAuthStatus'),data.session?'Account created. Choose the partnership you want to register for.':'Account created. Sign in to continue to partnership selection.','success');});
logout.addEventListener('click',()=>client.auth.signOut());
$('#backToPartnerships').addEventListener('click',()=>showRolePicker());
$$('[data-role-target]').forEach((button)=>button.addEventListener('click',()=>{
  if(button.disabled)return;
  const target=button.dataset.roleTarget;
  if(target==='seller')openSellerRole();
  if(target==='service_provider')openProviderRole();
  if(target==='transport')openTransportRole();
  if(target==='pickup_station'){window.location.href='../pickup/';return;}
  if(target==='cyber'){
    activeRole='cyber';
    document.body.classList.add('cyber-role-open');
    rolePicker.hidden=true;
    authShell.hidden=true;
    hero.hidden=true;
    if(typeof window.leogoOpenCyberPartner==='function'){
      window.leogoOpenCyberPartner();
      window.setTimeout(()=>mountPartnerSubscription('cyber',cyberShell).catch(()=>{}),300);
    }else{
      // Fail-safe: never leave the Cyber card looking dead if its module is still loading.
      window.setTimeout(()=>{
        if(typeof window.leogoOpenCyberPartner==='function')window.leogoOpenCyberPartner();
        else{
          document.body.classList.remove('cyber-role-open');
          activeRole='';
          rolePicker.hidden=false;
          hero.hidden=false;
          showAuthStatus('Cyber Services is still loading. Refresh the page once and try again.','error');
        }
      },250);
    }
  }
  if(target==='premium')openPremiumRole();
  if(target==='accommodation')openAccommodationRole();
}));

async function uploadSellerVerification(file,prefix){
  if(!file)return null;
  if(file.size>8388608)throw new Error('Each business document must be 8 MB or smaller.');
  const ext=(file.name.split('.').pop()||'pdf').toLowerCase();
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('seller-verification').upload(path,file,{upsert:false});
  if(error)throw error;
  return path;
}
const normalisePhone=v=>{const d=String(v||'').replace(/\D/g,'');if(/^0[17]\d{8}$/.test(d))return '+254'+d.slice(1);if(/^254[17]\d{8}$/.test(d))return '+'+d;if(/^[17]\d{8}$/.test(d))return '+254'+d;return String(v||'').trim();};

async function loadKenyaLocations(){
  if(kenyaCounties.length && kenyaSubcounties.length)return;
  applyInitialServiceAreas();
  try{
    const [countyResult,subcountyResult]=await Promise.all([
      client.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    if(!countyResult.error && !subcountyResult.error && countyResult.data?.length){
      const fallbackDisplay=new Map(INITIAL_SERVICE_AREAS.map((item)=>[item.code,item.display||item.name]));
      kenyaCounties=(countyResult.data||[]).map((item)=>({...item,display_name:fallbackDisplay.get(item.code)||item.name}));
      kenyaSubcounties=subcountyResult.data||[];
    }
  }catch(_error){}
  $('#sellerCounty').innerHTML='<option value="">Select county</option>'+kenyaCounties.map((county)=>'<option value="'+escapeHtml(county.code)+'">'+escapeHtml(county.display_name||county.name)+'</option>').join('');
  renderSellerSubcounties();
}
async function renderSellerSubcounties(preferredCode=''){
  const countyCode=$('#sellerCounty').value;
  $('#sellerSubCounty').disabled=!countyCode;
  if(!countyCode){
    $('#sellerSubCounty').innerHTML='<option value="">Choose a county first</option>';
    return;
  }
  let options=kenyaSubcounties.filter((item)=>item.county_code===countyCode);
  if(!options.length){
    $('#sellerSubCounty').innerHTML='<option value="">Loading sub-counties…</option>';
    const {data,error}=await client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).eq('county_code',countyCode).order('name');
    if(!error && data?.length){
      kenyaSubcounties=[...kenyaSubcounties.filter((item)=>item.county_code!==countyCode),...data];
      options=data;
    }
  }
  $('#sellerSubCounty').innerHTML=options.length
    ? '<option value="">Select sub-county</option>'+options.map((item)=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.name)+'</option>').join('')
    : '<option value="">No active sub-counties configured</option>';
  $('#sellerSubCounty').disabled=!options.length;
  if(preferredCode && options.some((item)=>item.code===preferredCode))$('#sellerSubCounty').value=preferredCode;
}
$('#sellerCounty').addEventListener('change',()=>renderSellerSubcounties());

async function loadSeller(){
  if(!currentUser)return;

  showSellerBoot('Loading your Seller account…');
  primeSellerLocationOptions();

  try{
    const result=await Promise.race([
      client.rpc('seller_get_own_account'),
      waitTimeout(8000,'Seller account is taking too long to load. Check your connection and tap Retry.')
    ]);

    if(result?.error)throw result.error;
    seller=result?.data||null;

    // Show the actual Seller interface immediately after the account record arrives.
    renderSeller();
    hideSellerBoot();

    // Everything below is background enhancement. It must never blank the dashboard.
    if(seller){
      loadPartnerNotifications().catch(error=>console.warn('Seller notifications load failed:',error));
    }

    if(seller?.application_status==='approved'){
      Promise.allSettled([
        loadProducts(),
        loadTaxonomy(),
        loadSellerSettlementData(),
        loadSellerEarnings(),
        loadSellerOrders(),
        loadSellerReviews(),
        loadKenyaLocations()
      ]).then(results=>{
        const labels=['products','taxonomy','settlements','earnings','orders','reviews','locations'];
        results.forEach((result,index)=>{
          if(result.status==='rejected')console.error('Seller '+labels[index]+' loader failed:',result.reason);
        });
        try{renderProducts();}catch(error){console.error('Seller products render failed:',error);}
      });
    }else{
      loadKenyaLocations().catch(error=>console.warn('Seller locations load failed:',error));
    }
  }catch(error){
    showSellerBootError(error);
  }
}

function formatDate(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(date);
}
function nairobiDateISO(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return map.year+'-'+map.month+'-'+map.day;
}
function partnerRangeDates(range='today'){
  const today=new Date();
  const to=nairobiDateISO(today);
  if(range==='today')return {from:to,to};
  const days=Math.max(1,Number(range)||1);
  const fromDate=new Date(today.getTime()-(days-1)*86400000);
  return {from:nairobiDateISO(fromDate),to};
}
function earningsTableRows(report){
  const rows=Array.isArray(report?.entries)?report.entries:[];
  return rows.length?rows.map(entry=>
    '<tr><td>'+escapeHtml(entry.earning_date||'—')+'</td><td><strong>'+escapeHtml(entry.reference||'—')+'</strong></td><td>'+escapeHtml(entry.source||'Earning')+'</td><td>'+escapeHtml(money(entry.gross_kes))+'</td><td>'+escapeHtml(money(entry.commission_kes))+'</td><td><strong>'+escapeHtml(money(entry.net_kes))+'</strong></td></tr>'
  ).join(''):'<tr><td colspan="6">No earnings found for the selected dates.</td></tr>';
}
function downloadPartnerEarningsCsv(partnerType,report,businessName='partner'){
  const rows=Array.isArray(report?.entries)?report.entries:[];
  const lines=[
    ['Date','Reference','Source','Gross KSh','LEOGO Commission KSh','Net Earnings KSh'],
    ...rows.map(entry=>[entry.earning_date||'',entry.reference||'',entry.source||'',Number(entry.gross_kes||0),Number(entry.commission_kes||0),Number(entry.net_kes||0)])
  ];
  const csv=lines.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  const safe=String(businessName||partnerType).replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||partnerType;
  link.href=url;
  link.download='leogo-'+partnerType+'-earnings-'+safe+'-'+String(report?.from||'report')+'-to-'+String(report?.to||'report')+'.csv';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function loadSellerEarnings(from=null,to=null){
  if(!currentUser||seller?.application_status!=='approved')return;
  const fallback=partnerRangeDates('today');
  const selectedFrom=from||$('#sellerEarningsFrom')?.value||fallback.from;
  const selectedTo=to||$('#sellerEarningsTo')?.value||fallback.to;
  const {data,error}=await client.rpc('partner_get_earnings_report',{p_partner_type:'seller',p_from:selectedFrom,p_to:selectedTo});
  if(error)throw error;
  sellerEarningsReport=data||{};
  if($('#sellerEarningsFrom'))$('#sellerEarningsFrom').value=String(sellerEarningsReport.from||selectedFrom);
  if($('#sellerEarningsTo'))$('#sellerEarningsTo').value=String(sellerEarningsReport.to||selectedTo);
  renderSellerEarnings();
}
function renderSellerEarnings(){
  const report=sellerEarningsReport||{};
  if($('#sellerTodayEarnings'))$('#sellerTodayEarnings').textContent=money(report.today_net_kes);
  if($('#sellerTotalEarnings'))$('#sellerTotalEarnings').textContent=money(report.cumulative_net_kes);
  if($('#sellerAvailableBalance'))$('#sellerAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#sellerPeriodEarnings'))$('#sellerPeriodEarnings').textContent=money(report.period_net_kes);
  if($('#sellerCumulativeEarnings'))$('#sellerCumulativeEarnings').textContent=money(report.cumulative_net_kes);
  if($('#sellerReportAvailableBalance'))$('#sellerReportAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#sellerPendingSettlement'))$('#sellerPendingSettlement').textContent=money(report.pending_settlement_kes);
  if($('#sellerSettledTotal'))$('#sellerSettledTotal').textContent=money(report.settled_total_kes);
  if($('#sellerSettlementAvailableBalance'))$('#sellerSettlementAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#sellerEarningsTableBody'))$('#sellerEarningsTableBody').innerHTML=earningsTableRows(report);
  if($('#sellerSettlementRequestAmount')){
    $('#sellerSettlementRequestAmount').max=String(Math.max(0,Number(report.available_balance_kes||0)));
    $('#sellerSettlementRequestAmount').placeholder=Number(report.available_balance_kes||0)>0?'Up to '+money(report.available_balance_kes):'No balance available';
  }
}
async function loadProviderEarnings(from=null,to=null){
  if(!currentUser||provider?.application_status!=='approved')return;
  const fallback=partnerRangeDates('today');
  const selectedFrom=from||$('#providerEarningsFrom')?.value||fallback.from;
  const selectedTo=to||$('#providerEarningsTo')?.value||fallback.to;
  const {data,error}=await client.rpc('partner_get_earnings_report',{p_partner_type:'service_provider',p_from:selectedFrom,p_to:selectedTo});
  if(error)throw error;
  providerEarningsReport=data||{};
  if($('#providerEarningsFrom'))$('#providerEarningsFrom').value=String(providerEarningsReport.from||selectedFrom);
  if($('#providerEarningsTo'))$('#providerEarningsTo').value=String(providerEarningsReport.to||selectedTo);
  renderProviderEarnings();
}
function renderProviderEarnings(){
  const report=providerEarningsReport||{};
  if($('#providerTodayEarnings'))$('#providerTodayEarnings').textContent=money(report.today_net_kes);
  if($('#providerTotalEarnings'))$('#providerTotalEarnings').textContent=money(report.cumulative_net_kes);
  if($('#providerAvailableBalance'))$('#providerAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#providerPeriodGross'))$('#providerPeriodGross').textContent=money(report.period_gross_kes);
  if($('#providerPeriodCommission'))$('#providerPeriodCommission').textContent=money(report.period_commission_kes);
  if($('#providerCommissionRate'))$('#providerCommissionRate').textContent=(Number(report.commission_rate||0)*100).toFixed(0)+'% referral commission';
  if($('#providerPeriodEarnings'))$('#providerPeriodEarnings').textContent=money(report.period_net_kes);
  if($('#providerCumulativeEarnings'))$('#providerCumulativeEarnings').textContent=money(report.cumulative_net_kes);
  if($('#providerReportAvailableBalance'))$('#providerReportAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#providerPendingSettlement'))$('#providerPendingSettlement').textContent=money(report.pending_settlement_kes);
  if($('#providerSettledTotal'))$('#providerSettledTotal').textContent=money(report.settled_total_kes);
  if($('#providerSettlementAvailableBalance'))$('#providerSettlementAvailableBalance').textContent=money(report.available_balance_kes);
  if($('#providerEarningsTableBody'))$('#providerEarningsTableBody').innerHTML=earningsTableRows(report);
  if($('#providerSettlementRequestAmount')){
    $('#providerSettlementRequestAmount').max=String(Math.max(0,Number(report.available_balance_kes||0)));
    $('#providerSettlementRequestAmount').placeholder=Number(report.available_balance_kes||0)>0?'Up to '+money(report.available_balance_kes):'No balance available';
  }
}
$$('[data-seller-earning-range]').forEach(button=>button.addEventListener('click',async()=>{
  const range=partnerRangeDates(button.dataset.sellerEarningRange);
  await loadSellerEarnings(range.from,range.to);
}));
$('#sellerApplyEarningsFilter')?.addEventListener('click',()=>loadSellerEarnings($('#sellerEarningsFrom').value,$('#sellerEarningsTo').value));
$('#sellerDownloadEarnings')?.addEventListener('click',()=>{
  if(sellerEarningsReport)downloadPartnerEarningsCsv('seller',sellerEarningsReport,seller?.business_name||'seller');
});
$$('[data-provider-earning-range]').forEach(button=>button.addEventListener('click',async()=>{
  const range=partnerRangeDates(button.dataset.providerEarningRange);
  await loadProviderEarnings(range.from,range.to);
}));
$('#providerApplyEarningsFilter')?.addEventListener('click',()=>loadProviderEarnings($('#providerEarningsFrom').value,$('#providerEarningsTo').value));
$('#providerDownloadEarnings')?.addEventListener('click',()=>{
  if(providerEarningsReport)downloadPartnerEarningsCsv('service-provider',providerEarningsReport,provider?.business_name||'service-provider');
});

function showRolePicker(){
  document.body.classList.remove('cyber-role-open');
  activeRole='';
  if(partnerNotificationBell)partnerNotificationBell.hidden=true;
  rolePicker.hidden=false;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  if(cyberShell)cyberShell.hidden=true;
  authShell.hidden=true;
  if(hero)hero.hidden=false;
}
window.leogoShowPartnerRolePicker=showRolePicker;
async function openSellerRole(){
  activeRole='seller';
  if(cyberShell)cyberShell.hidden=true;
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=false;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  if(hero)hero.hidden=true;

  // Show visible feedback synchronously before any network request begins.
  sellerOnboarding.hidden=true;
  sellerDashboard.hidden=true;
  sellerReg.hidden=true;
  showSellerBoot('Loading your Seller account…');
  primeSellerLocationOptions();

  await loadSeller();
  await mountPartnerSubscription('seller',sellerDashboard).catch(()=>{});
}
function sellerStatusCopy(state){
  if(state==='submitted')return 'Submitted to LEOGO Admin. Your application is waiting for review.';
  if(state==='under_review')return 'LEOGO Admin is reviewing your Seller registration.';
  if(state==='changes_requested')return 'LEOGO Admin requested corrections. Update your registration and resubmit.';
  if(state==='approved')return 'Approved. You can now add products and manage your Seller account.';
  if(state==='rejected')return 'The application was not approved. Review the Admin note and resubmit if appropriate.';
  if(state==='suspended')return 'This Seller account is currently suspended. Contact LEOGO Admin.';
  return 'Complete Seller registration to start selling on LEOGO.';
}
function renderSellerSummary(){
  if(!seller){$('#sellerRegistrationSummary').innerHTML='';return;}
  const fields=[
    ['Business',seller.business_name],['Owner',seller.owner_name],['ID Number',seller.id_number],['Phone',seller.phone],
    ['County',seller.county],['Sub-County',seller.sub_county||'—'],['Town',seller.town],['Location',seller.location_details],
    ['Shop Coordinates',(seller.shop_latitude!=null&&seller.shop_longitude!=null)?(seller.shop_latitude+', '+seller.shop_longitude):'Not pinned'],['Shop Map Link',seller.shop_map_link||'—'],
    ['Business Description',seller.business_description||'—'],['Admin correction / review note',seller.admin_notes||'—'],['Business ID Document',seller.business_id_document_path?'Uploaded':'Missing'],['Business Licence',seller.business_licence_path?'Uploaded':'Not provided'],['CR12 / Registration Certificate',seller.registration_certificate_path?'Uploaded':'Not provided'],['Other Permits',(seller.other_permit_paths||[]).length+' file(s)']
  ];
  $('#sellerRegistrationSummary').innerHTML='<div class="section-title compact"><span>REGISTRATION DETAILS</span><h3>Your submitted Seller information</h3></div><div class="summary-grid">'+fields.map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('')+'</div>';
  if(!seller.business_id_document_path){
    $('#sellerRegistrationSummary').insertAdjacentHTML('beforeend','<div class="restricted-notice">Business ID / identification document is still required before Admin can approve this Seller account.</div>');
  }
}
function sellerViewDescription(view){
  return {
    overview:'Overview of your Seller account.',
    products:'Manage products, stock, pricing and variants.',
    orders:'Receive and fulfil customer orders.',
    reviews:'Approved product reviews from completed customer orders.',
    flashsale:'Choose an existing product and submit it to Flash Sale.',
    earnings:'View daily earnings, cumulative earnings and your available settlement balance.',
    settlements:'Manage approved payout accounts and settlement requests.',
    notifications:'All important Seller and Admin events.',
    profile:'Your registered Seller information and verification details.',
    data:'Download your Seller data and remove selected non-protected records.'
  }[view]||'Seller Portal';
}
function closeSellerSidebar(){
  sellerSidebar?.classList.remove('open');
  $('#sellerSidebarScrim')?.classList.remove('open');
}
function openSellerView(view='overview'){
  const allowed=seller?.application_status==='approved'
    ? ['overview','products','orders','reviews','flashsale','earnings','settlements','notifications','profile','data']
    : ['overview','notifications','profile','data'];
  const resolved=allowed.includes(view)?view:'overview';
  $$('[data-seller-content]').forEach(panel=>panel.classList.toggle('active',panel.dataset.sellerContent===resolved));
  $$('[data-seller-view]').forEach(button=>button.classList.toggle('active',button.dataset.sellerView===resolved));
  $('#sellerViewDescription').textContent=sellerViewDescription(resolved);
  if(resolved==='reviews'&&seller?.application_status==='approved'){
    loadSellerReviews().catch(error=>console.warn('Seller reviews refresh failed:',error));
  }
  if(resolved==='earnings'&&seller?.application_status==='approved'){
    loadSellerEarnings().catch(error=>console.warn('Seller earnings refresh failed:',error));
  }
  closeSellerSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-seller-view]').forEach(button=>button.addEventListener('click',()=>openSellerView(button.dataset.sellerView)));
$$('[data-open-seller-view]').forEach(button=>button.addEventListener('click',()=>openSellerView(button.dataset.openSellerView)));
$('#sellerSidebarToggle').addEventListener('click',()=>{sellerSidebar.classList.add('open');$('#sellerSidebarScrim').classList.add('open');});
$('#sellerSidebarScrim').addEventListener('click',closeSellerSidebar);

function renderSeller(){
  hideSellerBoot();
  const name=currentUser?.user_metadata?.full_name||currentUser?.email||'Partner';
  const state=seller?.application_status||'not_registered';
  const hasSeller=Boolean(seller);
  $('#sellerWelcome').textContent=seller?.business_name||name;
  sellerShell.classList.toggle('seller-has-account',hasSeller);
  sellerOnboarding.hidden=hasSeller;
  sellerDashboard.hidden=!hasSeller;
  sellerReg.hidden=true;
  approvedArea.hidden=state!=='approved';
  sellerPendingArea.hidden=!hasSeller || state==='approved';
  sellerDocsForm.hidden=!hasSeller || !['changes_requested','rejected'].includes(state);
  $('#sellerProfileButton').hidden=!hasSeller;
  $$('[data-seller-view="products"],[data-seller-view="orders"],[data-seller-view="reviews"],[data-seller-view="flashsale"],[data-seller-view="earnings"],[data-seller-view="settlements"]').forEach(button=>button.hidden=state!=='approved');

  if(seller){
    $('#sellerSidebarBusiness').textContent=seller.business_name||'Seller Account';
    $('#sellerSidebarStatus').textContent=state.replaceAll('_',' ').toUpperCase();
    $('#sellerOverviewBusiness').textContent=seller.business_name||'Your Seller account';
    $('#sellerOverviewStatus').textContent=state.replaceAll('_',' ').toUpperCase();
    $('#sellerOverviewStatusNote').textContent=state==='approved'?'Ready to sell':sellerStatusCopy(state);
    $('#sellerStatusValue').textContent=state.replaceAll('_',' ').toUpperCase();
    $('#sellerStatusValue').dataset.status=state;
    $('#sellerStatusMessage').textContent=sellerStatusCopy(state);
    $('#sellerSubmittedAt').textContent=formatDate(seller.submitted_at);
    $('#sellerApprovedAt').textContent=formatDate(seller.approved_at);
    renderSellerSummary();
    $('#sellerBusinessName').value=seller.business_name||'';
    $('#sellerOwnerName').value=seller.owner_name||'';
    $('#sellerIdNumber').value=seller.id_number||'';
    $('#sellerPhone').value=seller.phone||'';
    $('#sellerCounty').value=seller.county_code||'';
    renderSellerSubcounties(seller.sub_county_code||'');
    $('#sellerTown').value=seller.town||'';
    $('#sellerLocation').value=seller.location_details||'';
    $('#sellerShopLatitude').value=seller.shop_latitude??'';
    $('#sellerShopLongitude').value=seller.shop_longitude??'';
    $('#sellerShopMapLink').value=seller.shop_map_link||'';
    const sellerPinStatus=$('#sellerShopPinStatus');
    if(sellerPinStatus){sellerPinStatus.textContent=(seller.shop_latitude!=null&&seller.shop_longitude!=null)?'✓ Shop location pinned: '+seller.shop_latitude+', '+seller.shop_longitude:'Shop location not pinned yet.';}
    $('#sellerDescription').value=seller.business_description||'';
    $('#sellerBusinessIdDocument').required=!seller.business_id_document_path;

    if(['changes_requested','rejected'].includes(state)){
      const editButton=document.createElement('button');
      editButton.type='button';
      editButton.className='secondary seller-correction-button';
      editButton.textContent='Correct & Resubmit Registration';
      editButton.addEventListener('click',()=>{
        sellerReg.hidden=false;
        openSellerView('profile');
        sellerReg.scrollIntoView({behavior:'smooth',block:'start'});
      });
      $('#sellerRegistrationSummary').append(editButton);
    }
    openSellerView('overview');
  }else if(currentUser){
    $('#sellerOwnerName').value=currentUser.user_metadata?.full_name||'';
  }
}
$('#sellerProfileButton').addEventListener('click',()=>{if(seller)openSellerView('profile');});
$('#editApprovedSellerProfile')?.addEventListener('click',()=>{
  if(!seller||seller.application_status!=='approved')return;
  $('#sellerBusinessIdDocument').required=!seller.business_id_document_path;
  status($('#sellerProfileEditStatus'),'Edit the fields you want to change. Your current approved profile stays active until Admin approves the changes.');
  sellerReg.hidden=false;
  openSellerView('profile');
  sellerReg.scrollIntoView({behavior:'smooth',block:'start'});
});
$('#sellerNotificationsButton').addEventListener('click',()=>{if(seller)openSellerView('notifications');});
$('#markAllSellerNotificationsRead').addEventListener('click',async()=>{
  const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'seller'});
  if(error){status($('#sellerRegistrationStatus'),error.message,'error');return;}
  await loadPartnerNotifications();
});

async function loadPartnerNotifications(){
  if(!currentUser)return;
  const {data,error}=await client.from('partner_notifications').select('*').eq('partner_type','seller').order('created_at',{ascending:false}).limit(50);
  if(error){console.error(error);return;}
  partnerNotifications=data||[];
  const unread=partnerNotifications.filter(n=>!n.read_at).length;
  $('#sellerNotificationBadge').hidden=!unread;
  $('#sellerNotificationBadge').textContent=unread>99?'99+':String(unread);
  updateSharedPartnerNotificationBadge(unread);
  $('#sellerNotificationList').innerHTML=partnerNotifications.length?partnerNotifications.map(n=>`
    <article class="seller-notification-item ${n.read_at?'':'unread'}" data-notification-id="${escapeHtml(n.id)}">
      <div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message)}</p><small>${formatDate(n.created_at)}</small></div>
      <div class="seller-notification-actions">
        ${n.action_view?'<button type="button" data-open-notification-view="'+escapeHtml(n.action_view)+'" data-open-notification-id="'+escapeHtml(n.id)+'">Open</button>':''}
        ${n.read_at?'':'<button class="secondary" type="button" data-mark-notification="'+escapeHtml(n.id)+'">Mark read</button>'}
      </div>
    </article>`).join(''):'<div class="empty-card">No Seller notifications yet.</div>';
  $$('[data-mark-notification]').forEach(button=>button.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.markNotification});
    if(!error)await loadPartnerNotifications();
  }));
  $$('[data-open-notification-view]').forEach(button=>button.addEventListener('click',async()=>{
    const notificationId=button.dataset.openNotificationId;
    const view=button.dataset.openNotificationView;
    if(notificationId){
      await client.rpc('mark_partner_notification_read',{p_notification_id:notificationId}).catch?.(()=>{});
    }
    if(view==='reviews'){
      openSellerView('reviews');
      await loadSellerReviews();
    }else if(view==='orders'){
      openSellerView('orders');
      await loadSellerOrders();
    }else if(['products','earnings','settlements','notifications','profile','data','flashsale'].includes(view)){
      openSellerView(view);
    }
    await loadPartnerNotifications();
  }));

  renderSellerDataSelection();
}

function safeDownloadFilename(value='seller'){
  return String(value||'seller').trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'seller';
}
function downloadJsonFile(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function downloadSellerData(){
  if(!currentUser||!seller)return;
  const button=$('#downloadSellerData');
  const original=button.textContent;button.disabled=true;button.textContent='Preparing…';
  status($('#sellerDataExportStatus'),'Preparing your Seller data…');
  try{
    await Promise.all([loadProducts(),loadPartnerNotifications(),loadSellerOrders(),loadSellerReviews(),loadSellerSettlementData()]);
    const exportData={
      export_type:'LEOGO Seller Data',
      generated_at:new Date().toISOString(),
      seller_account:seller,
      products,
      seller_orders:sellerOrders,
      approved_product_reviews:sellerReviews,
      notifications:partnerNotifications,
      settlement_accounts:settlementAccounts,
      settlement_requests:settlementRequests,
      settlements:sellerSettlements,
      protected_records_note:'Orders, payments, settlements and registration/approval history are retained by LEOGO for transaction and audit integrity.'
    };
    const date=new Date().toISOString().slice(0,10);
    downloadJsonFile('leogo-seller-'+safeDownloadFilename(seller.business_name)+'-'+date+'.json',exportData);
    status($('#sellerDataExportStatus'),'Your Seller data download has been created.','success');
  }catch(error){
    status($('#sellerDataExportStatus'),error.message||'Your data could not be downloaded.','error');
  }finally{button.disabled=false;button.textContent=original;}
}

function updateSellerDataSelectionCount(){
  const total=selectedSellerProducts.size+selectedSellerNotifications.size;
  $('#sellerDataSelectedCount').textContent=total+' selected';
  $('#deleteSelectedSellerData').disabled=!total;
  const productIds=products.map(p=>p.id);
  const notificationIds=partnerNotifications.map(n=>n.id);
  $('#selectAllSellerProducts').checked=Boolean(productIds.length)&&productIds.every(id=>selectedSellerProducts.has(id));
  $('#selectAllSellerNotifications').checked=Boolean(notificationIds.length)&&notificationIds.every(id=>selectedSellerNotifications.has(id));
}
function renderSellerDataSelection(){
  const productBox=$('#sellerDataProductList');
  const notificationBox=$('#sellerDataNotificationList');
  if(!productBox||!notificationBox)return;

  for(const id of [...selectedSellerProducts]) if(!products.some(p=>p.id===id)) selectedSellerProducts.delete(id);
  for(const id of [...selectedSellerNotifications]) if(!partnerNotifications.some(n=>n.id===id)) selectedSellerNotifications.delete(id);

  productBox.innerHTML=products.length?products.map(p=>`
    <label class="seller-data-select-row">
      <input type="checkbox" data-delete-seller-product="${escapeHtml(p.id)}" ${selectedSellerProducts.has(p.id)?'checked':''}>
      <span><strong>${escapeHtml(p.product_name)}</strong><small>${money(p.price_kes)} · ${escapeHtml(p.listing_status)} · ${Number(p.quantity_available)} ${escapeHtml(p.measurement_unit)}</small></span>
    </label>`).join(''):'<div class="empty-card">No products available for selection.</div>';

  notificationBox.innerHTML=partnerNotifications.length?partnerNotifications.map(n=>`
    <label class="seller-data-select-row">
      <input type="checkbox" data-delete-seller-notification="${escapeHtml(n.id)}" ${selectedSellerNotifications.has(n.id)?'checked':''}>
      <span><strong>${escapeHtml(n.title)}</strong><small>${formatDate(n.created_at)} · ${escapeHtml(n.event_type||'notification')}</small></span>
    </label>`).join(''):'<div class="empty-card">No notifications available for selection.</div>';

  $$('[data-delete-seller-product]').forEach(input=>input.addEventListener('change',()=>{
    input.checked?selectedSellerProducts.add(input.dataset.deleteSellerProduct):selectedSellerProducts.delete(input.dataset.deleteSellerProduct);
    updateSellerDataSelectionCount();
  }));
  $$('[data-delete-seller-notification]').forEach(input=>input.addEventListener('change',()=>{
    input.checked?selectedSellerNotifications.add(input.dataset.deleteSellerNotification):selectedSellerNotifications.delete(input.dataset.deleteSellerNotification);
    updateSellerDataSelectionCount();
  }));
  updateSellerDataSelectionCount();
}
function clearSellerDataSelection(){
  selectedSellerProducts.clear();selectedSellerNotifications.clear();renderSellerDataSelection();
}
$('#downloadSellerData').addEventListener('click',downloadSellerData);
$('#selectAllSellerProducts').addEventListener('change',event=>{
  selectedSellerProducts.clear();
  if(event.target.checked)products.forEach(p=>selectedSellerProducts.add(p.id));
  renderSellerDataSelection();
});
$('#selectAllSellerNotifications').addEventListener('change',event=>{
  selectedSellerNotifications.clear();
  if(event.target.checked)partnerNotifications.forEach(n=>selectedSellerNotifications.add(n.id));
  renderSellerDataSelection();
});
$('#clearSellerDataSelection').addEventListener('click',clearSellerDataSelection);
$('#deleteSelectedSellerData').addEventListener('click',async()=>{
  const productIds=[...selectedSellerProducts];
  const notificationIds=[...selectedSellerNotifications];
  const total=productIds.length+notificationIds.length;
  if(!total)return;
  if(!window.confirm('Delete '+total+' selected record(s)? Products already used in customer orders will be archived instead of permanently deleted. Orders, payments, settlements and registration history will not be deleted.'))return;
  const button=$('#deleteSelectedSellerData');
  button.disabled=true;button.textContent='Deleting…';
  status($('#sellerDataDeleteStatus'),'Processing selected records…');
  try{
    const {data,error}=await client.rpc('seller_delete_selected_data',{p_product_ids:productIds,p_notification_ids:notificationIds});
    if(error)throw error;
    const result=data||{};
    const mediaPaths=Array.isArray(result.deleted_product_media_paths)?result.deleted_product_media_paths:[];
    if(mediaPaths.length){
      const {error:storageError}=await client.storage.from('seller-product-media').remove(mediaPaths);
      if(storageError)console.warn('Some deleted product media could not be removed:',storageError.message);
    }
    selectedSellerProducts.clear();selectedSellerNotifications.clear();
    await Promise.all([loadProducts(),loadPartnerNotifications()]);
    const message=Number(result.deleted_products||0)+' product(s) deleted · '+Number(result.archived_products||0)+' ordered product(s) archived · '+Number(result.deleted_notifications||0)+' notification(s) deleted';
    status($('#sellerDataDeleteStatus'),message,'success');
  }catch(error){
    status($('#sellerDataDeleteStatus'),error.message||'Selected data could not be deleted.','error');
  }finally{
    button.disabled=false;button.textContent='Delete Selected';renderSellerDataSelection();
  }
});

function settlementDestination(account){
  if(account.account_type==='mpesa_mobile')return account.phone_number||'—';
  if(account.account_type==='mpesa_till')return 'Till '+(account.till_number||'—');
  if(account.account_type==='mpesa_paybill')return 'Paybill '+(account.paybill_number||'—')+' · A/C '+(account.account_number||'—');
  return (account.bank_name||'Bank')+' · '+(account.account_number||'—')+(account.bank_branch?' · '+account.bank_branch:'');
}
function toggleSettlementFields(){
  const type=$('#sellerSettlementType').value;
  $$('[data-settlement-field]').forEach(label=>{label.hidden=!label.dataset.settlementField.split(' ').includes(type);});
}
$('#sellerSettlementType').addEventListener('change',toggleSettlementFields);
function resetSettlementForm(){
  $('#sellerSettlementAccountForm').reset();
  $('#sellerSettlementAccountId').value='';
  $('#sellerSettlementPrimary').checked=true;
  $('#cancelSettlementEdit').hidden=true;
  toggleSettlementFields();
  status($('#sellerSettlementStatus'),'');
}
$('#cancelSettlementEdit').addEventListener('click',resetSettlementForm);

async function loadSellerSettlementData(){
  if(!currentUser)return;
  const [accountsResult,settlementsResult,requestsResult]=await Promise.all([
    client.from('seller_settlement_accounts').select('*').order('created_at',{ascending:false}),
    client.from('seller_settlements').select('*').order('paid_at',{ascending:false}),
    client.from('seller_settlement_requests').select('*').order('submitted_at',{ascending:false})
  ]);
  if(accountsResult.error){status($('#sellerSettlementStatus'),accountsResult.error.message,'error');return;}
  if(settlementsResult.error){status($('#sellerSettlementStatus'),settlementsResult.error.message,'error');return;}
  if(requestsResult.error){status($('#sellerSettlementRequestStatus'),requestsResult.error.message,'error');return;}
  settlementAccounts=accountsResult.data||[];
  sellerSettlements=settlementsResult.data||[];
  settlementRequests=requestsResult.data||[];
  renderSellerSettlementData();
  loadSellerEarnings().catch(error=>console.warn('Seller balance refresh failed:',error));
}
function renderSellerSettlementData(){
  $('#sellerSettlementAccountList').innerHTML=settlementAccounts.length?settlementAccounts.map(a=>`
    <article class="settlement-account-card">
      <div><strong>${escapeHtml(a.account_name)}</strong><small>${escapeHtml(a.account_type.replaceAll('_',' '))} · ${escapeHtml(settlementDestination(a))}</small></div>
      <div><span class="settlement-status ${escapeHtml(a.status)}">${escapeHtml(a.status.replaceAll('_',' ').toUpperCase())}</span>${a.is_primary?'<b>PRIMARY</b>':''}</div>
      <p>${a.admin_notes?'Admin note: '+escapeHtml(a.admin_notes):'Every change requires Admin verification.'}</p>
      ${['approved','pending_review','rejected'].includes(a.status)?'<button class="secondary" type="button" data-edit-settlement="'+escapeHtml(a.id)+'">Edit</button>':''}
    </article>`).join(''):'<div class="empty-card">No settlement account added yet.</div>';
  $$('[data-edit-settlement]').forEach(button=>button.addEventListener('click',()=>editSettlementAccount(button.dataset.editSettlement)));
  const approved=settlementAccounts.filter(a=>a.status==='approved');
  $('#sellerSettlementRequestAccount').innerHTML=approved.length
    ? '<option value="">Choose approved settlement account…</option>'+approved.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.account_name)+' — '+escapeHtml(settlementDestination(a))+(a.is_primary?' (Primary)':'')+'</option>').join('')
    : '<option value="">No approved settlement account yet</option>';
  $('#sellerSettlementRequestButton').disabled=!approved.length;
  $('#sellerSettlementRequestList').innerHTML=settlementRequests.length?settlementRequests.map(r=>`
    <article class="settlement-history-row"><div><strong>${money(r.requested_amount_kes)}</strong><small>${formatDate(r.submitted_at)} · ${escapeHtml(r.status.replaceAll('_',' ').toUpperCase())}${r.admin_notes?' · Admin: '+escapeHtml(r.admin_notes):''}</small></div><span>${escapeHtml(r.status.toUpperCase())}</span></article>`).join(''):'<div class="empty-card">No settlement requests yet.</div>';
  $('#sellerSettlementHistory').innerHTML=sellerSettlements.length?sellerSettlements.map(s=>`
    <article class="settlement-history-row"><div><strong>${money(s.amount_kes)}</strong><small>${escapeHtml(s.settlement_reference)} · ${formatDate(s.paid_at)}</small></div><span>${escapeHtml(s.status.toUpperCase())}</span></article>`).join(''):'<div class="empty-card">No Seller settlement has been recorded yet.</div>';
}
function editSettlementAccount(id){
  const a=settlementAccounts.find(x=>x.id===id);if(!a)return;
  $('#sellerSettlementAccountId').value=a.id;
  $('#sellerSettlementType').value=a.account_type;
  $('#sellerSettlementName').value=a.account_name||'';
  $('#sellerSettlementPhone').value=a.phone_number||'';
  $('#sellerSettlementTill').value=a.till_number||'';
  $('#sellerSettlementPaybill').value=a.paybill_number||'';
  $('#sellerSettlementAccountNumber').value=a.account_number||'';
  $('#sellerSettlementBank').value=a.bank_name||'';
  $('#sellerSettlementBranch').value=a.bank_branch||'';
  $('#sellerSettlementPrimary').checked=Boolean(a.is_primary);
  $('#cancelSettlementEdit').hidden=false;
  toggleSettlementFields();
  sellerSettlementPanel.scrollIntoView({behavior:'smooth',block:'start'});
}
$('#sellerSettlementAccountForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const phone=normalisePhone($('#sellerSettlementPhone').value);
  const payload={
    p_account_id:$('#sellerSettlementAccountId').value||null,
    p_account_type:$('#sellerSettlementType').value,
    p_account_name:$('#sellerSettlementName').value.trim(),
    p_phone_number:$('#sellerSettlementType').value==='mpesa_mobile'?phone:null,
    p_till_number:$('#sellerSettlementType').value==='mpesa_till'?$('#sellerSettlementTill').value.trim():null,
    p_paybill_number:$('#sellerSettlementType').value==='mpesa_paybill'?$('#sellerSettlementPaybill').value.trim():null,
    p_account_number:['mpesa_paybill','bank'].includes($('#sellerSettlementType').value)?$('#sellerSettlementAccountNumber').value.trim():null,
    p_bank_name:$('#sellerSettlementType').value==='bank'?$('#sellerSettlementBank').value.trim():null,
    p_bank_branch:$('#sellerSettlementType').value==='bank'?$('#sellerSettlementBranch').value.trim():null,
    p_make_primary:$('#sellerSettlementPrimary').checked
  };
  status($('#sellerSettlementStatus'),'Sending account to LEOGO Admin for verification…');
  const {error}=await client.rpc('seller_submit_settlement_account',payload);
  if(error){status($('#sellerSettlementStatus'),error.message,'error');return;}
  resetSettlementForm();
  status($('#sellerSettlementStatus'),'Settlement account submitted. Admin approval is required before it can receive money.','success');
  await Promise.all([loadSellerSettlementData(),loadPartnerNotifications()]);
});
toggleSettlementFields();

$('#sellerSettlementRequestForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const accountId=$('#sellerSettlementRequestAccount').value;
  const amount=Number($('#sellerSettlementRequestAmount').value);
  const note=$('#sellerSettlementRequestNote').value.trim();
  if(!accountId){status($('#sellerSettlementRequestStatus'),'Choose an approved settlement account.','error');return;}
  if(!amount||amount<=0){status($('#sellerSettlementRequestStatus'),'Enter the amount you want to request.','error');return;}
  const button=$('#sellerSettlementRequestButton');
  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';
  status($('#sellerSettlementRequestStatus'),'Sending settlement request to LEOGO Admin…');
  try{
    const {error}=await client.rpc('seller_request_settlement',{p_account_id:accountId,p_amount_kes:amount,p_note:note||null});
    if(error)throw error;
    e.target.reset();
    status($('#sellerSettlementRequestStatus'),'Settlement request submitted to Admin for review.','success');
    await Promise.all([loadSellerSettlementData(),loadPartnerNotifications(),loadSellerEarnings()]);
  }catch(error){status($('#sellerSettlementRequestStatus'),error.message||'Settlement request could not be submitted.','error');}
  finally{button.disabled=false;button.textContent=original;}
});

function sellerCoordinatesFromSharedLocation(value=''){
  const text=String(value||'').trim();
  const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
  const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
  if(maps)return {lat:Number(maps[1]),lng:Number(maps[2])};
  return null;
}
function setSellerShopCoordinates(lat,lng,{source='Shop location pinned'}={}){
  const latitude=Number(lat),longitude=Number(lng);
  const target=$('#sellerShopPinStatus');
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    if(target){target.textContent='Invalid shop coordinates. Pin the shop again or enter valid coordinates.';target.className='status error';}
    return false;
  }
  $('#sellerShopLatitude').value=latitude.toFixed(7);
  $('#sellerShopLongitude').value=longitude.toFixed(7);
  if(!$('#sellerShopMapLink').value.trim())$('#sellerShopMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
  if(target){target.textContent='✓ '+source+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='status success';}
  return true;
}
$('#pinSellerShopLocation')?.addEventListener('click',()=>{
  const target=$('#sellerShopPinStatus');
  if(!navigator.geolocation){
    if(target){target.textContent='This browser cannot access location. Paste a Google Maps/shared-location link or enter the shop coordinates.';target.className='status error';}
    return;
  }
  if(target){target.textContent='Getting the shop location…';target.className='status';}
  navigator.geolocation.getCurrentPosition((position)=>{
    setSellerShopCoordinates(position.coords.latitude,position.coords.longitude,{source:'Shop pinned'});
  },(error)=>{
    if(target){
      target.textContent=error.code===1
        ? 'Location permission was not granted. Allow location access while at the shop, or paste a Maps link/coordinates.'
        : 'The shop location could not be detected. Try again at the shop or paste a Maps link/coordinates.';
      target.className='status error';
    }
  },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
});
$('#sellerShopMapLink')?.addEventListener('change',(event)=>{
  const coords=sellerCoordinatesFromSharedLocation(event.currentTarget.value);
  if(coords)setSellerShopCoordinates(coords.lat,coords.lng,{source:'Coordinates detected from shared location'});
});

$('#showSellerRegistration').addEventListener('click',()=>{sellerOnboarding.hidden=true;sellerReg.hidden=false;sellerReg.scrollIntoView({behavior:'smooth'});});

sellerReg.addEventListener('submit',async e=>{
  e.preventDefault();const phone=normalisePhone($('#sellerPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#sellerRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  const shopLatitude=Number($('#sellerShopLatitude').value);
  const shopLongitude=Number($('#sellerShopLongitude').value);
  if(!Number.isFinite(shopLatitude)||shopLatitude<-90||shopLatitude>90||!Number.isFinite(shopLongitude)||shopLongitude<-180||shopLongitude>180){status($('#sellerRegistrationStatus'),'Pin the exact shop location and confirm valid latitude and longitude before submitting.','error');return;}
  status($('#sellerRegistrationStatus'),'Uploading business documents…');
  try{
    const businessIdFile=$('#sellerBusinessIdDocument').files[0];
    const existingBusinessId=seller?.business_id_document_path||null;
    if(!businessIdFile&&!existingBusinessId)throw new Error('Business ID / identification document is required.');
    const otherFiles=[...$('#sellerOtherPermits').files];
    if(otherFiles.length>4)throw new Error('Choose a maximum of 4 other permit files.');
    const [businessIdPath,businessLicencePath,registrationCertificatePath,otherPermitPaths]=await Promise.all([
      businessIdFile?uploadSellerVerification(businessIdFile,'business-id'):Promise.resolve(existingBusinessId),
      $('#sellerBusinessLicence').files[0]?uploadSellerVerification($('#sellerBusinessLicence').files[0],'business-licence'):Promise.resolve(seller?.business_licence_path||null),
      $('#sellerRegistrationCertificate').files[0]?uploadSellerVerification($('#sellerRegistrationCertificate').files[0],'registration-certificate'):Promise.resolve(seller?.registration_certificate_path||null),
      otherFiles.length?Promise.all(otherFiles.map((file,index)=>uploadSellerVerification(file,'permit-'+index))):Promise.resolve(seller?.other_permit_paths||[])
    ]);
    const sellerProfilePayload={
      business_name:$('#sellerBusinessName').value.trim(),owner_name:$('#sellerOwnerName').value.trim(),
      id_number:$('#sellerIdNumber').value.trim(),phone,
      county_code:$('#sellerCounty').value,sub_county_code:$('#sellerSubCounty').value,
      town:$('#sellerTown').value.trim(),location_details:$('#sellerLocation').value.trim(),
      business_description:$('#sellerDescription').value.trim()||null,
      business_id_document_path:businessIdPath,business_licence_path:businessLicencePath,
      registration_certificate_path:registrationCertificatePath,other_permit_paths:otherPermitPaths,
      shop_latitude:shopLatitude,shop_longitude:shopLongitude,shop_map_link:$('#sellerShopMapLink').value.trim()||null
    };
    status($('#sellerRegistrationStatus'),seller?.application_status==='approved'?'Sending profile changes to LEOGO Admin…':'Submitting seller application…');
    const {error}=seller?.application_status==='approved'
      ? await client.rpc('partner_submit_profile_change',{p_partner_type:'seller',p_payload:sellerProfilePayload})
      : await client.rpc('submit_seller_application',{
          p_business_name:sellerProfilePayload.business_name,p_owner_name:sellerProfilePayload.owner_name,
          p_id_number:sellerProfilePayload.id_number,p_phone:phone,
          p_county:$('#sellerCounty').selectedOptions[0]?.textContent||'',p_sub_county:$('#sellerSubCounty').selectedOptions[0]?.textContent||'',
          p_town:sellerProfilePayload.town,p_location_details:sellerProfilePayload.location_details,
          p_business_description:sellerProfilePayload.business_description,
          p_county_code:sellerProfilePayload.county_code,p_sub_county_code:sellerProfilePayload.sub_county_code,
          p_business_id_document_path:businessIdPath,p_business_licence_path:businessLicencePath,
          p_registration_certificate_path:registrationCertificatePath,p_other_permit_paths:otherPermitPaths,
          p_shop_latitude:shopLatitude,p_shop_longitude:shopLongitude,p_shop_map_link:sellerProfilePayload.shop_map_link
        });
    if(error)throw error;
  }catch(error){status($('#sellerRegistrationStatus'),error.message||'Seller application could not be submitted.','error');return;}
  if(seller?.application_status==='approved'){
    status($('#sellerRegistrationStatus'),'Profile changes sent to LEOGO Admin. Your current approved Seller profile remains active until approval.','success');
    status($('#sellerProfileEditStatus'),'Profile changes are awaiting Admin approval. Your current approved profile is still active.','success');
    sellerReg.hidden=true;
    openSellerView('profile');
    await loadPartnerNotifications().catch(()=>{});
  }else{
    status($('#sellerRegistrationStatus'),'Seller application submitted to LEOGO Admin for approval.','success');
    await loadSeller();
    sellerReg.hidden=true;
    sellerDashboard.hidden=false;
    sellerDashboard.scrollIntoView({behavior:'smooth'});
  }
});


sellerDocsForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!seller)return;
  try{
    status($('#sellerVerificationDocumentsStatus'),'Uploading verification documents…');
    const businessIdFile=$('#dashboardBusinessIdDocument').files[0];
    const existingBusinessId=seller.business_id_document_path||null;
    if(!businessIdFile && !existingBusinessId)throw new Error('Business ID / identification document is required.');
    const otherFiles=[...$('#dashboardOtherPermits').files];
    if(otherFiles.length>4)throw new Error('Choose a maximum of 4 other permit files.');
    const [businessIdPath,businessLicencePath,registrationCertificatePath,otherPermitPaths]=await Promise.all([
      businessIdFile?uploadSellerVerification(businessIdFile,'business-id'):Promise.resolve(existingBusinessId),
      $('#dashboardBusinessLicence').files[0]?uploadSellerVerification($('#dashboardBusinessLicence').files[0],'business-licence'):Promise.resolve(seller.business_licence_path||null),
      $('#dashboardRegistrationCertificate').files[0]?uploadSellerVerification($('#dashboardRegistrationCertificate').files[0],'registration-certificate'):Promise.resolve(seller.registration_certificate_path||null),
      otherFiles.length?Promise.all(otherFiles.map((file,index)=>uploadSellerVerification(file,'permit-'+index))):Promise.resolve(seller.other_permit_paths||[])
    ]);
    const {error}=await client.rpc('update_seller_verification_documents',{
      p_business_id_document_path:businessIdPath,
      p_business_licence_path:businessLicencePath,
      p_registration_certificate_path:registrationCertificatePath,
      p_other_permit_paths:otherPermitPaths
    });
    if(error)throw error;
    status($('#sellerVerificationDocumentsStatus'),'Verification documents saved for Admin review.','success');
    e.target.reset();
    await loadSeller();
  }catch(error){status($('#sellerVerificationDocumentsStatus'),error.message||'Documents could not be saved.','error');}
});

function sellerReviewStars(rating){
  const value=Math.max(0,Math.min(5,Number(rating||0)));
  return '★'.repeat(value)+'☆'.repeat(5-value);
}
function filteredSellerReviews(){
  const term=($('#sellerReviewSearch')?.value||'').trim().toLowerCase();
  const rating=$('#sellerReviewRatingFilter')?.value||'all';
  return sellerReviews.filter(review=>{
    const haystack=[
      review.product_name,review.variant_name,review.order_reference,
      review.comment
    ].map(value=>String(value||'').toLowerCase());
    return (!term||haystack.some(value=>value.includes(term)))
      && (rating==='all'||Number(review.rating)===Number(rating));
  });
}
function renderSellerReviews(){
  const list=$('#sellerReviewList');
  if(!list)return;

  const rows=filteredSellerReviews();
  const total=sellerReviews.length;
  const average=total?sellerReviews.reduce((sum,row)=>sum+Number(row.rating||0),0)/total:0;
  const fiveStars=sellerReviews.filter(row=>Number(row.rating)===5).length;

  $('#sellerReviewCount').textContent=total;
  $('#sellerReviewsTotal').textContent=total;
  $('#sellerReviewsAverage').textContent=average.toFixed(1);
  $('#sellerFiveStarReviews').textContent=fiveStars;
  $('#sellerReviewBadge').hidden=!total;
  $('#sellerReviewBadge').textContent=total>99?'99+':String(total);

  list.innerHTML=rows.length?rows.map(review=>
    '<article class="seller-review-card" data-seller-review="'+escapeHtml(review.review_id)+'">'+
      '<header><div><span>VERIFIED PURCHASE REVIEW</span><h4>'+escapeHtml(review.product_name)+(review.variant_name?' · '+escapeHtml(review.variant_name):'')+'</h4><small>Order '+escapeHtml(review.order_reference)+'</small></div>'+
      '<div class="seller-review-rating"><strong>'+sellerReviewStars(review.rating)+'</strong><span>'+Number(review.rating)+'/5</span></div></header>'+
      '<div class="seller-review-comment"><p>'+escapeHtml(review.comment||'Customer submitted a rating without a written comment.')+'</p></div>'+
      '<div class="seller-review-meta">'+
        '<span><small>Approved</small><strong>'+formatDate(review.approved_at||review.review_created_at)+'</strong></span>'+
        '<span><small>Product rating</small><strong>'+Number(review.product_rating_average||0).toFixed(1)+' / 5</strong></span>'+
        '<span><small>Approved reviews</small><strong>'+Number(review.product_review_count||0)+'</strong></span>'+
      '</div>'+
      '<footer><b>✓ LEOGO Verified Purchase</b><button type="button" class="secondary" data-review-order-ref="'+escapeHtml(review.order_reference)+'">View Completed Order</button></footer>'+
    '</article>'
  ).join(''):'<div class="empty-card">No approved product reviews match this filter.</div>';
}
async function loadSellerReviews(){
  if(!currentUser||seller?.application_status!=='approved')return;
  const {data,error}=await client.rpc('seller_list_product_reviews');
  if(error){
    console.error('Seller product reviews could not load:',error);
    return;
  }
  sellerReviews=Array.isArray(data)?data:[];
  renderSellerReviews();
  renderSellerOrders();
}

async function loadSellerOrders(){
  if(!currentUser||seller?.application_status!=='approved')return;
  const {data,error}=await client.rpc('seller_list_marketplace_orders');
  if(error){console.error(error);return;}
  sellerOrders=data||[];
  renderSellerOrders();
}
function orderPaymentLabel(status){
  return {
    submitted:'PAYMENT SUBMITTED — VERIFYING',
    verified_paid:'PAID',
    cod_due:'COD — PAYMENT DUE',
    cod_paid:'PAID ON DELIVERY',
    rejected:'PAYMENT REJECTED'
  }[status]||String(status||'').replaceAll('_',' ').toUpperCase();
}
function sellerOrderAddress(order){
  if(order.delivery_zone==='pickup')return 'Pickup station';
  return [order.estate,order.landmark,order.sub_county,order.county].filter(Boolean).join(', ')||'Delivery address unavailable';
}
function renderSellerOrders(){
  const rows=sellerOrderFilter==='all'?sellerOrders:sellerOrders.filter(o=>o.fulfilment_status===sellerOrderFilter);
  const newCount=sellerOrders.filter(o=>o.fulfilment_status==='new').length;
  $('#sellerOrderBadge').hidden=!newCount;
  $('#sellerOrderBadge').textContent=newCount;
  $('#sellerOrderCount').textContent=sellerOrders.filter(o=>!['delivered','cancelled'].includes(o.fulfilment_status)).length;
  $('#sellerOrderList').innerHTML=rows.length?rows.map(o=>{
    const items=(o.items||[]).map(i=>'<li>'+escapeHtml(i.product_name)+(i.variant_name?' — <b>'+escapeHtml(i.variant_name)+'</b>':'')+' × '+Number(i.quantity)+' <strong>'+money(i.line_total_kes)+'</strong></li>').join('');
    const reviewsForOrder=sellerReviews.filter(review=>review.order_reference===o.order_reference);
    const next=o.fulfilment_status==='new'
      ? '<button data-order-next="received" data-seller-order-id="'+escapeHtml(o.seller_order_id)+'">Mark Received</button>'
      : o.fulfilment_status==='received'
        ? '<button data-order-next="packed_ready" data-seller-order-id="'+escapeHtml(o.seller_order_id)+'">Packed & Ready for Pickup</button>'
        : '';
    const reviewSummary=reviewsForOrder.length
      ? '<button type="button" class="secondary seller-order-review-link" data-open-order-reviews="'+escapeHtml(o.order_reference)+'">★ '+reviewsForOrder.length+' Approved Product Review'+(reviewsForOrder.length===1?'':'s')+'</button>'
      : '';
    return '<article class="seller-order-card" data-order-reference="'+escapeHtml(o.order_reference)+'"><header><div><span>'+escapeHtml(o.order_reference)+'</span><h4>'+escapeHtml(o.receiver_name)+'</h4><small>'+formatDate(o.created_at)+'</small></div><div><b class="order-status '+escapeHtml(o.fulfilment_status)+'">'+escapeHtml(o.fulfilment_status.replaceAll('_',' ').toUpperCase())+'</b><b class="payment-status">'+escapeHtml(orderPaymentLabel(o.payment_status))+'</b></div></header><div class="seller-order-body"><ul>'+items+'</ul><div class="seller-order-meta"><span><small>Seller subtotal</small><strong>'+money(o.seller_subtotal_kes)+'</strong></span><span><small>Customer phone</small><strong>'+escapeHtml(o.contact_number)+'</strong></span><span><small>Delivery</small><strong>'+escapeHtml(sellerOrderAddress(o))+'</strong></span><span><small>Order status</small><strong>'+escapeHtml((o.order_status||'').replaceAll('_',' ').toUpperCase())+'</strong></span><span><small>LEOGO Rider</small><strong>'+escapeHtml(o.rider_name||'Awaiting assignment')+'</strong></span><span><small>Delivery status</small><strong>'+escapeHtml((o.delivery_status||'awaiting_assignment').replaceAll('_',' ').toUpperCase())+'</strong></span></div></div><footer>'+next+(o.fulfilment_status==='packed_ready'&&o.delivery_status!=='picked_up'?'<strong>Waiting for assigned LEOGO rider pickup</strong>':'')+(o.fulfilment_status==='delivered'?'<strong class="delivered-confirmation">✓ Delivered to customer</strong>':'')+reviewSummary+'</footer></article>';
  }).join(''):'<div class="empty-card">No orders match this filter.</div>';
  $$('[data-order-next]').forEach(button=>button.addEventListener('click',async()=>{
    const label=button.textContent;button.disabled=true;button.textContent='Updating…';
    const {error}=await client.rpc('seller_update_order_status',{p_seller_order_id:button.dataset.sellerOrderId,p_status:button.dataset.orderNext});
    if(error){alert(error.message);button.disabled=false;button.textContent=label;return;}
    await Promise.all([loadSellerOrders(),loadPartnerNotifications()]);
  }));
  $$('[data-open-order-reviews]').forEach(button=>button.addEventListener('click',()=>{
    openSellerView('reviews');
    if($('#sellerReviewSearch')) $('#sellerReviewSearch').value=button.dataset.openOrderReviews;
    renderSellerReviews();
    window.setTimeout(()=>$('#sellerReviewList')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
  }));

}
$$('[data-seller-order-filter]').forEach(button=>button.addEventListener('click',()=>{
  sellerOrderFilter=button.dataset.sellerOrderFilter;
  $$('[data-seller-order-filter]').forEach(b=>b.classList.toggle('active',b===button));
  renderSellerOrders();
}));
$('#refreshSellerOrders').addEventListener('click',async()=>{const b=$('#refreshSellerOrders');b.disabled=true;await loadSellerOrders();b.disabled=false;});
$('#refreshSellerReviews')?.addEventListener('click',async()=>{
  const button=$('#refreshSellerReviews');
  button.disabled=true;
  await loadSellerReviews();
  button.disabled=false;
});
$('#sellerReviewSearch')?.addEventListener('input',renderSellerReviews);
$('#sellerReviewRatingFilter')?.addEventListener('change',renderSellerReviews);
$('#sellerReviewList')?.addEventListener('click',(event)=>{
  const button=event.target.closest?.('[data-review-order-ref]');
  if(!button)return;
  const order=sellerOrders.find(row=>row.order_reference===button.dataset.reviewOrderRef);
  openSellerView('orders');
  window.setTimeout(()=>{
    const card=[...document.querySelectorAll('.seller-order-card')].find(item=>item.dataset.orderReference===button.dataset.reviewOrderRef);
    card?.scrollIntoView({behavior:'smooth',block:'start'});
  },80);
});


async function loadTaxonomy(){
  const select=$('#productCategory');
  const staticTaxonomy=window.LEOGO_PRODUCT_TAXONOMY||{};
  if(Array.isArray(staticTaxonomy.categories)&&staticTaxonomy.categories.length){
    categories=staticTaxonomy.categories;
    subcategories=Array.isArray(staticTaxonomy.subcategories)?staticTaxonomy.subcategories:[];
    renderTaxonomyOptions();
  }else if(select){
    select.innerHTML='<option value="">Loading categories…</option>';
  }

  try{
    const rpcPromise=client.rpc('seller_product_taxonomy');
    const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Taxonomy request timed out')),5000));
    const {data,error}=await Promise.race([rpcPromise,timeoutPromise]);
    if(error)throw error;
    if(Array.isArray(data?.categories)&&data.categories.length){
      categories=data.categories;
      subcategories=Array.isArray(data?.subcategories)?data.subcategories:[];
      renderTaxonomyOptions();
    }
  }catch(error){
    if(!categories.length){
      if(select)select.innerHTML='<option value="">Categories unavailable — refresh page</option>';
      status($('#productFormStatus'),'Categories could not load: '+error.message,'error');
    }else{
      console.warn('Using embedded LEOGO taxonomy fallback:',error.message);
    }
  }
}
function renderTaxonomyOptions(){
  const select=$('#productCategory');
  if(!select)return;
  const current=select.value;
  const assignable=categories.filter(x=>x.is_active!==false&&x.is_assignable);
  select.innerHTML='<option value="">Choose category</option>'+assignable.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join('');
  if(assignable.some(x=>x.id===current))select.value=current;
  renderSubcategories();
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function updateOtherSpecifyFields(){
  const category=categories.find(x=>x.id===$('#productCategory').value);
  const subcategory=subcategories.find(x=>x.id===$('#productSubcategory').value);
  const categoryOther=category?.code==='other';
  const subcategoryOther=subcategory?.code==='others';
  $('#productCustomCategoryWrap').hidden=!categoryOther;
  $('#productCustomCategory').required=categoryOther;
  if(!categoryOther)$('#productCustomCategory').value='';
  $('#productCustomSubcategoryWrap').hidden=!subcategoryOther;
  $('#productCustomSubcategory').required=subcategoryOther;
  if(!subcategoryOther)$('#productCustomSubcategory').value='';
}
function renderSubcategories(){
  const categorySelect=$('#productCategory');
  const subSelect=$('#productSubcategory');
  if(!categorySelect||!subSelect)return;
  const cat=categorySelect.value;
  const current=subSelect.value;
  const rows=subcategories.filter(x=>x.is_active!==false&&x.category_id===cat).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
  subSelect.innerHTML='<option value="">'+(rows.length?'Choose sub-category (optional)':'No sub-category required')+'</option>'+rows.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join('');
  if(rows.some(x=>x.id===current))subSelect.value=current;
  const selected=categories.find(x=>x.id===cat);
  $('#restrictedCategoryNotice').hidden=!selected?.restricted_category;
  updateOtherSpecifyFields();
}
$('#productCategory').addEventListener('change',renderSubcategories);
$('#productSubcategory').addEventListener('change',updateOtherSpecifyFields);
$('#productUnit').addEventListener('change',()=>{$('#productOtherUnitWrap').hidden=$('#productUnit').value!=='other';});
$('#productHasVariants').addEventListener('change',()=>{$('#variantSection').hidden=!$('#productHasVariants').checked;if($('#productHasVariants').checked&&!$('#variantRows').children.length)addVariantRow();});
$('#productLpp').addEventListener('change',()=>{$('#lppFields').hidden=!$('#productLpp').checked;});
$('#addVariantRow').addEventListener('click',addVariantRow);
function addVariantRow(v={}){
  const row=document.createElement('div');
  row.className='variant-row';
  row.dataset.existingImage=v.image_path||'';
  const imageUrl=v.image_path?publicUrl(v.image_path):'';
  row.innerHTML=
    '<label class="variant-image-field"><span>Variant picture</span>'+
      '<div class="variant-image-preview">'+
        (imageUrl?'<img data-variant-preview src="'+escapeHtml(imageUrl)+'" alt="'+escapeHtml(v.variant_name||'Variant')+' picture">':'<div data-variant-preview-placeholder>📷</div>')+
      '</div>'+
      '<input data-variant-image type="file" accept="image/jpeg,image/png,image/webp">'+
      '<small>'+(v.image_path?'Current picture will remain unless replaced.':'Add a profile picture for this variant.')+'</small>'+
    '</label>'+
    '<label><span>Variant name</span><input data-variant-name placeholder="e.g. Cocacola" value="'+escapeHtml(v.variant_name||'')+'" required></label>'+
    '<label><span>Amount (KSh)</span><input data-variant-price type="number" min="0" step="0.01" placeholder="Amount in KSh" value="'+(v.price_kes??'')+'" required></label>'+
    '<label><span>Quantity available</span><input data-variant-qty type="number" min="0" step="0.001" placeholder="Quantity" value="'+(v.quantity_available??0)+'" required></label>'+
    '<button class="variant-remove" type="button" aria-label="Remove variant">× Remove Variant</button>';
  const fileInput=$('[data-variant-image]',row);
  fileInput.addEventListener('change',()=>{
    const file=fileInput.files[0];
    if(!file)return;
    const holder=$('.variant-image-preview',row);
    const img=document.createElement('img');
    img.dataset.variantPreview='';
    img.alt=($('[data-variant-name]',row).value.trim()||'Variant')+' picture';
    img.src=URL.createObjectURL(file);
    holder.innerHTML='';
    holder.append(img);
  });
  $('.variant-remove',row).addEventListener('click',()=>row.remove());
  $('#variantRows').append(row);
}

async function uploadImage(file,prefix){
  if(!file)return null;
  if(file.size>6291456)throw new Error('Each image must be 6 MB or smaller.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('seller-product-media').upload(path,file,{upsert:false});
  if(error)throw error;return path;
}
const publicUrl=path=>path?client.storage.from('seller-product-media').getPublicUrl(path).data.publicUrl:'';
function sellerMediaMarkup(path,alt='',variant=false){
  const placeholderClass=variant?'saved-variant-image-placeholder':'product-main-thumb-placeholder';
  if(!path){
    return '<div class="'+placeholderClass+'" role="img" aria-label="'+escapeHtml(alt||'Product')+' image unavailable">📷</div>';
  }
  const className=variant?'':' class="product-main-thumb"';
  return '<img'+className+' data-seller-media-image src="'+escapeHtml(publicUrl(path))+'" alt="'+escapeHtml(alt||'Product image')+'">';
}
function installSellerMediaFallback(root){
  if(!root)return;
  Array.from(root.querySelectorAll('[data-seller-media-image]')).forEach(img=>img.addEventListener('error',()=>{
    const variant=Boolean(img.closest('.saved-variant-chip'));
    const fallback=document.createElement('div');
    fallback.className=variant?'saved-variant-image-placeholder':'product-main-thumb-placeholder';
    fallback.setAttribute('role','img');
    fallback.setAttribute('aria-label',(img.alt||'Product')+' image unavailable');
    fallback.textContent='📷';
    img.replaceWith(fallback);
  },{once:true}));
}

async function loadProducts(options={}){
  const focusProductId=options?.focusProductId||null;
  if(!currentUser){
    products=[];
    renderProducts();
    return products;
  }

  const box=$('#sellerProductList');
  if(box && !products.length){
    box.innerHTML='<div class="loading-card">Loading your saved products…</div>';
  }

  try{
    // Preferred path: one Seller-scoped backend function returns parent products
    // together with their variants, avoiding relationship/RLS race conditions.
    const {data,error}=await client.rpc('seller_list_own_products');
    if(error)throw error;
    products=Array.isArray(data)?data:[];
  }catch(rpcError){
    console.warn('Seller product RPC load failed; using direct fallback:',rpcError);

    // Safe fallback so the Seller is never left with a blank product list.
    const {data,error}=await client
      .from('seller_products')
      .select('*')
      .eq('seller_id',currentUser.id)
      .order('updated_at',{ascending:false});

    if(error){
      console.error('Seller products load failed:',error);
      products=[];
      if(box)box.innerHTML='<div class="empty-card">Products could not load: '+escapeHtml(error.message||'Unknown error')+'</div>';
      status($('#productFormStatus'),error.message||'Products could not load.','error');
      return products;
    }

    products=(data||[]).map(product=>({...product,seller_product_variants:[]}));

    if(products.length){
      const ids=products.map(product=>product.id);
      const {data:variantData,error:variantError}=await client
        .from('seller_product_variants')
        .select('*')
        .in('product_id',ids)
        .order('display_order',{ascending:true});
      if(variantError){
        console.warn('Seller product variants fallback load failed:',variantError);
      }else{
        const byProduct=new Map();
        (variantData||[]).forEach(variant=>{
          if(!byProduct.has(variant.product_id))byProduct.set(variant.product_id,[]);
          byProduct.get(variant.product_id).push(variant);
        });
        products=products.map(product=>({
          ...product,
          seller_product_variants:byProduct.get(product.id)||[]
        }));
      }
    }
  }

  // Normalize RPC JSON so rendering/editing always sees the same shape.
  products=products.map(product=>({
    ...product,
    seller_product_variants:Array.isArray(product.seller_product_variants)?product.seller_product_variants:[]
  }));

  renderProducts();

  if(focusProductId){
    requestAnimationFrame(()=>{
      const card=document.querySelector('[data-product-card="'+CSS.escape(String(focusProductId))+'"]');
      if(card){
        card.classList.add('product-card-saved');
        card.scrollIntoView({behavior:'smooth',block:'center'});
        window.setTimeout(()=>card.classList.remove('product-card-saved'),2600);
      }
    });
  }

  return products;
}
function renderFlashSaleProducts(){
  const select=$('#flashSaleProduct');
  if(!select)return;
  const eligible=products.filter(p=>p.listing_status!=='suspended');
  const current=select.value;
  select.innerHTML='<option value="">Choose product…</option>'+eligible.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.product_name)+' — '+money(p.price_kes)+'</option>').join('');
  if(eligible.some(p=>p.id===current))select.value=current;
  const selected=products.find(p=>p.id===select.value);
  $('#flashSaleNormalPrice').value=selected?money(selected.price_kes):'';
  const flashItems=products.filter(p=>p.flash_sale_requested || ['requested','approved'].includes(p.flash_sale_status));
  $('#sellerFlashSaleList').innerHTML=flashItems.length?flashItems.map(p=>'<article class="product-card"><img src="'+escapeHtml(publicUrl(p.main_image_path))+'" alt=""><div><h4>'+escapeHtml(p.product_name)+'</h4><p>Normal '+money(p.price_kes)+' · Flash '+money(p.flash_sale_price_kes)+'</p><span class="badge flash">'+escapeHtml((p.flash_sale_status||'requested').replaceAll('_',' '))+'</span><small>Qty '+Number(p.flash_sale_quantity||0)+' · '+formatDate(p.flash_sale_starts_at)+' → '+formatDate(p.flash_sale_ends_at)+'</small></div></article>').join(''):'<div class="empty-card">No products have been sent to Flash Sale yet.</div>';
}
function renderProducts(){
  const productCount=$('#sellerProductCount');
  const availableCount=$('#sellerAvailableCount');
  const flashCount=$('#sellerFlashCount');
  if(productCount)productCount.textContent=products.length;
  if(availableCount)availableCount.textContent=products.filter(p=>p.availability_status==='available'&&p.listing_status==='active').length;
  if(flashCount)flashCount.textContent=products.filter(p=>p.flash_sale_requested || ['requested','approved'].includes(p.flash_sale_status)).length;

  const box=$('#sellerProductList');
  if(!box)return;

  if(!products.length){
    box.innerHTML='<div class="empty-card">No products yet. Use “Add Product” to create your first item.</div>';
    renderFlashSaleProducts();
    renderSellerDataSelection();
    return;
  }

  box.innerHTML=products.map(p=>{
    const variants=Array.isArray(p.seller_product_variants)?p.seller_product_variants:[];
    const missingVariantImages=variants.filter(v=>!v.image_path).length;
    const variantMarkup=p.has_variants
      ? '<div class="saved-product-variants">'+(
          variants.length
            ? variants.map(v=>'<div class="saved-variant-chip">'+
                sellerMediaMarkup(v.image_path,v.variant_name,true)+
                '<span><b>'+escapeHtml(v.variant_name)+'</b><small>'+money(v.price_kes)+' · Qty '+Number(v.quantity_available||0)+'</small></span>'+
              '</div>').join('')
            : '<div class="variant-warning">⚠ Variant product has no readable variants. Refresh or edit this product.</div>'
        )+(missingVariantImages
          ? '<div class="variant-warning">⚠ '+missingVariantImages+' variant image'+(missingVariantImages===1?'':'s')+' need to be re-uploaded. Open Edit to replace them.</div>'
          : '')+'</div>'
      : '';

    return '<article class="product-card seller-saved-product" data-product-card="'+escapeHtml(p.id)+'">'+
      sellerMediaMarkup(p.main_image_path,p.product_name,false)+
      '<div class="product-card-content">'+
        '<h4>'+escapeHtml(p.product_name)+'</h4>'+
        '<p>'+money(p.price_kes)+' · '+Number(p.quantity_available||0)+' '+escapeHtml(p.measurement_unit||'')+'</p>'+
        '<div><span class="badge">'+escapeHtml(String(p.availability_status||'').replaceAll('_',' '))+'</span>'+
          '<span class="badge">'+escapeHtml(String(p.listing_status||'').replaceAll('_',' '))+'</span>'+
          '<span class="badge">Admin: '+escapeHtml(String(p.product_approval_status||'pending').replaceAll('_',' '))+'</span>'+
          (p.has_variants?'<span class="badge">'+variants.length+' variant'+(variants.length===1?'':'s')+'</span>':'')+
          (p.flash_sale_requested?'<span class="badge flash">Flash Sale '+escapeHtml(p.flash_sale_status||'requested')+'</span>':'')+
        '</div>'+
        '<small>'+escapeHtml(String(p.prod…37608 tokens truncated…(item.read_at?'':'<button class="secondary" type="button" data-mark-accommodation-notification="'+escapeHtml(item.id)+'">Mark read</button>')+
      '</div>'+
    '</article>'
  ).join(''):'<div class="empty-card">No Accommodation notifications yet.</div>';

  $$('[data-mark-accommodation-notification]').forEach(button=>button.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.markAccommodationNotification});
    if(error){console.warn(error);return;}
    await loadAccommodationNotifications();
  }));
  $$('[data-open-accommodation-notification]').forEach(button=>button.addEventListener('click',async()=>{
    await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.openAccommodationNotification}).catch?.(()=>{});
    const target=accommodationNotificationTarget(button.dataset.accommodationNotificationView);
    openAccommodationView(target);
    if(target==='bookings')await loadAccommodationBookings().catch(()=>{});
    if(target==='properties')await loadAccommodationCatalogue().catch(()=>{});
    await loadAccommodationNotifications();
  }));
}
async function loadAccommodationNotifications(){
  if(!currentUser)return;
  const {data,error}=await client.from('partner_notifications').select('*').eq('user_id',currentUser.id).eq('partner_type','accommodation').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  accommodationNotifications=data||[];
  renderAccommodationNotifications();
}
function renderAccommodationProvider(){
  hideAccommodationBoot();
  accommodationOnboarding.hidden=true;
  accommodationReg.hidden=true;
  accommodationPendingArea.hidden=true;
  accommodationDashboard.hidden=true;

  if(!accommodationProvider){
    accommodationOnboarding.hidden=false;
    return;
  }
  const state=String(accommodationProvider.verification_status||'pending');
  const rows=accommodationSummaryRows();
  if(state==='approved'){
    accommodationDashboard.hidden=false;
    $('#accommodationSidebarBusiness').textContent=accommodationProvider.business_name||'Accommodation Provider';
    $('#accommodationSidebarStatus').textContent='APPROVED';
    $('#accommodationDashboardBusiness').textContent=accommodationProvider.business_name||'Accommodation Dashboard';
    $('#accommodationAccountMetric').textContent='Approved';
    $('#accommodationProfileSummary').innerHTML=rows.map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
    openAccommodationView('overview');
    return;
  }

  accommodationPendingArea.hidden=false;
  $('#accommodationPendingTitle').textContent=
    state==='changes_requested'?'Accommodation application needs correction':
    state==='rejected'?'Accommodation application not approved':
    state==='suspended'?'Accommodation Provider account suspended':
    state==='under_review'?'Accommodation application under review':'Accommodation Provider application submitted';
  $('#accommodationPendingMessage').textContent=accommodationStatusCopy(state);
  $('#accommodationApplicationSummary').innerHTML=rows.map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  const note=$('#accommodationAdminNote');
  note.hidden=!accommodationProvider.admin_notes;
  note.textContent=accommodationProvider.admin_notes?'Admin note: '+accommodationProvider.admin_notes:'';
  $('#editAccommodationApplication').hidden=!['changes_requested','rejected'].includes(state);
}
async function loadAccommodationProvider(){
  if(!currentUser)return;
  showAccommodationBoot();
  try{
    const result=await Promise.race([
      client.rpc('accommodation_provider_get_own_account'),
      waitTimeout(8000,'Accommodation Provider account is taking too long to load. Check your connection and tap Retry.')
    ]);
    if(result?.error)throw result.error;
    accommodationProvider=result?.data||null;
    renderAccommodationProvider();
    await ensureAccommodationLocations(accommodationProvider?.county_code||'',accommodationProvider?.sub_county_code||'');
    if(accommodationProvider)await loadAccommodationNotifications().catch(()=>{});
    if(accommodationProvider?.verification_status==='approved'){
      await loadAccommodationCatalogue().catch(error=>console.warn('Accommodation catalogue load failed:',error));
      await loadAccommodationBookings().catch(error=>console.warn('Accommodation bookings load failed:',error));
      const propertyIds=accommodationCatalogue.map(row=>row.id);
      if($('#accommodationPropertyMetric'))$('#accommodationPropertyMetric').textContent=propertyIds.length;
      if($('#accommodationBookingMetric'))$('#accommodationBookingMetric').textContent=String((accommodationBookings||[]).length);
    }
  }catch(error){
    console.error('Accommodation Provider portal boot failed:',error);
    showAccommodationBoot(error?.message||'The Accommodation Provider dashboard could not finish loading.',true);
    accommodationOnboarding.hidden=true;accommodationReg.hidden=true;accommodationPendingArea.hidden=true;accommodationDashboard.hidden=true;
  }
}

$('#addAccommodationProperty')?.addEventListener('click',()=>openAccommodationPropertyForm());
$('#refreshAccommodationCatalogue')?.addEventListener('click',()=>loadAccommodationCatalogue().catch(error=>status($('#accommodationCatalogueStatus'),error?.message||'Could not refresh listings.','error')));
$('#refreshAccommodationBookings')?.addEventListener('click',()=>loadAccommodationBookings().catch(error=>status($('#accommodationBookingStatus'),error?.message||'Could not refresh bookings.','error')));
$('#accommodationBookingFilter')?.addEventListener('change',renderAccommodationBookings);
$('#accommodationBookingList')?.addEventListener('click',(event)=>{
  const actionButton=event.target.closest?.('[data-accommodation-booking-action]');
  if(actionButton){respondAccommodationBooking(actionButton);return;}
  const pdfButton=event.target.closest?.('[data-accommodation-guest-pdf]');
  if(pdfButton){
    const item=accommodationBookings.find(row=>String(row.id)===String(pdfButton.dataset.accommodationGuestPdf));
    if(item)downloadAccommodationGuestPdf(item);
  }
});
$('#downloadAccommodationBookingReport')?.addEventListener('click',downloadAccommodationBookingReport);
$('#cancelAccommodationProperty')?.addEventListener('click',()=>{$('#accommodationPropertyForm').hidden=true;resetAccommodationPropertyForm();});
$('#cancelAccommodationUnit')?.addEventListener('click',()=>{$('#accommodationUnitForm').hidden=true;});
['accommodationBedOnlyPrice','accommodationBreakfast1Price','accommodationBreakfast2Price'].forEach(id=>{
  $('#'+id)?.addEventListener('input',syncAccommodationBasePrice);
});
$('#accommodationUnitGuests')?.addEventListener('input',()=>{
  syncAccommodationRateRequirements();
  syncAccommodationBasePrice();
});

$('#addAccommodationRate')?.addEventListener('click',()=>{
  const extras=collectAccommodationExtraRates();
  extras.push({rate_name:'',meal_plan:'other',occupancy_type:'custom',occupancy_pax:1,nightly_price_kes:''});
  const currentMain=collectAccommodationRates().slice(0,Number($('#accommodationUnitGuests').value||1)>=2?3:2);
  renderAccommodationRateRows([...currentMain,...extras]);
});
$('#accommodationPropertyForm')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!event.currentTarget.reportValidity())return;
  const button=event.currentTarget.querySelector('button[type="submit"]');const original=button.textContent;button.disabled=true;button.textContent='Saving…';
  try{
    const gallery=[...($('#accommodationPropertyGallery').files||[])];
    if(gallery.length>5)throw new Error('Choose a maximum of 5 property gallery photos.');
    const propertyId=$('#accommodationPropertyId').value||null;
    const existing=accommodationCatalogue.find(item=>String(item.id)===String(propertyId));
    const coverFile=$('#accommodationPropertyCover').files?.[0]||null;
    const [coverUrl,galleryUrls]=await Promise.all([
      coverFile?uploadAccommodationListingPhoto(coverFile,'property-cover'):Promise.resolve(existing?.cover_image_url||null),
      gallery.length?Promise.all(gallery.map(file=>uploadAccommodationListingPhoto(file,'property-gallery'))):Promise.resolve(existing?.gallery_image_urls||[])
    ]);
    const {error}=await client.rpc('accommodation_provider_save_property',{
      p_property_id:propertyId,p_property_name:$('#accommodationPropertyName').value.trim(),p_property_type:$('#accommodationPropertyType').value,
      p_county:$('#accommodationPropertyCounty').value.trim(),p_sub_county:$('#accommodationPropertySubCounty').value.trim()||null,
      p_town:$('#accommodationPropertyTown').value.trim(),p_public_location:$('#accommodationPropertyPublicLocation').value.trim(),
      p_description:$('#accommodationPropertyDescription').value.trim(),p_cover_image_url:coverUrl,p_gallery_image_urls:galleryUrls,
      p_amenities:accommodationArrayValue($('#accommodationPropertyAmenities').value),p_house_rules:$('#accommodationPropertyRules').value.trim()||null,
      p_check_in_time:$('#accommodationPropertyCheckIn').value,p_check_out_time:$('#accommodationPropertyCheckOut').value,
      p_latitude:accommodationProvider?.base_latitude??null,p_longitude:accommodationProvider?.base_longitude??null,p_map_link:accommodationProvider?.base_map_link||null,
      p_cancellation_policy:$('#accommodationPropertyCancellation').value.trim()||null,p_children_allowed:$('#accommodationChildrenAllowed').checked,
      p_pets_allowed:$('#accommodationPetsAllowed').checked,p_parking_available:$('#accommodationParkingAvailable').checked,
      p_wifi_available:$('#accommodationWifiAvailable').checked,p_breakfast_available:$('#accommodationBreakfastAvailable').checked,
      p_smoking_zone_allowed:$('#accommodationSmokingZoneAllowed').checked,
      p_accessibility_notes:$('#accommodationPropertyAccessibility').value.trim()||null,p_submit:true
    });
    if(error)throw error;
    status($('#accommodationPropertyStatus'),'Property saved and sent to LEOGO Admin for approval.','success');
    await Promise.all([loadAccommodationCatalogue(),loadAccommodationNotifications()]);
    window.setTimeout(()=>{$('#accommodationPropertyForm').hidden=true;},600);
  }catch(error){status($('#accommodationPropertyStatus'),error?.message||'Property could not be saved.','error');}
  finally{button.disabled=false;button.textContent=original;}
});
$('#accommodationUnitForm')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!event.currentTarget.reportValidity())return;
  const button=event.currentTarget.querySelector('button[type="submit"]');const original=button.textContent;button.disabled=true;button.textContent='Saving…';
  try{
    const gallery=[...($('#accommodationUnitGallery').files||[])];
    if(gallery.length>3)throw new Error('Choose a maximum of 3 room / unit gallery photos.');
    const propertyId=$('#accommodationUnitPropertyId').value,unitId=$('#accommodationUnitId').value||null;
    const property=accommodationCatalogue.find(item=>String(item.id)===String(propertyId));
    const existing=(property?.units||[]).find(item=>String(item.id)===String(unitId));
    syncAccommodationRateRequirements();
    const rates=collectAccommodationRates();
    const maxGuests=Number($('#accommodationUnitGuests').value||1);
    if(Number($('#accommodationBedOnlyPrice').value||0)<=0)throw new Error('Enter the Bed Only price.');
    if(Number($('#accommodationBreakfast1Price').value||0)<=0)throw new Error('Enter the Bed & Breakfast for 1 pax price.');
    if(maxGuests>=2&&Number($('#accommodationBreakfast2Price').value||0)<=0)throw new Error('Enter the Bed & Breakfast for 2 pax price.');
    for(const rate of rates){
      if(rate.rate_name.length<2)throw new Error('Every rate plan needs a name.');
      if(!rate.nightly_price_kes||rate.nightly_price_kes<=0)throw new Error('Every rate plan needs a valid nightly price.');
      if(!rate.occupancy_pax||rate.occupancy_pax<1)throw new Error('Every rate plan needs a valid guest / pax count.');
      if(rate.occupancy_pax>Number($('#accommodationUnitGuests').value))throw new Error(rate.rate_name+' exceeds this room’s maximum guests.');
    }
    syncAccommodationBasePrice();
    const imageFile=$('#accommodationUnitImage').files?.[0]||null;
    const [imageUrl,galleryUrls]=await Promise.all([
      imageFile?uploadAccommodationListingPhoto(imageFile,'unit-main'):Promise.resolve(existing?.unit_image_url||null),
      gallery.length?Promise.all(gallery.map(file=>uploadAccommodationListingPhoto(file,'unit-gallery'))):Promise.resolve(existing?.gallery_image_urls||[])
    ]);
    const {error}=await client.rpc('accommodation_provider_save_unit_with_rates',{
      p_unit_id:unitId,
      p_property_id:propertyId,
      p_room_category:$('#accommodationUnitCategory').value,
      p_unit_name:$('#accommodationUnitName').value.trim(),
      p_description:$('#accommodationUnitDescription').value.trim()||null,
      p_max_guests:Number($('#accommodationUnitGuests').value),
      p_beds_description:$('#accommodationUnitBeds').value.trim()||null,
      p_inventory_count:Number($('#accommodationUnitInventory').value),
      p_unit_image_url:imageUrl,
      p_gallery_image_urls:galleryUrls,
      p_amenities:accommodationArrayValue($('#accommodationUnitAmenities').value),
      p_rates:rates,
      p_submit:true
    });
    if(error)throw error;
    status($('#accommodationUnitStatus'),'Room / unit saved and sent to LEOGO Admin for approval.','success');
    await Promise.all([loadAccommodationCatalogue(),loadAccommodationNotifications()]);
    window.setTimeout(()=>{$('#accommodationUnitForm').hidden=true;},600);
  }catch(error){status($('#accommodationUnitStatus'),error?.message||'Room / unit could not be saved.','error');}
  finally{button.disabled=false;button.textContent=original;}
});

const ACCOMMODATION_DRAFT_KEY='leogo_accommodation_application_draft_v1';
const ACCOMMODATION_DRAFT_OPEN_KEY='leogo_accommodation_application_open_v1';

function saveAccommodationDraft(){
  if(!accommodationReg||accommodationReg.hidden||!currentUser)return;
  const ids=[
    'accommodationBusinessName','accommodationOwnerName','accommodationIdNumber','accommodationPhone','accommodationEmail',
    'accommodationCounty','accommodationSubCounty','accommodationTown','accommodationLocation','accommodationMapLink',
    'accommodationLatitude','accommodationLongitude','accommodationDescription'
  ];
  const values={};
  ids.forEach((id)=>{const el=$('#'+id);if(el)values[id]=el.value;});
  try{
    sessionStorage.setItem(ACCOMMODATION_DRAFT_KEY,JSON.stringify({user_id:currentUser.id,values,saved_at:Date.now()}));
    sessionStorage.setItem(ACCOMMODATION_DRAFT_OPEN_KEY,currentUser.id);
  }catch(_error){}
}
async function restoreAccommodationDraft(){
  if(!currentUser)return false;
  let draft=null;
  try{
    const raw=sessionStorage.getItem(ACCOMMODATION_DRAFT_KEY);
    draft=raw?JSON.parse(raw):null;
  }catch(_error){}
  if(!draft||draft.user_id!==currentUser.id||!draft.values)return false;
  await ensureAccommodationLocations(draft.values.accommodationCounty||'',draft.values.accommodationSubCounty||'').catch(()=>{});
  Object.entries(draft.values).forEach(([id,value])=>{const el=$('#'+id);if(el&&value!=null)el.value=value;});
  if(draft.values.accommodationLatitude&&draft.values.accommodationLongitude){
    const target=$('#accommodationPinStatus');
    if(target){
      target.textContent='✓ Location preserved: '+draft.values.accommodationLatitude+', '+draft.values.accommodationLongitude;
      target.className='status success';
    }
  }
  return true;
}
function clearAccommodationDraft(){
  try{
    sessionStorage.removeItem(ACCOMMODATION_DRAFT_KEY);
    sessionStorage.removeItem(ACCOMMODATION_DRAFT_OPEN_KEY);
  }catch(_error){}
}
function accommodationDraftWasOpen(){
  try{return Boolean(currentUser&&sessionStorage.getItem(ACCOMMODATION_DRAFT_OPEN_KEY)===currentUser.id);}catch{return false;}
}

async function openAccommodationRole(){
  activeRole='accommodation';
  if(cyberShell)cyberShell.hidden=true;
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  accommodationShell.hidden=false;
  authShell.hidden=true;
  if(hero)hero.hidden=true;
  const preserveDraft=accommodationDraftWasOpen();
  showAccommodationBoot();
  await loadAccommodationProvider();
  await mountPartnerSubscription('accommodation',accommodationDashboard).catch(()=>{});
  if(preserveDraft && accommodationProvider?.verification_status!=='approved' && accommodationProvider?.verification_status!=='suspended'){
    openAccommodationRegistration(Boolean(accommodationProvider),{preserveDraft:true});
    await restoreAccommodationDraft();
  }
}
function openAccommodationRegistration(editExisting=false,{preserveDraft=false}={}){
  accommodationOnboarding.hidden=true;
  accommodationPendingArea.hidden=true;
  accommodationDashboard.hidden=true;
  accommodationReg.hidden=false;
  const approvedEdit=Boolean(editExisting&&accommodationProvider?.verification_status==='approved');
  const submitButton=accommodationReg.querySelector('button[type="submit"]');
  if(submitButton)submitButton.textContent=approvedEdit?'Send Profile Changes for Approval':'Submit Accommodation Application';
  const title=accommodationReg.querySelector('.section-title h3');
  const copy=accommodationReg.querySelector('.section-title p');
  if(title)title.textContent=approvedEdit?'Edit Accommodation Provider Profile':'Operator / business verification';
  if(copy)copy.textContent=approvedEdit
    ? 'Your current approved profile stays active. These changes will only become active after LEOGO Admin approves them.'
    : 'These details identify the person or business responsible for accommodation listings. Verification documents remain private to authorized LEOGO Admin.';
  status($('#accommodationRegistrationStatus'),'');
  try{if(currentUser)sessionStorage.setItem(ACCOMMODATION_DRAFT_OPEN_KEY,currentUser.id);}catch(_error){}
  if(preserveDraft){
    if(editExisting&&accommodationProvider)populateAccommodationApplication();
  }else if(editExisting&&accommodationProvider){
    populateAccommodationApplication();
  }else{
    accommodationReg.reset();
    $('#accommodationOwnerName').value=currentUser?.user_metadata?.full_name||'';
    $('#accommodationEmail').value=currentUser?.email||'';
    $('#accommodationBusinessIdDocument').required=true;
    ensureAccommodationLocations().catch(console.warn);
  }
  accommodationReg.scrollIntoView({behavior:'smooth',block:'start'});
}

$('#retryAccommodationBoot')?.addEventListener('click',()=>openAccommodationRole());
$('#showAccommodationRegistration')?.addEventListener('click',()=>openAccommodationRegistration(false));
$('#editAccommodationApplication')?.addEventListener('click',()=>openAccommodationRegistration(true));
$('#editApprovedAccommodationProfile')?.addEventListener('click',()=>openAccommodationRegistration(true));
$('#cancelAccommodationRegistration')?.addEventListener('click',()=>{
  clearAccommodationDraft();
  accommodationProvider?renderAccommodationProvider():openAccommodationRole();
});
$('#accommodationPendingBack')?.addEventListener('click',showRolePicker);
$('#accommodationBackToPartnerships')?.addEventListener('click',showRolePicker);
$('#refreshAccommodationDashboard')?.addEventListener('click',()=>loadAccommodationProvider());
$('#accommodationNotificationsButton')?.addEventListener('click',()=>openAccommodationView('notifications'));
$('#refreshAccommodationNotifications')?.addEventListener('click',()=>loadAccommodationNotifications().catch(error=>console.warn(error)));
$('#markAllAccommodationNotificationsRead')?.addEventListener('click',async()=>{
  const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'accommodation'});
  if(error){console.warn(error);return;}
  await loadAccommodationNotifications();
});
$('#accommodationSidebarToggle')?.addEventListener('click',()=>{accommodationSidebar?.classList.add('open');$('#accommodationSidebarScrim')?.classList.add('open');});
$('#accommodationSidebarScrim')?.addEventListener('click',closeAccommodationSidebar);
$$('[data-accommodation-view]').forEach(button=>button.addEventListener('click',()=>openAccommodationView(button.dataset.accommodationView)));
$('#pinAccommodationLocation')?.addEventListener('click',()=>{
  const target=$('#accommodationPinStatus');
  if(!navigator.geolocation){
    if(target){target.textContent='Location access is unavailable. Paste a Google Maps link or enter coordinates.';target.className='status error';}
    return;
  }
  if(target){target.textContent='Getting accommodation location…';target.className='status';}
  navigator.geolocation.getCurrentPosition(
    position=>setAccommodationCoordinates(position.coords.latitude,position.coords.longitude,'Accommodation location pinned'),
    error=>{if(target){target.textContent=error.code===1?'Location permission was not granted. Paste a Maps link or coordinates instead.':'Accommodation location could not be detected.';target.className='status error';}},
    {enableHighAccuracy:true,timeout:15000,maximumAge:15000}
  );
});
$('#accommodationMapLink')?.addEventListener('change',event=>{
  const coords=accommodationCoordinatesFromText(event.currentTarget.value);
  if(coords)setAccommodationCoordinates(coords.lat,coords.lng,'Coordinates detected');
});
accommodationReg?.addEventListener('input',(event)=>{
  if(event.target?.type!=='file')saveAccommodationDraft();
});
accommodationReg?.addEventListener('change',(event)=>{
  if(event.target?.type!=='file')saveAccommodationDraft();
});

accommodationReg?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!accommodationReg.reportValidity())return;
  const phone=normalisePhone($('#accommodationPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#accommodationRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  const latitude=Number($('#accommodationLatitude').value),longitude=Number($('#accommodationLongitude').value);
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    status($('#accommodationRegistrationStatus'),'Pin the exact Accommodation location and confirm valid coordinates.','error');return;
  }
  const otherFiles=[...($('#accommodationOtherPermits').files||[])];
  if(otherFiles.length>4){status($('#accommodationRegistrationStatus'),'Choose a maximum of 4 other permit files.','error');return;}
  const button=accommodationReg.querySelector('button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';
  try{
    status($('#accommodationRegistrationStatus'),'Uploading Accommodation verification files…');
    const businessIdFile=$('#accommodationBusinessIdDocument').files?.[0]||null;
    const existingBusinessId=accommodationProvider?.business_id_document_path||null;
    if(!businessIdFile&&!existingBusinessId)throw new Error('Business ID / identification document is required.');
    const [businessIdPath,businessLicencePath,registrationCertificatePath,otherPermitPaths,profilePicturePath,passportPhotoPath]=await Promise.all([
      businessIdFile?uploadAccommodationPrivate(businessIdFile,'business-id'):Promise.resolve(existingBusinessId),
      $('#accommodationBusinessLicence').files?.[0]?uploadAccommodationPrivate($('#accommodationBusinessLicence').files[0],'business-licence'):Promise.resolve(accommodationProvider?.business_licence_path||null),
      $('#accommodationRegistrationCertificate').files?.[0]?uploadAccommodationPrivate($('#accommodationRegistrationCertificate').files[0],'registration-certificate'):Promise.resolve(accommodationProvider?.registration_certificate_path||null),
      otherFiles.length?Promise.all(otherFiles.map((file,index)=>uploadAccommodationPrivate(file,'permit-'+index))):Promise.resolve(accommodationProvider?.other_permit_paths||[]),
      $('#accommodationProfilePicture').files?.[0]?uploadAccommodationPublicPhoto($('#accommodationProfilePicture').files[0]):Promise.resolve(accommodationProvider?.profile_picture_path||null),
      $('#accommodationPassportPhoto').files?.[0]?uploadAccommodationPrivate($('#accommodationPassportPhoto').files[0],'passport-photo'):Promise.resolve(accommodationProvider?.passport_photo_path||null)
    ]);
    const county=kenyaCounties.find(item=>item.code===$('#accommodationCounty').value);
    const sub=kenyaSubcounties.find(item=>item.code===$('#accommodationSubCounty').value);
    const approvedEdit=accommodationProvider?.verification_status==='approved';
    const accommodationPayload={
      business_name:$('#accommodationBusinessName').value.trim(),
      owner_name:$('#accommodationOwnerName').value.trim(),
      id_number:$('#accommodationIdNumber').value.trim(),
      phone,
      email:$('#accommodationEmail').value.trim()||null,
      county_code:$('#accommodationCounty').value,
      county:county?.name||$('#accommodationCounty').selectedOptions[0]?.textContent||'',
      sub_county_code:$('#accommodationSubCounty').value,
      sub_county:sub?.name||$('#accommodationSubCounty').selectedOptions[0]?.textContent||'',
      town:$('#accommodationTown').value.trim(),
      location_details:$('#accommodationLocation').value.trim(),
      base_map_link:$('#accommodationMapLink').value.trim()||null,
      base_latitude:latitude,
      base_longitude:longitude,
      business_description:$('#accommodationDescription').value.trim()||null,
      profile_picture_path:profilePicturePath,
      passport_photo_path:passportPhotoPath,
      business_id_document_path:businessIdPath,
      business_licence_path:businessLicencePath,
      registration_certificate_path:registrationCertificatePath,
      other_permit_paths:otherPermitPaths
    };
    const result=approvedEdit
      ? await client.rpc('accommodation_provider_submit_profile_change',{p_payload:accommodationPayload})
      : await client.rpc('accommodation_provider_submit_application',{
          p_business_name:accommodationPayload.business_name,
          p_owner_name:accommodationPayload.owner_name,
          p_id_number:accommodationPayload.id_number,
          p_phone:accommodationPayload.phone,
          p_email:accommodationPayload.email,
          p_county_code:accommodationPayload.county_code,
          p_county:accommodationPayload.county,
          p_sub_county_code:accommodationPayload.sub_county_code,
          p_sub_county:accommodationPayload.sub_county,
          p_town:accommodationPayload.town,
          p_location_details:accommodationPayload.location_details,
          p_base_map_link:accommodationPayload.base_map_link,
          p_base_latitude:accommodationPayload.base_latitude,
          p_base_longitude:accommodationPayload.base_longitude,
          p_business_description:accommodationPayload.business_description,
          p_profile_picture_path:accommodationPayload.profile_picture_path,
          p_passport_photo_path:accommodationPayload.passport_photo_path,
          p_business_id_document_path:accommodationPayload.business_id_document_path,
          p_business_licence_path:accommodationPayload.business_licence_path,
          p_registration_certificate_path:accommodationPayload.registration_certificate_path,
          p_other_permit_paths:accommodationPayload.other_permit_paths
        });
    if(result.error)throw result.error;
    clearAccommodationDraft();
    if(approvedEdit){
      status($('#accommodationRegistrationStatus'),'Profile changes sent to LEOGO Admin. Your current approved Accommodation profile remains active until approval.','success');
      accommodationReg.hidden=true;
      accommodationDashboard.hidden=false;
      renderAccommodationProvider();
      openAccommodationView('profile');
      status($('#accommodationProfileEditStatus'),'Profile changes are awaiting Admin approval. Your current approved profile is still active.','success');
      await loadAccommodationNotifications().catch(()=>{});
    }else{
      status($('#accommodationRegistrationStatus'),'Accommodation Provider application submitted to LEOGO Admin for approval.','success');
      await loadAccommodationProvider();
    }
  }catch(error){
    status($('#accommodationRegistrationStatus'),error?.message||'Accommodation Provider application could not be submitted.','error');
  }finally{
    button.disabled=false;button.textContent=original;
  }
});

/* TRANSPORT & PARCEL PROVIDER MODULE — isolated from LEOGO staff rider delivery */
const transportBootStatus=$('#transportBootStatus');
const transportOnboarding=$('#transportOnboarding');
const transportReg=$('#transportRegistrationForm');
const transportPendingArea=$('#transportPendingArea');
const transportDashboard=$('#transportDashboard');
const transportSidebar=$('#transportSidebar');

function transportStatusCopy(value){
  if(value==='submitted')return 'Submitted to LEOGO Admin. Your Transport Provider application is waiting for review.';
  if(value==='under_review')return 'LEOGO Admin is reviewing your Transport Provider registration.';
  if(value==='changes_requested')return 'LEOGO Admin requested corrections. Update the application and resubmit it.';
  if(value==='approved')return 'Approved. You can now add vehicles for Admin approval.';
  if(value==='rejected')return 'The application was not approved. Review the Admin note and correct it before resubmitting if appropriate.';
  if(value==='suspended')return 'This Transport Provider account is currently suspended. Contact LEOGO Admin.';
  return 'Complete Transport Provider registration to start offering Transport & Parcel services.';
}
function showTransportBoot(message='Loading your Transport Provider account…',isError=false){
  if(!transportBootStatus)return;
  transportBootStatus.hidden=false;
  $('#transportBootTitle').textContent=isError?'Transport Provider Portal needs attention':'Opening your Transport Provider dashboard…';
  $('#transportBootMessage').textContent=message;
  const spinner=$('.seller-boot-spinner',transportBootStatus);
  if(spinner)spinner.hidden=isError;
  $('#retryTransportBoot').hidden=!isError;
}
function hideTransportBoot(){if(transportBootStatus)transportBootStatus.hidden=true;}
function transportViewDescription(view){
  return {
    overview:'Overview of your Transport & Parcel Provider account.',
    jobs:'Customer Transport & Parcel jobs assigned to this provider.',
    vehicles:'Add vehicles, customer-facing vehicle pictures and private driver verification details.',
    earnings:'Review completed Transport & Parcel earnings and LEOGO commission deductions.',
    settlements:'Add payout accounts and request settlement of available Transport earnings.',
    notifications:'Application, vehicle, settlement and transport-job notifications.',
    profile:'Your approved Transport Provider registration details.'
  }[view]||'Transport & Parcel Portal';
}
function closeTransportSidebar(){
  transportSidebar?.classList.remove('open');
  $('#transportSidebarScrim')?.classList.remove('open');
}
function openTransportView(view='overview'){
  const approved=transportProvider?.application_status==='approved';
  const allowed=approved?['overview','jobs','vehicles','earnings','settlements','notifications','profile']:['overview','notifications','profile'];
  const resolved=allowed.includes(view)?view:'overview';
  if(transportProvider){
    transportPendingArea.hidden=true;
    transportDashboard.hidden=false;
  }
  $$('[data-transport-content]').forEach(panel=>panel.classList.toggle('active',panel.dataset.transportContent===resolved));
  $$('[data-transport-view]').forEach(button=>button.classList.toggle('active',button.dataset.transportView===resolved));
  if($('#transportViewDescription'))$('#transportViewDescription').textContent=transportViewDescription(resolved);
  if(resolved==='vehicles')loadTransportVehicles().catch(error=>console.warn('Transport vehicle refresh failed:',error));
  if(resolved==='jobs')loadTransportJobs().catch(error=>console.warn('Transport jobs refresh failed:',error));
  if(resolved==='earnings')loadTransportEarnings().catch(error=>console.warn('Transport earnings refresh failed:',error));
  if(resolved==='settlements')loadTransportSettlementData().catch(error=>console.warn('Transport settlement refresh failed:',error));
  if(resolved==='notifications')loadTransportNotifications().catch(error=>console.warn('Transport notifications refresh failed:',error));
  closeTransportSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-transport-view]').forEach(button=>button.addEventListener('click',()=>openTransportView(button.dataset.transportView)));
$$('[data-open-transport-view]').forEach(button=>button.addEventListener('click',()=>openTransportView(button.dataset.openTransportView)));
$('#transportSidebarToggle')?.addEventListener('click',()=>{transportSidebar?.classList.add('open');$('#transportSidebarScrim')?.classList.add('open');});
$('#transportSidebarScrim')?.addEventListener('click',closeTransportSidebar);
$('#transportNotificationsButton')?.addEventListener('click',()=>openTransportView('notifications'));
$('#transportDashboardCorrectApplication')?.addEventListener('click',()=>openTransportRegistration(true));
$('#transportProfileButton')?.addEventListener('click',()=>openTransportView('profile'));
$('#transportBackToPartnerships')?.addEventListener('click',showRolePicker);
$('#transportPendingBack')?.addEventListener('click',showRolePicker);
$('#refreshTransportDashboard')?.addEventListener('click',()=>loadTransportProvider());
$('#retryTransportBoot')?.addEventListener('click',()=>openTransportRole());

async function ensureTransportLocations(preferredCounty='',preferredSubcounty=''){
  await loadKenyaLocations();
  const county=$('#transportCounty'),sub=$('#transportSubCounty');
  if(!county||!sub)return;
  county.innerHTML='<option value="">Select county</option>'+kenyaCounties.map(item=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.display_name||item.name)+'</option>').join('');
  if(preferredCounty&&kenyaCounties.some(item=>item.code===preferredCounty))county.value=preferredCounty;
  await renderTransportSubcounties(preferredSubcounty);
}
async function renderTransportSubcounties(preferredCode=''){
  const countyCode=$('#transportCounty')?.value||'';
  const target=$('#transportSubCounty');
  if(!target)return;
  target.disabled=!countyCode;
  if(!countyCode){target.innerHTML='<option value="">Choose a county first</option>';return;}
  let options=kenyaSubcounties.filter(item=>item.county_code===countyCode);
  if(!options.length){
    target.innerHTML='<option value="">Loading sub-counties…</option>';
    const {data,error}=await client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).eq('county_code',countyCode).order('name');
    if(!error&&data?.length){
      kenyaSubcounties=[...kenyaSubcounties.filter(item=>item.county_code!==countyCode),...data];
      options=data;
    }
  }
  target.innerHTML=options.length?'<option value="">Select sub-county</option>'+options.map(item=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.name)+'</option>').join(''):'<option value="">No active sub-counties configured</option>';
  target.disabled=!options.length;
  if(preferredCode&&options.some(item=>item.code===preferredCode))target.value=preferredCode;
}
$('#transportCounty')?.addEventListener('change',()=>renderTransportSubcounties());

async function uploadTransportVerification(file,prefix){
  if(!file)return null;
  if(file.size>8388608)throw new Error('Each Transport verification document must be 8 MB or smaller.');
  const ext=(file.name.split('.').pop()||'pdf').toLowerCase();
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('transport-verification').upload(path,file,{upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  return path;
}
async function uploadTransportVehiclePhoto(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Vehicle profile picture must be JPG, PNG or WEBP.');
  if(file.size>5242880)throw new Error('Vehicle profile picture must be 5 MB or smaller.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/vehicle-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('transport-public-media').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}
async function uploadTransportDriverPassport(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Driver passport photo must be JPG, PNG or WEBP.');
  if(file.size>5242880)throw new Error('Driver passport photo must be 5 MB or smaller.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/driver-passport-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('transport-driver-private').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}
function transportVehiclePhotoUrl(path){
  return path?client.storage.from('transport-public-media').getPublicUrl(path).data.publicUrl:'';
}
function selectedTransportServices(name){
  return $$('input[name="'+name+'"]:checked').map(input=>input.value);
}
function setTransportServices(name,values=[]){
  const chosen=new Set(Array.isArray(values)?values:[]);
  $$('input[name="'+name+'"]').forEach(input=>{input.checked=chosen.has(input.value);});
}
function transportBaseCoordinatesFromText(value=''){
  const text=String(value||'').trim();
  const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
  const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
  return maps?{lat:Number(maps[1]),lng:Number(maps[2])}:null;
}
function setTransportBaseCoordinates(lat,lng,label='Operating base pinned'){
  const latitude=Number(lat),longitude=Number(lng),target=$('#transportBasePinStatus');
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    if(target){target.textContent='Invalid operating-base coordinates.';target.className='status error';}
    return false;
  }
  $('#transportBaseLatitude').value=latitude.toFixed(7);
  $('#transportBaseLongitude').value=longitude.toFixed(7);
  if(!$('#transportBaseMapLink').value.trim())$('#transportBaseMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
  if(target){target.textContent='✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='status success';}
  return true;
}
$('#pinTransportBaseLocation')?.addEventListener('click',()=>{
  const target=$('#transportBasePinStatus');
  if(!navigator.geolocation){
    if(target){target.textContent='Location access is unavailable. Paste a Google Maps link or enter coordinates.';target.className='status error';}
    return;
  }
  if(target){target.textContent='Getting operating-base location…';target.className='status';}
  navigator.geolocation.getCurrentPosition((position)=>{
    setTransportBaseCoordinates(position.coords.latitude,position.coords.longitude,'Operating base pinned');
  },(error)=>{
    if(target){target.textContent=error.code===1?'Location permission was not granted. Paste a Maps link or coordinates instead.':'Operating-base location could not be detected.';target.className='status error';}
  },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
});
$('#transportBaseMapLink')?.addEventListener('change',(event)=>{
  const coords=transportBaseCoordinatesFromText(event.currentTarget.value);
  if(coords)setTransportBaseCoordinates(coords.lat,coords.lng,'Coordinates detected');
});

function transportSummaryRows(){
  if(!transportProvider)return [];
  return [
    ['Business / Operator',transportProvider.business_name],
    ['Owner / Operator',transportProvider.owner_name],
    ['ID Number',transportProvider.id_number],
    ['Phone',transportProvider.phone],
    ['Provider Type',String(transportProvider.provider_type||'').replaceAll('_',' ')],
    ['Services',(transportProvider.services_offered||[]).map(v=>String(v).replaceAll('_',' ')).join(', ')||'—'],
    ['Location',[transportProvider.town,transportProvider.sub_county,transportProvider.county].filter(Boolean).join(', ')],
    ['Operating Base',transportProvider.location_details],
    ['Base Coordinates',(transportProvider.base_latitude!=null&&transportProvider.base_longitude!=null)?(transportProvider.base_latitude+', '+transportProvider.base_longitude):'Not pinned'],
    ['Base Map Link',transportProvider.base_map_link||'—'],
    ['Coverage',transportProvider.coverage_notes||'—'],
    ['Application Status',String(transportProvider.application_status||'').replaceAll('_',' ')],
    ['Business ID / Identification',transportProvider.business_id_document_path?'Uploaded':'Missing'],
    ['Business Licence',transportProvider.business_licence_path?'Uploaded':'Not provided'],
    ['Registration Certificate',transportProvider.registration_certificate_path?'Uploaded':'Not provided'],
    ['Transport / Operator Permit',transportProvider.transport_operator_permit_path?'Uploaded':'Not provided'],
    ['Other Permits',(transportProvider.other_permit_paths||[]).length+' file(s)'],
    ['Admin Note',transportProvider.admin_notes||'—']
  ];
}
function renderTransportApplicationSummary(){
  const target=$('#transportApplicationSummary');
  if(target)target.innerHTML=transportSummaryRows().map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  const note=$('#transportAdminNote');
  if(note){note.hidden=!transportProvider?.admin_notes;note.textContent=transportProvider?.admin_notes?'Admin note: '+transportProvider.admin_notes:'';}
}
function populateTransportApplication(){
  if(!transportProvider)return;
  $('#transportBusinessName').value=transportProvider.business_name||'';
  $('#transportOwnerName').value=transportProvider.owner_name||'';
  $('#transportIdNumber').value=transportProvider.id_number||'';
  $('#transportPhone').value=transportProvider.phone||'';
  $('#transportProviderType').value=transportProvider.provider_type||'individual_operator';
  $('#transportTown').value=transportProvider.town||'';
  $('#transportLocation').value=transportProvider.location_details||'';
  $('#transportBaseLatitude').value=transportProvider.base_latitude??'';
  $('#transportBaseLongitude').value=transportProvider.base_longitude??'';
  $('#transportBaseMapLink').value=transportProvider.base_map_link||'';
  const basePinStatus=$('#transportBasePinStatus');
  if(basePinStatus){basePinStatus.textContent=(transportProvider.base_latitude!=null&&transportProvider.base_longitude!=null)?'✓ Operating base pinned: '+transportProvider.base_latitude+', '+transportProvider.base_longitude:'Operating base not pinned yet.';}
  $('#transportCoverage').value=transportProvider.coverage_notes||'';
  $('#transportDescription').value=transportProvider.business_description||'';
  setTransportServices('transportService',transportProvider.services_offered||[]);
  $('#transportBusinessIdDocument').required=!transportProvider.business_id_document_path;
  ensureTransportLocations(transportProvider.county_code||'',transportProvider.sub_county_code||'').catch(console.warn);
}
function renderTransportApplicationProgress(){
  if(!transportProvider)return;
  const state=String(transportProvider.application_status||'submitted');
  const submitted=$('#transportProgressSubmitted'),review=$('#transportProgressReview'),decision=$('#transportProgressDecision');
  [submitted,review,decision].forEach(step=>step?.classList.remove('done','current','alert'));
  submitted?.classList.add('done');
  if(['submitted','under_review'].includes(state)){
    review?.classList.add(state==='submitted'?'current':'done');
    if(state==='under_review')decision?.classList.add('current');
  }else if(state==='approved'){
    review?.classList.add('done');decision?.classList.add('done');
  }else if(['changes_requested','rejected'].includes(state)){
    review?.classList.add('done');decision?.classList.add('alert');
  }
  if($('#transportApplicationProgressTitle'))$('#transportApplicationProgressTitle').textContent=
    state==='approved'?'Transport Provider Approved':
    state==='changes_requested'?'Application Needs Correction':
    state==='rejected'?'Application Not Approved':
    state==='under_review'?'Application Under Review':'Application Submitted';
  if($('#transportApplicationProgressMessage'))$('#transportApplicationProgressMessage').textContent=transportStatusCopy(state);
  if($('#transportProgressDecisionText'))$('#transportProgressDecisionText').textContent=
    state==='approved'?'Approved':state==='changes_requested'?'Changes requested':state==='rejected'?'Not approved':state==='under_review'?'Reviewing':'Waiting';
  const note=$('#transportDashboardAdminNote');
  if(note){note.hidden=!transportProvider.admin_notes;note.textContent=transportProvider.admin_notes?'Admin note: '+transportProvider.admin_notes:'';}
  const correction=$('#transportDashboardCorrectApplication');
  if(correction)correction.hidden=!['changes_requested','rejected'].includes(state);
  const approved=state==='approved';
  const priority=$('#transportJobsPriorityCard');
  const fleet=$('#transportFleetQuickCard');
  if(priority){
    const button=$('[data-open-transport-view="jobs"]',priority);
    if(button)button.hidden=!approved;
    const message=$('#transportJobsPriorityMessage');
    if(message)message.textContent=approved
      ? 'New Transport & Parcel assignments from LEOGO Admin appear here first. Respond to received jobs before other account tasks.'
      : 'Received Jobs will activate immediately after LEOGO Admin approves your Transport Provider application.';
  }
  if(fleet)fleet.hidden=!approved;
  $$('.seller-metrics',transportDashboard).forEach(block=>block.hidden=!approved);
  $$('[data-transport-view="jobs"],[data-transport-view="vehicles"]',transportSidebar).forEach(button=>button.hidden=!approved);
  if($('#editApprovedTransportProfile'))$('#editApprovedTransportProfile').hidden=!approved;
}

function updateTransportBasePinNotice(){
  const missing=Boolean(transportProvider&&transportProvider.base_latitude==null&&transportProvider.base_longitude==null);
  const notice=$('#transportMissingBasePinNotice'),button=$('#addTransportMissingBasePin');
  if(notice)notice.hidden=!missing;
  if(button)button.hidden=!missing;
}
function setTransportBasePinOnlyMode(enabled){
  transportBasePinOnly=Boolean(enabled);
  if(!transportReg)return;
  $$('input,select,textarea',transportReg).forEach(control=>{
    if(['transportBaseLatitude','transportBaseLongitude','transportBaseMapLink'].includes(control.id))return;
    if(control.type==='file')control.disabled=transportBasePinOnly;
    else if(control.closest('.product-actions'))return;
    else control.disabled=transportBasePinOnly;
  });
  const submit=transportReg.querySelector('button[type="submit"]');
  if(submit)submit.textContent=transportBasePinOnly?'Save Operating Base Pin':'Submit Transport Application';
}

function renderTransportProvider(){
  hideTransportBoot();
  transportOnboarding.hidden=true;
  transportReg.hidden=true;
  transportPendingArea.hidden=true;
  transportDashboard.hidden=true;
  if(!transportProvider){transportOnboarding.hidden=false;return;}
  transportDashboard.hidden=false;
  const state=String(transportProvider.application_status||'submitted');
  $('#transportDashboardName').textContent=transportProvider.business_name||'My Transport Business';
  $('#transportSidebarBusiness').textContent=transportProvider.business_name||'Transport Provider';
  $('#transportSidebarStatus').textContent=state.replaceAll('_',' ').toUpperCase();
  $('#transportAvailability').textContent=state==='approved'
    ? String(transportProvider.availability_status||'available').replaceAll('_',' ')
    : 'awaiting approval';
  $('#transportProfileSummary').innerHTML=transportSummaryRows().filter(([label])=>!['Admin Note'].includes(label)).map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  renderTransportApplicationSummary();
  renderTransportApplicationProgress();
  updateTransportBasePinNotice();
  renderTransportVehicles();
  renderTransportJobs();
  renderTransportNotifications();
  openTransportView('overview');
}
async function loadTransportProvider(){
  if(!currentUser)return;
  showTransportBoot();
  try{
    const result=await Promise.race([
      client.rpc('transport_provider_get_own_account'),
      waitTimeout(8000,'Transport Provider account is taking too long to load. Check your connection and tap Retry.')
    ]);
    if(result?.error)throw result.error;
    transportProvider=result?.data||null;
    renderTransportProvider();
    await ensureTransportLocations(transportProvider?.county_code||'',transportProvider?.sub_county_code||'');
    if(transportProvider?.application_status==='approved'){
      await Promise.allSettled([loadTransportVehicles(),loadTransportJobs(),loadTransportEarnings(),loadTransportSettlementData(),loadTransportNotifications()]);
    }else if(transportProvider){
      await loadTransportNotifications().catch(()=>{});
      renderTransportApplicationProgress();
    }
  }catch(error){
    console.error('Transport Provider portal boot failed:',error);
    showTransportBoot(error?.message||'The Transport Provider dashboard could not finish loading.',true);
    transportOnboarding.hidden=true;transportReg.hidden=true;transportPendingArea.hidden=true;transportDashboard.hidden=true;
  }
}
async function openTransportRole(){
  activeRole='transport';
  if(cyberShell)cyberShell.hidden=true;
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  transportShell.hidden=false;
  authShell.hidden=true;
  if(hero)hero.hidden=true;
  showTransportBoot();
  await loadTransportProvider();
  await mountPartnerSubscription('transport',transportDashboard).catch(()=>{});
}
function openTransportRegistration(editExisting=false){
  setTransportBasePinOnlyMode(false);
  transportOnboarding.hidden=true;
  transportPendingArea.hidden=true;
  transportDashboard.hidden=true;
  transportReg.hidden=false;
  status($('#transportRegistrationStatus'),'');
  if(editExisting&&transportProvider)populateTransportApplication();
  else{
    transportReg.reset();
    $('#transportBusinessIdDocument').required=true;
    if(currentUser?.user_metadata?.full_name)$('#transportOwnerName').value=currentUser.user_metadata.full_name;
    ensureTransportLocations().catch(console.warn);
  }
  transportReg.scrollIntoView({behavior:'smooth'});
}
$('#showTransportRegistration')?.addEventListener('click',()=>openTransportRegistration(false));
$('#editTransportApplication')?.addEventListener('click',()=>openTransportRegistration(true));
$('#editApprovedTransportProfile')?.addEventListener('click',()=>{
  if(!transportProvider||transportProvider.application_status!=='approved')return;
  status($('#transportProfileEditStatus'),'Edit your profile and submit it. Your current approved Transport profile stays active while Admin reviews the changes.');
  openTransportRegistration(true);
});
$('#addTransportMissingBasePin')?.addEventListener('click',()=>{
  if(!transportProvider)return;
  populateTransportApplication();
  transportOnboarding.hidden=true;transportPendingArea.hidden=true;transportDashboard.hidden=true;transportReg.hidden=false;
  setTransportBasePinOnlyMode(true);
  status($('#transportRegistrationStatus'),'Add the exact operating-base pin. Other registration details are locked for this correction.');
  transportReg.scrollIntoView({behavior:'smooth',block:'start'});
});
$('#cancelTransportRegistration')?.addEventListener('click',()=>{setTransportBasePinOnlyMode(false);transportProvider?renderTransportProvider():openTransportRole();});

transportReg?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!transportReg.reportValidity())return;
  if(transportBasePinOnly){
    const baseLatitude=Number($('#transportBaseLatitude').value),baseLongitude=Number($('#transportBaseLongitude').value);
    if(!Number.isFinite(baseLatitude)||baseLatitude<-90||baseLatitude>90||!Number.isFinite(baseLongitude)||baseLongitude<-180||baseLongitude>180){
      status($('#transportRegistrationStatus'),'Pin the exact operating base and confirm valid coordinates.','error');return;
    }
    const button=transportReg.querySelector('button[type="submit"]');
    const original=button.textContent;button.disabled=true;button.textContent='Saving…';
    try{
      const {error}=await client.rpc('transport_provider_submit_base_pin',{
        p_latitude:baseLatitude,p_longitude:baseLongitude,p_map_link:$('#transportBaseMapLink').value.trim()||null
      });
      if(error)throw error;
      status($('#transportRegistrationStatus'),'Operating base pin saved and sent to LEOGO Admin for review.','success');
      setTransportBasePinOnlyMode(false);
      await loadTransportProvider();
    }catch(error){status($('#transportRegistrationStatus'),error?.message||'Operating base pin could not be saved.','error');}
    finally{button.disabled=false;button.textContent=original;}
    return;
  }
  const phone=normalisePhone($('#transportPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#transportRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  const services=selectedTransportServices('transportService');
  if(!services.length){status($('#transportRegistrationStatus'),'Choose at least one Transport / Parcel service.','error');return;}
  const countyCode=$('#transportCounty').value;
  const subCountyCode=$('#transportSubCounty').value;
  const county=kenyaCounties.find(item=>item.code===countyCode);
  const subCounty=kenyaSubcounties.find(item=>item.code===subCountyCode);
  const businessIdFile=$('#transportBusinessIdDocument').files?.[0]||null;
  const baseLatitude=Number($('#transportBaseLatitude').value),baseLongitude=Number($('#transportBaseLongitude').value);
  if(!Number.isFinite(baseLatitude)||baseLatitude<-90||baseLatitude>90||!Number.isFinite(baseLongitude)||baseLongitude<-180||baseLongitude>180){status($('#transportRegistrationStatus'),'Pin the exact operating base and confirm valid latitude and longitude before submitting.','error');return;}
  if(!businessIdFile&&!transportProvider?.business_id_document_path){status($('#transportRegistrationStatus'),'Business ID or personal identification document is required.','error');return;}
  const button=transportReg.querySelector('button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';
  const uploaded=[];
  try{
    status($('#transportRegistrationStatus'),'Uploading private verification documents…');
    const businessId=businessIdFile?await uploadTransportVerification(businessIdFile,'business-id'):transportProvider?.business_id_document_path;
    if(businessIdFile)uploaded.push(businessId);
    const licenceFile=$('#transportBusinessLicence').files?.[0]||null;
    const certFile=$('#transportRegistrationCertificate').files?.[0]||null;
    const permitFile=$('#transportOperatorPermit').files?.[0]||null;
    const otherFiles=[...($('#transportOtherPermits').files||[])];
    const businessLicence=licenceFile?await uploadTransportVerification(licenceFile,'business-licence'):transportProvider?.business_licence_path||null;
    if(licenceFile)uploaded.push(businessLicence);
    const registrationCertificate=certFile?await uploadTransportVerification(certFile,'registration-certificate'):transportProvider?.registration_certificate_path||null;
    if(certFile)uploaded.push(registrationCertificate);
    const operatorPermit=permitFile?await uploadTransportVerification(permitFile,'operator-permit'):transportProvider?.transport_operator_permit_path||null;
    if(permitFile)uploaded.push(operatorPermit);
    let otherPermits=transportProvider?.other_permit_paths||[];
    if(otherFiles.length){
      const fresh=[];
      for(const file of otherFiles){const path=await uploadTransportVerification(file,'other-permit');fresh.push(path);uploaded.push(path);}
      otherPermits=fresh;
    }
    const transportProfilePayload={
      business_name:$('#transportBusinessName').value.trim(),owner_name:$('#transportOwnerName').value.trim(),
      id_number:$('#transportIdNumber').value.trim(),phone,provider_type:$('#transportProviderType').value,
      services_offered:services,county_code:countyCode||null,sub_county_code:subCountyCode||null,
      town:$('#transportTown').value.trim(),location_details:$('#transportLocation').value.trim(),
      base_latitude:baseLatitude,base_longitude:baseLongitude,base_map_link:$('#transportBaseMapLink').value.trim()||null,
      coverage_notes:$('#transportCoverage').value.trim()||null,business_description:$('#transportDescription').value.trim()||null,
      business_id_document_path:businessId,business_licence_path:businessLicence,
      registration_certificate_path:registrationCertificate,transport_operator_permit_path:operatorPermit,
      other_permit_paths:otherPermits
    };
    const {error}=transportProvider?.application_status==='approved'
      ? await client.rpc('transport_provider_submit_profile_change',{p_payload:transportProfilePayload})
      : await client.rpc('transport_provider_submit_application',{
          p_business_name:transportProfilePayload.business_name,p_owner_name:transportProfilePayload.owner_name,
          p_id_number:transportProfilePayload.id_number,p_phone:phone,p_provider_type:transportProfilePayload.provider_type,
          p_services_offered:services,
          p_county:county?.display_name||county?.name||$('#transportCounty').selectedOptions[0]?.textContent||'',
          p_sub_county:subCounty?.name||$('#transportSubCounty').selectedOptions[0]?.textContent||'',
          p_county_code:countyCode||null,p_sub_county_code:subCountyCode||null,p_town:transportProfilePayload.town,
          p_location_details:transportProfilePayload.location_details,p_coverage_notes:transportProfilePayload.coverage_notes,
          p_business_description:transportProfilePayload.business_description,p_business_id_document_path:businessId,
          p_base_latitude:baseLatitude,p_base_longitude:baseLongitude,p_base_map_link:transportProfilePayload.base_map_link,
          p_business_licence_path:businessLicence,p_registration_certificate_path:registrationCertificate,
          p_transport_operator_permit_path:operatorPermit,p_other_permit_paths:otherPermits
        });
    if(error)throw error;
    if(transportProvider?.application_status==='approved'){
      status($('#transportRegistrationStatus'),'Profile changes sent to LEOGO Admin. Your current approved Transport profile remains active.','success');
      status($('#transportProfileEditStatus'),'Profile changes are awaiting Admin approval.','success');
      transportReg.hidden=true;transportDashboard.hidden=false;openTransportView('profile');
      await loadTransportNotifications().catch(()=>{});
    }else{
      status($('#transportRegistrationStatus'),'Transport Provider application submitted to LEOGO Admin.','success');
      await loadTransportProvider();
    }
  }catch(error){
    if(uploaded.length){try{await client.storage.from('transport-verification').remove(uploaded);}catch(_e){}}
    status($('#transportRegistrationStatus'),error?.message||'Transport Provider application could not be submitted.','error');
  }finally{button.disabled=false;button.textContent=original;}
});

function resetTransportVehicleForm(){
  editingTransportVehicle=null;
  const form=$('#transportVehicleForm');
  if(!form)return;
  form.reset();form.hidden=true;
  $('#transportVehicleId').value='';
  $('#transportVehicleAvailable').checked=true;
  $('#transportVehicleFormTitle').textContent='Add Vehicle';
  status($('#transportVehicleStatus'),'');
}
function transportWaitingPointCoords(value=''){
  const text=String(value||'').trim();
  const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
  const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
  return maps?{lat:Number(maps[1]),lng:Number(maps[2])}:null;
}
function setTransportWaitingPoint(lat,lng,label='Waiting point pinned'){
  const latitude=Number(lat),longitude=Number(lng),target=$('#transportWaitingPointStatus');
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    if(target){target.textContent='Invalid waiting-point coordinates.';target.className='status error';}
    return false;
  }
  $('#transportWaitingPointLatitude').value=latitude.toFixed(7);
  $('#transportWaitingPointLongitude').value=longitude.toFixed(7);
  if(!$('#transportWaitingPointMapLink').value.trim())$('#transportWaitingPointMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
  if(target){target.textContent='✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='status success';}
  return true;
}
$('#pinTransportWaitingPoint')?.addEventListener('click',()=>{
  const target=$('#transportWaitingPointStatus');
  if(!navigator.geolocation){
    if(target){target.textContent='Location access is unavailable. Paste a Google Maps link or enter coordinates.';target.className='status error';}
    return;
  }
  if(target){target.textContent='Getting waiting-point location…';target.className='status';}
  navigator.geolocation.getCurrentPosition((position)=>{
    setTransportWaitingPoint(position.coords.latitude,position.coords.longitude,'Waiting point pinned');
  },(error)=>{
    if(target){target.textContent=error.code===1?'Location permission was not granted. Paste a Maps link or coordinates instead.':'Waiting-point location could not be detected.';target.className='status error';}
  },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
});
$('#transportWaitingPointMapLink')?.addEventListener('change',(event)=>{
  const coords=transportWaitingPointCoords(event.currentTarget.value);
  if(coords)setTransportWaitingPoint(coords.lat,coords.lng,'Coordinates detected');
});

$('#transportVehicleReset')?.addEventListener('click',resetTransportVehicleForm);
$('#showTransportVehicleForm')?.addEventListener('click',()=>{
  resetTransportVehicleForm();
  const form=$('#transportVehicleForm');form.hidden=false;
  openTransportView('vehicles');
  form.scrollIntoView({behavior:'smooth',block:'start'});
});
function editTransportVehicle(id){
  const vehicle=transportVehicles.find(item=>item.id===id);if(!vehicle)return;
  editingTransportVehicle=vehicle;
  $('#transportVehicleId').value=vehicle.id;
  $('#transportVehicleType').value=vehicle.vehicle_type||'';
  $('#transportVehiclePlate').value=vehicle.registration_number||'';
  $('#transportVehicleMakeModel').value=vehicle.make_model||'';
  $('#transportVehicleColour').value=vehicle.colour||'';
  $('#transportVehicleCapacity').value=vehicle.capacity_description||'';
  $('#transportVehicleMaxWeight').value=vehicle.max_weight_kg??'';
  $('#transportVehicleServiceArea').value=vehicle.service_area||'';
  $('#transportWaitingPointName').value=vehicle.waiting_point_name||'';
  $('#transportWaitingPointLatitude').value=vehicle.waiting_point_latitude??'';
  $('#transportWaitingPointLongitude').value=vehicle.waiting_point_longitude??'';
  $('#transportWaitingPointMapLink').value=vehicle.waiting_point_map_link||'';
  const waitingStatus=$('#transportWaitingPointStatus');if(waitingStatus){waitingStatus.textContent=(vehicle.waiting_point_latitude!=null&&vehicle.waiting_point_longitude!=null)?'✓ Waiting point pinned: '+vehicle.waiting_point_latitude+', '+vehicle.waiting_point_longitude:'Waiting point not pinned yet.';}
  $('#transportVehicleAvailable').checked=vehicle.is_available!==false;
  $('#transportDriverName').value=vehicle.driver_full_name||'';
  $('#transportDriverId').value=vehicle.driver_id_number||'';
  $('#transportDriverPhone').value=vehicle.driver_phone||'';
  $('#transportDriverLicence').value=vehicle.driver_licence_number||'';
  setTransportServices('transportVehicleService',vehicle.service_types||[]);
  $('#transportVehicleFormTitle').textContent='Edit Vehicle';
  const form=$('#transportVehicleForm');form.hidden=false;
  openTransportView('vehicles');
  form.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderTransportVehicles(){
  const target=$('#transportVehicleList');if(!target)return;
  const approved=transportVehicles.filter(v=>v.approval_status==='approved').length;
  const pending=transportVehicles.filter(v=>['pending','under_review','changes_requested'].includes(v.approval_status)).length;
  $('#transportApprovedVehicleCount').textContent=approved;
  $('#transportPendingVehicleCount').textContent=pending;
  const badge=$('#transportVehiclePendingBadge');
  if(badge){badge.hidden=!pending;badge.textContent=String(pending);}
  target.innerHTML=transportVehicles.length?transportVehicles.map(vehicle=>{
    const photo=transportVehiclePhotoUrl(vehicle.vehicle_profile_picture_path);
    const driverSummary=vehicle.driver_full_name?'Driver verification added':'No driver assigned';
    return '<article class="transport-vehicle-card">'+
      '<div class="transport-vehicle-photo">'+(photo?'<img src="'+escapeHtml(photo)+'" alt="'+escapeHtml(vehicle.vehicle_type)+'">':'<span>🚚</span>')+'</div>'+
      '<div class="transport-vehicle-copy"><div><span class="status-chip">'+escapeHtml(String(vehicle.approval_status).replaceAll('_',' '))+'</span><strong>'+escapeHtml(vehicle.vehicle_type)+' · '+escapeHtml(vehicle.registration_number)+'</strong></div>'+
      '<p>'+escapeHtml([vehicle.make_model,vehicle.colour,vehicle.capacity_description].filter(Boolean).join(' · ')||'Vehicle profile')+'</p>'+
      '<small>'+escapeHtml((vehicle.service_types||[]).map(v=>String(v).replaceAll('_',' ')).join(', ')||'No services')+'</small>'+
      '<small class="private-driver-note">🔒 '+escapeHtml(driverSummary)+' — private details visible only to LEOGO Admin.</small>'+
      (vehicle.admin_notes?'<p class="admin-note">Admin note: '+escapeHtml(vehicle.admin_notes)+'</p>':'')+
      '<button type="button" class="secondary" data-edit-transport-vehicle="'+escapeHtml(vehicle.id)+'">Edit Vehicle</button></div></article>';
  }).join(''):'<div class="empty-card">No vehicles added yet. Add the first vehicle and send it to Admin for approval.</div>';
  $$('[data-edit-transport-vehicle]').forEach(button=>button.addEventListener('click',()=>editTransportVehicle(button.dataset.editTransportVehicle)));
}
async function loadTransportVehicles(){
  if(!currentUser||transportProvider?.application_status!=='approved')return;
  const {data,error}=await client.rpc('transport_provider_list_vehicles');
  if(error)throw error;
  transportVehicles=Array.isArray(data)?data:[];
  renderTransportVehicles();
}
$('#transportVehicleForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;if(!form.reportValidity())return;
  const services=selectedTransportServices('transportVehicleService');
  if(!services.length){status($('#transportVehicleStatus'),'Choose at least one service for this vehicle.','error');return;}
  const photoFile=$('#transportVehiclePicture').files?.[0]||null;
  if(!photoFile&&!editingTransportVehicle?.vehicle_profile_picture_path){status($('#transportVehicleStatus'),'Add a vehicle profile picture.','error');return;}
  const waitingPointName=$('#transportWaitingPointName').value.trim();
  const waitingLat=Number($('#transportWaitingPointLatitude').value),waitingLng=Number($('#transportWaitingPointLongitude').value);
  if(waitingPointName.length<3){status($('#transportVehicleStatus'),'Enter the vehicle stage / waiting point.','error');return;}
  if(!Number.isFinite(waitingLat)||waitingLat<-90||waitingLat>90||!Number.isFinite(waitingLng)||waitingLng<-180||waitingLng>180){status($('#transportVehicleStatus'),'Pin the stage / waiting point before saving the vehicle.','error');return;}
  const driverPhoneRaw=$('#transportDriverPhone').value.trim();
  const driverPhone=driverPhoneRaw?normalisePhone(driverPhoneRaw):null;
  if(driverPhoneRaw&&!/^\+254[17]\d{8}$/.test(driverPhone)){status($('#transportVehicleStatus'),'Enter a valid Kenyan driver phone number.','error');return;}
  const passportFile=$('#transportDriverPassport').files?.[0]||null;
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Saving…';
  const uploaded=[];
  try{
    status($('#transportVehicleStatus'),'Uploading vehicle and private driver verification media…');
    const vehiclePhoto=photoFile?await uploadTransportVehiclePhoto(photoFile):null;
    if(vehiclePhoto)uploaded.push({bucket:'transport-public-media',path:vehiclePhoto});
    const driverPassport=passportFile?await uploadTransportDriverPassport(passportFile):null;
    if(driverPassport)uploaded.push({bucket:'transport-driver-private',path:driverPassport});
    const {error}=await client.rpc('transport_provider_submit_vehicle',{
      p_vehicle_id:editingTransportVehicle?.id||null,
      p_vehicle_type:$('#transportVehicleType').value,
      p_registration_number:$('#transportVehiclePlate').value.trim(),
      p_make_model:$('#transportVehicleMakeModel').value.trim()||null,
      p_colour:$('#transportVehicleColour').value.trim()||null,
      p_service_types:services,
      p_capacity_description:$('#transportVehicleCapacity').value.trim()||null,
      p_max_weight_kg:$('#transportVehicleMaxWeight').value?Number($('#transportVehicleMaxWeight').value):null,
      p_service_area:$('#transportVehicleServiceArea').value.trim()||null,
      p_is_available:$('#transportVehicleAvailable').checked,
      p_vehicle_profile_picture_path:vehiclePhoto,
      p_driver_full_name:$('#transportDriverName').value.trim()||null,
      p_driver_id_number:$('#transportDriverId').value.trim()||null,
      p_driver_phone:driverPhone,
      p_driver_licence_number:$('#transportDriverLicence').value.trim()||null,
      p_driver_passport_photo_path:driverPassport,
      p_waiting_point_name:waitingPointName,
      p_waiting_point_latitude:waitingLat,
      p_waiting_point_longitude:waitingLng,
      p_waiting_point_map_link:$('#transportWaitingPointMapLink').value.trim()||null
    });
    if(error)throw error;
    status($('#transportVehicleStatus'),'Vehicle saved and sent to LEOGO Admin for approval.','success');
    resetTransportVehicleForm();
    await Promise.all([loadTransportVehicles(),loadTransportNotifications()]);
  }catch(error){
    for(const item of uploaded){try{await client.storage.from(item.bucket).remove([item.path]);}catch(_e){}}
    status($('#transportVehicleStatus'),error?.message||'Vehicle could not be saved.','error');
  }finally{button.disabled=false;button.textContent=original;}
});

function transportJobStatusLabel(value){
  return ({
    submitted:'Waiting for Admin',
    assigned:'New assignment',
    quoted:'Price sent · waiting for customer',
    accepted:'Customer accepted price',
    declined:'Declined',
    picked_up:'Picked up',
    in_transit:'In transit',
    completed:'Completed',
    cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));
}
function transportJobActions(item){
  if(item.request_status==='assigned'){
    return '<form class="provider-quote-form transport-quote-form" data-transport-quote-form="'+escapeHtml(item.id)+'">'+
      '<div><small>YOUR TRANSPORTATION COST</small><input name="amount" type="number" min="1" max="10000000" step="0.01" placeholder="Transport cost (KSh)" required></div>'+
      '<textarea name="notes" maxlength="1000" rows="2" placeholder="Optional transport notes or conditions"></textarea>'+
      '<small>Current LEOGO rules: '+escapeHtml(item.current_partner_commission_percent??10)+'% provider commission deducted · '+escapeHtml(item.current_customer_service_fee_percent??2)+'% customer service fee added.</small>'+
      '<button type="submit">Send Transport Price</button>'+
    '</form><div class="seller-order-actions"><button class="secondary" type="button" data-transport-job-status="'+escapeHtml(item.id)+'" data-status="declined">Decline Job</button></div>';
  }
  if(item.request_status==='quoted'){
    return '<div class="restricted-notice"><strong>Waiting for customer approval.</strong><br>The customer must accept the quoted total before you can mark pickup or start transit.</div>';
  }
  if(item.request_status==='accepted'){
    return '<div class="restricted-notice"><strong>✓ Customer accepted the transport price.</strong><br>You may now begin the job.</div><div class="seller-order-actions"><button type="button" data-transport-job-status="'+escapeHtml(item.id)+'" data-status="picked_up">Mark Picked Up</button><button class="secondary" type="button" data-transport-job-status="'+escapeHtml(item.id)+'" data-status="in_transit">Start Transit</button></div>';
  }
  if(item.request_status==='picked_up'){
    return '<div class="seller-order-actions"><button type="button" data-transport-job-status="'+escapeHtml(item.id)+'" data-status="in_transit">Mark In Transit</button></div>';
  }
  if(item.request_status==='in_transit'){
    return '<div class="seller-order-actions"><button type="button" data-transport-job-status="'+escapeHtml(item.id)+'" data-status="completed">Mark Completed</button></div>';
  }
  return '';
}
function renderTransportJobs(){
  const target=$('#transportJobList');if(!target)return;
  const active=transportJobs.filter((item)=>!['completed','cancelled','declined'].includes(item.request_status));
  if($('#transportActiveJobCount'))$('#transportActiveJobCount').textContent=active.length;
  const badge=$('#transportJobBadge');
  const newJobs=transportJobs.filter((item)=>item.request_status==='assigned').length;
  if(badge){badge.hidden=!newJobs;badge.textContent=String(newJobs);}
  target.className='provider-job-list';
  target.innerHTML=transportJobs.length?transportJobs.map((item)=>
    '<article class="provider-job-card">'+
      '<header><div><span>'+escapeHtml(item.request_reference||'Transport Job')+'</span><h4>'+escapeHtml(String(item.service_type||'Transport').replaceAll('_',' '))+'</h4><small>'+escapeHtml(formatDate(item.created_at))+'</small></div><b class="status-chip">'+escapeHtml(transportJobStatusLabel(item.request_status))+'</b></header>'+
      '<div class="provider-job-grid"><div><small>CUSTOMER</small><strong>'+escapeHtml(item.customer_name||'LEOGO Customer')+'</strong><span>'+escapeHtml(item.customer_phone||'')+'</span></div><div><small>VEHICLE</small><strong>'+escapeHtml(item.vehicle_label||'Assigned vehicle')+'</strong></div><div><small>ROUTE</small><strong>'+escapeHtml(item.pickup_location||'—')+' → '+escapeHtml(item.destination_location||'—')+'</strong></div></div>'+
      '<small><strong>Preferred schedule:</strong> '+escapeHtml((item.preferred_date||'Flexible date')+(item.preferred_time?' · '+String(item.preferred_time).slice(0,5):''))+'</small>'+
      (item.parcel_description?'<p>'+escapeHtml(item.parcel_description)+'</p>':'')+
      (item.customer_notes?'<p><strong>Customer note:</strong> '+escapeHtml(item.customer_notes)+'</p>':'')+
      (item.provider_quote_kes!=null?'<div class="provider-job-grid transport-quote-breakdown"><div><small>TRANSPORT COST</small><strong>'+money(item.provider_quote_kes)+'</strong></div><div><small>LEOGO COMMISSION</small><strong>'+money(item.quote_partner_commission_kes||0)+' ('+escapeHtml(item.quote_partner_commission_percent||0)+'%)</strong></div><div><small>YOUR NET EARNING</small><strong>'+money(item.quote_partner_net_kes||0)+'</strong></div><div><small>CUSTOMER TOTAL</small><strong>'+money(item.quote_customer_total_kes||0)+'</strong></div></div>':'')+
      transportJobActions(item)+
    '</article>'
  ).join(''):'<div class="empty-card">No Transport / Parcel jobs assigned yet.</div>';
  $$('[data-transport-quote-form]').forEach((form)=>form.addEventListener('submit',async(event)=>{
    event.preventDefault();if(!form.reportValidity())return;
    const button=form.querySelector('button[type="submit"]');
    const original=button.textContent;button.disabled=true;button.textContent='Sending…';
    status($('#transportJobStatus'),'');
    try{
      const {data,error}=await client.rpc('transport_provider_quote_job',{
        p_request_id:form.dataset.transportQuoteForm,
        p_transport_cost_kes:Number(form.elements.amount.value),
        p_provider_notes:form.elements.notes.value.trim()||null
      });
      if(error)throw error;
      status($('#transportJobStatus'),'Transport price sent. Customer total: '+money(data.customer_total_kes)+' · Your net earning: '+money(data.partner_net_kes)+'. Waiting for the customer to accept before you can start the job.','success');
      await Promise.all([loadTransportJobs(),loadTransportNotifications()]);
    }catch(error){
      status($('#transportJobStatus'),error?.message||'Transport cost could not be sent.','error');
    }finally{button.disabled=false;button.textContent=original;}
  }));
  $$('[data-transport-job-status]').forEach((button)=>button.addEventListener('click',async()=>{
    const requestId=button.dataset.transportJobStatus;
    const nextStatus=button.dataset.status;
    const original=button.textContent;button.disabled=true;button.textContent='Saving…';
    try{
      const {error}=await client.rpc('transport_provider_update_job_status',{
        p_request_id:requestId,p_status:nextStatus,p_provider_notes:null
      });
      if(error)throw error;
      await Promise.all([loadTransportJobs(),loadTransportNotifications()]);
    }catch(error){
      window.alert(error?.message||'Transport job status could not be updated.');
    }finally{button.disabled=false;button.textContent=original;}
  }));
}
async function loadTransportJobs(){
  if(!currentUser||transportProvider?.application_status!=='approved')return;
  const {data,error}=await client.rpc('transport_provider_list_jobs');
  if(error)throw error;
  transportJobs=Array.isArray(data)?data:[];
  renderTransportJobs();
}


function toggleTransportSettlementFields(){
  const type=$('#transportSettlementType')?.value||'mpesa_mobile';
  $$('[data-transport-settlement-field]').forEach((label)=>{
    const types=(label.dataset.transportSettlementField||'').split(/\s+/);
    label.hidden=!types.includes(type);
  });
  if($('#transportSettlementPhone'))$('#transportSettlementPhone').required=type==='mpesa_mobile';
  if($('#transportSettlementTill'))$('#transportSettlementTill').required=type==='mpesa_till';
  if($('#transportSettlementPaybill'))$('#transportSettlementPaybill').required=type==='mpesa_paybill';
  if($('#transportSettlementAccountNumber'))$('#transportSettlementAccountNumber').required=['mpesa_paybill','bank'].includes(type);
  if($('#transportSettlementBank'))$('#transportSettlementBank').required=type==='bank';
}
function resetTransportSettlementForm(){
  const form=$('#transportSettlementAccountForm');if(!form)return;
  form.reset();
  $('#transportSettlementAccountId').value='';
  $('#transportSettlementPrimary').checked=true;
  $('#cancelTransportSettlementEdit').hidden=true;
  toggleTransportSettlementFields();
  status($('#transportSettlementStatus'),'');
}
function editTransportSettlementAccount(id){
  const account=transportSettlementAccounts.find((item)=>item.id===id);if(!account)return;
  $('#transportSettlementAccountId').value=account.id;
  $('#transportSettlementType').value=account.account_type||'mpesa_mobile';
  $('#transportSettlementName').value=account.account_name||'';
  $('#transportSettlementPhone').value=account.phone_number||'';
  $('#transportSettlementTill').value=account.till_number||'';
  $('#transportSettlementPaybill').value=account.paybill_number||'';
  $('#transportSettlementAccountNumber').value=account.account_number||'';
  $('#transportSettlementBank').value=account.bank_name||'';
  $('#transportSettlementBranch').value=account.bank_branch||'';
  $('#transportSettlementPrimary').checked=account.is_primary!==false;
  $('#cancelTransportSettlementEdit').hidden=false;
  toggleTransportSettlementFields();
  $('#transportSettlementAccountForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderTransportSettlements(){
  const list=$('#transportSettlementAccountList');
  const requestSelect=$('#transportSettlementRequestAccount');
  const requestList=$('#transportSettlementRequestList');
  const history=$('#transportSettlementHistory');
  if(list){
    list.innerHTML=transportSettlementAccounts.length?transportSettlementAccounts.map((account)=>
      '<article class="settlement-account-card"><div><span class="status-chip">'+escapeHtml(String(account.status||'').replaceAll('_',' '))+'</span><strong>'+escapeHtml(account.account_name||'Settlement account')+'</strong><small>'+escapeHtml(String(account.account_type||'').replaceAll('_',' '))+' · '+escapeHtml(settlementDestination(account))+(account.is_primary?' · Primary':'')+'</small>'+(account.admin_notes?'<small>Admin: '+escapeHtml(account.admin_notes)+'</small>':'')+'</div>'+
      (['pending_review','rejected'].includes(account.status)?'<button type="button" class="secondary" data-edit-transport-settlement="'+escapeHtml(account.id)+'">Edit</button>':'')+
      '</article>'
    ).join(''):'<div class="empty-card">No settlement account added yet.</div>';
    $$('[data-edit-transport-settlement]',list).forEach((button)=>button.addEventListener('click',()=>editTransportSettlementAccount(button.dataset.editTransportSettlement)));
  }
  const approved=transportSettlementAccounts.filter((account)=>account.status==='approved');
  if(requestSelect)requestSelect.innerHTML=approved.length
    ? '<option value="">Choose approved settlement account</option>'+approved.map((account)=>'<option value="'+escapeHtml(account.id)+'">'+escapeHtml(account.account_name)+' — '+escapeHtml(settlementDestination(account))+(account.is_primary?' (Primary)':'')+'</option>').join('')
    : '<option value="">No approved settlement account yet</option>';
  if(requestList)requestList.innerHTML=transportSettlementRequests.length?transportSettlementRequests.map((entry)=>
    '<article class="settlement-history-row"><div><strong>'+money(entry.requested_amount_kes)+'</strong><small>'+formatDate(entry.submitted_at)+(entry.provider_note?' · '+escapeHtml(entry.provider_note):'')+'</small>'+(entry.admin_notes?'<small>Admin: '+escapeHtml(entry.admin_notes)+'</small>':'')+'</div><span>'+escapeHtml(String(entry.status||'').replaceAll('_',' ').toUpperCase())+'</span></article>'
  ).join(''):'<div class="empty-card">No payout requests yet.</div>';
  if(history)history.innerHTML=transportSettlements.length?transportSettlements.map((entry)=>
    '<article class="settlement-history-row"><div><strong>'+money(entry.amount_kes)+'</strong><small>'+escapeHtml(entry.settlement_reference||'')+' · '+formatDate(entry.paid_at)+'</small></div><span>'+escapeHtml(String(entry.status||'').toUpperCase())+'</span></article>'
  ).join(''):'<div class="empty-card">No Transport Provider settlement has been recorded yet.</div>';
  const available=Number(transportEarningsReport?.available_balance_kes||0);
  if($('#transportSettlementAvailableBalance'))$('#transportSettlementAvailableBalance').textContent=money(available);
}
async function loadTransportEarnings(){
  if(!currentUser||transportProvider?.application_status!=='approved')return;
  const from=$('#transportEarningsFrom')?.value||null;
  const to=$('#transportEarningsTo')?.value||null;
  const {data,error}=await client.rpc('transport_provider_get_earnings_report',{p_from:from,p_to:to});
  if(error)throw error;
  transportEarningsReport=data||{};
  if($('#transportTodayEarnings'))$('#transportTodayEarnings').textContent=money(data?.today_net_kes||0);
  if($('#transportTotalEarnings'))$('#transportTotalEarnings').textContent=money(data?.cumulative_net_kes||0);
  if($('#transportAvailableBalance'))$('#transportAvailableBalance').textContent=money(data?.available_balance_kes||0);
  if($('#transportPendingSettlement'))$('#transportPendingSettlement').textContent=money(data?.pending_settlement_kes||0);
  if($('#transportSettlementAvailableBalance'))$('#transportSettlementAvailableBalance').textContent=money(data?.available_balance_kes||0);
  const body=$('#transportEarningsTableBody');
  const entries=Array.isArray(data?.entries)?data.entries:[];
  if(body)body.innerHTML=entries.length?entries.map((entry)=>'<tr><td>'+escapeHtml(String(entry.earning_date||''))+'</td><td><strong>'+escapeHtml(entry.reference||'')+'</strong></td><td>'+money(entry.gross_kes)+'</td><td>'+money(entry.commission_kes)+'</td><td><strong>'+money(entry.net_kes)+'</strong></td></tr>').join(''):'<tr><td colspan="5">No completed transport earnings in this period.</td></tr>';
  renderTransportSettlements();
}
async function loadTransportSettlementData(){
  if(!currentUser||transportProvider?.application_status!=='approved')return;
  const [accountsResult,requestsResult,settlementsResult]=await Promise.all([
    client.from('transport_provider_settlement_accounts').select('*').order('created_at',{ascending:false}),
    client.from('transport_provider_settlement_requests').select('*').order('submitted_at',{ascending:false}),
    client.from('transport_provider_settlements').select('*').order('paid_at',{ascending:false})
  ]);
  if(accountsResult.error)throw accountsResult.error;
  if(requestsResult.error)throw requestsResult.error;
  if(settlementsResult.error)throw settlementsResult.error;
  transportSettlementAccounts=accountsResult.data||[];
  transportSettlementRequests=requestsResult.data||[];
  transportSettlements=settlementsResult.data||[];
  await loadTransportEarnings();
  renderTransportSettlements();
}
$('#transportSettlementType')?.addEventListener('change',toggleTransportSettlementFields);
$('#cancelTransportSettlementEdit')?.addEventListener('click',resetTransportSettlementForm);
$('#transportSettlementAccountForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();if(!event.currentTarget.reportValidity())return;
  const type=$('#transportSettlementType').value;
  const phone=normalisePhone($('#transportSettlementPhone').value);
  if(type==='mpesa_mobile'&&!/^\+254[17]\d{8}$/.test(phone)){status($('#transportSettlementStatus'),'Enter a valid Kenyan M-Pesa phone number.','error');return;}
  const button=event.currentTarget.querySelector('button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Sending…';
  try{
    const {error}=await client.rpc('transport_provider_submit_settlement_account',{
      p_account_id:$('#transportSettlementAccountId').value||null,
      p_account_type:type,p_account_name:$('#transportSettlementName').value.trim(),
      p_phone_number:type==='mpesa_mobile'?phone:null,
      p_till_number:type==='mpesa_till'?$('#transportSettlementTill').value.trim():null,
      p_paybill_number:type==='mpesa_paybill'?$('#transportSettlementPaybill').value.trim():null,
      p_account_number:['mpesa_paybill','bank'].includes(type)?$('#transportSettlementAccountNumber').value.trim():null,
      p_bank_name:type==='bank'?$('#transportSettlementBank').value.trim():null,
      p_bank_branch:type==='bank'?$('#transportSettlementBranch').value.trim():null,
      p_make_primary:$('#transportSettlementPrimary').checked
    });
    if(error)throw error;
    resetTransportSettlementForm();
    status($('#transportSettlementStatus'),'Settlement account sent to LEOGO Admin for verification.','success');
    await Promise.all([loadTransportSettlementData(),loadTransportNotifications()]);
  }catch(error){status($('#transportSettlementStatus'),error?.message||'Settlement account could not be submitted.','error');}
  finally{button.disabled=false;button.textContent=original;}
});
$('#transportSettlementRequestForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();if(!event.currentTarget.reportValidity())return;
  const accountId=$('#transportSettlementRequestAccount').value;
  const amount=Number($('#transportSettlementRequestAmount').value);
  const available=Number(transportEarningsReport?.available_balance_kes||0);
  if(!accountId){status($('#transportSettlementRequestStatus'),'Choose an approved settlement account.','error');return;}
  if(!amount||amount<=0){status($('#transportSettlementRequestStatus'),'Enter the amount you want to request.','error');return;}
  if(amount>available){status($('#transportSettlementRequestStatus'),'Requested amount exceeds your available balance of '+money(available)+'.','error');return;}
  const button=$('#transportSettlementRequestButton');
  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';
  try{
    const {error}=await client.rpc('transport_provider_request_settlement',{
      p_account_id:accountId,p_amount_kes:amount,p_note:$('#transportSettlementRequestNote').value.trim()||null
    });
    if(error)throw error;
    event.currentTarget.reset();
    status($('#transportSettlementRequestStatus'),'Payout request sent to LEOGO Admin.','success');
    await Promise.all([loadTransportSettlementData(),loadTransportNotifications()]);
  }catch(error){status($('#transportSettlementRequestStatus'),error?.message||'Payout request could not be submitted.','error');}
  finally{button.disabled=false;button.textContent=original;}
});
$('#transportEarningsFilterForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  try{await loadTransportEarnings();status($('#transportEarningsStatus'),'Earnings report updated.','success');}
  catch(error){status($('#transportEarningsStatus'),error?.message||'Earnings report could not load.','error');}
});
toggleTransportSettlementFields();

async function loadTransportNotifications(){
  if(!currentUser)return;
  const {data,error}=await client.from('partner_notifications').select('*').eq('partner_type','transport').order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  transportNotifications=data||[];
  renderTransportNotifications();
}
function renderTransportNotifications(){
  const target=$('#transportNotificationList');if(!target)return;
  const unread=transportNotifications.filter(item=>!item.read_at).length;
  const badge=$('#transportNotificationBadge');
  if(badge){badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);}
  const headerBadge=$('#transportHeaderNotificationBadge');
  if(headerBadge){headerBadge.hidden=!unread;headerBadge.textContent=unread>99?'99+':String(unread);}
  updateSharedPartnerNotificationBadge(unread);
  target.innerHTML=transportNotifications.length?transportNotifications.map(item=>
    '<article class="seller-notification-item '+(item.read_at?'':'unread')+'"><div><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.message)+'</p><small>'+escapeHtml(formatDate(item.created_at))+'</small></div><div class="seller-notification-actions">'+
    (item.action_view?'<button type="button" data-open-transport-notification="'+escapeHtml(item.id)+'" data-transport-notification-view="'+escapeHtml(item.action_view)+'">Open</button>':'')+
    (item.read_at?'':'<button class="secondary" type="button" data-mark-transport-notification="'+escapeHtml(item.id)+'">Mark read</button>')+
    '</div></article>'
  ).join(''):'<div class="empty-card">No Transport Provider notifications yet.</div>';
  $$('[data-mark-transport-notification]').forEach(button=>button.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.markTransportNotification});
    if(!error)await loadTransportNotifications();
  }));
  $$('[data-open-transport-notification]').forEach(button=>button.addEventListener('click',async()=>{
    await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.openTransportNotification}).catch?.(()=>{});
    const view=button.dataset.transportNotificationView;
    if(view==='transport-vehicles')openTransportView('vehicles');
    else if(view==='transport-profile')openTransportView('profile');
    else if(view==='transport-jobs')openTransportView('jobs');
    else if(view==='transport-earnings')openTransportView('earnings');
    else if(view==='transport-settlements')openTransportView('settlements');
    else openTransportView('notifications');
    await loadTransportNotifications();
  }));
}
$('#markAllTransportNotificationsRead')?.addEventListener('click',async()=>{
  const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'transport'});
  if(error){status($('#transportRegistrationStatus'),error.message,'error');return;}
  await loadTransportNotifications();
});

async function handleSession(session){
  currentUser=session?.user||null;
  logout.hidden=!currentUser;
  if(partnerNotificationBell)partnerNotificationBell.hidden=true;
  if(!currentUser){
    seller=null;products=[];sellerEarningsReport=null;provider=null;providerServices=[];providerNotifications=[];providerJobs=[];providerSettlementAccounts=[];providerSettlementRequests=[];providerSettlements=[];providerEarningsReport=null;
    transportProvider=null;transportVehicles=[];transportJobs=[];transportNotifications=[];editingTransportVehicle=null;
    premiumProfile=null;premiumNotifications=[];
    accommodationProvider=null;accommodationNotifications=[];activeRole='';
    document.body.classList.remove('cyber-role-open');
    authShell.hidden=false;rolePicker.hidden=true;sellerShell.hidden=true;
    if(providerShell)providerShell.hidden=true;
    if(transportShell)transportShell.hidden=true;
    if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
    if(cyberShell)cyberShell.hidden=true;
    if(hero)hero.hidden=false;
    return;
  }
  authShell.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(premiumShell)premiumShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  if(cyberShell)cyberShell.hidden=true;
  const reopeningCyber=activeRole==='cyber';
  document.body.classList.toggle('cyber-role-open',reopeningCyber);
  rolePicker.hidden=reopeningCyber;
  if(hero)hero.hidden=reopeningCyber;
  if(activeRole==='seller')await openSellerRole();
  if(activeRole==='service_provider')await openProviderRole();
  if(activeRole==='transport')await openTransportRole();
  if(activeRole==='premium')await openPremiumRole();
  if(activeRole==='accommodation')await openAccommodationRole();
  if(reopeningCyber && typeof window.leogoOpenCyberPartner==='function')await window.leogoOpenCyberPartner();
}

window.addEventListener('unhandledrejection',event=>{
  if(activeRole==='seller' && sellerShell && !sellerShell.hidden && sellerDashboard.hidden){
    const reason=event.reason instanceof Error?event.reason:new Error(String(event.reason||'Unknown Seller Portal error'));
    showSellerBootError(reason);
  }
});
window.addEventListener('error',event=>{
  if(activeRole==='seller' && sellerShell && !sellerShell.hidden && sellerDashboard.hidden){
    showSellerBootError(event.error||new Error(event.message||'Seller Portal error'));
  }
});

window.setInterval(()=>{
  if(activeRole==='accommodation'&&currentUser){
    loadAccommodationNotifications().catch(()=>{});
  }
  if(activeRole==='premium'&&currentUser){
    loadPremiumNotifications().catch(()=>{});
  }
},30000);

client.auth.onAuthStateChange((event,s)=>{
  if(event==='PASSWORD_RECOVERY'){
    currentUser=s?.user||null;
    passwordRecoveryMode=true;
    passwordRecoverySessionVerified=Boolean(s?.user);
    if(s?.user)passwordRecoverySessionPromise=Promise.resolve(s);
    showPasswordRecoveryScreen({
      valid:passwordRecoverySessionVerified,
      message:passwordRecoverySessionVerified
        ? 'Secure password reset verified. Create a new password for your LEOGO account.'
        : 'Verifying your secure password reset link…'
    });
    return;
  }

  // Never fall through to the Partner dashboard while a password-recovery URL is being processed.
  if(passwordRecoveryMode){
    if(passwordRecoveryUrlError){
      showPasswordRecoveryScreen({
        valid:false,
        message:passwordRecoveryUrlErrorDescription
          ? passwordRecoveryFriendlyMessage(passwordRecoveryUrlErrorDescription)
          : 'This password reset link is invalid or has expired. Request a fresh reset link.'
      });
      return;
    }
    if(passwordRecoverySessionVerified&&s?.user){
      currentUser=s.user;
      showPasswordRecoveryScreen({valid:true,message:'Create a new password for your LEOGO account.'});
    }
    return;
  }

  if(
    activeRole==='accommodation' &&
    accommodationReg &&
    !accommodationReg.hidden &&
    s?.user &&
    currentUser?.id===s.user.id &&
    ['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION'].includes(event)
  ){
    currentUser=s.user;
    saveAccommodationDraft();
    return;
  }

  setTimeout(()=>{handleSession(s).catch(console.error);},0);
});
client.auth.getSession().then(async({data,error})=>{
  if(passwordRecoveryMode){
    if(passwordRecoveryUrlError){
      showPasswordRecoveryScreen({
        valid:false,
        message:passwordRecoveryUrlErrorDescription
          ? passwordRecoveryFriendlyMessage(passwordRecoveryUrlErrorDescription)
          : 'This password reset link is invalid or has expired. Request a fresh reset link.'
      });
      return;
    }

    if(error){
      passwordRecoverySessionVerified=false;
      showPasswordRecoveryScreen({
        valid:false,
        message:'This password reset link could not be verified. Request a fresh reset link.'
      });
      return;
    }

    if(data.session?.user){
      currentUser=data.session.user;
      passwordRecoverySessionVerified=true;
      passwordRecoverySessionPromise=Promise.resolve(data.session);
      showPasswordRecoveryScreen({valid:true,message:'Secure password reset verified. Create a new password for your LEOGO account.'});
      return;
    }

    showPasswordRecoveryScreen({valid:false,message:'Verifying your password reset link…',type:''});
    try{
      const session=await establishPasswordRecoverySession();
      if(session?.user){
        showPasswordRecoveryScreen({valid:true,message:'Secure password reset verified. Create a new password for your LEOGO account.'});
        return;
      }
    }catch(recoveryError){
      showPasswordRecoveryScreen({
        valid:false,
        message:recoveryError?.message||'This password reset link is invalid, expired, or has already been used. Request a fresh link below.'
      });
    }
    return;
  }
  handleSession(data.session);
});})();

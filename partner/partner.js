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
let accommodationProvider=null,accommodationNotifications=[],accommodationCatalogue=[];
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

const authShell=$('#partnerAuthShell'),rolePicker=$('#partnerRolePicker'),sellerShell=$('#sellerShell'),providerShell=$('#providerShell'),transportShell=$('#transportShell'),accommodationShell=$('#accommodationShell'),logout=$('#partnerLogout'),hero=$('.hero');
const partnerNotificationBell=$('#partnerNotificationBell'),partnerNotificationBadge=$('#partnerNotificationBadge');
const resetRequestForm=$('#partnerResetRequestForm'),resetUpdateForm=$('#partnerResetUpdateForm');
const sellerReg=$('#sellerRegistrationForm'),approvedArea=$('#sellerApprovedArea'),sellerOnboarding=$('#sellerOnboarding'),sellerDashboard=$('#sellerDashboard'),sellerDocsForm=$('#sellerVerificationDocumentsForm');
const sellerProfilePanel=$('#sellerProfilePanel'),sellerNotificationPanel=$('#sellerNotificationPanel'),sellerSettlementPanel=$('#sellerSettlementPanel'),sellerPendingArea=$('#sellerPendingArea'),sellerSidebar=$('#sellerSidebar'),sellerBootStatus=$('#sellerBootStatus');
let activeRole='';

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
  if(button.dataset.roleTarget==='seller')openSellerRole();
  if(button.dataset.roleTarget==='service_provider')openProviderRole();
  if(button.dataset.roleTarget==='transport')openTransportRole();
  if(button.dataset.roleTarget==='accommodation')openAccommodationRole();
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
  activeRole='';
  if(partnerNotificationBell)partnerNotificationBell.hidden=true;
  rolePicker.hidden=false;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  authShell.hidden=true;
  if(hero)hero.hidden=false;
}
async function openSellerRole(){
  activeRole='seller';
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=false;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  if(hero)hero.hidden=true;

  // Show visible feedback synchronously before any network request begins.
  sellerOnboarding.hidden=true;
  sellerDashboard.hidden=true;
  sellerReg.hidden=true;
  showSellerBoot('Loading your Seller account…');
  primeSellerLocationOptions();

  await loadSeller();
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
        '<small>'+escapeHtml(String(p.product_details||'').slice(0,140))+'</small>'+
        (p.product_review_notes?'<div class="variant-warning">Admin note: '+escapeHtml(p.product_review_notes)+'</div>':'')+
        variantMarkup+
      '</div>'+
      '<button data-edit-product="'+escapeHtml(p.id)+'" type="button">Edit</button>'+
    '</article>';
  }).join('');

  installSellerMediaFallback(box);
  Array.from(box.querySelectorAll('[data-edit-product]')).forEach(button=>{
    button.addEventListener('click',async event=>{
      event.preventDefault();
      event.stopPropagation();
      const original=button.textContent;
      button.disabled=true;
      button.textContent='Opening…';
      try{
        await editProduct(button.dataset.editProduct);
      }finally{
        if(button.isConnected){
          button.disabled=false;
          button.textContent=original;
        }
      }
    });
  });
  renderFlashSaleProducts();
  renderSellerDataSelection();
}
$('#flashSaleProduct').addEventListener('change',()=>{
  const p=products.find(item=>item.id===$('#flashSaleProduct').value);
  $('#flashSaleNormalPrice').value=p?money(p.price_kes):'';
  if(p){
    $('#flashSalePrice').value=p.flash_sale_price_kes||'';
    $('#flashSaleQuantity').value=p.flash_sale_quantity||'';
    $('#flashSaleStart').value=localInput(p.flash_sale_starts_at);
    $('#flashSaleEnd').value=localInput(p.flash_sale_ends_at);
  }
});
$('#sellerFlashSaleForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const product=products.find(item=>item.id===$('#flashSaleProduct').value);
  if(!product){status($('#flashSaleStatus'),'Choose one of your existing products.','error');return;}
  const flashPrice=Number($('#flashSalePrice').value);
  const quantity=Number($('#flashSaleQuantity').value);
  const startValue=$('#flashSaleStart').value;
  const endValue=$('#flashSaleEnd').value;
  if(!flashPrice||flashPrice<=0){status($('#flashSaleStatus'),'Enter a valid Flash Sale price.','error');return;}
  if(flashPrice>=Number(product.price_kes)){status($('#flashSaleStatus'),'Flash Sale price should be lower than the normal selling price.','error');return;}
  if(!quantity||quantity<=0||quantity>Number(product.quantity_available)){status($('#flashSaleStatus'),'Flash quantity must be greater than zero and cannot exceed available stock.','error');return;}
  if(!startValue||!endValue||new Date(endValue)<=new Date(startValue)){status($('#flashSaleStatus'),'Choose a valid Flash Sale start and end time.','error');return;}
  const button=e.submitter||$('#sellerFlashSaleForm button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Sending…';
  status($('#flashSaleStatus'),'Sending Flash Sale request…');
  try{
    const {error}=await client.from('seller_products').update({
      flash_sale_requested:true,
      flash_sale_price_kes:flashPrice,
      flash_sale_quantity:quantity,
      flash_sale_starts_at:new Date(startValue).toISOString(),
      flash_sale_ends_at:new Date(endValue).toISOString(),
      flash_sale_status:'requested',
      updated_at:new Date().toISOString()
    }).eq('id',product.id).eq('seller_id',currentUser.id);
    if(error)throw error;
    status($('#flashSaleStatus'),'Flash Sale request sent successfully.','success');
    e.target.reset();$('#flashSaleNormalPrice').value='';
    await loadProducts();
  }catch(error){status($('#flashSaleStatus'),error.message||'Flash Sale request could not be sent.','error');}
  finally{button.disabled=false;button.textContent=original;}
});

function resetProductForm(hide=true){
  editingProduct=null;$('#sellerProductForm').reset();$('#sellerProductId').value='';$('#productFormTitle').textContent='Add Product / Item';$('#cancelProductEdit').hidden=true;$('#variantRows').innerHTML='';$('#variantSection').hidden=true;$('#lppFields').hidden=true;$('#productOtherUnitWrap').hidden=true;$('#productCustomCategoryWrap').hidden=true;$('#productCustomSubcategoryWrap').hidden=true;$('#productCustomCategory').required=false;$('#productCustomSubcategory').required=false;renderSubcategories();status($('#productFormStatus'));
  if(hide)$('#sellerProductForm').hidden=true;
}
$('#cancelProductEdit').addEventListener('click',()=>resetProductForm(true));
$('#showSellerProductForm').addEventListener('click',()=>{resetProductForm(false);$('#sellerProductForm').hidden=false;$('#sellerProductForm').scrollIntoView({behavior:'smooth',block:'start'});});
$('#sellerProductList').addEventListener('click',async event=>{
  const button=event.target.closest('[data-edit-product]');
  if(!button)return;
  event.preventDefault();
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Opening…';
  try{
    await editProduct(button.dataset.editProduct);
  }finally{
    // The button may have been replaced by a re-render; only restore if still connected.
    if(button.isConnected){
      button.disabled=false;
      button.textContent=original;
    }
  }
});

$('#refreshSellerProducts').addEventListener('click',async()=>{
  const button=$('#refreshSellerProducts');
  const original=button.textContent;
  button.disabled=true;button.textContent='Refreshing…';
  try{
    await loadProducts();
  }finally{
    button.disabled=false;button.textContent=original;
  }
});

function localInput(iso){if(!iso)return'';const d=new Date(iso);const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
async function editProduct(id){
  try{
    let p=products.find(x=>x.id===id);

    // If the card was rendered from stale memory, refresh once before failing.
    if(!p){
      await loadProducts();
      p=products.find(x=>x.id===id);
    }
    if(!p)throw new Error('This product could not be found. Refresh Products and try again.');

    // Ensure category/subcategory data exists before filling the edit form.
    if(!categories.length){
      await loadTaxonomy();
    }

    editingProduct=p;
    status($('#productFormStatus'),'Editing '+p.product_name+'…','success');

    $('#sellerProductId').value=p.id;
    $('#productFormTitle').textContent='Edit Product / Item';
    $('#productName').value=p.product_name||'';
    $('#productPrice').value=p.price_kes??'';
    $('#productAvailability').value=p.availability_status||'available';
    $('#productQuantity').value=p.quantity_available??0;
    $('#productUnit').value=p.measurement_unit||'piece';
    $('#productOtherUnit').value=p.measurement_unit_other||'';
    $('#productOtherUnitWrap').hidden=p.measurement_unit!=='other';

    $('#productCategory').value=p.category_id||'';
    renderSubcategories();
    $('#productSubcategory').value=p.subcategory_id||'';
    updateOtherSpecifyFields();
    $('#productCustomCategory').value=p.custom_category_name||'';
    $('#productCustomSubcategory').value=p.custom_subcategory_name||'';

    $('#productGroup').value=p.group_name||'';
    $('#productListingStatus').value=p.listing_status||'active';
    $('#productDetails').value=p.product_details||'';

    $('#productHasVariants').checked=Boolean(p.has_variants);
    $('#variantSection').hidden=!p.has_variants;
    $('#variantRows').innerHTML='';
    (Array.isArray(p.seller_product_variants)?p.seller_product_variants:[]).forEach(addVariantRow);

    $('#productLpp').checked=Boolean(p.accepts_lipa_pole_pole);
    $('#lppFields').hidden=!p.accepts_lipa_pole_pole;
    $('#productLppDeposit').value=p.lipa_pole_pole_first_deposit_kes??'';
    $('#productLppDays').value=p.lipa_pole_pole_max_days??'';

    $('#cancelProductEdit').hidden=false;
    $('#sellerProductForm').hidden=false;
    openSellerView('products');

    requestAnimationFrame(()=>{
      $('#sellerProductForm').scrollIntoView({behavior:'smooth',block:'start'});
      try{$('#productName').focus();}catch(_focusError){}
    });
  }catch(error){
    console.error('Edit product failed:',error);
    status($('#productFormStatus'),error?.message||'Product could not be opened for editing.','error');
    const form=$('#sellerProductForm');
    if(form)form.hidden=false;
  }
}

$('#sellerProductForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!seller||seller.application_status!=='approved'){
    status($('#productFormStatus'),'Seller approval is required before adding products.','error');
    return;
  }

  const submitButton=e.submitter||$('#sellerProductForm button[type="submit"]');
  const originalText=submitButton?.textContent||'Save Product';
  const uploadedThisAttempt=[];
  let saveCommitted=false;

  try{
    if(submitButton){submitButton.disabled=true;submitButton.textContent='Checking Product…';}
    status($('#productFormStatus'),'Checking product and variants…');

    const selectedCategory=categories.find(x=>x.id===$('#productCategory').value);
    const selectedSubcategory=subcategories.find(x=>x.id===$('#productSubcategory').value);

    if(selectedCategory?.code==='other'&&$('#productCustomCategory').value.trim().length<2){
      throw new Error('Specify the category name.');
    }
    if(selectedSubcategory?.code==='others'&&$('#productCustomSubcategory').value.trim().length<2){
      throw new Error('Specify the sub-category name.');
    }

    const hasVariants=$('#productHasVariants').checked;
    const lpp=$('#productLpp').checked;
    const variantContainer=document.getElementById('variantRows');
    const variantRows=hasVariants&&variantContainer
      ? Array.from(variantContainer.querySelectorAll('.variant-row'))
      : [];

    if(hasVariants&&variantRows.length===0){
      throw new Error('Add at least one variant or switch off variants.');
    }

    for(let i=0;i<variantRows.length;i++){
      const row=variantRows[i];
      const name=row.querySelector('[data-variant-name]')?.value.trim()||'';
      const price=Number(row.querySelector('[data-variant-price]')?.value);
      const qty=Number(row.querySelector('[data-variant-qty]')?.value);
      const file=row.querySelector('[data-variant-image]')?.files?.[0]||null;
      const existingImage=row.dataset.existingImage||'';

      if(!name)throw new Error('Enter a name for variant '+(i+1)+'.');
      if(!Number.isFinite(price)||price<0)throw new Error('Enter a valid Amount (KSh) for variant "'+name+'".');
      if(!Number.isFinite(qty)||qty<0)throw new Error('Enter a valid quantity for variant "'+name+'".');
      if(!file&&!existingImage)throw new Error('Add a profile picture for variant "'+name+'".');
    }

    const galleryFiles=[...$('#productGallery').files];
    if(galleryFiles.length>3)throw new Error('Choose a maximum of 3 gallery pictures.');

    if(submitButton)submitButton.textContent='Uploading Pictures…';
    status($('#productFormStatus'),'Uploading product and variant pictures…');

    const uploadTracked=async(file,prefix)=>{
      const path=await uploadImage(file,prefix);
      if(path)uploadedThisAttempt.push(path);
      return path;
    };

    let mainPath=editingProduct?.main_image_path||null;
    if($('#productMainImage').files[0]){
      mainPath=await uploadTracked($('#productMainImage').files[0],'main');
    }
    if(!mainPath)throw new Error('Add a main product picture.');

    let galleryPaths=editingProduct?.gallery_image_paths||[];
    if(galleryFiles.length){
      galleryPaths=[];
      for(let i=0;i<galleryFiles.length;i++){
        galleryPaths.push(await uploadTracked(galleryFiles[i],'gallery-'+i));
      }
    }

    const variants=[];
    for(let i=0;i<variantRows.length;i++){
      const row=variantRows[i];
      const name=row.querySelector('[data-variant-name]').value.trim();
      const price=Number(row.querySelector('[data-variant-price]').value);
      const qty=Number(row.querySelector('[data-variant-qty]').value);
      const file=row.querySelector('[data-variant-image]').files[0]||null;
      let imagePath=row.dataset.existingImage||null;
      if(file)imagePath=await uploadTracked(file,'variant-'+i);
      variants.push({
        variant_name:name,
        price_kes:price,
        quantity_available:qty,
        image_path:imagePath,
        display_order:i,
        is_active:true
      });
    }

    const productPayload={
      product_name:$('#productName').value.trim(),
      price_kes:Number($('#productPrice').value),
      availability_status:$('#productAvailability').value,
      quantity_available:Number($('#productQuantity').value),
      measurement_unit:$('#productUnit').value,
      measurement_unit_other:$('#productUnit').value==='other'?$('#productOtherUnit').value.trim()||null:null,
      accepts_lipa_pole_pole:lpp,
      lipa_pole_pole_first_deposit_kes:lpp?Number($('#productLppDeposit').value):null,
      lipa_pole_pole_max_days:lpp?Number($('#productLppDays').value):null,
      has_variants:hasVariants,
      product_details:$('#productDetails').value.trim(),
      main_image_path:mainPath,
      gallery_image_paths:galleryPaths,
      category_id:$('#productCategory').value,
      subcategory_id:$('#productSubcategory').value||null,
      custom_category_name:$('#productCustomCategoryWrap').hidden?null:$('#productCustomCategory').value.trim()||null,
      custom_subcategory_name:$('#productCustomSubcategoryWrap').hidden?null:$('#productCustomSubcategory').value.trim()||null,
      group_name:$('#productGroup').value.trim()||null,
      listing_status:$('#productListingStatus').value
    };

    if(submitButton)submitButton.textContent='Saving Product…';
    status($('#productFormStatus'),'Saving product with '+variants.length+' variant'+(variants.length===1?'':'s')+'…');

    const {data,error}=await client.rpc('seller_save_product_with_variants',{
      p_product_id:editingProduct?.id||null,
      p_product:productPayload,
      p_variants:variants
    });
    if(error)throw error;
    saveCommitted=true;

    const savedProductId=data?.product_id||editingProduct?.id||null;
    const savedCount=Number(data?.variant_count??variants.length);

    status(
      $('#productFormStatus'),
      'Product saved successfully'+(hasVariants?' with '+savedCount+' variant'+(savedCount===1?'':'s'):'')+'. Submitted to Admin for approval before customer publication.',
      'success'
    );

    const refreshed=await loadProducts({focusProductId:savedProductId});
    const visible=Boolean(savedProductId&&refreshed.some(product=>product.id===savedProductId));

    if(visible){
      $('#sellerProductForm').hidden=true;
      openSellerView('products');
      const list=$('#sellerProductList');
      if(list)list.scrollIntoView({behavior:'smooth',block:'start'});
      window.setTimeout(()=>resetProductForm(true),500);
    }else{
      status(
        $('#productFormStatus'),
        'Product was saved, but the product list did not refresh. Use Refresh Products; your saved data is safe.',
        'error'
      );
    }
  }catch(err){
    if(!saveCommitted&&uploadedThisAttempt.length){
      try{await client.storage.from('seller-product-media').remove(uploadedThisAttempt);}catch(cleanupError){console.warn('Media cleanup failed',cleanupError);}
    }
    console.error('Seller product save failed:',err);
    status($('#productFormStatus'),err?.message||'Product could not be saved.','error');
  }finally{
    if(submitButton){submitButton.disabled=false;submitButton.textContent=originalText;}
  }
});


/* SERVICE PROVIDER MODULE — additive and isolated from Seller / marketplace orders */
const providerBootStatus=$('#providerBootStatus');
const providerOnboarding=$('#providerOnboarding');
const providerReg=$('#providerRegistrationForm');
const providerPendingArea=$('#providerPendingArea');
const providerDashboard=$('#providerDashboard');
const providerPhotoManager=$('#providerPhotoManager');
const providerSidebar=$('#providerSidebar');


function updateSharedPartnerNotificationBadge(count=0){
  if(!partnerNotificationBell||!partnerNotificationBadge)return;
  const unread=Number(count||0);
  partnerNotificationBadge.hidden=!unread;
  partnerNotificationBadge.textContent=unread>99?'99+':String(unread);
  partnerNotificationBell.classList.toggle('has-unread',unread>0);
}
function providerViewDescription(view){
  return {
    overview:'Overview of your Service Provider account.',
    jobs:'Received customer jobs and quotation requests.',
    services:'Manage your service listings and approval status.',
    earnings:'View completed-job earnings, LEOGO commission, cumulative earnings and your available balance.',
    settlements:'Add and manage your Admin-approved Service Provider payout account.',
    notifications:'New jobs, quotation decisions and LEOGO Admin updates.',
    profile:'Your approved profile and profile photos.'
  }[view]||'Service Provider Portal';
}
function closeProviderSidebar(){
  providerSidebar?.classList.remove('open');
  $('#providerSidebarScrim')?.classList.remove('open');
}
function openProviderView(view='overview'){
  const allowed=['overview','jobs','services','earnings','settlements','notifications','profile'];
  const resolved=allowed.includes(view)?view:'overview';
  $$('[data-provider-content]').forEach((panel)=>panel.classList.toggle('active',panel.dataset.providerContent===resolved));
  $$('[data-provider-view]').forEach((button)=>button.classList.toggle('active',button.dataset.providerView===resolved));
  const description=$('#providerViewDescription');
  if(description)description.textContent=providerViewDescription(resolved);
  if(providerPhotoManager){
    if(resolved==='profile'){
      const slot=$('#providerProfilePhotoSlot');
      if(slot&&providerPhotoManager.parentElement!==slot)slot.appendChild(providerPhotoManager);
      providerPhotoManager.hidden=false;
      renderProviderPhotoManager();
    }else providerPhotoManager.hidden=true;
  }
  if(resolved==='jobs')loadProviderJobs().catch((error)=>console.warn('Provider jobs refresh failed:',error));
  if(resolved==='earnings')loadProviderEarnings().catch((error)=>console.warn('Provider earnings refresh failed:',error));
  if(resolved==='settlements')loadProviderSettlementAccounts().catch((error)=>console.warn('Provider settlement accounts refresh failed:',error));
  if(resolved==='notifications')loadProviderNotifications().catch((error)=>console.warn('Provider notifications refresh failed:',error));
  closeProviderSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-provider-view]').forEach((button)=>button.addEventListener('click',()=>openProviderView(button.dataset.providerView)));
$$('[data-open-provider-view]').forEach((button)=>button.addEventListener('click',()=>openProviderView(button.dataset.openProviderView)));
$('#providerSidebarToggle')?.addEventListener('click',()=>{providerSidebar?.classList.add('open');$('#providerSidebarScrim')?.classList.add('open');});
$('#providerSidebarScrim')?.addEventListener('click',closeProviderSidebar);
$('#providerNotificationsButton')?.addEventListener('click',()=>openProviderView('notifications'));
$('#providerProfileButton')?.addEventListener('click',()=>openProviderView('profile'));
$('#refreshProviderJobs')?.addEventListener('click',()=>loadProviderJobs());
$('#showProviderServiceForm')?.addEventListener('click',()=>{
  openProviderView('services');
  const form=$('#providerServiceForm');
  if(form){form.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
});
partnerNotificationBell?.addEventListener('click',()=>{
  if(activeRole==='seller')openSellerView('notifications');
  else if(activeRole==='service_provider')openProviderView('notifications');
  else if(activeRole==='transport')openTransportView('notifications');
  else if(activeRole==='accommodation')openAccommodationView('notifications');
});

function showProviderBoot(message='Loading your Service Provider account…',isError=false){
  if(!providerBootStatus)return;
  providerBootStatus.hidden=false;
  $('#providerBootTitle').textContent=isError?'Service Provider Portal needs attention':'Opening your Service Provider dashboard…';
  $('#providerBootMessage').textContent=message;
  const spinner=$('.seller-boot-spinner',providerBootStatus);
  if(spinner)spinner.hidden=isError;
  $('#retryProviderBoot').hidden=!isError;
}
function hideProviderBoot(){if(providerBootStatus)providerBootStatus.hidden=true;}
function providerStatusCopy(value){
  if(value==='submitted')return 'Submitted to LEOGO Admin. Your Service Provider application is waiting for review.';
  if(value==='under_review')return 'LEOGO Admin is reviewing your Service Provider registration.';
  if(value==='changes_requested')return 'LEOGO Admin requested corrections. Update the application and resubmit it.';
  if(value==='approved')return 'Approved. You can now create and manage your service listings.';
  if(value==='rejected')return 'The application was not approved. Review the Admin note and correct it before resubmitting if appropriate.';
  if(value==='suspended')return 'This Service Provider account is currently suspended. Contact LEOGO Admin.';
  return 'Complete Service Provider registration to start offering services through LEOGO.';
}
async function ensureProviderLocations(preferredCounty='',preferredSubcounty=''){
  await loadKenyaLocations();
  const county=$('#providerCounty'),sub=$('#providerSubCounty');
  if(!county||!sub)return;
  county.innerHTML='<option value="">Select county</option>'+kenyaCounties.map((item)=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.display_name||item.name)+'</option>').join('');
  if(preferredCounty&&kenyaCounties.some((item)=>item.code===preferredCounty))county.value=preferredCounty;
  await renderProviderSubcounties(preferredSubcounty);
}
async function renderProviderSubcounties(preferredCode=''){
  const countyCode=$('#providerCounty')?.value||'';
  const target=$('#providerSubCounty');
  if(!target)return;
  target.disabled=!countyCode;
  if(!countyCode){target.innerHTML='<option value="">Choose a county first</option>';return;}
  let options=kenyaSubcounties.filter((item)=>item.county_code===countyCode);
  if(!options.length){
    target.innerHTML='<option value="">Loading sub-counties…</option>';
    const {data,error}=await client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).eq('county_code',countyCode).order('name');
    if(!error&&data?.length){
      kenyaSubcounties=[...kenyaSubcounties.filter((item)=>item.county_code!==countyCode),...data];
      options=data;
    }
  }
  target.innerHTML=options.length?'<option value="">Select sub-county</option>'+options.map((item)=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.name)+'</option>').join(''):'<option value="">No active sub-counties configured</option>';
  target.disabled=!options.length;
  if(preferredCode&&options.some((item)=>item.code===preferredCode))target.value=preferredCode;
}
$('#providerCounty')?.addEventListener('change',()=>renderProviderSubcounties());

async function uploadProviderVerification(file,prefix){
  if(!file)return null;
  if(file.size>8388608)throw new Error('Each verification document must be 8 MB or smaller.');
  const ext=(file.name.split('.').pop()||'pdf').toLowerCase();
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('service-provider-verification').upload(path,file,{upsert:false});
  if(error)throw error;
  return path;
}
async function uploadProviderPublicPhoto(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Profile picture must be JPG, PNG or WEBP.');
  if(file.size>5242880)throw new Error('Profile picture must be 5 MB or smaller.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/profile-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('service-provider-public-media').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}
async function uploadProviderPassportPhoto(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Passport photo must be JPG, PNG or WEBP.');
  if(file.size>5242880)throw new Error('Passport photo must be 5 MB or smaller.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/passport-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('service-provider-passport-photo').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}
function providerPublicPhotoUrl(path){
  return path?client.storage.from('service-provider-public-media').getPublicUrl(path).data.publicUrl:'';
}
function renderProviderPhotoManager(){
  if(!providerPhotoManager)return;
  if(!provider){providerPhotoManager.hidden=true;return;}
  const preview=$('#providerPublicPhotoPreview');
  const url=providerPublicPhotoUrl(provider.profile_picture_path);
  if(preview){
    preview.innerHTML=url?'<img src="'+escapeHtml(url)+'" alt="Service Provider profile picture">':'<span>👤</span>';
  }
  $('#providerPublicPhotoState').textContent=provider.profile_picture_path?'Profile picture added — visible to customers after approval':'No profile picture added';
  $('#providerPassportPhotoState').textContent=provider.passport_photo_path?'Passport photo: uploaded privately':'Passport photo: not added';
}

function providerSummaryRows(){
  if(!provider)return [];
  return [
    ['Business / Professional Name',provider.business_name],
    ['Owner / Professional',provider.owner_name],
    ['Primary Service',provider.primary_service],
    ['Category',provider.service_category||'—'],
    ['Experience',provider.experience_years==null?'—':provider.experience_years+' year(s)'],
    ['Phone',provider.phone],
    ['Location',[provider.town,provider.sub_county,provider.county].filter(Boolean).join(', ')],
    ['Service Area',provider.service_area_notes||'—'],
    ['Application Status',String(provider.application_status||'').replaceAll('_',' ')],
    ['Admin Note',provider.admin_notes||'—']
  ];
}
function renderProviderApplicationSummary(){
  const target=$('#providerApplicationSummary');
  if(!target)return;
  target.innerHTML=providerSummaryRows().map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  const note=$('#providerAdminNote');
  if(note){
    note.hidden=!provider?.admin_notes;
    note.textContent=provider?.admin_notes?'Admin note: '+provider.admin_notes:'';
  }
}
function populateProviderApplication(){
  if(!provider)return;
  $('#providerBusinessName').value=provider.business_name||'';
  $('#providerOwnerName').value=provider.owner_name||'';
  $('#providerIdNumber').value=provider.id_number||'';
  $('#providerPhone').value=provider.phone||'';
  $('#providerPrimaryService').value=provider.primary_service||'';
  $('#providerServiceCategory').value=provider.service_category||'';
  $('#providerExperienceYears').value=provider.experience_years??'';
  $('#providerTown').value=provider.town||'';
  $('#providerLocation').value=provider.location_details||'';
  $('#providerDescription').value=provider.business_description||'';
  $('#providerServiceAreaNotes').value=provider.service_area_notes||'';
  $('#providerBusinessIdDocument').required=!provider.business_id_document_path;
  ensureProviderLocations(provider.county_code||'',provider.sub_county_code||'').catch(console.warn);
}
function renderProvider(){
  hideProviderBoot();
  providerOnboarding.hidden=true;
  providerReg.hidden=true;
  providerPendingArea.hidden=true;
  providerDashboard.hidden=true;
  if(providerPhotoManager)providerPhotoManager.hidden=true;
  if(!provider){providerOnboarding.hidden=false;return;}
  renderProviderPhotoManager();
  if(provider.application_status!=='approved'){
    providerPendingArea.hidden=false;
    $('#providerPendingTitle').textContent=provider.application_status==='changes_requested'?'Correction requested':provider.application_status==='rejected'?'Application not approved':'Application '+String(provider.application_status||'submitted').replaceAll('_',' ');
    $('#providerPendingMessage').textContent=providerStatusCopy(provider.application_status);
    $('#editProviderApplication').hidden=!['changes_requested','rejected'].includes(provider.application_status);
    renderProviderApplicationSummary();
    return;
  }
  providerDashboard.hidden=false;
  $('#providerDashboardName').textContent=provider.business_name||'My Service Business';
  $('#providerSidebarBusiness').textContent=provider.business_name||'Service Provider';
  $('#providerSidebarStatus').textContent=String(provider.application_status||'approved').replaceAll('_',' ').toUpperCase();
  $('#providerAvailability').textContent=(provider.availability_status||'available').replaceAll('_',' ');
  $('#providerProfileSummary').innerHTML=providerSummaryRows().filter(([label])=>label!=='Admin Note').map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  renderProviderServices();
  renderProviderJobs();
  renderProviderNotifications();
  openProviderView('overview');
}
async function loadProvider(){
  if(!currentUser)return;
  showProviderBoot();
  try{
    const result=await Promise.race([
      client.rpc('service_provider_get_own_account'),
      waitTimeout(8000,'Service Provider account is taking too long to load. Check your connection and tap Retry.')
    ]);
    if(result?.error)throw result.error;
    provider=result?.data||null;
    renderProvider();
    await ensureProviderLocations(provider?.county_code||'',provider?.sub_county_code||'');
    if(provider?.application_status==='approved')await Promise.allSettled([loadProviderServices(),loadProviderJobs(),loadProviderNotifications(),loadProviderSettlementAccounts(),loadProviderEarnings()]);
  }catch(error){
    console.error('Service Provider portal boot failed:',error);
    showProviderBoot(error?.message||'The Service Provider dashboard could not finish loading.',true);
    providerOnboarding.hidden=true;providerReg.hidden=true;providerPendingArea.hidden=true;providerDashboard.hidden=true;
  }
}
async function openProviderRole(){
  activeRole='service_provider';
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  providerShell.hidden=false;
  authShell.hidden=true;
  if(hero)hero.hidden=true;
  showProviderBoot();
  await loadProvider();
}
function openProviderRegistration(editExisting=false){
  providerOnboarding.hidden=true;
  providerPendingArea.hidden=true;
  providerDashboard.hidden=true;
  if(providerPhotoManager)providerPhotoManager.hidden=true;
  providerReg.hidden=false;
  status($('#providerRegistrationStatus'),'');
  if(editExisting&&provider)populateProviderApplication();
  else{
    providerReg.reset();
    $('#providerBusinessIdDocument').required=true;
    ensureProviderLocations().catch(console.warn);
  }
  providerReg.scrollIntoView({behavior:'smooth'});
}
$('#retryProviderBoot')?.addEventListener('click',()=>openProviderRole());
$('#showProviderRegistration')?.addEventListener('click',()=>openProviderRegistration(false));
$('#editProviderApplication')?.addEventListener('click',()=>openProviderRegistration(true));
$('#editApprovedProviderProfile')?.addEventListener('click',()=>{
  if(!provider||provider.application_status!=='approved')return;
  status($('#providerProfileEditStatus'),'Edit your profile and submit it. Your current approved profile stays active while Admin reviews the changes.');
  openProviderRegistration(true);
});
$('#cancelProviderRegistration')?.addEventListener('click',()=>provider?renderProvider():openProviderRole());
$('#providerPendingBack')?.addEventListener('click',showRolePicker);
$('#providerBackToPartnerships')?.addEventListener('click',showRolePicker);
$('#refreshProviderDashboard')?.addEventListener('click',()=>loadProvider());

providerReg?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(!providerReg.reportValidity())return;
  const phone=normalisePhone($('#providerPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#providerRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  const otherFiles=[...$('#providerOtherPermits').files];
  if(otherFiles.length>4){status($('#providerRegistrationStatus'),'Choose a maximum of 4 other permit files.','error');return;}
  const submitButton=providerReg.querySelector('button[type="submit"]');
  const original=submitButton.textContent;submitButton.disabled=true;submitButton.textContent='Submitting…';
  try{
    status($('#providerRegistrationStatus'),'Uploading private verification documents…');
    const businessIdFile=$('#providerBusinessIdDocument').files[0];
    const businessIdPath=businessIdFile?await uploadProviderVerification(businessIdFile,'business-id'):(provider?.business_id_document_path||null);
    if(!businessIdPath)throw new Error('Business ID / identification document is required.');
    const [businessLicencePath,registrationCertificatePath,professionalLicencePath,otherPermitPaths,profilePicturePath,passportPhotoPath]=await Promise.all([
      $('#providerBusinessLicence').files[0]?uploadProviderVerification($('#providerBusinessLicence').files[0],'business-licence'):Promise.resolve(provider?.business_licence_path||null),
      $('#providerRegistrationCertificate').files[0]?uploadProviderVerification($('#providerRegistrationCertificate').files[0],'registration-certificate'):Promise.resolve(provider?.registration_certificate_path||null),
      $('#providerProfessionalLicence').files[0]?uploadProviderVerification($('#providerProfessionalLicence').files[0],'professional-licence'):Promise.resolve(provider?.professional_licence_path||null),
      otherFiles.length?Promise.all(otherFiles.map((file,index)=>uploadProviderVerification(file,'permit-'+index))):Promise.resolve(provider?.other_permit_paths||[]),
      $('#providerProfilePictureInitial').files[0]?uploadProviderPublicPhoto($('#providerProfilePictureInitial').files[0]):Promise.resolve(provider?.profile_picture_path||null),
      $('#providerPassportPhotoInitial').files[0]?uploadProviderPassportPhoto($('#providerPassportPhotoInitial').files[0]):Promise.resolve(provider?.passport_photo_path||null)
    ]);
    const providerProfilePayload={
      business_name:$('#providerBusinessName').value.trim(),owner_name:$('#providerOwnerName').value.trim(),
      id_number:$('#providerIdNumber').value.trim(),phone,primary_service:$('#providerPrimaryService').value.trim(),
      service_category:$('#providerServiceCategory').value.trim()||null,
      experience_years:$('#providerExperienceYears').value===''?null:Number($('#providerExperienceYears').value),
      county_code:$('#providerCounty').value,sub_county_code:$('#providerSubCounty').value,town:$('#providerTown').value.trim(),
      location_details:$('#providerLocation').value.trim(),business_description:$('#providerDescription').value.trim()||null,
      service_area_notes:$('#providerServiceAreaNotes').value.trim()||null,business_id_document_path:businessIdPath,
      business_licence_path:businessLicencePath,registration_certificate_path:registrationCertificatePath,
      professional_licence_path:professionalLicencePath,other_permit_paths:otherPermitPaths,
      profile_picture_path:profilePicturePath,passport_photo_path:passportPhotoPath
    };
    status($('#providerRegistrationStatus'),provider?.application_status==='approved'?'Sending profile changes to LEOGO Admin…':'Sending application to LEOGO Admin…');
    const {error}=provider?.application_status==='approved'
      ? await client.rpc('partner_submit_profile_change',{p_partner_type:'service_provider',p_payload:providerProfilePayload})
      : await client.rpc('submit_service_provider_application',{
          p_business_name:providerProfilePayload.business_name,p_owner_name:providerProfilePayload.owner_name,
          p_id_number:providerProfilePayload.id_number,p_phone:phone,p_primary_service:providerProfilePayload.primary_service,
          p_service_category:providerProfilePayload.service_category,p_experience_years:providerProfilePayload.experience_years,
          p_county_code:providerProfilePayload.county_code,p_sub_county_code:providerProfilePayload.sub_county_code,p_town:providerProfilePayload.town,
          p_location_details:providerProfilePayload.location_details,p_business_description:providerProfilePayload.business_description,
          p_service_area_notes:providerProfilePayload.service_area_notes,p_business_id_document_path:businessIdPath,
          p_business_licence_path:businessLicencePath,p_registration_certificate_path:registrationCertificatePath,
          p_professional_licence_path:professionalLicencePath,p_other_permit_paths:otherPermitPaths
        });
    if(error)throw error;
    if(provider?.application_status!=='approved'&&(profilePicturePath||passportPhotoPath)){
      const photoUpdate=await client.rpc('service_provider_update_profile_photos',{
        p_profile_picture_path:profilePicturePath,p_passport_photo_path:passportPhotoPath
      });
      if(photoUpdate.error)throw photoUpdate.error;
    }
    if(provider?.application_status==='approved'){
      status($('#providerRegistrationStatus'),'Profile changes sent to LEOGO Admin. Your current approved Service Provider profile remains active.','success');
      status($('#providerProfileEditStatus'),'Profile changes are awaiting Admin approval.','success');
      providerReg.hidden=true;providerDashboard.hidden=false;openProviderView('profile');
      await loadProviderNotifications().catch(()=>{});
    }else{
      status($('#providerRegistrationStatus'),'Service Provider application submitted successfully.','success');
      await loadProvider();
    }
  }catch(error){status($('#providerRegistrationStatus'),error?.message||'Service Provider application could not be submitted.','error');}
  finally{submitButton.disabled=false;submitButton.textContent=original;}
});

const providerJobStatusText=(value)=>({
  dispatched:'New request',accepted:'Accepted',declined:'Declined',quoted:'Quotation sent',
  quote_accepted:'Quotation accepted',quote_rejected:'Quotation rejected',
  in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'
}[value]||String(value||'').replaceAll('_',' '));
async function loadProviderJobs(){
  const {data,error}=await client.rpc('service_provider_list_jobs');
  if(error)throw error;
  providerJobs=Array.isArray(data)?data:[];
  renderProviderJobs();
}
function renderProviderJobs(){
  const list=$('#providerJobList');if(!list)return;
  const open=providerJobs.filter(item=>!['completed','declined','quote_rejected','cancelled'].includes(item.request_status));
  const newJobs=providerJobs.filter(item=>item.request_status==='dispatched');
  $('#providerOpenJobs').textContent=open.length;
  const jobBadge=$('#providerJobBadge');
  if(jobBadge){jobBadge.hidden=!newJobs.length;jobBadge.textContent=newJobs.length>99?'99+':String(newJobs.length);}
  const priorityCount=$('#providerPriorityCount');
  if(priorityCount)priorityCount.textContent=String(newJobs.length);
  const priorityCard=$('#providerJobPriorityCard');
  if(priorityCard)priorityCard.classList.toggle('has-new-jobs',newJobs.length>0);
  const priorityList=$('#providerPriorityJobList');
  if(priorityList){
    priorityList.innerHTML=newJobs.length?newJobs.slice(0,3).map((item)=>
      '<button type="button" data-priority-provider-job="'+escapeHtml(item.id)+'"><span><strong>'+escapeHtml(item.service_name||'Service Request')+'</strong><small>'+escapeHtml(item.request_reference)+' · '+escapeHtml(formatDate(item.created_at))+'</small></span><b>'+escapeHtml(item.request_type==='quotation'?'Quotation':'Direct Job')+' →</b></button>'
    ).join(''):'<div class="empty-card">No new customer jobs waiting for your response.</div>';
    $$('[data-priority-provider-job]').forEach((button)=>button.addEventListener('click',()=>{
      openProviderView('jobs');
      $('#providerJobFilter').value='open';
      renderProviderJobs();
      window.setTimeout(()=>document.querySelector('[data-job-id="'+button.dataset.priorityProviderJob+'"]')?.scrollIntoView({behavior:'smooth',block:'center'}),100);
    }));
  }
  const filter=$('#providerJobFilter')?.value||'open';
  let rows=providerJobs;
  if(filter==='open')rows=open;
  if(filter==='completed')rows=rows.filter(item=>item.request_status==='completed');
  if(filter==='closed')rows=rows.filter(item=>['declined','quote_rejected','cancelled'].includes(item.request_status));
  list.innerHTML=rows.length?rows.map(item=>{
    let actions='';
    if(item.request_status==='dispatched'&&item.request_type==='direct'){
      actions='<div class="provider-job-actions"><button class="primary" type="button" data-provider-job-action="accept" data-job-id="'+escapeHtml(item.id)+'">Accept Job</button><button class="danger" type="button" data-provider-job-action="decline" data-job-id="'+escapeHtml(item.id)+'">Decline</button></div>';
    }else if(item.request_status==='dispatched'&&item.request_type==='quotation'){
      actions='<form class="provider-quote-form" data-provider-quote-form="'+escapeHtml(item.id)+'"><input name="amount" type="number" min="1" max="100000000" step="0.01" placeholder="Quote amount (KSh)" required><input name="valid_until" type="date" min="'+new Date().toISOString().slice(0,10)+'" aria-label="Quotation valid until"><textarea name="notes" maxlength="1000" rows="3" placeholder="Quotation scope, work included, materials, conditions or notes"></textarea><button type="submit">Send Quotation</button></form><div class="provider-job-actions"><button class="danger" type="button" data-provider-job-action="decline" data-job-id="'+escapeHtml(item.id)+'">Decline Request</button></div>';
    }else if(['accepted','quote_accepted'].includes(item.request_status)){
      actions='<div class="provider-job-actions"><button class="primary" type="button" data-provider-job-action="start" data-job-id="'+escapeHtml(item.id)+'">Start Service</button></div>';
    }else if(item.request_status==='in_progress'){
      actions='<div class="provider-job-actions"><button class="primary" type="button" data-provider-job-action="complete" data-job-id="'+escapeHtml(item.id)+'">Mark Completed</button></div>';
    }
    return '<article class="provider-job-card"><header><div><strong>'+escapeHtml(item.request_reference)+'</strong><small>'+escapeHtml(formatDate(item.created_at))+' · '+escapeHtml(item.service_name||'Service')+'</small></div><b>'+escapeHtml(providerJobStatusText(item.request_status))+'</b></header>'+
      '<div class="provider-job-grid"><div><small>CUSTOMER</small><strong>'+escapeHtml(item.customer_name||'Customer')+'</strong><span>'+escapeHtml(item.customer_phone||'—')+'</span></div><div><small>LOCATION</small><strong>'+escapeHtml(item.service_location||'—')+'</strong><span>'+escapeHtml([item.service_town_estate,item.service_sub_county,item.service_county].filter(Boolean).join(', ')||item.nearest_landmark||'No detailed location supplied')+'</span></div><div><small>REQUEST TYPE</small><strong>'+(item.request_type==='quotation'?'Quotation':'Direct service')+'</strong><span>'+escapeHtml((item.preferred_date||'Flexible date')+(item.preferred_time?' · '+String(item.preferred_time).slice(0,5):''))+'</span></div></div>'+
      (item.location_description?'<p><strong>Location description:</strong> '+escapeHtml(item.location_description)+'</p>':'')+
      (item.nearest_landmark?'<p><strong>Nearest landmark:</strong> '+escapeHtml(item.nearest_landmark)+'</p>':'')+
      ((item.latitude!=null&&item.longitude!=null)?'<p><strong>Pinned coordinates:</strong> '+escapeHtml(String(item.latitude))+', '+escapeHtml(String(item.longitude))+' · <a href="https://www.google.com/maps?q='+encodeURIComponent(String(item.latitude)+','+String(item.longitude))+'" target="_blank" rel="noopener">Open in Google Maps ↗</a></p>':(item.map_link?'<p><a href="'+escapeHtml(item.map_link)+'" target="_blank" rel="noopener">Open customer location ↗</a></p>':''))+
      '<p><strong>Customer details:</strong> '+escapeHtml(item.request_details||'—')+'</p>'+
      (item.provider_quote_kes?'<p><strong>Your quotation:</strong> '+escapeHtml(money(item.provider_quote_kes))+(item.provider_quote_notes?' · '+escapeHtml(item.provider_quote_notes):'')+'</p>':'')+
      actions+'</article>';
  }).join(''):'<div class="empty-card">No service jobs match this filter.</div>';
}
async function updateProviderJob(id,action,quote=null,notes=null,button=null,quoteValidUntil=null,finalAmount=null){
  const original=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…';}
  status($('#providerJobStatus'),'');
  try{
    if(action==='decline'&&!notes)notes=window.prompt('Why are you declining this service request?','')||'';
    if(action==='decline'&&notes.trim().length<3)return;
    const {error}=await client.rpc('service_provider_update_job',{p_request_id:id,p_action:action,p_quote_kes:quote,p_notes:notes||null,p_quote_valid_until:quoteValidUntil||null,p_final_amount_kes:finalAmount});
    if(error)throw error;
    status($('#providerJobStatus'),'Service job updated successfully.','success');
    await Promise.all([loadProviderJobs(),loadProviderNotifications(),loadProviderEarnings()]);
  }catch(error){status($('#providerJobStatus'),error?.message||'Service job could not be updated.','error');}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
$('#providerJobFilter')?.addEventListener('change',renderProviderJobs);
$('#providerJobList')?.addEventListener('click',(event)=>{
  const button=event.target.closest?.('[data-provider-job-action]');if(!button)return;
  const action=button.dataset.providerJobAction;
  const item=providerJobs.find((row)=>row.id===button.dataset.jobId);
  let finalAmount=null;
  if(action==='complete'&&item?.request_type==='direct'){
    const answer=window.prompt('Enter the final agreed labour amount for this completed direct service (KSh):','');
    if(answer===null)return;
    finalAmount=Number(answer);
    if(!Number.isFinite(finalAmount)||finalAmount<=0){status($('#providerJobStatus'),'Enter a valid final labour amount before completing the service.','error');return;}
  }
  updateProviderJob(button.dataset.jobId,action,null,null,button,null,finalAmount);
});
$('#providerJobList')?.addEventListener('submit',(event)=>{
  const form=event.target.closest?.('[data-provider-quote-form]');if(!form)return;
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button[type="submit"]');
  updateProviderJob(form.dataset.providerQuoteForm,'quote',Number(form.elements.amount.value),form.elements.notes.value.trim()||null,button,form.elements.valid_until.value||null);
});

async function loadProviderServices(){
  const {data,error}=await client.rpc('service_provider_list_own_services');
  if(error)throw error;
  providerServices=Array.isArray(data)?data:[];
  renderProviderServices();
}
function providerPriceText(item){
  if(item.pricing_model==='quote')return 'Quote after request';
  const from=Number(item.price_from_kes||0);
  if(item.pricing_model==='fixed')return money(from)+(item.unit_label?' · '+item.unit_label:'');
  if(item.pricing_model==='hourly')return money(from)+' / hour';
  if(item.pricing_model==='from')return 'From '+money(from)+(item.unit_label?' · '+item.unit_label:'');
  return money(from);
}
function renderProviderServices(){
  const list=$('#providerServiceList');
  if(!list)return;
  $('#providerServiceTotal').textContent=providerServices.length;
  $('#providerServiceApproved').textContent=providerServices.filter((item)=>item.approval_status==='approved').length;
  $('#providerServicePending').textContent=providerServices.filter((item)=>['pending','under_review','changes_requested'].includes(item.approval_status)).length;
  list.innerHTML=providerServices.length?providerServices.map((item)=>
    '<article class="provider-service-card">'+
      '<div class="provider-service-card-main"><div><span class="status-chip">'+escapeHtml(String(item.approval_status||'pending').replaceAll('_',' '))+'</span><h4>'+escapeHtml(item.service_name)+'</h4><p>'+escapeHtml(item.description||'No description added.')+'</p></div><strong>'+escapeHtml(providerPriceText(item))+'</strong></div>'+
      '<div class="provider-service-meta"><span>'+escapeHtml(item.category_name||provider?.primary_service||'Service')+'</span><span>'+(item.is_available?'Available':'Unavailable')+'</span><span>'+escapeHtml(item.service_area||provider?.town||'')+'</span></div>'+
      (item.admin_notes?'<div class="restricted-notice">Admin note: '+escapeHtml(item.admin_notes)+'</div>':'')+
      '<div class="product-actions"><button class="secondary" type="button" data-provider-edit-service="'+escapeHtml(item.id)+'">Edit</button><button class="danger-data-button" type="button" data-provider-delete-service="'+escapeHtml(item.id)+'">Delete</button></div>'+
    '</article>'
  ).join(''):'<div class="empty-card">No services added yet. Use the form above to create your first service.</div>';
  $$('[data-provider-edit-service]').forEach((button)=>button.addEventListener('click',()=>editProviderService(button.dataset.providerEditService)));
  $$('[data-provider-delete-service]').forEach((button)=>button.addEventListener('click',()=>deleteProviderService(button.dataset.providerDeleteService,button)));
}
function resetProviderServiceForm(){
  editingProviderService=null;
  $('#providerServiceForm').reset();
  $('#providerServiceId').value='';
  $('#providerIsAvailable').checked=true;
  $('#providerServiceFormTitle').textContent='Add a Service';
  $('#providerServiceReset').hidden=true;
  $('#providerServiceForm').hidden=true;
}
function editProviderService(id){
  const item=providerServices.find((row)=>row.id===id);
  if(!item)return;
  editingProviderService=item;
  $('#providerServiceId').value=item.id;$('#providerServiceName').value=item.service_name||'';
  $('#providerServiceCategoryName').value=item.category_name||'';$('#providerServiceDescription').value=item.description||'';
  $('#providerPricingModel').value=item.pricing_model||'quote';$('#providerPriceFrom').value=item.price_from_kes??'';
  $('#providerPriceTo').value=item.price_to_kes??'';$('#providerUnitLabel').value=item.unit_label||'';
  $('#providerServiceArea').value=item.service_area||'';$('#providerAvailabilityNotes').value=item.availability_notes||'';
  $('#providerIsAvailable').checked=item.is_available!==false;$('#providerServiceFormTitle').textContent='Edit Service';
  $('#providerServiceReset').hidden=false;openProviderView('services');$('#providerServiceForm').hidden=false;$('#providerServiceForm').scrollIntoView({behavior:'smooth'});
}
$('#providerServiceReset')?.addEventListener('click',resetProviderServiceForm);
$('#providerServiceForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const button=form.querySelector('button[type="submit"]');const original=button.textContent;button.disabled=true;button.textContent='Saving…';
  try{
    const {error}=await client.rpc('service_provider_save_service',{
      p_service_id:$('#providerServiceId').value||null,p_service_name:$('#providerServiceName').value.trim(),
      p_category_name:$('#providerServiceCategoryName').value.trim()||null,p_description:$('#providerServiceDescription').value.trim()||null,
      p_pricing_model:$('#providerPricingModel').value,p_price_from_kes:$('#providerPriceFrom').value===''?null:Number($('#providerPriceFrom').value),
      p_price_to_kes:$('#providerPriceTo').value===''?null:Number($('#providerPriceTo').value),
      p_unit_label:$('#providerUnitLabel').value.trim()||null,p_service_area:$('#providerServiceArea').value.trim()||null,
      p_availability_notes:$('#providerAvailabilityNotes').value.trim()||null,p_is_available:$('#providerIsAvailable').checked
    });
    if(error)throw error;
    resetProviderServiceForm();await loadProviderServices();
    status($('#providerServiceFormStatus'),'Service saved and sent to LEOGO Admin for approval.','success');
  }catch(error){status($('#providerServiceFormStatus'),error?.message||'Service could not be saved.','error');}
  finally{button.disabled=false;button.textContent=original;}
});
async function deleteProviderService(id,button){
  const item=providerServices.find((row)=>row.id===id);
  if(!item||!window.confirm('Delete "'+item.service_name+'"?'))return;
  const original=button.textContent;button.disabled=true;button.textContent='Deleting…';
  try{const {data,error}=await client.rpc('service_provider_delete_service',{p_service_id:id});if(error)throw error;if(!data)throw new Error('Service could not be deleted.');await loadProviderServices();}
  catch(error){status($('#providerServiceFormStatus'),error?.message||'Service could not be deleted.','error');}
  finally{button.disabled=false;button.textContent=original;}
}
function providerSettlementDestination(account){
  if(account.account_type==='mpesa_mobile')return account.phone_number||'—';
  if(account.account_type==='mpesa_till')return 'Till '+(account.till_number||'—');
  if(account.account_type==='mpesa_paybill')return 'Paybill '+(account.paybill_number||'—')+' · A/C '+(account.account_number||'—');
  return (account.bank_name||'Bank')+' · '+(account.account_number||'—')+(account.bank_branch?' · '+account.bank_branch:'');
}
function toggleProviderSettlementFields(){
  const type=$('#providerSettlementType')?.value||'mpesa_mobile';
  $$('[data-provider-settlement-field]').forEach((label)=>{
    label.hidden=!String(label.dataset.providerSettlementField||'').split(' ').includes(type);
  });
}
function resetProviderSettlementForm(){
  const form=$('#providerSettlementAccountForm');
  if(!form)return;
  form.reset();
  $('#providerSettlementAccountId').value='';
  $('#providerSettlementPrimary').checked=true;
  $('#cancelProviderSettlementEdit').hidden=true;
  toggleProviderSettlementFields();
  status($('#providerSettlementStatus'),'');
}
function editProviderSettlementAccount(id){
  const account=providerSettlementAccounts.find((item)=>item.id===id);
  if(!account)return;
  $('#providerSettlementAccountId').value=account.id;
  $('#providerSettlementType').value=account.account_type;
  $('#providerSettlementName').value=account.account_name||'';
  $('#providerSettlementPhone').value=account.phone_number||'';
  $('#providerSettlementTill').value=account.till_number||'';
  $('#providerSettlementPaybill').value=account.paybill_number||'';
  $('#providerSettlementAccountNumber').value=account.account_number||'';
  $('#providerSettlementBank').value=account.bank_name||'';
  $('#providerSettlementBranch').value=account.bank_branch||'';
  $('#providerSettlementPrimary').checked=Boolean(account.is_primary);
  $('#cancelProviderSettlementEdit').hidden=false;
  toggleProviderSettlementFields();
  openProviderView('settlements');
  $('#providerSettlementAccountForm')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderProviderSettlementAccounts(){
  const target=$('#providerSettlementAccountList');
  if(!target)return;
  const pending=providerSettlementAccounts.filter((account)=>account.status==='pending_review').length;
  const badge=$('#providerSettlementBadge');
  if(badge){badge.hidden=!pending;badge.textContent=pending>99?'99+':String(pending);}
  target.innerHTML=providerSettlementAccounts.length?providerSettlementAccounts.map((account)=>
    '<article class="settlement-account-card">'+
      '<div><strong>'+escapeHtml(account.account_name)+'</strong><small>'+escapeHtml(account.account_type.replaceAll('_',' '))+' · '+escapeHtml(providerSettlementDestination(account))+'</small></div>'+
      '<div><span class="settlement-status '+escapeHtml(account.status)+'">'+escapeHtml(account.status.replaceAll('_',' ').toUpperCase())+'</span>'+(account.is_primary?'<b>PRIMARY</b>':'')+'</div>'+
      '<p>'+(account.admin_notes?'Admin note: '+escapeHtml(account.admin_notes):(account.status==='pending_review'?'Waiting for LEOGO Admin verification.':'Every change requires Admin verification.'))+'</p>'+
      (['approved','pending_review','rejected'].includes(account.status)?'<button class="secondary" type="button" data-edit-provider-settlement="'+escapeHtml(account.id)+'">Edit</button>':'')+
    '</article>'
  ).join(''):'<div class="empty-card">No settlement account added yet.</div>';
  $$('[data-edit-provider-settlement]').forEach((button)=>button.addEventListener('click',()=>editProviderSettlementAccount(button.dataset.editProviderSettlement)));
  const approved=providerSettlementAccounts.filter((account)=>account.status==='approved');
  if($('#providerSettlementRequestAccount')){
    $('#providerSettlementRequestAccount').innerHTML=approved.length
      ? '<option value="">Choose approved settlement account…</option>'+approved.map((account)=>'<option value="'+escapeHtml(account.id)+'">'+escapeHtml(account.account_name)+' — '+escapeHtml(providerSettlementDestination(account))+(account.is_primary?' (Primary)':'')+'</option>').join('')
      : '<option value="">No approved settlement account yet</option>';
  }
  if($('#providerSettlementRequestButton'))$('#providerSettlementRequestButton').disabled=!approved.length;
  if($('#providerSettlementRequestList'))$('#providerSettlementRequestList').innerHTML=providerSettlementRequests.length?providerSettlementRequests.map((request)=>
    '<article class="settlement-history-row"><div><strong>'+money(request.requested_amount_kes)+'</strong><small>'+formatDate(request.submitted_at)+' · '+escapeHtml(request.status.replaceAll('_',' ').toUpperCase())+(request.admin_notes?' · Admin: '+escapeHtml(request.admin_notes):'')+'</small></div><span>'+escapeHtml(request.status.toUpperCase())+'</span></article>'
  ).join(''):'<div class="empty-card">No settlement requests yet.</div>';
  if($('#providerSettlementHistory'))$('#providerSettlementHistory').innerHTML=providerSettlements.length?providerSettlements.map((entry)=>
    '<article class="settlement-history-row"><div><strong>'+money(entry.amount_kes)+'</strong><small>'+escapeHtml(entry.settlement_reference)+' · '+formatDate(entry.paid_at)+'</small></div><span>'+escapeHtml(entry.status.toUpperCase())+'</span></article>'
  ).join(''):'<div class="empty-card">No Service Provider settlement has been recorded yet.</div>';
}
async function loadProviderSettlementAccounts(){
  const [accountsResult,requestsResult,settlementsResult]=await Promise.all([
    client.from('service_provider_settlement_accounts').select('*').order('created_at',{ascending:false}),
    client.from('service_provider_settlement_requests').select('*').order('submitted_at',{ascending:false}),
    client.from('service_provider_settlements').select('*').order('paid_at',{ascending:false})
  ]);
  if(accountsResult.error)throw accountsResult.error;
  if(requestsResult.error)throw requestsResult.error;
  if(settlementsResult.error)throw settlementsResult.error;
  providerSettlementAccounts=accountsResult.data||[];
  providerSettlementRequests=requestsResult.data||[];
  providerSettlements=settlementsResult.data||[];
  renderProviderSettlementAccounts();
  loadProviderEarnings().catch(error=>console.warn('Provider balance refresh failed:',error));
}
$('#providerSettlementType')?.addEventListener('change',toggleProviderSettlementFields);
$('#cancelProviderSettlementEdit')?.addEventListener('click',resetProviderSettlementForm);
$('#providerSettlementAccountForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const type=$('#providerSettlementType').value;
  const phone=normalisePhone($('#providerSettlementPhone').value);
  if(type==='mpesa_mobile'&&!/^\+254[17]\d{8}$/.test(phone)){
    status($('#providerSettlementStatus'),'Enter a valid Kenyan M-Pesa phone number.','error');return;
  }
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;button.disabled=true;button.textContent='Sending…';
  try{
    status($('#providerSettlementStatus'),'Sending settlement account to LEOGO Admin for verification…');
    const {error}=await client.rpc('service_provider_submit_settlement_account',{
      p_account_id:$('#providerSettlementAccountId').value||null,
      p_account_type:type,
      p_account_name:$('#providerSettlementName').value.trim(),
      p_phone_number:type==='mpesa_mobile'?phone:null,
      p_till_number:type==='mpesa_till'?$('#providerSettlementTill').value.trim():null,
      p_paybill_number:type==='mpesa_paybill'?$('#providerSettlementPaybill').value.trim():null,
      p_account_number:['mpesa_paybill','bank'].includes(type)?$('#providerSettlementAccountNumber').value.trim():null,
      p_bank_name:type==='bank'?$('#providerSettlementBank').value.trim():null,
      p_bank_branch:type==='bank'?$('#providerSettlementBranch').value.trim():null,
      p_make_primary:$('#providerSettlementPrimary').checked
    });
    if(error)throw error;
    resetProviderSettlementForm();
    status($('#providerSettlementStatus'),'Settlement account submitted. LEOGO Admin must approve it before use.','success');
    await Promise.all([loadProviderSettlementAccounts(),loadProviderNotifications()]);
  }catch(error){
    status($('#providerSettlementStatus'),error?.message||'Settlement account could not be submitted.','error');
  }finally{button.disabled=false;button.textContent=original;}
});
toggleProviderSettlementFields();

$('#providerSettlementRequestForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const accountId=$('#providerSettlementRequestAccount').value;
  const amount=Number($('#providerSettlementRequestAmount').value);
  const note=$('#providerSettlementRequestNote').value.trim();
  const available=Number(providerEarningsReport?.available_balance_kes||0);
  if(!accountId){status($('#providerSettlementRequestStatus'),'Choose an approved settlement account.','error');return;}
  if(!amount||amount<=0){status($('#providerSettlementRequestStatus'),'Enter the amount you want to request.','error');return;}
  if(amount>available){status($('#providerSettlementRequestStatus'),'Requested amount exceeds your available balance of '+money(available)+'.','error');return;}
  const button=$('#providerSettlementRequestButton');
  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';
  try{
    status($('#providerSettlementRequestStatus'),'Sending settlement request to LEOGO Admin…');
    const {error}=await client.rpc('service_provider_request_settlement',{p_account_id:accountId,p_amount_kes:amount,p_note:note||null});
    if(error)throw error;
    event.target.reset();
    status($('#providerSettlementRequestStatus'),'Settlement request submitted to Admin for review.','success');
    await Promise.all([loadProviderSettlementAccounts(),loadProviderNotifications(),loadProviderEarnings()]);
  }catch(error){
    status($('#providerSettlementRequestStatus'),error?.message||'Settlement request could not be submitted.','error');
  }finally{button.disabled=false;button.textContent=original;}
});

async function loadProviderNotifications(){
  const {data,error}=await client.from('partner_notifications').select('*').eq('partner_type','service_provider').order('created_at',{ascending:false}).limit(50);
  if(error)throw error;providerNotifications=data||[];renderProviderNotifications();
}
function renderProviderNotifications(){
  const target=$('#providerNotificationList');if(!target)return;
  const unread=providerNotifications.filter((item)=>!item.read_at).length;
  const sideBadge=$('#providerNotificationBadge');
  const headBadge=$('#providerHeadNotificationBadge');
  if(sideBadge){sideBadge.hidden=!unread;sideBadge.textContent=unread>99?'99+':String(unread);}
  if(headBadge){headBadge.hidden=!unread;headBadge.textContent=unread>99?'99+':String(unread);}
  updateSharedPartnerNotificationBadge(unread);
  target.innerHTML=providerNotifications.length?providerNotifications.map((item)=>
    '<article class="seller-notification-item '+(item.read_at?'':'unread')+'" data-provider-notification-id="'+escapeHtml(item.id)+'"><div><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.message)+'</p><small>'+escapeHtml(formatDate(item.created_at))+'</small></div><div class="seller-notification-actions">'+
      (item.action_view?'<button type="button" data-open-provider-notification="'+escapeHtml(item.id)+'" data-provider-notification-view="'+escapeHtml(item.action_view)+'">Open</button>':'')+
      (item.read_at?'':'<button class="secondary" type="button" data-mark-provider-notification="'+escapeHtml(item.id)+'">Mark read</button>')+
    '</div></article>'
  ).join(''):'<div class="empty-card">No Service Provider notifications yet.</div>';
  $$('[data-mark-provider-notification]').forEach((button)=>button.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.markProviderNotification});
    if(!error)await loadProviderNotifications();
  }));
  $$('[data-open-provider-notification]').forEach((button)=>button.addEventListener('click',async()=>{
    await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.openProviderNotification}).catch?.(()=>{});
    const view=button.dataset.providerNotificationView;
    if(view==='provider-jobs')openProviderView('jobs');
    else if(view==='provider-services')openProviderView('services');
    else if(view==='provider-earnings')openProviderView('earnings');
    else if(view==='provider-settlements')openProviderView('settlements');
    else if(view==='provider-profile')openProviderView('profile');
    else openProviderView('notifications');
    await loadProviderNotifications();
  }));
}

$('#providerPhotoForm')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  const profileFile=$('#providerProfilePictureUpdate')?.files?.[0]||null;
  const passportFile=$('#providerPassportPhotoUpdate')?.files?.[0]||null;
  if(!profileFile&&!passportFile){
    status($('#providerPhotoStatus'),'Choose a profile picture or passport photo to save.','error');
    return;
  }
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Saving…';
  try{
    status($('#providerPhotoStatus'),'Uploading profile photos…');
    const [profilePath,passportPath]=await Promise.all([
      profileFile?uploadProviderPublicPhoto(profileFile):Promise.resolve(null),
      passportFile?uploadProviderPassportPhoto(passportFile):Promise.resolve(null)
    ]);
    const {data,error}=await client.rpc('service_provider_update_profile_photos',{
      p_profile_picture_path:profilePath,
      p_passport_photo_path:passportPath
    });
    if(error)throw error;
    provider=data||provider;
    form.reset();
    renderProviderPhotoManager();
    status($('#providerPhotoStatus'),'Profile photos saved successfully.','success');
    window.setTimeout(()=>openProviderView('overview'),700);
  }catch(error){
    status($('#providerPhotoStatus'),error?.message||'Profile photos could not be saved.','error');
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});

$('#markAllProviderNotificationsRead')?.addEventListener('click',async()=>{
  const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'service_provider'});
  if(error){status($('#providerServiceFormStatus'),error.message,'error');return;}
  await loadProviderNotifications();
});



/* ACCOMMODATION PROVIDER MODULE — Phase A: registration, Admin approval and approved dashboard shell */
const accommodationBootStatus=$('#accommodationBootStatus');
const accommodationOnboarding=$('#accommodationOnboarding');
const accommodationReg=$('#accommodationRegistrationForm');
const accommodationPendingArea=$('#accommodationPendingArea');
const accommodationDashboard=$('#accommodationDashboard');
const accommodationSidebar=$('#accommodationSidebar');

function accommodationStatusCopy(value){
  if(value==='pending')return 'Submitted to LEOGO Admin. Your Accommodation Provider application is waiting for review.';
  if(value==='under_review')return 'LEOGO Admin is reviewing your Accommodation Provider application.';
  if(value==='changes_requested')return 'LEOGO Admin requested corrections. Update the application and resubmit it.';
  if(value==='approved')return 'Approved. You can now use the Accommodation Provider dashboard.';
  if(value==='rejected')return 'The application was not approved. Review the Admin note and correct it before resubmitting if appropriate.';
  if(value==='suspended')return 'This Accommodation Provider account is suspended. Your accommodation listings are hidden from customers.';
  return 'Register as an Accommodation Provider to continue.';
}
function showAccommodationBoot(message='Loading your Accommodation Provider account…',isError=false){
  if(!accommodationBootStatus)return;
  accommodationBootStatus.hidden=false;
  $('#accommodationBootTitle').textContent=isError?'Accommodation Provider Portal needs attention':'Opening your Accommodation dashboard…';
  $('#accommodationBootMessage').textContent=message;
  const spinner=$('.seller-boot-spinner',accommodationBootStatus);
  if(spinner)spinner.hidden=isError;
  $('#retryAccommodationBoot').hidden=!isError;
}
function hideAccommodationBoot(){if(accommodationBootStatus)accommodationBootStatus.hidden=true;}
function closeAccommodationSidebar(){
  accommodationSidebar?.classList.remove('open');
  $('#accommodationSidebarScrim')?.classList.remove('open');
}
function accommodationViewDescription(view){
  return {
    overview:'Overview of your Accommodation Provider account.',
    properties:'Manage approved properties, rooms and units.',
    bookings:'Customer accommodation booking requests.',
    availability:'Manage room and unit availability dates.',
    earnings:'View Accommodation earnings after completed stays.',
    settlements:'Manage Accommodation payout accounts and settlements.',
    notifications:'Application, listing and booking notifications.',
    profile:'Your approved Accommodation Provider information.'
  }[view]||'Accommodation Provider Portal';
}
function openAccommodationView(view='overview'){
  const approved=accommodationProvider?.verification_status==='approved';
  const allowed=approved?['overview','properties','bookings','availability','earnings','settlements','notifications','profile']:['overview','notifications','profile'];
  const resolved=allowed.includes(view)?view:'overview';
  $$('[data-accommodation-content]').forEach(panel=>panel.classList.toggle('active',panel.dataset.accommodationContent===resolved));
  $$('[data-accommodation-view]').forEach(button=>button.classList.toggle('active',button.dataset.accommodationView===resolved));
  if($('#accommodationViewDescription'))$('#accommodationViewDescription').textContent=accommodationViewDescription(resolved);
  closeAccommodationSidebar();
  if(resolved==='properties')loadAccommodationCatalogue().catch(error=>status($('#accommodationCatalogueStatus'),error?.message||'Accommodation listings could not load.','error'));
}
function accommodationCoordinatesFromText(value=''){
  const text=String(value||'').trim();
  const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
  const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
  return maps?{lat:Number(maps[1]),lng:Number(maps[2])}:null;
}
function setAccommodationCoordinates(lat,lng,label='Location pinned'){
  const latitude=Number(lat),longitude=Number(lng),target=$('#accommodationPinStatus');
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    if(target){target.textContent='Invalid accommodation coordinates.';target.className='status error';}
    return false;
  }
  $('#accommodationLatitude').value=latitude.toFixed(7);
  $('#accommodationLongitude').value=longitude.toFixed(7);
  if(!$('#accommodationMapLink').value.trim())$('#accommodationMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
  if(target){target.textContent='✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='status success';}
  return true;
}
async function ensureAccommodationLocations(countyCode='',subCountyCode=''){
  await loadKenyaLocations();
  const county=$('#accommodationCounty'),sub=$('#accommodationSubCounty');
  if(!county||!sub)return;
  county.innerHTML='<option value="">Select county</option>'+kenyaCounties.map(item=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.display_name||item.name)+'</option>').join('');
  if(countyCode&&kenyaCounties.some(item=>item.code===countyCode))county.value=countyCode;
  const renderSubs=()=>{
    const selected=county.value;
    const rows=kenyaSubcounties.filter(item=>item.county_code===selected);
    sub.innerHTML=selected
      ? '<option value="">Select sub-county</option>'+rows.map(item=>'<option value="'+escapeHtml(item.code)+'">'+escapeHtml(item.name)+'</option>').join('')
      : '<option value="">Choose a county first</option>';
    sub.disabled=!selected||!rows.length;
    if(subCountyCode&&rows.some(item=>item.code===subCountyCode))sub.value=subCountyCode;
  };
  renderSubs();
  county.onchange=()=>{subCountyCode='';renderSubs();};
}
async function uploadAccommodationPrivate(file,prefix){
  if(!file)return null;
  if(file.size>8*1024*1024)throw new Error('Each Accommodation verification file must be 8 MB or smaller.');
  const ext=(file.name.split('.').pop()||'bin').toLowerCase();
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('accommodation-verification').upload(path,file,{upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  return path;
}
async function uploadAccommodationPublicPhoto(file){
  if(!file)return null;
  if(file.size>8*1024*1024)throw new Error('Accommodation profile picture must be 8 MB or smaller.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Accommodation profile picture must be JPG, PNG or WEBP.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/provider-profile-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('accommodation-public-media').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
}
async function uploadAccommodationListingPhoto(file,prefix='property'){
  if(!file)return null;
  if(file.size>8*1024*1024)throw new Error('Each Accommodation photo must be 8 MB or smaller.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Accommodation photos must be JPG, PNG or WEBP.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=currentUser.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('accommodation-public-media').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=client.storage.from('accommodation-public-media').getPublicUrl(path);
  return data?.publicUrl||null;
}
function accommodationArrayValue(value=''){
  return String(value||'').split(',').map(item=>item.trim()).filter(Boolean).slice(0,30);
}
function accommodationStatusLabel(value){
  return String(value||'draft').replaceAll('_',' ');
}
function renderAccommodationCatalogue(){
  const target=$('#accommodationPropertyList');if(!target)return;
  const properties=Array.isArray(accommodationCatalogue)?accommodationCatalogue:[];
  if($('#accommodationPropertyMetric'))$('#accommodationPropertyMetric').textContent=properties.length;
  target.innerHTML=properties.length?properties.map(property=>{
    const units=Array.isArray(property.units)?property.units:[];
    const cover=property.cover_image_url?'<img src="'+escapeHtml(property.cover_image_url)+'" alt="'+escapeHtml(property.property_name||'Property')+'">':'<span>🏨</span>';
    const canEdit=property.approval_status!=='suspended';
    return '<article class="accommodation-property-card">'+
      '<div class="accommodation-property-cover">'+cover+'</div>'+
      '<div class="accommodation-property-main"><header><div><span>'+escapeHtml(String(property.property_type||'').replaceAll('_',' ').toUpperCase())+'</span><strong>'+escapeHtml(property.property_name||'Property')+'</strong><small>'+escapeHtml([property.public_location,property.town,property.county].filter(Boolean).join(' · '))+'</small></div><b class="status-chip">'+escapeHtml(accommodationStatusLabel(property.approval_status))+'</b></header>'+
      '<p>'+escapeHtml(property.description||'')+'</p>'+
      (property.admin_notes?'<div class="restricted-notice"><strong>Admin note:</strong> '+escapeHtml(property.admin_notes)+'</div>':'')+
      '<div class="accommodation-property-actions">'+
        (canEdit?'<button type="button" data-edit-accommodation-property="'+escapeHtml(property.id)+'">Edit Property</button>':'')+
        '<button type="button" data-add-accommodation-unit="'+escapeHtml(property.id)+'">+ Add Room / Unit</button>'+
      '</div>'+
      '<div class="accommodation-unit-list">'+(units.length?units.map(unit=>
        '<article class="accommodation-unit-card">'+
          '<div><strong>'+escapeHtml(unit.unit_name||'Room / Unit')+'</strong><small>'+money(unit.nightly_price_kes||0)+'/night · Up to '+Number(unit.max_guests||1)+' guest(s) · '+Number(unit.inventory_count||1)+' available unit(s)</small>'+
          (unit.admin_notes?'<small>Admin: '+escapeHtml(unit.admin_notes)+'</small>':'')+'</div>'+
          '<span class="status-chip">'+escapeHtml(accommodationStatusLabel(unit.approval_status))+'</span>'+
          (unit.approval_status!=='suspended'?'<button type="button" class="secondary" data-edit-accommodation-unit="'+escapeHtml(unit.id)+'" data-property-id="'+escapeHtml(property.id)+'">Edit</button>':'')+
        '</article>'
      ).join(''):'<div class="empty-card">No rooms / units added yet.</div>')+'</div>'+
      '</div></article>';
  }).join(''):'<div class="empty-card">No properties created yet. Tap “Add Property” to create your first accommodation listing.</div>';

  $$('[data-edit-accommodation-property]',target).forEach(button=>button.addEventListener('click',()=>openAccommodationPropertyForm(button.dataset.editAccommodationProperty)));
  $$('[data-add-accommodation-unit]',target).forEach(button=>button.addEventListener('click',()=>openAccommodationUnitForm(button.dataset.addAccommodationUnit)));
  $$('[data-edit-accommodation-unit]',target).forEach(button=>button.addEventListener('click',()=>openAccommodationUnitForm(button.dataset.propertyId,button.dataset.editAccommodationUnit)));
}
async function loadAccommodationCatalogue(){
  if(!currentUser||accommodationProvider?.verification_status!=='approved')return;
  status($('#accommodationCatalogueStatus'),'Loading properties and rooms…');
  const {data,error}=await client.rpc('accommodation_provider_list_catalogue');
  if(error)throw error;
  accommodationCatalogue=Array.isArray(data?.properties)?data.properties:[];
  renderAccommodationCatalogue();
  status($('#accommodationCatalogueStatus'),'');
}
function resetAccommodationPropertyForm(){
  const form=$('#accommodationPropertyForm');if(!form)return;
  form.reset();$('#accommodationPropertyId').value='';
  $('#accommodationPropertyCheckIn').value='14:00';$('#accommodationPropertyCheckOut').value='10:00';
  $('#accommodationChildrenAllowed').checked=true;
  $('#accommodationPropertyPinStatus').textContent='Property location not pinned.';
  status($('#accommodationPropertyStatus'),'');
}
function openAccommodationPropertyForm(propertyId=''){
  resetAccommodationPropertyForm();
  const form=$('#accommodationPropertyForm');form.hidden=false;
  $('#accommodationUnitForm').hidden=true;
  const property=accommodationCatalogue.find(item=>String(item.id)===String(propertyId));
  $('#accommodationPropertyFormTitle').textContent=property?'Edit Property':'Add Property';
  if(property){
    $('#accommodationPropertyId').value=property.id;
    $('#accommodationPropertyName').value=property.property_name||'';
    $('#accommodationPropertyType').value=property.property_type||'';
    $('#accommodationPropertyCounty').value=property.county||'';
    $('#accommodationPropertySubCounty').value=property.sub_county||'';
    $('#accommodationPropertyTown').value=property.town||'';
    $('#accommodationPropertyPublicLocation').value=property.public_location||'';
    $('#accommodationPropertyDescription').value=property.description||'';
    $('#accommodationPropertyAmenities').value=(property.amenities||[]).join(', ');
    $('#accommodationPropertyRules').value=property.house_rules||'';
    $('#accommodationPropertyCancellation').value=property.cancellation_policy||'';
    $('#accommodationPropertyAccessibility').value=property.accessibility_notes||'';
    $('#accommodationPropertyCheckIn').value=String(property.check_in_time||'14:00').slice(0,5);
    $('#accommodationPropertyCheckOut').value=String(property.check_out_time||'10:00').slice(0,5);
    $('#accommodationChildrenAllowed').checked=property.children_allowed!==false;
    $('#accommodationPetsAllowed').checked=Boolean(property.pets_allowed);
    $('#accommodationParkingAvailable').checked=Boolean(property.parking_available);
    $('#accommodationWifiAvailable').checked=Boolean(property.wifi_available);
    $('#accommodationBreakfastAvailable').checked=Boolean(property.breakfast_available);
    $('#accommodationSmokingZoneAllowed').checked=Boolean(property.smoking_zone_allowed);
    $('#accommodationPropertyMapLink').value=property.map_link||'';
    $('#accommodationPropertyLatitude').value=property.latitude??'';
    $('#accommodationPropertyLongitude').value=property.longitude??'';
    if(property.latitude!=null&&property.longitude!=null)$('#accommodationPropertyPinStatus').textContent='✓ Property pinned: '+property.latitude+', '+property.longitude;
  }else{
    $('#accommodationPropertyCounty').value=accommodationProvider?.county||'';
    $('#accommodationPropertySubCounty').value=accommodationProvider?.sub_county||'';
    $('#accommodationPropertyTown').value=accommodationProvider?.town||'';
  }
  form.scrollIntoView({behavior:'smooth',block:'start'});
}
function accommodationMealPlanLabel(value){
  return {bed_only:'Bed Only',bed_breakfast:'Bed & Breakfast',half_board:'Half Board',full_board:'Full Board',self_catering:'Self Catering',other:'Other'}[value]||'Other';
}
function accommodationOccupancyLabel(value){
  return {single:'Single Occupancy',double:'Double Occupancy',triple:'Triple Occupancy',family:'Family',custom:'Custom'}[value]||'Custom';
}
function renderAccommodationRateRows(rates=[]){
  const target=$('#accommodationRateRows');if(!target)return;
  const rows=(Array.isArray(rates)&&rates.length?rates:[
    {rate_name:'Bed Only',meal_plan:'bed_only',occupancy_type:'single',occupancy_pax:1,nightly_price_kes:''},
    {rate_name:'Bed & Breakfast - Single',meal_plan:'bed_breakfast',occupancy_type:'single',occupancy_pax:1,nightly_price_kes:''},
    {rate_name:'Bed & Breakfast - Double',meal_plan:'bed_breakfast',occupancy_type:'double',occupancy_pax:2,nightly_price_kes:''}
  ]);
  target.innerHTML=rows.map((rate)=>{
    return '<div class="accommodation-rate-row" data-rate-row>'+
      '<label>Rate name<input data-rate-name type="text" maxlength="120" required value="'+escapeHtml(rate.rate_name||'')+'"></label>'+
      '<label>Meal plan<select data-rate-meal required>'+
        '<option value="bed_only" '+(rate.meal_plan==='bed_only'?'selected':'')+'>Bed Only</option>'+
        '<option value="bed_breakfast" '+(rate.meal_plan==='bed_breakfast'?'selected':'')+'>Bed & Breakfast</option>'+
        '<option value="half_board" '+(rate.meal_plan==='half_board'?'selected':'')+'>Half Board</option>'+
        '<option value="full_board" '+(rate.meal_plan==='full_board'?'selected':'')+'>Full Board</option>'+
        '<option value="self_catering" '+(rate.meal_plan==='self_catering'?'selected':'')+'>Self Catering</option>'+
        '<option value="other" '+(rate.meal_plan==='other'?'selected':'')+'>Other</option>'+
      '</select></label>'+
      '<label>Occupancy<select data-rate-occupancy required>'+
        '<option value="single" '+(rate.occupancy_type==='single'?'selected':'')+'>Single Occupancy</option>'+
        '<option value="double" '+(rate.occupancy_type==='double'?'selected':'')+'>Double Occupancy</option>'+
        '<option value="triple" '+(rate.occupancy_type==='triple'?'selected':'')+'>Triple Occupancy</option>'+
        '<option value="family" '+(rate.occupancy_type==='family'?'selected':'')+'>Family</option>'+
        '<option value="custom" '+(rate.occupancy_type==='custom'?'selected':'')+'>Custom</option>'+
      '</select></label>'+
      '<label>Guests / Pax<input data-rate-pax type="number" min="1" max="30" required value="'+Number(rate.occupancy_pax||1)+'"></label>'+
      '<label>Price / night (KSh)<input data-rate-price type="number" min="1" step="1" required value="'+(rate.nightly_price_kes?Number(rate.nightly_price_kes):'')+'"></label>'+
      '<button type="button" class="secondary" data-remove-rate>Remove</button>'+
    '</div>';
  }).join('');
  const removeButtons=$('[data-remove-rate]',target);
  removeButtons.forEach((button)=>button.addEventListener('click',()=>{
    if($('[data-rate-row]',target).length<=1)return;
    button.closest('[data-rate-row]')?.remove();
    syncAccommodationBasePrice();
  }));
  $('[data-rate-price]',target).forEach((input)=>input.addEventListener('input',syncAccommodationBasePrice));
  syncAccommodationBasePrice();
}
function collectAccommodationRates(){
  const root=$('#accommodationRateRows');
  return root?$('[data-rate-row]',root).map((row)=>({
    rate_name:$('[data-rate-name]',row)?.value.trim()||'',
    meal_plan:$('[data-rate-meal]',row)?.value||'bed_only',
    occupancy_type:$('[data-rate-occupancy]',row)?.value||'single',
    occupancy_pax:Number($('[data-rate-pax]',row)?.value||0),
    nightly_price_kes:Number($('[data-rate-price]',row)?.value||0),
    is_active:true
  })):[];
}
function syncAccommodationBasePrice(){
  const root=$('#accommodationRateRows');
  const prices=root?$('[data-rate-price]',root).map((input)=>Number(input.value)).filter((value)=>Number.isFinite(value)&&value>0):[];
  $('#accommodationUnitPrice').value=prices.length?Math.min(...prices):'';
}
function openAccommodationUnitForm(propertyId,unitId=''){
  const property=accommodationCatalogue.find(item=>String(item.id)===String(propertyId));if(!property)return;
  const form=$('#accommodationUnitForm');form.reset();form.hidden=false;
  $('#accommodationPropertyForm').hidden=true;
  $('#accommodationUnitPropertyId').value=property.id;
  $('#accommodationUnitId').value='';
  $('#accommodationUnitGuests').value='2';$('#accommodationUnitInventory').value='1';
  renderAccommodationRateRows();
  $('#accommodationUnitPropertyLabel').innerHTML='<strong>Property:</strong> '+escapeHtml(property.property_name||'Property')+' · <span class="status-chip">'+escapeHtml(accommodationStatusLabel(property.approval_status))+'</span>';
  const unit=(property.units||[]).find(item=>String(item.id)===String(unitId));
  $('#accommodationUnitFormTitle').textContent=unit?'Edit Room / Unit Type':'Add Room / Unit Type';
  if(unit){
    $('#accommodationUnitId').value=unit.id;
    $('#accommodationUnitName').value=unit.unit_name||'';
    $('#accommodationUnitPrice').value=unit.nightly_price_kes||'';
    $('#accommodationUnitGuests').value=unit.max_guests||1;
    $('#accommodationUnitInventory').value=unit.inventory_count||1;
    $('#accommodationUnitBeds').value=unit.beds_description||'';
    $('#accommodationUnitDescription').value=unit.description||'';
    $('#accommodationUnitAmenities').value=(unit.amenities||[]).join(', ');
    renderAccommodationRateRows(unit.rates||[]);
  }
  status($('#accommodationUnitStatus'),'');
  form.scrollIntoView({behavior:'smooth',block:'start'});
}
function setAccommodationPropertyCoordinates(lat,lng,label='Property location pinned'){
  const latitude=Number(lat),longitude=Number(lng),target=$('#accommodationPropertyPinStatus');
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
    target.textContent='Invalid property coordinates.';target.className='status error';return false;
  }
  $('#accommodationPropertyLatitude').value=latitude.toFixed(7);
  $('#accommodationPropertyLongitude').value=longitude.toFixed(7);
  if(!$('#accommodationPropertyMapLink').value.trim())$('#accommodationPropertyMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
  target.textContent='✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='status success';return true;
}

function accommodationSummaryRows(){
  if(!accommodationProvider)return [];
  return [
    ['Business / Operator',accommodationProvider.business_name],
    ['Owner / Manager',accommodationProvider.owner_name],
    ['ID Number',accommodationProvider.id_number],
    ['Phone',accommodationProvider.contact_phone],
    ['Email',accommodationProvider.contact_email||'—'],
    ['Location',[accommodationProvider.town,accommodationProvider.sub_county,accommodationProvider.county].filter(Boolean).join(', ')],
    ['Operating Location',accommodationProvider.location_details],
    ['Coordinates',(accommodationProvider.base_latitude!=null&&accommodationProvider.base_longitude!=null)?(accommodationProvider.base_latitude+', '+accommodationProvider.base_longitude):'Not pinned'],
    ['Map Link',accommodationProvider.base_map_link||'—'],
    ['About',accommodationProvider.business_description||'—'],
    ['Status',String(accommodationProvider.verification_status||'').replaceAll('_',' ')],
    ['Business ID / Identification',accommodationProvider.business_id_document_path?'Uploaded':'Missing'],
    ['Business Licence',accommodationProvider.business_licence_path?'Uploaded':'Not provided'],
    ['Registration Certificate',accommodationProvider.registration_certificate_path?'Uploaded':'Not provided'],
    ['Other Permits',(accommodationProvider.other_permit_paths||[]).length+' file(s)']
  ];
}
function populateAccommodationApplication(){
  if(!accommodationProvider)return;
  $('#accommodationBusinessName').value=accommodationProvider.business_name||'';
  $('#accommodationOwnerName').value=accommodationProvider.owner_name||'';
  $('#accommodationIdNumber').value=accommodationProvider.id_number||'';
  $('#accommodationPhone').value=accommodationProvider.contact_phone||'';
  $('#accommodationEmail').value=accommodationProvider.contact_email||currentUser?.email||'';
  $('#accommodationTown').value=accommodationProvider.town||'';
  $('#accommodationLocation').value=accommodationProvider.location_details||'';
  $('#accommodationMapLink').value=accommodationProvider.base_map_link||'';
  $('#accommodationLatitude').value=accommodationProvider.base_latitude??'';
  $('#accommodationLongitude').value=accommodationProvider.base_longitude??'';
  $('#accommodationDescription').value=accommodationProvider.business_description||'';
  $('#accommodationBusinessIdDocument').required=!accommodationProvider.business_id_document_path;
  const target=$('#accommodationPinStatus');
  if(target)target.textContent=(accommodationProvider.base_latitude!=null&&accommodationProvider.base_longitude!=null)
    ? '✓ Location pinned: '+accommodationProvider.base_latitude+', '+accommodationProvider.base_longitude
    : 'Location not pinned yet.';
  ensureAccommodationLocations(accommodationProvider.county_code||'',accommodationProvider.sub_county_code||'').catch(console.warn);
}
function renderAccommodationNotifications(){
  const list=$('#accommodationNotificationList');
  if(!list)return;
  list.innerHTML=accommodationNotifications.length?accommodationNotifications.map(item=>
    '<article class="seller-notification-item '+(item.read_at?'':'unread')+'"><div><strong>'+escapeHtml(item.title||'Accommodation update')+'</strong><small>'+escapeHtml(formatDate(item.created_at))+'</small></div><p>'+escapeHtml(item.message||'')+'</p></article>'
  ).join(''):'<div class="empty-card">No Accommodation notifications yet.</div>';
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
      const propertyIds=accommodationCatalogue.map(row=>row.id);
      if($('#accommodationPropertyMetric'))$('#accommodationPropertyMetric').textContent=propertyIds.length;
      if($('#accommodationBookingMetric')){
        if(!propertyIds.length)$('#accommodationBookingMetric').textContent='0';
        else{
          const bookings=await client.from('accommodation_bookings').select('id',{count:'exact',head:true}).in('property_id',propertyIds);
          $('#accommodationBookingMetric').textContent=bookings.count||0;
        }
      }
    }
  }catch(error){
    console.error('Accommodation Provider portal boot failed:',error);
    showAccommodationBoot(error?.message||'The Accommodation Provider dashboard could not finish loading.',true);
    accommodationOnboarding.hidden=true;accommodationReg.hidden=true;accommodationPendingArea.hidden=true;accommodationDashboard.hidden=true;
  }
}

$('#addAccommodationProperty')?.addEventListener('click',()=>openAccommodationPropertyForm());
$('#refreshAccommodationCatalogue')?.addEventListener('click',()=>loadAccommodationCatalogue().catch(error=>status($('#accommodationCatalogueStatus'),error?.message||'Could not refresh listings.','error')));
$('#cancelAccommodationProperty')?.addEventListener('click',()=>{$('#accommodationPropertyForm').hidden=true;resetAccommodationPropertyForm();});
$('#cancelAccommodationUnit')?.addEventListener('click',()=>{$('#accommodationUnitForm').hidden=true;});
$('#addAccommodationRate')?.addEventListener('click',()=>{
  const rows=collectAccommodationRates();
  rows.push({rate_name:'',meal_plan:'bed_only',occupancy_type:'single',occupancy_pax:1,nightly_price_kes:''});
  renderAccommodationRateRows(rows);
});
$('#pinAccommodationProperty')?.addEventListener('click',()=>{
  const target=$('#accommodationPropertyPinStatus');
  if(!navigator.geolocation){target.textContent='Location access is unavailable. Paste Maps coordinates instead.';target.className='status error';return;}
  target.textContent='Getting property location…';target.className='status';
  navigator.geolocation.getCurrentPosition(
    position=>setAccommodationPropertyCoordinates(position.coords.latitude,position.coords.longitude),
    error=>{target.textContent=error.code===1?'Location permission was not granted. Paste a Maps link or coordinates instead.':'Property location could not be detected.';target.className='status error';},
    {enableHighAccuracy:true,timeout:15000,maximumAge:15000}
  );
});
$('#accommodationPropertyMapLink')?.addEventListener('change',event=>{
  const coords=accommodationCoordinatesFromText(event.currentTarget.value);
  if(coords)setAccommodationPropertyCoordinates(coords.lat,coords.lng,'Coordinates detected');
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
    const latText=$('#accommodationPropertyLatitude').value.trim(),lngText=$('#accommodationPropertyLongitude').value.trim();
    const {error}=await client.rpc('accommodation_provider_save_property',{
      p_property_id:propertyId,p_property_name:$('#accommodationPropertyName').value.trim(),p_property_type:$('#accommodationPropertyType').value,
      p_county:$('#accommodationPropertyCounty').value.trim(),p_sub_county:$('#accommodationPropertySubCounty').value.trim()||null,
      p_town:$('#accommodationPropertyTown').value.trim(),p_public_location:$('#accommodationPropertyPublicLocation').value.trim(),
      p_description:$('#accommodationPropertyDescription').value.trim(),p_cover_image_url:coverUrl,p_gallery_image_urls:galleryUrls,
      p_amenities:accommodationArrayValue($('#accommodationPropertyAmenities').value),p_house_rules:$('#accommodationPropertyRules').value.trim()||null,
      p_check_in_time:$('#accommodationPropertyCheckIn').value,p_check_out_time:$('#accommodationPropertyCheckOut').value,
      p_latitude:latText?Number(latText):null,p_longitude:lngText?Number(lngText):null,p_map_link:$('#accommodationPropertyMapLink').value.trim()||null,
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
    const rates=collectAccommodationRates();
    if(!rates.length)throw new Error('Add at least one rate plan.');
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
    const {data:savedUnitId,error}=await client.rpc('accommodation_provider_save_unit',{
      p_unit_id:unitId,p_property_id:propertyId,p_unit_name:$('#accommodationUnitName').value.trim(),
      p_description:$('#accommodationUnitDescription').value.trim()||null,p_nightly_price_kes:Number($('#accommodationUnitPrice').value),
      p_max_guests:Number($('#accommodationUnitGuests').value),p_beds_description:$('#accommodationUnitBeds').value.trim()||null,
      p_inventory_count:Number($('#accommodationUnitInventory').value),p_unit_image_url:imageUrl,p_gallery_image_urls:galleryUrls,
      p_amenities:accommodationArrayValue($('#accommodationUnitAmenities').value),p_submit:true
    });
    if(error)throw error;
    const effectiveUnitId=savedUnitId||unitId;
    const rateResult=await client.rpc('accommodation_provider_replace_unit_rates',{p_unit_id:effectiveUnitId,p_rates:rates});
    if(rateResult.error)throw rateResult.error;
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
$('#cancelAccommodationRegistration')?.addEventListener('click',()=>{
  clearAccommodationDraft();
  accommodationProvider?renderAccommodationProvider():openAccommodationRole();
});
$('#accommodationPendingBack')?.addEventListener('click',showRolePicker);
$('#accommodationBackToPartnerships')?.addEventListener('click',showRolePicker);
$('#refreshAccommodationDashboard')?.addEventListener('click',()=>loadAccommodationProvider());
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
    const {error}=await client.rpc('accommodation_provider_submit_application',{
      p_business_name:$('#accommodationBusinessName').value.trim(),
      p_owner_name:$('#accommodationOwnerName').value.trim(),
      p_id_number:$('#accommodationIdNumber').value.trim(),
      p_phone:phone,p_email:$('#accommodationEmail').value.trim()||null,
      p_county_code:$('#accommodationCounty').value,p_county:county?.name||$('#accommodationCounty').selectedOptions[0]?.textContent||'',
      p_sub_county_code:$('#accommodationSubCounty').value,p_sub_county:sub?.name||$('#accommodationSubCounty').selectedOptions[0]?.textContent||'',
      p_town:$('#accommodationTown').value.trim(),p_location_details:$('#accommodationLocation').value.trim(),
      p_base_map_link:$('#accommodationMapLink').value.trim()||null,p_base_latitude:latitude,p_base_longitude:longitude,
      p_business_description:$('#accommodationDescription').value.trim()||null,
      p_profile_picture_path:profilePicturePath,p_passport_photo_path:passportPhotoPath,
      p_business_id_document_path:businessIdPath,p_business_licence_path:businessLicencePath,
      p_registration_certificate_path:registrationCertificatePath,p_other_permit_paths:otherPermitPaths
    });
    if(error)throw error;
    status($('#accommodationRegistrationStatus'),'Accommodation Provider application submitted to LEOGO Admin for approval.','success');
    clearAccommodationDraft();
    await loadAccommodationProvider();
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
  if(partnerNotificationBell)partnerNotificationBell.hidden=false;
  rolePicker.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  transportShell.hidden=false;
  authShell.hidden=true;
  if(hero)hero.hidden=true;
  showTransportBoot();
  await loadTransportProvider();
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
    accommodationProvider=null;accommodationNotifications=[];activeRole='';
    authShell.hidden=false;rolePicker.hidden=true;sellerShell.hidden=true;
    if(providerShell)providerShell.hidden=true;
    if(transportShell)transportShell.hidden=true;
    if(accommodationShell)accommodationShell.hidden=true;
    if(hero)hero.hidden=false;
    return;
  }
  authShell.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  if(transportShell)transportShell.hidden=true;
  if(accommodationShell)accommodationShell.hidden=true;
  rolePicker.hidden=false;
  if(hero)hero.hidden=false;
  if(activeRole==='seller')await openSellerRole();
  if(activeRole==='service_provider')await openProviderRole();
  if(activeRole==='transport')await openTransportRole();
  if(activeRole==='accommodation')await openAccommodationRole();
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
(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const PARTNER_URL='https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/partner/';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const status=(el,msg='',type='')=>{if(!el)return;el.textContent=msg;el.className='status'+(type?' '+type:'');};
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const uid=()=>currentUser?.id||'';
let currentUser=null,seller=null,categories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.categories)?window.LEOGO_PRODUCT_TAXONOMY.categories:[],subcategories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.subcategories)?window.LEOGO_PRODUCT_TAXONOMY.subcategories:[],products=[],editingProduct=null,kenyaCounties=[],kenyaSubcounties=[],settlementAccounts=[],sellerSettlements=[],settlementRequests=[],partnerNotifications=[],sellerOrders=[],sellerReviews=[],sellerOrderFilter='all';
let provider=null,providerServices=[],providerNotifications=[],editingProviderService=null;
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

const authShell=$('#partnerAuthShell'),rolePicker=$('#partnerRolePicker'),sellerShell=$('#sellerShell'),providerShell=$('#providerShell'),logout=$('#partnerLogout'),hero=$('.hero');
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

resetRequestForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!resetRequestForm.reportValidity())return;
  const email=$('#partnerResetEmail').value.trim().toLowerCase();
  status($('#partnerAuthStatus'),'Sending password reset link…');
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:PARTNER_URL+'?mode=reset-password'});
  if(error){status($('#partnerAuthStatus'),error.message,'error');return;}
  status($('#partnerAuthStatus'),'Password reset link sent. Check your email and open the link to create a new password.','success');
});

resetUpdateForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!resetUpdateForm.reportValidity())return;
  const password=$('#partnerRecoveryPassword').value;
  const confirm=$('#partnerRecoveryPasswordConfirm').value;
  if(password.length<8){status($('#partnerAuthStatus'),'Use at least 8 characters.','error');return;}
  if(password!==confirm){status($('#partnerAuthStatus'),'The two passwords do not match.','error');return;}
  status($('#partnerAuthStatus'),'Updating password…');
  const {error}=await client.auth.updateUser({password});
  if(error){status($('#partnerAuthStatus'),error.message,'error');return;}
  resetUpdateForm.reset();
  status($('#partnerAuthStatus'),'Password updated successfully. Continue to your Partnership Selection.','success');
  history.replaceState({},document.title,PARTNER_URL);
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
$('[data-role-target]').forEach((button)=>button.addEventListener('click',()=>{
  if(button.disabled)return;
  if(button.dataset.roleTarget==='seller')openSellerRole();
  if(button.dataset.roleTarget==='service_provider')openProviderRole();
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
        loadSellerOrders(),
        loadSellerReviews(),
        loadKenyaLocations()
      ]).then(results=>{
        const labels=['products','taxonomy','settlements','orders','reviews','locations'];
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
function showRolePicker(){
  activeRole='';
  rolePicker.hidden=false;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  authShell.hidden=true;
  if(hero)hero.hidden=false;
}
async function openSellerRole(){
  activeRole='seller';
  rolePicker.hidden=true;
  sellerShell.hidden=false;
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
    ? ['overview','products','orders','reviews','flashsale','settlements','notifications','profile','data']
    : ['overview','notifications','profile','data'];
  const resolved=allowed.includes(view)?view:'overview';
  $$('[data-seller-content]').forEach(panel=>panel.classList.toggle('active',panel.dataset.sellerContent===resolved));
  $$('[data-seller-view]').forEach(button=>button.classList.toggle('active',button.dataset.sellerView===resolved));
  $('#sellerViewDescription').textContent=sellerViewDescription(resolved);
  if(resolved==='reviews'&&seller?.application_status==='approved'){
    loadSellerReviews().catch(error=>console.warn('Seller reviews refresh failed:',error));
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
  $('[data-seller-view="products"],[data-seller-view="orders"],[data-seller-view="reviews"],[data-seller-view="flashsale"],[data-seller-view="settlements"]').forEach(button=>button.hidden=state!=='approved');

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
    $('#sellerDescription').value=seller.business_description||'';

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
    }else if(['products','settlements','notifications','profile','data','flashsale'].includes(view)){
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
    await Promise.all([loadSellerSettlementData(),loadPartnerNotifications()]);
  }catch(error){status($('#sellerSettlementRequestStatus'),error.message||'Settlement request could not be submitted.','error');}
  finally{button.disabled=false;button.textContent=original;}
});

$('#showSellerRegistration').addEventListener('click',()=>{sellerOnboarding.hidden=true;sellerReg.hidden=false;sellerReg.scrollIntoView({behavior:'smooth'});});

sellerReg.addEventListener('submit',async e=>{
  e.preventDefault();const phone=normalisePhone($('#sellerPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#sellerRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  status($('#sellerRegistrationStatus'),'Uploading business documents…');
  try{
    const businessIdFile=$('#sellerBusinessIdDocument').files[0];
    if(!businessIdFile)throw new Error('Business ID / identification document is required.');
    const otherFiles=[...$('#sellerOtherPermits').files];
    if(otherFiles.length>4)throw new Error('Choose a maximum of 4 other permit files.');
    const [businessIdPath,businessLicencePath,registrationCertificatePath,otherPermitPaths]=await Promise.all([
      uploadSellerVerification(businessIdFile,'business-id'),
      uploadSellerVerification($('#sellerBusinessLicence').files[0],'business-licence'),
      uploadSellerVerification($('#sellerRegistrationCertificate').files[0],'registration-certificate'),
      Promise.all(otherFiles.map((file,index)=>uploadSellerVerification(file,'permit-'+index)))
    ]);
    status($('#sellerRegistrationStatus'),'Submitting seller application…');
    const {error}=await client.rpc('submit_seller_application',{
    p_business_name:$('#sellerBusinessName').value.trim(),p_owner_name:$('#sellerOwnerName').value.trim(),
    p_id_number:$('#sellerIdNumber').value.trim(),p_phone:phone,
    p_county:$('#sellerCounty').selectedOptions[0]?.textContent||'',p_sub_county:$('#sellerSubCounty').selectedOptions[0]?.textContent||'',
    p_town:$('#sellerTown').value.trim(),p_location_details:$('#sellerLocation').value.trim(),
    p_business_description:$('#sellerDescription').value.trim()||null,
    p_county_code:$('#sellerCounty').value,p_sub_county_code:$('#sellerSubCounty').value,
    p_business_id_document_path:businessIdPath,
    p_business_licence_path:businessLicencePath,
    p_registration_certificate_path:registrationCertificatePath,
    p_other_permit_paths:otherPermitPaths
  });
    if(error)throw error;
  }catch(error){status($('#sellerRegistrationStatus'),error.message||'Seller application could not be submitted.','error');return;}
  status($('#sellerRegistrationStatus'),'Seller application submitted to LEOGO Admin for approval.','success');
  await loadSeller();
  sellerReg.hidden=true;
  sellerDashboard.hidden=false;
  sellerDashboard.scrollIntoView({behavior:'smooth'});
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
  $('#sellerFlashSaleList').innerHTML=flashItems.length?flashItems.map(p=>'<article class="provider-service-card"><img src="'+escapeHtml(publicUrl(p.main_image_path))+'" alt=""><div><h4>'+escapeHtml(p.product_name)+'</h4><p>Normal '+money(p.price_kes)+' · Flash '+money(p.flash_sale_price_kes)+'</p><span class="badge flash">'+escapeHtml((p.flash_sale_status||'requested').replaceAll('_',' '))+'</span><small>Qty '+Number(p.flash_sale_quantity||0)+' · '+formatDate(p.flash_sale_starts_at)+' → '+formatDate(p.flash_sale_ends_at)+'</small></div></article>').join(''):'<div class="empty-card">No products have been sent to Flash Sale yet.</div>';
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
  if(!provider){providerOnboarding.hidden=false;return;}
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
  $('#providerDashboardStatus').textContent=providerStatusCopy(provider.application_status);
  $('#providerAvailability').textContent=(provider.availability_status||'available').replaceAll('_',' ');
  $('#providerProfileSummary').innerHTML=providerSummaryRows().filter(([label])=>label!=='Admin Note').map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
  renderProviderServices();
  renderProviderNotifications();
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
    if(provider?.application_status==='approved')await Promise.allSettled([loadProviderServices(),loadProviderNotifications()]);
  }catch(error){
    console.error('Service Provider portal boot failed:',error);
    showProviderBoot(error?.message||'The Service Provider dashboard could not finish loading.',true);
    providerOnboarding.hidden=true;providerReg.hidden=true;providerPendingArea.hidden=true;providerDashboard.hidden=true;
  }
}
async function openProviderRole(){
  activeRole='service_provider';
  rolePicker.hidden=true;
  sellerShell.hidden=true;
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
    const [businessLicencePath,registrationCertificatePath,professionalLicencePath,otherPermitPaths]=await Promise.all([
      $('#providerBusinessLicence').files[0]?uploadProviderVerification($('#providerBusinessLicence').files[0],'business-licence'):Promise.resolve(provider?.business_licence_path||null),
      $('#providerRegistrationCertificate').files[0]?uploadProviderVerification($('#providerRegistrationCertificate').files[0],'registration-certificate'):Promise.resolve(provider?.registration_certificate_path||null),
      $('#providerProfessionalLicence').files[0]?uploadProviderVerification($('#providerProfessionalLicence').files[0],'professional-licence'):Promise.resolve(provider?.professional_licence_path||null),
      otherFiles.length?Promise.all(otherFiles.map((file,index)=>uploadProviderVerification(file,'permit-'+index))):Promise.resolve(provider?.other_permit_paths||[])
    ]);
    status($('#providerRegistrationStatus'),'Sending application to LEOGO Admin…');
    const {error}=await client.rpc('submit_service_provider_application',{
      p_business_name:$('#providerBusinessName').value.trim(),p_owner_name:$('#providerOwnerName').value.trim(),
      p_id_number:$('#providerIdNumber').value.trim(),p_phone:phone,p_primary_service:$('#providerPrimaryService').value.trim(),
      p_service_category:$('#providerServiceCategory').value.trim()||null,
      p_experience_years:$('#providerExperienceYears').value===''?null:Number($('#providerExperienceYears').value),
      p_county_code:$('#providerCounty').value,p_sub_county_code:$('#providerSubCounty').value,p_town:$('#providerTown').value.trim(),
      p_location_details:$('#providerLocation').value.trim(),p_business_description:$('#providerDescription').value.trim()||null,
      p_service_area_notes:$('#providerServiceAreaNotes').value.trim()||null,p_business_id_document_path:businessIdPath,
      p_business_licence_path:businessLicencePath,p_registration_certificate_path:registrationCertificatePath,
      p_professional_licence_path:professionalLicencePath,p_other_permit_paths:otherPermitPaths
    });
    if(error)throw error;
    status($('#providerRegistrationStatus'),'Service Provider application submitted successfully.','success');
    await loadProvider();
  }catch(error){status($('#providerRegistrationStatus'),error?.message||'Service Provider application could not be submitted.','error');}
  finally{submitButton.disabled=false;submitButton.textContent=original;}
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
    '<article class="product-card">'+
      '<div class="provider-service-card-main"><div><span class="status-chip">'+escapeHtml(String(item.approval_status||'pending').replaceAll('_',' '))+'</span><h4>'+escapeHtml(item.service_name)+'</h4><p>'+escapeHtml(item.description||'No description added.')+'</p></div><strong>'+escapeHtml(providerPriceText(item))+'</strong></div>'+
      '<div class="provider-service-meta"><span>'+escapeHtml(item.category_name||provider?.primary_service||'Service')+'</span><span>'+(item.is_available?'Available':'Unavailable')+'</span><span>'+escapeHtml(item.service_area||provider?.town||'')+'</span></div>'+
      (item.admin_notes?'<div class="restricted-notice">Admin note: '+escapeHtml(item.admin_notes)+'</div>':'')+
      '<div class="product-actions"><button class="secondary" type="button" data-provider-edit-service="'+escapeHtml(item.id)+'">Edit</button><button class="danger-data-button" type="button" data-provider-delete-service="'+escapeHtml(item.id)+'">Delete</button></div>'+
    '</article>'
  ).join(''):'<div class="empty-card">No services added yet. Use the form above to create your first service.</div>';
  $('[data-provider-edit-service]').forEach((button)=>button.addEventListener('click',()=>editProviderService(button.dataset.providerEditService)));
  $('[data-provider-delete-service]').forEach((button)=>button.addEventListener('click',()=>deleteProviderService(button.dataset.providerDeleteService,button)));
}
function resetProviderServiceForm(){
  editingProviderService=null;
  $('#providerServiceForm').reset();
  $('#providerServiceId').value='';
  $('#providerIsAvailable').checked=true;
  $('#providerServiceFormTitle').textContent='Add a Service';
  $('#providerServiceReset').hidden=true;
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
  $('#providerServiceReset').hidden=false;$('#providerServiceForm').scrollIntoView({behavior:'smooth'});
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
async function loadProviderNotifications(){
  const {data,error}=await client.from('partner_notifications').select('*').eq('partner_type','service_provider').order('created_at',{ascending:false}).limit(50);
  if(error)throw error;providerNotifications=data||[];renderProviderNotifications();
}
function renderProviderNotifications(){
  const target=$('#providerNotificationList');if(!target)return;
  target.innerHTML=providerNotifications.length?providerNotifications.map((item)=>
    '<article class="seller-notification-item '+(item.read_at?'':'unread')+'"><div><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.message)+'</p><small>'+escapeHtml(formatDate(item.created_at))+'</small></div>'+(item.read_at?'':'<span>NEW</span>')+'</article>'
  ).join(''):'<div class="empty-card">No Service Provider notifications yet.</div>';
}
$('#markAllProviderNotificationsRead')?.addEventListener('click',async()=>{
  const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'service_provider'});
  if(error){status($('#providerServiceFormStatus'),error.message,'error');return;}
  await loadProviderNotifications();
});

async function handleSession(session){
  currentUser=session?.user||null;
  logout.hidden=!currentUser;
  if(!currentUser){
    seller=null;products=[];provider=null;providerServices=[];providerNotifications=[];activeRole='';
    authShell.hidden=false;rolePicker.hidden=true;sellerShell.hidden=true;if(providerShell)providerShell.hidden=true;if(hero)hero.hidden=false;
    return;
  }
  authShell.hidden=true;
  sellerShell.hidden=true;
  if(providerShell)providerShell.hidden=true;
  rolePicker.hidden=false;
  if(hero)hero.hidden=false;
  if(activeRole==='seller')await openSellerRole();
  if(activeRole==='service_provider')await openProviderRole();
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
    authShell.hidden=false;
    rolePicker.hidden=true;
    sellerShell.hidden=true;
    if(providerShell)providerShell.hidden=true;
    $('#partnerLoginForm').hidden=true;
    $('#partnerLoginForm').classList.remove('active');
    $('#partnerRegisterForm').hidden=true;
    $('#partnerRegisterForm').classList.remove('active');
    resetRequestForm.hidden=true;
    resetUpdateForm.hidden=false;
    resetUpdateForm.classList.add('active');
    status($('#partnerAuthStatus'),'Create a new password for your LEOGO account.','success');
    return;
  }
  setTimeout(()=>{handleSession(s).catch(console.error);},0);
});
client.auth.getSession().then(({data})=>{
  if(new URLSearchParams(location.search).get('mode')==='reset-password'){
    currentUser=data.session?.user||null;
    authShell.hidden=false; rolePicker.hidden=true; sellerShell.hidden=true; if(providerShell)providerShell.hidden=true; logout.hidden=true;
    $('#partnerLoginForm').hidden=true; $('#partnerLoginForm').classList.remove('active');
    $('#partnerRegisterForm').hidden=true; $('#partnerRegisterForm').classList.remove('active');
    resetRequestForm.hidden=true; resetUpdateForm.hidden=false; resetUpdateForm.classList.add('active');
    status($('#partnerAuthStatus'),'Create a new password for your LEOGO account.','success');
    return;
  }
  handleSession(data.session);
});
})();
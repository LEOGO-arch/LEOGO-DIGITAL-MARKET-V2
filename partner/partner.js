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
let currentUser=null,seller=null,categories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.categories)?window.LEOGO_PRODUCT_TAXONOMY.categories:[],subcategories=Array.isArray(window.LEOGO_PRODUCT_TAXONOMY?.subcategories)?window.LEOGO_PRODUCT_TAXONOMY.subcategories:[],products=[],editingProduct=null,kenyaCounties=[],kenyaSubcounties=[],settlementAccounts=[],sellerSettlements=[],settlementRequests=[],partnerNotifications=[],sellerOrders=[],sellerOrderFilter='all';
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

const authShell=$('#partnerAuthShell'),rolePicker=$('#partnerRolePicker'),sellerShell=$('#sellerShell'),logout=$('#partnerLogout'),hero=$('.hero');
const resetRequestForm=$('#partnerResetRequestForm'),resetUpdateForm=$('#partnerResetUpdateForm');
const sellerReg=$('#sellerRegistrationForm'),approvedArea=$('#sellerApprovedArea'),sellerOnboarding=$('#sellerOnboarding'),sellerDashboard=$('#sellerDashboard'),sellerDocsForm=$('#sellerVerificationDocumentsForm');
const sellerProfilePanel=$('#sellerProfilePanel'),sellerNotificationPanel=$('#sellerNotificationPanel'),sellerSettlementPanel=$('#sellerSettlementPanel'),sellerPendingArea=$('#sellerPendingArea'),sellerSidebar=$('#sellerSidebar');
let activeRole='';

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
$$('[data-role-target]').forEach((button)=>button.addEventListener('click',()=>{
  if(button.disabled)return;
  if(button.dataset.roleTarget==='seller')openSellerRole();
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
  const {data,error}=await client.from('seller_accounts').select('*').eq('user_id',currentUser.id).maybeSingle();
  if(error){status($('#sellerRegistrationStatus'),error.message,'error');return;}
  seller=data||null;
  renderSeller();
  if(seller) await loadPartnerNotifications();
  if(seller?.application_status==='approved')await Promise.all([loadTaxonomy(),loadProducts(),loadSellerSettlementData(),loadSellerOrders()]);
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
  authShell.hidden=true;
  if(hero)hero.hidden=false;
}
async function openSellerRole(){
  activeRole='seller';
  rolePicker.hidden=true;
  sellerShell.hidden=false;
  if(hero)hero.hidden=true;
  await loadKenyaLocations();
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
    ? ['overview','products','orders','flashsale','settlements','notifications','profile','data']
    : ['overview','notifications','profile','data'];
  const resolved=allowed.includes(view)?view:'overview';
  $$('[data-seller-content]').forEach(panel=>panel.classList.toggle('active',panel.dataset.sellerContent===resolved));
  $$('[data-seller-view]').forEach(button=>button.classList.toggle('active',button.dataset.sellerView===resolved));
  $('#sellerViewDescription').textContent=sellerViewDescription(resolved);
  closeSellerSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-seller-view]').forEach(button=>button.addEventListener('click',()=>openSellerView(button.dataset.sellerView)));
$$('[data-open-seller-view]').forEach(button=>button.addEventListener('click',()=>openSellerView(button.dataset.openSellerView)));
$('#sellerSidebarToggle').addEventListener('click',()=>{sellerSidebar.classList.add('open');$('#sellerSidebarScrim').classList.add('open');});
$('#sellerSidebarScrim').addEventListener('click',closeSellerSidebar);

function renderSeller(){
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
  $$('[data-seller-view="products"],[data-seller-view="orders"],[data-seller-view="flashsale"],[data-seller-view="settlements"]').forEach(button=>button.hidden=state!=='approved');

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
      ${n.read_at?'':'<button class="secondary" type="button" data-mark-notification="'+escapeHtml(n.id)+'">Mark read</button>'}
    </article>`).join(''):'<div class="empty-card">No Seller notifications yet.</div>';
  $$('[data-mark-notification]').forEach(button=>button.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_partner_notification_read',{p_notification_id:button.dataset.markNotification});
    if(!error)await loadPartnerNotifications();
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
    await Promise.all([loadProducts(),loadPartnerNotifications(),loadSellerOrders(),loadSellerSettlementData()]);
    const exportData={
      export_type:'LEOGO Seller Data',
      generated_at:new Date().toISOString(),
      seller_account:seller,
      products,
      seller_orders:sellerOrders,
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
    const items=(o.items||[]).map(i=>'<li>'+escapeHtml(i.product_name)+' × '+Number(i.quantity)+' <strong>'+money(i.line_total_kes)+'</strong></li>').join('');
    const next=o.fulfilment_status==='new'
      ? '<button data-order-next="received" data-seller-order-id="'+escapeHtml(o.seller_order_id)+'">Mark Received</button>'
      : o.fulfilment_status==='received'
        ? '<button data-order-next="packed_ready" data-seller-order-id="'+escapeHtml(o.seller_order_id)+'">Packed & Ready for Pickup</button>'
        : '';
    return '<article class="seller-order-card"><header><div><span>'+escapeHtml(o.order_reference)+'</span><h4>'+escapeHtml(o.receiver_name)+'</h4><small>'+formatDate(o.created_at)+'</small></div><div><b class="order-status '+escapeHtml(o.fulfilment_status)+'">'+escapeHtml(o.fulfilment_status.replaceAll('_',' ').toUpperCase())+'</b><b class="payment-status">'+escapeHtml(orderPaymentLabel(o.payment_status))+'</b></div></header><div class="seller-order-body"><ul>'+items+'</ul><div class="seller-order-meta"><span><small>Seller subtotal</small><strong>'+money(o.seller_subtotal_kes)+'</strong></span><span><small>Customer phone</small><strong>'+escapeHtml(o.contact_number)+'</strong></span><span><small>Delivery</small><strong>'+escapeHtml(sellerOrderAddress(o))+'</strong></span><span><small>Order status</small><strong>'+escapeHtml((o.order_status||'').replaceAll('_',' ').toUpperCase())+'</strong></span><span><small>LEOGO Rider</small><strong>'+escapeHtml(o.rider_name||'Awaiting assignment')+'</strong></span><span><small>Delivery status</small><strong>'+escapeHtml((o.delivery_status||'awaiting_assignment').replaceAll('_',' ').toUpperCase())+'</strong></span></div></div><footer>'+next+(o.fulfilment_status==='packed_ready'&&o.delivery_status!=='picked_up'?'<strong>Waiting for assigned LEOGO rider pickup</strong>':'')+(o.fulfilment_status==='delivered'?'<strong class="delivered-confirmation">✓ Delivered to customer</strong>':'')+'</footer></article>';
  }).join(''):'<div class="empty-card">No orders match this filter.</div>';
  $$('[data-order-next]').forEach(button=>button.addEventListener('click',async()=>{
    const label=button.textContent;button.disabled=true;button.textContent='Updating…';
    const {error}=await client.rpc('seller_update_order_status',{p_seller_order_id:button.dataset.sellerOrderId,p_status:button.dataset.orderNext});
    if(error){alert(error.message);button.disabled=false;button.textContent=label;return;}
    await Promise.all([loadSellerOrders(),loadPartnerNotifications()]);
  }));
}
$$('[data-seller-order-filter]').forEach(button=>button.addEventListener('click',()=>{
  sellerOrderFilter=button.dataset.sellerOrderFilter;
  $$('[data-seller-order-filter]').forEach(b=>b.classList.toggle('active',b===button));
  renderSellerOrders();
}));
$('#refreshSellerOrders').addEventListener('click',async()=>{const b=$('#refreshSellerOrders');b.disabled=true;await loadSellerOrders();b.disabled=false;});

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
}
$('#productCategory').addEventListener('change',renderSubcategories);
$('#productUnit').addEventListener('change',()=>{$('#productOtherUnitWrap').hidden=$('#productUnit').value!=='other';});
$('#productHasVariants').addEventListener('change',()=>{$('#variantSection').hidden=!$('#productHasVariants').checked;if($('#productHasVariants').checked&&!$('#variantRows').children.length)addVariantRow();});
$('#productLpp').addEventListener('change',()=>{$('#lppFields').hidden=!$('#productLpp').checked;});
$('#addVariantRow').addEventListener('click',addVariantRow);
function addVariantRow(v={}){
  const row=document.createElement('div');row.className='variant-row';
  row.innerHTML='<input data-variant-name placeholder="Variant name" value="'+escapeHtml(v.variant_name||'')+'" required><input data-variant-price type="number" min="0" step="0.01" placeholder="Price" value="'+(v.price_kes??'')+'" required><input data-variant-qty type="number" min="0" step="0.001" placeholder="Qty" value="'+(v.quantity_available??0)+'" required><button type="button">×</button>';
  row.querySelector('button').addEventListener('click',()=>row.remove());$('#variantRows').append(row);
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

async function loadProducts(){
  const {data,error}=await client.from('seller_products').select('*,seller_product_variants(*)').eq('seller_id',currentUser.id).order('updated_at',{ascending:false});
  if(error){status($('#productFormStatus'),error.message,'error');return;}
  products=data||[];renderProducts();
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
  $('#sellerProductCount').textContent=products.length;
  $('#sellerAvailableCount').textContent=products.filter(p=>p.availability_status==='available'&&p.listing_status==='active').length;
  $('#sellerFlashCount').textContent=products.filter(p=>p.flash_sale_requested || ['requested','approved'].includes(p.flash_sale_status)).length;
  $('#sellerOrderCount').textContent='0';
  const box=$('#sellerProductList');
  if(!products.length){box.innerHTML='<div class="empty-card">No products yet. Use “Add Product” to create your first item.</div>';renderFlashSaleProducts();return;}
  box.innerHTML=products.map(p=>'<article class="product-card"><img src="'+escapeHtml(publicUrl(p.main_image_path))+'" alt=""><div><h4>'+escapeHtml(p.product_name)+'</h4><p>'+money(p.price_kes)+' · '+p.quantity_available+' '+escapeHtml(p.measurement_unit)+'</p><span class="badge">'+escapeHtml(p.availability_status.replaceAll('_',' '))+'</span>'+(p.flash_sale_requested?'<span class="badge flash">Flash Sale '+escapeHtml(p.flash_sale_status||'requested')+'</span>':'')+'<small>'+escapeHtml(p.product_details.slice(0,140))+'</small></div><button data-edit-product="'+p.id+'" type="button">Edit</button></article>').join('');
  $$('[data-edit-product]').forEach(b=>b.addEventListener('click',()=>editProduct(b.dataset.editProduct)));
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
  editingProduct=null;$('#sellerProductForm').reset();$('#sellerProductId').value='';$('#productFormTitle').textContent='Add Product / Item';$('#cancelProductEdit').hidden=true;$('#variantRows').innerHTML='';$('#variantSection').hidden=true;$('#lppFields').hidden=true;$('#productOtherUnitWrap').hidden=true;renderSubcategories();status($('#productFormStatus'));
  if(hide)$('#sellerProductForm').hidden=true;
}
$('#cancelProductEdit').addEventListener('click',()=>resetProductForm(true));
$('#showSellerProductForm').addEventListener('click',()=>{resetProductForm(false);$('#sellerProductForm').hidden=false;$('#sellerProductForm').scrollIntoView({behavior:'smooth',block:'start'});});

function localInput(iso){if(!iso)return'';const d=new Date(iso);const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
function editProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;editingProduct=p;
  $('#sellerProductId').value=p.id;$('#productFormTitle').textContent='Edit Product / Item';$('#productName').value=p.product_name;$('#productPrice').value=p.price_kes;$('#productAvailability').value=p.availability_status;$('#productQuantity').value=p.quantity_available;$('#productUnit').value=p.measurement_unit;$('#productOtherUnit').value=p.measurement_unit_other||'';$('#productOtherUnitWrap').hidden=p.measurement_unit!=='other';$('#productCategory').value=p.category_id;renderSubcategories();$('#productSubcategory').value=p.subcategory_id||'';$('#productGroup').value=p.group_name||'';$('#productListingStatus').value=p.listing_status;$('#productDetails').value=p.product_details;
  $('#productHasVariants').checked=p.has_variants;$('#variantSection').hidden=!p.has_variants;$('#variantRows').innerHTML='';(p.seller_product_variants||[]).forEach(addVariantRow);
  $('#productLpp').checked=p.accepts_lipa_pole_pole;$('#lppFields').hidden=!p.accepts_lipa_pole_pole;$('#productLppDeposit').value=p.lipa_pole_pole_first_deposit_kes||'';$('#productLppDays').value=p.lipa_pole_pole_max_days||'';
  $('#cancelProductEdit').hidden=false;$('#sellerProductForm').hidden=false;openSellerView('products');$('#sellerProductForm').scrollIntoView({behavior:'smooth',block:'start'});
}

$('#sellerProductForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!seller||seller.application_status!=='approved'){status($('#productFormStatus'),'Seller approval is required before adding products.','error');return;}
  try{
    status($('#productFormStatus'),'Saving product…');
    const galleryFiles=[...$('#productGallery').files];if(galleryFiles.length>3)throw new Error('Choose a maximum of 3 gallery pictures.');
    let mainPath=editingProduct?.main_image_path||null;if($('#productMainImage').files[0])mainPath=await uploadImage($('#productMainImage').files[0],'main');
    if(!mainPath)throw new Error('Add a main product picture.');
    let galleryPaths=editingProduct?.gallery_image_paths||[];if(galleryFiles.length)galleryPaths=await Promise.all(galleryFiles.map((f,i)=>uploadImage(f,'gallery-'+i)));
    const hasVariants=$('#productHasVariants').checked,lpp=$('#productLpp').checked;
    const payload={
      seller_id:currentUser.id,product_name:$('#productName').value.trim(),price_kes:Number($('#productPrice').value),
      availability_status:$('#productAvailability').value,quantity_available:Number($('#productQuantity').value),
      measurement_unit:$('#productUnit').value,measurement_unit_other:$('#productUnit').value==='other'?$('#productOtherUnit').value.trim()||null:null,
      accepts_lipa_pole_pole:lpp,lipa_pole_pole_first_deposit_kes:lpp?Number($('#productLppDeposit').value):null,lipa_pole_pole_max_days:lpp?Number($('#productLppDays').value):null,
      has_variants:hasVariants,product_details:$('#productDetails').value.trim(),main_image_path:mainPath,gallery_image_paths:galleryPaths,
      category_id:$('#productCategory').value,subcategory_id:$('#productSubcategory').value||null,group_name:$('#productGroup').value.trim()||null,
      listing_status:$('#productListingStatus').value,updated_at:new Date().toISOString()
    };
    let productId=editingProduct?.id;
    if(productId){const {error}=await client.from('seller_products').update(payload).eq('id',productId).eq('seller_id',currentUser.id);if(error)throw error;}
    else{const {data,error}=await client.from('seller_products').insert(payload).select('id').single();if(error)throw error;productId=data.id;}
    const {error:deleteError}=await client.from('seller_product_variants').delete().eq('product_id',productId);if(deleteError)throw deleteError;
    if(hasVariants){
      const variants=$$('.variant-row').map((row,i)=>({product_id:productId,variant_name:$('[data-variant-name]',row).value.trim(),price_kes:Number($('[data-variant-price]',row).value),quantity_available:Number($('[data-variant-qty]',row).value),display_order:i}));
      if(!variants.length)throw new Error('Add at least one variant or switch off variants.');
      const {error}=await client.from('seller_product_variants').insert(variants);if(error)throw error;
    }
    status($('#productFormStatus'),'Product saved successfully. Flash Sale can be requested separately from the Flash Sale menu.','success');await loadProducts();setTimeout(()=>resetProductForm(true),700);
  }catch(err){status($('#productFormStatus'),err.message||'Product could not be saved.','error');}
});

async function handleSession(session){
  currentUser=session?.user||null;
  logout.hidden=!currentUser;
  if(!currentUser){
    seller=null;products=[];activeRole='';
    authShell.hidden=false;rolePicker.hidden=true;sellerShell.hidden=true;if(hero)hero.hidden=false;
    return;
  }
  authShell.hidden=true;
  sellerShell.hidden=true;
  rolePicker.hidden=false;
  if(hero)hero.hidden=false;
  if(activeRole==='seller')await openSellerRole();
}
client.auth.onAuthStateChange((event,s)=>{
  if(event==='PASSWORD_RECOVERY'){
    currentUser=s?.user||null;
    authShell.hidden=false;
    rolePicker.hidden=true;
    sellerShell.hidden=true;
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
    authShell.hidden=false; rolePicker.hidden=true; sellerShell.hidden=true; logout.hidden=true;
    $('#partnerLoginForm').hidden=true; $('#partnerLoginForm').classList.remove('active');
    $('#partnerRegisterForm').hidden=true; $('#partnerRegisterForm').classList.remove('active');
    resetRequestForm.hidden=true; resetUpdateForm.hidden=false; resetUpdateForm.classList.add('active');
    status($('#partnerAuthStatus'),'Create a new password for your LEOGO account.','success');
    return;
  }
  handleSession(data.session);
});
})();
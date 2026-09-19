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
let currentUser=null,seller=null,categories=[],subcategories=[],products=[],editingProduct=null,kenyaCounties=[],kenyaSubcounties=[];
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

const authShell=$('#partnerAuthShell'),rolePicker=$('#partnerRolePicker'),sellerShell=$('#sellerShell'),logout=$('#partnerLogout');
const resetRequestForm=$('#partnerResetRequestForm'),resetUpdateForm=$('#partnerResetUpdateForm');
const sellerReg=$('#sellerRegistrationForm'),approvedArea=$('#sellerApprovedArea'),sellerOnboarding=$('#sellerOnboarding'),sellerDashboard=$('#sellerDashboard');
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

$('#partnerLoginForm').addEventListener('submit',async e=>{e.preventDefault();status($('#partnerAuthStatus'),'Signing in…');const {error}=await client.auth.signInWithPassword({email:$('#partnerLoginEmail').value.trim(),password:$('#partnerLoginPassword').value});if(error)status($('#partnerAuthStatus'),error.message,'error');});
$('#partnerRegisterForm').addEventListener('submit',async e=>{e.preventDefault();status($('#partnerAuthStatus'),'Creating account…');const {data,error}=await client.auth.signUp({email:$('#partnerRegisterEmail').value.trim(),password:$('#partnerRegisterPassword').value,options:{data:{full_name:$('#partnerRegisterName').value.trim()}}});if(error){status($('#partnerAuthStatus'),error.message,'error');return;}status($('#partnerAuthStatus'),data.session?'Account created. Choose the partnership you want to register for.':'Account created. Sign in to continue to partnership selection.','success');});
logout.addEventListener('click',()=>client.auth.signOut());
$('#backToPartnerships').addEventListener('click',()=>showRolePicker());
$$('[data-role-target]').forEach((button)=>button.addEventListener('click',()=>{
  if(button.disabled)return;
  if(button.dataset.roleTarget==='seller')openSellerRole();
}));

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
  if(seller?.application_status==='approved')await Promise.all([loadTaxonomy(),loadProducts()]);
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
}
async function openSellerRole(){
  activeRole='seller';
  rolePicker.hidden=true;
  sellerShell.hidden=false;
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
    ['Business Description',seller.business_description||'—']
  ];
  $('#sellerRegistrationSummary').innerHTML='<div class="section-title compact"><span>REGISTRATION DETAILS</span><h3>Your submitted Seller information</h3></div><div class="summary-grid">'+fields.map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('')+'</div>';
}
function renderSeller(){
  const name=currentUser?.user_metadata?.full_name||currentUser?.email||'Partner';
  const state=seller?.application_status||'not_registered';
  $('#sellerWelcome').textContent=seller?.business_name||name;
  sellerOnboarding.hidden=Boolean(seller);
  sellerDashboard.hidden=!seller;
  sellerReg.hidden=true;
  approvedArea.hidden=state!=='approved';

  if(seller){
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
      editButton.type='button'; editButton.className='secondary seller-correction-button'; editButton.textContent='Update & Resubmit Registration';
      editButton.addEventListener('click',()=>{sellerReg.hidden=false;sellerReg.scrollIntoView({behavior:'smooth'});});
      $('#sellerRegistrationSummary').append(editButton);
    }
  }else if(currentUser){
    $('#sellerOwnerName').value=currentUser.user_metadata?.full_name||'';
  }
}
$('#showSellerRegistration').addEventListener('click',()=>{sellerOnboarding.hidden=true;sellerReg.hidden=false;sellerReg.scrollIntoView({behavior:'smooth'});});

sellerReg.addEventListener('submit',async e=>{
  e.preventDefault();const phone=normalisePhone($('#sellerPhone').value);
  if(!/^\+254[17]\d{8}$/.test(phone)){status($('#sellerRegistrationStatus'),'Enter a valid Kenyan phone number.','error');return;}
  status($('#sellerRegistrationStatus'),'Submitting seller application…');
  const {error}=await client.rpc('submit_seller_application',{
    p_business_name:$('#sellerBusinessName').value.trim(),p_owner_name:$('#sellerOwnerName').value.trim(),
    p_id_number:$('#sellerIdNumber').value.trim(),p_phone:phone,
    p_county:$('#sellerCounty').selectedOptions[0]?.textContent||'',p_sub_county:$('#sellerSubCounty').selectedOptions[0]?.textContent||'',
    p_town:$('#sellerTown').value.trim(),p_location_details:$('#sellerLocation').value.trim(),
    p_business_description:$('#sellerDescription').value.trim()||null,
    p_county_code:$('#sellerCounty').value,p_sub_county_code:$('#sellerSubCounty').value
  });
  if(error){status($('#sellerRegistrationStatus'),error.message,'error');return;}
  status($('#sellerRegistrationStatus'),'Seller application submitted to LEOGO Admin for approval.','success');
  await loadSeller();
  sellerReg.hidden=true;
  sellerDashboard.hidden=false;
  sellerDashboard.scrollIntoView({behavior:'smooth'});
});

async function loadTaxonomy(){
  const [c,s]=await Promise.all([
    client.from('product_categories').select('*').eq('is_active',true).order('display_order'),
    client.from('product_subcategories').select('*').eq('is_active',true).order('display_order')
  ]);
  if(c.error||s.error){status($('#productFormStatus'),(c.error||s.error).message,'error');return;}
  categories=c.data||[];subcategories=s.data||[];
  $('#productCategory').innerHTML='<option value="">Choose category</option>'+categories.filter(x=>x.is_assignable).map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join('');
  renderSubcategories();
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function renderSubcategories(){
  const cat=$('#productCategory').value;
  $('#productSubcategory').innerHTML='<option value="">Optional</option>'+subcategories.filter(x=>x.category_id===cat).map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join('');
  const selected=categories.find(x=>x.id===cat);$('#restrictedCategoryNotice').hidden=!selected?.restricted_category;
}
$('#productCategory').addEventListener('change',renderSubcategories);
$('#productUnit').addEventListener('change',()=>{$('#productOtherUnitWrap').hidden=$('#productUnit').value!=='other';});
$('#productHasVariants').addEventListener('change',()=>{$('#variantSection').hidden=!$('#productHasVariants').checked;if($('#productHasVariants').checked&&!$('#variantRows').children.length)addVariantRow();});
$('#productLpp').addEventListener('change',()=>{$('#lppFields').hidden=!$('#productLpp').checked;});
$('#productFlashSale').addEventListener('change',()=>{$('#flashFields').hidden=!$('#productFlashSale').checked;});
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
function renderProducts(){
  $('#sellerProductCount').textContent=products.length;
  $('#sellerAvailableCount').textContent=products.filter(p=>p.availability_status==='available'&&p.listing_status==='active').length;
  $('#sellerFlashCount').textContent=products.filter(p=>p.flash_sale_requested).length;
  const box=$('#sellerProductList');
  if(!products.length){box.innerHTML='<p>No products yet. Add your first item above.</p>';return;}
  box.innerHTML=products.map(p=>'<article class="product-card"><img src="'+escapeHtml(publicUrl(p.main_image_path))+'" alt=""><div><h4>'+escapeHtml(p.product_name)+'</h4><p>'+money(p.price_kes)+' · '+p.quantity_available+' '+escapeHtml(p.measurement_unit)+'</p><span class="badge">'+escapeHtml(p.availability_status.replaceAll('_',' '))+'</span>'+(p.flash_sale_requested?'<span class="badge flash">Flash Sale requested</span>':'')+'<small>'+escapeHtml(p.product_details.slice(0,140))+'</small></div><button data-edit-product="'+p.id+'" type="button">Edit</button></article>').join('');
  $$('[data-edit-product]').forEach(b=>b.addEventListener('click',()=>editProduct(b.dataset.editProduct)));
}
function resetProductForm(){
  editingProduct=null;$('#sellerProductForm').reset();$('#sellerProductId').value='';$('#productFormTitle').textContent='Add Product / Item';$('#cancelProductEdit').hidden=true;$('#variantRows').innerHTML='';$('#variantSection').hidden=true;$('#lppFields').hidden=true;$('#flashFields').hidden=true;$('#productOtherUnitWrap').hidden=true;renderSubcategories();status($('#productFormStatus'));
}
$('#cancelProductEdit').addEventListener('click',resetProductForm);

function localInput(iso){if(!iso)return'';const d=new Date(iso);const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
function editProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;editingProduct=p;
  $('#sellerProductId').value=p.id;$('#productFormTitle').textContent='Edit Product / Item';$('#productName').value=p.product_name;$('#productPrice').value=p.price_kes;$('#productAvailability').value=p.availability_status;$('#productQuantity').value=p.quantity_available;$('#productUnit').value=p.measurement_unit;$('#productOtherUnit').value=p.measurement_unit_other||'';$('#productOtherUnitWrap').hidden=p.measurement_unit!=='other';$('#productCategory').value=p.category_id;renderSubcategories();$('#productSubcategory').value=p.subcategory_id||'';$('#productGroup').value=p.group_name||'';$('#productListingStatus').value=p.listing_status;$('#productDetails').value=p.product_details;
  $('#productHasVariants').checked=p.has_variants;$('#variantSection').hidden=!p.has_variants;$('#variantRows').innerHTML='';(p.seller_product_variants||[]).forEach(addVariantRow);
  $('#productLpp').checked=p.accepts_lipa_pole_pole;$('#lppFields').hidden=!p.accepts_lipa_pole_pole;$('#productLppDeposit').value=p.lipa_pole_pole_first_deposit_kes||'';$('#productLppDays').value=p.lipa_pole_pole_max_days||'';
  $('#productFlashSale').checked=p.flash_sale_requested;$('#flashFields').hidden=!p.flash_sale_requested;$('#flashPrice').value=p.flash_sale_price_kes||'';$('#flashQuantity').value=p.flash_sale_quantity||'';$('#flashStart').value=localInput(p.flash_sale_starts_at);$('#flashEnd').value=localInput(p.flash_sale_ends_at);
  $('#cancelProductEdit').hidden=false;$('#sellerProductForm').scrollIntoView({behavior:'smooth'});
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
    const hasVariants=$('#productHasVariants').checked,lpp=$('#productLpp').checked,flash=$('#productFlashSale').checked;
    const payload={
      seller_id:currentUser.id,product_name:$('#productName').value.trim(),price_kes:Number($('#productPrice').value),
      availability_status:$('#productAvailability').value,quantity_available:Number($('#productQuantity').value),
      measurement_unit:$('#productUnit').value,measurement_unit_other:$('#productUnit').value==='other'?$('#productOtherUnit').value.trim()||null:null,
      accepts_lipa_pole_pole:lpp,lipa_pole_pole_first_deposit_kes:lpp?Number($('#productLppDeposit').value):null,lipa_pole_pole_max_days:lpp?Number($('#productLppDays').value):null,
      has_variants:hasVariants,product_details:$('#productDetails').value.trim(),main_image_path:mainPath,gallery_image_paths:galleryPaths,
      category_id:$('#productCategory').value,subcategory_id:$('#productSubcategory').value||null,group_name:$('#productGroup').value.trim()||null,
      listing_status:$('#productListingStatus').value,flash_sale_requested:flash,flash_sale_price_kes:flash?Number($('#flashPrice').value):null,
      flash_sale_starts_at:flash?new Date($('#flashStart').value).toISOString():null,flash_sale_ends_at:flash?new Date($('#flashEnd').value).toISOString():null,
      flash_sale_quantity:flash?Number($('#flashQuantity').value):null,flash_sale_status:flash?'requested':'none',updated_at:new Date().toISOString()
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
    status($('#productFormStatus'),'Product saved successfully.','success');resetProductForm();await loadProducts();
  }catch(err){status($('#productFormStatus'),err.message||'Product could not be saved.','error');}
});

async function handleSession(session){
  currentUser=session?.user||null;
  logout.hidden=!currentUser;
  if(!currentUser){
    seller=null;products=[];activeRole='';
    authShell.hidden=false;rolePicker.hidden=true;sellerShell.hidden=true;
    return;
  }
  authShell.hidden=true;
  sellerShell.hidden=true;
  rolePicker.hidden=false;
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
  handleSession(s);
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
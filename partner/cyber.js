
(() => {
'use strict';

const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(v)=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const setStatus=(el,msg='',type='')=>{if(!el)return;el.textContent=msg;el.className='cyber-status'+(type?' '+type:'');};
const normalizePhone=(v)=>{const d=String(v||'').replace(/\D/g,'');if(/^0[17]\d{8}$/.test(d))return '+254'+d.slice(1);if(/^254[17]\d{8}$/.test(d))return '+'+d;if(/^[17]\d{8}$/.test(d))return '+254'+d;return String(v||'').trim();};

const shell=$('#cyberShell');
const rolePicker=$('#partnerRolePicker');
const authShell=$('#partnerAuthShell');
const hero=$('.hero');
if(!shell)return;

let user=null;
let account=null;
let services=[];
let products=[];
let orders=[];
let counties=[];
let subcounties=[];
let editServiceId=null;
let editProductId=null;
let editApprovedProfile=false;

const hideOtherPartnerShells=()=>{
  ['sellerShell','providerShell','transportShell','premiumShell','accommodationShell'].forEach(id=>{const el=$('#'+id);if(el)el.hidden=true;});
};

const showRolePicker=()=>{
  document.body.classList.remove('cyber-role-open');
  shell.hidden=true;
  if(typeof window.leogoShowPartnerRolePicker==='function'){
    window.leogoShowPartnerRolePicker();
    return;
  }
  shell.hidden=true;
  if(rolePicker)rolePicker.hidden=false;
  if(authShell)authShell.hidden=true;
  if(hero)hero.hidden=false;
};

const fillCounties=async()=>{
  if(!counties.length){
    const [c,s]=await Promise.all([
      client.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    if(c.error)throw c.error;
    if(s.error)throw s.error;
    counties=c.data||[];
    subcounties=s.data||[];
  }
  const select=$('#cyberCounty');
  if(select){
    const keep=select.value;
    select.innerHTML='<option value="">Select county</option>'+counties.map(c=>'<option value="'+esc(c.code)+'">'+esc(c.name)+'</option>').join('');
    if(keep)select.value=keep;
  }
};

const fillSubcounties=(preferred='')=>{
  const county=$('#cyberCounty')?.value||'';
  const select=$('#cyberSubCounty');
  if(!select)return;
  const rows=subcounties.filter(s=>s.county_code===county);
  select.disabled=!county;
  select.innerHTML=county
    ? '<option value="">Select sub-county</option>'+rows.map(s=>'<option value="'+esc(s.code)+'">'+esc(s.name)+'</option>').join('')
    : '<option value="">Choose a county first</option>';
  if(preferred&&rows.some(s=>s.code===preferred))select.value=preferred;
};

const parseCoordinates=(value)=>{
  const raw=String(value||'').trim();
  const patterns=[
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
  ];
  for(const p of patterns){
    const m=raw.match(p);
    if(m){
      const lat=Number(m[1]),lng=Number(m[2]);
      if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180)return {lat,lng};
    }
  }
  return null;
};

const setPin=(lat,lng,mapLink='')=>{
  $('#cyberLatitude').value=Number(lat).toFixed(7);
  $('#cyberLongitude').value=Number(lng).toFixed(7);
  $('#cyberMapLink').value=mapLink||('https://www.google.com/maps?q='+Number(lat).toFixed(7)+','+Number(lng).toFixed(7));
  $('#cyberPinStatus').textContent='✓ Shop location pinned: '+Number(lat).toFixed(6)+', '+Number(lng).toFixed(6);
};

const upload=(bucket,file,prefix)=>{
  if(!file)return Promise.resolve(null);
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=user.id+'/'+prefix+'-'+crypto.randomUUID()+'.'+ext;
  return client.storage.from(bucket).upload(path,file,{upsert:false}).then(({error})=>{
    if(error)throw error;
    return path;
  });
};

const accountStatusCopy=(s)=>{
  const map={
    submitted:'Submitted to LEOGO Admin. Your Cyber application is waiting for review.',
    under_review:'LEOGO Admin is reviewing your Cyber application.',
    changes_requested:'LEOGO Admin requested corrections. Update the form and resubmit.',
    approved:'Approved. You can add services, products and receive customer Cyber orders.',
    rejected:'The Cyber application was not approved. Review the Admin note and correct it before resubmitting.',
    suspended:'This Cyber account is suspended. Contact LEOGO Admin.'
  };
  return map[s]||'Register your Cyber shop to start offering services on LEOGO.';
};

const openView=(view='overview')=>{
  $$('[data-cyber-content]').forEach(p=>p.classList.toggle('active',p.dataset.cyberContent===view));
  $$('[data-cyber-view]').forEach(b=>b.classList.toggle('active',b.dataset.cyberView===view));
  if(view==='orders')loadOrders().catch(console.warn);
  if(view==='services')loadServices().catch(console.warn);
  if(view==='products')loadProducts().catch(console.warn);
  if(view==='profile')renderProfile();
};

const renderAccount=()=>{
  const boot=$('#cyberBootStatus'),onboarding=$('#cyberOnboarding'),form=$('#cyberRegistrationForm'),dashboard=$('#cyberDashboard');
  boot.hidden=true;
  onboarding.hidden=true;
  form.hidden=true;
  dashboard.hidden=true;

  if(!account){
    onboarding.hidden=false;
    return;
  }

  if(account.application_status==='approved'){
    dashboard.hidden=false;
    $('#cyberSidebarBusiness').textContent=account.business_name||'Cyber Partner';
    $('#cyberSidebarStatus').textContent='APPROVED';
    renderOverview();
    renderProfile();
    openView('overview');
    return;
  }

  form.hidden=false;
  fillRegistration(account);
  setStatus($('#cyberRegistrationStatus'),accountStatusCopy(account.application_status),account.application_status==='rejected'||account.application_status==='changes_requested'?'error':'');
};

const renderOverview=()=>{
  $('#cyberOverviewName').textContent=account?.business_name||'Cyber Services';
  $('#cyberOverviewStatus').textContent=accountStatusCopy(account?.application_status);
  $('#cyberServiceCount').textContent=services.length;
  $('#cyberProductCount').textContent=products.length;
  $('#cyberOrderCount').textContent=orders.length;
  $('#cyberPendingOrderCount').textContent=orders.filter(o=>!['completed','rejected','cancelled'].includes(o.order_status)).length;
};

const fillRegistration=(row={})=>{
  $('#cyberBusinessName').value=row.business_name||'';
  $('#cyberOwnerName').value=row.owner_name||'';
  $('#cyberIdNumber').value=row.id_number||'';
  $('#cyberPhone').value=row.phone||'';
  $('#cyberTown').value=row.town||'';
  $('#cyberLocation').value=row.location_details||'';
  $('#cyberDescription').value=row.business_description||'';
  $('#cyberLatitude').value=row.shop_latitude??'';
  $('#cyberLongitude').value=row.shop_longitude??'';
  $('#cyberMapLink').value=row.shop_map_link||'';
  if(row.shop_latitude!=null&&row.shop_longitude!=null)$('#cyberPinStatus').textContent='✓ Current shop pin: '+row.shop_latitude+', '+row.shop_longitude;
  if(row.county_code){
    $('#cyberCounty').value=row.county_code;
    fillSubcounties(row.sub_county_code||'');
  }
};

const loadAccount=async()=>{
  const {data,error}=await client.rpc('cyber_provider_get_own_account');
  if(error)throw error;
  account=data||null;
  if(account?.application_status==='approved'){
    await Promise.allSettled([loadServices(),loadProducts(),loadOrders()]);
  }
  renderAccount();
};

const openCyber=async()=>{
  window.leogoSetPartnerActiveRole?.('cyber');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session?.user){
    document.body.classList.remove('cyber-role-open');
    if(authShell)authShell.hidden=false;
    shell.hidden=true;
    rolePicker.hidden=true;
    return;
  }
  user=data.session.user;
  document.body.classList.add('cyber-role-open');
  hideOtherPartnerShells();
  if(rolePicker)rolePicker.hidden=true;
  if(authShell)authShell.hidden=true;
  if(hero)hero.hidden=true;
  shell.hidden=false;
  $('#cyberBootStatus').hidden=false;
  $('#cyberOnboarding').hidden=true;
  $('#cyberRegistrationForm').hidden=true;
  $('#cyberDashboard').hidden=true;
  await fillCounties();
  try{
    await loadAccount();
  }catch(error){
    $('#cyberBootStatus').hidden=false;
    $('#cyberBootTitle').textContent='Cyber Portal needs attention';
    $('#cyberBootMessage').textContent=error.message||'Cyber account could not load.';
  }
};

const fillServiceForm=(row=null)=>{
  editServiceId=row?.id||null;
  $('#cyberServiceName').value=row?.service_name||'';
  $('#cyberServiceCategory').value=row?.service_category||'printing';
  $('#cyberServiceDescription').value=row?.description||'';
  $('#cyberServicePricing').value=row?.pricing_model||'per_page';
  $('#cyberServicePrice').value=row?.price_kes??'';
  $('#cyberServiceUnit').value=row?.unit_label||'page';
  $('#cyberServiceRequiresFile').checked=Boolean(row?.requires_file_upload);
  $('#cyberServiceMultipleFiles').checked=row?Boolean(row.accepts_multiple_files):true;
  $('#cyberServiceAvailable').checked=row?Boolean(row.is_available):true;
  $('#cyberServiceSubmit').textContent=row?'Update & Send for Approval':'Add Service & Send for Approval';
};

const renderServices=()=>{
  const list=$('#cyberServiceList');
  if(!list)return;
  list.innerHTML=services.length?services.map(s=>`
    <article class="cyber-list-card">
      <header><div><strong>${esc(s.service_name)}</strong><small>${esc(s.service_category.replaceAll('_',' '))} · ${esc(s.pricing_model.replaceAll('_',' '))}</small></div><span class="cyber-pill ${esc(s.approval_status)}">${esc(s.approval_status.replaceAll('_',' '))}</span></header>
      <p>${esc(s.description||'No description provided.')}</p>
      <div class="cyber-card-grid">
        <div><small>Price</small><strong>${s.pricing_model==='quote'?'Quotation':money(s.price_kes)+(s.unit_label?' / '+esc(s.unit_label):'')}</strong></div>
        <div><small>Customer file</small><strong>${s.requires_file_upload?'Required':'Optional'}</strong></div>
        <div><small>Availability</small><strong>${s.is_available?'Available':'Paused'}</strong></div>
      </div>
      ${s.admin_notes?'<small class="cyber-status error">Admin note: '+esc(s.admin_notes)+'</small>':''}
      <div class="cyber-card-actions"><button type="button" class="secondary" data-edit-cyber-service="${s.id}">Edit</button></div>
    </article>`).join(''):'<div class="cyber-empty">No Cyber services added yet.</div>';
  $$('[data-edit-cyber-service]').forEach(b=>b.addEventListener('click',()=>fillServiceForm(services.find(s=>s.id===b.dataset.editCyberService))));
};

const loadServices=async()=>{
  const {data,error}=await client.rpc('cyber_provider_list_services');
  if(error)throw error;
  services=data||[];
  renderServices();
  renderOverview();
};

const fillProductForm=(row=null)=>{
  editProductId=row?.id||null;
  $('#cyberProductName').value=row?.product_name||'';
  $('#cyberProductDescription').value=row?.description||'';
  $('#cyberProductPrice').value=row?.price_kes??'';
  $('#cyberProductQuantity').value=row?.quantity_available??1;
  $('#cyberProductUnit').value=row?.measurement_unit||'piece';
  $('#cyberProductAvailability').value=row?.availability_status||'available';
  $('#cyberProductSubmit').textContent=row?'Update & Send for Approval':'Add Product & Send for Approval';
};

const productImage=(p)=>p.image_path?client.storage.from('cyber-public-media').getPublicUrl(p.image_path).data.publicUrl:'';

const renderProducts=()=>{
  const list=$('#cyberProductList');
  if(!list)return;
  list.innerHTML=products.length?products.map(p=>{
    const image=productImage(p);
    return `
    <article class="cyber-list-card">
      <header><div style="display:flex;gap:9px;align-items:center"><div class="cyber-product-thumb">${image?'<img src="'+esc(image)+'" alt="">':'🛍️'}</div><div><strong>${esc(p.product_name)}</strong><small>${money(p.price_kes)} · ${esc(p.quantity_available)} ${esc(p.measurement_unit)}</small></div></div><span class="cyber-pill ${esc(p.approval_status)}">${esc(p.approval_status.replaceAll('_',' '))}</span></header>
      <p>${esc(p.description||'')}</p>
      ${p.admin_notes?'<small class="cyber-status error">Admin note: '+esc(p.admin_notes)+'</small>':''}
      <div class="cyber-card-actions"><button type="button" class="secondary" data-edit-cyber-product="${p.id}">Edit</button></div>
    </article>`;
  }).join(''):'<div class="cyber-empty">No Cyber shop items added yet.</div>';
  $$('[data-edit-cyber-product]').forEach(b=>b.addEventListener('click',()=>fillProductForm(products.find(p=>p.id===b.dataset.editCyberProduct))));
};

const loadProducts=async()=>{
  const {data,error}=await client.rpc('cyber_provider_list_products');
  if(error)throw error;
  products=data||[];
  renderProducts();
  renderOverview();
};

const signedDownload=async(path)=>{
  const {data,error}=await client.storage.from('cyber-order-files').createSignedUrl(path,600);
  if(error)throw error;
  window.open(data.signedUrl,'_blank','noopener');
};

const renderOrders=()=>{
  const list=$('#cyberPartnerOrderList');
  if(!list)return;
  list.innerHTML=orders.length?orders.map(o=>{
    const files=Array.isArray(o.files)?o.files:[];
    const canQuote=['quote_requested','quoted'].includes(o.pricing_status);
    const canWork=!['quote_requested','quoted'].includes(o.pricing_status)&&!['pending_verification','rejected'].includes(o.payment_status)&&!['completed','rejected','cancelled'].includes(o.order_status);
    const mapLink=o.delivery_map_link?'<a class="cyber-location-link" href="'+esc(o.delivery_map_link)+'" target="_blank" rel="noopener">📍 Open delivery location</a>':'';
    let actions='';
    if(canQuote)actions+='<button class="primary" type="button" data-cyber-quote="'+o.id+'">Send Quotation</button>';
    if(canWork&&o.order_status==='submitted')actions+='<button type="button" data-cyber-status="'+o.id+'" data-status="accepted">Accept</button>';
    if(canWork&&['accepted','submitted'].includes(o.order_status))actions+='<button type="button" data-cyber-status="'+o.id+'" data-status="processing">Start Processing</button>';
    if(canWork&&o.order_status==='processing'&&o.fulfilment_method==='pickup')actions+='<button class="primary" type="button" data-cyber-status="'+o.id+'" data-status="ready_for_pickup">Ready for Pickup</button>';
    if(canWork&&o.order_status==='processing'&&o.fulfilment_method==='delivery')actions+='<button class="primary" type="button" data-cyber-status="'+o.id+'" data-status="out_for_delivery">Out for Delivery</button>';
    if(canWork&&['ready_for_pickup','out_for_delivery','processing'].includes(o.order_status))actions+='<button class="primary" type="button" data-cyber-status="'+o.id+'" data-status="completed">Complete</button>';
    return `
      <article class="cyber-list-card">
        <header><div><strong>${esc(o.order_reference)} · ${esc(o.item_name)}</strong><small>${esc(o.customer_name||'Customer')} · ${esc(o.item_type)} · ${new Date(o.created_at).toLocaleString()}</small></div><span class="cyber-pill ${esc(o.order_status)}">${esc(o.order_status.replaceAll('_',' '))}</span></header>
        <div class="cyber-card-grid">
          <div><small>Quantity</small><strong>${esc(o.quantity)}</strong></div>
          <div><small>Payment</small><strong>${esc(o.payment_status.replaceAll('_',' '))}</strong></div>
          <div><small>Fulfilment</small><strong>${esc(o.fulfilment_method)}</strong></div>
          <div><small>Total</small><strong>${money(o.total_kes)}</strong></div>
          <div><small>Delivery fee</small><strong>${money(o.delivery_fee_kes)}</strong></div>
          <div><small>Quote</small><strong>${o.provider_quote_kes!=null?money(o.provider_quote_kes):esc(o.pricing_status.replaceAll('_',' '))}</strong></div>
        </div>
        ${o.delivery_address?'<p><strong>Delivery:</strong> '+esc(o.delivery_address)+(o.delivery_landmark?' · '+esc(o.delivery_landmark):'')+'</p>':''}
        ${mapLink}
        ${o.customer_notes?'<p><strong>Customer note:</strong> '+esc(o.customer_notes)+'</p>':''}
        ${files.length?'<div class="cyber-file-list">'+files.map((f,i)=>'<button type="button" data-cyber-download="'+esc(f.path)+'">📄 '+esc(f.name||('File '+(i+1)))+'</button>').join('')+'</div>':''}
        <div class="cyber-card-actions">${actions}</div>
      </article>`;
  }).join(''):'<div class="cyber-empty">No customer Cyber orders yet.</div>';

  $$('[data-cyber-download]').forEach(b=>b.addEventListener('click',()=>signedDownload(b.dataset.cyberDownload).catch(e=>alert(e.message))));
  $$('[data-cyber-quote]').forEach(b=>b.addEventListener('click',async()=>{
    const amount=Number(prompt('Enter quotation amount in KSh:',''));
    if(!Number.isFinite(amount)||amount<0)return;
    const note=prompt('Quotation note (optional):','')||'';
    const {error}=await client.rpc('cyber_provider_quote_order',{p_order_id:b.dataset.cyberQuote,p_quote_kes:amount,p_notes:note});
    if(error){alert(error.message);return;}
    await loadOrders();
  }));
  $$('[data-cyber-status]').forEach(b=>b.addEventListener('click',async()=>{
    const {error}=await client.rpc('cyber_provider_update_order_status',{p_order_id:b.dataset.cyberStatus,p_status:b.dataset.status,p_notes:null});
    if(error){alert(error.message);return;}
    await loadOrders();
  }));
};

const loadOrders=async()=>{
  const {data,error}=await client.rpc('cyber_provider_list_orders');
  if(error)throw error;
  orders=data||[];
  renderOrders();
  renderOverview();
};

const renderProfile=()=>{
  const box=$('#cyberProfileSummary');
  if(!box||!account)return;
  const rows=[
    ['Business',account.business_name],['Owner',account.owner_name],['Phone',account.phone],
    ['County',account.county],['Sub-County',account.sub_county],['Town',account.town],
    ['Shop location',account.location_details],['Coordinates',account.shop_latitude+', '+account.shop_longitude],
    ['Description',account.business_description||'—'],['Status',account.application_status]
  ];
  box.innerHTML=rows.map(([a,b])=>'<div><small>'+esc(a)+'</small><strong>'+esc(b||'—')+'</strong></div>').join('');
  const map=$('#cyberProfileMapLink');
  if(map){
    const href=account.shop_map_link||('https://www.google.com/maps?q='+account.shop_latitude+','+account.shop_longitude);
    map.href=href;
  }
};

$('#cyberCounty')?.addEventListener('change',()=>fillSubcounties());
$('#pinCyberLocation')?.addEventListener('click',()=>{
  const out=$('#cyberPinStatus');
  if(!navigator.geolocation){out.textContent='Location sharing is not supported. Paste a Google Maps link instead.';return;}
  out.textContent='Getting current shop location…';
  navigator.geolocation.getCurrentPosition(pos=>setPin(pos.coords.latitude,pos.coords.longitude),()=>{out.textContent='Location could not be detected. Paste a Google Maps link or coordinates.';},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
});
$('#readCyberMapLink')?.addEventListener('click',()=>{
  const p=parseCoordinates($('#cyberMapLink').value);
  if(!p){$('#cyberPinStatus').textContent='No valid coordinates found in that link.';return;}
  setPin(p.lat,p.lng,$('#cyberMapLink').value.trim());
});

$('#showCyberRegistration')?.addEventListener('click',async()=>{
  editApprovedProfile=false;
  $('#cyberOnboarding').hidden=true;
  $('#cyberRegistrationForm').hidden=false;
  fillRegistration(account||{});
  await fillCounties();
});
$('#cancelCyberRegistration')?.addEventListener('click',()=>{
  editApprovedProfile=false;
  if(account?.application_status==='approved'){renderAccount();}else if(account){renderAccount();}else{$('#cyberRegistrationForm').hidden=true;$('#cyberOnboarding').hidden=false;}
});
$('#editCyberProfile')?.addEventListener('click',async()=>{
  editApprovedProfile=true;
  $('#cyberDashboard').hidden=true;
  $('#cyberRegistrationForm').hidden=false;
  await fillCounties();
  fillRegistration(account);
  setStatus($('#cyberRegistrationStatus'),'Profile edits will be sent to LEOGO Admin. Your current approved profile stays active until approval.');
});

$('#cyberRegistrationForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const button=e.submitter||$('#cyberRegistrationSubmit');
  const old=button.textContent;
  button.disabled=true;button.textContent='Submitting…';
  setStatus($('#cyberRegistrationStatus'),'Preparing Cyber application…');
  try{
    const lat=Number($('#cyberLatitude').value),lng=Number($('#cyberLongitude').value);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error('Pin the exact Cyber shop location before submitting.');
    const profileFile=$('#cyberProfilePicture').files[0];
    const businessIdFile=$('#cyberBusinessIdDocument').files[0];
    const licenceFile=$('#cyberBusinessLicence').files[0];
    const registrationFile=$('#cyberRegistrationCertificate').files[0];

    const [profilePath,businessIdPath,licencePath,registrationPath]=await Promise.all([
      upload('cyber-public-media',profileFile,'profile'),
      upload('cyber-verification',businessIdFile,'business-id'),
      upload('cyber-verification',licenceFile,'licence'),
      upload('cyber-verification',registrationFile,'registration')
    ]);

    const payload={
      business_name:$('#cyberBusinessName').value.trim(),
      owner_name:$('#cyberOwnerName').value.trim(),
      id_number:$('#cyberIdNumber').value.trim(),
      phone:normalizePhone($('#cyberPhone').value),
      county_code:$('#cyberCounty').value,
      sub_county_code:$('#cyberSubCounty').value,
      town:$('#cyberTown').value.trim(),
      location_details:$('#cyberLocation').value.trim(),
      shop_latitude:lat,
      shop_longitude:lng,
      shop_map_link:$('#cyberMapLink').value.trim(),
      business_description:$('#cyberDescription').value.trim(),
      profile_picture_path:profilePath||account?.profile_picture_path||null,
      business_id_document_path:businessIdPath||account?.business_id_document_path||null,
      business_licence_path:licencePath||account?.business_licence_path||null,
      registration_certificate_path:registrationPath||account?.registration_certificate_path||null,
      other_permit_paths:account?.other_permit_paths||[]
    };
    if(!payload.business_id_document_path)throw new Error('Business ID / identification document is required.');

    if(editApprovedProfile){
      const {error}=await client.rpc('cyber_provider_submit_profile_change',{p_payload:payload});
      if(error)throw error;
      setStatus($('#cyberRegistrationStatus'),'Profile changes sent to LEOGO Admin for approval.','success');
      editApprovedProfile=false;
      $('#cyberRegistrationForm').hidden=true;
      $('#cyberDashboard').hidden=false;
      renderAccount();
    }else{
      const {error}=await client.rpc('cyber_provider_submit_application',{
        p_business_name:payload.business_name,p_owner_name:payload.owner_name,p_id_number:payload.id_number,p_phone:payload.phone,
        p_county_code:payload.county_code,p_sub_county_code:payload.sub_county_code,p_town:payload.town,p_location_details:payload.location_details,
        p_shop_latitude:payload.shop_latitude,p_shop_longitude:payload.shop_longitude,p_shop_map_link:payload.shop_map_link||null,
        p_business_description:payload.business_description||null,p_profile_picture_path:payload.profile_picture_path,
        p_business_id_document_path:payload.business_id_document_path,p_business_licence_path:payload.business_licence_path,
        p_registration_certificate_path:payload.registration_certificate_path,p_other_permit_paths:payload.other_permit_paths
      });
      if(error)throw error;
      setStatus($('#cyberRegistrationStatus'),'Cyber application submitted to LEOGO Admin.','success');
      await loadAccount();
    }
  }catch(error){
    setStatus($('#cyberRegistrationStatus'),error.message||'Cyber application could not be submitted.','error');
  }finally{button.disabled=false;button.textContent=old;}
});

$('#cyberServiceCategory')?.addEventListener('change',()=>{
  const v=$('#cyberServiceCategory').value;
  if(['printing','photocopy','typesetting'].includes(v))$('#cyberServiceRequiresFile').checked=true;
});
$('#cyberServicePricing')?.addEventListener('change',()=>{
  const quote=$('#cyberServicePricing').value==='quote';
  $('#cyberServicePrice').disabled=quote;
  if(quote)$('#cyberServicePrice').value='';
});
$('#cyberServiceForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const b=$('#cyberServiceSubmit'),old=b.textContent;b.disabled=true;b.textContent='Saving…';
  try{
    const pricing=$('#cyberServicePricing').value;
    const {error}=await client.rpc('cyber_provider_save_service',{
      p_service_id:editServiceId,p_service_name:$('#cyberServiceName').value.trim(),
      p_service_category:$('#cyberServiceCategory').value,p_description:$('#cyberServiceDescription').value.trim(),
      p_pricing_model:pricing,p_price_kes:pricing==='quote'?null:Number($('#cyberServicePrice').value),
      p_unit_label:$('#cyberServiceUnit').value.trim(),p_requires_file_upload:['printing','photocopy','typesetting'].includes($('#cyberServiceCategory').value)||$('#cyberServiceRequiresFile').checked,
      p_accepts_multiple_files:$('#cyberServiceMultipleFiles').checked,p_is_available:$('#cyberServiceAvailable').checked
    });
    if(error)throw error;
    setStatus($('#cyberServiceStatus'),'Service sent to LEOGO Admin for approval.','success');
    fillServiceForm();
    await loadServices();
  }catch(error){setStatus($('#cyberServiceStatus'),error.message,'error');}
  finally{b.disabled=false;b.textContent=old;}
});
$('#cancelCyberServiceEdit')?.addEventListener('click',()=>fillServiceForm());

$('#cyberProductForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const b=$('#cyberProductSubmit'),old=b.textContent;b.disabled=true;b.textContent='Saving…';
  try{
    const imageFile=$('#cyberProductImage').files[0];
    const imagePath=imageFile?await upload('cyber-public-media',imageFile,'product'):null;
    const existing=products.find(p=>p.id===editProductId);
    const {error}=await client.rpc('cyber_provider_save_product',{
      p_product_id:editProductId,p_product_name:$('#cyberProductName').value.trim(),
      p_description:$('#cyberProductDescription').value.trim(),p_price_kes:Number($('#cyberProductPrice').value),
      p_quantity_available:Number($('#cyberProductQuantity').value),p_measurement_unit:$('#cyberProductUnit').value.trim(),
      p_image_path:imagePath||existing?.image_path||null,p_availability_status:$('#cyberProductAvailability').value
    });
    if(error)throw error;
    setStatus($('#cyberProductStatus'),'Product sent to LEOGO Admin for approval.','success');
    fillProductForm();
    $('#cyberProductImage').value='';
    await loadProducts();
  }catch(error){setStatus($('#cyberProductStatus'),error.message,'error');}
  finally{b.disabled=false;b.textContent=old;}
});
$('#cancelCyberProductEdit')?.addEventListener('click',()=>fillProductForm());

$$('[data-cyber-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.cyberView)));
$('#backFromCyberPortal')?.addEventListener('click',showRolePicker);
$('#refreshCyberOrders')?.addEventListener('click',()=>loadOrders().catch(e=>alert(e.message)));
$('#refreshCyberServices')?.addEventListener('click',()=>loadServices().catch(e=>alert(e.message)));
$('#refreshCyberProducts')?.addEventListener('click',()=>loadProducts().catch(e=>alert(e.message)));

const cyberRoleButton=$('[data-role-target="cyber"]');
if(cyberRoleButton){
  cyberRoleButton.disabled=false;
  cyberRoleButton.querySelector('small').textContent='Printing, online services, files & shop items';
  cyberRoleButton.addEventListener('click',(e)=>{e.preventDefault();openCyber();});
}
$$('[data-role-target]').filter(b=>b.dataset.roleTarget!=='cyber').forEach(b=>b.addEventListener('click',()=>{shell.hidden=true;}));

window.leogoOpenCyberPartner=openCyber;
})();

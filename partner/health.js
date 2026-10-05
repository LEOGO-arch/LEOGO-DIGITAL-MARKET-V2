// LEOGO DIGITAL MARKET — Health & Medicine Partner V1
// Separate regulated partner workflow. Does not reuse Seller product tables.
(() => {
  'use strict';

  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const client=window.leogoPartnerClient;
  const shell=$('#healthMedicineShell');
  if(!client||!shell)return;

  let account=null;
  let products=[];
  let orders=[];
  let notifications=[];
  let counties=[];
  let subcounties=[];
  let activeView='overview';

  const escapeHtml=(value='')=>String(value??'').replace(/[&<>'"]/g,(character)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
  const status=(element,message='',type='')=>{
    if(!element)return;
    element.textContent=message;
    element.classList.toggle('success',type==='success');
    element.classList.toggle('error',type==='error');
  };
  const typeLabel=(value)=>({
    pharmacy:'Pharmacy / Pharmaceuticals',
    optics:'Optics / Optical',
    medical_supplies:'Medical Equipment & Supplies',
    orthopaedic_rehab:'Orthopaedic & Rehabilitation',
    laboratory_diagnostics:'Laboratory / Diagnostics',
    health_specialist:'Health Specialist / Doctor',
    other_health:'Other Health & Medicine'
  }[value]||String(value||'').replaceAll('_',' '));
  const productKindLabel=(value)=>({
    pharmaceutical:'Pharmaceutical',
    optical:'Optical',
    medical_supply:'Medical Supply',
    orthopaedic_rehab:'Orthopaedic / Rehabilitation',
    diagnostic_lab:'Laboratory / Diagnostic',
    other_health:'Other Health Item'
  }[value]||String(value||'').replaceAll('_',' '));
  const classificationLabel=(value)=>({
    non_medicine:'Non-medicine',
    otc:'OTC — No prescription required',
    prescription_required:'Prescription Required'
  }[value]||String(value||'').replaceAll('_',' '));
  const normalisePhone=(value)=>{
    const digits=String(value||'').replace(/\D/g,'');
    if(/^0[17]\d{8}$/.test(digits))return '+254'+digits.slice(1);
    if(/^254[17]\d{8}$/.test(digits))return '+'+digits;
    if(/^[17]\d{8}$/.test(digits))return '+254'+digits;
    return String(value||'').trim();
  };
  const publicMedia=(path)=>path?client.storage.from('health-medicine-public-media').getPublicUrl(path).data?.publicUrl||'':'';
  const currentUser=()=>window.leogoPartnerCurrentUser?.()||null;

  const showOnlyHealthShell=()=>{
    ['sellerShell','providerShell','transportShell','premiumShell','accommodationShell','cyberShell'].forEach((id)=>{
      const node=document.getElementById(id); if(node)node.hidden=true;
    });
    const auth=document.getElementById('partnerAuthShell'); if(auth)auth.hidden=true;
    const picker=document.getElementById('partnerRolePicker'); if(picker)picker.hidden=true;
    const hero=document.querySelector('.hero'); if(hero)hero.hidden=true;
    shell.hidden=false;
    window.leogoSetPartnerActiveRole?.('health_medicine');
  };
  const returnToPartnerships=()=>{
    shell.hidden=true;
    const picker=document.getElementById('partnerRolePicker'); if(picker)picker.hidden=false;
    const hero=document.querySelector('.hero'); if(hero)hero.hidden=false;
    window.leogoSetPartnerActiveRole?.('');
  };

  const loadLocationDirectory=async()=>{
    if(counties.length)return;
    const [c,s]=await Promise.all([
      client.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    if(c.error||s.error)throw c.error||s.error;
    counties=c.data||[];subcounties=s.data||[];
    const county=$('#healthCounty');
    if(county)county.innerHTML='<option value="">Select county</option>'+counties.map((row)=>'<option value="'+escapeHtml(row.code)+'">'+escapeHtml(row.name)+'</option>').join('');
  };
  const renderSubcounties=(preferred='')=>{
    const county=$('#healthCounty'),sub=$('#healthSubCounty');
    if(!county||!sub)return;
    const rows=subcounties.filter((row)=>row.county_code===county.value);
    sub.disabled=!county.value;
    sub.innerHTML=county.value
      ? '<option value="">Select sub-county</option>'+rows.map((row)=>'<option value="'+escapeHtml(row.code)+'">'+escapeHtml(row.name)+'</option>').join('')
      : '<option value="">Choose a county first</option>';
    if(preferred&&rows.some((row)=>row.code===preferred))sub.value=preferred;
  };

  const updateBusinessTypeFields=()=>{
    const value=$('#healthBusinessType')?.value||'';
    const otherLabel=$('#healthOtherBusinessTypeLabel');
    if(otherLabel)otherLabel.hidden=value!=='other_health';
    const other=$('#healthOtherBusinessType');
    if(other)other.required=value==='other_health';
    const regulatory=$('#healthRegulatoryLicence');
    if(regulatory)regulatory.required=['pharmacy','health_specialist'].includes(value)&&!account?.regulatory_licence_path;
    const professional=$('#healthProfessionalCertificate');
    if(professional)professional.required=value==='health_specialist'&&!account?.professional_certificate_path;
    const help=$('#healthRegulatoryLicenceHelp');
    if(help)help.textContent=value==='pharmacy'
      ?'Required for Pharmacy / pharmaceuticals'
      : value==='health_specialist'
        ?'Required: current professional / regulatory licence for the Health Specialist'
        :'Upload the relevant regulator / professional licence when applicable';
  };

  const uploadFile=async(file,bucket,prefix,max=8388608)=>{
    if(!file)return '';
    if(file.size>max)throw new Error('Each uploaded file must be 8 MB or smaller.');
    const user=currentUser();
    if(!user)throw new Error('Sign in required');
    const ext=(file.name.split('.').pop()||'file').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path=user.id+'/'+prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.'+ext;
    const {error}=await client.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
    if(error)throw error;
    return path;
  };

  const healthCoordinatesFromText=(value='')=>{
    const text=String(value||'').trim();
    const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
    const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
    return maps?{lat:Number(maps[1]),lng:Number(maps[2])}:null;
  };
  const setHealthCoordinates=(lat,lng,label='Business location pinned')=>{
    const latitude=Number(lat),longitude=Number(lng);
    const target=$('#healthPinStatus');
    if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
      status(target,'Invalid business coordinates. Pin the location again or enter valid coordinates.','error');
      return false;
    }
    $('#healthLatitude').value=latitude.toFixed(7);
    $('#healthLongitude').value=longitude.toFixed(7);
    if(!$('#healthMapLink').value.trim())$('#healthMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
    status(target,'✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7),'success');
    return true;
  };
  $('#pinHealthLocation')?.addEventListener('click',()=>{
    const target=$('#healthPinStatus');
    if(!navigator.geolocation){
      status(target,'This browser cannot access location. Paste a Google Maps link or enter coordinates instead.','error');
      return;
    }
    status(target,'Getting the Health & Medicine business location…');
    navigator.geolocation.getCurrentPosition(
      position=>setHealthCoordinates(position.coords.latitude,position.coords.longitude,'Business location pinned'),
      error=>status(
        target,
        error.code===1
          ? 'Location permission was not granted. Allow location access while at the business, or paste a Maps link/coordinates.'
          : 'The business location could not be detected. Try again or paste a Maps link/coordinates.',
        'error'
      ),
      {enableHighAccuracy:true,timeout:15000,maximumAge:15000}
    );
  });
  $('#healthMapLink')?.addEventListener('change',event=>{
    const coords=healthCoordinatesFromText(event.currentTarget.value);
    if(coords)setHealthCoordinates(coords.lat,coords.lng,'Coordinates detected from shared location');
  });
  ['healthLatitude','healthLongitude'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{
    const lat=$('#healthLatitude').value,lng=$('#healthLongitude').value;
    if(lat!==''&&lng!=='')setHealthCoordinates(lat,lng,'Coordinates confirmed');
  }));

  const fillRegistrationFromAccount=async()=>{
    if(!account)return;
    await loadLocationDirectory();
    $('#healthBusinessName').value=account.business_name||'';
    $('#healthOwnerName').value=account.owner_name||'';
    $('#healthIdNumber').value=account.id_number||'';
    $('#healthPhone').value=account.phone||'';
    $('#healthBusinessType').value=account.business_type||'';
    $('#healthOtherBusinessType').value=account.other_business_type||'';
    $('#healthCounty').value=account.county_code||'';
    renderSubcounties(account.sub_county_code||'');
    $('#healthTown').value=account.town||'';
    $('#healthLocationDetails').value=account.location_details||'';
    $('#healthLatitude').value=account.shop_latitude??'';
    $('#healthLongitude').value=account.shop_longitude??'';
    $('#healthMapLink').value=account.shop_map_link||'';
    if(account.shop_latitude!=null&&account.shop_longitude!=null){
      status($('#healthPinStatus'),'✓ Saved business pin: '+Number(account.shop_latitude).toFixed(7)+', '+Number(account.shop_longitude).toFixed(7),'success');
    }else{
      status($('#healthPinStatus'),'Business location not pinned yet.');
    }
    $('#healthBusinessDescription').value=account.business_description||'';
    $('#healthBusinessIdDocument').required=!account.business_id_document_path;
    updateBusinessTypeFields();
  };

  const showRegistration=async()=>{
    await loadLocationDirectory();
    await fillRegistrationFromAccount();
    $('#healthMedicineOnboarding').hidden=true;
    $('#healthMedicinePending').hidden=true;
    $('#healthMedicineDashboard').hidden=true;
    $('#healthMedicineRegistrationForm').hidden=false;
  };

  const renderPending=()=>{
    $('#healthMedicineOnboarding').hidden=true;
    $('#healthMedicineRegistrationForm').hidden=true;
    $('#healthMedicineDashboard').hidden=true;
    const pending=$('#healthMedicinePending');
    pending.hidden=false;
    const label=typeLabel(account?.business_type);
    $('#healthMedicinePendingTitle').textContent=account?.application_status==='changes_requested'?'Corrections requested':'Health & Medicine application '+String(account?.application_status||'submitted').replaceAll('_',' ');
    $('#healthMedicinePendingMessage').textContent=account?.application_status==='changes_requested'
      ? 'Review the Admin note, correct the application and resubmit it.'
      : 'LEOGO Admin is reviewing your '+label+' registration and verification documents.';
    $('#healthMedicineApplicationSummary').innerHTML=[
      ['Business',account?.business_name],['Type',label],['Location',[account?.town,account?.sub_county,account?.county].filter(Boolean).join(' · ')],
      ['Status',String(account?.application_status||'').replaceAll('_',' ')]
    ].map(([key,value])=>'<div><small>'+escapeHtml(key)+'</small><strong>'+escapeHtml(value||'—')+'</strong></div>').join('');
    const note=$('#healthMedicineAdminNote');
    if(note){
      note.hidden=!account?.admin_notes;
      note.textContent=account?.admin_notes?'Admin note: '+account.admin_notes:'';
    }
    $('#editHealthMedicineApplication').hidden=!['changes_requested','rejected'].includes(account?.application_status);
  };

  const productKindOptions=()=>{
    const allowed={
      pharmacy:[['pharmaceutical','Pharmaceutical'],['medical_supply','Medical Supply'],['other_health','Other Approved Pharmacy Item']],
      optics:[['optical','Optical'],['medical_supply','Related Medical Supply']],
      medical_supplies:[['medical_supply','Medical Supply']],
      orthopaedic_rehab:[['orthopaedic_rehab','Orthopaedic / Rehabilitation'],['medical_supply','Related Medical Supply']],
      laboratory_diagnostics:[['diagnostic_lab','Laboratory / Diagnostic'],['medical_supply','Related Medical Supply']],
      other_health:[['other_health','Other Health Item']]
    }[account?.business_type]||[];
    const select=$('#healthMedicineProductKind');
    if(select)select.innerHTML='<option value="">Choose product type</option>'+allowed.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');
  };
  const updateProductClassification=()=>{
    const pharma=$('#healthMedicineProductKind')?.value==='pharmaceutical';
    const label=$('#healthMedicineClassificationLabel');
    if(label)label.hidden=!pharma;
    const select=$('#healthMedicineClassification');
    if(select)select.required=pharma;
    const note=$('#healthPrescriptionNote');
    if(note)note.hidden=!pharma||select?.value!=='prescription_required';
  };
  const resetProductForm=()=>{
    const form=$('#healthMedicineProductForm');
    form?.reset();
    $('#healthMedicineProductId').value='';
    $('#healthMedicineExistingImagePath').value='';
    $('#healthMedicineUnit').value='piece';
    productKindOptions();
    updateProductClassification();
    status($('#healthMedicineProductStatus'));
  };

  const renderProducts=()=>{
    $('#healthMedicineProductCount').textContent=String(products.length);
    const approved=products.filter((row)=>row.approval_status==='approved').length;
    $('#healthMedicineApprovedCount').textContent=String(approved);
    const badge=$('#healthMedicineProductBadge');
    const waiting=products.filter((row)=>['pending','under_review','changes_requested'].includes(row.approval_status)).length;
    if(badge){badge.hidden=!waiting;badge.textContent=String(waiting);}
    const target=$('#healthMedicineProductList');
    if(!target)return;
    if(!products.length){
      target.innerHTML='<div class="empty-card">No Health & Medicine products submitted yet.</div>';
      return;
    }
    target.innerHTML=products.map((row)=>{
      const image=publicMedia(row.image_path);
      const classification=row.product_kind==='pharmaceutical'?classificationLabel(row.medicine_classification):productKindLabel(row.product_kind);
      return '<article class="health-product-card">'+
        '<div class="health-product-card-photo">'+(image?'<img src="'+escapeHtml(image)+'" alt="'+escapeHtml(row.product_name)+'">':'⚕️')+'</div>'+
        '<div class="health-product-card-copy"><span>'+escapeHtml(productKindLabel(row.product_kind))+'</span><strong>'+escapeHtml(row.product_name)+'</strong>'+
          '<small>'+escapeHtml(classification)+' · '+escapeHtml(String(row.availability_status||'').replaceAll('_',' '))+' · '+(row.order_mode==='cart'?'Cart checkout':'Enquiry only')+'</small>'+
          (row.requires_prescription?'<em>Prescription required</em>':'')+
          (row.admin_notes?'<small>Admin note: '+escapeHtml(row.admin_notes)+'</small>':'')+
        '</div>'+
        '<div class="health-product-card-actions"><b>KSh '+Number(row.price_kes||0).toLocaleString('en-KE')+'</b><span class="status-chip '+escapeHtml(row.approval_status)+'">'+escapeHtml(String(row.approval_status||'').replaceAll('_',' '))+'</span>'+
          (row.approval_status==='under_review'
            ? '<button type="button" class="secondary" disabled>Locked while under review</button>'
            : '<button type="button" data-edit-health-product="'+escapeHtml(row.id)+'">Edit & Resubmit</button>')+
        '</div>'+
      '</article>';
    }).join('');
    $$('[data-edit-health-product]',target).forEach((button)=>button.addEventListener('click',()=>{
      const row=products.find((item)=>String(item.id)===String(button.dataset.editHealthProduct));
      if(!row)return;
      openHealthView('products');
      $('#healthMedicineProductId').value=row.id;
      $('#healthMedicineExistingImagePath').value=row.image_path||'';
      $('#healthMedicineProductName').value=row.product_name||'';
      $('#healthMedicineProductKind').value=row.product_kind||'';
      updateProductClassification();
      $('#healthMedicineClassification').value=row.medicine_classification==='prescription_required'?'prescription_required':'otc';
      $('#healthMedicineBrand').value=row.brand||'';
      $('#healthMedicinePrice').value=row.price_kes??'';
      $('#healthMedicineQuantity').value=row.quantity_available??'';
      $('#healthMedicineUnit').value=row.measurement_unit||'piece';
      $('#healthMedicineAvailability').value=row.availability_status||'available';
      $('#healthMedicineProductDescription').value=row.description||'';
      updateProductClassification();
      $('#healthMedicineProductForm')?.scrollIntoView({behavior:'smooth',block:'start'});
    }));
  };

  const orderStatusLabel=(value)=>({
    placed:'Placed',
    accepted:'Accepted',
    preparing:'Preparing',
    ready_for_handover:'Ready for LEOGO',
    handed_to_leogo:'Handed to LEOGO',
    delivered:'Delivered',
    cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));
  const paymentStatusLabel=(value)=>({
    submitted:'Awaiting Admin verification',
    verified_paid:'Payment verified',
    cod_due:'Cash on Delivery',
    cod_paid:'COD paid',
    rejected:'Payment rejected'
  }[value]||String(value||'').replaceAll('_',' '));
  const orderNextAction=(row)=>{
    if(row.order_status==='placed')return ['accepted','Accept Order'];
    if(row.order_status==='accepted')return ['preparing','Start Preparing'];
    if(row.order_status==='preparing')return ['ready_for_handover','Ready for LEOGO'];
    if(row.order_status==='ready_for_handover')return ['handed_to_leogo','Handed to LEOGO'];
    return null;
  };
  const renderOrders=()=>{
    const active=orders.filter((row)=>!['delivered','cancelled'].includes(row.order_status)).length;
    if($('#healthMedicineActiveOrders'))$('#healthMedicineActiveOrders').textContent=String(active);
    const badge=$('#healthMedicineOrderBadge');
    const needsAction=orders.filter((row)=>row.order_status==='placed'&&['verified_paid','cod_due','cod_paid'].includes(row.payment_status)).length;
    if(badge){badge.hidden=!needsAction;badge.textContent=String(needsAction);}
    const target=$('#healthMedicineOrderList');
    if(!target)return;
    if(!orders.length){
      target.innerHTML='<div class="empty-card">No Health & Medicine orders yet.</div>';
      return;
    }
    target.innerHTML=orders.map((row)=>{
      const items=Array.isArray(row.items)?row.items:[];
      const next=orderNextAction(row);
      const canProgress=['verified_paid','cod_due','cod_paid'].includes(row.payment_status);
      return '<article class="health-order-card" data-health-order-id="'+escapeHtml(row.id)+'">'+
        '<header><div><span>'+escapeHtml(row.order_reference)+'</span><strong>'+escapeHtml(orderStatusLabel(row.order_status))+'</strong><small>'+escapeHtml(new Date(row.created_at).toLocaleString('en-KE'))+'</small></div><b>KSh '+Number(row.grand_total_kes||0).toLocaleString('en-KE')+'</b></header>'+
        '<div class="health-order-meta"><span><small>Payment</small><strong>'+escapeHtml(paymentStatusLabel(row.payment_status))+'</strong></span><span><small>Delivery</small><strong>'+escapeHtml(String(row.delivery_zone||'').replaceAll('_',' '))+'</strong></span><span><small>Customer</small><strong>'+escapeHtml(row.receiver_name||'Customer')+'</strong></span><span><small>Phone</small><strong>'+escapeHtml(row.contact_number||'')+'</strong></span></div>'+
        '<div class="health-order-items">'+items.map((item)=>'<span><strong>'+escapeHtml(item.product_name)+'</strong><small>'+Number(item.quantity)+' × KSh '+Number(item.unit_price_kes||0).toLocaleString('en-KE')+'</small></span>').join('')+'</div>'+
        (!canProgress&&row.payment_status==='submitted'?'<div class="restricted-notice">Wait for LEOGO Admin to verify payment before preparing this order.</div>':'')+
        (next&&canProgress?'<div class="product-actions"><button type="button" data-health-order-status="'+escapeHtml(next[0])+'" data-health-order-id="'+escapeHtml(row.id)+'">'+escapeHtml(next[1])+'</button></div>':'')+
      '</article>';
    }).join('');
    $('[data-health-order-status]',target).forEach((button)=>button.addEventListener('click',async()=>{
      const id=button.dataset.healthOrderId,statusValue=button.dataset.healthOrderStatus;
      const original=button.textContent;button.disabled=true;button.textContent='Saving…';
      try{
        const {error}=await client.rpc('health_medicine_update_order_status',{p_order_id:id,p_status:statusValue});
        if(error)throw error;
        status($('#healthMedicineOrderStatus'),'Order updated successfully.','success');
        await Promise.all([loadOrders(),loadNotifications()]);
      }catch(error){
        status($('#healthMedicineOrderStatus'),error?.message||'Order could not be updated.','error');
      }finally{
        button.disabled=false;button.textContent=original;
      }
    }));
  };
  async function loadOrders(){
    const {data,error}=await client.rpc('health_medicine_list_own_orders');
    if(error)throw error;
    orders=Array.isArray(data)?data:[];
    renderOrders();
  }

  const renderNotifications=()=>{
    const unread=notifications.filter((row)=>!row.read_at).length;
    const badge=$('#healthMedicineNotificationBadge');
    if(badge){badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);}
    const target=$('#healthMedicineNotificationList');
    if(!target)return;
    target.innerHTML=notifications.length?notifications.map((row)=>
      '<article class="seller-notification-item '+(row.read_at?'':'unread')+'"><div><strong>'+escapeHtml(row.title)+'</strong><p>'+escapeHtml(row.message)+'</p><small>'+escapeHtml(new Date(row.created_at).toLocaleString('en-KE'))+'</small></div></article>'
    ).join(''):'<div class="empty-card">No Health & Medicine notifications yet.</div>';
  };

  const loadNotifications=async()=>{
    const user=currentUser();if(!user)return;
    const {data,error}=await client.from('partner_notifications').select('*').eq('user_id',user.id).eq('partner_type','health_medicine').order('created_at',{ascending:false}).limit(80);
    if(error)throw error;
    notifications=data||[];
    renderNotifications();
  };
  const loadProducts=async()=>{
    const {data,error}=await client.rpc('health_medicine_list_own_products');
    if(error)throw error;
    products=Array.isArray(data)?data:[];
    renderProducts();
  };

  const renderApprovedDashboard=async()=>{
    $('#healthMedicineOnboarding').hidden=true;
    $('#healthMedicineRegistrationForm').hidden=true;
    $('#healthMedicinePending').hidden=true;
    $('#healthMedicineDashboard').hidden=false;
    $('#healthMedicineSidebarBusiness').textContent=account.business_name||'Health & Medicine';
    $('#healthMedicineSidebarStatus').textContent=String(account.application_status||'approved').toUpperCase();
    $('#healthMedicineDashboardName').textContent=account.business_name||'Health & Medicine';
    $('#healthMedicineBusinessTypeCard').textContent=typeLabel(account.business_type);
    $('#healthMedicineAccountStatus').textContent='Approved';
    productKindOptions();
    document.dispatchEvent(new CustomEvent('leogo:health-account-ready',{detail:{
      businessType:account.business_type,
      applicationStatus:account.application_status,
      businessName:account.business_name
    }}));
    await Promise.allSettled([loadProducts(),loadOrders(),loadNotifications()]);
    openHealthView(activeView);
  };

  const loadAccount=async()=>{
    const {data,error}=await client.rpc('health_medicine_get_own_account');
    if(error)throw error;
    account=data||null;
    if(!account){
      $('#healthMedicineRegistrationForm').hidden=true;
      $('#healthMedicinePending').hidden=true;
      $('#healthMedicineDashboard').hidden=true;
      $('#healthMedicineOnboarding').hidden=false;
      return;
    }
    if(account.application_status==='approved')await renderApprovedDashboard();
    else renderPending();
  };

  async function openHealthRole(){
    showOnlyHealthShell();
    status($('#healthMedicineRegistrationStatus'),'Loading Health & Medicine account…');
    const {data}=await client.auth.getSession();
    if(!data?.session?.user){
      shell.hidden=true;
      const auth=document.getElementById('partnerAuthShell');if(auth)auth.hidden=false;
      const hero=document.querySelector('.hero');if(hero)hero.hidden=false;
      return;
    }
    await loadAccount();
    status($('#healthMedicineRegistrationStatus'));
  }
  window.leogoOpenHealthMedicinePartner=openHealthRole;

  function openHealthView(view='overview'){
    activeView=['overview','products','orders','services','bookings','notifications'].includes(view)?view:'overview';
    $$('[data-health-view]',shell).forEach((button)=>button.classList.toggle('active',button.dataset.healthView===activeView));
    $$('[data-health-content]',shell).forEach((panel)=>panel.classList.toggle('active',panel.dataset.healthContent===activeView));
    $('#healthMedicineViewDescription').textContent={
      overview:'Approved Health & Medicine partner overview.',
      products:'Manage Health products and Admin approval status.',
      orders:'Receive and prepare approved OTC / non-prescription Health orders.',
      services:'Manage Health Specialist services and Admin approval status.',
      bookings:'Receive and respond to verified Health Specialist service bookings.',
      notifications:'Application, product, service and booking approval notifications.'
    }[activeView];
    $('#healthMedicineSidebar')?.classList.remove('open');
    document.body.classList.remove('seller-menu-open');
    if(activeView==='orders')loadOrders().catch(()=>{});
    if(activeView==='notifications')loadNotifications().catch(()=>{});
  }

  $('#showHealthMedicineRegistration')?.addEventListener('click',()=>showRegistration().catch((error)=>status($('#healthMedicineRegistrationStatus'),error.message,'error')));
  $('#cancelHealthMedicineRegistration')?.addEventListener('click',()=>account?renderPending():returnToPartnerships());
  $('#healthMedicinePendingBack')?.addEventListener('click',returnToPartnerships);
  $('#healthMedicineBackToPartnerships')?.addEventListener('click',returnToPartnerships);
  $('#editHealthMedicineApplication')?.addEventListener('click',()=>showRegistration().catch((error)=>status($('#healthMedicineRegistrationStatus'),error.message,'error')));
  $('#healthCounty')?.addEventListener('change',()=>renderSubcounties());
  $('#healthBusinessType')?.addEventListener('change',updateBusinessTypeFields);
  $('#healthMedicineProductKind')?.addEventListener('change',updateProductClassification);
  $('#healthMedicineClassification')?.addEventListener('change',updateProductClassification);
  $('#resetHealthMedicineProduct')?.addEventListener('click',resetProductForm);
  $('#healthMedicineRefresh')?.addEventListener('click',()=>loadAccount().catch((error)=>console.warn(error)));
  $$('[data-health-view]',shell).forEach((button)=>button.addEventListener('click',()=>openHealthView(button.dataset.healthView)));

  $('#healthMedicineSidebarToggle')?.addEventListener('click',()=>{
    $('#healthMedicineSidebar')?.classList.add('open');
    document.body.classList.add('seller-menu-open');
  });
  $('#healthMedicineSidebarScrim')?.addEventListener('click',()=>{
    $('#healthMedicineSidebar')?.classList.remove('open');
    document.body.classList.remove('seller-menu-open');
  });

  $('#healthMedicineRegistrationForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const button=event.submitter;
    const original=button?.textContent||'Submit';
    if(button){button.disabled=true;button.textContent='Uploading & submitting…';}
    status($('#healthMedicineRegistrationStatus'),'Preparing private verification documents…');
    try{
      const phone=normalisePhone($('#healthPhone').value);
      if(!/^\+254[17]\d{8}$/.test(phone))throw new Error('Enter a valid Kenyan phone number.');
      const businessType=$('#healthBusinessType').value;
      const profileFile=$('#healthProfilePicture').files?.[0]||null;
      const businessIdFile=$('#healthBusinessIdDocument').files?.[0]||null;
      const businessLicenceFile=$('#healthBusinessLicence').files?.[0]||null;
      const regulatoryFile=$('#healthRegulatoryLicence').files?.[0]||null;
      const professionalFile=$('#healthProfessionalCertificate').files?.[0]||null;
      const registrationFile=$('#healthRegistrationCertificate').files?.[0]||null;
      const permitFiles=Array.from($('#healthOtherPermits').files||[]).slice(0,5);
      if(!businessIdFile&&!account?.business_id_document_path)throw new Error('Business ID / identification document is required.');
      if(businessType==='pharmacy'&&!regulatoryFile&&!account?.regulatory_licence_path)throw new Error('Pharmacy / pharmaceuticals requires a regulatory licence document.');
      if(businessType==='health_specialist'&&!regulatoryFile&&!account?.regulatory_licence_path)throw new Error('Health Specialist / Doctor requires a current professional / regulatory licence.');
      if(businessType==='health_specialist'&&!professionalFile&&!account?.professional_certificate_path)throw new Error('Health Specialist / Doctor requires a professional qualification certificate.');

      const [
        profilePath,businessIdPath,businessLicencePath,regulatoryPath,professionalPath,registrationPath,permitPaths
      ]=await Promise.all([
        profileFile?uploadFile(profileFile,'health-medicine-public-media','profile'):Promise.resolve(account?.profile_picture_path||''),
        businessIdFile?uploadFile(businessIdFile,'health-medicine-verification','business-id'):Promise.resolve(account?.business_id_document_path||''),
        businessLicenceFile?uploadFile(businessLicenceFile,'health-medicine-verification','business-licence'):Promise.resolve(account?.business_licence_path||''),
        regulatoryFile?uploadFile(regulatoryFile,'health-medicine-verification','regulatory-licence'):Promise.resolve(account?.regulatory_licence_path||''),
        professionalFile?uploadFile(professionalFile,'health-medicine-verification','professional-certificate'):Promise.resolve(account?.professional_certificate_path||''),
        registrationFile?uploadFile(registrationFile,'health-medicine-verification','registration-certificate'):Promise.resolve(account?.registration_certificate_path||''),
        Promise.all(permitFiles.map((file,index)=>uploadFile(file,'health-medicine-verification','permit-'+(index+1)))).then((fresh)=>fresh.length?fresh:(account?.other_permit_paths||[]))
      ]);

      const healthLat=$('#healthLatitude').value.trim();
      const healthLng=$('#healthLongitude').value.trim();
      if((healthLat&&!healthLng)||(!healthLat&&healthLng))throw new Error('Enter both latitude and longitude, or clear both fields.');
      if(healthLat&&healthLng&&!setHealthCoordinates(healthLat,healthLng,'Coordinates confirmed'))throw new Error('Enter valid business coordinates.');

      const {data,error}=await client.rpc('health_medicine_submit_application',{
        p_business_name:$('#healthBusinessName').value.trim(),
        p_owner_name:$('#healthOwnerName').value.trim(),
        p_id_number:$('#healthIdNumber').value.trim(),
        p_phone:phone,
        p_business_type:businessType,
        p_other_business_type:$('#healthOtherBusinessType').value.trim()||null,
        p_county_code:$('#healthCounty').value,
        p_sub_county_code:$('#healthSubCounty').value,
        p_town:$('#healthTown').value.trim(),
        p_location_details:$('#healthLocationDetails').value.trim(),
        p_shop_latitude:$('#healthLatitude').value?Number($('#healthLatitude').value):null,
        p_shop_longitude:$('#healthLongitude').value?Number($('#healthLongitude').value):null,
        p_shop_map_link:$('#healthMapLink').value.trim()||null,
        p_business_description:$('#healthBusinessDescription').value.trim()||null,
        p_profile_picture_path:profilePath||null,
        p_business_id_document_path:businessIdPath,
        p_business_licence_path:businessLicencePath||null,
        p_regulatory_licence_path:regulatoryPath||null,
        p_professional_certificate_path:professionalPath||null,
        p_registration_certificate_path:registrationPath||null,
        p_other_permit_paths:permitPaths
      });
      if(error)throw error;
      account=data||account;
      form.reset();
      status($('#healthMedicineRegistrationStatus'),'Health & Medicine application submitted to LEOGO Admin.','success');
      await loadAccount();
    }catch(error){
      status($('#healthMedicineRegistrationStatus'),error?.message||'Application could not be submitted.','error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  $('#healthMedicineProductForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;if(!form.reportValidity())return;
    const button=event.submitter;
    const original=button?.textContent||'Save & Send to Admin';
    if(button){button.disabled=true;button.textContent='Saving…';}
    status($('#healthMedicineProductStatus'),'Preparing Health product…');
    try{
      const imageFile=$('#healthMedicineProductImage').files?.[0]||null;
      const existing=$('#healthMedicineExistingImagePath').value;
      if(!imageFile&&!existing)throw new Error('Add a product image.');
      const imagePath=imageFile?await uploadFile(imageFile,'health-medicine-public-media','product'):existing;
      const kind=$('#healthMedicineProductKind').value;
      const classification=kind==='pharmaceutical'?$('#healthMedicineClassification').value:'non_medicine';
      const {error}=await client.rpc('health_medicine_save_product',{
        p_product_id:$('#healthMedicineProductId').value||null,
        p_product_name:$('#healthMedicineProductName').value.trim(),
        p_product_kind:kind,
        p_medicine_classification:classification,
        p_brand:$('#healthMedicineBrand').value.trim()||null,
        p_description:$('#healthMedicineProductDescription').value.trim()||null,
        p_price_kes:Number($('#healthMedicinePrice').value),
        p_quantity_available:Number($('#healthMedicineQuantity').value),
        p_measurement_unit:$('#healthMedicineUnit').value.trim(),
        p_image_path:imagePath,
        p_availability_status:$('#healthMedicineAvailability').value
      });
      if(error)throw error;
      resetProductForm();
      status($('#healthMedicineProductStatus'),'Health & Medicine product saved and sent to LEOGO Admin for approval.','success');
      await loadProducts();
    }catch(error){
      status($('#healthMedicineProductStatus'),error?.message||'Product could not be saved.','error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  $('#markAllHealthMedicineNotificationsRead')?.addEventListener('click',async()=>{
    const {error}=await client.rpc('mark_all_partner_notifications_read',{p_partner_type:'health_medicine'});
    if(!error)await loadNotifications();
  });
})();

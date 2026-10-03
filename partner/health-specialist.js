// LEOGO DIGITAL MARKET — Health Specialist / Doctor services + bookings V1
// Additive extension of the existing Health & Medicine Partner module.
(() => {
  'use strict';
  const client=window.leogoPartnerClient;
  const shell=document.getElementById('healthMedicineShell');
  if(!client||!shell)return;

  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const esc=(value='')=>String(value??'').replace(/[&<>'"]/g,(ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const fmt=(value)=>value?new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}):'—';
  const status=(element,message='',type='')=>{
    if(!element)return;
    element.textContent=message;
    element.classList.toggle('success',type==='success');
    element.classList.toggle('error',type==='error');
  };
  const publicMedia=(path)=>path?client.storage.from('health-medicine-public-media').getPublicUrl(path).data?.publicUrl||'':'';
  const currentUser=()=>window.leogoPartnerCurrentUser?.()||null;

  let account=null;
  let services=[];
  let bookings=[];

  const specialistMode=()=>account?.application_status==='approved'&&account?.business_type==='health_specialist';

  const uploadServiceImage=async(file)=>{
    if(!file)return '';
    if(file.size>8388608)throw new Error('Service image must be 8 MB or smaller.');
    const user=currentUser();
    if(!user)throw new Error('Sign in required.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path=user.id+'/health-service-'+Date.now()+'-'+crypto.randomUUID()+'.'+ext;
    const {error}=await client.storage.from('health-medicine-public-media').upload(path,file,{
      upsert:false,contentType:file.type||undefined,cacheControl:'3600'
    });
    if(error)throw error;
    return path;
  };

  const configureShell=()=>{
    const enabled=specialistMode();
    const productNav=$('#healthMedicineProductsNav');
    const ordersNav=$('#healthMedicineOrdersNav');
    const servicesNav=$('#healthSpecialistServicesNav');
    const bookingsNav=$('#healthSpecialistBookingsNav');
    if(productNav)productNav.hidden=enabled;
    if(ordersNav)ordersNav.hidden=enabled;
    if(servicesNav)servicesNav.hidden=!enabled;
    if(bookingsNav)bookingsNav.hidden=!enabled;

    const productPanel=$('[data-health-content="products"]',shell);
    const ordersPanel=$('[data-health-content="orders"]',shell);
    const servicesPanel=$('[data-health-content="services"]',shell);
    const bookingsPanel=$('[data-health-content="bookings"]',shell);
    if(productPanel)productPanel.hidden=enabled;
    if(ordersPanel)ordersPanel.hidden=enabled;
    if(servicesPanel)servicesPanel.hidden=!enabled;
    if(bookingsPanel)bookingsPanel.hidden=!enabled;

    const safety=$('#healthMedicineProductSafetyPanel');
    const specialistNote=$('#healthSpecialistOverviewNote');
    if(safety)safety.hidden=enabled;
    if(specialistNote)specialistNote.hidden=!enabled;
    const serviceMetric=$('#healthSpecialistServicesMetric');
    const bookingMetric=$('#healthSpecialistBookingsMetric');
    if(serviceMetric)serviceMetric.hidden=!enabled;
    if(bookingMetric)bookingMetric.hidden=!enabled;

    const productCountCard=$('#healthMedicineProductCount')?.closest('article');
    const approvedProductCard=$('#healthMedicineApprovedCount')?.closest('article');
    const activeOrderCard=$('#healthMedicineActiveOrders')?.closest('article');
    if(productCountCard)productCountCard.hidden=enabled;
    if(approvedProductCard)approvedProductCard.hidden=enabled;
    if(activeOrderCard)activeOrderCard.hidden=enabled;
  };

  const resetServiceForm=()=>{
    const form=$('#healthSpecialistServiceForm');
    form?.reset();
    if($('#healthSpecialistServiceId'))$('#healthSpecialistServiceId').value='';
    if($('#healthSpecialistExistingImagePath'))$('#healthSpecialistExistingImagePath').value='';
    if($('#healthSpecialistDuration'))$('#healthSpecialistDuration').value='30';
    if($('#healthSpecialistServiceMode'))$('#healthSpecialistServiceMode').value='in_person';
    if($('#healthSpecialistListingStatus'))$('#healthSpecialistListingStatus').value='active';
    status($('#healthSpecialistServiceStatus'));
  };

  const renderServices=()=>{
    const approved=services.filter((row)=>row.approval_status==='approved'&&row.listing_status==='active').length;
    if($('#healthSpecialistApprovedServices'))$('#healthSpecialistApprovedServices').textContent=String(approved);
    const attention=services.filter((row)=>['pending','under_review','changes_requested'].includes(row.approval_status)).length;
    const badge=$('#healthSpecialistServiceBadge');
    if(badge){badge.hidden=!attention;badge.textContent=String(attention);}

    const target=$('#healthSpecialistServiceList');
    if(!target)return;
    if(!services.length){
      target.innerHTML='<div class="empty-card">No Health Specialist services submitted yet.</div>';
      return;
    }
    target.innerHTML=services.map((row)=>{
      const image=publicMedia(row.image_path);
      const locked=row.approval_status==='under_review';
      return '<article class="health-specialist-service-card" data-health-specialist-service="'+esc(row.id)+'">'+
        '<div class="health-specialist-service-photo">'+(image?'<img src="'+esc(image)+'" alt="'+esc(row.service_name)+'">':'🩺')+'</div>'+
        '<div class="health-specialist-service-copy"><span>'+esc(row.specialty||'Health Service')+'</span><strong>'+esc(row.service_name||'Health Service')+'</strong>'+
          '<small>'+esc(String(row.service_mode||'').replaceAll('_',' '))+' · '+Number(row.duration_minutes||0)+' minutes</small>'+
          '<b>'+money(row.consultation_fee_kes)+'</b>'+
          (row.availability_notes?'<p>'+esc(row.availability_notes)+'</p>':'')+
          (row.admin_notes?'<em>Admin note: '+esc(row.admin_notes)+'</em>':'')+
        '</div>'+
        '<div class="health-specialist-service-actions"><span class="status-chip '+esc(row.approval_status)+'">'+esc(String(row.approval_status||'').replaceAll('_',' '))+'</span>'+
          (locked?'<button type="button" class="secondary" disabled>Locked while under review</button>':'<button type="button" data-edit-health-specialist-service="'+esc(row.id)+'">Edit &amp; Resubmit</button>')+
        '</div>'+
      '</article>';
    }).join('');

    $$('[data-edit-health-specialist-service]',target).forEach((button)=>button.addEventListener('click',()=>{
      const row=services.find((item)=>String(item.id)===String(button.dataset.editHealthSpecialistService));
      if(!row)return;
      $('#healthSpecialistServiceId').value=row.id;
      $('#healthSpecialistExistingImagePath').value=row.image_path||'';
      $('#healthSpecialistServiceName').value=row.service_name||'';
      $('#healthSpecialistSpecialty').value=row.specialty||'';
      $('#healthSpecialistConsultationFee').value=row.consultation_fee_kes??'';
      $('#healthSpecialistDuration').value=row.duration_minutes??30;
      $('#healthSpecialistServiceMode').value=row.service_mode||'in_person';
      $('#healthSpecialistListingStatus').value=row.listing_status||'active';
      $('#healthSpecialistServiceDescription').value=row.description||'';
      $('#healthSpecialistAvailabilityNotes').value=row.availability_notes||'';
      $('#healthSpecialistServiceForm')?.scrollIntoView({behavior:'smooth',block:'start'});
    }));
  };

  const bookingStatusLabel=(value)=>({
    awaiting_payment_verification:'Awaiting LEOGO fee verification',
    requested:'New booking request',
    accepted:'Accepted',
    declined:'Declined',
    completed:'Completed',
    cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));

  const paymentStatusLabel=(value)=>({
    submitted:'Booking fee awaiting verification',
    verified_paid:'Booking fee verified',
    rejected:'Booking fee rejected'
  }[value]||String(value||'').replaceAll('_',' '));

  const renderBookings=()=>{
    const active=bookings.filter((row)=>['requested','accepted'].includes(row.booking_status)).length;
    if($('#healthSpecialistActiveBookings'))$('#healthSpecialistActiveBookings').textContent=String(active);
    const newCount=bookings.filter((row)=>row.booking_status==='requested'&&row.payment_status==='verified_paid').length;
    const badge=$('#healthSpecialistBookingBadge');
    if(badge){badge.hidden=!newCount;badge.textContent=String(newCount);}

    const target=$('#healthSpecialistBookingList');
    if(!target)return;
    if(!bookings.length){
      target.innerHTML='<div class="empty-card">No Health Specialist bookings yet.</div>';
      return;
    }
    target.innerHTML=bookings.map((row)=>{
      const canRespond=row.payment_status==='verified_paid'&&row.booking_status==='requested';
      const canComplete=row.payment_status==='verified_paid'&&row.booking_status==='accepted';
      return '<article class="health-specialist-booking-card" data-health-specialist-booking="'+esc(row.id)+'">'+
        '<header><div><span>'+esc(row.booking_reference||'Booking')+'</span><strong>'+esc(row.service_name||'Health Service')+'</strong><small>'+esc(row.specialty||'')+'</small></div><b>'+esc(bookingStatusLabel(row.booking_status))+'</b></header>'+
        '<div class="health-specialist-booking-meta">'+
          '<span><small>Customer</small><strong>'+esc(row.customer_name||'Customer')+'</strong></span>'+
          '<span><small>Phone</small><strong>'+esc(row.customer_phone||'')+'</strong></span>'+
          '<span><small>Date</small><strong>'+esc(row.preferred_date||'')+'</strong></span>'+
          '<span><small>Time</small><strong>'+esc(String(row.preferred_time||'').slice(0,5))+'</strong></span>'+
          '<span><small>Mode</small><strong>'+esc(String(row.service_mode||'').replaceAll('_',' '))+'</strong></span>'+
          '<span><small>LEOGO Booking Fee</small><strong>'+money(row.booking_fee_kes)+'</strong></span>'+
          '<span><small>Your Listed Fee</small><strong>'+money(row.consultation_fee_kes)+'</strong></span>'+
          '<span><small>Payment</small><strong>'+esc(paymentStatusLabel(row.payment_status))+'</strong></span>'+
        '</div>'+
        (row.customer_notes?'<p class="health-specialist-booking-note">'+esc(row.customer_notes)+'</p>':'')+
        (row.provider_notes?'<p class="health-specialist-booking-note"><b>Your note:</b> '+esc(row.provider_notes)+'</p>':'')+
        (row.payment_status!=='verified_paid'&&row.booking_status!=='cancelled'?'<div class="restricted-notice">Wait for LEOGO Admin to verify the booking fee before accepting this booking.</div>':'')+
        (canRespond?'<div class="product-actions"><button type="button" data-health-booking-action="accepted" data-health-booking-id="'+esc(row.id)+'">Accept Booking</button><button type="button" class="secondary" data-health-booking-action="declined" data-health-booking-id="'+esc(row.id)+'">Decline</button></div>':'')+
        (canComplete?'<div class="product-actions"><button type="button" data-health-booking-action="completed" data-health-booking-id="'+esc(row.id)+'">Mark Service Completed</button></div>':'')+
      '</article>';
    }).join('');

    $$('[data-health-booking-action]',target).forEach((button)=>button.addEventListener('click',async()=>{
      const next=button.dataset.healthBookingAction;
      let note=null;
      if(next==='declined'){
        note=window.prompt('Optional reason / note for the customer:','')||null;
      }
      const original=button.textContent;button.disabled=true;button.textContent='Saving…';
      try{
        const {error}=await client.rpc('health_specialist_update_booking_status',{
          p_booking_id:button.dataset.healthBookingId,
          p_status:next,
          p_provider_notes:note
        });
        if(error)throw error;
        status($('#healthSpecialistBookingStatus'),'Booking updated successfully.','success');
        await loadBookings();
      }catch(error){
        status($('#healthSpecialistBookingStatus'),error?.message||'Booking could not be updated.','error');
      }finally{
        button.disabled=false;button.textContent=original;
      }
    }));
  };

  const loadServices=async()=>{
    if(!specialistMode())return;
    const {data,error}=await client.rpc('health_specialist_list_own_services');
    if(error)throw error;
    services=Array.isArray(data)?data:[];
    renderServices();
  };

  const loadBookings=async()=>{
    if(!specialistMode())return;
    const {data,error}=await client.rpc('health_specialist_list_own_bookings');
    if(error)throw error;
    bookings=Array.isArray(data)?data:[];
    renderBookings();
  };

  const refreshAccount=async()=>{
    try{
      const {data,error}=await client.rpc('health_medicine_get_own_account');
      if(error)throw error;
      account=data||null;
      configureShell();
      if(specialistMode())await Promise.allSettled([loadServices(),loadBookings()]);
    }catch(error){
      console.warn('Health Specialist extension could not load:',error);
    }
  };

  document.addEventListener('leogo:health-account-ready',(event)=>{
    account={
      ...(account||{}),
      business_type:event.detail?.businessType||account?.business_type,
      application_status:event.detail?.applicationStatus||account?.application_status,
      business_name:event.detail?.businessName||account?.business_name
    };
    configureShell();
    if(specialistMode())Promise.allSettled([loadServices(),loadBookings()]);
  });

  $$('[data-health-view]',shell).forEach((button)=>button.addEventListener('click',()=>{
    if(!specialistMode())return;
    if(button.dataset.healthView==='services')loadServices().catch((error)=>status($('#healthSpecialistServiceStatus'),error?.message||'Services could not load.','error'));
    if(button.dataset.healthView==='bookings')loadBookings().catch((error)=>status($('#healthSpecialistBookingStatus'),error?.message||'Bookings could not load.','error'));
  }));

  $('#resetHealthSpecialistService')?.addEventListener('click',resetServiceForm);

  $('#healthSpecialistServiceForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!specialistMode())return;
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const button=event.submitter;
    const original=button?.textContent||'Save & Send to Admin';
    if(button){button.disabled=true;button.textContent='Saving…';}
    status($('#healthSpecialistServiceStatus'),'Preparing Health Specialist service…');
    try{
      const imageFile=$('#healthSpecialistServiceImage').files?.[0]||null;
      const existing=$('#healthSpecialistExistingImagePath').value||'';
      const imagePath=imageFile?await uploadServiceImage(imageFile):existing||null;
      const {error}=await client.rpc('health_specialist_save_service',{
        p_service_id:$('#healthSpecialistServiceId').value||null,
        p_service_name:$('#healthSpecialistServiceName').value.trim(),
        p_specialty:$('#healthSpecialistSpecialty').value.trim(),
        p_description:$('#healthSpecialistServiceDescription').value.trim()||null,
        p_consultation_fee_kes:Number($('#healthSpecialistConsultationFee').value),
        p_duration_minutes:Number($('#healthSpecialistDuration').value),
        p_service_mode:$('#healthSpecialistServiceMode').value,
        p_availability_notes:$('#healthSpecialistAvailabilityNotes').value.trim()||null,
        p_image_path:imagePath,
        p_listing_status:$('#healthSpecialistListingStatus').value
      });
      if(error)throw error;
      resetServiceForm();
      status($('#healthSpecialistServiceStatus'),'Service saved and sent to LEOGO Admin for approval.','success');
      await loadServices();
    }catch(error){
      status($('#healthSpecialistServiceStatus'),error?.message||'Health Specialist service could not be saved.','error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  $('#healthMedicineRefresh')?.addEventListener('click',()=>window.setTimeout(()=>refreshAccount(),120));
  document.addEventListener('leogo:authchange',()=>window.setTimeout(()=>refreshAccount(),160));
  window.setTimeout(()=>refreshAccount(),800);
})();

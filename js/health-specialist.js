// LEOGO DIGITAL MARKET — public Health Specialist services + booking V1
// Uses the existing regulated Health & Medicine partner identity and LEOGO service payment account.
(() => {
  'use strict';
  const client=window.leogoAuth?.client;
  const section=document.getElementById('healthSpecialistServices');
  if(!client||!section)return;

  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const esc=(value='')=>String(value??'').replace(/[&<>'"]/g,(ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const publicMedia=(path)=>path?client.storage.from('health-medicine-public-media').getPublicUrl(path).data?.publicUrl||'':'';
  const normalisePhone=(value)=>{
    const digits=String(value||'').replace(/\D/g,'');
    if(/^0[17]\d{8}$/.test(digits))return '+254'+digits.slice(1);
    if(/^254[17]\d{8}$/.test(digits))return '+'+digits;
    if(/^[17]\d{8}$/.test(digits))return '+254'+digits;
    return String(value||'').trim();
  };
  const safeDate=(value)=>{
    if(!value)return '—';
    const parsed=new Date(value+'T00:00:00');
    return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'});
  };

  let services=[];
  let bookingFee=0;
  let payment=null;
  let customerBookings=[];
  let activeService=null;

  const status=(message='')=>{
    const node=$('#healthSpecialistStatus');
    if(node)node.textContent=message;
  };

  const paymentDetailsHtml=()=>{
    if(!payment)return '<div class="health-specialist-payment-missing">LEOGO booking payment details are temporarily unavailable.</div>';
    const rows=[];
    if(payment.display_name)rows.push('<strong>'+esc(payment.display_name)+'</strong>');
    if(payment.business_name)rows.push('<span>'+esc(payment.business_name)+'</span>');
    if(payment.account_type==='mpesa_till'&&payment.till_number)rows.push('<b>Till: '+esc(payment.till_number)+'</b>');
    if(payment.account_type==='mpesa_paybill'){
      if(payment.paybill_number)rows.push('<b>Paybill: '+esc(payment.paybill_number)+'</b>');
      if(payment.account_number)rows.push('<b>Account: '+esc(payment.account_number)+'</b>');
    }
    if(payment.account_type==='bank'){
      if(payment.bank_name)rows.push('<b>Bank: '+esc(payment.bank_name)+'</b>');
      if(payment.account_number)rows.push('<b>Account: '+esc(payment.account_number)+'</b>');
      if(payment.account_name)rows.push('<span>Name: '+esc(payment.account_name)+'</span>');
    }
    if(payment.account_type==='other'&&payment.instructions)rows.push('<span>'+esc(payment.instructions)+'</span>');
    if(payment.instructions&&payment.account_type!=='other')rows.push('<small>'+esc(payment.instructions)+'</small>');
    return rows.join('');
  };

  const filteredServices=()=>{
    const type=$('#healthMarketTypeFilter')?.value||'';
    const query=$('#healthMarketSearch')?.value.trim().toLowerCase()||'';
    if(type&&type!=='health_specialist')return [];
    if(!query)return services;
    return services.filter((row)=>[
      row.service_name,row.specialty,row.description,row.provider_name,row.specialist_name,
      row.availability_notes,row.county,row.sub_county,row.town,row.location_details
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  };

  const renderServices=()=>{
    const rows=filteredServices();
    const grid=$('#healthSpecialistServiceGrid');
    if(!grid)return;
    const type=$('#healthMarketTypeFilter')?.value||'';
    section.hidden=Boolean(type&&type!=='health_specialist');
    const productsHeading=document.querySelector('.health-products-heading');
    const productsGrid=$('#healthProductGrid');
    if(productsHeading)productsHeading.hidden=type==='health_specialist';
    if(productsGrid)productsGrid.hidden=type==='health_specialist';
    if(section.hidden)return;

    const feeNode=$('#healthSpecialistBookingFee');
    if(feeNode)feeNode.textContent=money(bookingFee);

    status(rows.length
      ? rows.length+' approved Health Specialist service'+(rows.length===1?'':'s')+' available.'
      : 'No approved Health Specialist services match this filter yet.');

    if(!rows.length){
      grid.innerHTML='<div class="health-market-empty">Approved Health Specialist / Doctor services will appear here after LEOGO Admin approval.</div>';
      return;
    }

    grid.innerHTML=rows.map((row)=>{
      const image=publicMedia(row.image_path||row.profile_picture_path);
      const mode=String(row.service_mode||'in_person').replaceAll('_',' ');
      const location=[row.location_details,row.town,row.county].filter(Boolean).join(' · ')||'Kenya';
      return '<article class="health-specialist-public-card" data-health-specialist-service="'+esc(row.id)+'">'+
        '<div class="health-specialist-public-photo">'+(image?'<img src="'+esc(image)+'" alt="'+esc(row.service_name)+'">':'🩺')+'</div>'+
        '<div class="health-specialist-public-copy">'+
          '<span>'+esc(row.specialty||'Health Specialist')+'</span>'+
          '<h4>'+esc(row.service_name||'Health Service')+'</h4>'+
          '<strong>'+esc(row.specialist_name||row.provider_name||'Health Specialist')+'</strong>'+
          '<small>'+esc(row.provider_name||'Verified Health Partner')+'</small>'+
          '<p>📍 '+esc(location)+'</p>'+
          '<div class="health-specialist-public-facts"><em>'+Number(row.duration_minutes||0)+' min</em><em>'+esc(mode)+'</em></div>'+
          (row.availability_notes?'<p class="availability">'+esc(row.availability_notes)+'</p>':'')+
          '<div class="health-specialist-public-prices"><span><small>Provider fee</small><b>'+money(row.consultation_fee_kes)+'</b></span><span><small>LEOGO booking fee</small><b>'+money(bookingFee)+'</b></span></div>'+
          '<button type="button" data-book-health-specialist="'+esc(row.id)+'">Book Service</button>'+
        '</div>'+
      '</article>';
    }).join('');
  };

  const bookingStatusLabel=(value)=>({
    awaiting_payment_verification:'Awaiting LEOGO payment verification',
    requested:'Sent to Health Specialist',
    accepted:'Accepted',
    declined:'Declined',
    completed:'Completed',
    cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));

  const renderCustomerBookings=()=>{
    const shell=$('#customerHealthSpecialistBookings');
    const list=$('#customerHealthSpecialistBookingList');
    if(!shell||!list)return;
    const signedIn=Boolean(window.leogoAuth?.isAuthenticated?.());
    shell.hidden=!signedIn;
    if(!signedIn)return;
    if(!customerBookings.length){
      list.innerHTML='<div class="health-market-empty">You have no Health Specialist bookings yet.</div>';
      return;
    }
    list.innerHTML=customerBookings.map((row)=>
      '<article class="customer-health-booking-card">'+
        '<div><span>'+esc(row.booking_reference||'Booking')+'</span><strong>'+esc(row.service_name||'Health Service')+'</strong><small>'+esc(row.specialist_name||row.provider_name||'Health Specialist')+'</small></div>'+
        '<div><b>'+esc(bookingStatusLabel(row.booking_status))+'</b><small>'+safeDate(row.preferred_date)+' · '+esc(String(row.preferred_time||'').slice(0,5))+' · '+esc(String(row.service_mode||'').replaceAll('_',' '))+'</small></div>'+
        '<div><small>LEOGO booking fee</small><strong>'+money(row.booking_fee_kes)+'</strong></div>'+
      '</article>'
    ).join('');
  };

  const loadCustomerBookings=async()=>{
    if(!window.leogoAuth?.isAuthenticated?.()){
      customerBookings=[];
      renderCustomerBookings();
      return;
    }
    const {data,error}=await client.rpc('customer_list_health_specialist_bookings');
    if(error){
      console.warn('Health Specialist customer bookings could not load:',error);
      return;
    }
    customerBookings=Array.isArray(data)?data:[];
    renderCustomerBookings();
  };

  const load=async()=>{
    status('Loading approved Health Specialist services…');
    try{
      const {data,error}=await client.rpc('public_list_health_specialist_services');
      if(error)throw error;
      services=Array.isArray(data?.services)?data.services:[];
      bookingFee=Number(data?.booking_fee_kes||0);
      payment=data?.payment||null;
      renderServices();
      await loadCustomerBookings();
    }catch(error){
      console.warn('Health Specialist services could not load:',error);
      services=[];
      status('Health Specialist services are temporarily unavailable.');
      const grid=$('#healthSpecialistServiceGrid');
      if(grid)grid.innerHTML='<div class="health-market-empty">Health Specialist services could not be loaded right now.</div>';
    }
  };

  const closeBooking=()=>{
    const modal=$('#healthSpecialistBookingModal');
    if(!modal)return;
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('health-specialist-booking-open');
    activeService=null;
  };

  const openBooking=(service)=>{
    if(!window.leogoAuth?.isAuthenticated?.()){
      window.leogoAuth?.requireLogin?.('Please log in to book a Health Specialist service.');
      return;
    }
    activeService=service;
    const modal=$('#healthSpecialistBookingModal');
    if(!modal)return;

    $('#healthSpecialistBookingServiceId').value=service.id;
    $('#healthSpecialistBookingTitle').textContent=service.service_name||'Book Health Service';
    $('#healthSpecialistBookingProvider').textContent=(service.specialist_name||service.provider_name||'Health Specialist')+' · '+(service.specialty||'Health Specialist');
    $('#healthSpecialistBookingSummary').innerHTML=
      '<span><small>Provider consultation/service fee</small><strong>'+money(service.consultation_fee_kes)+'</strong></span>'+
      '<span><small>LEOGO booking fee due now</small><strong>'+money(bookingFee)+'</strong></span>'+
      '<span><small>Expected duration</small><strong>'+Number(service.duration_minutes||0)+' min</strong></span>';
    $('#healthSpecialistModalBookingFee').textContent=money(bookingFee);
    $('#healthSpecialistPaymentAccount').innerHTML=paymentDetailsHtml();

    const user=window.leogoAuth?.getUser?.()||null;
    const meta=user?.user_metadata||{};
    $('#healthSpecialistCustomerName').value=meta.full_name||meta.name||'';
    $('#healthSpecialistCustomerPhone').value=meta.phone||'';
    $('#healthSpecialistPreferredDate').min=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('#healthSpecialistPreferredDate').value='';
    $('#healthSpecialistPreferredTime').value='';
    $('#healthSpecialistCustomerNotes').value='';
    $('#healthSpecialistPaymentMessage').value='';
    $('#healthSpecialistPaymentConfirmed').checked=false;

    const mode=$('#healthSpecialistBookingMode');
    mode.innerHTML=service.service_mode==='in_person'
      ? '<option value="in_person">In Person</option>'
      : service.service_mode==='online'
        ? '<option value="online">Online</option>'
        : '<option value="in_person">In Person</option><option value="online">Online</option>';

    const formStatus=$('#healthSpecialistBookingFormStatus');
    if(formStatus)formStatus.textContent='';
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('health-specialist-booking-open');
    window.setTimeout(()=>$('#healthSpecialistCustomerName')?.focus(),50);
  };

  $('#healthSpecialistServiceGrid')?.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-book-health-specialist]');
    if(!button)return;
    const serviceId=button.dataset.bookHealthSpecialist;
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Preparing…';
    try{
      const {data,error}=await client.rpc('public_list_health_specialist_services');
      if(error)throw error;
      services=Array.isArray(data?.services)?data.services:services;
      bookingFee=Number(data?.booking_fee_kes||0);
      payment=data?.payment||null;
      renderServices();
      const service=services.find((row)=>String(row.id)===String(serviceId));
      if(!service)throw new Error('This Health Specialist service is no longer available.');
      openBooking(service);
    }catch(error){
      status(error?.message||'The booking could not be prepared. Please try again.');
    }finally{
      if(button.isConnected){button.disabled=false;button.textContent=original;}
    }
  });

  $$('[data-close-health-specialist-booking]').forEach((button)=>button.addEventListener('click',closeBooking));
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&!$('#healthSpecialistBookingModal')?.hidden)closeBooking();
  });

  $('#healthSpecialistBookingForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!activeService)return;
    if(!event.currentTarget.reportValidity())return;
    if(!payment){
      const node=$('#healthSpecialistBookingFormStatus');
      if(node)node.textContent='LEOGO booking payment details are not configured. Contact Customer Care.';
      return;
    }

    const phone=normalisePhone($('#healthSpecialistCustomerPhone').value);
    if(!/^\+254[17]\d{8}$/.test(phone)){
      $('#healthSpecialistBookingFormStatus').textContent='Enter a valid Kenyan phone number.';
      $('#healthSpecialistCustomerPhone').focus();
      return;
    }
    const button=event.submitter;
    const original=button?.textContent||'Submit Booking';
    if(button){button.disabled=true;button.textContent='Submitting…';}
    $('#healthSpecialistBookingFormStatus').textContent='Submitting booking for LEOGO payment verification…';
    try{
      const {data,error}=await client.rpc('customer_create_health_specialist_booking',{
        p_service_id:activeService.id,
        p_customer_name:$('#healthSpecialistCustomerName').value.trim(),
        p_customer_phone:phone,
        p_preferred_date:$('#healthSpecialistPreferredDate').value,
        p_preferred_time:$('#healthSpecialistPreferredTime').value,
        p_service_mode:$('#healthSpecialistBookingMode').value,
        p_customer_notes:$('#healthSpecialistCustomerNotes').value.trim()||null,
        p_payment_message:$('#healthSpecialistPaymentMessage').value.trim()
      });
      if(error)throw error;
      $('#healthSpecialistBookingFormStatus').textContent='✓ Booking '+(data?.booking_reference||'')+' submitted. LEOGO will verify the booking fee before sending it to the Health Specialist.';
      await loadCustomerBookings();
      window.setTimeout(closeBooking,2200);
    }catch(error){
      $('#healthSpecialistBookingFormStatus').textContent=error?.message||'Health Specialist booking could not be submitted.';
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  $('#healthMarketTypeFilter')?.addEventListener('change',renderServices);
  $('#healthMarketSearch')?.addEventListener('input',renderServices);
  $('#refreshCustomerHealthBookings')?.addEventListener('click',()=>loadCustomerBookings());
  document.addEventListener('leogo:authchange',()=>window.setTimeout(()=>loadCustomerBookings(),80));
  document.addEventListener('leogo:customer-data-refresh',()=>window.setTimeout(()=>loadCustomerBookings(),80));
  window.setTimeout(()=>load().catch(()=>{}),520);
})();

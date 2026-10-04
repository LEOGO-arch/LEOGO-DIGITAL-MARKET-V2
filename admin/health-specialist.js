// LEOGO Admin — Health Specialist / Doctor services + booking fee V1
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  if(!db)return;

  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const esc=(value='')=>String(value??'').replace(/[&<>'"]/g,(ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const fmt=(value)=>value?new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}):'—';

  let services=[];
  let bookings=[];
  let settings=null;

  const setStatus=(element,message='',type='')=>{
    if(!element)return;
    element.textContent=message;
    element.className='form-status'+(type?' '+type:'');
  };

  const renderServices=()=>{
    if($('#adminHealthSpecialistServiceTotal'))$('#adminHealthSpecialistServiceTotal').textContent=String(services.length);
    const filter=$('#adminHealthSpecialistServiceFilter')?.value||'all';
    const rows=filter==='all'?services:services.filter((row)=>row.approval_status===filter);
    const body=$('#adminHealthSpecialistServiceTable');
    if(!body)return;
    body.innerHTML=rows.length?rows.map((row)=>
      '<tr>'+
        '<td><strong>'+esc(row.service_name||'Health Service')+'</strong><small>'+esc(row.specialty||'')+'</small></td>'+
        '<td><strong>'+esc(row.specialist_name||row.provider_name||'Health Specialist')+'</strong><small>'+esc(row.provider_name||'')+'</small></td>'+
        '<td>'+esc(String(row.service_mode||'').replaceAll('_',' '))+'</td>'+
        '<td>'+Number(row.duration_minutes||0)+' min</td>'+
        '<td>'+money(row.consultation_fee_kes)+'</td>'+
        '<td><span class="status-chip '+esc(row.approval_status||'')+'">'+esc(String(row.approval_status||'').replaceAll('_',' '))+'</span>'+(row.admin_notes?'<div class="admin-health-note">'+esc(row.admin_notes)+'</div>':'')+'</td>'+
      '</tr>'
    ).join(''):'<tr><td colspan="6">No Health Specialist services match this filter.</td></tr>';
  };

  const bookingStatusLabel=(value)=>({
    awaiting_payment_verification:'Awaiting fee verification',
    requested:'Sent to specialist',
    accepted:'Accepted',
    declined:'Declined',
    completed:'Completed',
    cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));

  const renderBookings=()=>{
    if($('#adminHealthSpecialistBookingTotal'))$('#adminHealthSpecialistBookingTotal').textContent=String(bookings.length);
    const pending=bookings.filter((row)=>row.payment_status==='submitted').length;
    if($('#adminHealthSpecialistPaymentPending'))$('#adminHealthSpecialistPaymentPending').textContent=String(pending);

    const filter=$('#adminHealthSpecialistBookingFilter')?.value||'all';
    let rows=bookings;
    if(filter==='payment_pending')rows=bookings.filter((row)=>row.payment_status==='submitted');
    else if(filter==='requested')rows=bookings.filter((row)=>row.booking_status==='requested');
    else if(filter==='accepted')rows=bookings.filter((row)=>row.booking_status==='accepted');
    else if(filter==='completed')rows=bookings.filter((row)=>row.booking_status==='completed');
    else if(filter==='closed')rows=bookings.filter((row)=>['declined','cancelled'].includes(row.booking_status));

    const target=$('#adminHealthSpecialistBookingList');
    if(!target)return;
    if(!rows.length){
      target.innerHTML='<div class="loading-card">No Health Specialist bookings match this filter.</div>';
      return;
    }

    target.innerHTML=rows.map((row)=>
      '<article class="admin-health-specialist-booking-card" data-admin-health-specialist-booking="'+esc(row.id)+'">'+
        '<header><div><span>'+esc(row.booking_reference||'Booking')+'</span><strong>'+esc(row.service_name||'Health Service')+'</strong><small>'+esc(row.specialist_name||row.provider_name||'Health Specialist')+' · '+esc(row.specialty||'')+'</small></div><b>'+esc(bookingStatusLabel(row.booking_status))+'</b></header>'+
        '<div class="admin-health-specialist-booking-meta">'+
          '<span><small>Customer</small><strong>'+esc(row.customer_name||'Customer')+'</strong></span>'+
          '<span><small>Phone</small><strong>'+esc(row.customer_phone||'')+'</strong></span>'+
          '<span><small>Date / Time</small><strong>'+esc(String(row.preferred_date||''))+' · '+esc(String(row.preferred_time||'').slice(0,5))+'</strong></span>'+
          '<span><small>Mode</small><strong>'+esc(String(row.service_mode||'').replaceAll('_',' '))+'</strong></span>'+
          '<span><small>LEOGO Booking Fee</small><strong>'+money(row.booking_fee_kes)+'</strong></span>'+
          '<span><small>Provider Listed Fee</small><strong>'+money(row.consultation_fee_kes)+'</strong></span>'+
          '<span><small>Payment</small><strong>'+esc(String(row.payment_status||'').replaceAll('_',' '))+'</strong></span>'+
          '<span><small>Created</small><strong>'+esc(fmt(row.created_at))+'</strong></span>'+
        '</div>'+
        (row.payment_message?'<div class="admin-health-payment-message"><small>Customer payment confirmation / reference</small><p>'+esc(row.payment_message)+'</p></div>':'')+
        (row.customer_notes?'<div class="admin-health-payment-message"><small>Customer notes</small><p>'+esc(row.customer_notes)+'</p></div>':'')+
        (row.admin_notes?'<div class="admin-health-note">Admin note: '+esc(row.admin_notes)+'</div>':'')+
        (row.payment_status==='submitted'
          ? '<div class="admin-health-specialist-booking-actions"><button type="button" data-health-specialist-payment-action="verify" data-health-specialist-booking-id="'+esc(row.id)+'">Verify Booking Fee</button><button type="button" class="danger" data-health-specialist-payment-action="reject" data-health-specialist-booking-id="'+esc(row.id)+'">Reject Payment</button></div>'
          : '')+
      '</article>'
    ).join('');

    $$('[data-health-specialist-payment-action]',target).forEach((button)=>button.addEventListener('click',async()=>{
      const decision=button.dataset.healthSpecialistPaymentAction;
      let notes=null;
      if(decision==='reject'){
        notes=window.prompt('Reason for rejecting this Health Specialist booking fee payment:','')||'';
        if(notes.trim().length<3)return;
      }
      const original=button.textContent;button.disabled=true;button.textContent='Saving…';
      try{
        const {error}=await db.rpc('admin_review_health_specialist_booking_payment',{
          p_booking_id:button.dataset.healthSpecialistBookingId,
          p_decision:decision,
          p_notes:notes||null
        });
        if(error)throw error;
        setStatus(
          $('#adminHealthSpecialistBookingStatus'),
          decision==='verify'
            ?'Booking fee verified. The appointment request has been sent to the Health Specialist.'
            :'Booking fee payment rejected and the customer was notified.',
          'success'
        );
        await loadOperations();
      }catch(error){
        setStatus($('#adminHealthSpecialistBookingStatus'),error?.message||'Booking fee action failed.','error');
      }finally{
        button.disabled=false;button.textContent=original;
      }
    }));
  };

  const renderSettings=()=>{
    const input=$('#adminHealthSpecialistBookingFeeInput');
    if(input&&settings)input.value=Number(settings.specialist_booking_fee_kes||0);
  };

  const loadSettings=async()=>{
    const {data,error}=await db.rpc('admin_health_specialist_get_settings');
    if(error)throw error;
    settings=data||{specialist_booking_fee_kes:50};
    renderSettings();
  };

  const loadOperations=async()=>{
    const {data,error}=await db.rpc('admin_list_health_specialist_operations');
    if(error)throw error;
    services=Array.isArray(data?.services)?data.services:[];
    bookings=Array.isArray(data?.bookings)?data.bookings:[];
    renderServices();
    renderBookings();
  };

  const load=async()=>{
    const [settingsResult,operationsResult]=await Promise.allSettled([loadSettings(),loadOperations()]);
    if(settingsResult.status==='rejected'){
      console.warn('Health Specialist booking-fee settings could not load:',settingsResult.reason);
      setStatus($('#adminHealthSpecialistFeeStatus'),'Booking fee settings are unavailable for this Admin role or session.','error');
    }
    if(operationsResult.status==='rejected'){
      console.warn('Health Specialist operations could not load:',operationsResult.reason);
      const body=$('#adminHealthSpecialistServiceTable');
      if(body)body.innerHTML='<tr><td colspan="6">Health Specialist service data is unavailable.</td></tr>';
      const bookingsNode=$('#adminHealthSpecialistBookingList');
      if(bookingsNode)bookingsNode.innerHTML='<div class="loading-card">Health Specialist bookings are unavailable.</div>';
    }
  };
  window.leogoLoadHealthSpecialistAdmin=load;

  $('#adminHealthSpecialistFeeForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!event.currentTarget.reportValidity())return;
    const button=event.submitter;
    const original=button?.textContent||'Save Booking Fee';
    if(button){button.disabled=true;button.textContent='Saving…';}
    setStatus($('#adminHealthSpecialistFeeStatus'),'Saving booking fee…');
    try{
      const fee=Number($('#adminHealthSpecialistBookingFeeInput').value);
      const {data,error}=await db.rpc('admin_health_specialist_set_booking_fee',{p_booking_fee_kes:fee});
      if(error)throw error;
      settings=data||settings;
      renderSettings();
      setStatus($('#adminHealthSpecialistFeeStatus'),'Health Specialist LEOGO booking fee updated. New bookings will use this amount.','success');
    }catch(error){
      setStatus($('#adminHealthSpecialistFeeStatus'),error?.message||'Booking fee could not be saved.','error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  $('#adminHealthSpecialistServiceFilter')?.addEventListener('change',renderServices);
  $('#adminHealthSpecialistBookingFilter')?.addEventListener('change',renderBookings);
  $('#refreshHealthMedicineAdmin')?.addEventListener('click',()=>load().catch(()=>{}));
  $$('[data-admin-view="health"]').forEach((button)=>button.addEventListener('click',()=>window.setTimeout(()=>load().catch(()=>{}),70)));
  window.setTimeout(()=>load().catch(()=>{}),900);
})();

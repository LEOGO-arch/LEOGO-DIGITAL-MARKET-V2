// LEOGO Customer Assisted Shopping / Shopping List V1
(() => {
  'use strict';

  const modal=document.getElementById('assistedShoppingModal');
  const legacyOpenButton=document.getElementById('openAssistedShopping');
  const openButtons=[...document.querySelectorAll('[data-open-assisted-shopping]')];
  if(legacyOpenButton&&!openButtons.includes(legacyOpenButton))openButtons.push(legacyOpenButton);
  const form=document.getElementById('assistedShoppingForm');
  if(!modal||!openButtons.length||!form)return;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const escapeHtml=(value='')=>String(value??'').replace(/[&<>'"]/g,(ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const formatDate=(value,withTime=false)=>{
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '—';
    return new Intl.DateTimeFormat('en-KE',withTime
      ?{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}
      :{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(d);
  };

  const client=()=>window.leogoAuth?.client||null;
  const statusBox=$('#assistedShoppingStatus');
  const listBox=$('#assistedShoppingMyList');
  const feeNote=$('#assistedFeeNote');
  const fileInput=$('#assistedShoppingFiles');
  const fileList=$('#assistedFileList');
  const fulfilment=$('#assistedFulfilmentMethod');
  const deliveryZoneLabel=$('#assistedDeliveryZoneLabel');
  const pickupLabel=$('#assistedPickupStationLabel');
  const pickupSelect=$('#assistedPickupStation');
  const submitButton=$('#submitAssistedShopping');
  const loginNote=$('#assistedShoppingLoginNote');
  const pinLocationButton=$('#pinAssistedLocation');
  const pinLocationStatus=$('#assistedPinStatus');

  let currentUser=null;
  let requests=[];
  let settings={service_fee_percent:5};
  let orderSettings={};
  let paymentAccount=null;
  let pickupStations=[];
  let rewardPointsBalance=0;
  let rewardMaxShare=0.5;

  const setStatus=(message='',type='')=>{
    statusBox.textContent=message;
    statusBox.className='service-review-status'+(type?' '+type:'');
  };

  const resolveUser=async()=>{
    currentUser=window.leogoAuth?.getUser?.()||null;
    if(!currentUser&&client()){
      const {data}=await client().auth.getSession();
      currentUser=data?.session?.user||null;
    }
    return currentUser;
  };

  const selectTab=(name='new')=>{
    const target=name==='mine'?'mine':'new';
    $$('[data-assisted-tab]',modal).forEach((button)=>{
      const active=button.dataset.assistedTab===target;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    $$('[data-assisted-panel]',modal).forEach((panel)=>{
      const active=panel.dataset.assistedPanel===target;
      panel.classList.toggle('active',active);
      panel.hidden=!active;
    });
  };

  const updateFulfilment=()=>{
    const pickup=fulfilment.value==='pickup';
    deliveryZoneLabel.hidden=pickup;
    pickupLabel.hidden=!pickup;
    $('[data-assisted-delivery-field]',modal).forEach((el)=>el.hidden=pickup);
    $('#assistedDeliveryZone').required=!pickup;
    pickupSelect.required=pickup;
    ['assistedCounty'].forEach((id)=>{$('#'+id).required=!pickup;});
    if(pickup&&pinLocationStatus)pinLocationStatus.textContent='';
  };

  pinLocationButton?.addEventListener('click',()=>{
    if(!navigator.geolocation){
      if(pinLocationStatus)pinLocationStatus.textContent='Location pinning is not supported on this device. Paste a Google Maps link instead.';
      return;
    }
    pinLocationButton.disabled=true;
    if(pinLocationStatus)pinLocationStatus.textContent='Getting your current delivery location…';
    navigator.geolocation.getCurrentPosition(
      ({coords})=>{
        const latitude=coords.latitude.toFixed(7);
        const longitude=coords.longitude.toFixed(7);
        $('#assistedLocationLink').value='https://www.google.com/maps?q='+latitude+','+longitude;
        if(pinLocationStatus)pinLocationStatus.textContent='✓ Delivery location pinned and the Google Maps link was added automatically.';
        pinLocationButton.disabled=false;
      },
      (error)=>{
        if(pinLocationStatus){
          pinLocationStatus.textContent=error.code===1
            ?'Location permission was not granted. Allow location access or paste a Google Maps link.'
            :'The delivery location could not be detected. Try again or paste a Google Maps link.';
        }
        pinLocationButton.disabled=false;
      },
      {enableHighAccuracy:true,timeout:15000,maximumAge:15000}
    );
  });

  const renderSelectedFiles=()=>{
    const files=[...(fileInput.files||[])];
    if(!files.length){
      fileList.innerHTML='';
      return;
    }
    fileList.innerHTML=files.map((file)=>
      '<span>📎 '+escapeHtml(file.name)+' · '+Math.max(1,Math.round(file.size/1024)).toLocaleString('en-KE')+' KB</span>'
    ).join('');
  };

  const loadSettings=async()=>{
    if(!client())return;
    const [settingRes,orderRes,accountRes,pointsRes]=await Promise.all([
      client().rpc('public_get_assisted_shopping_settings'),
      client().rpc('public_get_order_settings'),
      client().rpc('public_get_assisted_shopping_payment_account'),
      client().rpc('get_my_reward_points_balance')
    ]);
    if(!settingRes.error&&settingRes.data)settings=settingRes.data;
    if(!orderRes.error&&orderRes.data)orderSettings=orderRes.data;
    if(!accountRes.error)paymentAccount=accountRes.data||null;
    rewardPointsBalance=!pointsRes.error&&pointsRes.data?.success
      ? Math.max(0,Number(pointsRes.data.shopping_voucher_balance_kes??pointsRes.data.points_value_kes??pointsRes.data.points??0))
      : 0;
    rewardMaxShare=!pointsRes.error&&pointsRes.data?.success
      ? Math.min(0.5,Math.max(0,Number(pointsRes.data.max_checkout_cover_percent??50)/100))
      : 0.5;
    feeNote.textContent='Current Assisted Shopping service fee: '+Number(settings.service_fee_percent||0).toLocaleString('en-KE',{maximumFractionDigits:2})+'%. LEOGO applies it to the prepared item subtotal and shows the full total before you approve.';
    if(requests.length)renderRequests();
  };

  const loadPickupStations=async()=>{
    if(!client())return;
    const {data,error}=await client().from('pickup_stations')
      .select('id,station_name,county,sub_county,town,address_line,landmark,shipping_fee_kes,service_fee_percent')
      .eq('is_active',true)
      .order('display_order')
      .order('station_name');
    pickupStations=error?[]:(data||[]);
    pickupSelect.innerHTML=pickupStations.length
      ? '<option value="">Choose Pickup Station…</option>'+pickupStations.map((station)=>
          '<option value="'+escapeHtml(station.id)+'">'+escapeHtml(station.station_name)+' · '+escapeHtml(station.town||station.county)+'</option>'
        ).join('')
      : '<option value="">No active Pickup Station available</option>';
  };

  const prefillProfile=async()=>{
    await resolveUser();
    if(!currentUser||!client()){
      loginNote.textContent='Sign in to send a Shopping List to LEOGO.';
      loginNote.classList.remove('ready');
      return;
    }
    loginNote.textContent='Signed in. LEOGO will connect this Shopping List to your customer account.';
    loginNote.classList.add('ready');

    const {data}=await client().from('customer_profiles')
      .select('full_name,phone,county,sub_county,estate,nearest_landmark')
      .eq('user_id',currentUser.id).maybeSingle();

    if(!data)return;
    if(!$('#assistedReceiverName').value)$('#assistedReceiverName').value=data.full_name||'';
    if(!$('#assistedContactNumber').value)$('#assistedContactNumber').value=data.phone||'';
    if(!$('#assistedCounty').value)$('#assistedCounty').value=data.county||'';
    if(!$('#assistedSubCounty').value)$('#assistedSubCounty').value=data.sub_county||'';
    if(!$('#assistedEstate').value)$('#assistedEstate').value=data.estate||'';
    if(!$('#assistedLandmark').value)$('#assistedLandmark').value=data.nearest_landmark||'';
  };

  const fileIcon=(mime='')=>mime.startsWith('image/')?'🖼️':mime.includes('pdf')?'📄':'📎';

  const paymentAccountText=()=>{
    if(!paymentAccount)return 'Use the normal LEOGO marketplace payment instructions shown by Customer Care/Admin.';
    if(paymentAccount.account_type==='mpesa_till'){
      return 'Pay to M-Pesa Till '+(paymentAccount.till_number||'')+(paymentAccount.business_name?' · '+paymentAccount.business_name:'');
    }
    if(paymentAccount.account_type==='mpesa_paybill'){
      return 'Paybill '+(paymentAccount.paybill_number||'')+
        (paymentAccount.account_number?' · Account '+paymentAccount.account_number:'')+
        (paymentAccount.business_name?' · '+paymentAccount.business_name:'');
    }
    if(paymentAccount.account_type==='bank'){
      return [paymentAccount.bank_name,paymentAccount.account_name,paymentAccount.account_number].filter(Boolean).join(' · ');
    }
    return paymentAccount.instructions||paymentAccount.display_name||'LEOGO payment account';
  };

  const paymentOptions=()=>{
    const options=[];
    if(paymentAccount?.account_type==='mpesa_till')options.push('<option value="till">M-Pesa Till</option>');
    else if(paymentAccount?.account_type==='mpesa_paybill')options.push('<option value="paybill">M-Pesa Paybill</option>');
    else{
      options.push('<option value="till">M-Pesa Till</option>');
      options.push('<option value="paybill">M-Pesa Paybill</option>');
    }
    options.push('<option value="cod">Cash on Delivery</option>');
    return options.join('');
  };

  const itemsHtml=(items=[])=>{
    if(!items.length)return '<div class="assisted-empty-mini">LEOGO has not prepared item prices yet.</div>';
    return '<div class="assisted-quote-items">'+items.map((item)=>{
      const unavailable=item.item_status==='unavailable';
      const substituted=item.item_status==='substituted';
      return '<div class="assisted-quote-item '+escapeHtml(item.item_status)+'">'+
        '<div><strong>'+escapeHtml(item.item_name)+'</strong>'+
          '<small>Requested '+Number(item.requested_quantity||0)+' '+escapeHtml(item.unit_label||'')+
          (substituted&&item.substitution_note?' · Substitute: '+escapeHtml(item.substitution_note):'')+
          (unavailable?' · Unavailable':'')+
          '</small></div>'+
        '<div><b>'+(!unavailable?Number(item.prepared_quantity||0)+' × '+money(item.unit_price_kes):'—')+'</b><strong>'+money(item.line_total_kes)+'</strong></div>'+
      '</div>';
    }).join('')+'</div>';
  };

  const statusLabel=(status='')=>({
    submitted:'Submitted',
    under_review:'LEOGO Reviewing',
    changes_requested:'Changes Requested',
    quotation_ready:'Quotation Ready',
    payment_submitted:'Payment Verification',
    payment_rejected:'Payment Needs Attention',
    preparing:'LEOGO Preparing',
    ready_for_dispatch:'Ready for Dispatch',
    assigned:'Rider Assigned',
    picked_up:'Picked Up',
    at_sorting_center:'At LEOGO Sorting Center',
    on_the_way:'On the Way',
    at_pickup_station:'At Pickup Station',
    ready_for_pickup:'Ready for Pickup',
    completed:'Completed',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const quoteActionsHtml=(row)=>{
    if(!['quotation_ready','payment_rejected'].includes(row.status))return '';
    const total=Math.max(0,Number(row.grand_total_kes||0));
    const voucherEligible=rewardPointsBalance>0&&total>rewardPointsBalance;
    const voucherText=rewardPointsBalance<=0
      ? 'No Shopping Voucher balance available'
      : !voucherEligible
        ? 'Voucher balance '+money(rewardPointsBalance)+'. This checkout must be above that balance to use it.'
        : 'Shopping Voucher balance '+money(rewardPointsBalance)+' · covers up to 50% of this checkout';
    return '<div class="assisted-customer-actions">'+
      '<form class="assisted-payment-form" data-assisted-payment-form="'+escapeHtml(row.id)+'">'+
        '<div class="assisted-payment-account">'+escapeHtml(paymentAccountText())+'</div>'+
        '<label class="assisted-use-points"><input name="use_reward_points" type="checkbox" '+(voucherEligible?'':'disabled')+'><span><b>🎁 Use my LEOGO Shopping Voucher</b><small>'+escapeHtml(voucherText)+'</small></span></label>'+
        '<div class="assisted-points-preview"><span><small>Voucher applied</small><b data-assisted-points-applied>'+money(0)+'</b></span><span><small>Remaining to pay</small><b data-assisted-amount-due>'+money(row.grand_total_kes)+'</b></span></div>'+
        '<div class="assisted-payment-fields">'+
          '<label><span>Payment method</span><select name="payment_method" required>'+paymentOptions()+'</select></label>'+
          '<label><span>Payment reference</span><input name="payment_reference" maxlength="100" placeholder="Required for Till/Paybill remaining amount; not required for COD"></label>'+
        '</div>'+
        '<small>Shopping Voucher can cover up to 50% of an eligible checkout. The checkout total must be greater than your available voucher balance. COD applies only within the current LEOGO COD limit'+(orderSettings.cod_limit_kes!=null?' (below '+money(orderSettings.cod_limit_kes)+')':'')+'.</small>'+
        '<button type="submit">Accept & Continue</button>'+
      '</form>'+
      '<button class="assisted-change-button" type="button" data-assisted-changes="'+escapeHtml(row.id)+'">Request Changes</button>'+
    '</div>';
  };

  const updateAssistedPointsPreview=(paymentForm)=>{
    if(!paymentForm)return {applied:0,due:0};
    const row=requests.find((item)=>String(item.id)===String(paymentForm.dataset.assistedPaymentForm));
    const total=Math.max(0,Number(row?.grand_total_kes||0));
    const voucherEligible=rewardPointsBalance>0&&total>rewardPointsBalance;
    if(paymentForm.elements.use_reward_points&&!voucherEligible){
      paymentForm.elements.use_reward_points.checked=false;
      paymentForm.elements.use_reward_points.disabled=true;
    }
    const usePoints=Boolean(paymentForm.elements.use_reward_points?.checked)&&voucherEligible;
    const maxByRule=Math.round(total*rewardMaxShare*100)/100;
    const applied=usePoints?Math.min(rewardPointsBalance,maxByRule):0;
    const due=Math.max(0,Math.round((total-applied)*100)/100);
    paymentForm.dataset.pointsApplied=String(applied);
    paymentForm.dataset.amountDue=String(due);
    const appliedNode=paymentForm.querySelector('[data-assisted-points-applied]');
    const dueNode=paymentForm.querySelector('[data-assisted-amount-due]');
    if(appliedNode)appliedNode.textContent=money(applied);
    if(dueNode)dueNode.textContent=money(due);
    paymentForm.classList.toggle('points-active',applied>0);
    paymentForm.classList.remove('points-covered');
    return {applied,due};
  };

  const renderRequests=()=>{
    if(!currentUser){
      listBox.innerHTML='<div class="customer-empty-state compact"><span>🔐</span><h4>Sign in to view your Shopping Lists</h4></div>';
      return;
    }
    if(!requests.length){
      listBox.innerHTML='<div class="customer-empty-state compact"><span>📝</span><h4>No Shopping Lists yet</h4><p>Send a written list or upload a document/photo and LEOGO will prepare it.</p></div>';
      return;
    }

    listBox.innerHTML=requests.map((row)=>{
      const fulfil=row.fulfilment_method==='pickup'
        ? 'Pickup: '+(row.pickup_station_name||'Pickup Station')
        : 'Delivery: '+[row.estate,row.sub_county,row.county].filter(Boolean).join(', ');
      const files=Array.isArray(row.files)?row.files:[];
      const events=Array.isArray(row.events)?row.events:[];
      const items=Array.isArray(row.items)?row.items:[];
      return '<article class="assisted-request-card" data-assisted-request="'+escapeHtml(row.id)+'">'+
        '<header><div><span>'+escapeHtml(row.request_reference)+'</span><h3>'+escapeHtml(statusLabel(row.status))+'</h3><small>Submitted '+escapeHtml(formatDate(row.created_at,true))+'</small></div><b class="assisted-status '+escapeHtml(row.status)+'">'+escapeHtml(statusLabel(row.status))+'</b></header>'+
        '<div class="assisted-request-summary">'+
          '<span><small>Receive</small><strong>'+escapeHtml(fulfil||'—')+'</strong></span>'+
          '<span><small>Substitution</small><strong>'+escapeHtml(String(row.substitution_policy||'').replaceAll('_',' '))+'</strong></span>'+
          '<span><small>Budget</small><strong>'+(row.budget_kes!=null?money(row.budget_kes):'Not set')+'</strong></span>'+
          '<span><small>Preferred</small><strong>'+escapeHtml(row.preferred_delivery_date?formatDate(row.preferred_delivery_date):'Flexible')+'</strong></span>'+
        '</div>'+
        (row.written_list?'<div class="assisted-original-list"><small>YOUR SHOPPING LIST</small><p>'+escapeHtml(row.written_list)+'</p></div>':'')+
        (files.length?'<div class="assisted-request-files">'+files.map((file)=>
          '<button type="button" data-assisted-file="'+escapeHtml(file.path)+'">'+fileIcon(file.mime)+' '+escapeHtml(file.name)+'</button>'
        ).join('')+'</div>':'')+
        (items.length
          ? '<div class="assisted-quotation"><div class="assisted-section-title">LEOGO PREPARED QUOTATION</div>'+itemsHtml(items)+
              '<div class="assisted-totals">'+
                '<span>Items <b>'+money(row.items_subtotal_kes)+'</b></span>'+
                '<span>Assisted Shopping fee ('+Number(row.service_fee_percent_snapshot||0).toLocaleString('en-KE',{maximumFractionDigits:2})+'%) <b>'+money(row.service_fee_kes)+'</b></span>'+
                (Number(row.pickup_fee_kes||0)>0?'<span>Pickup Station fee <b>'+money(row.pickup_fee_kes)+'</b></span>':'')+
                '<span>Delivery / Station shipping <b>'+money(row.delivery_fee_kes)+'</b></span>'+
                '<strong>Total <b>'+money(row.grand_total_kes)+'</b></strong>'+
              '</div>'+
              (row.admin_notes?'<div class="assisted-admin-note"><b>LEOGO note:</b> '+escapeHtml(row.admin_notes)+'</div>':'')+
            '</div>'
          :'')+
        quoteActionsHtml(row)+
        (row.payment_status&&row.payment_status!=='not_required'?'<div class="assisted-payment-state"><b>Payment:</b> '+escapeHtml(String(row.payment_status).replaceAll('_',' '))+(row.payment_method?' · '+escapeHtml(row.payment_method.toUpperCase()):'')+'</div>':'')+
        (row.rider_name?'<div class="assisted-rider-state"><b>Rider:</b> '+escapeHtml(row.rider_name)+(row.rider_phone?' · '+escapeHtml(row.rider_phone):'')+' · '+escapeHtml(statusLabel(row.status))+'</div>':'')+
        (events.length?'<details class="assisted-timeline"><summary>View updates</summary><div>'+events.slice(0,10).map((event)=>
          '<span><b>'+escapeHtml(event.title)+'</b><small>'+escapeHtml(event.message||'')+' · '+escapeHtml(formatDate(event.created_at,true))+'</small></span>'
        ).join('')+'</div></details>':'')+
      '</article>';
    }).join('');
  };

  const loadRequests=async()=>{
    await resolveUser();
    if(!currentUser||!client()){
      requests=[];
      renderRequests();
      return;
    }
    const {data,error}=await client().rpc('customer_list_assisted_shopping_requests');
    requests=!error&&Array.isArray(data)?data:[];
    renderRequests();
  };

  const openModal=async(tab='new')=>{
    selectTab(tab);
    setStatus('');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    await Promise.all([loadSettings(),loadPickupStations(),prefillProfile(),loadRequests()]);
  };

  const closeModal=()=>{
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };

  const uploadFiles=async(user)=>{
    const files=[...(fileInput.files||[])];
    if(files.length>5)throw new Error('Upload at most 5 Shopping List files.');
    const uploaded=[];
    const folder=window.crypto?.randomUUID?.()||String(Date.now());
    try{
      for(const file of files){
        if(file.size>20*1024*1024)throw new Error(file.name+' is larger than 20 MB.');
        const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)||'shopping-list-file';
        const path=user.id+'/'+folder+'/'+Date.now()+'-'+safe;
        const {error}=await client().storage.from('assisted-shopping-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
        if(error)throw error;
        uploaded.push({path,name:file.name,mime:file.type||null,size:file.size});
      }
      return uploaded;
    }catch(error){
      if(uploaded.length){
        await client().storage.from('assisted-shopping-files').remove(uploaded.map((item)=>item.path));
      }
      throw error;
    }
  };

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    await resolveUser();
    if(!currentUser){
      closeModal();
      window.leogoAuth?.requireLogin?.('Please sign in before sending a Shopping List to LEOGO.');
      return;
    }
    if(!form.reportValidity())return;

    const written=$('#assistedWrittenList').value.trim();
    if(written.length<3&&!(fileInput.files||[]).length){
      setStatus('Write your Shopping List or upload a file/photo.','error');
      return;
    }

    const original=submitButton.textContent;
    submitButton.disabled=true;
    submitButton.textContent='Uploading & Sending…';
    setStatus('Sending your Shopping List securely to LEOGO…');

    let uploaded=[];
    try{
      uploaded=await uploadFiles(currentUser);
      const pickup=fulfilment.value==='pickup';
      const {data,error}=await client().rpc('customer_submit_assisted_shopping_request',{
        p_receiver_name:$('#assistedReceiverName').value.trim(),
        p_contact_number:$('#assistedContactNumber').value.trim(),
        p_written_list:written||null,
        p_files:uploaded,
        p_substitution_policy:$('#assistedSubstitutionPolicy').value,
        p_budget_kes:$('#assistedBudget').value?Number($('#assistedBudget').value):null,
        p_preferred_delivery_date:$('#assistedPreferredDate').value||null,
        p_preferred_delivery_time:$('#assistedPreferredTime').value||null,
        p_fulfilment_method:pickup?'pickup':'delivery',
        p_delivery_zone:pickup?'pickup':$('#assistedDeliveryZone').value,
        p_county:pickup?null:$('#assistedCounty').value.trim()||null,
        p_sub_county:pickup?null:$('#assistedSubCounty').value.trim()||null,
        p_estate:pickup?null:$('#assistedEstate').value.trim()||null,
        p_landmark:pickup?null:$('#assistedLandmark').value.trim()||null,
        p_location_link:pickup?null:$('#assistedLocationLink').value.trim()||null,
        p_pickup_station_id:pickup?(pickupSelect.value||null):null
      });
      if(error)throw error;

      setStatus('✓ '+(data?.request_reference||'Shopping List')+' received. LEOGO will prepare the quotation for your approval.','success');
      form.reset();
      fileList.innerHTML='';
      if(pinLocationStatus)pinLocationStatus.textContent='';
      updateFulfilment();
      await prefillProfile();
      await loadRequests();
      window.setTimeout(()=>selectTab('mine'),700);
    }catch(error){
      if(uploaded.length){
        await client().storage.from('assisted-shopping-files').remove(uploaded.map((item)=>item.path)).catch(()=>{});
      }
      setStatus(error?.message||'Shopping List could not be submitted.','error');
    }finally{
      submitButton.disabled=false;
      submitButton.textContent=original;
    }
  });

  listBox.addEventListener('submit',async(event)=>{
    const paymentForm=event.target.closest?.('[data-assisted-payment-form]');
    if(!paymentForm)return;
    event.preventDefault();
    const id=paymentForm.dataset.assistedPaymentForm;
    const button=paymentForm.querySelector('button[type="submit"]');
    const method=paymentForm.elements.payment_method.value;
    const reference=paymentForm.elements.payment_reference.value.trim();
    const usePoints=Boolean(paymentForm.elements.use_reward_points?.checked);
    const row=requests.find((item)=>String(item.id)===String(id));
    const total=Math.max(0,Number(row?.grand_total_kes||0));
    const {applied,due}=updateAssistedPointsPreview(paymentForm);

    if(usePoints&&total<=rewardPointsBalance){
      window.alert('Shopping Voucher can only be used when this checkout total is greater than your available voucher balance.');
      return;
    }

    if(due>0&&method!=='cod'&&reference.length<3){
      window.alert('Enter the M-Pesa payment reference for the remaining '+money(due)+'.');
      return;
    }

    const original=button.textContent;
    button.disabled=true;
    button.textContent=usePoints?'Applying Voucher…':'Submitting…';
    try{
      const {data,error}=await client().rpc('customer_accept_assisted_shopping_quote_v2',{
        p_request_id:id,
        p_payment_method:method,
        p_payment_reference:method==='cod'?null:(reference||null),
        p_use_reward_points:usePoints
      });
      if(error)throw error;
      if(Number(data?.reward_points_redeemed_kes||0)>0){
        window.dispatchEvent(new CustomEvent('leogo:walletrefresh'));
      }
      await Promise.all([loadSettings(),loadRequests()]);
    }catch(error){
      window.alert(error?.message||'The Shopping List quotation could not be accepted.');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });

  listBox.addEventListener('change',(event)=>{
    const paymentForm=event.target.closest?.('[data-assisted-payment-form]');
    if(paymentForm&&(event.target.name==='use_reward_points'||event.target.name==='payment_method')){
      updateAssistedPointsPreview(paymentForm);
    }
  });

  listBox.addEventListener('click',async(event)=>{
    const fileButton=event.target.closest?.('[data-assisted-file]');
    if(fileButton){
      const {data,error}=await client().storage.from('assisted-shopping-files').createSignedUrl(fileButton.dataset.assistedFile,600);
      if(error)return window.alert(error.message);
      window.open(data.signedUrl,'_blank','noopener');
      return;
    }

    const changeButton=event.target.closest?.('[data-assisted-changes]');
    if(changeButton){
      const note=window.prompt('What should LEOGO change in this quotation?','');
      if(!note||note.trim().length<3)return;
      const {error}=await client().rpc('customer_request_assisted_shopping_changes',{
        p_request_id:changeButton.dataset.assistedChanges,
        p_note:note.trim()
      });
      if(error)return window.alert(error.message);
      await loadRequests();
    }
  });

  openButtons.forEach((button)=>button.addEventListener('click',(event)=>{
    event.preventDefault();
    openModal('new').catch(()=>{});
  }));
  $$('[data-close-assisted-shopping]',modal).forEach((button)=>button.addEventListener('click',closeModal));
  $$('[data-assisted-tab]',modal).forEach((button)=>button.addEventListener('click',()=>{
    selectTab(button.dataset.assistedTab);
    if(button.dataset.assistedTab==='mine')loadRequests().catch(()=>{});
  }));
  $('#refreshAssistedShopping')?.addEventListener('click',()=>loadRequests().catch(()=>{}));
  fulfilment.addEventListener('change',updateFulfilment);
  fileInput.addEventListener('change',renderSelectedFiles);
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&modal.classList.contains('open'))closeModal();
  });
  document.addEventListener('leogo:authchange',()=>{
    window.setTimeout(()=>Promise.all([prefillProfile(),loadRequests()]).catch(()=>{}),60);
  });

  updateFulfilment();
  window.setTimeout(()=>loadSettings().catch(()=>{}),700);
})();

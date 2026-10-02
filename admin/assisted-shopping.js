// LEOGO Admin — Assisted Shopping / Shopping List V1
(() => {
  'use strict';

  const db=window.leogoAdminDb;
  const list=document.getElementById('assistedShoppingAdminList');
  const modal=document.getElementById('assistedShoppingAdminModal');
  if(!db||!list||!modal)return;

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

  let rows=[];
  let active=null;
  let riders=[];
  let assignableStaff=[];
  let assignments=[];
  let assistedSettings={service_fee_percent:5};

  const statusBox=$('#assistedShoppingAdminStatus');
  const modalStatus=$('#assistedAdminModalStatus');
  const filter=$('#assistedAdminStatusFilter');
  const search=$('#assistedAdminSearch');

  const setStatus=(target,message='',type='')=>{
    if(!target)return;
    target.textContent=message;
    target.className='form-status'+(type?' '+type:'');
  };

  const statusLabel=(status='')=>({
    submitted:'Submitted',
    under_review:'Under Review',
    changes_requested:'Changes Requested',
    quotation_ready:'Quotation Ready',
    payment_submitted:'Payment Submitted',
    payment_rejected:'Payment Rejected',
    preparing:'LEOGO Preparing',
    ready_for_dispatch:'Ready for Dispatch',
    assigned:'Rider Assigned',
    picked_up:'Picked Up',
    at_sorting_center:'At Sorting Center',
    on_the_way:'On the Way',
    at_pickup_station:'At Pickup Station',
    ready_for_pickup:'Ready for Pickup',
    completed:'Completed',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const attentionStatuses=new Set(['submitted','changes_requested','payment_submitted','preparing','ready_for_dispatch']);
  const assignmentFor=(requestId)=>assignments.find((item)=>String(item.request_id)===String(requestId))||null;
  const staffFor=(userId)=>assignableStaff.find((item)=>String(item.user_id)===String(userId))||null;

  const updateCounts=()=>{
    const newCount=rows.filter((row)=>['submitted','changes_requested'].includes(row.status)).length;
    const quoteCount=rows.filter((row)=>row.status==='quotation_ready').length;
    const payCount=rows.filter((row)=>row.status==='payment_submitted').length;
    const fulfilCount=rows.filter((row)=>['preparing','ready_for_dispatch','assigned','picked_up','at_sorting_center','on_the_way','at_pickup_station','ready_for_pickup'].includes(row.status)).length;
    const set=(id,value)=>{const node=$('#'+id);if(node)node.textContent=String(value);};
    set('assistedAdminNewCount',newCount);
    set('assistedAdminQuoteCount',quoteCount);
    set('assistedAdminPaymentCount',payCount);
    set('assistedAdminFulfilmentCount',fulfilCount);

    const badge=$('#sidebarAssistedShoppingCount');
    if(badge){
      const attention=rows.filter((row)=>attentionStatuses.has(row.status)).length;
      badge.textContent=String(attention);
      badge.hidden=false;
      badge.setAttribute('aria-label',attention+' Assisted Shopping item'+(attention===1?'':'s')+' requiring attention');
    }
  };

  const visibleRows=()=>{
    const term=(search?.value||'').trim().toLowerCase();
    const selected=filter?.value||'attention';
    return rows.filter((row)=>{
      const statusOk=selected==='all'
        ||(selected==='attention'&&attentionStatuses.has(row.status))
        ||row.status===selected;
      if(!statusOk)return false;
      if(!term)return true;
      return [
        row.request_reference,row.customer_name,row.customer_email,row.customer_phone,
        row.contact_number,row.written_list,row.status
      ].join(' ').toLowerCase().includes(term);
    });
  };

  const render=()=>{
    updateCounts();
    const visible=visibleRows();
    if(!visible.length){
      list.innerHTML='<div class="loading-card">No Assisted Shopping requests match this filter.</div>';
      return;
    }

    list.innerHTML=visible.map((row)=>{
      const fulfil=row.fulfilment_method==='pickup'
        ? 'Pickup · '+(row.pickup_station_name||'Station')
        : 'Delivery · '+[row.estate,row.sub_county,row.county].filter(Boolean).join(', ');
      const items=Array.isArray(row.items)?row.items:[];
      const itemSummary=items.length
        ? items.slice(0,3).map((item)=>item.item_name).join(' · ')+(items.length>3?' +'+(items.length-3):'')
        : row.written_list
          ? String(row.written_list).split(/\n+/).filter(Boolean).slice(0,2).join(' · ')
          : 'Uploaded Shopping List';

      return '<article class="assisted-admin-card" data-assisted-admin-card="'+escapeHtml(row.id)+'">'+
        '<header><div><span>'+escapeHtml(row.request_reference)+'</span><h3>'+escapeHtml(row.customer_name||row.receiver_name||'LEOGO Customer')+'</h3><small>'+escapeHtml(row.customer_phone||row.contact_number||'')+' · '+escapeHtml(formatDate(row.created_at,true))+'</small></div><b class="assisted-admin-status '+escapeHtml(row.status)+'">'+escapeHtml(statusLabel(row.status))+'</b></header>'+
        '<div class="assisted-admin-card-grid">'+
          '<span><small>Receive</small><strong>'+escapeHtml(fulfil||'—')+'</strong></span>'+
          '<span><small>Budget</small><strong>'+(row.budget_kes!=null?money(row.budget_kes):'Not set')+'</strong></span>'+
          '<span><small>Quotation</small><strong>'+(Number(row.grand_total_kes||0)>0?money(row.grand_total_kes):'Not prepared')+'</strong></span>'+
          '<span><small>Payment</small><strong>'+escapeHtml(String(row.payment_status||'not required').replaceAll('_',' '))+'</strong></span>'+
        '</div>'+
        '<p>'+escapeHtml(itemSummary||'Shopping List')+'</p>'+
        '<div class="assisted-admin-card-assignment"><small>Assigned Staff</small><strong>'+escapeHtml(assignmentFor(row.id)?.staff_name||'Not assigned')+'</strong></div>'+
        '<footer><button type="button" class="secondary" data-download-assisted-admin="'+escapeHtml(row.id)+'">⬇ Download PDF</button><button type="button" data-open-assisted-admin="'+escapeHtml(row.id)+'">'+(row.status==='submitted'||row.status==='changes_requested'?'Prepare Shopping List':'Open / Manage')+'</button></footer>'+
      '</article>';
    }).join('');
  };

  const load=async({silent=false}={})=>{
    if(!silent)setStatus(statusBox,'Loading Assisted Shopping requests…');
    const [requestsResult,ridersResult,staffResult,assignmentsResult]=await Promise.all([
      db.rpc('admin_list_assisted_shopping_requests'),
      db.rpc('admin_list_riders'),
      db.rpc('admin_list_assisted_shopping_staff'),
      db.rpc('admin_list_assisted_shopping_assignments')
    ]);
    if(requestsResult.error){
      rows=[];
      render();
      setStatus(statusBox,requestsResult.error.message||'Shopping Lists could not load.','error');
      return;
    }
    rows=Array.isArray(requestsResult.data)?requestsResult.data:[];
    riders=!ridersResult.error&&Array.isArray(ridersResult.data)?ridersResult.data:[];
    assignableStaff=!staffResult.error&&Array.isArray(staffResult.data)?staffResult.data:[];
    assignments=!assignmentsResult.error&&Array.isArray(assignmentsResult.data)?assignmentsResult.data:[];
    render();
    if(!silent)setStatus(statusBox,'Assisted Shopping requests are up to date.','success');
  };

  const rowById=(id)=>rows.find((row)=>String(row.id)===String(id));

  const quoteRowHtml=(item={})=>{
    return '<div class="assisted-admin-quote-row">'+
      '<label class="wide"><span>Item name</span><input data-q="item_name" maxlength="180" value="'+escapeHtml(item.item_name||'')+'" required></label>'+
      '<label><span>Requested qty</span><input data-q="requested_quantity" type="number" min="0.01" step="0.01" value="'+Number(item.requested_quantity||1)+'" required></label>'+
      '<label><span>Prepared qty</span><input data-q="prepared_quantity" type="number" min="0" step="0.01" value="'+Number(item.prepared_quantity??item.requested_quantity??1)+'" required></label>'+
      '<label><span>Unit</span><input data-q="unit_label" maxlength="40" value="'+escapeHtml(item.unit_label||'')+'" placeholder="kg, pcs, litre"></label>'+
      '<label><span>Unit price (KSh)</span><input data-q="unit_price_kes" type="number" min="0" step="0.01" value="'+Number(item.unit_price_kes||0)+'" required></label>'+
      '<label><span>Status</span><select data-q="item_status"><option value="available" '+(item.item_status==='available'||!item.item_status?'selected':'')+'>Available</option><option value="substituted" '+(item.item_status==='substituted'?'selected':'')+'>Substituted</option><option value="unavailable" '+(item.item_status==='unavailable'?'selected':'')+'>Unavailable</option></select></label>'+
      '<label class="wide"><span>Substitution / sourcing note</span><input data-q="substitution_note" maxlength="500" value="'+escapeHtml(item.substitution_note||'')+'" placeholder="Optional"></label>'+
      '<button class="assisted-remove-quote-row" type="button" data-remove-assisted-quote-row>Remove</button>'+
    '</div>';
  };

  const suggestedItems=(row)=>{
    const existing=Array.isArray(row.items)?row.items:[];
    if(existing.length)return existing;
    const written=String(row.written_list||'').split(/\n+/).map((line)=>line.trim()).filter(Boolean);
    if(written.length)return written.slice(0,50).map((line)=>({
      item_name:line.replace(/^[-•*\d.)\s]+/,'').trim()||line,
      requested_quantity:1,prepared_quantity:1,unit_price_kes:0,item_status:'available'
    }));
    return [{item_name:'',requested_quantity:1,prepared_quantity:1,unit_price_kes:0,item_status:'available'}];
  };

  const renderQuoteRows=(items)=>{
    $('#assistedAdminQuoteRows').innerHTML=items.map(quoteRowHtml).join('');
  };

  const fulfilmentControlsHtml=(row)=>{
    const canCancel=!['completed','cancelled'].includes(row.status)&&!['verified_paid','cod_paid'].includes(row.payment_status||'');
    let html='<div class="assisted-admin-control-head"><span>FULFILMENT & PAYMENT</span><h4>Next Actions</h4></div>';

    if(row.status==='payment_submitted'&&row.marketplace_order_id){
      html+='<div class="assisted-admin-action-row"><button type="button" data-assisted-verify="paid">Verify Payment</button><button class="danger" type="button" data-assisted-verify="rejected">Reject Payment</button></div>';
    }

    if(row.status==='preparing'){
      html+='<button type="button" class="primary-button" data-assisted-ready>Mark Prepared & Ready for Dispatch</button>';
    }

    if(row.status==='ready_for_dispatch'&&row.marketplace_order_id){
      const activeRiders=riders.filter((rider)=>rider.status==='active');
      html+='<div class="assisted-admin-rider-assign"><label><span>Assign LEOGO Rider</span><select id="assistedAdminRiderSelect"><option value="">Choose Rider…</option>'+
        activeRiders.map((rider)=>'<option value="'+escapeHtml(rider.user_id)+'">'+escapeHtml(rider.display_name)+(rider.phone?' · '+escapeHtml(rider.phone):'')+'</option>').join('')+
        '</select></label><button type="button" data-assisted-assign-rider>Assign Rider</button></div>';
    }

    if(row.rider_name){
      html+='<div class="assisted-admin-rider-current"><b>Assigned Rider:</b> '+escapeHtml(row.rider_name)+(row.rider_phone?' · '+escapeHtml(row.rider_phone):'')+' · '+escapeHtml(statusLabel(row.status))+'</div>';
    }

    if(row.marketplace_order_id){
      html+='<div class="assisted-admin-order-link"><b>Fulfilment order:</b> '+escapeHtml(row.order_reference||'Created')+' · '+escapeHtml(String(row.order_payment_status||row.payment_status||'').replaceAll('_',' '))+'</div>';
    }

    if(canCancel){
      html+='<button type="button" class="danger secondary" data-assisted-cancel>Cancel Assisted Shopping Request</button>';
    }
    return html;
  };

  const openModal=async(id)=>{
    active=rowById(id);
    if(!active)return;
    setStatus(modalStatus,'');
    $('#assistedAdminModalTitle').textContent=active.request_reference;
    $('#assistedAdminModalSubtitle').textContent=(active.customer_name||active.receiver_name||'Customer')+' · '+statusLabel(active.status);

    const fulfil=active.fulfilment_method==='pickup'
      ? 'Pickup Station: '+(active.pickup_station_name||'—')+' · '+(active.pickup_station_address||'')
      : 'Delivery: '+[active.estate,active.sub_county,active.county].filter(Boolean).join(', ');

    $('#assistedAdminRequestSummary').innerHTML=
      '<span><small>Customer</small><strong>'+escapeHtml(active.customer_name||active.receiver_name||'—')+'</strong><em>'+escapeHtml(active.customer_email||'')+' '+escapeHtml(active.contact_number||active.customer_phone||'')+'</em></span>'+
      '<span><small>Receive</small><strong>'+escapeHtml(fulfil||'—')+'</strong><em>'+escapeHtml(active.landmark||'')+'</em></span>'+
      '<span><small>Budget</small><strong>'+(active.budget_kes!=null?money(active.budget_kes):'Not set')+'</strong><em>Substitution: '+escapeHtml(String(active.substitution_policy||'').replaceAll('_',' '))+'</em></span>'+
      '<span><small>Preferred</small><strong>'+escapeHtml(active.preferred_delivery_date?formatDate(active.preferred_delivery_date):'Flexible')+'</strong><em>'+escapeHtml(active.preferred_delivery_time||'')+'</em></span>';

    const currentAssignment=assignmentFor(active.id);
    const assignmentSelect=$('#assistedAdminAssignedStaffSelect');
    assignmentSelect.innerHTML='<option value="">No staff assigned</option>'+assignableStaff.map((item)=>
      '<option value="'+escapeHtml(item.user_id)+'">'+escapeHtml(item.display_name)+' · '+escapeHtml(String(item.staff_role||'staff').replaceAll('_',' '))+(item.phone?' · '+escapeHtml(item.phone):'')+'</option>'
    ).join('');
    assignmentSelect.value=currentAssignment?.staff_user_id||'';
    setStatus($('#assistedAdminAssignmentStatus'),currentAssignment
      ? 'Assigned to '+currentAssignment.staff_name+' · '+String(currentAssignment.staff_role||'staff').replaceAll('_',' ')
      : 'No LEOGO staff member is currently assigned.');

    $('#assistedAdminOriginalList').innerHTML=active.written_list
      ? '<small>CUSTOMER SHOPPING LIST</small><pre>'+escapeHtml(active.written_list)+'</pre>'
      : '<small>CUSTOMER SHOPPING LIST</small><p>Customer submitted files without a written list.</p>';

    const files=Array.isArray(active.files)?active.files:[];
    $('#assistedAdminFiles').innerHTML=files.length
      ? files.map((file)=>'<button type="button" data-assisted-admin-file="'+escapeHtml(file.path)+'">📎 '+escapeHtml(file.name)+'</button>').join('')
      : '';

    const locked=Boolean(active.marketplace_order_id)||['payment_submitted','preparing','ready_for_dispatch','assigned','picked_up','at_sorting_center','on_the_way','at_pickup_station','ready_for_pickup','completed','cancelled'].includes(active.status);
    const builder=$('.assisted-admin-quote-builder');
    builder.hidden=locked;
    if(!locked){
      renderQuoteRows(suggestedItems(active));
      $('#assistedAdminQuoteNote').value=active.admin_notes||'';
      $('#assistedAdminQuotePreview').textContent=active.grand_total_kes>0
        ? 'Current quotation: Items '+money(active.items_subtotal_kes)+' + Assisted fee '+money(active.service_fee_kes)+' + delivery/pickup '+money(Number(active.delivery_fee_kes||0)+Number(active.pickup_fee_kes||0))+' = '+money(active.grand_total_kes)
        : 'Current Assisted Shopping fee: '+Number(assistedSettings.service_fee_percent||0).toLocaleString('en-KE',{maximumFractionDigits:2})+'%. Secure totals are calculated when you save.';
    }

    const controls=$('#assistedAdminFulfilmentControls');
    controls.innerHTML=fulfilmentControlsHtml(active);
    controls.hidden=!active.marketplace_order_id&&!['payment_submitted','preparing','ready_for_dispatch'].includes(active.status)&&active.status!=='quotation_ready';

    modal.hidden=false;
  };

  const closeModal=()=>{
    modal.hidden=true;
    active=null;
    setStatus(modalStatus,'');
  };

  const collectQuoteItems=()=>{
    return $$('.assisted-admin-quote-row',$('#assistedAdminQuoteRows')).map((row)=>({
      item_name:$('[data-q="item_name"]',row).value.trim(),
      requested_quantity:Number($('[data-q="requested_quantity"]',row).value||0),
      prepared_quantity:Number($('[data-q="prepared_quantity"]',row).value||0),
      unit_label:$('[data-q="unit_label"]',row).value.trim()||null,
      unit_price_kes:Number($('[data-q="unit_price_kes"]',row).value||0),
      item_status:$('[data-q="item_status"]',row).value,
      substitution_note:$('[data-q="substitution_note"]',row).value.trim()||null
    }));
  };

  const saveQuote=async(button)=>{
    if(!active)return;
    const items=collectQuoteItems();
    if(!items.length)return setStatus(modalStatus,'Add at least one quotation item.','error');
    if(items.some((item)=>item.item_name.length<2||item.requested_quantity<=0||item.prepared_quantity<0||item.unit_price_kes<0)){
      return setStatus(modalStatus,'Check item names, quantities and prices.','error');
    }
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Preparing Quotation…';
    try{
      const {error}=await db.rpc('admin_prepare_assisted_shopping_quote',{
        p_request_id:active.id,
        p_items:items,
        p_admin_notes:$('#assistedAdminQuoteNote').value.trim()||null
      });
      if(error)throw error;
      setStatus(modalStatus,'Quotation prepared and sent to the customer for approval.','success');
      await load({silent:true});
      await openModal(active.id);
    }catch(error){
      setStatus(modalStatus,error?.message||'Quotation could not be prepared.','error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  const saveStaffAssignment=async()=>{
    if(!active)return;
    const button=$('#saveAssistedStaffAssignment');
    const selected=$('#assistedAdminAssignedStaffSelect')?.value||'';
    const original=button?.textContent||'Save Assignment';
    if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      const {data,error}=await db.rpc('admin_assign_assisted_shopping_staff',{
        p_request_id:active.id,
        p_staff_user_id:selected||null
      });
      if(error)throw error;
      await load({silent:true});
      const fresh=rowById(active.id);
      if(fresh)active=fresh;
      const assignment=assignmentFor(active.id);
      setStatus($('#assistedAdminAssignmentStatus'),assignment
        ? 'Assigned to '+assignment.staff_name+'. This staff member can now securely download the Shopping List and attachments.'
        : 'Staff assignment removed. Only authorized Admin can access this Shopping List.','success');
      $('#assistedAdminAssignedStaffSelect').value=assignment?.staff_user_id||'';
      return data;
    }catch(error){
      setStatus($('#assistedAdminAssignmentStatus'),error?.message||'Staff assignment could not be saved.','error');
      return null;
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  };

  const downloadPdf=(row)=>{
    if(!row)return;
    const assignment=assignmentFor(row.id);
    try{
      window.leogoAssistedShoppingPdf?.download(row,{
        assignedStaffName:assignment?.staff_name||''
      });
      if(!window.leogoAssistedShoppingPdf)throw new Error('Shopping List PDF generator is not available yet.');
    }catch(error){
      setStatus(modalStatus,error?.message||'Shopping List PDF could not be created.','error');
    }
  };

  const verifyPayment=async(paid)=>{
    if(!active?.marketplace_order_id)return;
    const note=paid
      ? window.prompt('Optional payment verification note:','')||''
      : window.prompt('Reason payment was rejected:','')||'Payment reference could not be verified';
    const {error}=await db.rpc('admin_verify_marketplace_order_payment',{
      p_order_id:active.marketplace_order_id,
      p_paid:paid,
      p_notes:note||null
    });
    if(error)return setStatus(modalStatus,error.message,'error');
    await load({silent:true});
    await openModal(active.id);
  };

  const markReady=async()=>{
    if(!active)return;
    const note=window.prompt('Optional preparation / dispatch note:','')||'';
    const {error}=await db.rpc('admin_mark_assisted_shopping_ready',{
      p_request_id:active.id,
      p_note:note||null
    });
    if(error)return setStatus(modalStatus,error.message,'error');
    await load({silent:true});
    await openModal(active.id);
  };

  const assignRider=async()=>{
    if(!active?.marketplace_order_id)return;
    const riderId=$('#assistedAdminRiderSelect')?.value||'';
    if(!riderId)return setStatus(modalStatus,'Choose a Rider first.','error');
    const {error}=await db.rpc('admin_assign_rider_to_order',{
      p_order_id:active.marketplace_order_id,
      p_rider_id:riderId
    });
    if(error)return setStatus(modalStatus,error.message,'error');
    await load({silent:true});
    await openModal(active.id);
  };

  const cancelRequest=async()=>{
    if(!active)return;
    const note=window.prompt('Why is this Assisted Shopping request being cancelled?','');
    if(!note||note.trim().length<3)return;
    const {error}=await db.rpc('admin_cancel_assisted_shopping_request',{
      p_request_id:active.id,
      p_note:note.trim()
    });
    if(error)return setStatus(modalStatus,error.message,'error');
    await load({silent:true});
    closeModal();
  };

  const openFile=async(path)=>{
    const {data,error}=await db.storage.from('assisted-shopping-files').createSignedUrl(path,600);
    if(error)return setStatus(modalStatus,error.message,'error');
    window.open(data.signedUrl,'_blank','noopener');
  };

  const loadSettings=async()=>{
    const {data,error}=await db.rpc('admin_get_assisted_shopping_settings');
    if(error)return;
    assistedSettings=data||assistedSettings;
    const form=$('#assistedShoppingSettingsForm');
    if(form?.elements.service_fee_percent)form.elements.service_fee_percent.value=Number(assistedSettings.service_fee_percent||0);
    const preview=$('#assistedShoppingSettingsPreview');
    if(preview)preview.textContent='Current Assisted Shopping service fee: '+Number(assistedSettings.service_fee_percent||0).toLocaleString('en-KE',{maximumFractionDigits:2})+'%. New quotations will snapshot this rate.';
  };

  $('#assistedShoppingSettingsForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const button=event.submitter;
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Saving…';
    try{
      const value=Number(event.currentTarget.elements.service_fee_percent.value);
      const {data,error}=await db.rpc('admin_save_assisted_shopping_settings',{p_service_fee_percent:value});
      if(error)throw error;
      assistedSettings=data||assistedSettings;
      await loadSettings();
      setStatus($('#assistedShoppingSettingsStatus'),'Assisted Shopping service fee saved. Existing prepared quotations were not changed.','success');
    }catch(error){
      setStatus($('#assistedShoppingSettingsStatus'),error?.message||'Assisted Shopping fee could not be saved.','error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });

  $('#refreshAssistedShoppingAdmin')?.addEventListener('click',async(event)=>{
    const button=event.currentTarget;
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Refreshing…';
    try{await load();}finally{button.disabled=false;button.textContent=original;}
  });
  search?.addEventListener('input',render);
  filter?.addEventListener('change',render);

  list.addEventListener('click',(event)=>{
    const downloadButton=event.target.closest?.('[data-download-assisted-admin]');
    if(downloadButton){
      downloadPdf(rowById(downloadButton.dataset.downloadAssistedAdmin));
      return;
    }
    const button=event.target.closest?.('[data-open-assisted-admin]');
    if(button)openModal(button.dataset.openAssistedAdmin).catch(()=>{});
  });

  $('#addAssistedQuoteItem')?.addEventListener('click',()=>{
    $('#assistedAdminQuoteRows').insertAdjacentHTML('beforeend',quoteRowHtml({
      requested_quantity:1,prepared_quantity:1,unit_price_kes:0,item_status:'available'
    }));
  });
  $('#assistedAdminQuoteRows')?.addEventListener('click',(event)=>{
    const remove=event.target.closest?.('[data-remove-assisted-quote-row]');
    if(remove)remove.closest('.assisted-admin-quote-row')?.remove();
  });
  $('#saveAssistedQuote')?.addEventListener('click',(event)=>saveQuote(event.currentTarget));
  $('#saveAssistedStaffAssignment')?.addEventListener('click',()=>saveStaffAssignment());
  $('#downloadAssistedShoppingPdf')?.addEventListener('click',()=>downloadPdf(active));

  modal.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-close-assisted-admin]')){closeModal();return;}
    const file=event.target.closest?.('[data-assisted-admin-file]');
    if(file){openFile(file.dataset.assistedAdminFile);return;}
    const verify=event.target.closest?.('[data-assisted-verify]');
    if(verify){verifyPayment(verify.dataset.assistedVerify==='paid');return;}
    if(event.target.closest?.('[data-assisted-ready]')){markReady();return;}
    if(event.target.closest?.('[data-assisted-assign-rider]')){assignRider();return;}
    if(event.target.closest?.('[data-assisted-cancel]')){cancelRequest();}
  });

  document.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-admin-view="assisted"]')){
      window.setTimeout(()=>load({silent:true}).catch(()=>{}),60);
    }
    if(event.target.closest?.('[data-settings-card="orders"]')||event.target.closest?.('[data-settings-panel="orders"]')){
      window.setTimeout(()=>loadSettings().catch(()=>{}),60);
    }
  });

  document.addEventListener('DOMContentLoaded',async()=>{
    const {data}=await db.auth.getSession();
    if(data?.session?.user){
      await Promise.all([load({silent:true}),loadSettings()]);
    }
  });

  db.auth.onAuthStateChange((_event,session)=>{
    if(session?.user){
      window.setTimeout(()=>Promise.all([load({silent:true}),loadSettings()]).catch(()=>{}),80);
    }else{
      rows=[];
      render();
    }
  });
})();

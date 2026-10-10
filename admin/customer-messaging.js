// LEOGO Customer Messaging — isolated Admin module; no changes to automatic order alerts.
(() => {
  'use strict';
  const $ = (selector,root=document)=>root.querySelector(selector);
  const db=window.leogoAdminDb;
  const panel=$('[data-admin-panel="customer_messages"]');
  if(!db||!panel)return;
  const selected=new Set();
  let customers=[];
  let loaded=false;
  let sending=false;
  let requestKey='';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const setStatus=(message,type='')=>{
    const node=$('#messageFormStatus');
    if(node){node.textContent=message;node.className='form-status'+(type?' '+type:'');}
  };
  const newRequestKey=()=>window.crypto?.randomUUID?.()||'';
  const matches=()=>{
    const term=($('#messageCustomerSearch')?.value||'').trim().toLowerCase();
    return customers.filter(c=>[c.full_name,c.email,c.phone,c.county,c.sub_county]
      .some(v=>String(v||'').toLowerCase().includes(term)));
  };
  const updatePreview=()=>{
    const form=$('#customerMessageForm');
    if(!form)return;
    const channel=form.elements.channel.value;
    const purpose=form.elements.purpose.value;
    const subject=form.elements.subject.value.trim();
    const body=form.elements.message.value.trim();
    $('#messageSubjectRow').hidden=channel==='sms';
    form.elements.subject.required=channel!=='sms';
    $('#messageCharacters').textContent=String(form.elements.message.value.length)+' / 400 characters';
    $('#messageSelectedCount').textContent=selected.size+' selected';
    $('#messagePreviewSubject').textContent=channel==='sms'?'Afrinet SMS':subject||'Email subject';
    const first=customers.find(c=>selected.has(c.user_id));
    const firstName=(first?.full_name||'Customer').trim();
    $('#messagePreviewText').textContent=body
      ?body.replaceAll('{name}',firstName):'Your message will appear here.';
    $('#messagePreviewRecipients').textContent=selected.size
      ?selected.size+' customer(s) · '+(channel==='both'?'SMS + Email':channel.toUpperCase())+
        (purpose==='promotion'?' · opted-in recipients only':' · customer care notice')
      :'Choose one or more customers.';
    $('#messageSendButton').disabled=sending||!selected.size||!body||
      (channel!=='sms'&&!subject)||!requestKey;
  };
  const renderCustomers=()=>{
    const rows=matches();
    const list=$('#messageCustomerList');
    list.innerHTML=rows.length?rows.slice(0,250).map(c=>`
      <label class="message-recipient">
        <input type="checkbox" data-message-customer="${esc(c.user_id)}"
          ${selected.has(c.user_id)?'checked':''}>
        <span><strong>${esc(c.full_name||'Customer')}</strong>
          <small>${esc(c.email||'No email')} · ${esc(c.phone||'No phone')}</small>
          <small>${esc(c.county||'')}</small></span>
      </label>`).join('')
      :'<p class="message-empty">No registered customers match the search.</p>';
    if(rows.length>250)list.insertAdjacentHTML('beforeend',
      '<small>Showing the first 250 matches. Narrow your search to select others.</small>');
    updatePreview();
  };
  const loadCustomers=async()=>{
    $('#messageCustomerList').textContent='Loading registered customers…';
    try{
      const {data,error}=await db.rpc('admin_list_customers');
      if(error)throw error;
      customers=Array.isArray(data)?data:[];
      loaded=true;
      renderCustomers();
    }catch(error){
      $('#messageCustomerList').textContent=error?.message||'Unable to load customer list.';
      setStatus('Access or connection error. Customer messaging requires Customer Read and Settings Manage permissions.','error');
    }
  };
  const loadHistory=async()=>{
    try{
      const {data,error}=await db.rpc('admin_customer_message_history');
      if(error)throw error;
      const history=Array.isArray(data)?data:[];
      $('#messageHistoryList').innerHTML=history.length?history.map(c=>`
        <article class="message-history-row">
          <div><strong>${esc(c.subject||c.message_preview||'LEOGO message')}</strong>
            <small>${esc(new Date(c.created_at).toLocaleString('en-KE'))} · ${esc(c.channel.toUpperCase())} · ${esc(c.purpose)}</small>
          </div>
          <p>${esc(c.message_preview||'')}</p>
          <div class="message-result-stats"><span>${Number(c.queued_messages||0)} queued</span>
            <span>${Number(c.accepted_by_provider||0)} accepted</span>
            <span>${Number(c.pending||0)} pending</span>
            <span>${Number(c.failed||0)} failed</span></div>
        </article>`).join(''):'<p class="message-empty">No Admin customer messages have been queued yet.</p>';
    }catch(error){
      $('#messageHistoryList').textContent=error?.message||'History unavailable.';
    }
  };
  panel.addEventListener('change',event=>{
    const checkbox=event.target.closest?.('[data-message-customer]');
    if(!checkbox)return;
    if(checkbox.checked && selected.size>=100){
      checkbox.checked=false;setStatus('Maximum 100 customers in a single send. Narrow your selection.','error');return;
    }
    checkbox.checked?selected.add(checkbox.dataset.messageCustomer):selected.delete(checkbox.dataset.messageCustomer);
    updatePreview();
  });
  $('#messageCustomerSearch').addEventListener('input',renderCustomers);
  $('#messageSelectVisible').addEventListener('click',()=>{
    const rows=matches();
    for(const item of rows){if(selected.size>=100)break;selected.add(item.user_id);}
    if(rows.length>100)setStatus('Selected up to 100 customers. Further customers require a separate send.','');
    renderCustomers();
  });
  $('#messageClearSelection').addEventListener('click',()=>{
    selected.clear();renderCustomers();setStatus('');
  });
  const form=$('#customerMessageForm');
  form.addEventListener('input',updatePreview);
  form.addEventListener('change',updatePreview);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(sending||!selected.size)return;
    const ids=[...selected];
    if(ids.length>100){setStatus('Maximum 100 customers per message.','error');return;}
    const channel=form.elements.channel.value;
    const purpose=form.elements.purpose.value;
    const subject=form.elements.subject.value.trim();
    const body=form.elements.message.value.trim();
    if(body.length<3||body.length>400){setStatus('Message must be 3–400 characters.','error');return;}
    if(channel!=='sms'&&(subject.length<3||subject.length>120)){
      setStatus('Enter an email subject between 3 and 120 characters.','error');return;
    }
    const confirmed=window.confirm(
      'Send '+(purpose==='promotion'?'opt-in promotional':'customer service')+' message via '+
      channel.toUpperCase()+' to up to '+ids.length+' selected customers?'+
      '\\n\\nMESSAGE PREVIEW:\\n'+body.slice(0,220)+
      '\\n\\nProvider charges may apply. This cannot be undone.');
    if(!confirmed)return;
    if(!requestKey){setStatus('Secure request identifier unavailable. Reopen this page.','error');return;}
    sending=true;updatePreview();setStatus('Queuing customer messages securely…');
    try{
      const {data,error}=await db.rpc('admin_queue_customer_message',{
        p_customers:ids,p_channel:channel,p_purpose:purpose,
        p_subject:subject||null,p_message:body,p_request_key:requestKey
      });
      if(error)throw error;
      setStatus('Queued '+Number(data?.queued||0)+' SMS/email job(s). '+Number(data?.skipped||0)+
        ' skipped (missing, duplicate, or no promotional consent). Provider delivery updates appear in history.','success');
      requestKey=newRequestKey();selected.clear();
      form.elements.message.value='';form.elements.subject.value='';
      renderCustomers();await loadHistory();
    }catch(error){
      setStatus(error?.message||'Could not queue the messages. Try again using the same request.','error');
    }finally{sending=false;updatePreview();}
  });
  $('#messageRefresh').addEventListener('click',()=>Promise.all([loadCustomers(),loadHistory()]));
  $('#messageRefreshHistory').addEventListener('click',loadHistory);
  document.addEventListener('click',event=>{
    const nav=event.target.closest?.('[data-admin-view="customer_messages"]');
    if(!nav)return;
    // Admin core handles view navigation and role restrictions.
    window.setTimeout(()=>{if(panel.classList.contains('active')){
      if(!loaded)loadCustomers();loadHistory();
    }},80);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    requestKey=newRequestKey();updatePreview();
    if(panel.classList.contains('active')){loadCustomers();loadHistory();}
  });
})();

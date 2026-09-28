
(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(v)=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const pill=(s)=>'<span class="cyber-admin-status '+esc(s||'')+'">'+esc(String(s||'—').replaceAll('_',' '))+'</span>';
let providers=[],services=[],products=[],orders=[],profileChanges=[],settings=null;

const ensureUI=()=>{
  const nav=$('.admin-nav');
  if(nav&&!$('#openCyberAdmin')){
    const providerButton=nav.querySelector('[data-admin-view="providers"]');
    const button=document.createElement('button');
    button.id='openCyberAdmin';button.type='button';
    button.innerHTML='<i>🖥️</i><span>Cyber Services</span><em id="sidebarCyberCount">0</em>';
    providerButton?.insertAdjacentElement('afterend',button);
  }
  const main=$('.admin-main');
  if(main&&!$('#cyberAdminPanel')){
    const panel=document.createElement('section');
    panel.className='admin-panel cyber-admin-panel';
    panel.id='cyberAdminPanel';
    panel.dataset.adminPanel='cyber';
    panel.innerHTML=`
      <div class="section-head"><div><span>CYBER & DIGITAL SERVICES</span><h2>Cyber Services</h2><p>Approve Cyber shops, service listings and products, verify customer payments, and manage delivery fees.</p></div><button id="refreshCyberAdmin" class="primary-button" type="button">↻ Refresh Cyber</button></div>
      <div class="cyber-admin-summary">
        <article><span>Cyber Shops</span><strong id="cyberAdminProviderCount">0</strong><small>All registrations</small></article>
        <article><span>Pending Shops</span><strong id="cyberAdminPendingProviders">0</strong><small>Need approval</small></article>
        <article><span>Services</span><strong id="cyberAdminServiceCount">0</strong><small>Cyber services</small></article>
        <article><span>Products</span><strong id="cyberAdminProductCount">0</strong><small>Shop items</small></article>
        <article><span>Payments to Verify</span><strong id="cyberAdminPaymentCount">0</strong><small>Cyber orders</small></article>
      </div>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>DELIVERY SETTINGS</span><h3>Cyber Delivery Fees</h3><p>Customers can pick up from the pinned Cyber shop or choose delivery using these Admin-controlled rates.</p></div></div>
        <form id="cyberAdminSettingsForm" class="cyber-admin-settings">
          <label>CBD / Town Centre fee (KSh)<input id="cyberAdminCbdFee" type="number" min="0" step="1" required></label>
          <label>Estate / Nearby fee (KSh)<input id="cyberAdminEstateFee" type="number" min="0" step="1" required></label>
          <label>Outside Town fee (KSh)<input id="cyberAdminOutsideFee" type="number" min="0" step="1" required></label>
          <label class="wide">Customer delivery note<textarea id="cyberAdminDeliveryNote" rows="2"></textarea></label>
          <div class="cyber-admin-settings-actions"><button type="submit">Save Delivery Fees</button></div>
        </form>
        <div id="cyberAdminSettingsStatus" class="cyber-admin-form-status"></div>
      </section>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>CYBER PARTNERS</span><h3>Cyber Shop Applications & Accounts</h3><p>Exact shop location and verification documents are available before approval.</p></div></div>
        <div class="responsive-table"><table class="cyber-admin-table"><thead><tr><th>Cyber Shop</th><th>Contact</th><th>Location</th><th>Records</th><th>Status</th><th>Verification</th><th>Action</th></tr></thead><tbody id="cyberAdminProvidersBody"></tbody></table></div>
      </section>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>PROFILE EDITS</span><h3>Approved Cyber Profile Changes</h3><p>Current approved details remain active until these edits are approved.</p></div></div>
        <div class="responsive-table"><table class="cyber-admin-table"><thead><tr><th>Partner</th><th>Proposed Change</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody id="cyberAdminProfileChangesBody"></tbody></table></div>
      </section>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>SERVICE APPROVALS</span><h3>Cyber Services</h3><p>Printing, photocopying, typesetting, online services and other Cyber listings.</p></div></div>
        <div class="responsive-table"><table class="cyber-admin-table"><thead><tr><th>Service</th><th>Cyber</th><th>Pricing</th><th>File Upload</th><th>Status</th><th>Action</th></tr></thead><tbody id="cyberAdminServicesBody"></tbody></table></div>
      </section>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>PRODUCT APPROVALS</span><h3>Cyber Shop Items</h3><p>Products sold by Cyber partners are reviewed before customer publication.</p></div></div>
        <div class="responsive-table"><table class="cyber-admin-table"><thead><tr><th>Product</th><th>Cyber</th><th>Price</th><th>Stock</th><th>Status</th><th>Action</th></tr></thead><tbody id="cyberAdminProductsBody"></tbody></table></div>
      </section>

      <section class="cyber-admin-card">
        <div class="cyber-admin-card-head"><div><span>CYBER ORDERS</span><h3>Customer Orders & Payments</h3><p>Verify Cyber order payments before the partner starts work. Uploaded documents remain private to the customer, Cyber partner and authorized Admin.</p></div></div>
        <div class="responsive-table"><table class="cyber-admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Cyber</th><th>Fulfilment</th><th>Amount</th><th>Payment</th><th>Order Status</th><th>Files</th><th>Action</th></tr></thead><tbody id="cyberAdminOrdersBody"></tbody></table></div>
      </section>`;
    main.appendChild(panel);
  }
};

const signedUrl=async(bucket,path)=>{
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,600);
  if(error)throw error;
  window.open(data.signedUrl,'_blank','noopener');
};

const actionButtons=(kind,id,status)=>{
  if(status==='approved')return '<div class="cyber-admin-actions"><button class="review" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="suspend">Suspend</button></div>';
  if(status==='suspended')return '<div class="cyber-admin-actions"><button class="approve" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="reactivate">Reactivate</button></div>';
  return '<div class="cyber-admin-actions"><button class="review" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="under_review">Review</button><button class="change" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="changes_requested">Correction</button><button class="reject" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="reject">Reject</button><button class="approve" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="approve">Approve</button></div>';
};

const normalApprovalButtons=(kind,id,status)=>{
  if(status==='approved')return pill(status);
  return '<div class="cyber-admin-actions"><button class="review" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="under_review">Review</button><button class="change" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="changes_requested">Correction</button><button class="reject" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="reject">Reject</button><button class="approve" data-cyber-action="'+kind+'" data-id="'+id+'" data-decision="approve">Approve</button></div>';
};

const render=()=>{
  $('#cyberAdminProviderCount').textContent=providers.length;
  $('#cyberAdminPendingProviders').textContent=providers.filter(p=>['submitted','under_review','changes_requested'].includes(p.application_status)).length;
  $('#cyberAdminServiceCount').textContent=services.length;
  $('#cyberAdminProductCount').textContent=products.length;
  $('#cyberAdminPaymentCount').textContent=orders.filter(o=>o.payment_status==='pending_verification').length;
  const pending=providers.filter(p=>['submitted','under_review','changes_requested'].includes(p.application_status)).length+
    services.filter(s=>['pending','under_review','changes_requested'].includes(s.approval_status)).length+
    products.filter(p=>['pending','under_review','changes_requested'].includes(p.approval_status)).length+
    orders.filter(o=>o.payment_status==='pending_verification').length+
    profileChanges.length;
  const badge=$('#sidebarCyberCount');if(badge){badge.textContent=pending;badge.hidden=pending<1;}

  $('#cyberAdminProvidersBody').innerHTML=providers.length?providers.map(p=>`
    <tr>
      <td><strong>${esc(p.business_name)}</strong><small>${esc(p.owner_name)}</small></td>
      <td><strong>${esc(p.phone)}</strong><small>${esc(p.email||'')}</small></td>
      <td><strong>${esc(p.location_details)}</strong><small>${esc(p.town+' · '+p.county)}</small><a href="${esc(p.shop_map_link||('https://www.google.com/maps?q='+p.shop_latitude+','+p.shop_longitude))}" target="_blank" rel="noopener">Open map ↗</a></td>
      <td><strong>${p.service_count} services · ${p.product_count} items</strong><small>${p.order_count} orders</small></td>
      <td>${pill(p.application_status)}</td>
      <td><div class="cyber-admin-file-buttons">${p.business_id_document_path?'<button data-admin-cyber-file="cyber-verification|'+esc(p.business_id_document_path)+'">Business ID</button>':''}${p.business_licence_path?'<button data-admin-cyber-file="cyber-verification|'+esc(p.business_licence_path)+'">Licence</button>':''}${p.registration_certificate_path?'<button data-admin-cyber-file="cyber-verification|'+esc(p.registration_certificate_path)+'">Certificate</button>':''}</div></td>
      <td>${actionButtons('provider',p.user_id,p.application_status)}</td>
    </tr>`).join(''):'<tr><td colspan="7" class="cyber-admin-empty">No Cyber partners yet.</td></tr>';

  $('#cyberAdminProfileChangesBody').innerHTML=profileChanges.length?profileChanges.map(r=>`
    <tr><td><strong>${esc(r.business_name)}</strong><small>${esc(r.email||'')}</small></td><td><strong>${esc(r.payload?.business_name||'Profile update')}</strong><small>${esc(r.payload?.location_details||'')}</small></td><td>${pill(r.status)}</td><td>${new Date(r.submitted_at).toLocaleString()}</td><td>${normalApprovalButtons('profile',r.id,r.status)}</td></tr>`).join(''):'<tr><td colspan="5" class="cyber-admin-empty">No pending Cyber profile changes.</td></tr>';

  $('#cyberAdminServicesBody').innerHTML=services.length?services.map(s=>`
    <tr><td><strong>${esc(s.service_name)}</strong><small>${esc(s.service_category.replaceAll('_',' '))}</small></td><td>${esc(s.provider_name)}</td><td><strong>${s.pricing_model==='quote'?'Quotation':money(s.price_kes)}</strong><small>${esc(s.pricing_model.replaceAll('_',' '))}${s.unit_label?' · '+esc(s.unit_label):''}</small></td><td>${s.requires_file_upload?'Required':'Optional'}</td><td>${pill(s.approval_status)}</td><td>${normalApprovalButtons('service',s.id,s.approval_status)}</td></tr>`).join(''):'<tr><td colspan="6" class="cyber-admin-empty">No Cyber services yet.</td></tr>';

  $('#cyberAdminProductsBody').innerHTML=products.length?products.map(p=>`
    <tr><td><strong>${esc(p.product_name)}</strong><small>${esc(p.description||'')}</small></td><td>${esc(p.provider_name)}</td><td>${money(p.price_kes)}</td><td>${esc(p.quantity_available)} ${esc(p.measurement_unit)}</td><td>${pill(p.approval_status)}</td><td>${normalApprovalButtons('product',p.id,p.approval_status)}</td></tr>`).join(''):'<tr><td colspan="6" class="cyber-admin-empty">No Cyber products yet.</td></tr>';

  $('#cyberAdminOrdersBody').innerHTML=orders.length?orders.map(o=>{
    const files=Array.isArray(o.files)?o.files:[];
    const action=o.payment_status==='pending_verification'
      ? '<div class="cyber-admin-actions"><button class="verify" data-cyber-payment="'+o.id+'" data-decision="verify">Verify</button><button class="reject" data-cyber-payment="'+o.id+'" data-decision="reject">Reject</button></div>'
      : '';
    return `<tr><td><strong>${esc(o.order_reference)}</strong><small>${esc(o.item_name)} · ${esc(o.item_type)}</small></td><td>${esc(o.customer_name)}</td><td>${esc(o.provider_name)}</td><td><strong>${esc(o.fulfilment_method)}</strong><small>${esc(o.delivery_address||'Shop pickup')}</small></td><td><strong>${money(o.total_kes)}</strong><small>Delivery ${money(o.delivery_fee_kes)}</small></td><td>${pill(o.payment_status)}<small>${esc(o.payment_reference||'')}</small></td><td>${pill(o.order_status)}</td><td><div class="cyber-admin-file-buttons">${files.map((f,i)=>'<button data-admin-cyber-file="cyber-order-files|'+esc(f.path)+'">File '+(i+1)+'</button>').join('')}</div></td><td>${action}</td></tr>`;
  }).join(''):'<tr><td colspan="9" class="cyber-admin-empty">No Cyber customer orders yet.</td></tr>';

  if(settings){
    $('#cyberAdminCbdFee').value=settings.cbd_delivery_fee_kes??50;
    $('#cyberAdminEstateFee').value=settings.estate_delivery_fee_kes??80;
    $('#cyberAdminOutsideFee').value=settings.outside_town_delivery_fee_kes??200;
    $('#cyberAdminDeliveryNote').value=settings.delivery_note||'';
  }
  bindActions();
};

const bindActions=()=>{
  $$('[data-admin-cyber-file]').forEach(b=>b.addEventListener('click',()=>{
    const i=b.dataset.adminCyberFile.indexOf('|');
    const bucket=b.dataset.adminCyberFile.slice(0,i),path=b.dataset.adminCyberFile.slice(i+1);
    signedUrl(bucket,path).catch(e=>alert(e.message));
  }));
  $$('[data-cyber-action]').forEach(b=>b.addEventListener('click',()=>reviewRecord(b)));
  $$('[data-cyber-payment]').forEach(b=>b.addEventListener('click',()=>reviewPayment(b)));
};

const reviewRecord=async(button)=>{
  const kind=button.dataset.cyberAction,decision=button.dataset.decision,id=button.dataset.id;
  let notes='';
  if(['reject','changes_requested','suspend'].includes(decision)){
    notes=prompt('Enter the Admin reason / correction note:','')||'';
    if(notes.trim().length<3)return;
  }else if(decision==='under_review'){
    notes=prompt('Optional Admin note:','')||'';
  }
  const rpc=kind==='provider'?'admin_review_cyber_provider':kind==='service'?'admin_review_cyber_service':kind==='product'?'admin_review_cyber_product':'admin_review_cyber_profile_change';
  const args=kind==='provider'?{p_user_id:id,p_decision:decision,p_notes:notes||null}:kind==='service'?{p_service_id:id,p_decision:decision,p_notes:notes||null}:kind==='product'?{p_product_id:id,p_decision:decision,p_notes:notes||null}:{p_change_id:id,p_decision:decision,p_notes:notes||null};
  button.disabled=true;
  const {error}=await client.rpc(rpc,args);
  button.disabled=false;
  if(error){alert(error.message);return;}
  await loadAll();
};

const reviewPayment=async(button)=>{
  const decision=button.dataset.decision;
  let notes='';
  if(decision==='reject'){notes=prompt('Why is this payment being rejected?','')||'';if(notes.trim().length<3)return;}
  button.disabled=true;
  const {error}=await client.rpc('admin_verify_cyber_order_payment',{p_order_id:button.dataset.cyberPayment,p_decision:decision,p_notes:notes||null});
  button.disabled=false;
  if(error){alert(error.message);return;}
  await loadAll();
};

const loadAll=async()=>{
  const results=await Promise.all([
    client.rpc('admin_list_cyber_providers'),
    client.rpc('admin_list_cyber_services'),
    client.rpc('admin_list_cyber_products'),
    client.rpc('admin_list_cyber_orders'),
    client.rpc('admin_list_cyber_profile_changes'),
    client.rpc('admin_get_cyber_settings')
  ]);
  const firstError=results.find(r=>r.error)?.error;
  if(firstError)throw firstError;
  providers=results[0].data||[];services=results[1].data||[];products=results[2].data||[];orders=results[3].data||[];
  profileChanges=results[4].data||[];settings=results[5].data||null;
  render();
};

const openCyberAdmin=async()=>{
  const {data:{session}}=await client.auth.getSession();
  if(!session)return;
  const {data:admin,error}=await client.from('admin_users').select('role,status,permissions').eq('user_id',session.user.id).maybeSingle();
  if(error||!admin||admin.status!=='active')return;
  const allowed=admin.role==='super_admin'||(Array.isArray(admin.permissions)&&admin.permissions.includes('approvals.read'));
  if(!allowed)return;

  $$('.admin-panel').forEach(p=>p.classList.remove('active'));
  $$('.admin-nav button').forEach(b=>b.classList.remove('active'));
  $('#cyberAdminPanel').classList.add('active');
  $('#openCyberAdmin').classList.add('active');
  if($('#adminPageTitle'))$('#adminPageTitle').textContent='Cyber Services';
  if($('#adminBreadcrumb'))$('#adminBreadcrumb').textContent='CONTROL CENTER';
  $('#adminSidebar')?.classList.remove('open');
  $('#sidebarScrim')?.classList.remove('open');
  try{await loadAll();}catch(e){const g=$('#adminGlobalStatus');if(g){g.textContent='Cyber module could not load: '+e.message;g.className='global-status error';}}
  window.scrollTo({top:0,behavior:'smooth'});
};

ensureUI();
$('#openCyberAdmin')?.addEventListener('click',openCyberAdmin);
$('#refreshCyberAdmin')?.addEventListener('click',()=>loadAll().catch(e=>alert(e.message)));
$('#cyberAdminSettingsForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const out=$('#cyberAdminSettingsStatus');out.textContent='Saving Cyber delivery fees…';out.className='cyber-admin-form-status';
  const {data,error}=await client.rpc('admin_update_cyber_settings',{
    p_cbd_fee:Number($('#cyberAdminCbdFee').value),p_estate_fee:Number($('#cyberAdminEstateFee').value),
    p_outside_town_fee:Number($('#cyberAdminOutsideFee').value),p_delivery_note:$('#cyberAdminDeliveryNote').value.trim()
  });
  if(error){out.textContent=error.message;out.className='cyber-admin-form-status error';return;}
  settings=data;out.textContent='Cyber delivery fees saved.';out.className='cyber-admin-form-status success';render();
});
$$('.admin-nav [data-admin-view]').forEach(b=>b.addEventListener('click',()=>$('#openCyberAdmin')?.classList.remove('active')));

client.auth.getSession().then(async({data})=>{
  if(!data.session)return;
  const {data:admin}=await client.from('admin_users').select('role,status,permissions').eq('user_id',data.session.user.id).maybeSingle();
  const allowed=admin&&admin.status==='active'&&(admin.role==='super_admin'||admin.permissions?.includes('approvals.read'));
  if($('#openCyberAdmin'))$('#openCyberAdmin').hidden=!allowed;
  if(allowed)loadAll().catch(()=>{});
});
})();

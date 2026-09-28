
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
const status=(msg='',type='')=>{const el=$('#cyberMarketStatus');if(!el)return;el.textContent=msg;el.style.color=type==='error'?'#b42318':'';};
let shops=[],services=[],products=[],settings={cbd_delivery_fee_kes:50,estate_delivery_fee_kes:80,outside_town_delivery_fee_kes:200},selectedShop=null,activeTab='services',selectedItem=null,paymentDestination=null;

const ensureUI=()=>{
  if($('#cyberMarketplace'))return;
  const target=$('#accommodation')||$('#catalogue')||document.querySelector('main');
  if(!target)return;
  const section=document.createElement('section');
  section.className='cyber-marketplace';
  section.id='cyberMarketplace';
  section.innerHTML=`
    <div class="cyber-market-shell">
      <div class="cyber-market-head">
        <div><span>CYBER & DIGITAL SERVICES</span><h2>🖥️ Cyber Services & Shop Items</h2><p>Printing, photocopying, typesetting, eCitizen, KRA, NTSA, NCA, scanning, branding and other approved Cyber services. Upload documents securely when a service needs a file.</p></div>
        <button id="openCyberCustomerOrders" type="button">My Cyber Orders</button>
      </div>
      <div id="cyberMarketStatus" class="cyber-market-status">Loading approved Cyber shops…</div>
      <div id="cyberShopGrid" class="cyber-shop-grid"></div>
      <section id="cyberCatalogue" class="cyber-catalogue">
        <div class="cyber-catalogue-head">
          <div><small>SELECTED CYBER</small><h3 id="cyberCatalogueTitle">Cyber Shop</h3><small id="cyberCatalogueLocation"></small></div>
          <div class="cyber-catalogue-tabs"><button id="showCyberServices" class="active" type="button">Services</button><button id="showCyberProducts" type="button">Shop Items</button><button id="closeCyberCatalogue" type="button">Close</button></div>
        </div>
        <div id="cyberItemGrid" class="cyber-item-grid"></div>
      </section>
      <section id="cyberCustomerOrders" class="cyber-customer-orders">
        <div class="cyber-catalogue-head"><div><small>MY CYBER ORDERS</small><h3>Orders, Quotes & Pickup</h3><small>Follow your Cyber orders and respond to quotations.</small></div><button id="closeCyberCustomerOrders" type="button">Close</button></div>
        <div id="cyberCustomerOrderList" class="cyber-order-history"></div>
      </section>
    </div>`;
  target.parentNode.insertBefore(section,target);

  const modal=document.createElement('div');
  modal.className='cyber-order-modal';
  modal.id='cyberOrderModal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`
    <div class="cyber-order-backdrop" data-close-cyber-order></div>
    <section class="cyber-order-dialog">
      <header><div><span>CYBER ORDER</span><h2 id="cyberOrderTitle">Order Cyber Service</h2></div><button type="button" data-close-cyber-order>×</button></header>
      <form id="cyberOrderForm" class="cyber-order-form">
        <div id="cyberOrderSummary" class="cyber-order-summary"></div>
        <div class="cyber-order-grid">
          <label>Quantity / pages<input id="cyberOrderQuantity" type="number" min="1" step="1" value="1" required></label>
          <label>Fulfilment<select id="cyberFulfilment" required><option value="pickup">I will pick from the Cyber shop</option><option value="delivery">Deliver to me</option></select></label>
          <div id="cyberPickupBox" class="cyber-pickup-box cyber-order-wide"></div>
          <div id="cyberDeliveryFields" class="cyber-order-wide" hidden>
            <div class="cyber-order-grid">
              <label>Delivery zone<select id="cyberDeliveryZone"><option value="cbd">CBD / Town Centre</option><option value="estate">Estate / Nearby Area</option><option value="outside_town">Outside Town</option></select></label>
              <label>Delivery address<input id="cyberDeliveryAddress" placeholder="Estate, road, building or exact place"></label>
              <label>Nearest landmark<input id="cyberDeliveryLandmark" placeholder="Optional landmark"></label>
              <label>Map / location link<input id="cyberDeliveryMapLink" type="url" placeholder="Optional Google Maps link"></label>
            </div>
            <div style="margin-top:8px"><button id="useCyberDeliveryLocation" type="button">📍 Use Current Location</button><small id="cyberDeliveryLocationStatus"></small></div>
            <input id="cyberDeliveryLatitude" type="hidden"><input id="cyberDeliveryLongitude" type="hidden">
          </div>
          <label id="cyberFileField" class="cyber-order-wide" hidden>Upload document(s)<input id="cyberOrderFiles" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png,image/webp,text/plain"><small class="cyber-order-file-list">PDF, Word, Excel, PowerPoint, images or text. Up to 20 MB per file.</small></label>
          <label class="cyber-order-wide">Instructions / notes<textarea id="cyberOrderNotes" rows="3" placeholder="e.g. 2 copies, black & white, A4, print both sides"></textarea></label>
        </div>
        <div id="cyberPricePreview" class="cyber-order-summary"></div>
        <div id="cyberOrderPayment" class="cyber-order-payment">
          <strong>Payment</strong><div id="cyberPaymentDestination">Loading LEOGO payment destination…</div>
          <label id="cyberPaymentReferenceLabel">M-Pesa / payment reference<input id="cyberPaymentReference" placeholder="Enter the payment reference"></label>
        </div>
        <p id="cyberOrderStatus" class="cyber-market-status"></p>
        <div class="cyber-order-actions"><button type="button" data-close-cyber-order>Cancel</button><button class="primary" type="submit">Submit Cyber Order</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);
};

const publicImage=(path)=>path?client.storage.from('cyber-public-media').getPublicUrl(path).data.publicUrl:'';
const shopMap=(s)=>s.shop_map_link||('https://www.google.com/maps?q='+s.shop_latitude+','+s.shop_longitude);

const renderShops=()=>{
  const grid=$('#cyberShopGrid');
  if(!grid)return;
  grid.innerHTML=shops.length?shops.map(s=>{
    const img=publicImage(s.profile_picture_path);
    return `
      <article class="cyber-shop-card">
        <div class="cyber-shop-photo">${img?'<img src="'+esc(img)+'" alt="'+esc(s.business_name)+'">':'🖥️'}</div>
        <div class="cyber-shop-body">
          <strong>${esc(s.business_name)}</strong><small>📍 ${esc(s.location_details)}, ${esc(s.town)}, ${esc(s.county)}</small>
          <p>${esc(s.business_description||'Approved Cyber Services partner on LEOGO.')}</p>
          <div class="cyber-shop-meta"><span>${s.service_count} services</span><span>${s.product_count} items</span><span>${esc(s.availability_status)}</span></div>
          <div class="cyber-shop-actions"><button class="primary" type="button" data-open-cyber-shop="${s.provider_id}">View Services</button><button type="button" data-cyber-map="${s.provider_id}">Location</button></div>
        </div>
      </article>`;
  }).join(''):'<div class="cyber-empty" style="grid-column:1/-1">No approved Cyber shops are available yet.</div>';
  $$('[data-open-cyber-shop]').forEach(b=>b.addEventListener('click',()=>openShop(b.dataset.openCyberShop)));
  $$('[data-cyber-map]').forEach(b=>b.addEventListener('click',()=>{const s=shops.find(x=>x.provider_id===b.dataset.cyberMap);if(s)window.open(shopMap(s),'_blank','noopener');}));
};

const renderCatalogue=()=>{
  const grid=$('#cyberItemGrid');
  if(!grid||!selectedShop)return;
  $('#cyberCatalogueTitle').textContent=selectedShop.business_name;
  $('#cyberCatalogueLocation').textContent=selectedShop.location_details+', '+selectedShop.town+', '+selectedShop.county;
  $('#showCyberServices').classList.toggle('active',activeTab==='services');
  $('#showCyberProducts').classList.toggle('active',activeTab==='products');
  const rows=activeTab==='services'?services.filter(s=>s.provider_id===selectedShop.provider_id):products.filter(p=>p.provider_id===selectedShop.provider_id);
  grid.innerHTML=rows.length?rows.map(item=>{
    if(activeTab==='services'){
      const price=item.pricing_model==='quote'?'Request quotation':money(item.price_kes)+(item.unit_label?' / '+esc(item.unit_label):'');
      return `<article class="cyber-item-card"><header><h4>${esc(item.service_name)}</h4><span class="badge">${esc(item.service_category.replaceAll('_',' '))}</span></header><p>${esc(item.description||'')}</p><span class="price">${price}</span>${item.requires_file_upload?'<small>📎 File upload required</small>':''}<button type="button" data-order-cyber-service="${item.id}">Order Service</button></article>`;
    }
    const img=publicImage(item.image_path);
    return `<article class="cyber-item-card"><div class="cyber-product-img">${img?'<img src="'+esc(img)+'" alt="'+esc(item.product_name)+'">':'🛍️'}</div><header><h4>${esc(item.product_name)}</h4><span class="badge">${esc(item.quantity_available)} available</span></header><p>${esc(item.description||'')}</p><span class="price">${money(item.price_kes)} / ${esc(item.measurement_unit)}</span><button type="button" data-order-cyber-product="${item.id}">Buy Item</button></article>`;
  }).join(''):'<div class="cyber-empty" style="grid-column:1/-1">No approved '+activeTab+' from this Cyber yet.</div>';
  $$('[data-order-cyber-service]').forEach(b=>b.addEventListener('click',()=>openOrder('service',services.find(s=>s.id===b.dataset.orderCyberService))));
  $$('[data-order-cyber-product]').forEach(b=>b.addEventListener('click',()=>openOrder('product',products.find(p=>p.id===b.dataset.orderCyberProduct))));
};

const openShop=(id)=>{
  selectedShop=shops.find(s=>s.provider_id===id);
  if(!selectedShop)return;
  activeTab='services';
  $('#cyberCatalogue').classList.add('active');
  $('#cyberCustomerOrders').classList.remove('open');
  renderCatalogue();
  $('#cyberCatalogue').scrollIntoView({behavior:'smooth',block:'start'});
};

const deliveryFee=()=>{
  if($('#cyberFulfilment')?.value!=='delivery')return 0;
  const zone=$('#cyberDeliveryZone')?.value||'cbd';
  if(zone==='estate')return Number(settings.estate_delivery_fee_kes||0);
  if(zone==='outside_town')return Number(settings.outside_town_delivery_fee_kes||0);
  return Number(settings.cbd_delivery_fee_kes||0);
};

const itemSubtotal=()=>{
  if(!selectedItem)return 0;
  if(selectedItem.type==='service'&&selectedItem.data.pricing_model==='quote')return null;
  const qty=Math.max(1,Number($('#cyberOrderQuantity')?.value||1));
  return Number(selectedItem.data.price_kes||0)*qty;
};

const paymentText=(p)=>{
  if(!p)return 'Payment destination is not configured yet.';
  if(p.account_type==='till')return '<strong>M-Pesa Till: '+esc(p.till_number||p.account_number||'—')+'</strong><small>'+esc(p.business_name||p.display_name||'LEOGO')+'</small>';
  if(p.account_type==='paybill')return '<strong>Paybill: '+esc(p.paybill_number||'—')+' · Account: '+esc(p.account_number||'—')+'</strong><small>'+esc(p.business_name||p.display_name||'LEOGO')+'</small>';
  return '<strong>'+esc(p.display_name||p.account_name||'LEOGO payment account')+'</strong><small>'+esc(p.account_number||p.instructions||'')+'</small>';
};

const updateOrderPreview=()=>{
  if(!selectedItem)return;
  const quote=selectedItem.type==='service'&&selectedItem.data.pricing_model==='quote';
  const subtotal=itemSubtotal();
  const fee=deliveryFee();
  const total=(subtotal??0)+fee;
  $('#cyberPricePreview').innerHTML=quote
    ? 'Cyber will send a quotation for the service. '+($('#cyberFulfilment').value==='delivery'?'The current delivery fee is <strong>'+money(fee)+'</strong> and will be added to the accepted quotation.':'Pickup from the Cyber shop has no delivery fee.')
    : 'Service / item subtotal: <strong>'+money(subtotal)+'</strong> · Delivery: <strong>'+money(fee)+'</strong> · Total: <strong>'+money(total)+'</strong>';
  $('#cyberOrderPayment').hidden=quote;
  $('#cyberPaymentReference').required=!quote&&total>0;
  $('#cyberDeliveryFields').hidden=$('#cyberFulfilment').value!=='delivery';
  $('#cyberPickupBox').hidden=$('#cyberFulfilment').value!=='pickup';
};

const requireLogin=async()=>{
  const {data}=await client.auth.getSession();
  if(data.session?.user)return data.session.user;
  window.leogoOpenCustomerView?.('auth');
  throw new Error('Please sign in to continue with this Cyber order.');
};

const openOrder=async(type,data)=>{
  try{await requireLogin();await loadPayment();}catch(e){status(e.message,'error');return;}
  selectedItem={type,data};
  selectedShop=shops.find(s=>s.provider_id===data.provider_id)||selectedShop;
  const quote=type==='service'&&data.pricing_model==='quote';
  $('#cyberOrderTitle').textContent=(type==='service'?'Order ':'Buy ')+(data.service_name||data.product_name);
  $('#cyberOrderSummary').innerHTML='<strong>'+esc(data.provider_name||selectedShop?.business_name||'Cyber Partner')+'</strong><br>'+esc(data.service_name||data.product_name)+' · '+(quote?'Quotation required':money(data.price_kes));
  $('#cyberOrderQuantity').value='1';
  $('#cyberOrderNotes').value='';
  $('#cyberPaymentReference').value='';
  $('#cyberFileField').hidden=!(type==='service'&&data.requires_file_upload);
  $('#cyberOrderFiles').required=Boolean(type==='service'&&data.requires_file_upload);
  $('#cyberOrderFiles').multiple=type==='service'?Boolean(data.accepts_multiple_files):false;
  $('#cyberOrderFiles').value='';
  $('#cyberFulfilment').value='pickup';
  $('#cyberPickupBox').innerHTML='Pickup from <strong>'+esc(selectedShop?.business_name||'Cyber Shop')+'</strong> · '+esc(selectedShop?.location_details||'')+' <a href="'+esc(shopMap(selectedShop))+'" target="_blank" rel="noopener">Open shop location</a>';
  $('#cyberDeliveryAddress').value='';$('#cyberDeliveryLandmark').value='';$('#cyberDeliveryMapLink').value='';$('#cyberDeliveryLatitude').value='';$('#cyberDeliveryLongitude').value='';
  $('#cyberPaymentDestination').innerHTML=paymentText(paymentDestination);
  $('#cyberOrderStatus').textContent='';
  updateOrderPreview();
  $('#cyberOrderModal').classList.add('open');
  $('#cyberOrderModal').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
};

const closeOrder=()=>{
  $('#cyberOrderModal')?.classList.remove('open');$('#cyberOrderModal')?.setAttribute('aria-hidden','true');document.body.style.overflow='';
};

const uploadOrderFiles=async(user)=>{
  const files=[...($('#cyberOrderFiles')?.files||[])];
  const out=[];
  for(const f of files){
    if(f.size>20971520)throw new Error(f.name+' is larger than 20 MB.');
    const safe=f.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path=user.id+'/'+crypto.randomUUID()+'-'+safe;
    const {error}=await client.storage.from('cyber-order-files').upload(path,f,{upsert:false,contentType:f.type||undefined});
    if(error)throw error;
    out.push({path,name:f.name,mime:f.type||'',size:f.size});
  }
  return out;
};

const loadPublic=async()=>{
  status('Loading approved Cyber shops…');
  const [shopRes,serviceRes,productRes,settingsRes]=await Promise.all([
    client.rpc('public_list_cyber_shops'),
    client.rpc('public_list_cyber_services',{p_provider_id:null}),
    client.rpc('public_list_cyber_products',{p_provider_id:null}),
    client.rpc('public_cyber_marketplace_settings')
  ]);
  if(shopRes.error)throw shopRes.error;if(serviceRes.error)throw serviceRes.error;if(productRes.error)throw productRes.error;
  shops=shopRes.data||[];services=serviceRes.data||[];products=productRes.data||[];settings=settingsRes.data||settings;
  renderShops();
  status(shops.length+' approved Cyber shop'+(shops.length===1?'':'s')+' available.');
};

const loadPayment=async()=>{
  const {data:{session}}=await client.auth.getSession();
  if(!session)return;
  const {data,error}=await client.rpc('get_customer_payment_destination',{p_function_code:'cyber_orders'});
  if(!error)paymentDestination=Array.isArray(data)?data[0]:data;
};

const renderCustomerOrders=async()=>{
  const user=await requireLogin();
  void user;
  const {data,error}=await client.rpc('customer_list_cyber_orders');
  if(error)throw error;
  const list=$('#cyberCustomerOrderList');
  const rows=data||[];
  list.innerHTML=rows.length?rows.map(o=>{
    const quote=o.pricing_status==='quoted'&&o.provider_quote_kes!=null;
    return `
      <article>
        <header><div><strong>${esc(o.order_reference)} · ${esc(o.item_name)}</strong><small>${esc(o.provider_name)} · ${new Date(o.created_at).toLocaleString()}</small></div><span class="status ${esc(o.order_status)}">${esc(o.order_status.replaceAll('_',' '))}</span></header>
        <small>Fulfilment: ${esc(o.fulfilment_method)} · Payment: ${esc(o.payment_status.replaceAll('_',' '))} · Total: ${money(o.total_kes)}</small>
        ${o.fulfilment_method==='pickup'?'<small>📍 Pickup: '+esc(o.shop_location)+' · <a href="'+esc(o.shop_map_link||'#')+'" target="_blank" rel="noopener">Open location</a></small>':''}
        ${quote?'<div><strong>Quotation: '+money(o.provider_quote_kes)+'</strong><small>'+esc(o.provider_quote_notes||'')+'</small></div><div class="quote-actions"><button class="accept" type="button" data-cyber-accept-quote="'+o.id+'">Accept & Pay</button><button class="reject" type="button" data-cyber-reject-quote="'+o.id+'">Reject Quote</button></div>':''}
      </article>`;
  }).join(''):'<div class="cyber-empty">You have no Cyber orders yet.</div>';
  $$('[data-cyber-accept-quote]').forEach(b=>b.addEventListener('click',async()=>{
    await loadPayment();
    const destination=paymentText(paymentDestination).replace(/<[^>]+>/g,' ');
    const ref=prompt('Pay the quotation using '+destination+' then enter the payment reference:','');
    if(!ref)return;
    const {error}=await client.rpc('customer_decide_cyber_quote',{p_order_id:b.dataset.cyberAcceptQuote,p_decision:'accept',p_payment_reference:ref.trim()});
    if(error){alert(error.message);return;}
    await renderCustomerOrders();
  }));
  $$('[data-cyber-reject-quote]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Reject this Cyber quotation?'))return;
    const {error}=await client.rpc('customer_decide_cyber_quote',{p_order_id:b.dataset.cyberRejectQuote,p_decision:'reject',p_payment_reference:null});
    if(error){alert(error.message);return;}
    await renderCustomerOrders();
  }));
};

ensureUI();
const category=$('[data-system-category="cyber-branding"]');if(category)category.href='#cyberMarketplace';
const menu=document.querySelector('.customer-mobile-menu-group a[href="#services"]');
if(menu&&!document.querySelector('.customer-mobile-menu-group a[href="#cyberMarketplace"]'))menu.insertAdjacentHTML('afterend','<a href="#cyberMarketplace" data-mobile-menu-close><i>🖥️</i><span>Cyber Services</span></a>');

$('#showCyberServices')?.addEventListener('click',()=>{activeTab='services';renderCatalogue();});
$('#showCyberProducts')?.addEventListener('click',()=>{activeTab='products';renderCatalogue();});
$('#closeCyberCatalogue')?.addEventListener('click',()=>$('#cyberCatalogue').classList.remove('active'));
$('#openCyberCustomerOrders')?.addEventListener('click',async()=>{
  try{$('#cyberCustomerOrders').classList.add('open');$('#cyberCatalogue').classList.remove('active');await renderCustomerOrders();}catch(e){status(e.message,'error');}
});
$('#closeCyberCustomerOrders')?.addEventListener('click',()=>$('#cyberCustomerOrders').classList.remove('open'));
$$('[data-close-cyber-order]').forEach(b=>b.addEventListener('click',closeOrder));
$('#cyberFulfilment')?.addEventListener('change',updateOrderPreview);
$('#cyberDeliveryZone')?.addEventListener('change',updateOrderPreview);
$('#cyberOrderQuantity')?.addEventListener('input',updateOrderPreview);
$('#useCyberDeliveryLocation')?.addEventListener('click',()=>{
  const out=$('#cyberDeliveryLocationStatus');
  if(!navigator.geolocation){out.textContent=' Location is not supported by this browser.';return;}
  out.textContent=' Getting location…';
  navigator.geolocation.getCurrentPosition(p=>{
    const lat=p.coords.latitude.toFixed(7),lng=p.coords.longitude.toFixed(7);
    $('#cyberDeliveryLatitude').value=lat;$('#cyberDeliveryLongitude').value=lng;
    $('#cyberDeliveryMapLink').value='https://www.google.com/maps?q='+lat+','+lng;
    out.textContent=' ✓ Delivery location pinned.';
  },()=>out.textContent=' Could not get your current location.',{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
});

$('#cyberOrderForm')?.addEventListener('submit',async(e)=>{
  e.preventDefault();
  if(!selectedItem)return;
  const button=e.submitter||$('#cyberOrderForm button[type="submit"]'),old=button.textContent;button.disabled=true;button.textContent='Submitting…';
  $('#cyberOrderStatus').textContent='Uploading files and creating order…';
  try{
    const user=await requireLogin();
    const files=await uploadOrderFiles(user);
    const delivery=$('#cyberFulfilment').value==='delivery';
    const quote=selectedItem.type==='service'&&selectedItem.data.pricing_model==='quote';
    const {data,error}=await client.rpc('customer_create_cyber_order',{
      p_item_type:selectedItem.type,p_item_id:selectedItem.data.id,p_quantity:Number($('#cyberOrderQuantity').value||1),
      p_customer_notes:$('#cyberOrderNotes').value.trim(),p_fulfilment_method:$('#cyberFulfilment').value,
      p_delivery_zone_code:delivery?$('#cyberDeliveryZone').value:null,
      p_delivery_address:delivery?$('#cyberDeliveryAddress').value.trim():null,
      p_delivery_landmark:delivery?$('#cyberDeliveryLandmark').value.trim():null,
      p_delivery_map_link:delivery?$('#cyberDeliveryMapLink').value.trim():null,
      p_delivery_latitude:delivery&&$('#cyberDeliveryLatitude').value?Number($('#cyberDeliveryLatitude').value):null,
      p_delivery_longitude:delivery&&$('#cyberDeliveryLongitude').value?Number($('#cyberDeliveryLongitude').value):null,
      p_payment_reference:quote?null:$('#cyberPaymentReference').value.trim(),
      p_files:files
    });
    if(error)throw error;
    $('#cyberOrderStatus').textContent='✓ '+data.order_reference+' submitted successfully.';
    window.setTimeout(()=>{closeOrder();$('#cyberCustomerOrders').classList.add('open');renderCustomerOrders().catch(()=>{});},800);
  }catch(error){$('#cyberOrderStatus').textContent=error.message||'Cyber order could not be submitted.';}
  finally{button.disabled=false;button.textContent=old;}
});

client.auth.onAuthStateChange(()=>{loadPayment().catch(()=>{});});
loadPayment().catch(()=>{});
loadPublic().catch(e=>status(e.message||'Cyber marketplace could not load.','error'));
})();

(() => {
'use strict';

const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmt=v=>v?new Date(v).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}):'—';
const activeCampaignStatuses=new Set([
  'collecting_orders','paused','moq_reached','order_confirmed','seller_preparing',
  'dispatched_origin','in_transit','arrived_destination','at_sorting_center',
  'out_for_delivery','ready_pickup'
]);

let products=[];
let campaigns=[];
let deliveryRates=null;
let pendingProductExtensionSave=null;
let activeEditingProduct=null;

function loadStyle(){
  if($('#shippingMoqPartnerStyle'))return;
  const link=document.createElement('link');
  link.id='shippingMoqPartnerStyle';
  link.rel='stylesheet';
  link.href='../css/shipping-moq.css?v=product-modes-2';
  document.head.appendChild(link);
}

function bool(value,fallback=false){
  if(value===true||value==='true')return true;
  if(value===false||value==='false')return false;
  return fallback;
}
function numberValue(id){
  const raw=$('#'+id)?.value;
  if(raw==null||raw==='')return null;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
}
function textValue(id){return String($('#'+id)?.value||'').trim();}
function setv(id,value){const el=$('#'+id);if(el)el.value=value??'';}
function setChecked(id,value){const el=$('#'+id);if(el)el.checked=Boolean(value);}
function localDateTime(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}
function dateOnly(value){
  if(!value)return '';
  const text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
}
function activeCampaign(product){
  const campaign=product?.group_campaign;
  return campaign&&activeCampaignStatuses.has(campaign.status)?campaign:null;
}
function internationalLandedPrice(){
  const item=numberValue('internationalItemPrice');
  const freight=numberValue('internationalCenterFee');
  if(item==null)return null;
  return item+Number(freight||0);
}

function deliveryRateHtml(){
  if(!deliveryRates){
    return '<div class="product-mode-system-rate-loading">Loading current LEOGO delivery rates…</div>';
  }
  return '<div class="product-mode-system-rates">'+
    '<div><span>CBD</span><strong>'+money(deliveryRates.cbd_fee_kes)+'</strong></div>'+
    '<div><span>Estates</span><strong>'+money(deliveryRates.estate_fee_kes)+'</strong></div>'+
    '<div><span>Outside town</span><strong>'+money(deliveryRates.outside_town_fee_kes)+'+</strong></div>'+
    '<small>Calculated automatically by LEOGO at checkout. Seller does not enter this last-mile fee.</small>'+
  '</div>';
}

function ensureProductFields(){
  const form=$('#sellerProductForm')||$('#productForm');
  if(!form||$('#productShippingFields'))return;

  const basePrice=$('#productPrice',form);
  const basePriceLabel=basePrice?.closest('label');
  if(basePriceLabel){
    basePriceLabel.hidden=true;
    basePriceLabel.dataset.productModeCorePrice='true';
  }

  const marker=$('#restrictedCategoryNotice',form)||$('#variantSection',form)||form.lastElementChild;
  const box=document.createElement('section');
  box.id='productShippingFields';
  box.className='shipping-product-form product-mode-settings';
  box.innerHTML=
    '<div class="product-mode-head">'+
      '<div><span>PRODUCT SELLING & DELIVERY SETTINGS</span><h4>Choose only what applies to this item</h4><p>Local selling, international ordering, MOQ and Group Order are separate settings. Turn on the options you need for this product.</p></div>'+
      '<div id="productModeSummary" class="product-mode-summary"></div>'+
    '</div>'+

    '<article class="product-mode-card" data-mode-card="local">'+
      '<label class="product-mode-switch"><input id="productLocalAvailable" type="checkbox" checked><span><b>1. Available Locally</b><small>Sell this item from local stock through the normal LEOGO cart.</small></span></label>'+
      '<div id="productLocalFields" class="product-mode-fields">'+
        '<div class="shipping-form-grid two">'+
          '<label>Local selling price (KSh)<input id="localSellingPrice" type="number" min="0" step="0.01"></label>'+
          '<label>Expected local delivery date <small>(optional)</small><input id="localExpectedDeliveryDate" type="date"></label>'+
        '</div>'+
        '<div class="product-mode-system-fee"><div><b>Customer local delivery fee</b><small>Uses the LEOGO system delivery rules automatically.</small></div><div id="localDeliveryRatePreview">'+deliveryRateHtml()+'</div></div>'+
      '</div>'+
    '</article>'+

    '<article class="product-mode-card international" data-mode-card="international">'+
      '<label class="product-mode-switch"><input id="productInternationalEnabled" type="checkbox"><span><b>2. International / Imported Order</b><small>Use this when the item is ordered from outside the local market.</small></span></label>'+
      '<div id="productInternationalFields" class="product-mode-fields" hidden>'+
        '<div class="shipping-form-grid">'+
          '<label>Origin country<input id="internationalOriginCountry" placeholder="e.g. China"></label>'+
          '<label>Origin region / province<input id="internationalOriginRegion" placeholder="Optional"></label>'+
          '<label>Origin town / city<input id="internationalOriginTown" placeholder="Optional"></label>'+
          '<label>International item price (KSh)<input id="internationalItemPrice" type="number" min="0" step="0.01"></label>'+
          '<label>Shipping / freight to LEOGO Distribution Center (KSh)<input id="internationalCenterFee" type="number" min="0" step="0.01" value="0"></label>'+
          '<label>LEOGO Distribution Center<input id="internationalDistributionCenter" value="LEOGO Distribution Center — Nairobi"></label>'+
          '<label>Expected delivery date<input id="internationalExpectedDeliveryDate" type="date"></label>'+
          '<label class="wide">Shipping / dispatch details <small>(optional)</small><input id="internationalDispatchDetails" placeholder="Courier, container, flight, supplier dispatch details…"></label>'+
        '</div>'+
        '<div class="international-landed-summary"><span>International landed amount before local delivery</span><strong id="internationalLandedPrice">KSh 0</strong><small>Item price + freight to the LEOGO Distribution Center. Customer last-mile delivery still follows LEOGO system rates.</small></div>'+
      '</div>'+
    '</article>'+

    '<article class="product-mode-card moq" data-mode-card="moq">'+
      '<label class="product-mode-switch"><input id="productMoqEnabled" type="checkbox"><span><b>3. This Item Has an MOQ</b><small>Store the supplier or buying minimum separately. MOQ does not automatically make the item a Group Order.</small></span></label>'+
      '<div id="productMoqFields" class="product-mode-fields" hidden>'+
        '<div class="shipping-form-grid two">'+
          '<label>Minimum Order Quantity (MOQ)<input id="productMoqMinimum" type="number" min="1" step="1"></label>'+
          '<label>Maximum quantity <small>(optional)</small><input id="productMoqMaximum" type="number" min="1" step="1"></label>'+
        '</div>'+
      '</div>'+
    '</article>'+

    '<article class="product-mode-card group" data-mode-card="group">'+
      '<label class="product-mode-switch"><input id="productGroupEnabled" type="checkbox"><span><b>4. Send to Group / Global Orders</b><small>Only turn this on when customers should combine quantities and pay during a campaign window.</small></span></label>'+
      '<div id="groupCampaignFields" class="product-mode-fields group-campaign-fields" hidden>'+
        '<div id="groupTermsLockNote" class="group-terms-lock-note" hidden></div>'+
        '<div class="shipping-form-grid">'+
          '<label>Payment starts<input id="groupOpening" type="datetime-local"></label>'+
          '<label>Payment ends<input id="groupClosing" type="datetime-local"></label>'+
          '<label>Group customer price per unit (KSh)<input id="groupUnitPrice" type="number" min="0" step="0.01"></label>'+
          '<label>Stop taking new orders<select id="groupClosePolicy"><option value="deadline">At payment end date</option><option value="moq">Immediately when MOQ is reached</option></select></label>'+
          '<label>Expected dispatch date <small>(optional now)</small><input id="groupDispatchDate" type="date"></label>'+
          '<label>Expected delivery date<input id="groupExpectedDeliveryDate" type="date"></label>'+
        '</div>'+
        '<div class="group-dispatch-note">You may leave the dispatch date blank while collecting orders. Once MOQ closes, update the dispatch date from the Group Orders dashboard.</div>'+
      '</div>'+
    '</article>'+

    '<div class="product-mode-footnote"><b>How charges work:</b> the Seller sets the international item price and freight up to the LEOGO Distribution Center. Delivery from LEOGO to the customer is calculated from the existing LEOGO delivery rules.</div>'+
    '<div id="productShippingStatus" class="shipping-moq-status"></div>';

  marker.insertAdjacentElement('beforebegin',box);

  [
    'productLocalAvailable','productInternationalEnabled','productMoqEnabled','productGroupEnabled'
  ].forEach(id=>$('#'+id)?.addEventListener('change',handleModeChange));

  ['localSellingPrice','internationalItemPrice','internationalCenterFee'].forEach(id=>{
    $('#'+id)?.addEventListener('input',()=>{
      updateLandedPrice();
      syncCorePrice();
      updateModeSummary();
      if(id==='internationalItemPrice'&&!textValue('groupUnitPrice'))prefillGroupPrice();
    });
  });

  $('#internationalExpectedDeliveryDate')?.addEventListener('change',()=>{
    if(!textValue('groupExpectedDeliveryDate'))setv('groupExpectedDeliveryDate',textValue('internationalExpectedDeliveryDate'));
  });
}

function setRequired(id,required){
  const el=$('#'+id);
  if(el)el.required=Boolean(required);
}

function setGroupTermsLocked(campaign){
  const locked=Boolean(campaign&&Number(campaign.participant_count||0)>0);
  const lockNote=$('#groupTermsLockNote');
  const fields=['groupOpening','groupClosing','groupUnitPrice','groupClosePolicy','productMoqMinimum','productMoqMaximum'];
  fields.forEach(id=>{const el=$('#'+id);if(el)el.disabled=locked;});

  const toggle=$('#productGroupEnabled');
  if(toggle)toggle.disabled=locked;

  if(lockNote){
    lockNote.hidden=!locked;
    lockNote.textContent=locked
      ? 'Customers have already joined this campaign. MOQ, price and payment dates are locked to protect customer commitments. LEOGO Admin must close/cancel the campaign if it should stop.'
      : '';
  }

  const dispatch=$('#groupDispatchDate');
  if(dispatch){
    dispatch.disabled=Boolean(campaign)&&!['moq_reached','order_confirmed','seller_preparing'].includes(campaign.status)&&locked;
  }
}

function prefillGroupPrice(){
  const target=$('#groupUnitPrice');
  if(!target||target.value)return;
  const international=internationalLandedPrice();
  const local=numberValue('localSellingPrice');
  const amount=$('#productInternationalEnabled')?.checked&&international!=null?international:local;
  if(amount!=null)target.value=String(amount);
}

function updateLandedPrice(){
  const target=$('#internationalLandedPrice');
  if(!target)return;
  const amount=internationalLandedPrice();
  target.textContent=amount==null?'—':money(amount);
}

function syncCorePrice(){
  const core=$('#productPrice');
  if(!core)return;
  const local=$('#productLocalAvailable')?.checked;
  const international=$('#productInternationalEnabled')?.checked;
  const localPrice=numberValue('localSellingPrice');
  const landed=internationalLandedPrice();

  if(local&&localPrice!=null)core.value=String(localPrice);
  else if(international&&landed!=null)core.value=String(landed);
}

function updateModeSummary(){
  const summary=$('#productModeSummary');
  if(!summary)return;
  const badges=[];
  if($('#productLocalAvailable')?.checked)badges.push('<span>📍 Local</span>');
  if($('#productInternationalEnabled')?.checked)badges.push('<span>🌍 International</span>');
  if($('#productMoqEnabled')?.checked)badges.push('<span>📦 MOQ</span>');
  if($('#productGroupEnabled')?.checked)badges.push('<span>👥 Group Order</span>');
  summary.innerHTML=badges.length?badges.join(''):'<span class="warn">Choose a selling mode</span>';
}

function handleModeChange(event){
  const local=$('#productLocalAvailable')?.checked;
  const international=$('#productInternationalEnabled')?.checked;
  const moq=$('#productMoqEnabled')?.checked;
  const group=$('#productGroupEnabled')?.checked;

  if(event?.target?.id==='productGroupEnabled'&&group&&!moq){
    setChecked('productMoqEnabled',true);
  }

  $('#productLocalFields').hidden=!local;
  $('#productInternationalFields').hidden=!international;
  $('#productMoqFields').hidden=!$('#productMoqEnabled')?.checked;
  $('#groupCampaignFields').hidden=!group;

  setRequired('localSellingPrice',local);
  ['internationalOriginCountry','internationalItemPrice','internationalCenterFee','internationalExpectedDeliveryDate'].forEach(id=>setRequired(id,international));
  setRequired('productMoqMinimum',$('#productMoqEnabled')?.checked);
  ['groupOpening','groupClosing','groupUnitPrice','groupExpectedDeliveryDate'].forEach(id=>setRequired(id,group));

  if(group){
    prefillGroupPrice();
    if(!textValue('groupExpectedDeliveryDate')){
      setv('groupExpectedDeliveryDate',
        textValue('internationalExpectedDeliveryDate')||textValue('localExpectedDeliveryDate')
      );
    }
  }

  syncCorePrice();
  updateLandedPrice();
  updateModeSummary();
}

function validateSettings(){
  const local=$('#productLocalAvailable')?.checked;
  const international=$('#productInternationalEnabled')?.checked;
  const moq=$('#productMoqEnabled')?.checked;
  const group=$('#productGroupEnabled')?.checked;

  if(!local&&!international)throw new Error('Choose at least Local availability or International order.');

  if(local&&numberValue('localSellingPrice')==null)throw new Error('Enter the local selling price.');

  if(international){
    if(textValue('internationalOriginCountry').length<2)throw new Error('Enter the international origin country.');
    if(numberValue('internationalItemPrice')==null)throw new Error('Enter the international item price.');
    if(numberValue('internationalCenterFee')==null||numberValue('internationalCenterFee')<0)throw new Error('Enter a valid freight fee to the LEOGO Distribution Center.');
    if(!textValue('internationalExpectedDeliveryDate'))throw new Error('Choose the expected international delivery date.');
  }

  if(moq){
    const minimum=numberValue('productMoqMinimum');
    const maximum=numberValue('productMoqMaximum');
    if(minimum==null||minimum<=0)throw new Error('Enter the Minimum Order Quantity (MOQ).');
    if(maximum!=null&&maximum<minimum)throw new Error('Maximum quantity cannot be below the MOQ.');
  }

  if(group){
    if(!moq)throw new Error('Enable MOQ before sending this product to Group / Global Orders.');
    if(!textValue('groupOpening')||!textValue('groupClosing'))throw new Error('Set the Group Order payment start and end date/time.');
    if(new Date(textValue('groupClosing')).getTime()<=new Date(textValue('groupOpening')).getTime())throw new Error('Group Order payment end must be after payment start.');
    if(numberValue('groupUnitPrice')==null)throw new Error('Enter the Group Order customer price.');
    if(!textValue('groupExpectedDeliveryDate'))throw new Error('Choose the expected delivery date for the Group Order.');
  }

  syncCorePrice();
  return true;
}

function shippingPayload(){
  validateSettings();
  const international=$('#productInternationalEnabled')?.checked;
  return {
    local_available:Boolean($('#productLocalAvailable')?.checked),
    local_price_kes:numberValue('localSellingPrice'),
    local_expected_delivery_date:textValue('localExpectedDeliveryDate')||null,

    international_order_enabled:Boolean(international),
    international_price_kes:numberValue('internationalItemPrice'),
    international_shipping_fee_to_center_kes:numberValue('internationalCenterFee')??0,
    distribution_center:textValue('internationalDistributionCenter')||'LEOGO Distribution Center — Nairobi',
    international_expected_delivery_date:textValue('internationalExpectedDeliveryDate')||null,

    origin_type:international?'international':'local',
    origin_country:international?textValue('internationalOriginCountry'):'Kenya',
    origin_county_region:international?textValue('internationalOriginRegion'):'',
    origin_town_city:international?textValue('internationalOriginTown'):'',
    dispatch_details:textValue('internationalDispatchDetails'),

    moq_enabled:Boolean($('#productMoqEnabled')?.checked),
    moq_minimum_quantity:numberValue('productMoqMinimum'),
    moq_maximum_quantity:numberValue('productMoqMaximum')
  };
}

function campaignPayload(){
  const enabled=Boolean($('#productGroupEnabled')?.checked);
  if(!enabled)return {enabled:false};

  const opening=textValue('groupOpening');
  const closing=textValue('groupClosing');
  return {
    enabled:true,
    minimum_quantity:numberValue('productMoqMinimum'),
    maximum_quantity:numberValue('productMoqMaximum'),
    opening_at:new Date(opening).toISOString(),
    closing_at:new Date(closing).toISOString(),
    customer_unit_price_kes:numberValue('groupUnitPrice'),
    close_policy:textValue('groupClosePolicy')||'deadline',
    expected_dispatch_date:textValue('groupDispatchDate')||null,
    expected_delivery_date:textValue('groupExpectedDeliveryDate')
  };
}

async function loadDeliveryRates(){
  const {data,error}=await client.rpc('public_get_delivery_rate_settings');
  if(!error&&data)deliveryRates=data;
  const host=$('#localDeliveryRatePreview');
  if(host)host.innerHTML=deliveryRateHtml();
}

async function loadProducts(){
  const {data,error}=await client.rpc('seller_list_own_products');
  if(error)throw error;
  products=Array.isArray(data)?data:[];
}

async function saveForProduct(productId,pShipping,pCampaign){
  const status=$('#productShippingStatus');
  if(status)status.textContent='Saving Local / International / MOQ settings…';

  const {data,error}=await client.rpc('seller_save_product_shipping',{
    p_product_id:productId,
    p_shipping:pShipping,
    p_campaign:pCampaign
  });

  if(error){
    if(status)status.textContent=error.message;
    throw error;
  }

  if(status)status.textContent='Product selling, delivery and Group Order settings saved.';
  await Promise.all([loadProducts(),loadCampaigns()]);
  return data;
}

function captureProductSettings(){
  const form=$('#sellerProductForm')||$('#productForm');
  if(!form)return;

  form.addEventListener('submit',(event)=>{
    try{
      const shipping=shippingPayload();
      const campaign=campaignPayload();
      pendingProductExtensionSave={shipping,campaign};
      const status=$('#productShippingStatus');
      if(status)status.textContent='Settings checked. Saving product…';
    }catch(error){
      pendingProductExtensionSave=null;
      event.preventDefault();
      event.stopImmediatePropagation();
      const status=$('#productShippingStatus');
      if(status)status.textContent=error?.message||'Check the product selling and delivery settings.';
    }
  },true);

  document.addEventListener('leogo:seller-product-saved',async(event)=>{
    const productId=event?.detail?.productId;
    const pending=pendingProductExtensionSave;
    pendingProductExtensionSave=null;
    if(!productId||!pending)return;

    try{
      await saveForProduct(productId,pending.shipping,pending.campaign);
    }catch(error){
      const status=$('#productShippingStatus');
      if(status)status.textContent=error?.message||'Product saved, but its selling/delivery settings need attention.';
    }
  });
}

function applyProductExtension(product){
  if(!product)return;
  activeEditingProduct=product;

  const profile=product.shipping_profile||{};
  const campaign=activeCampaign(product);
  const legacyInternational=product.fulfilment_type==='preorder'||product.fulfilment_type==='group_order'||profile.origin_type==='international';

  const local=profile.product_id
    ? bool(profile.local_available,product.fulfilment_type==='normal')
    : product.fulfilment_type==='normal';
  const international=profile.product_id
    ? bool(profile.international_order_enabled,legacyInternational)
    : legacyInternational;

  setChecked('productLocalAvailable',local);
  setv('localSellingPrice',profile.local_price_kes??(local?product.price_kes:''));
  setv('localExpectedDeliveryDate',dateOnly(profile.local_expected_delivery_date));

  setChecked('productInternationalEnabled',international);
  setv('internationalOriginCountry',profile.origin_country||(international?'':''));
  setv('internationalOriginRegion',profile.origin_county_region);
  setv('internationalOriginTown',profile.origin_town_city);
  setv('internationalItemPrice',profile.international_price_kes??(international?product.price_kes:''));
  setv('internationalCenterFee',profile.international_shipping_fee_to_center_kes??0);
  setv('internationalDistributionCenter',profile.distribution_center||'LEOGO Distribution Center — Nairobi');
  setv('internationalExpectedDeliveryDate',dateOnly(profile.international_expected_delivery_date||profile.expected_delivery_from));
  setv('internationalDispatchDetails',profile.dispatch_details);

  const moq=bool(profile.moq_enabled,Boolean(campaign));
  setChecked('productMoqEnabled',moq);
  setv('productMoqMinimum',profile.moq_minimum_quantity??campaign?.minimum_quantity??'');
  setv('productMoqMaximum',profile.moq_maximum_quantity??campaign?.maximum_quantity??'');

  setChecked('productGroupEnabled',Boolean(campaign));
  setv('groupOpening',localDateTime(campaign?.opening_at));
  setv('groupClosing',localDateTime(campaign?.closing_at));
  setv('groupUnitPrice',campaign?.customer_unit_price_kes??'');
  setv('groupClosePolicy',campaign?.close_policy||'deadline');
  setv('groupDispatchDate',dateOnly(campaign?.expected_dispatch_date));
  setv('groupExpectedDeliveryDate',dateOnly(campaign?.expected_delivery_from||profile.international_expected_delivery_date||profile.local_expected_delivery_date));

  setGroupTermsLocked(campaign);
  handleModeChange();

  const status=$('#productShippingStatus');
  if(status){
    status.textContent=campaign
      ? 'Loaded this product with active Group Order '+(campaign.campaign_reference||'campaign')+'.'
      : 'Loaded separate Local / International / MOQ settings for '+(product.product_name||'this product')+'.';
  }
}

function resetProductExtension(){
  activeEditingProduct=null;
  setChecked('productLocalAvailable',true);
  setv('localSellingPrice',$('#productPrice')?.value||'');
  setv('localExpectedDeliveryDate','');

  setChecked('productInternationalEnabled',false);
  setv('internationalOriginCountry','');
  setv('internationalOriginRegion','');
  setv('internationalOriginTown','');
  setv('internationalItemPrice','');
  setv('internationalCenterFee',0);
  setv('internationalDistributionCenter','LEOGO Distribution Center — Nairobi');
  setv('internationalExpectedDeliveryDate','');
  setv('internationalDispatchDetails','');

  setChecked('productMoqEnabled',false);
  setv('productMoqMinimum','');
  setv('productMoqMaximum','');

  const group=$('#productGroupEnabled');
  if(group)group.disabled=false;
  setChecked('productGroupEnabled',false);
  setv('groupOpening','');
  setv('groupClosing','');
  setv('groupUnitPrice','');
  setv('groupClosePolicy','deadline');
  setv('groupDispatchDate','');
  setv('groupExpectedDeliveryDate','');
  setGroupTermsLocked(null);

  handleModeChange();
  const status=$('#productShippingStatus');
  if(status)status.textContent='';
}

function ensureDashboard(){
  const shell=$('#sellerShell');
  if(!shell||$('#sellerGroupOrdersPanel'))return;

  const nav=$('.seller-sidebar',shell)||$('nav',shell);
  const button=document.createElement('button');
  button.type='button';
  button.id='openSellerGroupOrders';
  button.dataset.sellerView='group_orders';
  button.innerHTML='<span>🌍</span> Group Orders';
  nav?.appendChild(button);

  const container=$('.seller-content',shell)||shell;
  const panel=document.createElement('section');
  panel.id='sellerGroupOrdersPanel';
  panel.className='seller-view shipping-moq-dashboard';
  panel.dataset.sellerContent='group_orders';
  panel.innerHTML=
    '<div class="seller-view-heading"><div><span>GROUP / GLOBAL ORDERS</span><h2>MOQ Campaigns</h2><p>Track payment windows, MOQ progress and shipment stages. Dispatch date can be added after MOQ closes.</p></div><button id="refreshSellerGroups" type="button">↻ Refresh</button></div>'+
    '<div id="sellerGroupOrderList" class="shipping-moq-list"></div>';
  container.appendChild(panel);

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    $$('[data-seller-content]',shell).forEach(element=>element.classList.toggle('active',element===panel));
    $$('[data-seller-view]',shell).forEach(element=>element.classList.toggle('active',element===button));
    const description=$('#sellerViewDescription');
    if(description)description.textContent='Track Group / Global Order MOQ campaigns, payment windows, dispatch dates and shipment progress.';
    $('#sellerSidebar')?.classList.remove('open');
    $('#sellerSidebarScrim')?.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
    loadCampaigns();
  });

  $('#refreshSellerGroups')?.addEventListener('click',loadCampaigns);
}

async function loadCampaigns(){
  const {data,error}=await client.rpc('seller_list_group_orders');
  campaigns=error?[]:(Array.isArray(data)?data:[]);
  renderCampaigns(error);
}

function renderCampaigns(error){
  const host=$('#sellerGroupOrderList');
  if(!host)return;

  if(error){
    host.innerHTML='<div class="shipping-moq-empty">'+esc(error.message)+'</div>';
    return;
  }
  if(!campaigns.length){
    host.innerHTML='<div class="shipping-moq-empty">No MOQ campaigns yet. Edit a product and switch on “Send to Group / Global Orders” when you are ready.</div>';
    return;
  }

  host.innerHTML=campaigns.map(campaign=>{
    const pct=Math.min(100,Number(campaign.quantity_committed||0)/Number(campaign.minimum_quantity||1)*100);
    const participants=Number(campaign.participant_count||0);
    const canRemove=participants===0&&['collecting_orders','paused'].includes(campaign.status);
    const canSetDispatch=['moq_reached','order_confirmed','seller_preparing'].includes(campaign.status);

    const next=({
      order_confirmed:['seller_preparing','Seller Preparing'],
      seller_preparing:['dispatched_origin','Dispatched From Origin'],
      dispatched_origin:['in_transit','In Transit'],
      in_transit:['arrived_destination','Arrived at Destination']
    })[campaign.status];

    return '<article class="shipping-moq-row" data-seller-campaign="'+esc(campaign.id)+'">'+
      '<header><div><b>'+esc(campaign.campaign_reference)+'</b><h3>'+esc(campaign.product_name||'Group Order')+'</h3><small>Payments: '+fmt(campaign.opening_at)+' → '+fmt(campaign.closing_at)+'</small></div><span>'+esc(String(campaign.status).replaceAll('_',' '))+'</span></header>'+
      '<div class="shipping-moq-progress"><span style="width:'+pct+'%"></span></div>'+
      '<div class="shipping-moq-row-grid">'+
        '<div><small>MOQ</small><strong>'+Number(campaign.minimum_quantity||0)+'</strong></div>'+
        '<div><small>Committed</small><strong>'+Number(campaign.quantity_committed||0)+'</strong></div>'+
        '<div><small>Remaining</small><strong>'+Math.max(0,Number(campaign.minimum_quantity||0)-Number(campaign.quantity_committed||0))+'</strong></div>'+
        '<div><small>Customers</small><strong>'+participants+'</strong></div>'+
        '<div><small>Customer price</small><strong>'+money(campaign.customer_unit_price_kes)+'</strong></div>'+
        '<div><small>Expected delivery</small><strong>'+fmt(campaign.expected_delivery_from)+(campaign.expected_delivery_to?' – '+fmt(campaign.expected_delivery_to):'')+'</strong></div>'+
      '</div>'+
      (canSetDispatch
        ? '<div class="group-dispatch-update"><label><span>Expected dispatch date</span><input type="date" data-dispatch-date value="'+esc(dateOnly(campaign.expected_dispatch_date))+'"></label><button type="button" data-update-dispatch="'+esc(campaign.id)+'">'+(campaign.expected_dispatch_date?'Update Dispatch Date':'Set Dispatch Date')+'</button></div>'
        : '<div class="group-dispatch-readonly"><span>Expected dispatch</span><strong>'+fmt(campaign.expected_dispatch_date)+'</strong><small>'+(campaign.expected_dispatch_date?'':'Can be added when MOQ closes.')+'</small></div>')+
      '<div class="shipping-stage-actions">'+
        (next?'<button type="button" data-campaign="'+esc(campaign.id)+'" data-stage="'+next[0]+'">'+next[1]+'</button>':'')+
        (canRemove?'<button class="danger-soft" type="button" data-remove-group-product="'+esc(campaign.product_id)+'">Remove from Group Order</button>':'')+
      '</div>'+
    '</article>';
  }).join('');
}

async function updateStage(id,status){
  const note=prompt('Optional shipment update note:')||'';
  const {error}=await client.rpc('seller_update_group_order_status',{
    p_campaign_id:id,
    p_status:status,
    p_note:note
  });
  if(error)alert(error.message);
  await loadCampaigns();
}

async function updateDispatchDate(button){
  const row=button.closest('[data-seller-campaign]');
  const date=row?.querySelector('[data-dispatch-date]')?.value||'';
  if(!date){
    alert('Choose the expected dispatch date.');
    return;
  }
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Saving…';
  try{
    const {error}=await client.rpc('seller_update_group_dispatch_date',{
      p_campaign_id:button.dataset.updateDispatch,
      p_expected_dispatch_date:date,
      p_note:null
    });
    if(error)throw error;
    await loadCampaigns();
  }catch(error){
    alert(error?.message||'Dispatch date could not be updated.');
    button.disabled=false;
    button.textContent=original;
  }
}

async function removeFromGroup(button){
  if(!confirm('Remove this product from Group / Global Orders? This is allowed only before any customer joins.'))return;
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Removing…';
  try{
    const {error}=await client.rpc('seller_remove_product_from_group',{
      p_product_id:button.dataset.removeGroupProduct
    });
    if(error)throw error;
    await Promise.all([loadProducts(),loadCampaigns()]);
  }catch(error){
    alert(error?.message||'Product could not be removed from Group Orders.');
    button.disabled=false;
    button.textContent=original;
  }
}

let authenticatedDataLoaded=false;

const loadAuthenticatedSellerData=async()=>{
  const {data,error}=await client.auth.getSession();
  if(error||!data?.session?.user)return false;
  if(authenticatedDataLoaded)return true;

  // Partner sessions also belong to non-Sellers and pending Seller applicants.
  const {data:account,error:accountError}=await client.rpc('seller_get_own_account');
  if(accountError||account?.application_status!=='approved')return false;

  authenticatedDataLoaded=true;
  try{
    await Promise.all([loadProducts(),loadCampaigns(),loadDeliveryRates()]);
    return true;
  }catch(error){
    authenticatedDataLoaded=false;
    const status=$('#productShippingStatus');
    if(status)status.textContent=error?.message||'Product settings could not finish loading.';
    return false;
  }
};

const watchSellerAuth=()=>{
  loadAuthenticatedSellerData().catch(()=>{});
  client.auth.onAuthStateChange((event,session)=>{
    if(session?.user&&!authenticatedDataLoaded){
      window.setTimeout(()=>loadAuthenticatedSellerData().catch(()=>{}),0);
    }
    if(!session?.user&&event==='SIGNED_OUT'){
      authenticatedDataLoaded=false;
      products=[];
      campaigns=[];
      deliveryRates=null;
    }
  });
};

const init=async()=>{
  loadStyle();
  ensureProductFields();
  ensureDashboard();
  captureProductSettings();
  handleModeChange();

  document.addEventListener('leogo:seller-product-editing',async(event)=>{
    const productId=event?.detail?.productId;
    if(!productId)return;
    try{
      if(!products.some(product=>product.id===productId))await loadAuthenticatedSellerData();
      applyProductExtension(products.find(product=>product.id===productId));
    }catch(error){
      const status=$('#productShippingStatus');
      if(status)status.textContent=error?.message||'Product selling/delivery settings could not be loaded.';
    }
  });

  $('#showSellerProductForm')?.addEventListener('click',()=>window.setTimeout(resetProductExtension,0));
  $('#cancelProductEdit')?.addEventListener('click',()=>window.setTimeout(resetProductExtension,0));

  watchSellerAuth();

  document.addEventListener('click',event=>{
    const stage=event.target.closest('[data-campaign][data-stage]');
    if(stage)updateStage(stage.dataset.campaign,stage.dataset.stage);

    const dispatch=event.target.closest('[data-update-dispatch]');
    if(dispatch)updateDispatchDate(dispatch);

    const remove=event.target.closest('[data-remove-group-product]');
    if(remove)removeFromGroup(remove);
  });
};

window.leogoProductModes={
  shippingPayload,
  campaignPayload,
  applyProductExtension,
  resetProductExtension,
  renderCampaigns,
  internationalLandedPrice
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();

})();

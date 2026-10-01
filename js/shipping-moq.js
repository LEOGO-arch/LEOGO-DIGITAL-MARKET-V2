(() => {
'use strict';

const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmtDate=v=>v?new Date(v).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}):'—';
const fmtDateTime=v=>v?new Date(v).toLocaleString('en-KE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const norm=v=>String(v||'').trim().toLowerCase();

let catalogue=[];
let groups=[];

function loadStyle(){
  if($('#shippingMoqStyle'))return;
  const link=document.createElement('link');
  link.id='shippingMoqStyle';
  link.rel='stylesheet';
  link.href='css/shipping-moq.css?v=product-modes-2';
  document.head.appendChild(link);
}

function locationValue(ids){
  for(const id of ids){
    const element=$(id);
    const value=element?.value||element?.textContent;
    if(String(value||'').trim())return String(value).trim();
  }
  return '';
}

function estimateText(min,max,unit){
  if(min==null||max==null||!unit)return '';
  const short=unit==='minutes'?'mins':unit;
  return Number(min)+'–'+Number(max)+' '+short;
}

/* Backward-compatible delivery-time classifier used by existing product detail
   code/tests. Local delivery CHARGES are not taken from this function; they are
   always the platform delivery-rate rules returned with the catalogue. */
function classify(product){
  const shipping=product.shipping_profile||{};
  const defaults=product.shipping_defaults||{};
  const customerCounty=locationValue(['#profileCounty','#checkoutCounty','#customerCounty']);
  const customerTown=locationValue(['#profileEstate','#checkoutTown','#customerTown']);
  const country=shipping.origin_country||'Kenya';
  const county=shipping.origin_county_region||'';
  const town=shipping.origin_town_city||'';

  let key='default',label='Shipping estimate',icon='📦',min,max,unit,route=town||county||country;
  if(shipping.origin_type==='international'||norm(country)!=='kenya'){
    key='international';label='International / Overseas';icon='🌍';
    min=shipping.international_min??defaults.international_min;
    max=shipping.international_max??defaults.international_max;
    unit=shipping.international_unit||defaults.international_unit;
  }else if(customerTown&&town&&norm(customerTown)===norm(town)){
    key='local';label='Local Seller';icon='📍';
    min=shipping.same_town_min??defaults.local_min;
    max=shipping.same_town_max??defaults.local_max;
    unit=shipping.same_town_unit||defaults.local_unit;
  }else if(customerCounty&&county&&norm(customerCounty)===norm(county)){
    key='same_county';label='Local Seller';icon='📍';
    min=shipping.same_county_min??defaults.same_county_min;
    max=shipping.same_county_max??defaults.same_county_max;
    unit=shipping.same_county_unit||defaults.same_county_unit;
  }else if(customerCounty&&county){
    key='inter_county';label='Inter-County';icon='🚚';
    min=shipping.inter_county_min??defaults.inter_county_min;
    max=shipping.inter_county_max??defaults.inter_county_max;
    unit=shipping.inter_county_unit||defaults.inter_county_unit;
    route=(town||county)+' → '+customerCounty;
  }else{
    min=shipping.inter_county_min??defaults.inter_county_min;
    max=shipping.inter_county_max??defaults.inter_county_max;
    unit=shipping.inter_county_unit||defaults.inter_county_unit;
  }
  return {key,label,icon,route,estimate:estimateText(min,max,unit)};
}

function canJoin(campaign){
  if(!campaign||!['collecting_orders','moq_reached'].includes(campaign.status))return false;
  const now=Date.now();
  const opening=new Date(campaign.opening_at).getTime();
  const closing=new Date(campaign.closing_at).getTime();
  if(!Number.isFinite(opening)||!Number.isFinite(closing)||now<opening||now>=closing)return false;
  const quantity=Number(campaign.quantity_committed||0);
  return !(campaign.close_policy==='moq'&&quantity>=Number(campaign.minimum_quantity))
    && !(campaign.maximum_quantity!=null&&quantity>=Number(campaign.maximum_quantity));
}

function joinButtonHtml(campaign){
  return canJoin(campaign)
    ? '<button class="live-product-cart-start" type="button" data-join-group="'+esc(campaign.id)+'">Join Group Order</button>'
    : '<button class="live-product-cart-start" type="button" disabled>Group joining unavailable</button>';
}

function localDeliveryFeeHtml(product){
  const rates=product.delivery_rates||{};
  if(rates.cbd_fee_kes==null&&rates.estate_fee_kes==null&&rates.outside_town_fee_kes==null)return '';
  return '<div class="product-public-rate-strip">'+
    '<span>Local delivery by LEOGO:</span>'+
    '<b>CBD '+money(rates.cbd_fee_kes)+'</b>'+
    '<b>Estate '+money(rates.estate_fee_kes)+'</b>'+
    '<b>Outside town '+money(rates.outside_town_fee_kes)+'+</b>'+
  '</div>';
}

function detailsHtml(product){
  const profile=product.shipping_profile||{};
  const campaign=product.group_campaign||null;
  const hasProfile=Boolean(profile.product_id||Object.keys(profile).length);
  if(!hasProfile&&!campaign&&(product.fulfilment_type||'normal')==='normal')return '';

  const legacyInternational=product.fulfilment_type==='preorder'||product.fulfilment_type==='group_order'||profile.origin_type==='international';
  const localAvailable=hasProfile ? profile.local_available!==false : product.fulfilment_type==='normal';
  const internationalEnabled=hasProfile ? Boolean(profile.international_order_enabled) : legacyInternational;
  const moqEnabled=hasProfile ? Boolean(profile.moq_enabled) : Boolean(campaign);
  const blocks=[];

  if(localAvailable){
    const localPrice=profile.local_price_kes??product.price_kes;
    blocks.push(
      '<div class="product-public-mode local">'+
        '<div class="product-public-mode-head"><b>📍 Available Locally</b><strong>'+money(localPrice)+'</strong></div>'+
        (profile.local_expected_delivery_date?'<small>Expected delivery: '+fmtDate(profile.local_expected_delivery_date)+'</small>':'')+
        localDeliveryFeeHtml(product)+
      '</div>'
    );
  }

  if(internationalEnabled){
    const itemPrice=Number(profile.international_price_kes??product.price_kes??0);
    const centerFee=Number(profile.international_shipping_fee_to_center_kes||0);
    const landed=itemPrice+centerFee;
    const origin=[profile.origin_town_city,profile.origin_county_region,profile.origin_country].filter(Boolean).join(', ');
    blocks.push(
      '<div class="product-public-mode international">'+
        '<div class="product-public-mode-head"><b>🌍 International Order</b><strong>'+money(landed)+'</strong></div>'+
        '<small>Item '+money(itemPrice)+' + freight to '+esc(profile.distribution_center||'LEOGO Distribution Center — Nairobi')+' '+money(centerFee)+'</small>'+
        (origin?'<small>Ships from '+esc(origin)+'</small>':'')+
        (profile.international_expected_delivery_date?'<small>Expected delivery: '+fmtDate(profile.international_expected_delivery_date)+'</small>':'')+
        '<small>Local delivery from LEOGO to you is calculated separately using the system delivery rules.</small>'+
      '</div>'
    );
  }

  if(moqEnabled){
    blocks.push(
      '<div class="product-public-mode moq">'+
        '<div class="product-public-mode-head"><b>📦 MOQ</b><strong>Minimum '+Number(profile.moq_minimum_quantity??campaign?.minimum_quantity??0)+'</strong></div>'+
        (profile.moq_maximum_quantity!=null?'<small>Maximum quantity: '+Number(profile.moq_maximum_quantity)+'</small>':'')+
      '</div>'
    );
  }

  if(campaign){
    const pct=Math.min(100,Number(campaign.quantity_committed||0)/Number(campaign.minimum_quantity||1)*100);
    blocks.push(
      '<div class="product-public-mode group">'+
        '<div class="product-public-mode-head"><b>👥 Group / Global Order</b><strong>'+money(campaign.customer_unit_price_kes)+'</strong></div>'+
        '<small>Payment window: '+fmtDateTime(campaign.opening_at)+' → '+fmtDateTime(campaign.closing_at)+'</small>'+
        '<small>MOQ progress: '+Number(campaign.quantity_committed||0)+' / '+Number(campaign.minimum_quantity||0)+' ('+Math.round(pct)+'%)</small>'+
        (campaign.expected_dispatch_date?'<small>Expected dispatch: '+fmtDate(campaign.expected_dispatch_date)+'</small>':'<small>Dispatch date will be updated after MOQ closes.</small>')+
        (campaign.expected_delivery_from?'<small>Expected delivery: '+fmtDate(campaign.expected_delivery_from)+(campaign.expected_delivery_to?' – '+fmtDate(campaign.expected_delivery_to):'')+'</small>':'')+
      '</div>'
    );
  }

  return '<div class="live-product-detail-section product-public-modes" data-product-shipping-info="'+esc(product.id)+'">'+
    '<div class="live-product-detail-label">Selling & Delivery Options</div>'+
    blocks.join('')+
  '</div>';
}

window.leogoShippingMoq={classify,canJoin,joinButtonHtml,detailsHtml};

function ensureUI(){
  if($('#groupOrderMarketplace'))return;
  const host=$('#catalogue')||$('#marketplace')||$('main');
  if(!host)return;

  const section=document.createElement('section');
  section.id='groupOrderMarketplace';
  section.className='shipping-moq-section';
  section.innerHTML=
    '<div class="shipping-moq-head"><div><span>GROUP / GLOBAL ORDERS</span><h2>Join a Group Order</h2><p>Combine quantities with other customers to reach the Seller MOQ. Group payment dates and prices are separate from any local stock offer.</p></div><button id="refreshGroupMarketplace" type="button">↻ Refresh</button></div>'+
    '<div id="groupOrderMarketStatus" class="shipping-moq-status">Loading campaigns…</div>'+
    '<div id="groupOrderMarketGrid" class="shipping-moq-grid"></div>';
  host.insertAdjacentElement('afterend',section);

  const orders=$('[data-customer-panel="orders"]');
  if(orders&&!$('#customerGroupOrders')){
    const box=document.createElement('section');
    box.id='customerGroupOrders';
    box.className='shipping-moq-dashboard';
    box.innerHTML=
      '<div class="shipping-moq-head compact"><div><span>GROUP ORDER / MOQ</span><h3>My Group Orders</h3><p>Separate from ordinary local or pre-order purchases.</p></div><button id="refreshCustomerGroups" type="button">↻ Refresh</button></div>'+
      '<div id="customerGroupOrderList"><div class="shipping-moq-status">Sign in to view your participation.</div></div>';
    orders.appendChild(box);
  }

  const modal=document.createElement('div');
  modal.id='groupJoinModal';
  modal.className='shipping-moq-modal';
  modal.hidden=true;
  modal.innerHTML=
    '<button class="shipping-moq-backdrop" type="button" data-close-group></button>'+
    '<form id="groupJoinForm" class="shipping-moq-dialog">'+
      '<header><div><span>JOIN GROUP ORDER</span><h2 id="groupJoinTitle">Group Order</h2><p id="groupJoinSummary"></p></div><button type="button" data-close-group>×</button></header>'+
      '<input id="groupJoinCampaignId" type="hidden">'+
      '<label>Quantity<input id="groupJoinQuantity" type="number" min="1" step="1" value="1" required></label>'+
      '<label>Payment method<select id="groupJoinPaymentMethod" required><option value="till">M-Pesa Till</option><option value="paybill">M-Pesa Paybill</option><option value="bank">Bank</option></select></label>'+
      '<label>Payment reference<input id="groupJoinPaymentReference" maxlength="100" required placeholder="Paste payment reference"></label>'+
      '<div id="groupJoinTotal" class="shipping-moq-total"></div>'+
      '<p class="shipping-moq-note">Admin verifies payment. Seller settlement stays held until MOQ is reached, the campaign is confirmed, and delivery conditions are satisfied.</p>'+
      '<div id="groupJoinStatus" class="shipping-moq-status"></div>'+
      '<footer><button type="button" data-close-group>Cancel</button><button type="submit">Join Group Order</button></footer>'+
    '</form>';
  document.body.appendChild(modal);
}

function renderMarket(){
  const rows=catalogue.filter(product=>product.group_campaign);
  const grid=$('#groupOrderMarketGrid');
  if(!grid)return;

  if(!rows.length){
    grid.innerHTML='<div class="shipping-moq-empty">No active Group / Global Orders are available now.</div>';
    return;
  }

  grid.innerHTML=rows.map(product=>{
    const campaign=product.group_campaign;
    const profile=product.shipping_profile||{};
    const pct=Math.min(100,Number(campaign.quantity_committed||0)/Number(campaign.minimum_quantity||1)*100);
    const remain=Math.max(0,Number(campaign.minimum_quantity)-Number(campaign.quantity_committed||0));
    const origin=[profile.origin_town_city,profile.origin_county_region,profile.origin_country].filter(Boolean).join(', ');

    return '<article class="shipping-moq-card">'+
      '<div class="shipping-moq-badges"><b>GROUP ORDER</b><span>'+esc(profile.international_order_enabled?'🌍 International':'📦 MOQ')+'</span></div>'+
      '<h3>'+esc(product.product_name)+'</h3>'+
      '<strong>'+money(campaign.customer_unit_price_kes)+'</strong>'+
      (origin?'<small>Origin: '+esc(origin)+'</small>':'')+
      (profile.distribution_center?'<small>Distribution center: '+esc(profile.distribution_center)+'</small>':'')+
      '<div class="shipping-moq-progress"><span style="width:'+pct+'%"></span></div>'+
      '<div class="shipping-moq-stats"><b>'+Number(campaign.quantity_committed||0)+'/'+Number(campaign.minimum_quantity||0)+' joined</b><span>'+remain+' remaining</span><span>'+Math.round(pct)+'%</span></div>'+
      '<small>'+esc(String(campaign.status).replaceAll('_',' '))+' · Payments close: '+fmtDateTime(campaign.closing_at)+'</small>'+
      (campaign.expected_dispatch_date?'<small>Expected dispatch: '+fmtDate(campaign.expected_dispatch_date)+'</small>':'<small>Dispatch date will be updated after MOQ closes.</small>')+
      (campaign.expected_delivery_from?'<small>Expected delivery: '+fmtDate(campaign.expected_delivery_from)+'</small>':'')+
      joinButtonHtml(campaign)+
    '</article>';
  }).join('');
}

function renderCustomer(){
  const host=$('#customerGroupOrderList');
  if(!host)return;
  if(!groups.length){
    host.innerHTML='<div class="shipping-moq-empty">No Group Order participation yet.</div>';
    return;
  }

  host.innerHTML=groups.map(item=>{
    const campaign=item.campaign||item;
    const qty=item.quantity??item.participation_quantity??0;
    const amount=item.amount_kes??item.participation_amount_kes??0;
    const pct=Math.min(100,Number(campaign.quantity_committed||0)/Number(campaign.minimum_quantity||1)*100);

    return '<article class="shipping-moq-row">'+
      '<header><div><b>GROUP ORDER / MOQ</b><h4>'+esc(item.product_name||campaign.product_name||'Group Order')+'</h4><small>'+esc(campaign.campaign_reference||item.campaign_reference||'')+'</small></div><span>'+esc(String(campaign.status||item.status||'').replaceAll('_',' '))+'</span></header>'+
      '<div class="shipping-moq-row-grid">'+
        '<div><small>Your quantity</small><strong>'+qty+'</strong></div>'+
        '<div><small>Your amount</small><strong>'+money(amount)+'</strong></div>'+
        '<div><small>Campaign progress</small><strong>'+Number(campaign.quantity_committed||0)+'/'+Number(campaign.minimum_quantity||0)+' ('+Math.round(pct)+'%)</strong></div>'+
        '<div><small>Payment closes</small><strong>'+fmtDateTime(campaign.closing_at)+'</strong></div>'+
        '<div><small>Expected dispatch</small><strong>'+fmtDate(campaign.expected_dispatch_date)+'</strong></div>'+
        '<div><small>Expected delivery</small><strong>'+fmtDate(campaign.expected_delivery_from)+(campaign.expected_delivery_to?' – '+fmtDate(campaign.expected_delivery_to):'')+'</strong></div>'+
        '<div><small>Refund state</small><strong>'+esc(item.refund_status||campaign.refund_status||'not required')+'</strong></div>'+
      '</div>'+
    '</article>';
  }).join('');
}

function refreshEstimates(){
  renderMarket();
  document.querySelectorAll('[data-product-shipping-info]').forEach(element=>{
    const product=catalogue.find(row=>row.id===element.dataset.productShippingInfo);
    if(product)element.outerHTML=detailsHtml(product);
  });
}

async function loadMarket(){
  const status=$('#groupOrderMarketStatus');
  if(status)status.textContent='Loading campaigns…';
  const {data,error}=await client.rpc('customer_marketplace_catalogue');
  if(error){
    if(status)status.textContent=error.message;
    return;
  }
  catalogue=Array.isArray(data)?data:[];
  if(status)status.textContent='';
  refreshEstimates();
}

async function loadCustomer(){
  const {data:{user}}=await client.auth.getUser();
  if(!user){
    groups=[];
    renderCustomer();
    return;
  }
  const {data,error}=await client.rpc('customer_list_group_orders');
  groups=error?[]:(Array.isArray(data)?data:[]);
  renderCustomer();
}

async function openJoin(id){
  if(!catalogue.some(row=>row.group_campaign?.id===id))await loadMarket();
  const product=catalogue.find(row=>row.group_campaign?.id===id);
  if(!product||!canJoin(product.group_campaign))return;

  const campaign=product.group_campaign;
  $('#groupJoinQuantity').value='1';
  $('#groupJoinPaymentReference').value='';
  $('#groupJoinStatus').textContent='';
  $('#groupJoinCampaignId').value=id;
  $('#groupJoinTitle').textContent=product.product_name;
  $('#groupJoinSummary').textContent=
    'MOQ '+campaign.minimum_quantity+' · '+campaign.quantity_committed+' joined · payments close '+fmtDateTime(campaign.closing_at);
  $('#groupJoinQuantity').max=campaign.maximum_quantity
    ? Math.max(0,Number(campaign.maximum_quantity)-Number(campaign.quantity_committed||0))
    : '';
  $('#groupJoinModal').hidden=false;
  updateTotal();
}

function updateTotal(){
  const id=$('#groupJoinCampaignId')?.value;
  const product=catalogue.find(row=>row.group_campaign?.id===id);
  const quantity=Number($('#groupJoinQuantity')?.value||0);
  $('#groupJoinTotal').textContent=product
    ? 'Total: '+money(quantity*Number(product.group_campaign.customer_unit_price_kes||0))
    : '';
}

async function submitJoin(event){
  event.preventDefault();
  const status=$('#groupJoinStatus');
  status.textContent='Submitting securely…';

  const {data:{user}}=await client.auth.getUser();
  if(!user){
    status.textContent='Please sign in before joining.';
    return;
  }

  const {error}=await client.rpc('customer_join_group_order',{
    p_campaign_id:$('#groupJoinCampaignId').value,
    p_quantity:Number($('#groupJoinQuantity').value),
    p_payment_method:$('#groupJoinPaymentMethod').value,
    p_payment_reference:$('#groupJoinPaymentReference').value.trim()
  });

  if(error){
    status.textContent=error.message;
    return;
  }

  status.textContent='Joined successfully. Payment is waiting for Admin verification.';
  await Promise.all([loadMarket(),loadCustomer()]);
  setTimeout(()=>{$('#groupJoinModal').hidden=true;},900);
}

const init=()=>{
  loadStyle();
  ensureUI();
  loadMarket();
  loadCustomer();

  $('#refreshGroupMarketplace')?.addEventListener('click',loadMarket);
  $('#refreshCustomerGroups')?.addEventListener('click',loadCustomer);
  $('#groupJoinQuantity')?.addEventListener('input',updateTotal);
  $('#groupJoinForm')?.addEventListener('submit',submitJoin);

  document.addEventListener('change',event=>{
    if(['profileCounty','profileEstate','checkoutCounty','checkoutEstate'].includes(event.target.id))refreshEstimates();
  });

  document.addEventListener('click',event=>{
    const join=event.target.closest('[data-join-group]');
    if(join)openJoin(join.dataset.joinGroup);
    if(event.target.closest('[data-close-group]'))$('#groupJoinModal').hidden=true;
  });
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();

})();
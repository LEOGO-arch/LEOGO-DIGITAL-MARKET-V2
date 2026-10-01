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
let products=[],campaigns=[];
function loadStyle(){if($('#shippingMoqPartnerStyle'))return;const l=document.createElement('link');l.id='shippingMoqPartnerStyle';l.rel='stylesheet';l.href='../css/shipping-moq.css?v=1';document.head.appendChild(l);}
const estimate=(key,label,a=1,b=2,unit='days')=>'<fieldset class="shipping-estimate"><legend>'+label+'</legend><label>Minimum<input id="'+key+'Min" type="number" min="0" step="0.1" value="'+a+'"></label><label>Maximum<input id="'+key+'Max" type="number" min="0" step="0.1" value="'+b+'"></label><label>Unit<select id="'+key+'Unit"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days"'+(unit==='days'?' selected':'')+'>Days</option></select></label></fieldset>';
function ensureProductFields(){
 const form=$('#sellerProductForm')||$('#productForm');if(!form||$('#productShippingFields'))return;
 const marker=$('#restrictedCategoryNotice',form)||$('#variantSection',form)||form.lastElementChild;
 const box=document.createElement('section');box.id='productShippingFields';box.className='shipping-product-form';
 box.innerHTML='<div class="section-title compact"><span>SHIPPING / ORDER TYPE</span><h4>Availability, Origin & Delivery Estimates</h4><p>Existing products remain Normal In-Stock unless you choose another type.</p></div><div class="shipping-form-grid"><label>Availability / Order Type<select id="productFulfilmentType"><option value="normal">Normal In-Stock Product</option><option value="preorder">Pre-Order</option><option value="group_order">Group / Global Order – MOQ</option></select></label><label>Shipping origin type<select id="shippingOriginType"><option value="local">Local</option><option value="domestic" selected>Kenya / Domestic</option><option value="international">International / Overseas</option></select></label><label>Origin Country<input id="shippingOriginCountry" value="Kenya"></label><label>Origin County / Region<input id="shippingOriginCounty"></label><label>Origin Town / City<input id="shippingOriginTown"></label><label class="wide">Dispatch location / details<input id="shippingDispatchDetails"></label></div><div class="shipping-estimate-grid">'+estimate('sameTown','Same Town',30,60,'minutes')+estimate('sameCounty','Outside Town / Same County')+estimate('interCounty','Inter-County',2,3)+estimate('international','International / Overseas',20,25)+'</div><div class="shipping-form-grid"><label>Expected dispatch date<input id="shippingDispatchDate" type="date"></label><label>Expected delivery from<input id="shippingDeliveryFrom" type="date"></label><label>Expected delivery to<input id="shippingDeliveryTo" type="date"></label></div><section id="groupCampaignFields" class="group-campaign-fields" hidden><div class="section-title compact"><span>MOQ CAMPAIGN</span><h4>Group / Global Order Settings</h4></div><div class="shipping-form-grid"><label>Minimum Order Quantity<input id="groupMinimum" type="number" min="1" step="1"></label><label>Maximum Quantity (optional)<input id="groupMaximum" type="number" min="1" step="1"></label><label>Opening date & time<input id="groupOpening" type="datetime-local"></label><label>Closing deadline<input id="groupClosing" type="datetime-local"></label><label>Customer price per unit (KSh)<input id="groupUnitPrice" type="number" min="0" step="0.01"></label><label>Campaign closes<select id="groupClosePolicy"><option value="moq">Immediately when MOQ is reached</option><option value="deadline">At deadline (continue after MOQ)</option></select></label></div></section><div id="productShippingStatus" class="shipping-moq-status"></div>';
 marker.insertAdjacentElement('beforebegin',box);
 $('#productFulfilmentType').addEventListener('change',toggleCampaign);
}
function toggleCampaign(){const group=$('#productFulfilmentType')?.value==='group_order';if($('#groupCampaignFields'))$('#groupCampaignFields').hidden=!group;['groupMinimum','groupOpening','groupClosing','groupUnitPrice'].forEach(id=>{const el=$('#'+id);if(el)el.required=group;});}
function shippingPayload(){
 const value=id=>$('#'+id)?.value||'';
 return {fulfilment_type:value('productFulfilmentType'),origin_type:value('shippingOriginType'),origin_country:value('shippingOriginCountry'),origin_county_region:value('shippingOriginCounty'),origin_town_city:value('shippingOriginTown'),dispatch_details:value('shippingDispatchDetails'),same_town_min:value('sameTownMin'),same_town_max:value('sameTownMax'),same_town_unit:value('sameTownUnit'),same_county_min:value('sameCountyMin'),same_county_max:value('sameCountyMax'),same_county_unit:value('sameCountyUnit'),inter_county_min:value('interCountyMin'),inter_county_max:value('interCountyMax'),inter_county_unit:value('interCountyUnit'),international_min:value('internationalMin'),international_max:value('internationalMax'),international_unit:value('internationalUnit'),expected_dispatch_date:value('shippingDispatchDate'),expected_delivery_from:value('shippingDeliveryFrom'),expected_delivery_to:value('shippingDeliveryTo')};
}
function campaignPayload(){
 if($('#productFulfilmentType')?.value!=='group_order')return null;
 const value=id=>$('#'+id)?.value||'';
 return {minimum_quantity:Number(value('groupMinimum')),maximum_quantity:value('groupMaximum')?Number(value('groupMaximum')):null,opening_at:new Date(value('groupOpening')).toISOString(),closing_at:new Date(value('groupClosing')).toISOString(),expected_dispatch_date:value('shippingDispatchDate'),expected_delivery_from:value('shippingDeliveryFrom'),expected_delivery_to:value('shippingDeliveryTo')||null,customer_unit_price_kes:Number(value('groupUnitPrice')),close_policy:value('groupClosePolicy')};
}
async function loadProducts(){const {data,error}=await client.rpc('seller_list_own_products');if(error)throw error;products=Array.isArray(data)?data:[];const sel=$('#shippingProductSelector');if(sel){sel.innerHTML='<option value="">Choose product</option>'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.product_name)+'</option>').join('');}}
async function saveForProduct(productId,pShipping,pCampaign){const st=$('#productShippingStatus');if(st)st.textContent='Saving shipping profile…';const {error}=await client.rpc('seller_save_product_shipping',{p_product_id:productId,p_shipping:pShipping,p_campaign:pCampaign});if(error){if(st)st.textContent=error.message;throw error;}if(st)st.textContent='Shipping profile and order type saved.';await Promise.all([loadProducts(),loadCampaigns()]);}
let pendingProductExtensionSave=null;
async function afterProductSubmit(){
 const form=$('#sellerProductForm')||$('#productForm');if(!form)return;

 // Capture extension values while the Seller form still contains them.
 form.addEventListener('submit',()=>{
  try{
    pendingProductExtensionSave={
      shipping:shippingPayload(),
      campaign:campaignPayload()
    };
  }catch(error){
    pendingProductExtensionSave=null;
    const st=$('#productShippingStatus');
    if(st)st.textContent=error?.message||'Complete valid MOQ dates.';
  }
 },true);

 // The core Seller module emits this only after its normal product/variant save
 // has completed successfully, removing the previous timeout/name matching race.
 document.addEventListener('leogo:seller-product-saved',async(event)=>{
  const productId=event?.detail?.productId;
  const pending=pendingProductExtensionSave;
  pendingProductExtensionSave=null;
  if(!productId||!pending)return;
  try{
    await saveForProduct(productId,pending.shipping,pending.campaign);
  }catch(error){
    const st=$('#productShippingStatus');
    if(st)st.textContent=error?.message||'Product saved, but Shipping / MOQ settings need to be saved again.';
  }
 });
}
function ensureManagement(){
 const form=$('#sellerProductForm')||$('#productForm');if(!form||$('#shippingProductManager'))return;
 const manager=document.createElement('section');manager.id='shippingProductManager';manager.className='panel shipping-product-manager';
 manager.innerHTML='<div class="section-title"><span>EDIT SHIPPING PROFILE</span><h3>Update an Existing Product</h3><p>Select a product, load its current shipping settings, edit the fields above, then save.</p></div><div class="shipping-manager-actions"><select id="shippingProductSelector"><option value="">Choose product</option></select><button id="loadShippingProduct" type="button">Load Shipping Settings</button><button id="saveShippingProduct" type="button">Save Shipping Settings</button></div>';
 form.insertAdjacentElement('afterend',manager);
 $('#loadShippingProduct').addEventListener('click',loadSelected);
 $('#saveShippingProduct').addEventListener('click',async()=>{const id=$('#shippingProductSelector').value;if(!id)return;try{await saveForProduct(id,shippingPayload(),campaignPayload());}catch{}});
}
function setv(id,v){const el=$('#'+id);if(el)el.value=v??'';}
function loadSelected(){const p=products.find(x=>x.id===$('#shippingProductSelector').value);if(!p)return;const s=p.shipping_profile||{},g=p.group_campaign||{};setv('productFulfilmentType',p.fulfilment_type||'normal');setv('shippingOriginType',s.origin_type||'domestic');setv('shippingOriginCountry',s.origin_country||'Kenya');setv('shippingOriginCounty',s.origin_county_region);setv('shippingOriginTown',s.origin_town_city);setv('shippingDispatchDetails',s.dispatch_details);[['sameTown','same_town'],['sameCounty','same_county'],['interCounty','inter_county'],['international','international']].forEach(([a,b])=>{setv(a+'Min',s[b+'_min']);setv(a+'Max',s[b+'_max']);setv(a+'Unit',s[b+'_unit']);});setv('shippingDispatchDate',s.expected_dispatch_date);setv('shippingDeliveryFrom',s.expected_delivery_from);setv('shippingDeliveryTo',s.expected_delivery_to);setv('groupMinimum',g.minimum_quantity);setv('groupMaximum',g.maximum_quantity);setv('groupOpening',g.opening_at?g.opening_at.slice(0,16):'');setv('groupClosing',g.closing_at?g.closing_at.slice(0,16):'');setv('groupUnitPrice',g.customer_unit_price_kes);setv('groupClosePolicy',g.close_policy||'deadline');toggleCampaign();$('#productShippingStatus').textContent='Loaded '+p.product_name+'.';}
function ensureDashboard(){
 const shell=$('#sellerShell');if(!shell||$('#sellerGroupOrdersPanel'))return;
 const nav=$('.seller-sidebar',shell)||$('nav',shell);
 const btn=document.createElement('button');
 btn.type='button';
 btn.id='openSellerGroupOrders';
 btn.dataset.sellerView='group_orders';
 btn.innerHTML='<span>🌍</span> Group Orders';
 nav?.appendChild(btn);

 const container=$('.seller-content',shell)||shell;
 const panel=document.createElement('section');
 panel.id='sellerGroupOrdersPanel';
 panel.className='seller-view shipping-moq-dashboard';
 panel.dataset.sellerContent='group_orders';
 panel.innerHTML='<div class="seller-view-heading"><div><span>GROUP / GLOBAL ORDERS</span><h2>MOQ Campaigns</h2><p>Track quantities, customers, deadlines and shipment stages. Confirmed customer quantities cannot be edited.</p></div><button id="refreshSellerGroups" type="button">↻ Refresh</button></div><div id="sellerGroupOrderList" class="shipping-moq-list"></div>';
 container.appendChild(panel);

 btn.addEventListener('click',e=>{
  e.preventDefault();
  e.stopPropagation();
  $('[data-seller-content]',shell).forEach(x=>x.classList.toggle('active',x===panel));
  $('[data-seller-view]',shell).forEach(x=>x.classList.toggle('active',x===btn));
  const desc=$('#sellerViewDescription');
  if(desc)desc.textContent='Track Group / Global Order MOQ campaigns, customer commitments and shipment progress.';
  $('#sellerSidebar')?.classList.remove('open');
  $('#sellerSidebarScrim')?.classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
  loadCampaigns();
 });
 $('#refreshSellerGroups').addEventListener('click',loadCampaigns);
}
async function loadCampaigns(){const {data,error}=await client.rpc('seller_list_group_orders');campaigns=error?[]:(Array.isArray(data)?data:[]);renderCampaigns(error);}
function renderCampaigns(error){const host=$('#sellerGroupOrderList');if(!host)return;if(error){host.innerHTML='<div class="shipping-moq-empty">'+esc(error.message)+'</div>';return;}if(!campaigns.length){host.innerHTML='<div class="shipping-moq-empty">No MOQ campaigns yet.</div>';return;}host.innerHTML=campaigns.map(c=>{const pct=Math.min(100,Number(c.quantity_committed||0)/Number(c.minimum_quantity||1)*100);return '<article class="shipping-moq-row"><header><div><b>'+esc(c.campaign_reference)+'</b><h3>'+esc(c.product_name||'Group Order')+'</h3><small>Closes '+fmt(c.closing_at)+'</small></div><span>'+esc(String(c.status).replaceAll('_',' '))+'</span></header><div class="shipping-moq-progress"><span style="width:'+pct+'%"></span></div><div class="shipping-moq-row-grid"><div><small>MOQ</small><strong>'+c.minimum_quantity+'</strong></div><div><small>Committed</small><strong>'+c.quantity_committed+'</strong></div><div><small>Remaining</small><strong>'+Math.max(0,Number(c.minimum_quantity)-Number(c.quantity_committed||0))+'</strong></div><div><small>Customers</small><strong>'+c.participant_count+'</strong></div><div><small>Committed amount</small><strong>'+money(c.amount_committed_kes)+'</strong></div><div><small>Expected delivery</small><strong>'+fmt(c.expected_delivery_from)+' – '+fmt(c.expected_delivery_to||c.expected_delivery_from)+'</strong></div></div><div class="shipping-stage-actions">'+[['seller_preparing','Seller Preparing'],['dispatched_origin','Dispatched From Origin'],['in_transit','In Transit'],['arrived_destination','Arrived at Destination']].map(a=>'<button type="button" data-campaign="'+c.id+'" data-stage="'+a[0]+'">'+a[1]+'</button>').join('')+'</div></article>';}).join('');}
async function updateStage(id,status){const note=prompt('Optional shipment update note:')||'';const {error}=await client.rpc('seller_update_group_order_status',{p_campaign_id:id,p_status:status,p_note:note});if(error)alert(error.message);await loadCampaigns();}
const init=async()=>{loadStyle();ensureProductFields();ensureManagement();ensureDashboard();toggleCampaign();afterProductSubmit();try{await Promise.all([loadProducts(),loadCampaigns()]);}catch(e){const st=$('#productShippingStatus');if(st)st.textContent=e.message;}document.addEventListener('click',e=>{const b=e.target.closest('[data-campaign][data-stage]');if(b)updateStage(b.dataset.campaign,b.dataset.stage);});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
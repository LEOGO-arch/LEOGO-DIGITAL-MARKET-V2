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
const norm=v=>String(v||'').trim().toLowerCase();
let catalogue=[],groups=[];
function loadStyle(){if($('#shippingMoqStyle'))return;const l=document.createElement('link');l.id='shippingMoqStyle';l.rel='stylesheet';l.href='css/shipping-moq.css?v=1';document.head.appendChild(l);}
function locationValue(ids){for(const id of ids){const el=$(id);const v=el?.value||el?.textContent;if(String(v||'').trim())return String(v).trim();}return '';}
function estimateText(min,max,unit){if(min==null||max==null||!unit)return '';const short=unit==='minutes'?'mins':unit;return Number(min)+'–'+Number(max)+' '+short;}
function classify(p){
 const s=p.shipping_profile||{},d=p.shipping_defaults||{};
 const customerCounty=locationValue(['#profileCounty','#checkoutCounty','#customerCounty']);
 const customerTown=locationValue(['#profileEstate','#checkoutTown','#customerTown']);
 const country=s.origin_country||'Kenya',county=s.origin_county_region||'',town=s.origin_town_city||'';
 let key='default',label='Shipping estimate',icon='📦',min,max,unit,route=town||county||country;
 if(s.origin_type==='international'||norm(country)!=='kenya'){key='international';label='International / Overseas';icon='🌍';min=s.international_min??d.international_min;max=s.international_max??d.international_max;unit=s.international_unit||d.international_unit;}
 else if(customerTown&&town&&norm(customerTown)===norm(town)){key='local';label='Local Seller';icon='📍';min=s.same_town_min??d.local_min;max=s.same_town_max??d.local_max;unit=s.same_town_unit||d.local_unit;}
 else if(customerCounty&&county&&norm(customerCounty)===norm(county)){key='same_county';label='Local Seller';icon='📍';min=s.same_county_min??d.same_county_min;max=s.same_county_max??d.same_county_max;unit=s.same_county_unit||d.same_county_unit;}
 else if(customerCounty&&county){key='inter_county';label='Inter-County';icon='🚚';min=s.inter_county_min??d.inter_county_min;max=s.inter_county_max??d.inter_county_max;unit=s.inter_county_unit||d.inter_county_unit;route=(town||county)+' → '+customerCounty;}
 else {min=s.inter_county_min??d.inter_county_min;max=s.inter_county_max??d.inter_county_max;unit=s.inter_county_unit||d.inter_county_unit;}
 return {key,label,icon,route,estimate:estimateText(min,max,unit)};
}
function ensureUI(){
 if($('#groupOrderMarketplace'))return;
 const host=$('#catalogue')||$('#marketplace')||$('main');
 if(!host)return;
 const section=document.createElement('section');
 section.id='groupOrderMarketplace';section.className='shipping-moq-section';
 section.innerHTML='<div class="shipping-moq-head"><div><span>GROUP / GLOBAL ORDERS</span><h2>Join a Group Order</h2><p>Combine quantities with other customers to reach the seller\'s MOQ. Payments remain held until the MOQ and LEOGO settlement conditions are met.</p></div><button id="refreshGroupMarketplace" type="button">↻ Refresh</button></div><div id="groupOrderMarketStatus" class="shipping-moq-status">Loading campaigns…</div><div id="groupOrderMarketGrid" class="shipping-moq-grid"></div>';
 host.insertAdjacentElement('afterend',section);
 const orders=$('[data-customer-panel="orders"]');
 if(orders&&!$('#customerGroupOrders')){
  const box=document.createElement('section');box.id='customerGroupOrders';box.className='shipping-moq-dashboard';
  box.innerHTML='<div class="shipping-moq-head compact"><div><span>GROUP ORDER / MOQ</span><h3>My Group Orders</h3><p>Separate from ordinary immediately-dispatchable orders.</p></div><button id="refreshCustomerGroups" type="button">↻ Refresh</button></div><div id="customerGroupOrderList"><div class="shipping-moq-status">Sign in to view your participation.</div></div>';
  orders.appendChild(box);
 }
 const modal=document.createElement('div');modal.id='groupJoinModal';modal.className='shipping-moq-modal';modal.hidden=true;
 modal.innerHTML='<button class="shipping-moq-backdrop" type="button" data-close-group></button><form id="groupJoinForm" class="shipping-moq-dialog"><header><div><span>JOIN GROUP ORDER</span><h2 id="groupJoinTitle">Group Order</h2><p id="groupJoinSummary"></p></div><button type="button" data-close-group>×</button></header><input id="groupJoinCampaignId" type="hidden"><label>Quantity<input id="groupJoinQuantity" type="number" min="1" step="1" value="1" required></label><label>Payment method<select id="groupJoinPaymentMethod" required><option value="till">M-Pesa Till</option><option value="paybill">M-Pesa Paybill</option><option value="bank">Bank</option></select></label><label>Payment reference<input id="groupJoinPaymentReference" maxlength="100" required placeholder="Paste payment reference"></label><div id="groupJoinTotal" class="shipping-moq-total"></div><p class="shipping-moq-note">Admin verifies payment. Seller settlement stays held until MOQ is reached, the campaign is confirmed, and delivery conditions are satisfied.</p><div id="groupJoinStatus" class="shipping-moq-status"></div><footer><button type="button" data-close-group>Cancel</button><button type="submit">Join Group Order</button></footer></form>';
 document.body.appendChild(modal);
}
function renderMarket(){
 const rows=catalogue.filter(p=>p.fulfilment_type==='group_order'&&p.group_campaign);
 const grid=$('#groupOrderMarketGrid');if(!grid)return;
 if(!rows.length){grid.innerHTML='<div class="shipping-moq-empty">No active Group / Global Orders are available now.</div>';return;}
 grid.innerHTML=rows.map(p=>{const c=p.group_campaign,s=classify(p),pct=Math.min(100,Number(c.quantity_committed||0)/Number(c.minimum_quantity||1)*100),remain=Math.max(0,Number(c.minimum_quantity)-Number(c.quantity_committed||0));
 return '<article class="shipping-moq-card"><div class="shipping-moq-badges"><b>GROUP ORDER</b><span>'+esc(s.icon+' '+s.label)+'</span></div><h3>'+esc(p.product_name)+'</h3><strong>'+money(c.customer_unit_price_kes)+'</strong><small>Ships from '+esc(s.route||'Seller origin')+'</small><small>Estimated delivery: '+esc(s.estimate||'Seller estimate shown at checkout')+'</small><div class="shipping-moq-progress"><span style="width:'+pct+'%"></span></div><div class="shipping-moq-stats"><b>'+Number(c.quantity_committed||0)+'/'+Number(c.minimum_quantity||0)+' joined</b><span>'+remain+' remaining</span><span>'+Math.round(pct)+'%</span></div><small>Closes: '+fmtDate(c.closing_at)+'</small><button type="button" data-join-group="'+esc(c.id)+'">Join Group Order</button></article>';}).join('');
}
function renderCustomer(){
 const host=$('#customerGroupOrderList');if(!host)return;
 if(!groups.length){host.innerHTML='<div class="shipping-moq-empty">No Group Order participation yet.</div>';return;}
 host.innerHTML=groups.map(x=>{const c=x.campaign||x,qty=x.quantity??x.participation_quantity??0,amount=x.amount_kes??x.participation_amount_kes??0,pct=Math.min(100,Number(c.quantity_committed||0)/Number(c.minimum_quantity||1)*100);
 return '<article class="shipping-moq-row"><header><div><b>GROUP ORDER / MOQ</b><h4>'+esc(x.product_name||c.product_name||'Group Order')+'</h4><small>'+esc(c.campaign_reference||x.campaign_reference||'')+'</small></div><span>'+esc(String(c.status||x.status||'').replaceAll('_',' '))+'</span></header><div class="shipping-moq-row-grid"><div><small>Your quantity</small><strong>'+qty+'</strong></div><div><small>Your amount</small><strong>'+money(amount)+'</strong></div><div><small>Campaign progress</small><strong>'+Number(c.quantity_committed||0)+'/'+Number(c.minimum_quantity||0)+' ('+Math.round(pct)+'%)</strong></div><div><small>Closing date</small><strong>'+fmtDate(c.closing_at)+'</strong></div><div><small>Expected delivery</small><strong>'+fmtDate(c.expected_delivery_from)+' – '+fmtDate(c.expected_delivery_to||c.expected_delivery_from)+'</strong></div><div><small>Refund state</small><strong>'+esc(x.refund_status||c.refund_status||'not required')+'</strong></div></div></article>';}).join('');
}
async function loadMarket(){const st=$('#groupOrderMarketStatus');if(st)st.textContent='Loading campaigns…';const {data,error}=await client.rpc('customer_marketplace_catalogue');if(error){if(st)st.textContent=error.message;return;}catalogue=Array.isArray(data)?data:[];if(st)st.textContent='';renderMarket();}
async function loadCustomer(){const {data:{user}}=await client.auth.getUser();if(!user){groups=[];renderCustomer();return;}const {data,error}=await client.rpc('customer_list_group_orders');groups=error?[]:(Array.isArray(data)?data:[]);renderCustomer();}
function openJoin(id){const p=catalogue.find(x=>x.group_campaign?.id===id);if(!p)return;const c=p.group_campaign;$('#groupJoinCampaignId').value=id;$('#groupJoinTitle').textContent=p.product_name;$('#groupJoinSummary').textContent='MOQ '+c.minimum_quantity+' · '+c.quantity_committed+' joined · closes '+fmtDate(c.closing_at);$('#groupJoinQuantity').max=c.maximum_quantity?Math.max(0,Number(c.maximum_quantity)-Number(c.quantity_committed||0)):'';$('#groupJoinModal').hidden=false;updateTotal();}
function updateTotal(){const id=$('#groupJoinCampaignId')?.value,p=catalogue.find(x=>x.group_campaign?.id===id),q=Number($('#groupJoinQuantity')?.value||0);$('#groupJoinTotal').textContent=p?'Total: '+money(q*Number(p.group_campaign.customer_unit_price_kes||0)):'';}
async function submitJoin(e){e.preventDefault();const st=$('#groupJoinStatus');st.textContent='Submitting securely…';const {data:{user}}=await client.auth.getUser();if(!user){st.textContent='Please sign in before joining.';return;}const {error}=await client.rpc('customer_join_group_order',{p_campaign_id:$('#groupJoinCampaignId').value,p_quantity:Number($('#groupJoinQuantity').value),p_payment_method:$('#groupJoinPaymentMethod').value,p_payment_reference:$('#groupJoinPaymentReference').value.trim()});if(error){st.textContent=error.message;return;}st.textContent='Joined successfully. Payment is waiting for Admin verification.';await Promise.all([loadMarket(),loadCustomer()]);setTimeout(()=>{$('#groupJoinModal').hidden=true;},900);}
const init=()=>{loadStyle();ensureUI();loadMarket();loadCustomer();$('#refreshGroupMarketplace')?.addEventListener('click',loadMarket);$('#refreshCustomerGroups')?.addEventListener('click',loadCustomer);$('#groupJoinQuantity')?.addEventListener('input',updateTotal);$('#groupJoinForm')?.addEventListener('submit',submitJoin);document.addEventListener('click',e=>{const join=e.target.closest('[data-join-group]');if(join)openJoin(join.dataset.joinGroup);if(e.target.closest('[data-close-group]'))$('#groupJoinModal').hidden=true;});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
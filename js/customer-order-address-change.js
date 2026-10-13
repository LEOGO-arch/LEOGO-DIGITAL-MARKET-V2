(() => {
'use strict';
const panel=document.querySelector('[data-customer-panel="orders"]');
if(!panel)return;
const card=document.createElement('section');
card.className='customer-aftersales-history';
card.style.cssText='padding:16px;margin:16px 0;border:1px solid #dce5ee;border-radius:14px;background:#fff';
card.innerHTML='<h3>Change an Order Delivery Address</h3><p>Requests are allowed before delivery, even when packed or on the way. LEOGO must approve and coordinate with the rider. Changes to county or delivery zone require Customer Care assistance.</p>'+
'<form id="orderAddressChangeForm" style="display:grid;gap:10px">'+
'<label>Order<select name="order" required><option value="">Loading your orders…</option></select></label>'+
'<p id="orderAddressCurrent" role="status"></p>'+
'<label>New estate / delivery area<input name="estate" required minlength="3" maxlength="180"></label>'+
'<label>Nearest landmark<input name="landmark" required minlength="3" maxlength="180"></label>'+
'<label>Pin / location link (optional)<input name="location" maxlength="500"></label>'+
'<label>Reason for change (optional)<textarea name="note" maxlength="1000"></textarea></label>'+
'<button type="submit">Request Address Change</button><p id="orderAddressFeedback" role="status"></p>'+
'</form>';
panel.querySelector('.customer-view-title')?.after(card);
const form=card.querySelector('form'),select=form.elements.order,status=card.querySelector('#orderAddressFeedback');
let orders=[];
const api=()=>window.leogoAuth?.client;
const eligible=o=>!o.delivered_at&&!['delivered','cancelled','refunded'].includes(o.order_status);
async function load(){
 const db=api();if(!db||!window.leogoAuth?.isAuthenticated?.())return;
 const [out,requests]=await Promise.all([db.rpc('customer_list_marketplace_orders_v3'),db.rpc('customer_list_marketplace_address_change_requests')]);
 if(out.error){status.textContent='Could not load orders: '+out.error.message;return;}
 orders=(Array.isArray(out.data)?out.data:[]).filter(eligible);
 const pending=new Set((requests.data||[]).filter(x=>x.status==='pending').map(x=>x.order_id));
 select.replaceChildren(new Option('Select an undelivered order',''));
 for(const o of orders){
  const option=new Option(o.order_reference+' — '+String(o.delivery_status||o.order_status||'Active').replaceAll('_',' ')+(pending.has(o.id)?' (change pending)':''),o.id);
  option.disabled=pending.has(o.id);select.add(option);
 }
 if(!orders.length)status.textContent='No undelivered orders available for an address change.';
}
select.addEventListener('change',()=>{
 const order=orders.find(o=>o.id===select.value);const current=card.querySelector('#orderAddressCurrent');
 current.textContent=order?'Current: '+[order.county,order.sub_county,order.estate,order.landmark].filter(Boolean).join(' · '):'';
 if(order){form.elements.estate.value=order.estate||'';form.elements.landmark.value=order.landmark||'';}
});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 const response=await api().rpc('customer_request_marketplace_order_address_change',{
  p_order_id:select.value,p_estate:form.elements.estate.value.trim(),
  p_landmark:form.elements.landmark.value.trim(),
  p_location_link:form.elements.location.value.trim()||null,p_note:form.elements.note.value.trim()||null
 });
 status.textContent=response.error?.message||'Address change requested. LEOGO Admin must approve and notify the rider before redirection.';
 button.disabled=false;if(!response.error)await load();
});
document.addEventListener('leogo:authchange',load);load();
})();
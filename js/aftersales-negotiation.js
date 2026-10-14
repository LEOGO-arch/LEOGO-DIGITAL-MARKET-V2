(() => {
'use strict';
const panel=document.querySelector('[data-customer-panel="aftersales"]');
if(!panel||panel.dataset.aftersalesNegotiationInitialized==='true')return;
panel.dataset.aftersalesNegotiationInitialized='true';
const section=document.createElement('section');section.className='aftersales-layout';section.innerHTML='<div class="afs-customer-heading"><div><span class="afs-eyebrow">AFTERSALES CENTRE</span><h3>Seller Responses & Case Actions</h3><p>Track your return, review seller solutions and follow every update in one place.</p></div><button id="customerAftersalesRefresh" type="button">↻ Refresh Cases</button></div><div id="customerAftersalesNegotiations" class="afs-customer-cases"></div>';panel.append(section);
const el=section.querySelector('#customerAftersalesNegotiations');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const styles=document.createElement('style');styles.textContent=`
.aftersales-layout{max-width:100%;margin:12px 0;color:#10213b}
.afs-customer-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.afs-customer-heading h3{font-size:clamp(19px,3vw,25px);margin:4px 0}
.afs-customer-heading p{margin:4px 0;color:#64748b;font-size:13px}
.afs-eyebrow{font-size:10px;font-weight:800;letter-spacing:.13em;color:#ef7900}
.afs-customer-heading button,.afs-customer-case button{border-radius:10px;min-height:38px}
.afs-customer-cases{display:grid;gap:16px}
.afs-customer-case{background:#fff;border:1px solid #dbe4ef;border-radius:17px;padding:clamp(12px,3vw,20px);min-width:0;box-shadow:0 6px 20px rgba(15,23,42,.04);overflow-wrap:anywhere}
.afs-case-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.afs-case-top h4{font-size:clamp(15px,3vw,20px);margin:3px 0}
.afs-status{display:inline-block;border-radius:999px;background:#fff4e6;color:#985000;padding:6px 10px;font-size:11px;font-weight:800;text-transform:capitalize}
.afs-case-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}
.afs-fact{border:1px solid #e1e8f0;border-radius:11px;padding:10px;background:#f8fafc;min-width:0;overflow-wrap:anywhere}
.afs-fact-label{font-size:10px;letter-spacing:.04em;font-weight:750;color:#63728a;text-transform:uppercase;margin-bottom:5px}
.afs-fact-value{font-size:13px;line-height:1.4;font-weight:650;color:#12243e;white-space:pre-wrap}
.afs-wide{grid-column:1/-1}
.afs-section{margin-top:13px;padding:13px;border:1px solid #dbe4ef;border-radius:12px}
.afs-section h5{margin:0 0 10px;font-size:14px}
.afs-case-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.afs-case-actions button{flex:1;min-width:min(100%,145px)}
.afs-customer-case form{display:grid;gap:10px;margin:14px 0 0}
.afs-customer-case label{display:grid;gap:5px;font-size:12px;font-weight:650}
.afs-customer-case textarea,.afs-customer-case select{max-width:100%;width:100%;box-sizing:border-box}
.afs-activity{margin-top:12px;border:1px solid #e1e8f0;border-radius:12px;padding:10px}
.afs-activity summary{font-weight:700;cursor:pointer}
.afs-activity-entry{display:flex;gap:10px;border-left:2px solid #f18a24;padding:5px 0 10px 12px;margin:7px 0}
.afs-activity-entry small{display:block;color:#66758c;font-size:11px}
.afs-activity-entry strong{font-size:12px;text-transform:capitalize}
@media(min-width:900px){.afs-case-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;document.head.append(styles);
const fact=(title,value,wide=false)=>'<div class="afs-fact'+(wide?' afs-wide':'')+'"><div class="afs-fact-label">'+esc(title)+'</div><div class="afs-fact-value">'+esc(value??'Not available')+'</div></div>';

async function load(){
const db=window.leogoAuth?.client;
if(!db||!window.leogoAuth?.isAuthenticated?.()){el.textContent='Sign in to view your Aftersales responses.';return;}
const {data,error}=await db.rpc('aftersales_list_negotiations');
const {data:shippingRows,error:shippingError}=await db.rpc('aftersales_customer_return_shipping_status');
const shippingByCase=new Map((Array.isArray(shippingRows)?shippingRows:[]).map(row=>[row.case_id,row]));
const [preferenceResult,exchangeResult]=await Promise.all([
 db.rpc('customer_get_aftersales_exchange_delivery_preferences'),
 db.rpc('aftersales_exchange_list',{p_role:'customer'})
]);
const preferenceByCase=new Map((Array.isArray(preferenceResult.data)?preferenceResult.data:[]).map(x=>[x.case_id,x]));
const exchangeByCase=new Map((Array.isArray(exchangeResult.data)?exchangeResult.data:[]).map(x=>[x.case_id,x]));

if(shippingError && !String(shippingError.message).includes('function'))console.warn('Return shipping status:',shippingError.message);
if(error){el.textContent=error.message;return;}
// Reuse the existing My Cases History cards as the single location for event activity.
window.leogoAftersalesActivityByCase=new Map((data||[]).filter(n=>n.case_reference).map(n=>[n.case_reference,Array.isArray(n.history)?n.history:[]]));
document.dispatchEvent(new Event('leogo:customer-aftersales-activity-loaded'));
el.replaceChildren();
for(const n of data||[]){
const card=document.createElement('article');card.className='aftersales-case-card afs-customer-case';
card.innerHTML='<header class="afs-case-top"><div><span class="afs-eyebrow">AFTERSALES CASE</span><h4>'+esc(n.case_reference)+'</h4></div><span class="afs-status">'+esc(String(n.stage||'Open').replaceAll('_',' '))+'</span></header>'+
'<div class="afs-case-grid">'+fact('Original order',n.order_reference||n.order_id)+fact('Item',n.product_name||'Item identification pending')+
fact('Requested solution',n.preferred_solution||'Pending')+fact('Seller response deadline',n.response_due_at?new Date(n.response_due_at).toLocaleString('en-KE'):'Not set')+'</div>'+
'<section class="afs-section"><h5>Seller response</h5><div class="afs-case-grid">'+fact('Proposed solution',n.seller_solution||'Awaiting seller',true)+fact('Seller comment',n.seller_comment||'No comment yet',true)+'</div></section>'+
'<form class="afs-section"><label>Your feedback <textarea name="comment" maxlength="2000" placeholder="Write a message about the proposed solution"></textarea></label><div class="afs-case-actions"></div><p role="status" aria-live="polite"></p></form>';
el.append(card);
const activeExchange=exchangeByCase.get(n.case_id);
if(n.stage==='customer_accepted'&&(!activeExchange||activeExchange.status==='awaiting_pack')){
 const chooser=document.createElement('form');chooser.style.cssText='display:grid;gap:8px;padding:12px;border:1px solid #f3bf7d;border-radius:12px;margin:12px 0';
 const title=document.createElement('strong');title.textContent='Set replacement delivery BEFORE seller packs the item';
 const method=document.createElement('select');method.required=true;
 [['','Select delivery method'],['pickup_station','Collect from Pickup Station'],['door','Deliver to my door (delivery fee payable)']].forEach(([v,label])=>method.add(new Option(label,v)));
 const station=document.createElement('select');station.add(new Option('Select Pickup Station',''));
 const address=document.createElement('textarea');address.placeholder='Full address, estate and landmark (required for door delivery)';address.minLength=10;
 const feedback=document.createElement('p');feedback.setAttribute('role','status');
 const button=document.createElement('button');button.type='submit';button.textContent='Save Replacement Delivery Destination';
 const pref=preferenceByCase.get(n.case_id);
 if(pref){method.value=pref.delivery_method;address.value=pref.door_address||'';}
 const updateFields=()=>{station.hidden=method.value!=='pickup_station';address.hidden=method.value!=='door';};
 method.addEventListener('change',updateFields);
 const stations=await db.rpc('customer_list_aftersales_return_stations');
 if(!stations.error&&Array.isArray(stations.data))for(const st of stations.data)station.add(new Option(st.station_name+' — '+(st.town||''),st.id));
 if(pref?.station_id)station.value=pref.station_id;
 updateFields();
 chooser.append(title,method,station,address,button,feedback);
 chooser.addEventListener('submit',async e=>{
  e.preventDefault();if(!method.value)return;
  if(method.value==='pickup_station'&&!station.value){feedback.textContent='Select a registered Pickup Station';return;}
  if(method.value==='door'&&address.value.trim().length<10){feedback.textContent='Enter the full delivery address and landmark';return;}
  button.disabled=true;
  const response=await db.rpc('customer_set_aftersales_exchange_delivery_preference',{
   p_case_id:n.case_id,p_method:method.value,p_station_id:method.value==='pickup_station'?station.value:null,
   p_door_address:method.value==='door'?address.value.trim():null
  });
  feedback.textContent=response.error?.message||'Saved. This destination will lock as soon as the seller marks the replacement ready.';
  button.disabled=false;
 });
 card.append(chooser);
}
const events=Array.isArray(n.history)?n.history:[];
if(n.return_tracking){
 const r=n.return_tracking;
 const parcel=document.createElement('section');parcel.className='afs-section';
 parcel.innerHTML='<h5>Return parcel tracking</h5><div class="afs-case-grid">'+
 fact('Return reference',r.return_reference||'Not booked')+
 fact('Parcel status',String(r.status||'Awaiting update').replaceAll('_',' '))+
 fact('Booked',r.booked_at?new Date(r.booked_at).toLocaleString('en-KE'):'Not recorded')+
 fact('Dispatched',r.dispatched_at?new Date(r.dispatched_at).toLocaleString('en-KE'):'Not yet')+
 fact('Last update',r.updated_at?new Date(r.updated_at).toLocaleString('en-KE'):'Not recorded')+'</div>';
 card.append(parcel);
}

const form=card.querySelector('form'), actions=form.querySelector('.afs-case-actions');const options=n.stage==='seller_proposed'?[['accept','Accept solution'],['reject','Reject solution']]:['seller_rejected','customer_rejected'].includes(n.stage)?[['intervene','Request LEOGO intervention']]:[];
for(const [action,label] of options){const btn=document.createElement('button');btn.type='button';btn.textContent=label;actions.append(btn);btn.onclick=async()=>{const {error}=await db.rpc('aftersales_customer_respond',{p_case_id:n.case_id,p_action:action,p_comment:form.elements.comment.value});if(error){form.querySelector('[role=status]').textContent=error.message;return;}await load();};}
if(n.stage==='customer_accepted' && ['return_refund','return_exchange'].includes(n.solution_kind)){
 const box=document.createElement('div');
 box.innerHTML='<label>Return Pickup Station <select><option value="">Loading stations…</option></select></label><button type="button">Save Return Station</button><p role="status"></p>';
 card.append(box);
 const dropdown=box.querySelector('select');
 const response=await db.rpc('customer_list_aftersales_return_stations');
 if(response.error){box.querySelector('[role=status]').textContent=response.error.message;}
 else{
  dropdown.innerHTML='<option value="">Select active Pickup Station</option>'+(response.data||[]).map(station=>
   '<option value="'+esc(station.id)+'">'+esc(station.station_name)+' — '+esc([station.town,station.county].filter(Boolean).join(', '))+'</option>').join('');
  if(n.return_pickup_station_id)dropdown.value=n.return_pickup_station_id;
 }
 box.querySelector('button').onclick=async()=>{
  if(!dropdown.value)return;
  const {error}=await db.rpc('customer_choose_aftersales_return_station',{p_case_id:n.case_id,p_station_id:dropdown.value});
  box.querySelector('[role=status]').textContent=error?error.message:'Return Pickup Station saved. Await LEOGO return instructions.';
  if(!error){ const booking=await db.rpc('customer_book_aftersales_return',{p_case_id:n.case_id}); box.querySelector('[role=status]').textContent=booking.error?booking.error.message:'Return booked: '+booking.data.return_reference+'. Take the parcel to your selected Pickup Station.'; if(!booking.error)await load(); }
 };
}

const shipping=shippingByCase.get(n.case_id);
if(shipping){
 const wrap=document.createElement('section');wrap.className='panel';wrap.style.cssText='margin-top:14px;padding:14px;border:1px solid #d5dfeb;border-radius:12px';
 const title=document.createElement('h5');title.textContent='Rejected Item — Return Shipping';
 const message=document.createElement('p');message.textContent='Return fee: KSh '+Number(shipping.amount_kes||0).toLocaleString('en-KE')+
  ' · Status: '+String(shipping.status||'').replaceAll('_',' ')+
  (shipping.due_at?' · Pay by '+new Date(shipping.due_at).toLocaleString('en-KE'):'');
 wrap.append(title,message);
 if(['awaiting_payment','payment_rejected'].includes(shipping.status)){
  const destination=document.createElement('div');destination.className='aftersales-return-payment-destination';
  destination.style.cssText='background:#f4f7fc;border:1px solid #dbe4ef;border-radius:10px;padding:12px;margin:10px 0';
  destination.textContent='Loading LEOGO Admin-assigned transport payment account…';wrap.append(destination);
  try{
   const result=await window.leogoPayments?.getDestination('transport_payments',{force:true});
   const d=result?.data;
   if(!d||result?.error){destination.textContent='LEOGO return-shipping payment account is not available. Contact Customer Care before paying.';}
   else{
    const fields=d.account_type==='mpesa_paybill'
      ? [['Business Number',d.paybill_number],['Account Number',d.account_number]]
      : d.account_type==='bank'
       ? [['Bank Name',d.bank_name],['Account Name',d.account_name],['Account Number',d.account_number]]
       : [['Till Number',d.till_number],['Account Name',d.account_name||d.business_name]];
    destination.replaceChildren();
    const heading=document.createElement('strong');heading.textContent='LEOGO Return Shipping Payment Details';destination.append(heading);
    fields.forEach(([label,value])=>{const p=document.createElement('p');p.textContent=label+': '+(value||'Not configured');destination.append(p);});
    const number=d.till_number||d.paybill_number||d.account_number;
    if(number){const copy=document.createElement('button');copy.type='button';copy.textContent='Copy Payment Number';copy.onclick=()=>navigator.clipboard?.writeText(number);destination.append(copy);}
   }
  }catch(_err){destination.textContent='Payment instructions unavailable. Contact LEOGO Customer Care before paying.';}
 }

 if(shipping.verification_notes){const notes=document.createElement('p');notes.textContent='LEOGO instructions: '+shipping.verification_notes;wrap.append(notes);}
 if(['awaiting_payment','payment_rejected'].includes(shipping.status)){
  const form=document.createElement('form');
  form.innerHTML='<label>Payment confirmation/reference<textarea name="reference" rows="2" required minlength="5" maxlength="500" placeholder="Paste your verified payment reference"></textarea></label><button type="submit">Submit Return Shipping Payment Reference</button><p role="status" aria-live="polite"></p>';
  const note=document.createElement('small');note.textContent='Only pay to a verified LEOGO payment destination. Your payment will be checked by LEOGO Admin.';form.prepend(note);
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;
   const {error}=await db.rpc('customer_aftersales_submit_return_shipping_payment',{p_case_id:n.case_id,p_reference:form.elements.reference.value.trim()});
   if(error){form.querySelector('[role=status]').textContent=error.message;button.disabled=false;return;}await load();};
  wrap.append(form);
 }
 if(shipping.status==='dispatched'){
  const shipment=document.createElement('p');shipment.textContent='Parcel tracking: '+(shipping.dispatch_reference||'Pending update');wrap.append(shipment);
  const received=document.createElement('button');received.type='button';received.textContent='Confirm I Received My Returned Item';
  received.onclick=async()=>{if(!window.confirm('Confirm only after physically receiving your returned item.'))return;
   received.disabled=true;const {error}=await db.rpc('customer_aftersales_confirm_rejected_item_received',{p_case_id:n.case_id});
   if(error){received.disabled=false;received.textContent=error.message;return;}await load();};wrap.append(received);
 }
 card.append(wrap);
}

}
if(!data?.length)el.textContent='No cases have been forwarded to a seller yet.';
}
const exchangePanel=document.createElement('section');
exchangePanel.className='afs-customer-cases';exchangePanel.innerHTML='<h3>Exchange / Replacement Delivery Tracking</h3><div id="customerExchangeShipments">Loading replacement delivery updates…</div>';
section.append(exchangePanel);
let exchangeRenderVersion=0;
async function loadCustomerExchange(){
 const renderVersion=++exchangeRenderVersion;
 const host=exchangePanel.querySelector('#customerExchangeShipments'),db=window.leogoAuth?.client;
 if(!db||!window.leogoAuth?.isAuthenticated?.()){host.textContent='Sign in to track your exchange.';return;}
 const {data,error}=await db.rpc('aftersales_exchange_list',{p_role:'customer'});
 if(renderVersion!==exchangeRenderVersion)return;
 if(error){host.textContent=error.message;return;}
 host.replaceChildren();
 const seenExchangeIds=new Set();
 const list=(Array.isArray(data)?data:[]).filter(x=>{const key=x.id||x.reference;if(!key||seenExchangeIds.has(key))return false;seenExchangeIds.add(key);return true;});
 if(!list.length){host.textContent='No outbound exchange shipments yet.';return;}
 for(const item of list){
  const card=document.createElement('article');card.className='afs-fact';card.style.cssText='padding:12px;border:1px solid #dce5ee;border-radius:12px;margin:10px 0';
  const title=document.createElement('strong');title.textContent=item.reference+' — '+item.item_name;
  const line=document.createElement('p');line.textContent='Aftersales '+item.case_reference+' · '+item.status.replaceAll('_',' ');
  const route=document.createElement('p');route.textContent='Delivery: '+(item.pickup_station_id?'Pickup Station collection':'Direct delivery')+' · Delivery cost payer: '+(item.payer||'Admin reviewing responsibility');
  const safe=document.createElement('p');safe.textContent='This replacement does not create a new product sale or extra Pickup Station commission.';
  card.append(title,line,route,safe);
  {
   const deliveryLocked=item.status!=='awaiting_pack'||!!item.packed_at||!!item.rider_id;
   const chooser=document.createElement('form');chooser.style.cssText='display:grid;gap:8px;margin:12px 0;padding:10px;border:1px solid #dce5ee;border-radius:10px';
   const label=document.createElement('label');label.textContent='Receive your replacement';
   const method=document.createElement('select');method.required=true;
   const choices=[['','Select delivery method'],['pickup_station','Collect from Pickup Station'],['door','Deliver to my door (delivery fee payable)']];
   for(const [value,name] of choices)method.add(new Option(name,value));
   method.value=item.customer_delivery_choice||'';
   const button=document.createElement('button');button.type='submit';button.textContent='Confirm Delivery Method';
   const feedback=document.createElement('p');feedback.setAttribute('role','status');
   chooser.append(label,method,button,feedback);
   if(deliveryLocked){
    method.disabled=true;button.disabled=true;
    feedback.textContent='Delivery address and method locked: replacement is ready for delivery or has already started delivery. Contact LEOGO support for an exceptional delivery problem.';
    feedback.style.cssText='color:#945d16;font-weight:650;font-size:13px';
   }
   chooser.onsubmit=async e=>{
    e.preventDefault();if(deliveryLocked||!method.value)return;
    if(method.value==='door'&&!confirm('Door delivery requires a delivery fee and LEOGO payment verification before rider assignment. Continue?'))return;
    button.disabled=true;
    const updated=await db.rpc('customer_aftersales_exchange_choose_delivery',{p_shipment_id:item.id,p_method:method.value});
    if(updated.error){feedback.textContent=updated.error.message;button.disabled=false;return;}
    await loadCustomerExchange();
   };
   card.append(chooser);
  }
  if(item.payer==='customer'&&Number(item.delivery_cost_kes||0)>0){
   const cost=document.createElement('p');cost.textContent='Delivery charge: KSh '+Number(item.delivery_cost_kes).toLocaleString('en-KE')+' · '+(item.payment_verified?'Verified':'Awaiting verification');
   card.append(cost);
   if(!item.payment_verified&&item.status==='packed_ready'){
    const form=document.createElement('form');form.style.cssText='display:grid;gap:8px';
    const reference=document.createElement('input');reference.required=true;reference.minLength=5;reference.maxLength=100;
    reference.value=item.delivery_payment_reference||'';reference.placeholder='Paste M-Pesa/bank payment reference';
    const button=document.createElement('button');button.type='submit';button.textContent='Submit Shipping Payment Reference';
    const feedback=document.createElement('p');feedback.setAttribute('role','status');
    form.append(reference,button,feedback);
    form.onsubmit=async e=>{
     e.preventDefault();button.disabled=true;
     const submitted=await db.rpc('customer_aftersales_exchange_submit_delivery_payment',{p_shipment_id:item.id,p_reference:reference.value.trim()});
     feedback.textContent=submitted.error?.message||'Reference sent for LEOGO verification before replacement dispatch.';
     button.disabled=false;
    };card.append(form);
   }
  }
  if(item.status==='delivered'){
   const done=document.createElement('p');done.textContent='Replacement delivered. Delivery history and handover proof are retained by LEOGO.';card.append(done);
  }
  const history=await db.rpc('aftersales_exchange_history',{p_shipment_id:item.id});
  if(!history.error&&Array.isArray(history.data)){
   const details=document.createElement('details');const heading=document.createElement('summary');heading.textContent='Exchange delivery history ('+history.data.length+')';details.append(heading);
   for(const step of history.data){const line=document.createElement('p');line.textContent=new Date(step.at).toLocaleString('en-KE')+' · '+String(step.to).replaceAll('_',' ');details.append(line);}card.append(details);
  }
  if(renderVersion!==exchangeRenderVersion)return;
  host.append(card);
 }
}
section.querySelector('#customerAftersalesRefresh').onclick=()=>{load();loadCustomerExchange();};
document.addEventListener('leogo:authchange',()=>{load();loadCustomerExchange();});load();loadCustomerExchange();
})();
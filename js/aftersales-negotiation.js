(() => {
'use strict';
const panel=document.querySelector('[data-customer-panel="aftersales"]');
if(!panel)return;
const section=document.createElement('section');section.className='aftersales-layout';section.innerHTML='<h3>Seller responses & LEOGO intervention</h3><p>Review your seller’s response. Accept or reject a proposed solution, or request LEOGO intervention after a rejection.</p><button id="customerAftersalesRefresh" type="button">Refresh Seller Responses</button><div id="customerAftersalesNegotiations"></div>';panel.append(section);
const el=section.querySelector('#customerAftersalesNegotiations');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function load(){
const db=window.leogoAuth?.client;
if(!db||!window.leogoAuth?.isAuthenticated?.()){el.textContent='Sign in to view your Aftersales responses.';return;}
const {data,error}=await db.rpc('aftersales_list_negotiations');
const {data:shippingRows,error:shippingError}=await db.rpc('aftersales_customer_return_shipping_status');
const shippingByCase=new Map((Array.isArray(shippingRows)?shippingRows:[]).map(row=>[row.case_id,row]));
if(shippingError && !String(shippingError.message).includes('function'))console.warn('Return shipping status:',shippingError.message);
if(error){el.textContent=error.message;return;}
el.replaceChildren();
for(const n of data||[]){
const card=document.createElement('article');card.className='aftersales-case-card';card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Seller status: '+esc(n.stage.replaceAll('_',' '))+'</p><p>Proposed solution: '+esc(n.seller_solution||'Awaiting seller')+'</p><p>Seller comment: '+esc(n.seller_comment||'—')+'</p>'+(n.response_due_at?'<p>Respond by: '+esc(new Date(n.response_due_at).toLocaleString('en-KE'))+'</p>':'')+'<form><label>Your feedback <textarea name="comment" maxlength="2000"></textarea></label><div></div><p role="status"></p></form>';el.append(card);
const events=Array.isArray(n.history)?n.history:[];
if(n.return_tracking){
 const parcel=document.createElement('p');parcel.textContent='Return parcel '+(n.return_tracking.return_reference||'')+
 ' · '+String(n.return_tracking.status||'Awaiting update').replaceAll('_',' ')+
 (n.return_tracking.updated_at?' · Last updated '+new Date(n.return_tracking.updated_at).toLocaleString('en-KE'):'');
 card.append(parcel);
}
if(events.length){
 const history=document.createElement('details');history.style.margin='12px 0';
 const summary=document.createElement('summary');summary.textContent='Full Aftersales Activity ('+events.length+' updates)';
 history.append(summary);
 events.forEach(event=>{const item=document.createElement('p');item.style.cssText='padding:8px 0;border-bottom:1px solid #e1e8f0';
 item.textContent=new Date(event.created_at).toLocaleString('en-KE')+' · '+
 String(event.actor_role||'LEOGO').replaceAll('_',' ')+' · '+String(event.event_type||'update').replaceAll('_',' ')+
 (event.comment?' — '+event.comment:'');history.append(item);});
 card.append(history);
}
const form=card.querySelector('form'), actions=form.querySelector('div');const options=n.stage==='seller_proposed'?[['accept','Accept solution'],['reject','Reject solution']]:['seller_rejected','customer_rejected'].includes(n.stage)?[['intervene','Request LEOGO intervention']]:[];
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
section.querySelector('#customerAftersalesRefresh').onclick=load;
document.addEventListener('leogo:authchange',load);load();
})();
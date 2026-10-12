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
const [{data,error},{data:returnInvoices,error:invoiceError}]=await Promise.all([
 db.rpc('aftersales_list_negotiations'),
 db.rpc('aftersales_customer_return_shipping_status')
]);
const invoices=new Map((Array.isArray(returnInvoices)?returnInvoices:[]).map(invoice=>[invoice.case_id,invoice]));
if(invoiceError)console.warn('Return shipping payments unavailable:',invoiceError.message);
if(error){el.textContent=error.message;return;}
el.replaceChildren();
for(const n of data||[]){
const card=document.createElement('article');card.className='aftersales-case-card';card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Seller status: '+esc(n.stage.replaceAll('_',' '))+'</p><p>Proposed solution: '+esc(n.seller_solution||'Awaiting seller')+'</p><p>Seller comment: '+esc(n.seller_comment||'—')+'</p>'+(n.response_due_at?'<p>Respond by: '+esc(new Date(n.response_due_at).toLocaleString('en-KE'))+'</p>':'')+'<form><label>Your feedback <textarea name="comment" maxlength="2000"></textarea></label><div></div><p role="status"></p></form>';el.append(card);
if(n.return_tracking){
 const tracking=document.createElement('details');tracking.open=true;
 const label=document.createElement('summary');label.textContent='Return parcel tracking';
 const info=document.createElement('p');info.textContent=
  'Reference: '+String(n.return_tracking.return_reference||'—')+
  ' · Status: '+String(n.return_tracking.status||'—').replaceAll('_',' ')+
  (n.return_tracking.dispatched_at?' · Dispatched: '+new Date(n.return_tracking.dispatched_at).toLocaleString('en-KE'):'');
 tracking.append(label,info);card.append(tracking);
}
if(n.inspection?.received_at){
 const inspection=document.createElement('section');
 inspection.className='aftersales-inspection-progress';
 const title=document.createElement('strong');title.textContent='Seller return inspection';
 const body=document.createElement('p');
 body.textContent=n.inspection.inspected_at
  ? 'Inspected: '+String(n.inspection.finding||'—').replaceAll('_',' ')+
    ' · Recommendation: '+String(n.inspection.recommendation||'—').replaceAll('_',' ')+
    ' · Reason: '+String(n.inspection.inspection_notes||'Awaiting details')
  : 'Returned product received by seller; waiting for inspection.';
 inspection.append(title,body);card.append(inspection);
}
const invoice=invoices.get(n.case_id);
if(invoice){
 const box=document.createElement('section');box.className='aftersales-return-shipping';
 box.style.cssText='padding:14px;margin:12px 0;border:1px solid #dce4ef;border-radius:12px';
 const heading=document.createElement('h5');heading.textContent='Return Shipping to Customer';
 const desc=document.createElement('p');desc.textContent=
  'Fee: KSh '+Number(invoice.amount_kes).toLocaleString('en-KE')+
  ' · Status: '+String(invoice.status||'').replaceAll('_',' ')+
  ' · Payment due: '+new Date(invoice.due_at).toLocaleString('en-KE');
 box.append(heading,desc);
 if(['awaiting_payment','payment_rejected'].includes(invoice.status)){
  const account=document.createElement('p');account.textContent='Loading LEOGO payment instructions…';box.append(account);
  if(window.leogoPayments){
   const {data:destination,error:paymentError}=await window.leogoPayments.getDestination('marketplace_orders');
   if(paymentError||!destination)account.textContent='Payment destination unavailable. Contact LEOGO Customer Care; do not send money to an unconfirmed account.';
   else{
    const type=destination.account_type;
    account.textContent=type==='mpesa_paybill'
      ? 'M-Pesa Paybill · Business Number: '+(destination.paybill_number||'Not configured')+
        ' · Account Number: '+(destination.account_number||'Not configured')
      : type==='mpesa_till'
        ? 'M-Pesa Till Number: '+(destination.till_number||'Not configured')
        : type==='bank'
          ? 'Bank: '+(destination.bank_name||'Not configured')+' · Account Name: '+(destination.account_name||'Not configured')+
            ' · Account Number: '+(destination.account_number||'Not configured')
          : 'Contact LEOGO for an approved payment destination.';
   }
  }else account.textContent='Payment instructions unavailable. Contact LEOGO Customer Care before paying.';
  const form=document.createElement('form');
  const label=document.createElement('label');label.textContent='Transaction reference';
  const input=document.createElement('input');input.name='reference';input.required=true;input.minLength=5;input.maxLength=250;
  input.placeholder='Enter M-Pesa or bank reference';label.append(input);
  const button=document.createElement('button');button.type='submit';button.textContent='Submit Return Shipping Payment Proof';
  const status=document.createElement('p');status.setAttribute('role','status');form.append(label,button,status);
  form.addEventListener('submit',async event=>{
   event.preventDefault();button.disabled=true;
   const {error:submitError}=await db.rpc('customer_aftersales_submit_return_shipping_payment',{
     p_case_id:n.case_id,p_reference:input.value.trim()
   });
   if(submitError){status.textContent=submitError.message;button.disabled=false;return;}
   await load();
  });
  if(new Date(invoice.due_at).getTime()<Date.now()){
   button.disabled=true;status.textContent='Payment period expired. Contact LEOGO Customer Care.';
  }
  box.append(form);
 }else if(invoice.status==='payment_submitted'){
  const note=document.createElement('p');note.textContent='Your transaction reference is awaiting LEOGO verification.';box.append(note);
 }else if(invoice.status==='verified'){
  const note=document.createElement('p');note.textContent='Payment verified. LEOGO will arrange return delivery and provide tracking.';box.append(note);
 }else if(invoice.status==='dispatched'){
  const note=document.createElement('p');note.textContent='Your parcel is returning to you. Tracking: '+(invoice.dispatch_reference||'Pending');
  const button=document.createElement('button');button.type='button';button.textContent='Confirm I Received My Item';
  const status=document.createElement('p');status.setAttribute('role','status');
  button.addEventListener('click',async()=>{
   button.disabled=true;
   const {error:confirmError}=await db.rpc('customer_aftersales_confirm_rejected_item_received',{p_case_id:n.case_id});
   if(confirmError){status.textContent=confirmError.message;button.disabled=false;return;}await load();
  });
  box.append(note,button,status);
 }else if(invoice.status==='received_by_customer'){
  const note=document.createElement('p');note.textContent='Returned item receipt confirmed. LEOGO Admin can now close the case.';box.append(note);
 }else if(invoice.status==='expired'){
  const note=document.createElement('p');note.textContent='Seven-day return shipping payment window expired. Contact LEOGO Customer Care.';box.append(note);
 }
 card.append(box);
}
const form=card.querySelector('form'), actions=form.querySelector('div');const expired=n.stage==='seller_proposed'&&(!n.response_due_at||Date.now()>new Date(n.response_due_at).getTime());
const options=expired?[]:
 n.stage==='seller_proposed'?[['accept','Accept solution'],['reject','Reject solution'],['intervene','Ask LEOGO to Intervene']]:
 ['seller_rejected','customer_rejected'].includes(n.stage)?[['intervene','Request LEOGO intervention']]:[];
if(expired){const notice=document.createElement('p');notice.textContent='Your three-day seller-response period has expired. Contact LEOGO Customer Care to request assistance.';card.append(notice);}
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

}
if(!data?.length)el.textContent='No cases have been forwarded to a seller yet.';
}
section.querySelector('#customerAftersalesRefresh').onclick=load;
document.addEventListener('leogo:authchange',load);load();
})();
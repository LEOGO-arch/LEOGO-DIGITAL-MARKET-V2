(() => {
'use strict';
const db=window.leogoAdminDb;
const panel=document.querySelector('[data-admin-panel="aftersales"]');
const detail=document.getElementById('adminAftersalesDetail');
if(!db||!panel||!detail)return;
const root=document.createElement('section');
root.className='content-card aftersales-negotiation-card';
root.id='aftersalesNegotiationPanel';
root.hidden=true;
root.innerHTML=`
  <div class="aftersales-negotiation-heading"><div><span>SELLER RESOLUTION</span><h3>Forward to Seller</h3><p>Assign this complaint to a seller from the selected order.</p></div><button type="button" id="aftersalesNegotiationRefresh">↻ Refresh Status</button></div>
  <div class="aftersales-negotiation-reference"><span>Case <strong id="negotiationCaseReference">—</strong></span><span>Order <strong id="negotiationOrderReference">—</strong></span><span id="negotiationStage" class="aftersales-negotiation-stage">Not forwarded</span></div>
  <form id="aftersalesForwardForm" class="aftersales-negotiation-form">
    <label>Responsible seller<select name="seller" required><option value="">Loading sellers…</option></select></label>
    <label class="wide">Note to Seller <small>(optional)</small><textarea name="comment" rows="3" maxlength="2000" placeholder="Explain what the seller should review and the response you expect."></textarea></label>
    <div class="aftersales-negotiation-actions"><button type="button" id="aftersalesLookupSeller">↻ Reload Sellers</button><button class="primary-button" type="submit" id="aftersalesForwardSubmit" disabled>Forward to Seller</button></div>
  </form>
  <details class="aftersales-negotiation-history"><summary>Reactivate expired Aftersales application</summary><form id="aftersalesExtensionForm" class="aftersales-negotiation-form"><label>Valid until (Kenya local time)<input type="datetime-local" name="until" required></label><label class="wide">Reason for reactivation<textarea name="reason" required minlength="5" maxlength="1000" rows="2"></textarea></label><button class="primary-button" type="submit">Approve reactivation</button><p id="aftersalesExtensionStatus" role="status"></p></form></details>
  <p role="status" id="aftersalesNegotiationAdminStatus" aria-live="polite"></p>
  <section class="aftersales-negotiation-history" id="aftersalesNegotiationHistory" hidden><h4>Seller & Customer Negotiation</h4><div id="aftersalesNegotiationSummary"></div><details><summary>View case activity timeline</summary><div id="aftersalesNegotiationEvents"></div></details></section>
  <section class="aftersales-negotiation-history" id="aftersalesRefundControl" hidden><h4>Return inspection & refund control</h4><p>Confirm the return was physically received in the Pickup Station returns system. Refunds must be paid separately; this form records authorized external settlement only.</p><p id="aftersalesRefundReviewStatus">Not yet reviewed</p><form id="aftersalesRefundControlForm" class="aftersales-negotiation-form"><label>Action<select name="action"><option value="approve_inspection">Approve physical inspection</option><option value="reject_inspection">Reject physical inspection</option><option value="record_payment_pending">Approve refund for manual payment</option><option value="record_payment_paid">Record completed refund payment</option></select></label><label class="wide">Inspection or payment note<textarea name="note" rows="2" maxlength="2000"></textarea></label><label>External payment reference (required if recording paid)<input name="reference" maxlength="120"></label><button type="submit" class="primary-button">Record Authorized Action</button><p role="status" id="aftersalesRefundActionStatus"></p></form></section>
  <section class="aftersales-negotiation-intervention" id="aftersalesIntervention" hidden><h4>LEOGO Intervention</h4><p>This case requires LEOGO Customer Care review. Review the seller response and customer comments, then use the existing <strong>Update the case</strong> section above to record the decision and notify the customer.</p></section>`;
detail.insertAdjacentElement('afterend',root);
const $=s=>root.querySelector(s);
const form=$('#aftersalesForwardForm');
const status=$('#aftersalesNegotiationAdminStatus');
const sellerSelect=form.elements.seller;
let selected=null;
let loadToken=0;
let negotiations=[];
let currentReturnId='';
const returnOps=document.createElement('section');
returnOps.className='content-card aftersales-negotiation-card';
returnOps.hidden=true;
returnOps.innerHTML=`
 <div class="aftersales-negotiation-heading"><div><span>PHYSICAL RETURN & RESOLUTION</span><h3>Aftersales Return Operations</h3><p>Record parcel handoffs, verify return shipping, and close only after delivery or expiry. Refund recommendations require separate LEOGO authorization.</p></div><button type="button" id="refreshReturnOperations">↻ Refresh</button></div>
 <p id="returnOperationsSummary" role="status"></p>

 <section style="padding:14px;border:1px solid #d5dfed;border-radius:12px;background:#f6f9ff"><h4>Rider Assignment & Return Waybill</h4><p>Assign a courier, print the QR-coded return waybill, or open the handover proof uploaded by the Pickup Station.</p>
  <form id="aftersalesCourierAssignment" class="aftersales-negotiation-form">
   <label>Registered LEOGO rider / approved courier<select name="assignee" required><option value="">Loading available riders and couriers…</option></select></label>
   <button type="submit">Assign Rider / Courier</button><p role="status"></p>
  </form>
  <p id="aftersalesWaybillInfo">Select an Aftersales return to view waybill status.</p>
  <form id="aftersalesRouteForm" class="aftersales-negotiation-form">
  <label>Return route <select name="destination"><option value="seller">Direct to Seller</option><option value="sorting_center">Via LEOGO Sorting Center</option></select></label>
  <button type="submit">Save Route Before Handover</button><p role="status"></p>
 </form>
 <button id="printAftersalesReturnWaybill" type="button">Print / Save QR Return Waybill</button>
  <button id="downloadAftersalesWaybill" type="button" hidden>Open Uploaded Rider Receipt</button>
 </section>
 <details><summary>1. Parcel: Pickup Station → Sorting Center → Seller</summary>
  <form data-return-action="route" class="aftersales-negotiation-form">
   <label>Verified handover<select name="step"><option value="station_dispatched_to_sorting">Station → Sorting Center</option><option value="sorting_received">Sorting Center received</option><option value="sorting_dispatched_to_seller">Sorting Center → Seller</option><option value="station_dispatched_to_seller">Station → Seller</option></select></label>
   <label class="wide">Physical handover notes<textarea name="note" required minlength="5" maxlength="1000"></textarea></label>
   <button type="submit">Record Physical Handover</button><p role="status"></p>
  </form>
 </details>
 <details><summary>2. Rejected Product: Return Shipping Fee</summary>
  <form data-return-action="fee" class="aftersales-negotiation-form"><label>Return shipping fee (KSh)<input name="amount" type="number" min="1" max="100000" step="0.01" required></label>
   <label class="wide">Fee calculation / reason<textarea name="note" required minlength="5" maxlength="1000"></textarea></label>
   <button type="submit">Issue Fee & 7-Day Payment Deadline</button><p role="status"></p></form>
 </details>
 <details><summary>3. Verify Customer Return Shipping Payment</summary>
  <form data-return-action="verify" class="aftersales-negotiation-form"><label>Verification result<select name="approve"><option value="yes">Approve verified payment</option><option value="no">Reject payment reference</option></select></label>
   <label class="wide">Verification reason and reference check<textarea name="note" required minlength="5" maxlength="1000"></textarea></label>
   <button type="submit">Record Payment Verification</button><p role="status"></p></form>
 </details>
 <details><summary>4. Dispatch Rejected Item Back to Customer</summary>
  <form data-return-action="dispatch" class="aftersales-negotiation-form">
   <label>Parcel tracking reference<input name="tracking" required minlength="5" maxlength="120"></label>
   <button type="submit">Confirm Physical Dispatch</button><p role="status"></p></form>
 </details>
 <details><summary>5. Admin Final Closure</summary>
  <form data-return-action="close" class="aftersales-negotiation-form"><p>Backend permits closure only after confirmed customer receipt or expiration of an unpaid seven-day return fee; unresolved intervention blocks closure.</p>
   <label class="wide">Closure reason<textarea name="note" required minlength="5" maxlength="1000"></textarea></label>
   <button type="submit">Close Eligible Case</button><p role="status"></p></form>
 </details>`;
root.before(returnOps);
const exchangeOps=document.createElement('section');exchangeOps.className='content-card aftersales-negotiation-card';exchangeOps.hidden=true;
exchangeOps.innerHTML='<h3>Outbound Exchange / Replacement Shipment</h3><p>Admin decides responsibility for delivery cost. Replacement dispatch never creates a new sale or station commission.</p><div id="exchangeAdminStatus"></div>'+
'<form id="exchangeAdminCostForm" style="display:grid;gap:10px;margin:12px 0">'+
'<label>Delivery cost payer<select name="payer" required><option value="">Select responsibility</option><option value="seller">Seller</option><option value="customer">Customer</option><option value="leogo">LEOGO</option></select></label>'+
'<label>Delivery cost (KSh)<input name="cost" type="number" min="0" step="0.01" required></label>'+
'<label>Reason for assigning liability<textarea name="reason" minlength="10" required></textarea></label>'+
'<label>Customer payment reference (required for verified customer-paid delivery)<input name="reference" maxlength="100" placeholder="M-Pesa / bank reference"></label>'+
'<label><input type="checkbox" name="verified"> Delivery payment or approved internal charge independently verified</label>'+
'<button type="submit">Save Responsibility & Verified Charge</button><p role="status"></p></form>'+
'<form id="exchangeAdminRiderForm" style="display:grid;gap:10px"><label>Registered Rider<select name="rider" required></select></label><button type="submit">Assign Replacement Rider</button><p role="status"></p></form>';
returnOps.before(exchangeOps);
const exchangeStatus=exchangeOps.querySelector('#exchangeAdminStatus');
async function refreshExchangeAdmin(){
 const n=activeRecord();
 exchangeOps.hidden=!n||!selected;
 if(!n||!selected)return;
 const result=await db.rpc('aftersales_exchange_list',{p_role:'admin'});
 const shipment=Array.isArray(result.data)?result.data.find(s=>s.case_id===n.case_id):null;
 exchangeOps.querySelector('#exchangeAdminCostForm').hidden=!shipment||!['packed_ready','assigned'].includes(shipment.status);
 exchangeOps.querySelector('#exchangeAdminRiderForm').hidden=!shipment||shipment.status!=='packed_ready';
 if(result.error){exchangeStatus.textContent=result.error.message;return;}
 exchangeStatus.textContent=shipment?'Exchange '+shipment.reference+' · '+shipment.status.replaceAll('_',' ')+' · Customer delivery choice: '+(shipment.customer_delivery_choice==='door'?'Door (fee and payment verification required)':shipment.customer_delivery_choice==='pickup_station'?'Pickup Station collection':'Awaiting customer choice')+' · Sorting Center transit optional · Station handover commission: KSh 0':'Seller has not packed an approved exchange yet.';
 if(!shipment)return;
 const form=exchangeOps.querySelector('#exchangeAdminCostForm');
 form.elements.payer.value=shipment.payer||'';
 form.elements.cost.value=shipment.delivery_cost_kes??'';
 form.elements.reason.value=shipment.responsibility_reason||'';
 form.elements.reference.value=shipment.delivery_payment_reference||'';
 form.elements.verified.checked=!!shipment.payment_verified;
 const list=await db.rpc('admin_aftersales_available_couriers');
 const select=exchangeOps.querySelector('#exchangeAdminRiderForm [name=rider]');select.replaceChildren(new Option('Choose active LEOGO rider',''));
 for(const operator of (Array.isArray(list.data)?list.data:[]).filter(x=>x.kind==='rider'))select.add(new Option(operator.label,operator.id));
}
exchangeOps.querySelector('#exchangeAdminCostForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,n=activeRecord();if(!n||!selected)return;
 const result=await db.rpc('admin_aftersales_exchange_decide_cost',{p_case_id:n.case_id,p_payer:form.elements.payer.value,p_cost:Number(form.elements.cost.value),p_reason:form.elements.reason.value,p_payment_verified:form.elements.verified.checked,p_payment_reference:form.elements.reference.value.trim()||null});
 form.querySelector('[role=status]').textContent=result.error?.message||'Charge decision recorded.';if(!result.error)await refreshExchangeAdmin();
});
exchangeOps.querySelector('#exchangeAdminRiderForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,n=activeRecord();if(!n||!selected)return;
 const result=await db.rpc('admin_aftersales_exchange_assign',{p_case_id:n.case_id,p_rider_id:form.elements.rider.value});
 form.querySelector('[role=status]').textContent=result.error?.message||'Registered rider assigned.';if(!result.error)await refreshExchangeAdmin();
});

const returnStatus=returnOps.querySelector('#returnOperationsSummary');
async function refreshReturnOperations(){
 await refreshExchangeAdmin();
 const n=activeRecord();
 returnOps.hidden=!n||!selected;
 currentReturnId='';
 if(!n||!selected)return;
 const [returns,shipping]=await Promise.all([db.rpc('admin_list_pickup_station_returns'),db.rpc('admin_aftersales_return_shipping_list')]);
 const ref=n.return_tracking?.return_reference;
 const physical=Array.isArray(returns.data)?returns.data.find(row=>row.return_reference===ref):null;
 if(physical)currentReturnId=physical.id;
 const waybill=physical?await db.rpc('admin_aftersales_waybill_status',{p_return_id:physical.id}):null;
 const roster=await db.rpc('admin_aftersales_available_couriers');
 const picker=returnOps.querySelector('#aftersalesCourierAssignment [name=assignee]');
 const options=Array.isArray(roster.data)?roster.data:[];
 picker.replaceChildren(new Option(roster.error?'Unable to load: '+roster.error.message:'Select available registered rider or courier',''));
 for(const item of options)picker.add(new Option((item.kind==='rider'?'LEOGO rider: ':'Approved courier: ')+item.label,item.kind+':'+item.id));
 const waybillInfo=returnOps.querySelector('#aftersalesWaybillInfo');
 waybillInfo.textContent=!physical?'No booked return linked to this case':waybill?.error?'Unable to load waybill: '+waybill.error.message:!waybill?.data?.assigned?'Courier not assigned':('Courier: '+waybill.data.courier_name+(waybill.data.waybill_path?' · Waybill uploaded':' · Awaiting station waybill upload'));
 returnOps.querySelector('#downloadAftersalesWaybill').hidden=!waybill?.data?.waybill_path;
 const fee=Array.isArray(shipping.data)?shipping.data.find(row=>row.case_id===selected.case_id):null;
 returnStatus.textContent='Case '+n.case_reference+' · '+n.stage.replaceAll('_',' ')+
  (physical?' · Return '+physical.return_reference+' ('+physical.status.replaceAll('_',' ')+')':' · No linked physical return recorded')+
  (fee?' · Shipping fee KSh '+Number(fee.amount_kes).toLocaleString('en-KE')+' ('+fee.status.replaceAll('_',' ')+')':'')+
  (returns.error?' · Parcel list: '+returns.error.message:'')+
  (shipping.error?' · Shipping list: '+shipping.error.message:'');
}
returnOps.querySelector('#aftersalesRouteForm').addEventListener('submit',async ev=>{
 ev.preventDefault();const frm=ev.currentTarget;
 if(!currentReturnId){frm.querySelector('[role=status]').textContent='Select a received Aftersales return first.';return;}
 const {error}=await db.rpc('admin_configure_aftersales_return_route',{p_return_id:currentReturnId,p_destination:frm.elements.destination.value});
 frm.querySelector('[role=status]').textContent=error?.message||'Route saved. Station handover will follow this destination.';
});
returnOps.querySelector('#aftersalesCourierAssignment').addEventListener('submit',async event=>{
 event.preventDefault();const frm=event.currentTarget,status=frm.querySelector('[role=status]');if(!currentReturnId){status.textContent='Select a case with an existing physical return';return;}
 const button=frm.querySelector('button');button.disabled=true;
 const [type,id]=frm.elements.assignee.value.split(':');
 const {error}=await db.rpc('admin_assign_aftersales_registered_courier',{p_return_id:currentReturnId,p_assignee_id:id,p_assignee_type:type});
 button.disabled=false;status.textContent=error?.message||'Courier assigned. Pickup Station can now upload the waybill.';if(!error)await refreshReturnOperations();
});
returnOps.querySelector('#printAftersalesReturnWaybill').addEventListener('click',async()=>{
 if(!currentReturnId){alert('Select an Aftersales case with a booked return parcel first.');return;}
 const result=await db.rpc('admin_aftersales_waybill_print_data',{p_return_id:currentReturnId});
 if(result.error){alert(result.error.message);return;}
 const d=result.data||{},escPrint=value=>String(value??'Not recorded').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const qrHost=document.createElement('div');
 if(typeof QRCode!=='function'){alert('QR generator is still loading. Refresh and try again.');return;}
 new QRCode(qrHost,{text:String(d.aftersales_number||''),width:150,height:150,correctLevel:QRCode.CorrectLevel.M});
 const canvas=qrHost.querySelector('canvas'),qrImg=qrHost.querySelector('img');
 const source=canvas?.toDataURL('image/png')||qrImg?.src;
 if(!source){alert('Unable to generate QR. Refresh and try again.');return;}
 const printable=window.open('','_blank');if(!printable){alert('Allow popups to print the return waybill.');return;}
 const date=value=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'numeric',year:'numeric',timeZone:'Africa/Nairobi'}).format(new Date(value)).replaceAll('/' , ':'):'Not recorded';
 const customer=[d.customer_name,d.customer_phone].filter(Boolean).join(' - ');
 const station=[d.station_name,d.station_address,d.station_landmark].filter(Boolean).join(', ')+(d.station_phone?' - '+d.station_phone:'');
 const rider=[d.assigned_rider_name,d.assigned_rider_phone].filter(Boolean).join(' - ');
 const lines=[
  ['Customer Details',customer],
  ['Pickup Station',station],
  ['Item Name',d.item_name],
  ['Item Received Date',date(d.receiving_date)],
  ['Assigned Rider/Courier',rider||'Not assigned'],
  ['Assignment Date',date(d.assigning_date)],
  ['Shipping To',d.shipping_to||'Not assigned']
 ];
 printable.document.write('<!doctype html><html><head><meta charset="utf-8"><title>LEOGO Aftersales Return Waybill</title><style>'+
 'body{font:10px/1.25 Arial,sans-serif;max-width:320px;margin:8px auto;color:#12213a;padding:7px;overflow-wrap:anywhere}header{text-align:center;border-bottom:1px solid #9ca3af;padding-bottom:5px;margin-bottom:5px}h1{font-size:12px;margin:0}h2{font-size:11px;margin:2px 0}h3{font-size:11px;margin:3px 0 0}.line{padding:3px 0;border-bottom:1px dotted #d1d5db}.line b{font-weight:700}.qr{text-align:center;margin-top:7px}.qr img{width:116px;height:116px}button{display:block;margin:8px auto;padding:6px 10px}@media print{button{display:none}body{margin:0;max-width:none;padding:3px}}'+
 '</style></head><body><header><h1>LEOGO DIGITAL MARKET</h1><h2>AFTERSALES RETURN WAYBILL</h2><h3>'+escPrint(d.aftersales_number)+'</h3></header>'+
 lines.map(([label,value])=>'<div class="line"><b>'+escPrint(label)+':</b> '+escPrint(value||'Not recorded')+'</div>').join('')+
 '<div class="qr"><img alt="Aftersales QR code" src="'+source+'"></div><button onclick="window.print()">Print / Save PDF</button></body></html>');
 printable.document.close();
});
returnOps.querySelector('#downloadAftersalesWaybill').addEventListener('click',async ()=>{
 if(!currentReturnId)return;
 const info=await db.rpc('admin_aftersales_waybill_status',{p_return_id:currentReturnId});
 if(info.error||!info.data?.waybill_path){alert(info.error?.message||'Waybill not uploaded yet');return;}
 const signed=await db.storage.from('aftersales-return-waybills').createSignedUrl(info.data.waybill_path,120);
 if(signed.error||!signed.data?.signedUrl){alert(signed.error?.message||'Unable to open the waybill');return;}
 window.open(signed.data.signedUrl,'_blank','noopener,noreferrer');
});
returnOps.querySelector('#refreshReturnOperations').addEventListener('click',refreshReturnOperations);
returnOps.querySelectorAll('form[data-return-action]').forEach(frm=>frm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!selected)return;
 const kind=frm.dataset.returnAction;
 const button=frm.querySelector('button[type=submit]');
 const note=frm.elements.note?.value.trim()||'';
 const map={
  route:['admin_aftersales_route_return',{p_return_id:currentReturnId,p_step:frm.elements.step?.value,p_notes:note}],
  fee:['admin_aftersales_issue_return_shipping',{p_case_id:selected.case_id,p_amount_kes:Number(frm.elements.amount?.value),p_note:note}],
  verify:['admin_aftersales_verify_return_shipping_payment',{p_case_id:selected.case_id,p_approve:frm.elements.approve?.value==='yes',p_note:note}],
  dispatch:['admin_aftersales_dispatch_customer_return',{p_case_id:selected.case_id,p_tracking_reference:frm.elements.tracking?.value.trim()}],
  close:['admin_aftersales_close_rejected_return',{p_case_id:selected.case_id,p_note:note}]
 };
 if(kind==='route'&&!currentReturnId){frm.querySelector('[role=status]').textContent='A matching booked return parcel is required first.';return;}
 const [rpc,args]=map[kind];
 button.disabled=true;
 const {data,error}=await db.rpc(rpc,args);
 frm.querySelector('[role=status]').textContent=error?.message||(data?.ok?'Recorded successfully. Refresh the case timeline.':'Operation returned no confirmation.');
 button.disabled=false;
 if(!error){await refreshNegotiations();await refreshReturnOperations();}
}));

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageLabel=x=>String(x||'Not forwarded').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase());
const signal=(message,bad=false)=>{status.textContent=message;status.classList.toggle('is-error',bad);};
const activeRecord=()=>negotiations.find(x=>x.case_id===selected?.case_id);
async function loadRefundReview(){
const pane=$('#aftersalesRefundControl');
const n=activeRecord();
pane.hidden=!(n?.stage==='customer_accepted'&&n?.solution_kind==='return_refund');
if(pane.hidden||!selected)return;
const {data,error}=await db.rpc('admin_get_aftersales_refund_review',{p_case_id:selected.case_id});
$('#aftersalesRefundReviewStatus').textContent=error?error.message:'Current refund control status: '+(data?.status||'Awaiting physical return and inspection');
}
$('#aftersalesRefundControlForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!selected)return;
 const form=event.currentTarget;
 const {data,error}=await db.rpc('admin_aftersales_refund_action',{p_case_id:selected.case_id,p_action:form.elements.action.value,
 p_note:form.elements.note.value.trim()||null,p_reference:form.elements.reference.value.trim()||null});
 $('#aftersalesRefundActionStatus').textContent=error?error.message:'Recorded: '+data.status+'. No payment was initiated by LEOGO.';
 if(!error)await loadRefundReview();
});
function renderNegotiation(){
const n=activeRecord();
$('#negotiationStage').textContent=stageLabel(n?.stage);
const history=$('#aftersalesNegotiationHistory');
history.hidden=!n;
if(!n){$('#aftersalesIntervention').hidden=true;return;}
$('#aftersalesNegotiationSummary').innerHTML='<p><strong>Seller response:</strong> '+esc(n.seller_solution||n.seller_comment||'Awaiting seller response')+'</p><p><strong>Customer response:</strong> '+esc(n.customer_comment||'Awaiting customer')+'</p>';
$('#aftersalesNegotiationEvents').innerHTML=(n.history||[]).map(e=>'<p><b>'+esc(stageLabel(e.actor_role))+'</b> · '+esc(stageLabel(e.event_type))+(e.comment?' — '+esc(e.comment):'')+'</p>').join('')||'<p>No history recorded yet.</p>';
$('#aftersalesIntervention').hidden=!['seller_rejected','customer_rejected','intervention_requested','admin_review'].includes(n.stage);
}
async function refreshNegotiations(){
const token=loadToken;
const {data,error}=await db.rpc('aftersales_list_negotiations');
if(token!==loadToken)return;
if(error){signal('Unable to load negotiation history: '+error.message,true);return;}
negotiations=Array.isArray(data)?data:[];
renderNegotiation();
await loadRefundReview();
await refreshReturnOperations();
}
async function loadSellers(){
if(!selected)return;
const token=loadToken;
sellerSelect.disabled=true;
sellerSelect.innerHTML='<option value="">Loading sellers…</option>';
$('#aftersalesForwardSubmit').disabled=true;
const {data,error}=await db.rpc('aftersales_order_sellers',{p_case_id:selected.case_id});
if(token!==loadToken)return;
if(error){sellerSelect.innerHTML='<option value="">Unable to load sellers</option>';signal(error.message,true);return;}
const sellers=Array.isArray(data)?data:[];
sellerSelect.innerHTML='<option value="">Select responsible seller</option>'+sellers.map(s=>'<option value="'+esc(s.seller_id)+'">'+esc(s.display_name||s.business_name||s.seller_name||s.seller_id)+'</option>').join('');
sellerSelect.disabled=!sellers.length;
if(sellers.length===1)sellerSelect.value=sellers[0].seller_id;
else if(activeRecord()?.seller_id && sellers.some(s=>s.seller_id===activeRecord().seller_id))sellerSelect.value=activeRecord().seller_id;
$('#aftersalesForwardSubmit').disabled=!sellerSelect.value;
if(!sellers.length)signal('No eligible sellers were found for this order.',true);
}
function openCase(item){
if(!item?.case_id)return;
selected=item;
loadToken++;
root.hidden=false;
$('#negotiationCaseReference').textContent=item.case_reference||item.case_id;
$('#negotiationOrderReference').textContent=item.order_reference||'—';
form.reset();
signal('');
renderNegotiation();
Promise.all([refreshNegotiations(),loadSellers()]);
}
document.addEventListener('leogo:admin-aftersales-case-selected',e=>openCase(e.detail));
$('#aftersalesExtensionForm').addEventListener('submit',async e=>{
e.preventDefault();if(!selected?.order_reference)return;
const form=e.currentTarget,until=new Date(form.elements.until.value);
const status=$('#aftersalesExtensionStatus');
if(Number.isNaN(until.getTime())){status.textContent='Choose a valid deadline.';return;}
const {data,error}=await db.rpc('aftersales_extend_selected_case_order',{p_case_id:selected.case_id,p_valid_until:until.toISOString(),p_reason:form.elements.reason.value.trim()});
status.textContent=error?error.message:'Aftersales filing reactivated until '+until.toLocaleString('en-KE')+'.';
if(!error)form.reset();
});
$('#aftersalesLookupSeller').addEventListener('click',loadSellers);
$('#aftersalesNegotiationRefresh').addEventListener('click',refreshNegotiations);
sellerSelect.addEventListener('change',()=>{$('#aftersalesForwardSubmit').disabled=!sellerSelect.value;});
form.addEventListener('submit',async e=>{
e.preventDefault();
if(!selected||!sellerSelect.value)return;
const existing=activeRecord();
if(existing&&!window.confirm('Forwarding again will restart the seller negotiation for this case. Continue?'))return;
const button=$('#aftersalesForwardSubmit');button.disabled=true;signal('Forwarding complaint…');
const {error}=await db.rpc('aftersales_forward_to_seller',{p_case_id:selected.case_id,p_seller_id:sellerSelect.value,p_comment:form.elements.comment.value.trim()||null});
if(error){signal(error.message,true);button.disabled=false;return;}
signal('Case forwarded to the selected seller.');await refreshNegotiations();button.disabled=false;
});
})();
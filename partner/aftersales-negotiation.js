(() => {
'use strict';
const db=window.leogoPartnerClient;
const orders=document.querySelector('#sellerAftersalesHome');
if(!db||!orders)return;
const section=document.createElement('section');section.className='panel';section.innerHTML='<h3>Customer Aftersales</h3><p>Review each affected item, follow its history and continue from the correct stage.</p><button id="sellerAftersalesRefresh" type="button">Refresh Cases</button><div id="sellerAftersalesCaseList" class="leogo-aftersales-list"></div><div id="sellerAftersalesNegotiations" class="leogo-aftersales-detail"></div>';orders.append(section);
const el=section.querySelector('#sellerAftersalesNegotiations');
const caseList=section.querySelector('#sellerAftersalesCaseList');
let selectedCaseId=null;
let lastKnownUpdates=new Map();
const style=document.createElement('style');style.textContent=`.leogo-aftersales-list{display:grid;gap:10px;margin:18px 0}.leogo-aftersales-list button{width:100%;text-align:left;border:1px solid #dae3ee;border-radius:13px;padding:14px;background:#fff;color:#10233f;display:grid;gap:5px;white-space:normal}.leogo-aftersales-list button[aria-current=true]{border:2px solid #ef7d00;background:#fff9f3}.leogo-aftersales-list strong{font-size:1rem}.leogo-aftersales-list small{opacity:.8}.leogo-aftersales-detail .panel{max-width:100%;box-sizing:border-box}.leogo-aftersales-detail textarea,.leogo-aftersales-detail select{width:100%;max-width:100%;box-sizing:border-box}.leogo-aftersales-overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px;margin:12px 0}.leogo-aftersales-overview>div{padding:12px;border:1px solid #dce4ed;border-radius:12px;background:#f8fafc;overflow-wrap:anywhere}.leogo-aftersales-detail h4{overflow-wrap:anywhere}.leogo-aftersales-detail details{margin:12px 0}.leogo-aftersales-detail form{border-top:1px solid #e2e8f0;padding-top:14px;display:grid;gap:10px}.leogo-aftersales-detail .seller-aftersales-customer-report{overflow-wrap:anywhere}`;style.textContent+="\n.leogo-aftersales-detail .leogo-aftersales-overview,.leogo-aftersales-detail .seller-aftersales-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0;align-items:stretch}\n.leogo-aftersales-detail .leogo-aftersales-overview>div,.leogo-aftersales-detail .seller-aftersales-field{margin:0;padding:10px;border:1px solid #dce4ed;border-radius:12px;background:#fff;min-width:0;overflow-wrap:anywhere;box-sizing:border-box}\n.leogo-aftersales-detail .leogo-aftersales-overview strong,.leogo-aftersales-detail .seller-aftersales-field strong{display:block;font-size:11px;line-height:1.3;color:#61728a;margin-bottom:5px}\n.leogo-aftersales-detail .leogo-aftersales-overview p,.leogo-aftersales-detail .seller-aftersales-field span{font-size:13px;line-height:1.4;margin:0;color:#10233f;font-weight:600;white-space:normal;word-break:break-word}\n.leogo-aftersales-detail .seller-aftersales-field.wide{grid-column:1/-1}\n.leogo-aftersales-detail .seller-aftersales-customer-report,.leogo-aftersales-detail .seller-aftersales-return-report{padding:12px!important;margin:12px 0!important;border-radius:13px}\n.leogo-aftersales-detail .seller-aftersales-evidence{grid-column:1/-1;border:1px solid #dce4ed;border-radius:12px;background:#fff;padding:10px;margin:0!important}\n.leogo-aftersales-detail .seller-aftersales-evidence img{max-height:210px!important;max-width:100%;width:auto;object-fit:contain}\n.leogo-aftersales-detail .seller-aftersales-inspection{background:#f8fafc}\n@media(min-width:800px){.leogo-aftersales-detail .leogo-aftersales-overview,.leogo-aftersales-detail .seller-aftersales-fields{grid-template-columns:repeat(4,minmax(0,1fr))}}\n@media(max-width:360px){.leogo-aftersales-detail .leogo-aftersales-overview,.leogo-aftersales-detail .seller-aftersales-fields{gap:6px}.leogo-aftersales-detail .seller-aftersales-field{padding:8px}}\n";document.head.append(style);
const evidenceBucket='marketplace-aftersales-evidence';
let linkedCases=[];
function attachOrderLinks(){
 for(const n of linkedCases){
  const orderCard=[...document.querySelectorAll('.seller-order-card')].find(o=>o.dataset.orderReference===n.order_reference);
  if(!orderCard||orderCard.querySelector('[data-case-link="'+n.case_id+'"]'))continue;
  const footer=orderCard.querySelector('footer')||orderCard;
  const button=document.createElement('button');button.type='button';button.dataset.caseLink=n.case_id;
  button.textContent='View Aftersales · '+String(n.stage||'Open').replaceAll('_',' ');
  button.className='secondary seller-aftersales-order-link';
  button.addEventListener('click',()=>{document.querySelector('[data-seller-view="aftersales"]')?.click();window.setTimeout(()=>{selectedCaseId=n.case_id;showSelectedCase();el.scrollIntoView({behavior:'smooth',block:'start'});},90);});
  footer.append(button);
  const details=document.createElement('details');details.style.margin='12px 0';
  const summary=document.createElement('summary');summary.textContent='Aftersales application · '+(n.case_reference||'Open case');
  const info=document.createElement('div');info.style.cssText='margin:8px 0;padding:12px;border:1px solid #d9e2ef;border-radius:10px';
  const add=(label,value)=>{const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=label+': ';p.append(strong,document.createTextNode(String(value??'Not provided')));info.append(p);};
  add('Complaint',n.issue_type);
  add('Customer explanation',n.details);
  add('Requested solution',n.preferred_solution);
  add('Current case status',n.stage);
  if(n.return_tracking){add('Return parcel status',n.return_tracking.status);add('Return reference',n.return_tracking.return_reference);}
  if(n.evidence_path)add('Photo proof','Open the full case below to view the protected image.');
  details.append(summary,info);orderCard.append(details);
 }
}
window.addEventListener('leogo:seller-orders-rendered',attachOrderLinks);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function load(){
const {data,error}=await db.rpc('aftersales_list_negotiations');
const {data:inspectionData,error:inspectionError}=await db.rpc('aftersales_seller_list_inspections');
const inspections=Array.isArray(inspectionData)?inspectionData:[];
if(inspectionError)console.warn('Seller inspection list not yet available:',inspectionError.message);
if(error){el.textContent=error.message;return;}
el.replaceChildren();caseList.replaceChildren();
linkedCases=Array.isArray(data)?data:[];
if(!selectedCaseId||!linkedCases.some(n=>n.case_id===selectedCaseId))selectedCaseId=linkedCases[0]?.case_id||null;
const updated=new Map(linkedCases.map(n=>[n.case_id,String(n.updated_at||'')]));
const changed=linkedCases.filter(n=>lastKnownUpdates.has(n.case_id)&&lastKnownUpdates.get(n.case_id)!==String(n.updated_at||''));
lastKnownUpdates=updated;
if(changed.length){const message=document.createElement('p');message.setAttribute('role','status');message.textContent=changed.length+' Aftersales case update(s) received. Check the activity history.';caseList.append(message);}
for(const n of linkedCases){const button=document.createElement('button');button.type='button';button.dataset.selectAftersales=n.case_id;button.setAttribute('aria-current',String(n.case_id===selectedCaseId));const status=String(n.stage||'Open').replaceAll('_',' ');const title=document.createElement('strong');title.textContent=n.product_name||'Product identification pending';const order=document.createElement('small');order.textContent='Order '+(n.order_reference||n.order_id)+' · '+(n.customer_name||'Customer name not supplied');const info=document.createElement('small');info.textContent=(n.case_reference||'Aftersales')+' · '+status+' · '+(n.issue_type||'Complaint');button.append(title,order,info);button.onclick=()=>{selectedCaseId=n.case_id;showSelectedCase();};caseList.append(button);}
for(const n of data||[]){
const field=(label,value,wide=false)=>'<div class="seller-aftersales-field'+(wide?' wide':'')+'"><strong>'+esc(label)+'</strong><span>'+esc(value===null||value===undefined||value===''?'Not provided':value)+'</span></div>';
const formatDate=value=>value?new Date(value).toLocaleString('en-KE'):'Not provided';
const history=Array.isArray(n.history)?n.history:[];
const returnInfo=n.return_tracking||null;
const returnReport=returnInfo
 ? '<section class="seller-aftersales-return-report" style="padding:12px;margin:12px 0;border:1px solid #d7e2ed;border-radius:10px"><h5>Return Parcel Tracking</h5><div class="seller-aftersales-fields">'+
   field('Return reference',returnInfo.return_reference)+field('Current return status',String(returnInfo.status||'').replaceAll('_',' '))+
   field('Return reason',returnInfo.return_reason)+field('Return item',returnInfo.item_description)+
   field('Booked at pickup station',formatDate(returnInfo.booked_at))+
   field('Dispatched from station',formatDate(returnInfo.dispatched_at))+
   field('Last tracking update',formatDate(returnInfo.updated_at))+'</div></section>'
 : '<p>Return parcel: Not booked at a pickup station yet.</p>';
const customerReport='<section class="seller-aftersales-customer-report" style="padding:14px;margin:14px 0;background:#f4f7fc;border:1px solid #d9e2ef;border-radius:12px">'+
  '<h5 style="margin:0 0 10px">Original Customer Aftersales Application</h5><div class="seller-aftersales-fields">'+
  field('Product',n.product_name||(n.order_item_id?'Product name unavailable':'Original complaint did not identify a specific order item'))+field('Order reference',n.order_reference||n.order_id)+
  field('Customer / order recipient',n.customer_name||'Not recorded')+field('Complaint type',n.issue_type)+field('Customer explanation',n.details)+
  field('Customer requested solution',n.preferred_solution)+
  (n.requested_refund_amount_kes!=null?field('Requested refund (KSh)',Number(n.requested_refund_amount_kes).toLocaleString('en-KE')):'')+
  (n.return_pickup_station_id?field('Return pickup station ID',n.return_pickup_station_id):'')+
  field('Seller response deadline',formatDate(n.response_due_at))+
  (n.customer_comment?field('Latest customer comment',n.customer_comment):'')+
  (n.admin_comment?field('LEOGO case communication',n.admin_comment):'')+
  '</div>'+(n.evidence_path?'<div class="seller-aftersales-evidence" style="margin:12px 0"><strong>Customer photo proof</strong><p>Loading protected image…</p></div>':'<p>No photo evidence was submitted for this case.</p>')+
  '</section>';
const caseHistory=history.length?'<details style="margin:12px 0"><summary>Case activity history ('+history.length+')</summary>'+
  history.map(e=>'<div style="border-bottom:1px solid #ddd;padding:8px 0">'+field('Time',formatDate(e.created_at))+field('Action',e.event_type)+field('By',e.actor_role)+(e.comment?field('Comment',e.comment):'')+'</div>').join('')+'</details>':'';
const card=document.createElement('article');card.className='panel';card.dataset.aftersalesCase=n.case_id;card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><div class="leogo-aftersales-overview"><div><strong>Product</strong><p>'+esc(n.product_name||'Product identification pending')+'</p></div><div><strong>Order</strong><p>'+esc(n.order_reference||n.order_id)+'</p></div><div><strong>Customer / order recipient</strong><p>'+esc(n.customer_name||'Not recorded')+'</p></div><div><strong>Aftersales status</strong><p>'+esc(String(n.stage||'Open').replaceAll('_',' '))+'</p></div></div>'+customerReport+returnReport+caseHistory+'<p>Previous solution: '+esc(n.seller_solution||'None')+'</p><form><label>Action <select name="action"><option value="review">Start Review</option><option value="propose">Propose Solution</option><option value="reject">Reject Complaint</option></select></label><label>Solution type <select name="solutionKind"><option value="return_refund">Return and refund</option><option value="return_exchange">Return and exchange</option><option value="replacement">Replacement</option><option value="other">Other agreed solution</option></select></label><label>Solution <textarea name="solution" maxlength="2000"></textarea></label><label>Comments / rejection reason <textarea name="comment" maxlength="2000"></textarea></label><button type="submit">Submit Seller Response</button><p role="status"></p></form>';el.append(card);card.hidden=n.case_id!==selectedCaseId;
// Signed URLs are short-lived, and storage RLS restricts access to the assigned seller.
if(n.evidence_path){
 const proof=card.querySelector('.seller-aftersales-evidence');
 const {data:link,error:linkError}=await db.storage.from(evidenceBucket).createSignedUrl(n.evidence_path,300);
 if(proof){
  if(linkError||!link?.signedUrl)proof.querySelector('p').textContent='Photo temporarily unavailable: '+String(linkError?.message||'unable to open file')+'. Refresh to retry. No Admin approval is needed.';
  else{
   const img=document.createElement('img');img.src=link.signedUrl;img.alt='Customer-submitted photo evidence';img.loading='lazy';img.style.cssText='max-width:100%;max-height:320px;border-radius:9px;object-fit:contain;display:block;margin-top:10px';
   const open=document.createElement('a');open.href=link.signedUrl;open.target='_blank';open.rel='noopener noreferrer';open.textContent='View original photo';open.style.display='block';
   proof.querySelector('p')?.remove();proof.append(img,open);
  }
 }
}
const inspection=inspections.find(row=>row.case_id===n.case_id);
if(inspection){
 const summary=document.createElement('section');summary.className='panel seller-aftersales-inspection';summary.style.margin='12px 0';
 const title=document.createElement('h5');title.textContent='Returned Product Inspection';
 const details=document.createElement('p');details.textContent='Received: '+new Date(inspection.received_at).toLocaleString('en-KE')+
  (inspection.recommendation?' · Recommendation: '+inspection.recommendation.replaceAll('_',' '):' · Awaiting inspection');
 summary.append(title,details);card.append(summary);
}
if(n.stage==='customer_accepted' && n.return_tracking && ['dispatched','completed'].includes(n.return_tracking.status) && !inspection){
 const receipt=document.createElement('form');receipt.className='panel';receipt.style.margin='12px 0';
 receipt.innerHTML='<h5>Step 1 — Receive Returned Product</h5><p>Confirm physical receipt only after the parcel reaches you.</p><label>Condition of parcel and item<textarea name="condition" required minlength="5" maxlength="2000"></textarea></label><button type="submit">Confirm Receipt</button><p role="status" aria-live="polite"></p>';
 receipt.onsubmit=async ev=>{ev.preventDefault();const button=receipt.querySelector('button');button.disabled=true;
 const {error}=await db.rpc('aftersales_seller_receive_return',{p_case_id:n.case_id,p_condition:receipt.elements.condition.value});
 if(error){receipt.querySelector('[role=status]').textContent=error.message;button.disabled=false;return;}
 await load();};card.append(receipt);
}
if(inspection && !inspection.inspected_at){
 const review=document.createElement('form');review.className='panel';review.style.margin='12px 0';
 review.innerHTML='<h5>Step 2 — Inspect Returned Product</h5><p>Record the cause and your recommendation. Any refund requires LEOGO review and excludes original delivery charges.</p>'+
 '<label>Inspection finding<select name="finding"><option value="seller_liability">Seller responsibility</option><option value="customer_damage">Customer-caused damage</option><option value="undetermined">Undetermined</option></select></label>'+
 '<label>Recommended outcome<select name="recommendation"><option value="refund">Refund product amount</option><option value="exchange">Exchange item</option><option value="replacement">Replace item</option><option value="reject">Reject and return item to customer</option></select></label>'+
 '<label>Inspection findings and reasons<textarea name="notes" required minlength="10" maxlength="2000"></textarea></label>'+
 '<button type="submit">Submit Inspection</button><p role="status" aria-live="polite"></p>';
 review.onsubmit=async ev=>{ev.preventDefault();const button=review.querySelector('button');button.disabled=true;
 const {error}=await db.rpc('aftersales_seller_record_inspection',{p_case_id:n.case_id,p_finding:review.elements.finding.value,p_recommendation:review.elements.recommendation.value,p_notes:review.elements.notes.value});
 if(error){review.querySelector('[role=status]').textContent=error.message;button.disabled=false;return;}
 await load();};card.append(review);
}
if(inspection?.recommendation==='reject' && !inspection.ready_return_at){
 const repack=document.createElement('form');repack.className='panel';repack.style.margin='12px 0';
 repack.innerHTML='<h5>Step 3 — Prepare Rejected Item for Customer Return</h5><p>Only after inspection rejection. LEOGO will issue return-shipping instructions.</p><label>Repacking notes<textarea name="note" required minlength="5" maxlength="2000"></textarea></label><button type="submit">Mark Repacked & Ready</button><p role="status" aria-live="polite"></p>';
 repack.onsubmit=async ev=>{ev.preventDefault();const button=repack.querySelector('button');button.disabled=true;
 const {error}=await db.rpc('aftersales_seller_mark_repacked',{p_case_id:n.case_id,p_note:repack.elements.note.value});
 if(error){repack.querySelector('[role=status]').textContent=error.message;button.disabled=false;return;}
 await load();};card.append(repack);
}
const form=card.querySelector('form');
const lockedStages=['customer_accepted','customer_rejected','closed','completed'];
if(lockedStages.includes(n.stage)||inspection?.inspected_at){form.hidden=true;}else{
 const action=form.elements.action;action.value=(n.stage==='seller_reviewing'?'propose':'review');
 function adjust(){const proposing=action.value==='propose';form.elements.solutionKind.closest('label').hidden=!proposing;form.elements.solution.closest('label').hidden=!proposing;form.querySelector('button[type=submit]').textContent=action.value==='review'?'Mark Case Received / Under Review':action.value==='reject'?'Send Rejection to Customer':'Send Proposed Solution to Customer';}
 action.addEventListener('change',adjust);adjust();}
form.onsubmit=async e=>{e.preventDefault();const action=form.elements.action.value;const {error}=await db.rpc(action==='propose'?'aftersales_seller_propose_v2':'aftersales_seller_respond',action==='propose'?{p_case_id:n.case_id,p_solution_kind:form.elements.solutionKind.value,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value}:{p_case_id:n.case_id,p_action:action,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value});if(error){form.querySelector('[role=status]').textContent=error.message;return;}await load();};
}
attachOrderLinks();showSelectedCase();
if(!data?.length)el.textContent='No Aftersales cases assigned.';
}
function showSelectedCase(){for(const card of el.querySelectorAll('[data-aftersales-case]'))card.hidden=card.dataset.aftersalesCase!==selectedCaseId;for(const button of caseList.querySelectorAll('[data-select-aftersales]'))button.setAttribute('aria-current',String(button.dataset.selectAftersales===selectedCaseId));}
section.querySelector('#sellerAftersalesRefresh').onclick=load;
window.addEventListener('focus',()=>{if(!document.hidden)load();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
load();
})();
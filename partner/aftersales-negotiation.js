(() => {
'use strict';
const db=window.leogoPartnerClient;
const orders=document.querySelector('[data-seller-content="orders"]');
if(!db||!orders)return;
const section=document.createElement('section');section.className='panel';section.innerHTML='<h3>Aftersales cases sent by LEOGO</h3><p>Review your assigned cases, propose solutions or reject with a reason.</p><button id="sellerAftersalesRefresh" type="button">Refresh Cases</button><div id="sellerAftersalesNegotiations"></div>';orders.append(section);
const el=section.querySelector('#sellerAftersalesNegotiations');
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
  button.addEventListener('click',()=>document.querySelector('[data-aftersales-case="'+n.case_id+'"]')?.scrollIntoView({behavior:'smooth',block:'start'}));
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
if(error){el.textContent=error.message;return;}
el.replaceChildren();
linkedCases=Array.isArray(data)?data:[];
for(const n of data||[]){
const field=(label,value)=>'<div style="margin:8px 0"><strong>'+esc(label)+':</strong> '+esc(value===null||value===undefined||value===''?'Not provided':value)+'</div>';
const formatDate=value=>value?new Date(value).toLocaleString('en-KE'):'Not provided';
const history=Array.isArray(n.history)?n.history:[];
const returnInfo=n.return_tracking||null;
const returnReport=returnInfo
 ? '<section style="padding:12px;margin:12px 0;border:1px solid #d7e2ed;border-radius:10px"><h5>Return Parcel Tracking</h5>'+
   field('Return reference',returnInfo.return_reference)+field('Current return status',String(returnInfo.status||'').replaceAll('_',' '))+
   field('Return reason',returnInfo.return_reason)+field('Return item',returnInfo.item_description)+
   field('Booked at pickup station',formatDate(returnInfo.booked_at))+
   field('Dispatched from station',formatDate(returnInfo.dispatched_at))+
   field('Last tracking update',formatDate(returnInfo.updated_at))+'</section>'
 : '<p>Return parcel: Not booked at a pickup station yet.</p>';
const customerReport='<section class="seller-aftersales-customer-report" style="padding:14px;margin:14px 0;background:#f4f7fc;border:1px solid #d9e2ef;border-radius:12px">'+
  '<h5 style="margin:0 0 10px">Original Customer Aftersales Application</h5>'+
  field('Product',n.product_name)+field('Order reference',n.order_reference||n.order_id)+
  field('Complaint type',n.issue_type)+field('Customer explanation',n.details)+
  field('Customer requested solution',n.preferred_solution)+
  (n.requested_refund_amount_kes!=null?field('Requested refund (KSh)',Number(n.requested_refund_amount_kes).toLocaleString('en-KE')):'')+
  (n.return_pickup_station_id?field('Return pickup station ID',n.return_pickup_station_id):'')+
  field('Seller response deadline',formatDate(n.response_due_at))+
  (n.customer_comment?field('Latest customer comment',n.customer_comment):'')+
  (n.admin_comment?field('LEOGO case communication',n.admin_comment):'')+
  (n.evidence_path?'<div class="seller-aftersales-evidence" style="margin:12px 0"><strong>Customer photo proof</strong><p>Loading protected image…</p></div>':'<p>No photo evidence was submitted for this case.</p>')+
  '</section>';
const caseHistory=history.length?'<details style="margin:12px 0"><summary>Case activity history ('+history.length+')</summary>'+
  history.map(e=>'<div style="border-bottom:1px solid #ddd;padding:8px 0">'+field('Time',formatDate(e.created_at))+field('Action',e.event_type)+field('By',e.actor_role)+(e.comment?field('Comment',e.comment):'')+'</div>').join('')+'</details>':'';
const card=document.createElement('article');card.className='panel';card.dataset.aftersalesCase=n.case_id;card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Status: '+esc(n.stage)+'</p>'+customerReport+returnReport+caseHistory+'<p>Previous solution: '+esc(n.seller_solution||'None')+'</p><form><label>Action <select name="action"><option value="review">Start Review</option><option value="propose">Propose Solution</option><option value="reject">Reject Complaint</option></select></label><label>Solution type <select name="solutionKind"><option value="return_refund">Return and refund</option><option value="return_exchange">Return and exchange</option><option value="replacement">Replacement</option><option value="other">Other agreed solution</option></select></label><label>Solution <textarea name="solution" maxlength="2000"></textarea></label><label>Comments / rejection reason <textarea name="comment" maxlength="2000"></textarea></label><button type="submit">Submit Seller Response</button><p role="status"></p></form>';el.append(card);
// Signed URLs are short-lived, and storage RLS restricts access to the assigned seller.
if(n.evidence_path){
 const proof=card.querySelector('.seller-aftersales-evidence');
 const {data:link,error:linkError}=await db.storage.from(evidenceBucket).createSignedUrl(n.evidence_path,300);
 if(proof){
  if(linkError||!link?.signedUrl)proof.querySelector('p').textContent='Photo access unavailable. Ask LEOGO Admin to verify the case evidence permission.';
  else{
   const img=document.createElement('img');img.src=link.signedUrl;img.alt='Customer-submitted photo evidence';img.loading='lazy';img.style.cssText='max-width:100%;max-height:320px;border-radius:9px;object-fit:contain;display:block;margin-top:10px';
   const open=document.createElement('a');open.href=link.signedUrl;open.target='_blank';open.rel='noopener noreferrer';open.textContent='View original photo';open.style.display='block';
   proof.querySelector('p')?.remove();proof.append(img,open);
  }
 }
}
const form=card.querySelector('form');
form.onsubmit=async e=>{e.preventDefault();const action=form.elements.action.value;const {error}=await db.rpc(action==='propose'?'aftersales_seller_propose_v2':'aftersales_seller_respond',action==='propose'?{p_case_id:n.case_id,p_solution_kind:form.elements.solutionKind.value,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value}:{p_case_id:n.case_id,p_action:action,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value});if(error){form.querySelector('[role=status]').textContent=error.message;return;}await load();};
}
attachOrderLinks();
if(!data?.length)el.textContent='No Aftersales cases assigned.';
}
section.querySelector('#sellerAftersalesRefresh').onclick=load;
load();
})();
(() => {
'use strict';
const db=window.leogoPartnerClient;
const orders=document.querySelector('[data-seller-content="orders"]');
if(!db||!orders)return;
const section=document.createElement('section');section.className='panel';section.innerHTML='<h3>Aftersales cases sent by LEOGO</h3><p>Review your assigned cases, propose solutions or reject with a reason.</p><button id="sellerAftersalesRefresh" type="button">Refresh Cases</button><div id="sellerAftersalesNegotiations"></div>';orders.append(section);
const el=section.querySelector('#sellerAftersalesNegotiations');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function load(){
const {data,error}=await db.rpc('aftersales_list_negotiations');
if(error){el.textContent=error.message;return;}
el.replaceChildren();
for(const n of data||[]){
const field=(label,value)=>'<div style="margin:8px 0"><strong>'+esc(label)+':</strong> '+esc(value===null||value===undefined||value===''?'Not provided':value)+'</div>';
const formatDate=value=>value?new Date(value).toLocaleString('en-KE'):'Not provided';
const history=Array.isArray(n.history)?n.history:[];
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
  '<p style="font-size:12px">Customer evidence is protected and should be viewed through an authorized case-evidence link.</p>'+
  '</section>';
const caseHistory=history.length?'<details style="margin:12px 0"><summary>Case activity history ('+history.length+')</summary>'+
  history.map(e=>'<div style="border-bottom:1px solid #ddd;padding:8px 0">'+field('Time',formatDate(e.created_at))+field('Action',e.event_type)+field('By',e.actor_role)+(e.comment?field('Comment',e.comment):'')+'</div>').join('')+'</details>':'';
const card=document.createElement('article');card.className='panel';card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Status: '+esc(n.stage)+'</p>'+customerReport+caseHistory+'<p>Previous solution: '+esc(n.seller_solution||'None')+'</p><form><label>Action <select name="action"><option value="review">Start Review</option><option value="propose">Propose Solution</option><option value="reject">Reject Complaint</option></select></label><label>Solution type <select name="solutionKind"><option value="return_refund">Return and refund</option><option value="return_exchange">Return and exchange</option><option value="replacement">Replacement</option><option value="other">Other agreed solution</option></select></label><label>Solution <textarea name="solution" maxlength="2000"></textarea></label><label>Comments / rejection reason <textarea name="comment" maxlength="2000"></textarea></label><button type="submit">Submit Seller Response</button><p role="status"></p></form>';el.append(card);
const form=card.querySelector('form');
form.onsubmit=async e=>{e.preventDefault();const action=form.elements.action.value;const {error}=await db.rpc(action==='propose'?'aftersales_seller_propose_v2':'aftersales_seller_respond',action==='propose'?{p_case_id:n.case_id,p_solution_kind:form.elements.solutionKind.value,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value}:{p_case_id:n.case_id,p_action:action,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value});if(error){form.querySelector('[role=status]').textContent=error.message;return;}await load();};
}
if(!data?.length)el.textContent='No Aftersales cases assigned.';
}
section.querySelector('#sellerAftersalesRefresh').onclick=load;
load();
})();
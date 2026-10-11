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
const card=document.createElement('article');card.className='panel';card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Status: '+esc(n.stage)+'</p><p>Previous solution: '+esc(n.seller_solution||'None')+'</p><form><label>Action <select name="action"><option value="review">Start Review</option><option value="propose">Propose Solution</option><option value="reject">Reject Complaint</option></select></label><label>Solution <textarea name="solution" maxlength="2000"></textarea></label><label>Comments / rejection reason <textarea name="comment" maxlength="2000"></textarea></label><button type="submit">Submit Seller Response</button><p role="status"></p></form>';el.append(card);
const form=card.querySelector('form');
form.onsubmit=async e=>{e.preventDefault();const {error}=await db.rpc('aftersales_seller_respond',{p_case_id:n.case_id,p_action:form.elements.action.value,p_solution:form.elements.solution.value,p_comment:form.elements.comment.value});if(error){form.querySelector('[role=status]').textContent=error.message;return;}await load();};
}
if(!data?.length)el.textContent='No Aftersales cases assigned.';
}
section.querySelector('#sellerAftersalesRefresh').onclick=load;
load();
})();
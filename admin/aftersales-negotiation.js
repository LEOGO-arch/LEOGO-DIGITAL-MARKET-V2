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
  <section class="aftersales-negotiation-intervention" id="aftersalesIntervention" hidden><h4>LEOGO Intervention</h4><p>This case requires LEOGO Customer Care review. Review the seller response and customer comments, then use the existing <strong>Update the case</strong> section above to record the decision and notify the customer.</p></section>`;
detail.insertAdjacentElement('afterend',root);
const $=s=>root.querySelector(s);
const form=$('#aftersalesForwardForm');
const status=$('#aftersalesNegotiationAdminStatus');
const sellerSelect=form.elements.seller;
let selected=null;
let loadToken=0;
let negotiations=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageLabel=x=>String(x||'Not forwarded').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase());
const signal=(message,bad=false)=>{status.textContent=message;status.classList.toggle('is-error',bad);};
const activeRecord=()=>negotiations.find(x=>x.case_id===selected?.case_id);
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
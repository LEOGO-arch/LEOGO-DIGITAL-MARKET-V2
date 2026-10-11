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
if(error){el.textContent=error.message;return;}
el.replaceChildren();
for(const n of data||[]){
const card=document.createElement('article');card.className='aftersales-case-card';card.innerHTML='<h4>'+esc(n.case_reference)+'</h4><p>Seller status: '+esc(n.stage.replaceAll('_',' '))+'</p><p>Proposed solution: '+esc(n.seller_solution||'Awaiting seller')+'</p><p>Seller comment: '+esc(n.seller_comment||'—')+'</p>'+(n.response_due_at?'<p>Respond by: '+esc(new Date(n.response_due_at).toLocaleString('en-KE'))+'</p>':'')+'<form><label>Your feedback <textarea name="comment" maxlength="2000"></textarea></label><div></div><p role="status"></p></form>';el.append(card);
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
  if(!error)await load();
 };
}

}
if(!data?.length)el.textContent='No cases have been forwarded to a seller yet.';
}
section.querySelector('#customerAftersalesRefresh').onclick=load;
document.addEventListener('leogo:authchange',load);load();
})();
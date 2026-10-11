(() => {
'use strict';
const db=window.leogoAdminDb;
const panel=document.querySelector('[data-admin-panel="aftersales"]');
if(!db||!panel)return;
const wrap=document.createElement('section');
wrap.className='content-card';
wrap.innerHTML='<h3>Forward to Seller & LEOGO Intervention</h3><p>Choose the responsible seller for an existing case. Seller responses and customer decisions appear below.</p><div id="aftersalesNegotiationAdmin"></div><button type="button" id="aftersalesNegotiationRefresh">Refresh seller cases</button>';
panel.append(wrap);
const caseDetail=document.getElementById('adminAftersalesDetail');
if(caseDetail){const useCase=document.createElement('button');useCase.type='button';useCase.textContent='Forward this case to seller';caseDetail.append(useCase);useCase.onclick=()=>{const caseId=document.querySelector('#adminAftersalesDetail [data-case-id]')?.dataset.caseId || document.querySelector('[data-open-aftersales-case].admin-order-row-active')?.dataset.openAftersalesCase || document.querySelector('.admin-order-row-active [data-open-aftersales-case]')?.dataset.openAftersalesCase;const field=wrap.querySelector('input[name=case]');if(caseId&&field)field.value=caseId;wrap.scrollIntoView({behavior:'smooth'});};}
const list=wrap.querySelector('#aftersalesNegotiationAdmin');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function load(){
const {data,error}=await db.rpc('aftersales_list_negotiations');
if(error){list.textContent=error.message;return;}
const records=Array.isArray(data)?data:[];
list.innerHTML='<form id="aftersalesForwardForm"><label>Case UUID <input name="case" required placeholder="Select an Aftersales case ID"></label><button type="button" id="aftersalesLookupSeller">Find Sellers</button><label>Seller <select name="seller" required><option value="">Find sellers first</option></select></label><label>Note <textarea name="comment" maxlength="2000"></textarea></label><button type="submit">Forward case</button></form><div id="aftersalesNegotiationAdminStatus"></div>'+records.map(n=>'<article class="content-card"><strong>'+esc(n.case_reference)+'</strong> · '+esc(n.stage)+'<p>Seller: '+esc(n.seller_id)+'</p><p>Seller solution: '+esc(n.seller_solution||'—')+'</p><p>Customer response: '+esc(n.customer_comment||'—')+'</p><details><summary>Case history</summary>'+((n.history||[]).map(e=>'<p>'+esc(e.actor_role)+' — '+esc(e.event_type)+' — '+esc(e.comment||'')+'</p>').join(''))+'</details></article>').join('');
const form=list.querySelector('#aftersalesForwardForm'), status=list.querySelector('#aftersalesNegotiationAdminStatus');
list.querySelector('#aftersalesLookupSeller').onclick=async()=>{
const {data,error}=await db.rpc('aftersales_order_sellers',{p_case_id:form.elements.case.value.trim()});
if(error){status.textContent=error.message;return;}
form.elements.seller.innerHTML=(data||[]).map(s=>'<option value="'+esc(s.seller_id)+'">'+esc(s.seller_id)+'</option>').join('');
if(!data?.length)status.textContent='No eligible sellers on this order.';
};
form.onsubmit=async e=>{e.preventDefault();const {error}=await db.rpc('aftersales_forward_to_seller',{p_case_id:form.elements.case.value.trim(),p_seller_id:form.elements.seller.value,p_comment:form.elements.comment.value});if(error){status.textContent=error.message;return;}await load();};
}
wrap.querySelector('#aftersalesNegotiationRefresh').onclick=load;
load();
})();
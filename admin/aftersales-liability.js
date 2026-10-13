(() => {
'use strict';
const db=window.leogoAdminDb;
const panel=document.querySelector('[data-admin-panel="aftersales"]');
if(!db||!panel)return;
const section=document.createElement('section');section.className='content-card';section.hidden=true;
section.innerHTML='<div class="card-head"><div><span>ADMIN FINANCIAL CONTROL</span><h3>Aftersales Liability Assessments</h3><p>Assess responsibility using documented evidence. Approval records liability only; no payout deduction is applied until settlement recovery is verified.</p></div></div>'+
'<form id="aftersalesLiabilityAssessment" class="settings-form" style="display:grid;gap:10px">'+
'<label>Verified responsible party <select name="candidate" required></select></label>'+
'<label>Reason <select name="reason"><option value="return_station_commission">Pickup Station return commission</option><option value="transport_damage">Transport damage</option><option value="total_loss">Total parcel loss</option><option value="station_damage">Damage at Pickup Station</option><option value="station_loss">Lost at Pickup Station</option><option value="other">Other verified liability</option></select></label>'+
'<label>Liability amount (KSh) <input type="number" name="amount" step="0.01" min="0.01" required></label>'+
'<label>Verified parcel value (KSh, required for loss or station damage) <input type="number" name="parcelValue" step="0.01" min="0"></label>'+
'<label>Evidence and findings <textarea name="evidence" required minlength="15" maxlength="3000"></textarea></label>'+
'<button type="submit">Record Pending Assessment</button><p id="liabilityFormStatus" role="status"></p></form>'+
'<h4>Assessments and decisions</h4><div id="liabilityAssessmentList"></div>';
const host=document.getElementById('aftersalesNegotiationPanel');(host?.parentElement||panel).append(section);
let caseId=null,candidates=[];
const form=section.querySelector('form'),status=section.querySelector('#liabilityFormStatus'),list=section.querySelector('#liabilityAssessmentList');
function optionList(){form.elements.candidate.replaceChildren(new Option('Select a verified case party',''));candidates.forEach((c,i)=>form.elements.candidate.add(new Option(c.label,i.toString())));}
async function refresh(){
 if(!caseId)return;
 const [persons,assessments]=await Promise.all([db.rpc('admin_aftersales_liability_candidates',{p_case_id:caseId}),db.rpc('admin_list_aftersales_liabilities')]);
 status.textContent=persons.error?.message||assessments.error?.message||'';
 candidates=Array.isArray(persons.data)?persons.data:[];optionList();list.replaceChildren();
 const rows=(Array.isArray(assessments.data)?assessments.data:[]).filter(x=>x.aftersales_case_id===caseId);
 if(!rows.length){list.textContent='No liability assessments recorded for this case.';return;}
 for(const row of rows){
  const card=document.createElement('div');card.style.cssText='padding:12px;border:1px solid #dbe2eb;border-radius:10px;margin:10px 0';
  const head=document.createElement('strong');head.textContent=row.liability_type+' · '+row.charge_reason+' · KSh '+Number(row.assessed_amount_kes).toLocaleString('en-KE')+' · '+row.status;
  const details=document.createElement('p');details.textContent=row.evidence_notes;
  card.append(head,details);
  const actions=row.status==='pending_review'?['approve','reject']:row.status==='approved'?['reverse']:[];
  for(const action of actions){const btn=document.createElement('button');btn.type='button';btn.textContent=action==='approve'?'Approve Finding (No Debit)':action[0].toUpperCase()+action.slice(1);btn.style.marginRight='8px';btn.onclick=async()=>{
   const notes=window.prompt('Record documented reason for '+action+' (minimum 10 characters)');if(!notes||notes.trim().length<10)return;
   btn.disabled=true;const res=await db.rpc('admin_decide_aftersales_liability',{p_id:row.id,p_action:action,p_notes:notes.trim()});btn.disabled=false;
   if(res.error)status.textContent=res.error.message;else await refresh();
  };card.append(btn);}
  list.append(card);
 }
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!form.reportValidity()||!caseId)return;
 const c=candidates[Number(form.elements.candidate.value)];if(!c){status.textContent='Select a verified responsible party';return;}
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 const value=form.elements.parcelValue.value;
 const res=await db.rpc('admin_create_aftersales_liability',{
  p_case_id:caseId,p_return_id:c.return_id||null,p_party:c.party,p_account:c.id,
  p_reason:form.elements.reason.value,p_amount:Number(form.elements.amount.value),
  p_parcel_value:value?Number(value):null,p_evidence:form.elements.evidence.value.trim()
 });button.disabled=false;
 status.textContent=res.error?.message||'Assessment recorded for Admin review. No funds deducted.';
 if(!res.error){form.reset();await refresh();}
});
document.addEventListener('leogo:admin-aftersales-case-selected',e=>{caseId=e.detail?.case_id||null;section.hidden=!caseId;if(caseId)refresh();});
})();
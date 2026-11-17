// LEOGO Return, Refund & Exchange Policy — Admin System Settings editor.
(() => {
 'use strict';
 const db=window.leogoAdminDb;
 const host=document.getElementById('adminReturnPolicyEditor');
 if(!db||!host)return;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 let version=null;
 const status=host.querySelector('#returnPolicyStatus');
 const setStatus=(m,error=false)=>{status.textContent=m;status.style.color=error?'#b4232c':'#176437';};
 const fields=host.querySelector('#returnPolicySections');
 const show=doc=>{
   version=doc.version;
   host.querySelector('#returnPolicyEffectiveDate').value=doc.effective_date;
   host.querySelector('#returnPolicyIntroduction').value=doc.introduction;
   host.querySelector('#returnPolicySummary').value=doc.summary;
   fields.innerHTML=(doc.sections||[]).map((s,i)=>'<fieldset class="policy-edit-section"><legend>Section '+(i+1)+'</legend><label>Heading <input data-policy-heading="'+i+'" maxlength="180" required value="'+esc(s.heading)+'"></label><label>Terms <textarea data-policy-body="'+i+'" rows="7" maxlength="12000" required>'+esc(s.body)+'</textarea></label></fieldset>').join('');
   host.querySelector('#returnPolicyVersion').textContent='Published version '+version;
   setStatus('Current published wording loaded.');
 };
 const load=async()=>{
   setStatus('Loading policy…');
   const {data,error}=await db.rpc('public_get_return_refund_policy');
   if(error||!data){setStatus(error?.message||'Unable to load policy.',true);return;}
   show(data);
 };
 host.querySelector('#returnPolicyReload').addEventListener('click',()=>void load());
 host.querySelector('#returnPolicyForm').addEventListener('submit',async e=>{
   e.preventDefault();
   if(version===null){setStatus('Load the published policy first.',true);return;}
   const sections=[...fields.querySelectorAll('.policy-edit-section')].map((section,i)=>({
     heading:section.querySelector('[data-policy-heading]').value.trim(),
     body:section.querySelector('[data-policy-body]').value.trim()
   }));
   if(sections.length!==8){setStatus('All eight sections are required.',true);return;}
   if(!confirm('Publish these Return, Refund & Exchange Policy changes to LEOGO customers now?'))return;
   const button=host.querySelector('#returnPolicySave');
   button.disabled=true;setStatus('Publishing updated policy…');
   const {data,error}=await db.rpc('admin_update_return_refund_policy',{
     p_effective_date:host.querySelector('#returnPolicyEffectiveDate').value,
     p_introduction:host.querySelector('#returnPolicyIntroduction').value.trim(),
     p_summary:host.querySelector('#returnPolicySummary').value.trim(),
     p_sections:sections,p_expected_version:version
   });
   button.disabled=false;
   if(error){setStatus(error.message,true);return;}
   version=data.version;
   host.querySelector('#returnPolicyVersion').textContent='Published version '+version;
   setStatus('Policy published. The previous version was retained for audit.');
 });
 const tab=document.querySelector('#settingsTabs [data-settings-panel="returnpolicy"]');
 tab?.addEventListener('click',()=>void load());
})();

// LEOGO Admin — publishable Return, Refund & Exchange Policy editor.
(()=>{
 'use strict';
 const db=window.leogoAdminDb;
 const root=document.querySelector('[data-settings-content="returnpolicy"]');
 if(!db||!root)return;
 const $=id=>document.getElementById(id);
 let current=null,loading=false;
 const notice=(message,isError=false)=>{
   const target=$('returnPolicyAdminStatus');
   target.textContent=message;
   target.style.color=isError?'#b42318':'#14532d';
 };
 const fields=()=>({
   p_title:$('returnPolicyTitle').value.trim(),
   p_effective_date:$('returnPolicyEffectiveDate').value,
   p_applicability:$('returnPolicyApplicability').value.trim(),
   p_summary:$('returnPolicySummary').value.trim(),
   p_body:$('returnPolicyBody').value.trim()
 });
 const fill=data=>{
   current=data;
   $('returnPolicyTitle').value=data.draft_title||'';
   $('returnPolicyEffectiveDate').value=data.draft_effective_date||'';
   $('returnPolicyApplicability').value=data.draft_applicability||'';
   $('returnPolicySummary').value=data.draft_summary||'';
   $('returnPolicyBody').value=data.draft_body||'';
   $('returnPolicyVersion').textContent='Published version '+data.publication_version+
     ' · Draft revision '+data.draft_version+(data.has_unpublished_changes?' · Unpublished changes':' · Draft matches published policy');
 };
 const load=async()=>{
   if(loading)return;
   loading=true;notice('Loading current policy…');
   try{
     const {data,error}=await db.rpc('admin_get_return_policy');
     if(error)throw error;
     if(!data)throw Error('Policy record unavailable.');
     fill(data);notice('Policy loaded. Save a draft before publishing.');
   }catch(e){notice(e.message||'Unable to load policy.',true);}
   finally{loading=false;}
 };
 const save=async()=>{
   if(!current)throw Error('Reload the current policy first.');
   if(!$('returnPolicyAdminForm').reportValidity())throw Error('Complete all required policy fields.');
   const {data,error}=await db.rpc('admin_save_return_policy_draft',{
     ...fields(),p_expected_version:current.draft_version
   });
   if(error)throw error;
   current.draft_version=Number(data);
   current.has_unpublished_changes=true;
   $('returnPolicyVersion').textContent='Published version '+current.publication_version+
     ' · Draft revision '+current.draft_version+' · Saved; not yet published';
 };
 $('returnPolicyAdminForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const button=$('returnPolicySaveDraft');button.disabled=true;
   try{await save();notice('Draft saved. Customers still see the previously published policy.');}
   catch(err){notice(err.message||'Could not save draft.',true);}
   finally{button.disabled=false;}
 });
 $('returnPolicyPublish').addEventListener('click',async()=>{
   if(!current){notice('Load the current policy first.',true);return;}
   if(!$('returnPolicyAdminForm').reportValidity())return;
   if(!confirm('Publish the currently displayed policy to all LEOGO customers? This replaces the public policy immediately and retains the previous version in history.'))return;
   const button=$('returnPolicyPublish');button.disabled=true;
   try{
     await save();
     const {data,error}=await db.rpc('admin_publish_return_policy',{p_expected_draft_version:current.draft_version});
     if(error)throw error;
     await load();
     notice('Published version '+data+' successfully. The public policy page will load this version.');
   }catch(err){notice(err.message||'Could not publish policy.',true);}
   finally{button.disabled=false;}
 });
 $('returnPolicyReload').addEventListener('click',()=>{if(!current||confirm('Discard any unsaved edits and reload the latest draft?'))void load();});
 $('returnPolicyPreview').addEventListener('click',()=>{
   const f=fields(),target=$('returnPolicyPreviewBox');
   target.hidden=!target.hidden;
   if(!target.hidden)target.textContent=f.p_title+'\nEffective date: '+f.p_effective_date+
     '\n'+f.p_applicability+'\n\nAt a glance: '+f.p_summary+'\n\n'+f.p_body;
 });
 document.querySelector('[data-settings-panel="returnpolicy"]')?.addEventListener('click',()=>void load());
})();

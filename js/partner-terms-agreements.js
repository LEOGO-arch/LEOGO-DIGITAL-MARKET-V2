(() => {
'use strict';
const isAdmin=location.pathname.includes('/admin/');
const db=()=>isAdmin?window.leogoAdminDb:window.leogoPartnerClient;
const parent=isAdmin?document.querySelector('[data-settings-content="fees"]'):document.getElementById('sellerDashboard');
if(!parent)return;
const section=document.createElement('section');
section.className='leogo-terms-panel';
section.style.cssText='background:#fff;border:1px solid #dbe3ef;border-radius:16px;padding:18px;margin:18px 0;box-shadow:0 6px 18px #07152f0a';
const head=document.createElement('h3');head.textContent=isAdmin?'Partner Terms & Agreements':'Seller Terms & Responsibilities';
head.style.cssText='color:#071b3d;margin:0 0 6px';
const desc=document.createElement('p');desc.textContent=isAdmin?'Publish updated terms for any partner category. Each publication creates a new version and retains prior acceptances.':'Review LEOGO and seller obligations. Your acceptance is saved with the terms version and date.';
desc.style.cssText='font-size:13px;color:#53677c;line-height:1.5';
const editor=document.createElement('textarea');editor.rows=isAdmin?17:13;editor.readOnly=!isAdmin;
editor.style.cssText='display:block;width:100%;box-sizing:border-box;font:13px/1.65 Arial,sans-serif;padding:13px;border:1px solid #d5dfec;border-radius:10px;resize:vertical;background:#fafbfd;color:#152944';
const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:13px;color:#294767;line-height:1.5';
const button=document.createElement('button');button.type='button';button.className='primary-button';
button.textContent=isAdmin?'Publish New Terms Version':'I have read and accept these terms';
button.style.cssText='background:#ff7900;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-weight:bold;min-height:44px';
const version=document.createElement('p');version.style.cssText='font-size:12px;font-weight:700;color:#64748b';
const type=document.createElement('select');
if(isAdmin){
 type.style.cssText='width:100%;max-width:430px;padding:12px;margin:10px 0;border-radius:10px;border:1px solid #cbd5e1';
 for(const [v,n] of [['seller','Seller'],['service_provider','Service Provider'],['transport','Transport / Courier'],['pickup_station','Pickup Station'],['accommodation','Accommodation'],['cyber','Cyber Services'],['premium','Premium Partner']])type.add(new Option(n,v));
}
section.append(head,desc);
if(isAdmin)section.append(type);
section.append(version,editor,button,status);
if(isAdmin)parent.prepend(section);else parent.append(section);
let current=null;
async function load(){
 const client=db();if(!client){status.textContent='Sign in to view partner terms.';return;}
 const {data:{session},error:sessionError}=await client.auth.getSession();
 if(sessionError||!session){status.textContent='Sign in to view these terms.';return;}
 const partnerType=isAdmin?type.value:'seller';
 const {data,error}=await client.rpc('leogo_get_partner_terms',{p_partner_type:partnerType});
 if(error){status.textContent=error.message;return;}
 current=data||null;
 editor.value=current?.terms_text||'No terms have been published for this partner category.';
 editor.readOnly=!isAdmin;
 version.textContent=current?'Version '+current.version+' · Effective '+new Date(current.effective_at).toLocaleDateString('en-KE'):'No published version';
 if(isAdmin){button.disabled=false;status.textContent='Edits will be published as a new version; the previous version remains in the record.';}
 else {button.disabled=!current||!!current.accepted;button.textContent=current?.accepted?'Accepted ✓':'I have read and accept these terms';status.textContent=current?.accepted?'This version has been accepted on your account.':'Please review this agreement before accepting.';}
}
type.addEventListener('change',load);
button.addEventListener('click',async()=>{
 const client=db();if(!client||!current&&!isAdmin)return;
 if(isAdmin&&!confirm('Publish a new '+type.options[type.selectedIndex].text+' terms version? Existing acceptances will remain tied to their original version.'))return;
 button.disabled=true;status.textContent='Saving…';
 try{
 const result=isAdmin?await client.rpc('leogo_admin_publish_partner_terms',{p_partner_type:type.value,p_terms:editor.value}):await client.rpc('leogo_accept_partner_terms',{p_partner_type:'seller',p_version:current.version});
 if(result.error)throw result.error;
 status.textContent=isAdmin?'New terms version published.':'Terms accepted.';
 await load();
 }catch(error){status.textContent='Unable to save: '+(error.message||String(error));button.disabled=false;}
});
const client=db();
client?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_IN')setTimeout(load,300)});
load();
})();
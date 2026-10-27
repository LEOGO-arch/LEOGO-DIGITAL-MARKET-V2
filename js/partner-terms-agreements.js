(() => {
'use strict';
const isAdmin=location.pathname.includes('/admin/');
const db=()=>isAdmin?window.leogoAdminDb:window.leogoPartnerClient;
const adminParent=document.querySelector('[data-settings-content="agreements"]');
const targets=isAdmin?[['admin',adminParent]]:[['seller',document.getElementById('sellerDashboard')],['service_provider',document.getElementById('providerShell')]];
for(const [panelType,parent] of targets){
if(!parent)continue;
const section=document.createElement('section');
section.className='leogo-terms-panel';
section.style.cssText='background:#fff;border:1px solid #dbe3ef;border-radius:16px;padding:18px;margin:18px 0;box-shadow:0 6px 18px #07152f0a';
const head=document.createElement('h3');head.textContent=isAdmin?'Partner Terms & Agreements':panelType==='seller'?'Seller Agreement':'Service Provider Agreement';
head.style.cssText='color:#071b3d;margin:0 0 6px';
const desc=document.createElement('p');desc.textContent=isAdmin?'Edit the agreement below, then save and publish it to the selected partner portal. Every change creates a new version; earlier signed versions remain unchanged.':panelType==='seller'?'Review the current LEOGO Seller Agreement. You must accept each new version.':'Review the latest LEOGO Service Provider Agreement. New versions are shown here automatically.';
desc.style.cssText='font-size:13px;color:#53677c;line-height:1.5';
const editor=document.createElement('textarea');editor.rows=isAdmin?17:13;editor.readOnly=!isAdmin;
editor.style.cssText='display:block;width:100%;box-sizing:border-box;font:13px/1.65 Arial,sans-serif;padding:13px;border:1px solid #d5dfec;border-radius:10px;resize:vertical;background:#fafbfd;color:#152944';
const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:13px;color:#294767;line-height:1.5';
const button=document.createElement('button');button.type='button';button.className='primary-button';
button.textContent=isAdmin?'Save & Publish New Version':'I have read and accept these terms';
button.style.cssText='background:#ff7900;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-weight:bold;min-height:44px';
const download=document.createElement('button');download.type='button';download.className='primary-button';download.textContent='Download Agreement PDF';
download.style.cssText='background:#071b3d;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-weight:bold;min-height:44px;margin-left:8px';
const version=document.createElement('p');version.style.cssText='font-size:12px;font-weight:700;color:#64748b';
const type=document.createElement('select');
if(isAdmin){
 type.style.cssText='width:100%;max-width:430px;padding:12px;margin:10px 0;border-radius:10px;border:1px solid #cbd5e1';
 for(const [v,n] of [['seller','Seller'],['service_provider','Service Provider'],['transport','Transport / Courier'],['pickup_station','Pickup Station'],['accommodation','Accommodation'],['cyber','Cyber Services'],['premium','Premium Partner']])type.add(new Option(n,v));
}
section.append(head,desc);
if(isAdmin)section.append(type);
section.append(version,editor,button,download,status);
if(isAdmin)parent.prepend(section);else parent.append(section);
let current=null,loadToken=0,saving=false;
async function load(){
 const token=++loadToken;
 if(saving)return;
 const client=db();if(!client){status.textContent='Sign in to view partner terms.';return;}
 const {data:{session},error:sessionError}=await client.auth.getSession();
 if(sessionError||!session){current=null;editor.value='';download.disabled=true;status.textContent='Sign in to view these terms.';return;}
 const partnerType=isAdmin?type.value:panelType;
 const {data,error}=await client.rpc('leogo_get_partner_terms',{p_partner_type:partnerType});
 if(token!==loadToken)return;
 if(error){status.textContent=error.message;return;}
 const previousVersion=current?.version;
 current=data||null;
 editor.value=current?.terms_text||'No terms have been published for this partner category.';
 editor.readOnly=!isAdmin;
 version.textContent=current?'Version '+current.version+' · Effective '+new Date(current.effective_at).toLocaleDateString('en-KE'):'No published version';
 download.disabled=!current;
 if(isAdmin){button.disabled=false;status.textContent='Edits publish a new version. PDF downloads use the latest published version, not unsaved edits.';}
 else if(panelType==='seller'){button.disabled=!current||!!current.accepted;button.textContent=current?.accepted?'Accepted ✓':'I have read and accept these terms';status.textContent=previousVersion&&previousVersion!==current?.version?'LEOGO has published a new agreement. Please review and accept version '+current.version+'.':current?.accepted?'This version has been accepted on your account.':'Please review this agreement before accepting.';}
 else {button.hidden=true;status.textContent=previousVersion&&previousVersion!==current?.version?'LEOGO has published Service Provider Agreement version '+current.version+'. Please review the changes.':current?'Read and download the current Service Provider agreement. Electronic acceptance will be enabled after its registration checks are verified.':'No Service Provider agreement has been published yet.';}
}
if(isAdmin)type.addEventListener('change',load);
button.addEventListener('click',async()=>{
 const client=db();if(!client||!current&&!isAdmin)return;
 if(isAdmin&&!confirm('Publish a new '+type.options[type.selectedIndex].text+' terms version? Existing acceptances will remain tied to their original version.'))return;
 button.disabled=true;saving=true;status.textContent=isAdmin?'Publishing new version…':'Saving acceptance…';
 try{
 const result=isAdmin?await client.rpc('leogo_admin_publish_partner_terms',{p_partner_type:type.value,p_terms:editor.value}):await client.rpc('leogo_accept_partner_terms',{p_partner_type:panelType,p_version:current.version});
 if(result.error)throw result.error;
 status.textContent=isAdmin?'New terms version published.':'Terms accepted.';
  saving=false;
  await load();
 }catch(error){saving=false;status.textContent='Unable to save: '+(error.message||String(error));button.disabled=false;}
});
download.addEventListener('click',async()=>{
 if(!current)return;
 const jsPDF=window.jspdf?.jsPDF;
 if(!jsPDF){status.textContent='PDF generator is unavailable. Please reconnect and try again.';return;}
 download.disabled=true;
 try{
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const label=isAdmin?type.options[type.selectedIndex].text:panelType==='seller'?'Seller':'Service Provider';
  let y=19;
  const logo=new Image();logo.src='../assets/images/leogo-official-logo.jpg';
  try{await new Promise((resolve,reject)=>{logo.onload=resolve;logo.onerror=reject;if(logo.complete&&logo.naturalWidth)resolve();});
   const canvas=document.createElement('canvas');canvas.width=logo.naturalWidth;canvas.height=logo.naturalHeight;canvas.getContext('2d').drawImage(logo,0,0);pdf.addImage(canvas.toDataURL('image/jpeg',.88),'JPEG',82,11,46,46);y=62;
  }catch(_){/* The agreement remains downloadable if its decorative logo fails. */}
  pdf.setTextColor(7,27,61);pdf.setFont('helvetica','bold');pdf.setFontSize(14);
  pdf.text('LEOGO DIGITAL MARKET',105,y,{align:'center'});y+=8;
  pdf.setFontSize(11);pdf.text(label+' Partner Agreement',105,y,{align:'center'});y+=7;
  pdf.setFontSize(9);pdf.setFont('helvetica','normal');pdf.text('Version '+current.version+'  |  Effective '+new Date(current.effective_at).toLocaleDateString('en-KE'),105,y,{align:'center'});y+=10;
  pdf.setDrawColor(255,121,0);pdf.setLineWidth(.8);pdf.line(15,y,195,y);y+=8;
  pdf.setFontSize(9.5);pdf.setTextColor(24,39,62);
  const paragraphs=String(current.terms_text||'').split(/\n/);
  for(const paragraph of paragraphs){
   const lines=pdf.splitTextToSize(paragraph||' ',178);
   for(const line of lines){if(y>279){pdf.addPage();y=18;}pdf.text(line,16,y);y+=5.2;}
   y+=paragraph?2:1;
  }
  pdf.save('LEOGO-'+panelType+'-agreement-v'+current.version+'.pdf');
  status.textContent='Published agreement PDF downloaded.';
 }catch(error){status.textContent='PDF download failed: '+(error.message||String(error));}
 finally{download.disabled=false;}
});
const client=db();
client?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_IN')setTimeout(load,300)});
if(!isAdmin){
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 window.addEventListener('focus',()=>{if(!document.hidden)load();});
 setInterval(()=>{if(!document.hidden)load();},60000);
}
load();
}
})();

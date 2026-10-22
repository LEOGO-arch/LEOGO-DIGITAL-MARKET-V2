(() => {
'use strict';
const form=document.getElementById('aftersalesStationCommissionSettingsForm');
const db=window.leogoAdminDb;
if(!form||!db)return;
const field=form.elements.amount;
const status=document.getElementById('aftersalesStationCommissionSettingsStatus');
const save=form.querySelector('button[type="submit"]');
if(!field||!status||!save)return;
let generation=0,loaded=false,saving=false;
const message=error=>String(error?.message||'Connection failed. Please try again.');
save.disabled=true;
async function load(){
 const request=++generation;
 loaded=false;save.disabled=true;
 try{
  const {data:sessionData,error:sessionError}=await db.auth.getSession();
  if(request!==generation)return;
  if(sessionError)throw sessionError;
  if(!sessionData?.session){field.value='';status.textContent='Sign in to load the current commission.';return;}
  status.textContent='Loading current commission…';
  const {data,error}=await db.rpc('admin_aftersales_station_fee');
  if(request!==generation)return;
  if(error)throw error;
  if(data?.amount_kes==null||!Number.isFinite(Number(data.amount_kes)))throw new Error('Current commission is unavailable for this account.');
  field.value=data.amount_kes;loaded=true;save.disabled=saving;
  status.textContent='Current commission loaded.';
 }catch(error){
  if(request!==generation)return;
  status.textContent='Could not load Aftersales commission: '+message(error)+ ' Reopen Fees & Charges to retry.';
 }
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!loaded||saving||!form.reportValidity())return;
 saving=true;save.disabled=true;status.textContent='Saving Aftersales commission…';
 const request=generation;
 try{
  const {error}=await db.rpc('admin_set_aftersales_station_fee',{p_amount:Number(field.value)});
  if(request!==generation)return;
  status.textContent=error?'Not saved: '+message(error):'Commission updated for future completed returns.';
 }catch(error){if(request===generation)status.textContent='Unable to save: '+message(error);}
 finally{saving=false;save.disabled=!loaded;}
});
document.querySelectorAll('#settingsTabs [data-settings-panel="fees"]').forEach(button=>button.addEventListener('click',()=>{if(!saving)load();}));
// Defer work out of the auth callback; never make database calls while auth holds its lock.
db.auth.onAuthStateChange(event=>{
 if(event==='SIGNED_OUT'){++generation;loaded=false;field.value='';save.disabled=true;status.textContent='Sign in to load the current commission.';}
 else if(event==='SIGNED_IN')window.setTimeout(()=>{if(!saving)load();},0);
});
load();
})();

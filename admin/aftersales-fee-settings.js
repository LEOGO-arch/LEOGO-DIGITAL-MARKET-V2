(() => {
'use strict';
const form=document.getElementById('aftersalesStationCommissionSettingsForm');
const db=window.leogoAdminDb;
if(!form||!db)return;
const field=form.elements.amount;
const status=document.getElementById('aftersalesStationCommissionSettingsStatus');
const save=form.querySelector('button[type="submit"]');
async function load(){
 const {data,error}=await db.rpc('admin_aftersales_station_fee');
 if(error){status.textContent='Could not load Aftersales commission: '+error.message;return;}
 if(data?.amount_kes!==undefined&&data?.amount_kes!==null){field.value=data.amount_kes;status.textContent='Current commission loaded.';}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 save.disabled=true;status.textContent='Saving Aftersales commission…';
 try{
  const {error}=await db.rpc('admin_set_aftersales_station_fee',{p_amount:Number(field.value)});
  status.textContent=error?'Not saved: '+error.message:'Commission updated for future completed returns.';
 }catch(error){status.textContent='Unable to save: '+(error.message||'Please retry');}
 finally{save.disabled=false;}
});
load();
})();
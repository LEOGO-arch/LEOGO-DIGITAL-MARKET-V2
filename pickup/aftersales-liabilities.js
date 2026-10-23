(() => {
'use strict';
const client=window.leogoPickupDb;
const root=document.getElementById('portal');
if(!client||!root)return;
const anchor=document.getElementById('availableBalance');
if(!anchor)return;
const box=document.createElement('section');
box.style.cssText='padding:14px;margin:12px 0;border:1px solid #d8e1eb;background:#fff;border-radius:14px';
box.innerHTML='<strong style="display:block;margin-bottom:9px">Aftersales Liability Account</strong><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><div><small>Approved deductions</small><strong style="display:block" id="afsStationApproved">KSh 0</strong></div><div><small>Pending review</small><strong style="display:block" id="afsStationPending">KSh 0</strong></div></div><details style="margin-top:10px"><summary>View case deductions</summary><div id="afsStationLiabilityRows"></div></details>';
const parent=anchor.closest('.stat-card')||anchor.parentElement;
parent?.after(box);
const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
async function refresh(){
 const sessionResult=await client.auth.getSession();
 if(sessionResult.error||!sessionResult.data?.session?.user?.id)return;

 const {data,error}=await client.rpc('partner_aftersales_liability_statement',{p_party:'pickup_station'});
 if(error){box.querySelector('#afsStationLiabilityRows').textContent='Unable to load liability account: '+error.message;return;}
 box.querySelector('#afsStationApproved').textContent=money(data?.approved_total_kes);
 box.querySelector('#afsStationPending').textContent=money(data?.pending_total_kes);
 const entries=box.querySelector('#afsStationLiabilityRows');entries.replaceChildren();
 for(const item of data?.records||[]){const row=document.createElement('p');row.style.cssText='border-bottom:1px solid #e0e5ee;padding:8px 0;font-size:12px';row.textContent=item.aftersales_number+' · '+item.reason.replaceAll('_',' ')+' · '+money(item.amount_kes)+' · '+item.status;entries.append(row);}
 if(!entries.childElementCount)entries.textContent='No Aftersales liability assessments.';
}
const safeRefresh=()=>refresh().catch(()=>{box.querySelector('#afsStationLiabilityRows').textContent='Unable to load liability account. Please retry.';});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)safeRefresh();});
root.querySelector('button[data-view="earnings"]')?.addEventListener('click',safeRefresh);
safeRefresh();
})();
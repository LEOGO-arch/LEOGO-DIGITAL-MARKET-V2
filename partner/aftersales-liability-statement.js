(()=>{
'use strict';
const db=window.leogoPartnerClient;if(!db)return;
const styles=document.createElement('style');styles.textContent='.afs-liability-panel{background:#fff;border:1px solid #dce4ef;border-radius:14px;padding:14px;margin:12px 0}.afs-liability-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.afs-liability-stat{background:#f6f8fc;border-radius:10px;padding:11px;min-width:0}.afs-liability-stat span{display:block;font-size:11px;color:#62748a}.afs-liability-stat strong{font-size:17px}.afs-liability-panel details{margin-top:9px}.afs-liability-panel summary{cursor:pointer;font-weight:600}';document.head.append(styles);
for(const [id,party] of [['sellerDashboard','seller'],['transportDashboard','transport_provider']]){
 const root=document.getElementById(id);if(!root)continue;
 const widget=document.createElement('section');widget.className='afs-liability-panel';
 widget.innerHTML='<h3>Aftersales Liability Account</h3><div class="afs-liability-stats"><div class="afs-liability-stat"><span>Approved deductions</span><strong data-total>—</strong></div><div class="afs-liability-stat"><span>Under Admin review</span><strong data-pending>—</strong></div></div><details><summary>View charge history</summary><div data-rows></div></details><p data-error role="status"></p>';
 let summary=null;
 if(party==='seller'){
  const overview=root.querySelector('[data-seller-content="overview"]');
  const approved=root.querySelector('#sellerApprovedArea');
  const nav=root.querySelector('#sellerSidebar nav');
  if(!overview||!approved||!nav)continue;
  summary=document.createElement('section');summary.className='afs-liability-panel';
  summary.innerHTML='<h3>Aftersales Liability Overview</h3><div class="afs-liability-stats"><div class="afs-liability-stat"><span>Approved deductions</span><strong data-summary-total>—</strong></div><div class="afs-liability-stat"><span>Under Admin review</span><strong data-summary-pending>—</strong></div></div><button type="button" class="secondary" data-liability-open>View Account</button>';
  overview.append(summary);
  const detail=document.createElement('section');detail.className='seller-view';detail.dataset.sellerContent='liability';detail.append(widget);approved.append(detail);
  const entry=document.createElement('button');entry.type='button';entry.dataset.sellerView='liability';entry.textContent='▤ Aftersales Liability Account';
  const aftersales=nav.querySelector('[data-seller-view="aftersales"]');if(aftersales)aftersales.after(entry);else nav.append(entry);
  summary.querySelector('[data-liability-open]').addEventListener('click',()=>entry.click());
  entry.addEventListener('click',()=>{
   root.querySelectorAll('[data-seller-content]').forEach(panel=>panel.classList.toggle('active',panel===detail));
   root.querySelectorAll('[data-seller-view]').forEach(button=>button.classList.toggle('active',button===entry));
   const description=root.querySelector('#sellerViewDescription');if(description)description.textContent='Aftersales liability charges and transaction history.';
   update();
  });
 }else root.prepend(widget);
 const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
 async function update(){
  if(root.hidden)return;
  const {data,error}=await db.rpc('partner_aftersales_liability_statement',{p_party:party});
  if(error){widget.querySelector('[data-error]').textContent=error.message;return;}
  widget.querySelector('[data-error]').textContent='';
  widget.querySelector('[data-total]').textContent=money(data?.approved_total_kes);
  widget.querySelector('[data-pending]').textContent=money(data?.pending_total_kes);
  if(summary){summary.querySelector('[data-summary-total]').textContent=money(data?.approved_total_kes);summary.querySelector('[data-summary-pending]').textContent=money(data?.pending_total_kes);}
  const rows=widget.querySelector('[data-rows]');rows.replaceChildren();
  for(const item of data?.records||[]){const row=document.createElement('p');row.style.cssText='font-size:12px;padding:8px 0;border-bottom:1px solid #ddd';row.textContent=item.aftersales_number+' · '+item.reason.replaceAll('_',' ')+' · '+money(item.amount_kes)+' · '+item.status;rows.append(row);}
  if(!rows.childElementCount)rows.textContent='No Aftersales liability records.';
 }
 const observer=new MutationObserver(()=>{if(!root.hidden)update();});observer.observe(root,{attributes:true,attributeFilter:['hidden','class']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
 if(!root.hidden)update();
}
})();
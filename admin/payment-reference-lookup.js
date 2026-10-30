// LEOGO Digital Market V2 — cross-module, read-only M-PESA transaction code lookup.
// The lookup is NOT a bank reconciliation service, and NEVER approves funds.
(() => {
 'use strict';
 const form=document.getElementById('paymentReferenceLookupForm');
 const input=document.getElementById('paymentReferenceLookupInput');
 const output=document.getElementById('paymentReferenceLookupResults');
 const button=document.getElementById('paymentReferenceLookupFetch');
 const acknowledgement=document.getElementById('paymentReferenceOfficialSource');
 const db=window.leogoAdminDb;
 if(!form||!input||!output||!db)return;
 const normalize=s=>String(s||'').toUpperCase().trim();
 const parseCode=s=>{
  const value=normalize(s);
  if(/^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{10}$/.test(value))return value;
  // For a pasted payment message, the confirmation code must be its first token.
  const first=value.split(/\s+/)[0]||'';
  return /^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{10}$/.test(first)?first:'';
 };
 const status=(message,kind='info')=>{
  const p=document.createElement('p');p.setAttribute('role','status');p.className='payment-lookup-message '+kind;
  p.textContent=message;output.replaceChildren(p);
 };
 const money=n=>{
  if(n==null||n==='')return 'Not recorded';
  const value=Number(n);
  return Number.isFinite(value)?'KSh '+value.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2}):'Not recorded';
 };
 const tryOpenMarketplace=(match)=>{
  if(!['Marketplace order','Marketplace COD fee'].includes(match.module))return false;
  const search=document.getElementById('adminOrderSearch');
  const paymentFilter=document.getElementById('adminOrderPaymentFilter');
  const orderFilter=document.getElementById('adminOrderStatusFilter');
  if(paymentFilter)paymentFilter.value='all';
  if(orderFilter)orderFilter.value='all';
  if(search){search.value=match.reference||'';search.dispatchEvent(new Event('input',{bubbles:true}));}
  const rows=[...document.querySelectorAll('[data-open-marketplace-order]')];
  const row=rows.find(el=>el.dataset.openMarketplaceOrder===match.record_id);
  if(row)row.click();
  else document.getElementById('adminMarketplaceOrderBody')?.scrollIntoView({behavior:'smooth',block:'center'});
  return true;
 };
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  const code=parseCode(input.value);
  if(!code){status('Enter one 10-character transaction code from the official LEOGO payment device, or paste its complete notification beginning with the code.','warning');return;}
  if(!acknowledgement?.checked){
   status('Confirm that you obtained this transaction code from the LEOGO receiving device or official receiving-account record. Customer-forwarded codes must not be used as verification evidence.','warning');return;
  }
  button.disabled=true;button.textContent='Searching…';
  status('Looking for matching payment references across LEOGO modules…');
  try{
   const {data,error}=await db.rpc('admin_search_payment_reference',{p_code:code});
   if(error)throw error;
   const matches=Array.isArray(data?.matches)?data.matches:[];
   output.replaceChildren();
   const count=document.createElement('p');count.className='payment-lookup-message';
   count.textContent=matches.length
    ?matches.length+' LEOGO record match'+(matches.length===1?'':'es')+' for '+code+'. Matches are not proof of bank settlement.'
    :'No matching payment reference found across the currently indexed LEOGO payment sources for '+code+'. This does not mean the transaction failed.';
   output.append(count);
   if(matches.length>1){
    const dup=document.createElement('p');dup.className='payment-lookup-message warning';
    dup.textContent='ATTENTION: This code appears in multiple records, potentially including linked ledger entries. Check that it has not been credited more than once.';
    output.append(dup);
   }
   for(const match of matches){
    const card=document.createElement('article');card.className='payment-lookup-match';
    const heading=document.createElement('strong');heading.textContent=match.module||'Payment record';
    const ref=document.createElement('p');ref.textContent='Record: '+(match.reference||match.record_id||'Unavailable');
    const amount=document.createElement('p');amount.textContent='Recorded amount: '+money(match.amount_kes);
    const state=document.createElement('p');state.textContent='Current status: '+(match.status||'Not provided');
    const date=document.createElement('p');date.textContent='Submitted: '+(match.submitted_at?new Date(match.submitted_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):'Not recorded');
    card.append(heading,ref,amount,state,date);
    if(String(match.module||'').includes('(outgoing)')){
     const note=document.createElement('p');note.className='payment-lookup-message warning';
     note.textContent='Outgoing disbursement reference; do not treat as funds received.';
     card.append(note);
    }
    if(['Marketplace order','Marketplace COD fee'].includes(match.module)){
     const open=document.createElement('button');open.type='button';open.textContent='Open matching marketplace order';
     open.addEventListener('click',()=>tryOpenMarketplace(match));
     card.append(open);
    }else{
     const moduleName=String(match.module||'');
     const target=moduleName.startsWith('Wallet')?'wallet'
      :moduleName.startsWith('Premium')?'premium'
      :moduleName.startsWith('Group')?'orders'
      :moduleName.startsWith('Service request')?'providers'
      :moduleName.startsWith('Cyber')?'orders'
      :moduleName.startsWith('Health')?'health'
      :moduleName.startsWith('Assisted')?'assisted'
      :moduleName.startsWith('Aftersales')?'aftersales'
      :moduleName.startsWith('Vacant')?'vacant_houses'
      :moduleName.startsWith('Partner')||moduleName.includes('settlement')?'settlements'
      :moduleName.startsWith('Lipa')?'orders':null;
     const nav=target?document.querySelector('button[data-admin-view="'+target+'"]'):null;
     if(nav&&!nav.disabled){
      const open=document.createElement('button');open.type='button';open.textContent='Open '+(match.module||'module')+' review';
      open.addEventListener('click',()=>nav.click());
      card.append(open);
     }
     const hint=document.createElement('p');
     hint.textContent='Review record '+(match.reference||match.record_id||'')+' in the appropriate Admin queue. This lookup does not approve it.';
     card.append(hint);
    }
    output.append(card);
   }
   const warning=document.createElement('p');warning.className='payment-lookup-message warning';
   warning.textContent='Only approve after independently confirming transaction code, credited amount, payment destination, transaction date, and absence of prior use in the LEOGO official M-PESA statement or notification device. Search itself never approves.';
   output.append(warning);
  }catch(err){status('Search unavailable: '+(err?.message||String(err)),'warning');}
  finally{button.disabled=false;button.textContent='Fetch / Search Payment';}
 });
})();

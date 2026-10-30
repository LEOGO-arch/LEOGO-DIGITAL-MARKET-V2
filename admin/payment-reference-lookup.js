// LEOGO Admin: read-only payment-reference lookup for marketplace orders.
// Does NOT change payment status or bypass existing verification approvals.
(() => {
 'use strict';
 const form=document.getElementById('paymentReferenceLookupForm');
 const input=document.getElementById('paymentReferenceLookupInput');
 const output=document.getElementById('paymentReferenceLookupResults');
 const button=document.getElementById('paymentReferenceLookupFetch');
 const db=window.leogoAdminDb;
 if(!form||!input||!output||!db)return;
 const codePattern=/\b(?=[A-Z0-9]{0,9}[A-Z])(?=[A-Z0-9]{0,9}[0-9])[A-Z0-9]{10}\b/g;
 const html=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
 const normalize=s=>String(s||'').toUpperCase();
 function codes(s){return [...new Set(normalize(s).match(codePattern)||[])];}
 function queryCode(s){
  const clean=normalize(s).trim();
  if(/^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{10}$/.test(clean))return clean;
  // Full SMS or customer-pasted message: take the first transaction code,
  // never match a similar substring to a different reference.
  return codes(clean)[0]||'';
 }
 function amountFromSms(text){
  const m=String(text||'').match(/\b(?:Ksh\.?|KES)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:sent|paid|received)\b/i);
  return m?Number(m[1].replaceAll(',','')):null;
 }
 const status=(text,kind='info')=>{
  const p=document.createElement('p');p.setAttribute('role','status');p.className='payment-lookup-message '+kind;p.textContent=text;output.replaceChildren(p);
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const code=queryCode(input.value);
  if(!code){status('Enter a valid 10-character M-PESA transaction code, or paste the complete SMS message.','warning');return;}
  button.disabled=true;button.textContent='Searching…';
  status('Searching LEOGO marketplace payment submissions…');
  try{
   // Existing Admin RPC enforces orders.read access on the server.
   const {data,error}=await db.rpc('admin_list_marketplace_orders');
   if(error)throw error;
   if(!Array.isArray(data))throw Error('Payment lookup results are unavailable.');
   const matches=[];
   for(const order of data){
    const proofCodes=codes(order.payment_message);
    const feeCodes=codes(order.cod_delivery_fee_reference);
    const kinds=[];
    if(proofCodes.includes(code))kinds.push('Order payment');
    if(feeCodes.includes(code))kinds.push('COD delivery fee');
    if(kinds.length)matches.push({order,kinds});
   }
   if(!matches.length){status('No marketplace order submission contains '+code+'. This does not confirm whether M-PESA received a payment. Check other payment queues or the receiving account.','warning');return;}
   output.replaceChildren();
   const info=document.createElement('p');info.className='payment-lookup-message';
   info.textContent=matches.length+' matching marketplace order'+(matches.length===1?'':'s')+' found for '+code+'. Customer-submitted messages are not independent M-PESA confirmation.';
   output.append(info);
   const isDuplicate=matches.length>1;
   if(isDuplicate){
    const warning=document.createElement('p');warning.className='payment-lookup-message warning';
    warning.textContent='Duplicate transaction code across orders. Do NOT approve either order until investigated against the receiving account.';
    output.append(warning);
   }
   for(const {order,kinds} of matches){
    const card=document.createElement('article');card.className='payment-lookup-match';
    const title=document.createElement('strong');title.textContent=order.order_reference||'Marketplace order';
    const details=document.createElement('p');
    details.textContent=(order.receiver_name||'Customer')+' · '+kinds.join(', ')+' · '+money(order.grand_total_kes)+' order total · '+(order.payment_status||'Unknown status');
    const codeLine=document.createElement('p');codeLine.textContent='Matching code: '+code;
    card.append(title,details,codeLine);
    const amount=amountFromSms(order.payment_message);
    if(amount!==null){
     const amt=document.createElement('p');amt.textContent='Customer message says '+money(amount)+' was sent.';
     card.append(amt);
     if(kinds.includes('Order payment')&&Math.abs(Number(order.grand_total_kes||0)-amount)>0.009){
      const caution=document.createElement('p');caution.className='payment-lookup-message warning';
      caution.textContent='Amount differs from order total. Check payment due, rewards/discounts and split payments before verification.';
      card.append(caution);
     }
    }
    const proof=document.createElement('details');const summary=document.createElement('summary');summary.textContent='View customer-submitted message';
    const body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.textContent=String(order.payment_message||order.cod_delivery_fee_reference||'').slice(0,1800);
    proof.append(summary,body);card.append(proof);
    const open=document.createElement('button');open.type='button';open.textContent='Find this order in verification queue';
    open.addEventListener('click',()=>{
     const search=document.getElementById('adminOrderSearch');
     const paymentFilter=document.getElementById('adminOrderPaymentFilter');
     const orderFilter=document.getElementById('adminOrderStatusFilter');
     if(paymentFilter)paymentFilter.value='all';
     if(orderFilter)orderFilter.value='all';
     if(search){search.value=order.order_reference||'';search.dispatchEvent(new Event('input',{bubbles:true}));}
     const row=document.querySelector('[data-open-marketplace-order="'+CSS.escape(String(order.id))+'"]');
     row?.click();
     document.getElementById('adminMarketplaceOrderBody')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    card.append(open);
    if(order.payment_status==='submitted'){
     const caution=document.createElement('p');caution.className='payment-lookup-message';
     caution.textContent='To approve, use the existing Verify Paid action only after independently checking the credited amount, recipient account and reference in the official M-PESA record.';
     card.append(caution);
    }
    output.append(card);
   }
  }catch(error){status('Lookup failed: '+(error?.message||String(error)),'warning');}
  finally{button.disabled=false;button.textContent='Fetch / Search Payment';}
 });
})();

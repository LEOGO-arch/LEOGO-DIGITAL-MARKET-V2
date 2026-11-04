// Admin wallet refund reconciliation. Does not transfer funds or activate wallet checkout.
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  const panel=document.querySelector('[data-admin-panel="wallet"]');
  if(!db||!panel)return;
  const host=document.createElement('article');
  host.className='content-card';
  host.style.cssText='margin-top:18px;padding:18px';
  host.innerHTML=`
    <div class="card-head"><div><span>WALLET REFUND CONTROL</span><h3>Seller Settlement Review Before Refund</h3>
      <p>Cancel the order through the existing approval process first. Review every seller portion, then authorize a wallet refund. No seller transfer is performed here.</p></div>
      <button type="button" id="walletRefundRefresh">↻ Refresh</button></div>
    <form id="walletRefundSellerReviewForm" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
      <label style="grid-column:1/-1">Cancelled wallet-funded seller order<select name="seller_order_id" required><option value="">Select an order</option></select></label>
      <label>Seller already paid?<select name="seller_paid" required><option value="">Select</option><option value="yes">Yes — transfer verified</option><option value="no">No — unpaid</option></select></label>
      <label>Recovery / liability outcome<select name="treatment" required><option value="">Select</option><option value="not_paid">Seller not paid</option><option value="recovery_pending">Seller recovery pending</option><option value="recovered">Seller repaid LEOGO</option><option value="leogo_absorbs">LEOGO absorbs liability</option></select></label>
      <label>Liability amount (KSh)<input name="amount" type="number" min="0" step="0.01" required value="0"></label>
      <label>Existing settlement ID (if confirmed)<input name="settlement_id" placeholder="Verified payout UUID (optional)"></label>
      <label>Evidence / reconciliation reference<input name="evidence" minlength="6" maxlength="160" required></label>
      <label style="grid-column:1/-1">Review notes<textarea name="notes" minlength="12" maxlength="500" required rows="2" placeholder="How was seller payment checked? Who recovers funds?"></textarea></label>
      <div style="grid-column:1/-1"><button type="submit" class="primary-button">Save Seller Refund Review</button></div>
    </form>
    <form id="walletRefundFinalForm" style="display:grid;gap:12px;margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
      <h4 style="grid-column:1/-1">Authorize Customer Wallet Refund</h4>
      <label style="grid-column:1/-1">Cancelled wallet order<select name="order_id" required><option value="">Select order</option></select></label>
      <label>Refund reason<input name="reason" minlength="8" maxlength="240" required></label>
      <label>Reconciliation reference<input name="reference" minlength="6" maxlength="160" required></label>
      <label style="grid-column:1/-1"><input type="checkbox" name="confirmed" required> I have reviewed every seller and verified the refund/recovery evidence.</label>
      <div style="grid-column:1/-1"><button type="submit" class="primary-button">Issue Authorized Wallet Refund</button></div>
    </form>
    <div id="walletRefundReviewStatus" role="status" aria-live="polite"></div>`;
  panel.appendChild(host);
  const status=host.querySelector('#walletRefundReviewStatus');
  const reviewForm=host.querySelector('#walletRefundSellerReviewForm');
  const refundForm=host.querySelector('#walletRefundFinalForm');
  let rows=[];
  let pendingRefundRequestId=null;
  let pendingRefundOrderId=null;
  const show=(message)=>{status.textContent=message;};
  const selected=(form,key)=>String(new FormData(form).get(key)||'').trim();
  async function load(){
    const {data,error}=await db.rpc('admin_list_wallet_order_settlement_reconciliation');
    if(error){show('Unable to load wallet reconciliation: '+error.message);return;}
    rows=(Array.isArray(data)?data:[]).filter(row=>row.order_status==='cancelled'&&row.wallet_payment_status==='paid');
    const sellerSelect=reviewForm.elements.seller_order_id;
    const orderSelect=refundForm.elements.order_id;
    sellerSelect.replaceChildren(new Option('Select an order',''));
    orderSelect.replaceChildren(new Option('Select order',''));
    const seen=new Set();
    rows.forEach(row=>{
      const label=(row.order_reference||row.order_id)+' — seller '+row.seller_id+' — KSh '+row.seller_subtotal_kes;
      sellerSelect.add(new Option(label,row.seller_order_id));
      if(!seen.has(row.order_id)){
        orderSelect.add(new Option(row.order_reference||row.order_id,row.order_id));
        seen.add(row.order_id);
      }
    });
    show(rows.length+' cancelled wallet-funded seller order(s) ready for settlement review.');
  }
  reviewForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const id=selected(reviewForm,'seller_order_id');
    const row=rows.find(item=>item.seller_order_id===id);
    if(!row){show('Select a cancelled wallet seller order.');return;}
    const paid=selected(reviewForm,'seller_paid');
    const treatment=selected(reviewForm,'treatment');
    const amount=Number(selected(reviewForm,'amount'));
    if(!['yes','no'].includes(paid)){show('Confirm whether the seller has been paid.');return;}
    if((paid==='no'&&(treatment!=='not_paid'||amount!==0))||
       (paid==='yes'&&(treatment==='not_paid'||!Number.isFinite(amount)||amount<=0))){
      show('Seller payment status, liability treatment and amount do not agree.');return;
    }
    const payoutId=selected(reviewForm,'settlement_id');
    const button=reviewForm.querySelector('[type="submit"]');
    button.disabled=true;show('Saving seller settlement review…');
    try{
      const {error}=await db.rpc('admin_review_wallet_refund_seller',{
        p_order_id:row.order_id,p_seller_order_id:id,p_seller_paid:paid==='yes',
        p_settlement_id:payoutId||null,p_liability_treatment:treatment,
        p_liability_amount_kes:amount,p_evidence_reference:selected(reviewForm,'evidence'),
        p_review_notes:selected(reviewForm,'notes')
      });
      show(error?'Review not saved: '+error.message:'Seller review recorded and audited.');
    }finally{button.disabled=false;}
  });
  refundForm.elements.order_id.addEventListener('change',()=>{pendingRefundRequestId=null;pendingRefundOrderId=null;});
  refundForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const orderId=selected(refundForm,'order_id');
    if(!rows.some(row=>row.order_id===orderId)){show('Select an eligible cancelled wallet order.');return;}
    if(!refundForm.elements.confirmed.checked){show('Confirm seller and recovery reconciliation first.');return;}
    if(!window.confirm('Issue a customer Savings Wallet refund for this cancelled order? This credits the customer wallet and must not be repeated.'))return;
    if(pendingRefundOrderId!==orderId){pendingRefundRequestId=null;pendingRefundOrderId=orderId;}
    if(!pendingRefundRequestId)pendingRefundRequestId=globalThis.crypto?.randomUUID?.();
    if(!pendingRefundRequestId){show('Secure refund request identifier unavailable.');return;}
    const button=refundForm.querySelector('[type="submit"]');
    button.disabled=true;show('Submitting the authorized refund…');
    try{
      const {data,error}=await db.rpc('admin_refund_marketplace_wallet_order',{
        p_order_id:orderId,p_refund_request_id:pendingRefundRequestId,
        p_reason:selected(refundForm,'reason'),
        p_reconciliation_reference:selected(refundForm,'reference'),
        p_settlement_reconciled:true
      });
      if(error){show('Refund not completed: '+error.message);return;}
      show((data?.already_refunded?'Refund already recorded.':'Wallet refund recorded.')+' Reconciliation reference: '+selected(refundForm,'reference'));
      pendingRefundRequestId=null;pendingRefundOrderId=null;
      await load();
      window.dispatchEvent(new Event('leogo:wallet-finance-refresh'));
    }finally{button.disabled=false;}
  });
  host.querySelector('#walletRefundRefresh').addEventListener('click',load);
  document.addEventListener('leogo:admin-access-change',load);
  load();
})();
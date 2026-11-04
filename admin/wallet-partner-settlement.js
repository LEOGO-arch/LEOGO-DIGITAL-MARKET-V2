// Wallet partner & settlement administration. This does not enable customer wallet checkout.
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  const panel=document.querySelector('[data-admin-panel="wallet"]');
  if(!db||!panel)return;
  const host=document.createElement('article');
  host.className='content-card';
  host.id='walletPartnerSettlementCard';
  host.style.cssText='margin-top:18px';
  host.innerHTML=`
    <div class="card-head"><div><span>WALLET PARTNER & SETTLEMENT</span><h3>Partner Details & Wallet Checkout Activation</h3>
      <p>Record the approved financial partner. Wallet purchases remain blocked until backend debit, refund and settlement tests are complete.</p></div>
      <button id="walletPartnerRefresh" type="button">↻ Refresh</button></div>
    <form id="walletPartnerForm" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));padding:12px 0">
      <label>Approved SACCO / payment partner name<input name="partner_name" required minlength="2" maxlength="160" placeholder="Enter legal partner name"></label>
      <label>Agreement reference<input name="agreement_reference" maxlength="160" placeholder="Agreement reference (optional)"></label>
      <label>Settlement method<input name="settlement_method" maxlength="100" placeholder="Bank / SACCO / payment processor"></label>
      <label style="grid-column:1/-1">Settlement notes<textarea name="settlement_notes" maxlength="500" rows="2" placeholder="Approved settlement arrangement (no account credentials)"></textarea></label>
      <div style="grid-column:1/-1"><button type="submit" class="primary-button">Save Partner Details</button></div>
    </form>
    <div style="padding:16px;border-radius:14px;background:#f4f7fc;border:1px solid #d8e1ed">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div><strong>Customer Savings Wallet Checkout</strong><div id="walletCheckoutActivationState">Checking activation status…</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="walletCheckoutActivate" class="primary-button">Activate Service</button><button type="button" id="walletCheckoutDeactivate">Deactivate Service</button></div>
      </div>
      <p id="walletCheckoutReadiness" style="margin:10px 0 0;color:#58677b"></p>
    </div>
    <div id="walletPartnerStatus" class="form-status" role="status" aria-live="polite"></div>`;
  panel.appendChild(host);
  const form=host.querySelector('#walletPartnerForm');
  const status=host.querySelector('#walletPartnerStatus');
  const state=host.querySelector('#walletCheckoutActivationState');
  const readiness=host.querySelector('#walletCheckoutReadiness');
  const activate=host.querySelector('#walletCheckoutActivate');
  const deactivate=host.querySelector('#walletCheckoutDeactivate');
  const refresh=host.querySelector('#walletPartnerRefresh');
  let busy=false;
  let last=null;
  const show=(message,error=false)=>{status.textContent=message;status.className='form-status'+(error?' error':'');};
  const redraw=(data)=>{
    last=data;
    state.textContent=data.enabled?'Active':'Inactive — customer wallet payments disabled';
    const checks=[
      ['Partner agreement',data.custody_partner_approved],
      ['Atomic wallet deductions',data.atomic_ledger_verified],
      ['Refund workflow',data.refund_flow_verified],
      ['Settlement reconciliation',data.settlement_reconciliation_verified]
    ];
    readiness.textContent='Required checks: '+checks.map(([label,ready])=>label+' '+(ready?'✓':'pending')).join(' · ');
    activate.disabled=Boolean(data.enabled)||busy;
    deactivate.disabled=!data.enabled||busy;
  };
  async function load(){
    const {data,error}=await db.rpc('admin_get_wallet_partner_settlement');
    if(error){show('Cannot load partner settlement settings: '+error.message,true);return;}
    for(const key of ['partner_name','settlement_method','settlement_notes']){
      form.elements[key].value=data[key]||'';
    }
    form.elements.agreement_reference.value=data.partner_agreement_reference||'';
    redraw(data);
    show('Partner settlement settings loaded.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    busy=true;show('Saving partner details…');
    const v=new FormData(form);
    const {data,error}=await db.rpc('admin_save_wallet_partner_settlement',{
      p_partner_name:String(v.get('partner_name')||'').trim(),
      p_agreement_reference:String(v.get('agreement_reference')||'').trim(),
      p_settlement_method:String(v.get('settlement_method')||'').trim(),
      p_settlement_notes:String(v.get('settlement_notes')||'').trim()
    });
    busy=false;
    if(error){show(error.message,true);return;}
    redraw(data);show('Partner details saved and audited.');
  });
  async function toggle(enabled){
    if(busy)return;
    busy=true;activate.disabled=true;deactivate.disabled=true;
    show(enabled?'Checking activation requirements…':'Deactivating wallet checkout…');
    const {data,error}=await db.rpc('admin_set_wallet_checkout_enabled',{p_enabled:enabled});
    busy=false;
    if(error){show(error.message,true);if(last)redraw(last);return;}
    redraw(data);show(enabled?'Wallet checkout activated.':'Wallet checkout deactivated.');
  }
  activate.addEventListener('click',()=>toggle(true));
  deactivate.addEventListener('click',()=>toggle(false));
  refresh.addEventListener('click',load);
  document.addEventListener('leogo:admin-access-change',load);
  load();
})();
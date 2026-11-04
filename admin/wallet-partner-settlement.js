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
    <div id="walletPartnerStatus" class="form-status" role="status" aria-live="polite"></div>
    <section style="margin-top:18px"><div class="card-head"><div><h3>Wallet Order → Seller Reconciliation</h3><p>Review verified wallet-funded seller orders before recording SACCO settlement. A paid seller settlement requires actual transfer evidence.</p></div><button id="walletReconciliationRefresh" type="button">Refresh Records</button></div>
      <div id="walletReconciliationSummary" role="status" aria-live="polite">Not loaded</div>
      <div id="walletReconciliationList" style="overflow-x:auto"></div>
    </section>`;
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
  const reconciliationSummary=host.querySelector('#walletReconciliationSummary');
  const reconciliationList=host.querySelector('#walletReconciliationList');
  async function loadWalletReconciliation(){
    reconciliationSummary.textContent='Loading wallet order settlement records…';
    reconciliationList.replaceChildren();
    const {data,error}=await db.rpc('admin_list_wallet_order_settlement_reconciliation');
    if(error){reconciliationSummary.textContent='Unable to load reconciliation: '+error.message;return;}
    const rows=Array.isArray(data)?data:[];
    reconciliationSummary.textContent=rows.length+' wallet-funded seller order record(s). Amounts are indicative; use the existing settlement approval workflow for transfers.';
    if(!rows.length)return;
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;min-width:780px';
    const headers=['Order','Seller ID','Seller amount','Wallet payment','Delivery','Approved accounts','Available seller balance','Settlement eligible'];
    const thead=document.createElement('thead');const tr=document.createElement('tr');
    headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;th.style.padding='9px';tr.appendChild(th);});
    thead.appendChild(tr);table.appendChild(thead);
    const tbody=document.createElement('tbody');
    rows.slice(0,100).forEach(item=>{
      const values=[item.order_reference||item.order_id,item.seller_id,item.seller_subtotal_kes,item.wallet_payment_status,item.seller_fulfilment_status,item.seller_approved_account_count,item.seller_available_balance_kes,item.eligible_for_settlement?'Yes':'No'];
      const row=document.createElement('tr');
      values.forEach(v=>{const cell=document.createElement('td');cell.textContent=String(v??'—');cell.style.cssText='padding:9px;border-top:1px solid #d8e1ed';row.appendChild(cell);});
      tbody.appendChild(row);
    });
    table.appendChild(tbody);reconciliationList.appendChild(table);
  }
  host.querySelector('#walletReconciliationRefresh').addEventListener('click',loadWalletReconciliation);
  document.addEventListener('leogo:admin-access-change',load);
  const financialHosts=[host,document.querySelector('[data-admin-panel="reports"]')].filter(Boolean);
  const financialSurfaces=financialHosts.map((parent)=>{
    const section=document.createElement('section');
    section.className='content-card';
    section.style.cssText='margin-top:18px;padding:16px';
    const heading=document.createElement('h3');
    heading.textContent='Savings Wallet Financial Reconciliation';
    const description=document.createElement('p');
    description.textContent='Wallet receipts and seller earnings are wallet-specific. Seller payouts below are all payment methods combined until per-order payout allocation is available.';
    const reload=document.createElement('button');
    reload.type='button';reload.textContent='↻ Refresh Wallet Report';
    const statusNode=document.createElement('p');
    statusNode.setAttribute('role','status');statusNode.textContent='Loading wallet financial summary…';
    const items=document.createElement('div');
    items.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px';
    section.append(heading,description,reload,statusNode,items);
    parent.appendChild(section);
    return {reload,statusNode,items};
  });
  const money=(n)=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function loadWalletFinancialReport(){
    financialSurfaces.forEach(surface=>{surface.statusNode.textContent='Refreshing wallet financial data…';surface.items.replaceChildren();});
    const {data,error}=await db.rpc('admin_get_wallet_checkout_financial_report');
    if(error){
      financialSurfaces.forEach(surface=>surface.statusNode.textContent='Report unavailable: '+error.message);
      return;
    }
    const figures=[
      ['Wallet collections',data.wallet_cash_collected_kes],
      ['Wallet refunds',data.wallet_cash_refunded_kes],
      ['Net wallet collections',data.wallet_cash_net_kes],
      ['Delivered seller earnings from wallet orders',data.wallet_seller_earned_delivered_kes],
      ['Wallet-funded seller orders awaiting delivery',data.wallet_seller_awaiting_delivery_kes],
      ['Seller settlements paid — all methods',data.all_methods_seller_settlements_paid_kes],
      ['Seller settlement requests pending — all methods',data.all_methods_seller_settlement_requests_pending_kes]
    ];
    financialSurfaces.forEach(surface=>{
      surface.statusNode.textContent=String(data.wallet_paid_order_count||0)+' wallet order(s), '+String(data.wallet_refunded_order_count||0)+' refunded. Seller settlements are not yet allocated by payment source.';
      figures.forEach(([label,value])=>{
        const tile=document.createElement('div');
        tile.style.cssText='background:#f4f7fc;border:1px solid #d8e1ed;border-radius:12px;padding:12px';
        const title=document.createElement('div');title.textContent=label;title.style.cssText='font-size:12px;color:#506078';
        const amount=document.createElement('strong');amount.textContent=money(value);
        tile.append(title,amount);surface.items.appendChild(tile);
      });
    });
  }
  financialSurfaces.forEach(surface=>surface.reload.addEventListener('click',loadWalletFinancialReport));
  load();
  loadWalletReconciliation();
  loadWalletFinancialReport();
})();
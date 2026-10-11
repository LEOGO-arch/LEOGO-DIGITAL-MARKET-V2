// Independent wallet payout reconciliation. Only Admin-authorized RPCs expose records
// and accept settlement completion. No automatic transfer is initiated here.
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  const section=document.querySelector('[data-admin-panel="wallet"]');
  const host=document.getElementById('walletPayoutList');
  const status=document.getElementById('walletPayoutStatus');
  if(!db||!section||!host)return;
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(v)=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const date=(v)=>v?new Intl.DateTimeFormat('en-KE',{
    dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'
  }).format(new Date(v)):'—';
  let busy=false;
  const setStatus=(msg,level='')=>{
    if(!status)return;
    status.textContent=msg;
    status.className='form-status'+(level?' '+level:'');
  };
  const listPayouts=async()=>{
    setStatus('Checking approved withdrawals…');
    const {data,error}=await db.rpc('admin_list_wallet_pending_payout_confirmations');
    if(error){
      host.innerHTML='<p class="loading-card">Payout confirmation controls are not yet active or this Admin lacks settlement permission.</p>';
      setStatus(error.message||'Cannot load payout confirmation queue.','error');
      return;
    }
    const items=Array.isArray(data)?data:[];
    host.innerHTML=items.length?items.map(item=>{
      const due=new Date(item.scheduled_completion_at||0);
      const overdue=due<new Date();
      return `<article class="wallet-payout-item" data-wallet-payout-id="${esc(item.id)}">
        <header><div><strong>${esc(item.customer_name||'Customer')} — ${esc(money(item.amount_kes))}</strong>
          <small>${esc(item.customer_phone||'No phone on file')} · ${esc(item.settlement_method)} · Approved ${esc(date(item.approved_at))}</small>
        </div><span class="wallet-payout-timing">${overdue?'SLA overdue — not yet paid':'Target '+esc(date(item.scheduled_completion_at))}</span></header>
        <p>Destination: <strong>${esc(item.account_name)} · ${esc(item.account_number)}</strong></p>
        <form data-wallet-confirm-form>
          <label>Actual M-Pesa / Bank / SACCO payout transaction reference
            <input name="settlement_reference" type="text" minlength="6" maxlength="120" autocomplete="off"
              placeholder="Enter the real transfer reference" required>
          </label>
          <label class="wallet-payout-check"><input type="checkbox" name="transfer_confirmed" required>
            I checked the official payout account and confirm the customer transfer succeeded</label>
          <button type="submit">Mark Payout Completed</button>
          <small data-wallet-row-status role="status"></small>
        </form>
      </article>`;
    }).join(''):'<p class="loading-card">No approved withdrawals are waiting for payout confirmation.</p>';
    setStatus(items.length?items.length+' approved withdrawal(s) require actual transfer confirmation.':'Payout reconciliation is up to date.','success');
  };
  host.addEventListener('submit',async event=>{
    const form=event.target?.closest?.('[data-wallet-confirm-form]');
    if(!form)return;
    event.preventDefault();
    if(busy)return;
    const record=form.closest('[data-wallet-payout-id]');
    const id=record?.dataset.walletPayoutId;
    const reference=form.elements.settlement_reference?.value.trim();
    if(!id||!reference||reference.length<6)return;
    if(!form.elements.transfer_confirmed?.checked){
      setStatus('Confirm the actual external payout first.','error');return;
    }
    if(!window.confirm('Have you independently verified this transfer in the actual LEOGO payment account? This marks the customer payout as completed.'))return;
    busy=true;
    const button=form.querySelector('[type="submit"]');
    if(button)button.disabled=true;
    const rowStatus=form.querySelector('[data-wallet-row-status]');
    if(rowStatus)rowStatus.textContent='Recording verified payout…';
    try{
      const {error}=await db.rpc('admin_complete_wallet_withdrawal',{
        p_withdrawal_id:id,p_settlement_reference:reference,p_transfer_confirmed:true
      });
      if(error)throw error;
      setStatus('External payout reference recorded and Admin action audited.','success');
      await listPayouts();
    }catch(error){
      if(rowStatus)rowStatus.textContent=error?.message||'Settlement could not be confirmed.';
      setStatus('Payout confirmation failed. No new transfer was initiated.','error');
    }finally{busy=false;if(button)button.disabled=false;}
  });
  document.getElementById('refreshWalletPayoutQueue')?.addEventListener('click',()=>listPayouts());
  document.addEventListener('click',(event)=>{
    const nav=event.target?.closest?.('[data-admin-view="wallet"]');
    if(nav)window.setTimeout(()=>{
      if(section.classList.contains('active'))listPayouts().catch(()=>{});
    },100);
  });
})();

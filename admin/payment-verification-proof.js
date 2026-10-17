// LEOGO Digital Market — shared payment notification evidence form.
// Installs after admin.js; preserves all existing RPC names, args and rejection flows.
(() => {
  'use strict';
  const db = window.leogoAdminDb;
  if (!db || db.__leogoPaymentNoticeGuardInstalled) return;

  const positive = {
    admin_verify_marketplace_order_payment: a => a.p_paid === true,
    admin_review_cod_delivery_fee: a => a.p_verified === true,
    admin_review_health_cod_delivery_fee: a => a.p_verified === true,
    admin_review_lipa_pole_pole_payment: a => a.p_approve === true,
    admin_review_group_order_payment: a => a.p_decision === 'verify',
    admin_verify_service_quotation_payment: a => a.p_approved === true,
    review_wallet_deposit: a => a.p_approve === true,
    admin_review_wallet_loan_repayment: a => a.p_decision === 'verify',
    admin_review_partner_billing_payment: a => a.p_decision === 'approve',
    admin_review_premium_customer_meetup_payment: a => a.p_decision === 'approve',
    admin_review_vacant_house_viewing_payment: a => a.p_decision === 'verify',
    admin_verify_cyber_order_payment: a => a.p_decision === 'verify',
    admin_review_health_medicine_order_payment: a => a.p_decision === 'verify',
    admin_review_health_specialist_booking_payment: a => a.p_decision === 'verify',
    admin_aftersales_verify_return_shipping_payment: a => a.p_approve === true,
    admin_review_approval: a =>
      a.p_decision === 'approve' && ['premium_payment','wallet_deposit'].includes(a.p_kind)
  };

  let pendingForm = Promise.resolve();
  const captureEvidence = () => new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'leogoPaymentNoticeOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(8,18,37,.75);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto';
    const card = document.createElement('form');
    card.setAttribute('role','dialog');
    card.setAttribute('aria-modal','true');
    card.setAttribute('aria-label','Confirm official payment notification');
    card.style.cssText = 'background:#fff;color:#14243f;border-radius:16px;padding:22px;max-width:480px;width:100%;box-shadow:0 16px 55px #0005;display:grid;gap:13px;font:inherit';
    card.innerHTML =
      '<h3 style="margin:0;color:#10284e">Verify LEOGO payment</h3>' +
      '<p style="margin:0;line-height:1.5;font-size:14px">Check the official receiving account notification. Enter the transaction reference <strong>or</strong> the transaction date/time as shown on the notification (Kenya time). This record will be kept with your verification.</p>' +
      '<label style="display:grid;gap:5px">Transaction reference (if available)<input name="reference" type="text" maxlength="41" placeholder="e.g. ABC1234567" autocomplete="off" style="width:100%;padding:10px;border:1px solid #aab4c5;border-radius:8px"></label>' +
      '<label style="display:grid;gap:5px">Transaction time — EAT (if reference unavailable)<input name="time" type="datetime-local" style="width:100%;padding:10px;border:1px solid #aab4c5;border-radius:8px"></label>' +
      '<p role="alert" data-error style="margin:0;color:#b42318;font-size:13px" hidden></p>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px"><button type="button" data-cancel style="padding:10px 14px">Cancel</button><button type="submit" style="padding:10px 16px;background:#123b79;color:white;border:0;border-radius:8px;font-weight:700">Record &amp; continue</button></div>';
    overlay.append(card);
    document.body.append(overlay);
    const reference = card.elements.reference;
    const time = card.elements.time;
    const error = card.querySelector('[data-error]');
    const finish = value => { overlay.remove(); resolve(value); };
    card.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    card.addEventListener('submit', event => {
      event.preventDefault();
      const ref = String(reference.value || '').trim().toUpperCase();
      const dateTime = String(time.value || '');
      if (ref && !/^[A-Z0-9][A-Z0-9/-]{5,40}$/.test(ref)) {
        error.hidden = false;
        error.textContent = 'Enter the transaction reference exactly as shown (6–41 letters/numbers).';
        return;
      }
      if (!ref && !dateTime) {
        error.hidden = false;
        error.textContent = 'Enter a transaction reference OR its date and time from the official payment notification.';
        return;
      }
      if (dateTime && (Number.isNaN(new Date(dateTime).getTime()) || new Date(dateTime).getTime() > Date.now() + 5*60*1000)) {
        error.hidden = false;
        error.textContent = 'Enter a valid transaction date and time that is not in the future.';
        return;
      }
      finish([
        ref ? 'Payment notification reference: ' + ref : '',
        dateTime ? 'Payment notification time (EAT): ' + dateTime.replace('T',' ') : ''
      ].filter(Boolean).join('\n'));
    });
    reference.focus();
  });

  // Reusable by isolated Admin modules using their own authenticated client.
  window.leogoRequirePaymentNotification = (rpcName, args, originalRpc, options) => {
    if (!positive[rpcName]?.(args || {})) return originalRpc(rpcName,args,options);
    const request = pendingForm.then(() => captureEvidence());
    pendingForm = request.then(() => undefined, () => undefined);
    return request.then(evidence => {
      if (!evidence) return { data:null, error:{ message:'Payment verification cancelled — no notification evidence was saved.' } };
      const notesKey = rpcName === 'review_wallet_deposit' ? 'p_admin_notes'
        : rpcName === 'admin_aftersales_verify_return_shipping_payment' ? 'p_note'
        : 'p_notes';
      const oldNotes = String(args?.[notesKey] || '').trim();
      return originalRpc(rpcName, { ...args, [notesKey]: evidence + (oldNotes ? '\n' + oldNotes : '') }, options);
    });
  };

  const originalRpc = db.rpc.bind(db);
  db.rpc = (name,args,options) => window.leogoRequirePaymentNotification(name,args,originalRpc,options);
  Object.defineProperty(db,'__leogoPaymentNoticeGuardInstalled',{value:true});
})();

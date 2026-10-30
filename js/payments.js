// LEOGO DIGITAL MARKET V2 — shared customer payment destinations from Admin settings.
(() => {
  'use strict';

  const cache = new Map();

  const getClient = () => window.leogoAuth?.client || null;

  const getDestination = async (functionCode, options = {}) => {
    const client = getClient();
    if (!client) {
      return { data: null, error: new Error('Customer authentication service is not ready.') };
    }

    const force = Boolean(options.force);
    if (!force && cache.has(functionCode)) {
      return { data: cache.get(functionCode), error: null };
    }

    const { data, error } = await client.rpc('get_customer_payment_destination', {
      p_function_code: functionCode
    });

    if (error) return { data: null, error };

    const destination = Array.isArray(data) ? (data[0] || null) : (data || null);
    cache.set(functionCode, destination);
    return { data: destination, error: null };
  };

  const clear = (functionCode = '') => {
    if (functionCode) cache.delete(functionCode);
    else cache.clear();
  };

  const paymentNumber = (destination) => {
    if (!destination) return '';
    return destination.till_number
      || destination.paybill_number
      || destination.account_number
      || '';
  };

  const typeLabel = (destination) => ({
    mpesa_till: 'M-Pesa Till',
    mpesa_paybill: 'M-Pesa Paybill',
    bank: 'Bank Account',
    other: 'Payment Account'
  })[destination?.account_type] || 'Payment Account';

  const destinationName = (destination) => destination?.account_name
    || destination?.business_name
    || destination?.display_name
    || 'LEOGO DIGITAL MARKET';


  // Reusable payment detail card. Displays only Admin-assigned receiving details.
  // This is display-only: it never creates a payment or changes verification status.
  const renderInstructions = (host, destination, title = 'Payment Instructions') => {
    if (!host) return;
    let panel = host.querySelector(':scope > .leogo-payment-guide');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'leogo-payment-guide';
      host.appendChild(panel);
    }
    panel.replaceChildren();
    if (!destination) { panel.remove(); return; }
    const kind = destination.account_type;
    const isPaybill = ['mpesa_paybill', 'paybill'].includes(kind);
    const isBank = kind === 'bank';
    if (!isPaybill && !isBank && !['mpesa_till','till'].includes(kind)) { panel.remove(); return; }
    const label = document.createElement('small');
    label.textContent = isPaybill ? 'PAYBILL ACCOUNT NUMBER' : isBank ? 'BANK ACCOUNT NUMBER' : 'M-PESA TILL NUMBER';
    const main = document.createElement('strong');
    main.className = 'leogo-payment-guide-number';
    main.textContent = String(isPaybill || isBank ? (destination.account_number || 'Not configured') : (destination.till_number || 'Not configured'));
    panel.append(label, main);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'leogo-payment-guide-open';
    button.textContent = 'View Payment Instructions';
    panel.append(button);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'leogo-payment-guide-copy';
    copy.textContent = 'Copy Account Number';
    copy.disabled = !main.textContent || main.textContent === 'Not configured';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(main.textContent); copy.textContent = 'Copied'; }
      catch { copy.textContent = 'Select the displayed number to copy'; }
    });
    panel.append(copy);
    button.addEventListener('click', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'leogo-payment-guide-modal';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const name = document.createElement('p');
      name.textContent = destinationName(destination);
      const instructions = document.createElement('ol');
      const steps = isPaybill
        ? ['Open M-PESA and choose Lipa na M-PESA → Pay Bill.',
           'Business / Paybill Number: ' + (destination.paybill_number || 'Not configured'),
           'Account Number: ' + (destination.account_number || 'Not configured'),
           'Enter the correct amount and confirm the receiving details before completing payment.']
        : isBank
        ? ['Open your bank transfer channel or visit the bank.',
           'Bank: ' + (destination.bank_name || 'Not configured'),
           'Account Name: ' + (destination.account_name || destinationName(destination)),
           'Account Number: ' + (destination.account_number || 'Not configured'),
           'Enter the required amount and verify the beneficiary before transferring.']
        : ['Open M-PESA → Lipa na M-PESA → Buy Goods and Services.',
           'Till Number: ' + (destination.till_number || 'Not configured'),
           'Confirm the LEOGO receiving name and payment amount.'];
      steps.push('After paying, submit the actual transaction reference in the appropriate LEOGO payment form. Payment remains subject to Admin verification.');
      if (destination.instructions) steps.push(String(destination.instructions));
      for (const step of steps) {
        const li = document.createElement('li');
        li.textContent = step;
        instructions.append(li);
      }
      const notice = document.createElement('p');
      notice.className = 'leogo-payment-guide-notice';
      notice.textContent = 'Use only payment details assigned by LEOGO Admin. Never pay a number sent by an unknown person.';
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Close';
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => dialog.remove());
      dialog.append(heading, name, instructions, notice, close);
      document.body.append(dialog);
      dialog.showModal();
    });
  };
  const guideStyle = document.createElement('style');
  guideStyle.textContent = '.leogo-payment-guide{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin:12px 0;padding:13px 15px;background:#f6f8ff;border:1px solid #b8c9e7;border-radius:13px;color:#152a4c}.leogo-payment-guide small{width:100%;font-size:12px;letter-spacing:.055em;font-weight:800}.leogo-payment-guide-number{width:100%;font-size:clamp(23px,5vw,32px);line-height:1.2;font-weight:900;letter-spacing:.02em;overflow-wrap:anywhere;color:#0d2f62}.leogo-payment-guide button{cursor:pointer;border-radius:9px;padding:10px 13px;font-weight:750;border:1px solid #365d93}.leogo-payment-guide-open{background:#123a75;color:#fff}.leogo-payment-guide-copy{background:white;color:#173e76}.leogo-payment-guide-modal{width:min(94vw,480px);max-height:82vh;overflow:auto;border:0;border-radius:15px;padding:23px;background:white;color:#142541;box-shadow:0 24px 80px #0005}.leogo-payment-guide-modal::backdrop{background:#06122ecc}.leogo-payment-guide-modal li{margin:10px 0;line-height:1.55;overflow-wrap:anywhere}.leogo-payment-guide-modal button{padding:10px 19px;border:0;border-radius:8px;background:#143c77;color:white;font-weight:800}.leogo-payment-guide-notice{font-size:13px;color:#8e420b;font-weight:650}';
  document.head.append(guideStyle);

  window.leogoPayments = {
    getDestination,
    clear,
    paymentNumber,
    typeLabel,
    destinationName,
    renderInstructions
  };

  document.addEventListener('leogo:authchange', () => clear());
})();
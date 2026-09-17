// LEOGO DIGITAL MARKET V2 — Supabase-backed savings wallet ledger.
(() => {
  'use strict';

  const auth = window.leogoAuth;
  const client = auth?.client;
  if (!client) return;

  const elements = {
    badge: document.getElementById('walletConnectionBadge'),
    available: document.getElementById('walletAvailableBalance'),
    dashboard: document.getElementById('walletDashboardBalance'),
    checkout: document.getElementById('checkoutWalletBalance'),
    checkoutAvailable: document.getElementById('walletCheckoutAvailable'),
    totalSaved: document.getElementById('walletTotalSaved'),
    streak: document.getElementById('walletSavingStreak'),
    eligibility: document.getElementById('walletLoanEligibility'),
    withdrawable: document.getElementById('walletWithdrawableBalance'),
    reservedWithdrawals: document.getElementById('walletReservedWithdrawals'),
    withdrawalCardBalance: document.getElementById('walletWithdrawalCardBalance'),
    withdrawalToggle: document.getElementById('walletWithdrawalToggle'),
    withdrawalForm: document.getElementById('walletWithdrawalForm'),
    withdrawalStatus: document.getElementById('walletWithdrawalStatus'),
    withdrawalList: document.getElementById('walletWithdrawalList'),
    pointsEarned: document.getElementById('walletPointsEarned'),
    maintenanceFee: document.getElementById('walletMaintenanceFee'),
    pinStatus: document.getElementById('walletPinStatus'),
    pinToggle: document.getElementById('walletPinToggle'),
    pinForm: document.getElementById('walletPinForm'),
    pinFormStatus: document.getElementById('walletPinFormStatus'),
    currentPinWrap: document.getElementById('walletCurrentPinWrap'),
    statementStatus: document.getElementById('walletStatementStatus'),
    downloadExcel: document.getElementById('walletDownloadExcel'),
    downloadPdf: document.getElementById('walletDownloadPdf'),
    transactions: document.getElementById('walletTransactionList'),
    savingForm: document.getElementById('walletSavingPreviewForm'),
    savingStatus: document.getElementById('walletSavingStatus'),
    challengeForm: document.getElementById('walletChallengeForm'),
    challengeStatus: document.getElementById('walletChallengeStatus'),
    challengeSummary: document.getElementById('walletChallengeSummary'),
    challengeCalendar: document.getElementById('walletChallengeCalendar'),
    challengePaymentForm: document.getElementById('walletChallengePaymentForm'),
    challengePaymentStatus: document.getElementById('walletChallengePaymentStatus'),
    loanForm: document.getElementById('walletLoanPreviewForm'),
    loanStatus: document.getElementById('walletLoanStatus')
  };

  let currentUser = null;
  let currentChallenge = null;
  let depositRequests = [];
  let ledgerEntries = [];
  let loanApplications = [];
  let withdrawalRequests = [];
  let walletSettings = { maintenance_fee_kes: 100, reward_minimum_spend_kes: 500, reward_rate: 0.001 };
  let walletSecurity = { pin_is_set: false, pin_locked_until: null };
  let walletSummary = { balance: 0, withdrawable: 0, reserved: 0, total_saved: 0, points: 0 };
  let loadVersion = 0;

  const numberFormat = (value) => Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: Number(value || 0) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
  const money = (value) => `KSh ${numberFormat(value)}`;
  const kenyaDateTime = (value) => new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
  const localDateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  const dateFromKey = (key) => new Date(`${key}T12:00:00+03:00`);
  const addDays = (key, count) => {
    const date = dateFromKey(key);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  };
  const prettyStatus = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  const setMessage = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', type === 'error');
    element.classList.toggle('is-success', type === 'success');
  };

  const setBadge = (text, type = '') => {
    if (!elements.badge) return;
    elements.badge.textContent = text;
    elements.badge.classList.toggle('is-live', type === 'live');
    elements.badge.classList.toggle('is-loading', type === 'loading');
  };

  const friendlyError = (error) => {
    const message = String(error?.message || error || '');
    const lower = message.toLowerCase();
    if (lower.includes('already been submitted') || lower.includes('duplicate key')) return 'This payment reference has already been submitted.';
    if (lower.includes('already have an active')) return 'You already have an active saving challenge. Complete it before starting another.';
    if (lower.includes('already have a loan')) return 'You already have a loan application awaiting review.';
    if (lower.includes('exceeds your available withdrawable balance')) return 'This amount is higher than your available withdrawable balance.';
    if (lower.includes('phone number')) return 'Add a phone number to your customer profile before requesting a withdrawal.';
    if (lower.includes('wallet account is not active')) return 'Your wallet account is not active. Please contact LEOGO customer care.';
    if (lower.includes('authentication required') || lower.includes('jwt')) return 'Please log in again before continuing.';
    if (lower.includes('network') || lower.includes('fetch')) return 'The wallet service could not be reached. Check your connection and try again.';
    return message || 'The wallet request could not be completed. Please try again.';
  };

  const walletCodeMessage = (code) => ({
    authentication_required: 'Please log in again before continuing.',
    invalid_format: 'Use a PIN containing only 4–6 digits.',
    weak_pin: 'Choose a less predictable PIN. Avoid repeated or sequential numbers.',
    invalid_current_pin: 'The current withdrawal PIN is incorrect.',
    pin_not_set: 'Create your withdrawal PIN before submitting a withdrawal.',
    invalid_pin: 'The withdrawal PIN is incorrect.',
    pin_locked: 'Withdrawal PIN is locked for 30 minutes after five incorrect attempts.',
    wallet_not_active: 'Your wallet account is not active. Please contact LEOGO customer care.',
    profile_phone_required: 'Add a phone number to your customer profile before requesting a withdrawal.',
    invalid_amount: 'Enter a valid withdrawal amount.',
    insufficient_withdrawable_balance: 'This amount is higher than your available withdrawable balance.'
  }[code] || 'The secure wallet request could not be completed. Please try again.');

  const runOnce = async (form, task) => {
    if (!form || form.dataset.submitting === 'true') return;
    const button = form.querySelector('button[type="submit"]');
    form.dataset.submitting = 'true';
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = 'Please wait…';
    }
    try {
      await task();
    } finally {
      form.dataset.submitting = 'false';
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Submit';
      }
    }
  };

  const calculateTotals = () => {
    const confirmedChallengeDates = new Set(
      depositRequests
        .filter((request) => request.deposit_kind === 'daily_challenge' && request.request_status === 'confirmed')
        .map((request) => request.challenge_date)
    );
    let cursor = localDateKey();
    if (!confirmedChallengeDates.has(cursor)) cursor = addDays(cursor, -1);
    let streak = 0;
    while (confirmedChallengeDates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return {
      balance: Number(walletSummary.balance || 0),
      withdrawable: Number(walletSummary.withdrawable || 0),
      reserved: Number(walletSummary.reserved || 0),
      points: Number(walletSummary.points || 0),
      totalSaved: Number(walletSummary.total_saved || 0),
      streak
    };
  };

  const renderSummary = () => {
    const totals = calculateTotals();
    [elements.available, elements.dashboard, elements.checkout, elements.checkoutAvailable].forEach((element) => {
      if (element) element.textContent = money(totals.balance);
    });
    if (elements.totalSaved) elements.totalSaved.textContent = money(totals.totalSaved);
    if (elements.withdrawable) elements.withdrawable.textContent = money(totals.withdrawable);
    if (elements.withdrawalCardBalance) elements.withdrawalCardBalance.textContent = money(totals.withdrawable);
    if (elements.reservedWithdrawals) elements.reservedWithdrawals.textContent = money(totals.reserved);
    if (elements.pointsEarned) elements.pointsEarned.textContent = `${numberFormat(totals.points)} points`;
    if (elements.maintenanceFee) elements.maintenanceFee.textContent = `${money(walletSettings.maintenance_fee_kes)} / month`;
    if (elements.streak) elements.streak.textContent = `${totals.streak} ${totals.streak === 1 ? 'day' : 'days'}`;
    const openLoan = loanApplications.find((loan) => ['pending', 'under_review'].includes(loan.application_status));
    if (elements.eligibility) {
      elements.eligibility.textContent = openLoan ? 'Under review' : (totals.totalSaved > 0 ? 'History building' : 'Not assessed');
    }
  };

  const renderPinSecurity = () => {
    if (!elements.pinStatus || !elements.pinToggle) return;
    const lockedUntil = walletSecurity.pin_locked_until ? new Date(walletSecurity.pin_locked_until) : null;
    const locked = lockedUntil && lockedUntil > new Date();
    elements.pinStatus.classList.toggle('is-secure', walletSecurity.pin_is_set && !locked);
    elements.pinStatus.textContent = locked
      ? `Locked until ${kenyaDateTime(lockedUntil)}`
      : (walletSecurity.pin_is_set ? 'PIN active' : 'Not created');
    elements.pinToggle.textContent = walletSecurity.pin_is_set ? 'Change PIN' : 'Create PIN';
    if (elements.currentPinWrap) elements.currentPinWrap.hidden = !walletSecurity.pin_is_set;
    if (elements.withdrawalToggle) {
      elements.withdrawalToggle.textContent = walletSecurity.pin_is_set ? 'Request Withdrawal' : 'Create PIN to Withdraw';
    }
  };

  const renderWithdrawals = () => {
    if (!elements.withdrawalList) return;
    elements.withdrawalList.replaceChildren();
    if (!withdrawalRequests.length) {
      const empty = document.createElement('p');
      empty.textContent = currentUser ? 'No withdrawal requests yet.' : 'Log in to view your withdrawal requests.';
      elements.withdrawalList.append(empty);
      return;
    }

    withdrawalRequests.slice(0, 25).forEach((request) => {
      const row = document.createElement('div');
      row.className = 'wallet-withdrawal-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${money(request.requested_amount_kes)} · ${prettyStatus(request.settlement_method)}`;
      const account = document.createElement('small');
      const accountNumber = String(request.account_number || '');
      const masked = accountNumber.length > 4 ? `••••${accountNumber.slice(-4)}` : accountNumber;
      account.textContent = `${request.account_name} · ${masked} · Requested ${kenyaDateTime(request.submitted_at)}`;
      const detail = document.createElement('small');
      if (request.request_status === 'pending_call') detail.textContent = 'Awaiting Admin/Staff phone confirmation and approval.';
      if (request.request_status === 'approved_processing') detail.textContent = `Approved and debited. Scheduled completion: ${kenyaDateTime(request.scheduled_completion_at)}.`;
      if (request.request_status === 'completed') detail.textContent = `24-hour processing completed ${kenyaDateTime(request.completed_at)}.`;
      if (request.request_status === 'rejected') detail.textContent = request.admin_notes || 'Request was not approved. Reserved funds are available again.';
      copy.append(title, account, detail);
      const status = document.createElement('b');
      status.className = `is-${request.request_status.replaceAll('_', '-')}`;
      status.textContent = prettyStatus(request.request_status);
      row.append(copy, status);
      elements.withdrawalList.append(row);
    });
  };

  const transactionRecord = ({ title, detail, status, date, amount, direction = '' }) => ({ title, detail, status, date, amount, direction });

  const renderTransactions = () => {
    if (!elements.transactions) return;
    const records = [];
    ledgerEntries.forEach((entry) => records.push(transactionRecord({
      title: entry.description,
      detail: prettyStatus(entry.entry_type),
      status: 'Confirmed',
      date: entry.created_at,
      amount: `${entry.direction === 'credit' ? '+' : '−'} ${money(entry.amount_kes)}`,
      direction: entry.direction
    })));
    depositRequests.filter((request) => request.request_status !== 'confirmed').forEach((request) => records.push(transactionRecord({
      title: request.deposit_kind === 'daily_challenge' ? `Daily challenge — ${request.challenge_date}` : 'Normal saving submission',
      detail: request.request_status === 'rejected' && request.admin_notes ? request.admin_notes : 'Awaiting payment verification',
      status: prettyStatus(request.request_status),
      date: request.reviewed_at || request.submitted_at,
      amount: money(request.requested_amount_kes)
    })));
    loanApplications.forEach((loan) => records.push(transactionRecord({
      title: `Loan application — ${money(loan.requested_amount_kes)}`,
      detail: `Saving history snapshot: ${money(loan.total_saved_at_application)}`,
      status: prettyStatus(loan.application_status),
      date: loan.reviewed_at || loan.submitted_at,
      amount: ''
    })));
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    elements.transactions.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p');
      empty.textContent = currentUser ? 'No wallet transactions yet.' : 'Log in to view your secure wallet transactions.';
      elements.transactions.append(empty);
      return;
    }
    records.slice(0, 100).forEach((record) => {
      const row = document.createElement('div');
      row.className = 'wallet-transaction-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.title;
      const date = document.createElement('small');
      date.textContent = `${kenyaDateTime(record.date)}${record.detail ? ` · ${record.detail}` : ''}`;
      copy.append(title, date);
      if (record.amount) {
        const amount = document.createElement('small');
        amount.className = `wallet-transaction-amount ${record.direction}`;
        amount.textContent = record.amount;
        copy.append(amount);
      }
      const status = document.createElement('b');
      status.className = `is-${String(record.status).toLowerCase().replaceAll(' ', '-')}`;
      status.textContent = record.status;
      row.append(copy, status);
      elements.transactions.append(row);
    });
  };

  const renderChallenge = () => {
    if (!elements.challengeCalendar || !elements.challengeSummary) return;
    elements.challengeCalendar.replaceChildren();
    if (!currentChallenge) {
      elements.challengeSummary.textContent = currentUser
        ? 'Create a challenge to display the calendar.'
        : 'Log in to create and track a daily saving challenge.';
      return;
    }
    const requests = depositRequests.filter((request) => request.challenge_id === currentChallenge.id);
    const paymentByDate = new Map(requests.map((request) => [request.challenge_date, request]));
    const today = localDateKey();
    let covered = 0;
    let pending = 0;
    let missed = 0;
    for (let index = 0; index < Number(currentChallenge.period_days); index += 1) {
      const key = addDays(currentChallenge.start_date, index);
      const payment = paymentByDate.get(key);
      let state = 'upcoming';
      let label = money(currentChallenge.daily_amount_kes);
      if (payment?.request_status === 'confirmed') {
        state = 'covered';
        label = 'Covered';
        covered += 1;
      } else if (payment?.request_status === 'pending') {
        state = 'pending';
        label = 'Pending';
        pending += 1;
      } else if (key < today) {
        state = 'missed';
        label = `− ${money(currentChallenge.daily_amount_kes)}`;
        missed += 1;
      } else if (key === today) {
        state = 'due';
        label = `Pay ${money(currentChallenge.daily_amount_kes)}`;
      }
      const canPay = (state === 'missed' || state === 'due') && payment?.request_status !== 'pending';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wallet-calendar-day is-${state}${canPay ? ' can-pay' : ''}`;
      button.dataset.walletChallengeDate = key;
      button.disabled = !canPay;
      const day = document.createElement('strong');
      day.textContent = String(dateFromKey(key).getDate());
      const dateLabel = document.createElement('small');
      dateLabel.textContent = new Intl.DateTimeFormat('en-KE', { month: 'short', weekday: 'short', timeZone: 'Africa/Nairobi' }).format(dateFromKey(key));
      const stateLabel = document.createElement('b');
      stateLabel.textContent = label;
      button.append(day, dateLabel, stateLabel);
      elements.challengeCalendar.append(button);
    }
    elements.challengeSummary.textContent = `${money(currentChallenge.daily_amount_kes)} daily for ${currentChallenge.period_days} days · Covered: ${covered} · Pending: ${pending} · Missed: ${missed} (${money(missed * Number(currentChallenge.daily_amount_kes))} negative)`;
  };

  const clearWallet = () => {
    currentChallenge = null;
    depositRequests = [];
    ledgerEntries = [];
    loanApplications = [];
    withdrawalRequests = [];
    walletSettings = { maintenance_fee_kes: 100, reward_minimum_spend_kes: 500, reward_rate: 0.001 };
    walletSecurity = { pin_is_set: false, pin_locked_until: null };
    walletSummary = { balance: 0, withdrawable: 0, reserved: 0, total_saved: 0, points: 0 };
    setBadge('SIGN IN REQUIRED');
    renderSummary();
    renderTransactions();
    renderChallenge();
    renderWithdrawals();
    renderPinSecurity();
  };

  const loadWallet = async (user) => {
    if (!user?.id) {
      currentUser = null;
      clearWallet();
      return;
    }
    currentUser = user;
    const version = ++loadVersion;
    setBadge('LOADING SECURE DATA', 'loading');
    const [accountsResult, challengesResult, depositsResult, ledgerResult, loansResult, withdrawalsResult, settingsResult, securityResult, summaryResult] = await Promise.all([
      client.from('wallet_accounts').select('user_id,account_status,opened_at').eq('user_id', user.id).maybeSingle(),
      client.from('wallet_challenges').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      client.from('wallet_deposit_requests').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(200),
      client.from('wallet_ledger_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      client.from('wallet_loan_applications').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(50),
      client.from('wallet_withdrawal_requests').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(50),
      client.from('wallet_settings').select('maintenance_fee_kes,reward_minimum_spend_kes,reward_rate').eq('id', 1).single(),
      client.rpc('get_wallet_security_status'),
      client.rpc('get_my_wallet_summary')
    ]);
    if (version !== loadVersion || currentUser?.id !== user.id) return;
    const error = [accountsResult, challengesResult, depositsResult, ledgerResult, loansResult, withdrawalsResult, settingsResult, securityResult, summaryResult].find((result) => result.error)?.error;
    if (error) {
      setBadge('CONNECTION ERROR');
      setMessage(elements.savingStatus, friendlyError(error), 'error');
      return;
    }
    const account = accountsResult.data;
    currentChallenge = (challengesResult.data || []).find((challenge) => challenge.challenge_status === 'active') || null;
    depositRequests = depositsResult.data || [];
    ledgerEntries = ledgerResult.data || [];
    loanApplications = loansResult.data || [];
    withdrawalRequests = withdrawalsResult.data || [];
    walletSettings = settingsResult.data || walletSettings;
    walletSecurity = securityResult.data?.success ? securityResult.data : { pin_is_set: false, pin_locked_until: null };
    walletSummary = summaryResult.data?.success ? summaryResult.data : walletSummary;
    setBadge(account?.account_status === 'frozen' ? 'ACCOUNT FROZEN' : 'LIVE & SECURE', account?.account_status === 'frozen' ? '' : 'live');
    renderSummary();
    renderTransactions();
    renderChallenge();
    renderWithdrawals();
    renderPinSecurity();
  };

  elements.savingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !elements.savingForm.reportValidity()) return;
    runOnce(elements.savingForm, async () => {
      const amount = Number(document.getElementById('walletSavingAmount')?.value || 0);
      const reference = document.getElementById('walletSavingReference')?.value.trim();
      const paid = document.getElementById('walletSavingPaid')?.checked;
      if (!paid) {
        setMessage(elements.savingStatus, 'Confirm that you have paid before submitting.', 'error');
        return;
      }
      setMessage(elements.savingStatus, 'Submitting your saving for secure verification…');
      const { error } = await client.rpc('submit_wallet_deposit', {
        p_amount_kes: amount,
        p_payment_reference: reference
      });
      if (error) {
        setMessage(elements.savingStatus, friendlyError(error), 'error');
        return;
      }
      elements.savingForm.reset();
      setMessage(elements.savingStatus, 'Saving submitted. It will increase your available balance only after Admin/SACCO confirmation.', 'success');
      await loadWallet(currentUser);
    });
  });

  elements.challengeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !elements.challengeForm.reportValidity()) return;
    runOnce(elements.challengeForm, async () => {
      const amount = Number(document.getElementById('walletChallengeAmount')?.value || 0);
      const startDate = document.getElementById('walletChallengeStart')?.value;
      const days = Number(document.getElementById('walletChallengeDays')?.value || 0);
      setMessage(elements.challengeStatus, 'Creating your secure saving challenge…');
      const { error } = await client.rpc('start_wallet_challenge', {
        p_daily_amount_kes: amount,
        p_start_date: startDate,
        p_period_days: days
      });
      if (error) {
        setMessage(elements.challengeStatus, friendlyError(error), 'error');
        return;
      }
      setMessage(elements.challengeStatus, 'Challenge created. Today and missed dates can be covered from the calendar.', 'success');
      await loadWallet(currentUser);
    });
  });

  elements.challengeCalendar?.addEventListener('click', (event) => {
    const day = event.target.closest('[data-wallet-challenge-date]');
    if (!day || day.disabled || !currentChallenge) return;
    const key = day.dataset.walletChallengeDate;
    document.getElementById('walletSelectedChallengeKey').value = key;
    document.getElementById('walletSelectedChallengeDate').textContent = new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'long', timeZone: 'Africa/Nairobi'
    }).format(dateFromKey(key));
    document.getElementById('walletSelectedChallengeAmount').textContent = money(currentChallenge.daily_amount_kes);
    setMessage(elements.challengePaymentStatus);
    elements.challengePaymentForm.hidden = false;
    elements.challengePaymentForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  elements.challengePaymentForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !currentChallenge || !elements.challengePaymentForm.reportValidity()) return;
    runOnce(elements.challengePaymentForm, async () => {
      const challengeDate = document.getElementById('walletSelectedChallengeKey')?.value;
      const reference = document.getElementById('walletChallengePaymentReference')?.value.trim();
      const paid = document.getElementById('walletChallengePaymentPaid')?.checked;
      if (!paid) {
        setMessage(elements.challengePaymentStatus, 'Confirm that you paid this challenge amount.', 'error');
        return;
      }
      setMessage(elements.challengePaymentStatus, 'Submitting this challenge day for verification…');
      const { error } = await client.rpc('submit_wallet_challenge_payment', {
        p_challenge_id: currentChallenge.id,
        p_challenge_date: challengeDate,
        p_payment_reference: reference
      });
      if (error) {
        setMessage(elements.challengePaymentStatus, friendlyError(error), 'error');
        return;
      }
      document.getElementById('walletChallengePaymentReference').value = '';
      document.getElementById('walletChallengePaymentPaid').checked = false;
      setMessage(elements.challengePaymentStatus, 'Day saving submitted. The date will turn green after Admin/SACCO confirmation.', 'success');
      await loadWallet(currentUser);
    });
  });

  elements.loanForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !elements.loanForm.reportValidity()) return;
    runOnce(elements.loanForm, async () => {
      const amount = Number(document.getElementById('walletLoanAmount')?.value || 0);
      const purpose = document.getElementById('walletLoanPurpose')?.value.trim();
      const consent = document.getElementById('walletLoanConsent')?.checked;
      if (!consent) {
        setMessage(elements.loanStatus, 'Accept the review conditions before submitting.', 'error');
        return;
      }
      setMessage(elements.loanStatus, 'Submitting your application with a verified saving-history snapshot…');
      const { error } = await client.rpc('submit_wallet_loan_application', {
        p_requested_amount_kes: amount,
        p_purpose: purpose,
        p_consent_accepted: true
      });
      if (error) {
        setMessage(elements.loanStatus, friendlyError(error), 'error');
        return;
      }
      elements.loanForm.reset();
      setMessage(elements.loanStatus, 'Application submitted for Admin and authorized SACCO-partner review. This is not a loan approval.', 'success');
      await loadWallet(currentUser);
    });
  });

  elements.pinToggle?.addEventListener('click', () => {
    if (!currentUser) {
      document.querySelector('[data-customer-view="auth"]')?.click();
      return;
    }
    elements.pinForm.hidden = !elements.pinForm.hidden;
    setMessage(elements.pinFormStatus);
    if (!elements.pinForm.hidden) {
      const firstInput = walletSecurity.pin_is_set
        ? document.getElementById('walletCurrentPin')
        : document.getElementById('walletNewPin');
      firstInput?.focus();
    }
  });

  elements.pinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !elements.pinForm.reportValidity()) return;
    runOnce(elements.pinForm, async () => {
      const currentPin = document.getElementById('walletCurrentPin')?.value || null;
      const newPin = document.getElementById('walletNewPin')?.value || '';
      const confirmPin = document.getElementById('walletConfirmPin')?.value || '';
      if (walletSecurity.pin_is_set && !currentPin) {
        setMessage(elements.pinFormStatus, 'Enter your current PIN before changing it.', 'error');
        return;
      }
      if (newPin !== confirmPin) {
        setMessage(elements.pinFormStatus, 'The new PIN and confirmation do not match.', 'error');
        return;
      }
      setMessage(elements.pinFormStatus, 'Saving your encrypted withdrawal PIN…');
      const { data, error } = await client.rpc('set_wallet_withdrawal_pin', {
        p_new_pin: newPin,
        p_current_pin: currentPin
      });
      if (error) {
        setMessage(elements.pinFormStatus, friendlyError(error), 'error');
        return;
      }
      if (!data?.success) {
        setMessage(elements.pinFormStatus, walletCodeMessage(data?.code), 'error');
        return;
      }
      elements.pinForm.reset();
      setMessage(elements.pinFormStatus, walletSecurity.pin_is_set ? 'Withdrawal PIN changed securely.' : 'Withdrawal PIN created securely.', 'success');
      await loadWallet(currentUser);
      elements.pinForm.hidden = true;
    });
  });

  elements.withdrawalToggle?.addEventListener('click', () => {
    if (!currentUser) {
      document.querySelector('[data-customer-view="auth"]')?.click();
      return;
    }
    if (!walletSecurity.pin_is_set) {
      elements.pinForm.hidden = false;
      setMessage(elements.pinFormStatus, 'Create your withdrawal PIN before opening the withdrawal form.');
      document.getElementById('walletNewPin')?.focus();
      return;
    }
    elements.withdrawalForm.hidden = !elements.withdrawalForm.hidden;
    elements.withdrawalToggle.textContent = elements.withdrawalForm.hidden ? 'Request Withdrawal' : 'Close Withdrawal Form';
    setMessage(elements.withdrawalStatus);
    if (!elements.withdrawalForm.hidden) {
      document.getElementById('walletWithdrawalAmount')?.focus();
    }
  });

  elements.withdrawalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !elements.withdrawalForm.reportValidity()) return;
    runOnce(elements.withdrawalForm, async () => {
      const amount = Number(document.getElementById('walletWithdrawalAmount')?.value || 0);
      const method = document.getElementById('walletSettlementMethod')?.value;
      const accountName = document.getElementById('walletSettlementName')?.value.trim();
      const accountNumber = document.getElementById('walletSettlementNumber')?.value.trim();
      const pin = document.getElementById('walletWithdrawalPin')?.value;
      const consent = document.getElementById('walletWithdrawalConsent')?.checked;
      const totals = calculateTotals();

      if (!consent) {
        setMessage(elements.withdrawalStatus, 'Confirm the settlement details and phone-call requirement before submitting.', 'error');
        return;
      }
      if (amount > totals.withdrawable) {
        setMessage(elements.withdrawalStatus, `You can currently withdraw up to ${money(totals.withdrawable)}.`, 'error');
        return;
      }

      setMessage(elements.withdrawalStatus, 'Sending your secure withdrawal request…');
      const requestId = elements.withdrawalForm.dataset.requestId || crypto.randomUUID();
      elements.withdrawalForm.dataset.requestId = requestId;
      const { data, error } = await client.rpc('submit_wallet_withdrawal', {
        p_amount_kes: amount,
        p_settlement_method: method,
        p_account_name: accountName,
        p_account_number: accountNumber,
        p_client_request_id: requestId,
        p_pin: pin
      });
      if (error) {
        setMessage(elements.withdrawalStatus, friendlyError(error), 'error');
        return;
      }
      if (!data?.success) {
        setMessage(elements.withdrawalStatus, walletCodeMessage(data?.code), 'error');
        if (data?.code === 'pin_locked') await loadWallet(currentUser);
        return;
      }

      elements.withdrawalForm.reset();
      delete elements.withdrawalForm.dataset.requestId;
      setMessage(elements.withdrawalStatus, 'Withdrawal request sent. Admin/Staff will call your profile phone number before approval.', 'success');
      await loadWallet(currentUser);
    });
  });

  const fetchStatementLedger = async () => {
    const entries = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client
        .from('wallet_ledger_entries')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      entries.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return entries;
  };

  const statementData = (statementEntries) => {
    const fromValue = document.getElementById('walletStatementFrom')?.value;
    const toValue = document.getElementById('walletStatementTo')?.value;
    const fromDate = fromValue ? new Date(`${fromValue}T00:00:00+03:00`) : null;
    const toDate = toValue ? new Date(`${toValue}T23:59:59.999+03:00`) : null;
    if (fromDate && toDate && fromDate > toDate) throw new Error('The statement start date must be before the end date.');
    const all = [...statementEntries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let running = 0;
    let opening = 0;
    const rows = [];
    all.forEach((entry) => {
      const date = new Date(entry.created_at);
      const signed = (entry.direction === 'credit' ? 1 : -1) * Number(entry.amount_kes);
      if (fromDate && date < fromDate) {
        running += signed;
        opening = running;
        return;
      }
      if (toDate && date > toDate) return;
      running += signed;
      rows.push({ ...entry, running_balance: running });
    });
    return { rows, opening, closing: rows.length ? rows.at(-1).running_balance : opening, fromValue, toValue };
  };

  const saveDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const xmlEscape = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

  const downloadStatementExcel = async () => {
    const statement = statementData(await fetchStatementLedger());
    if (!statement.rows.length) throw new Error('There are no confirmed wallet transactions in the selected period.');
    const customer = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email || 'LEOGO Customer';
    const rows = statement.rows.map((entry) => `
      <Row><Cell><Data ss:Type="String">${xmlEscape(kenyaDateTime(entry.created_at))}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(prettyStatus(entry.entry_type))}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(entry.description)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(entry.external_reference || '')}</Data></Cell><Cell><Data ss:Type="Number">${entry.direction === 'credit' ? Number(entry.amount_kes) : 0}</Data></Cell><Cell><Data ss:Type="Number">${entry.direction === 'debit' ? Number(entry.amount_kes) : 0}</Data></Cell><Cell><Data ss:Type="Number">${entry.running_balance}</Data></Cell></Row>`).join('');
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9E7F7" ss:Pattern="Solid"/></Style><Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00"/></Style></Styles><Worksheet ss:Name="Wallet Statement"><Table><Row><Cell ss:MergeAcross="6"><Data ss:Type="String">LEOGO DIGITAL MARKET — WALLET STATEMENT</Data></Cell></Row><Row><Cell ss:MergeAcross="6"><Data ss:Type="String">Customer: ${xmlEscape(customer)}</Data></Cell></Row><Row><Cell ss:MergeAcross="6"><Data ss:Type="String">Period: ${xmlEscape(statement.fromValue || 'Account opening')} to ${xmlEscape(statement.toValue || 'Present')}</Data></Cell></Row><Row><Cell ss:MergeAcross="6"><Data ss:Type="String">Opening balance: ${xmlEscape(money(statement.opening))} | Closing balance: ${xmlEscape(money(statement.closing))}</Data></Cell></Row><Row ss:StyleID="Header"><Cell><Data ss:Type="String">Date</Data></Cell><Cell><Data ss:Type="String">Type</Data></Cell><Cell><Data ss:Type="String">Description</Data></Cell><Cell><Data ss:Type="String">Reference</Data></Cell><Cell><Data ss:Type="String">Credit (KSh)</Data></Cell><Cell><Data ss:Type="String">Debit (KSh)</Data></Cell><Cell><Data ss:Type="String">Balance (KSh)</Data></Cell></Row>${rows}</Table></Worksheet></Workbook>`;
    saveDownload(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }), `LEOGO-Wallet-Statement-${localDateKey()}.xls`);
  };

  const pdfEscape = (value) => String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

  const downloadStatementPdf = async () => {
    const statement = statementData(await fetchStatementLedger());
    if (!statement.rows.length) throw new Error('There are no confirmed wallet transactions in the selected period.');
    const customer = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email || 'LEOGO Customer';
    const lines = [
      'LEOGO DIGITAL MARKET - WALLET STATEMENT',
      `Customer: ${customer}`,
      `Period: ${statement.fromValue || 'Account opening'} to ${statement.toValue || 'Present'}`,
      `Opening balance: ${money(statement.opening)}    Closing balance: ${money(statement.closing)}`,
      `Monthly maintenance: ${money(walletSettings.maintenance_fee_kes)} | Shopping reward: ${Number(walletSettings.reward_rate) * 100}% from ${money(walletSettings.reward_minimum_spend_kes)}`,
      '',
      'DATE              TYPE                 CREDIT       DEBIT        BALANCE',
      '--------------------------------------------------------------------------'
    ];
    statement.rows.forEach((entry) => {
      const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(entry.created_at));
      const type = prettyStatus(entry.entry_type).slice(0, 18).padEnd(19);
      const credit = (entry.direction === 'credit' ? numberFormat(entry.amount_kes) : '-').padStart(10);
      const debit = (entry.direction === 'debit' ? numberFormat(entry.amount_kes) : '-').padStart(10);
      const balance = numberFormat(entry.running_balance).padStart(12);
      lines.push(`${date.padEnd(17)} ${type} ${credit} ${debit} ${balance}`);
      lines.push(`  ${String(entry.description || '').slice(0, 78)}`);
    });
    lines.push('', 'Statement generated by LEOGO DIGITAL MARKET.', 'Customer care: 0700 192 545 | leogodigitalmarket@gmail.com');

    const pages = [];
    for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
    objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';
    pages.forEach((pageLines, index) => {
      const pageNumber = 4 + index * 2;
      const contentNumber = pageNumber + 1;
      const stream = `BT /F1 9 Tf 42 800 Td ${pageLines.map((line, lineIndex) => `${lineIndex ? '0 -15 Td ' : ''}(${pdfEscape(line)}) Tj`).join(' ')} ET`;
      objects[pageNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
      objects[contentNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = pdf.length;
      pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    saveDownload(new Blob([pdf], { type: 'application/pdf' }), `LEOGO-Wallet-Statement-${localDateKey()}.pdf`);
  };

  const runStatementDownload = async (button, task, successMessage) => {
    if (!currentUser) return;
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Preparing…';
    try {
      setMessage(elements.statementStatus, 'Preparing your complete verified statement…');
      await task();
      setMessage(elements.statementStatus, successMessage, 'success');
    } catch (error) {
      setMessage(elements.statementStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  elements.downloadExcel?.addEventListener('click', () => {
    runStatementDownload(elements.downloadExcel, downloadStatementExcel, 'Excel statement downloaded successfully.');
  });

  elements.downloadPdf?.addEventListener('click', () => {
    runStatementDownload(elements.downloadPdf, downloadStatementPdf, 'PDF statement downloaded successfully.');
  });

  const challengeStart = document.getElementById('walletChallengeStart');
  if (challengeStart) {
    const today = localDateKey();
    challengeStart.min = today;
    challengeStart.max = addDays(today, 30);
    if (!challengeStart.value) challengeStart.value = today;
  }

  document.addEventListener('leogo:authchange', (event) => loadWallet(event.detail?.user || null));
  client.auth.getSession().then(({ data }) => loadWallet(data.session?.user || null));
  clearWallet();
})();

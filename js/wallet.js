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
  let loadVersion = 0;

  const money = (value) => 'KSh ' + Number(value || 0).toLocaleString('en-KE');
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
    const balance = ledgerEntries.reduce((total, entry) => total + (entry.direction === 'credit' ? Number(entry.amount_kes) : -Number(entry.amount_kes)), 0);
    const totalSaved = ledgerEntries.reduce((total, entry) => total + (
      entry.direction === 'credit' && ['normal_saving', 'challenge_saving'].includes(entry.entry_type)
        ? Number(entry.amount_kes)
        : 0
    ), 0);
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
    const reserved = withdrawalRequests
      .filter((request) => request.request_status === 'pending_call')
      .reduce((total, request) => total + Number(request.requested_amount_kes), 0);
    return {
      balance: Math.max(0, balance),
      withdrawable: Math.max(0, balance - reserved),
      reserved,
      totalSaved,
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
    if (elements.streak) elements.streak.textContent = `${totals.streak} ${totals.streak === 1 ? 'day' : 'days'}`;
    const openLoan = loanApplications.find((loan) => ['pending', 'under_review'].includes(loan.application_status));
    if (elements.eligibility) {
      elements.eligibility.textContent = openLoan ? 'Under review' : (totals.totalSaved > 0 ? 'History building' : 'Not assessed');
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
    setBadge('SIGN IN REQUIRED');
    renderSummary();
    renderTransactions();
    renderChallenge();
    renderWithdrawals();
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
    const [accountsResult, challengesResult, depositsResult, ledgerResult, loansResult, withdrawalsResult] = await Promise.all([
      client.from('wallet_accounts').select('user_id,account_status,opened_at').eq('user_id', user.id).maybeSingle(),
      client.from('wallet_challenges').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      client.from('wallet_deposit_requests').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(200),
      client.from('wallet_ledger_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      client.from('wallet_loan_applications').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(50),
      client.from('wallet_withdrawal_requests').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(50)
    ]);
    if (version !== loadVersion || currentUser?.id !== user.id) return;
    const error = [accountsResult, challengesResult, depositsResult, ledgerResult, loansResult, withdrawalsResult].find((result) => result.error)?.error;
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
    setBadge(account?.account_status === 'frozen' ? 'ACCOUNT FROZEN' : 'LIVE & SECURE', account?.account_status === 'frozen' ? '' : 'live');
    renderSummary();
    renderTransactions();
    renderChallenge();
    renderWithdrawals();
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

  elements.withdrawalToggle?.addEventListener('click', () => {
    if (!currentUser) {
      document.querySelector('[data-customer-view="auth"]')?.click();
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
      const { error } = await client.rpc('submit_wallet_withdrawal', {
        p_amount_kes: amount,
        p_settlement_method: method,
        p_account_name: accountName,
        p_account_number: accountNumber,
        p_client_request_id: requestId
      });
      if (error) {
        setMessage(elements.withdrawalStatus, friendlyError(error), 'error');
        return;
      }

      elements.withdrawalForm.reset();
      delete elements.withdrawalForm.dataset.requestId;
      setMessage(elements.withdrawalStatus, 'Withdrawal request sent. Admin/Staff will call your profile phone number before approval.', 'success');
      await loadWallet(currentUser);
    });
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

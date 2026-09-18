// LEOGO DIGITAL MARKET — Admin Control Center V1
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const supabaseFactory = window.supabase?.createClient;
  const db = supabaseFactory ? supabaseFactory(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  }) : null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    admin: null,
    user: null,
    approvals: [],
    approvalFilter: 'all',
    activeApproval: null,
    customers: [],
    business: null,
    paymentAccounts: [],
    paymentAssignments: [],
    pickupStations: [],
    walletSettings: null,
    premiumPlans: [],
    busy: false
  };

  const viewTitles = {
    dashboard: 'Dashboard', approvals: 'Approval Center', orders: 'Orders', customers: 'Customers',
    products: 'Products & Categories', sellers: 'Sellers', providers: 'Service Providers',
    transport: 'Transport & Parcel Delivery', wallet: 'Wallet & SACCO', premium: 'Premium',
    accommodation: 'Accommodation', loyalty: 'Loyalty & Rewards', reports: 'Reports',
    settings: 'System Settings', audit: 'Audit Log'
  };
  const kindLabels = {
    premium_customer: 'Premium Customer', premium_profile: 'Verified Premium Profile',
    premium_payment: 'Premium Payment', wallet_deposit: 'Wallet Deposit', wallet_loan: 'Wallet Loan',
    wallet_withdrawal: 'Wallet Withdrawal', accommodation_host: 'Accommodation Host',
    accommodation_property: 'Accommodation Property'
  };
  const functionLabels = {
    wallet_sacco_deposits: 'Wallet / SACCO Deposits', savings_challenge: 'Savings Challenge',
    loan_repayment: 'Loan Repayment', marketplace_orders: 'Marketplace Orders',
    lipa_pole_pole: 'Lipa Pole Pole', premium_payments: 'Premium Payments',
    accommodation_payments: 'Accommodation Payments', service_payments: 'Service Payments',
    transport_payments: 'Transport & Parcel Delivery', other_revenue: 'Other Revenue'
  };

  const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const formatMoney = (value) => `KSh ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
  const formatDate = (value, withTime = false) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-KE', withTime
      ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }
      : { dateStyle: 'medium', timeZone: 'Africa/Nairobi' }).format(date);
  };
  const friendlyError = (error) => {
    const message = String(error?.message || error || 'Something went wrong.');
    if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
    if (/admin access required|permission required/i.test(message)) return 'This account does not have permission for that Admin action.';
    if (/failed to fetch|network/i.test(message)) return 'Connection failed. Check your internet and try again.';
    return message.replace(/^Error:\s*/i, '');
  };
  const setFormStatus = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.className = `form-status${type ? ` ${type}` : ''}`;
  };
  let statusTimer;
  const globalStatus = (message, type = 'success') => {
    const element = $('#adminGlobalStatus');
    if (!element) return;
    clearTimeout(statusTimer);
    element.textContent = message;
    element.className = `global-status show ${type}`;
    statusTimer = setTimeout(() => { element.className = 'global-status'; }, 4500);
  };
  const withButtonLock = async (button, label, work) => {
    if (!button || button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { return await work(); }
    finally { button.disabled = false; button.textContent = original; }
  };

  const showGate = (name) => {
    $('#adminAuthGate').hidden = name !== 'login';
    $('#adminAccessDenied').hidden = name !== 'denied';
    $('#adminApp').hidden = name !== 'app';
  };

  const verifyAdmin = async (user) => {
    if (!user || !db) return null;
    const { data, error } = await db.from('admin_users')
      .select('user_id,display_name,role,status,permissions')
      .eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data?.status === 'active' ? data : null;
  };

  const enterAdmin = async (user) => {
    try {
      const admin = await verifyAdmin(user);
      state.user = user;
      state.admin = admin;
      if (!admin) { showGate('denied'); return; }
      showGate('app');
      const name = admin.display_name || user.email || 'LEOGO Admin';
      $('#adminDisplayName').textContent = name;
      $('#adminRole').textContent = admin.role.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      $('#adminInitials').textContent = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
      $('#dashboardGreeting').textContent = `Good day, ${name.split(/\s+/)[0]}`;
      await loadAll();
    } catch (error) {
      showGate('denied');
      globalStatus(friendlyError(error), 'error');
    }
  };

  const initializeAuth = async () => {
    if (!db) {
      showGate('login');
      setFormStatus($('#adminLoginStatus'), 'The secure connection could not load. Refresh this page.', 'error');
      return;
    }
    const { data, error } = await db.auth.getSession();
    if (error || !data.session?.user) { showGate('login'); return; }
    await enterAdmin(data.session.user);
  };

  const loadAll = async () => {
    const loaders = [loadDashboard, loadApprovals, loadCustomers, loadBusinessSettings,
      loadPaymentSettings, loadPickupStations, loadWalletSettings, loadPremiumPlans,
      loadAccommodationSummary, loadAuditLog];
    const results = await Promise.allSettled(loaders.map((load) => load()));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) globalStatus(`Some Admin data could not load: ${friendlyError(failed.reason)}`, 'error');
    $('#lastSynced').textContent = formatDate(new Date().toISOString(), true);
  };

  const loadDashboard = async () => {
    const { data, error } = await db.rpc('admin_dashboard_summary');
    if (error) throw error;
    $('#statApprovals').textContent = data.pending_approvals ?? 0;
    $('#statCustomers').textContent = data.customers ?? 0;
    $('#statWallet').textContent = data.wallet_pending ?? 0;
    $('#statPickup').textContent = data.pickup_stations ?? 0;
    $('#statPaymentAccounts').textContent = data.active_payment_accounts ?? 0;
    $('#sidebarApprovalCount').textContent = data.pending_approvals ?? 0;
  };

  const loadApprovals = async () => {
    const { data, error } = await db.rpc('admin_list_approval_queue');
    if (error) throw error;
    state.approvals = data || [];
    renderApprovals();
    const compact = $('#dashboardApprovalList');
    const recent = state.approvals.slice(0, 5);
    compact.innerHTML = recent.length ? recent.map((item) => `<div><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.applicant_name)} · ${formatDate(item.submitted_at)}</small></div><span class="status-chip">${escapeHtml(item.status)}</span></div>`).join('') : '<div class="empty-mini">No pending approvals. Your queue is clear.</div>';
  };

  const approvalGroup = (kind) => kind.startsWith('premium') ? 'premium' : kind.startsWith('wallet') ? 'wallet' : kind.startsWith('accommodation') ? 'accommodation' : 'other';
  const renderApprovals = () => {
    const visible = state.approvalFilter === 'all' ? state.approvals : state.approvals.filter((item) => approvalGroup(item.kind) === state.approvalFilter);
    $('#approvalFilters [data-approval-filter="all"] b').textContent = state.approvals.length;
    $('#approvalQueue').innerHTML = visible.length ? visible.map((item) => `<article class="approval-card">
      <header><div><span class="eyebrow">${escapeHtml(kindLabels[item.kind] || item.kind)}</span><h3>${escapeHtml(item.title)}</h3></div><span class="status-chip">${escapeHtml(item.status)}</span></header>
      <div class="applicant"><b>${escapeHtml(item.applicant_name || 'Customer')}</b><p>${escapeHtml(item.applicant_email || 'No email')}<br>${escapeHtml(item.subtitle || '')}</p></div>
      <footer><strong>${item.amount_kes == null ? '' : formatMoney(item.amount_kes)}</strong><button type="button" data-review-id="${escapeHtml(item.record_id)}" data-review-kind="${escapeHtml(item.kind)}">Review →</button></footer>
    </article>`).join('') : '<div class="loading-card">No pending requests in this queue.</div>';
    $$('[data-review-id]', $('#approvalQueue')).forEach((button) => button.addEventListener('click', () => openApproval(button.dataset.reviewKind, button.dataset.reviewId)));
  };

  const openApproval = (kind, id) => {
    const item = state.approvals.find((entry) => entry.kind === kind && entry.record_id === id);
    if (!item) return;
    state.activeApproval = item;
    $('#reviewModalTitle').textContent = item.title;
    $('#reviewApplicant').innerHTML = `<strong>${escapeHtml(item.applicant_name || 'Customer')}</strong><p>${escapeHtml(item.applicant_email || '')}<br>${escapeHtml(item.subtitle || '')}${item.amount_kes == null ? '' : `<br><b>${formatMoney(item.amount_kes)}</b>`}</p>`;
    const hiddenKeys = new Set(['id', 'user_id', 'withdrawal_pin_hash']);
    const detailRows = Object.entries(item.payload || {}).filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== '' && typeof value !== 'object').slice(0, 14);
    $('#reviewDetails').innerHTML = detailRows.map(([key, value]) => `<div><small>${escapeHtml(key.replaceAll('_', ' '))}</small><b>${escapeHtml(typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value)}</b></div>`).join('');
    $('#reviewNotes').value = '';
    setFormStatus($('#reviewStatus'));
    const underReview = $('[data-review-action="under_review"]');
    const approve = $('[data-review-action="approve"]');
    underReview.hidden = ['premium_payment', 'wallet_deposit', 'wallet_withdrawal'].includes(kind);
    approve.textContent = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'Mark Customer Called' : 'Approve';
    approve.dataset.reviewAction = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'contacted' : 'approve';
    $('#approvalReviewModal').hidden = false;
  };

  const reviewApproval = async (button) => {
    const item = state.activeApproval;
    if (!item) return;
    const decision = button.dataset.reviewAction;
    const notes = $('#reviewNotes').value.trim();
    if (decision === 'reject' && notes.length < 3) {
      setFormStatus($('#reviewStatus'), 'Add a clear rejection reason before rejecting.', 'error'); return;
    }
    await withButtonLock(button, 'Saving…', async () => {
      const { error } = await db.rpc('admin_review_approval', {
        p_kind: item.kind, p_record_id: item.record_id, p_decision: decision, p_notes: notes || null
      });
      if (error) { setFormStatus($('#reviewStatus'), friendlyError(error), 'error'); return; }
      closeModals();
      globalStatus(decision === 'contacted' ? 'Customer call recorded. The withdrawal can now be approved.' : 'Approval decision saved and audited.');
      await Promise.all([loadApprovals(), loadDashboard(), loadAuditLog()]);
    });
  };

  const loadCustomers = async () => {
    const { data, error } = await db.rpc('admin_list_customers');
    if (error) throw error;
    state.customers = data || [];
    renderCustomers();
  };
  const renderCustomers = () => {
    const term = ($('#customerSearch')?.value || '').trim().toLowerCase();
    const rows = state.customers.filter((customer) => !term || [customer.full_name, customer.email, customer.phone, customer.county, customer.sub_county, customer.estate].some((value) => String(value || '').toLowerCase().includes(term)));
    $('#customerTableBody').innerHTML = rows.length ? rows.map((customer) => `<tr><td><strong>${escapeHtml(customer.full_name || 'Profile incomplete')}</strong><small>${escapeHtml(customer.email || '')}</small></td><td>${escapeHtml(customer.phone || '—')}</td><td>${escapeHtml([customer.county, customer.sub_county, customer.estate].filter(Boolean).join(' · ') || '—')}</td><td>${formatDate(customer.created_at)}</td><td>${formatDate(customer.last_sign_in_at, true)}</td></tr>`).join('') : '<tr><td colspan="5">No customers match this search.</td></tr>';
  };

  const loadBusinessSettings = async () => {
    const { data, error } = await db.from('business_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    state.business = data;
    const form = $('#businessSettingsForm');
    Object.entries(data).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; });
  };

  const saveBusinessSettings = async (event) => {
    event.preventDefault();
    const button = event.submitter || $('button[type="submit"]', event.currentTarget);
    await withButtonLock(button, 'Saving…', async () => {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const { data, error } = await db.rpc('admin_update_business_settings', { p_settings: payload });
      if (error) { setFormStatus($('#businessSettingsStatus'), friendlyError(error), 'error'); return; }
      state.business = data;
      setFormStatus($('#businessSettingsStatus'), 'Business details saved. The change is recorded in Audit Log.', 'success');
      await loadAuditLog();
    });
  };

  const loadPaymentSettings = async () => {
    const [accountsResult, assignmentsResult] = await Promise.all([
      db.from('payment_accounts').select('*').order('created_at', { ascending: false }),
      db.from('payment_account_assignments').select('*').order('function_code')
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    state.paymentAccounts = accountsResult.data || [];
    state.paymentAssignments = assignmentsResult.data || [];
    renderPaymentAccounts();
    renderPaymentAssignments();
  };

  const accountNumber = (account) => account.till_number || account.paybill_number || account.account_number || 'Instructions only';
  const renderPaymentAccounts = () => {
    $('#paymentAccountList').innerHTML = state.paymentAccounts.length ? state.paymentAccounts.map((account) => `<article class="payment-card">
      <header><div><h3>${escapeHtml(account.display_name)}</h3><span class="status-chip">${escapeHtml(account.status)}</span></div><b>${escapeHtml(account.account_type.replaceAll('_', ' '))}</b></header>
      <p><strong>${escapeHtml(accountNumber(account))}</strong><br>${escapeHtml(account.purpose_description || 'No purpose description')}<br>${escapeHtml(account.instructions || '')}</p>
      <div class="card-actions"><button data-edit-payment="${account.id}">Edit</button>${account.status === 'active' ? `<button data-payment-status="inactive" data-payment-id="${account.id}">Deactivate</button>` : `<button data-payment-status="active" data-payment-id="${account.id}">Activate</button>`}<button class="danger" data-payment-status="archived" data-payment-id="${account.id}">Archive</button></div>
    </article>`).join('') : '<div class="loading-card">No payment destination yet. Add the first Till, Paybill, bank, or other account.</div>';
    $$('[data-edit-payment]').forEach((button) => button.addEventListener('click', () => openPaymentModal(button.dataset.editPayment)));
    $$('[data-payment-status]').forEach((button) => button.addEventListener('click', () => changePaymentStatus(button)));
  };

  const renderPaymentAssignments = () => {
    const active = state.paymentAccounts.filter((account) => account.status === 'active');
    $('#paymentAssignmentList').innerHTML = Object.entries(functionLabels).map(([code, label]) => {
      const assignment = state.paymentAssignments.find((item) => item.function_code === code);
      return `<div class="assignment-row"><label>${escapeHtml(label)}<select data-assignment-code="${code}"><option value="">Choose active account…</option>${active.map((account) => `<option value="${account.id}" ${assignment?.account_id === account.id ? 'selected' : ''}>${escapeHtml(account.display_name)} — ${escapeHtml(accountNumber(account))}</option>`).join('')}</select></label></div>`;
    }).join('');
    $$('[data-assignment-code]').forEach((select) => select.addEventListener('change', () => assignPaymentAccount(select)));
  };

  const togglePaymentFields = () => {
    const type = $('#paymentAccountType').value;
    $$('[data-payment-field]').forEach((label) => {
      const tags = label.dataset.paymentField.split(' ');
      label.hidden = !(tags.includes(type.replace('mpesa_', '')) || (tags.includes('business') && ['mpesa_till', 'mpesa_paybill'].includes(type)) || (tags.includes('account_name') && ['mpesa_till', 'bank'].includes(type)) || (tags.includes('account_number') && ['mpesa_paybill', 'bank', 'other'].includes(type)));
    });
  };

  const openPaymentModal = (id = '') => {
    const form = $('#paymentAccountForm');
    form.reset();
    const account = state.paymentAccounts.find((item) => item.id === id);
    if (account) Object.entries(account).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; });
    form.elements.id.value = id;
    $('#paymentModalTitle').textContent = account ? 'Edit Payment Method' : 'Add Payment Method';
    setFormStatus($('#paymentAccountStatus'));
    togglePaymentFields();
    $('#paymentAccountModal').hidden = false;
  };

  const savePaymentAccount = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    await withButtonLock(button, 'Saving…', async () => {
      const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
      const id = fields.id || null;
      delete fields.id;
      fields.status = state.paymentAccounts.find((item) => item.id === id)?.status || 'active';
      const { error } = await db.rpc('admin_save_payment_account', { p_account_id: id, p_account: fields });
      if (error) { setFormStatus($('#paymentAccountStatus'), friendlyError(error), 'error'); return; }
      closeModals();
      globalStatus(`Payment account ${id ? 'updated' : 'created'} and audited.`);
      await Promise.all([loadPaymentSettings(), loadDashboard(), loadAuditLog()]);
    });
  };

  const changePaymentStatus = async (button) => {
    const status = button.dataset.paymentStatus;
    if (status === 'archived' && !window.confirm('Archive this payment account? Existing transaction history is retained and assignments will be removed.')) return;
    await withButtonLock(button, 'Saving…', async () => {
      const { error } = await db.rpc('admin_set_payment_account_status', { p_account_id: button.dataset.paymentId, p_status: status });
      if (error) { globalStatus(friendlyError(error), 'error'); return; }
      globalStatus(`Payment account marked ${status}.`);
      await Promise.all([loadPaymentSettings(), loadDashboard(), loadAuditLog()]);
    });
  };

  const assignPaymentAccount = async (select) => {
    if (!select.value) return;
    select.disabled = true;
    const { error } = await db.rpc('admin_assign_payment_account', { p_function_code: select.dataset.assignmentCode, p_account_id: select.value });
    select.disabled = false;
    if (error) { globalStatus(friendlyError(error), 'error'); await loadPaymentSettings(); return; }
    globalStatus(`${functionLabels[select.dataset.assignmentCode]} payment destination updated.`);
    await Promise.all([loadPaymentSettings(), loadAuditLog()]);
  };

  const loadPickupStations = async () => {
    const { data, error } = await db.from('pickup_stations').select('*').order('display_order').order('station_name');
    if (error) throw error;
    state.pickupStations = data || [];
    renderPickupStations();
  };
  const renderPickupStations = () => {
    $('#pickupStationList').innerHTML = state.pickupStations.length ? state.pickupStations.map((station) => `<article class="station-card"><header><div><h3>${escapeHtml(station.station_name)}</h3><span class="status-chip">${station.is_active ? 'Active' : 'Inactive'}</span></div><strong>${Number(station.service_fee_percent || 0)}%</strong></header><p>${escapeHtml(station.address_line)}${station.door_number ? `, Door ${escapeHtml(station.door_number)}` : ''}<br>${escapeHtml([station.town, station.sub_county, station.county].filter(Boolean).join(' · '))}<br>${escapeHtml(station.landmark || '')}</p><div class="card-actions"><button data-edit-station="${station.id}">Edit Station</button></div></article>`).join('') : '<div class="loading-card">No pickup stations configured.</div>';
    $$('[data-edit-station]').forEach((button) => button.addEventListener('click', () => openPickupModal(button.dataset.editStation)));
  };
  const openPickupModal = (id = '') => {
    const form = $('#pickupStationForm');
    form.reset();
    const station = state.pickupStations.find((item) => item.id === id);
    if (station) Object.entries(station).forEach(([key, value]) => {
      if (!form.elements[key]) return;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = Boolean(value);
      else form.elements[key].value = value ?? '';
    });
    form.elements.id.value = id;
    $('#pickupModalTitle').textContent = station ? 'Edit Pickup Station' : 'Add Pickup Station';
    setFormStatus($('#pickupStationStatus'));
    $('#pickupStationModal').hidden = false;
  };
  const savePickupStation = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    await withButtonLock(button, 'Saving…', async () => {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const id = values.id || null;
      delete values.id;
      values.is_active = event.currentTarget.elements.is_active.checked;
      const { error } = await db.rpc('admin_save_pickup_station', { p_station_id: id, p_station: values });
      if (error) { setFormStatus($('#pickupStationStatus'), friendlyError(error), 'error'); return; }
      closeModals();
      globalStatus(`Pickup station ${id ? 'updated' : 'created'} and audited.`);
      await Promise.all([loadPickupStations(), loadDashboard(), loadAuditLog()]);
    });
  };

  const loadWalletSettings = async () => {
    const { data, error } = await db.from('wallet_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    state.walletSettings = data;
    const form = $('#walletFeesForm');
    ['maintenance_fee_kes', 'statement_fee_per_200_kes', 'reward_minimum_spend_kes', 'reward_rate'].forEach((key) => { form.elements[key].value = data[key] ?? 0; });
    $('#walletMaintenanceSummary').textContent = formatMoney(data.maintenance_fee_kes);
    $('#walletStatementSummary').textContent = formatMoney(data.statement_fee_per_200_kes);
    $('#walletRewardMinimumSummary').textContent = formatMoney(data.reward_minimum_spend_kes);
    $('#walletRewardRateSummary').textContent = `${Number(data.reward_rate || 0) * 100}%`;
  };
  const saveWalletSettings = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    await withButtonLock(button, 'Saving…', async () => {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const { error } = await db.rpc('admin_save_wallet_settings', {
        p_maintenance_fee_kes: Number(values.maintenance_fee_kes),
        p_reward_minimum_spend_kes: Number(values.reward_minimum_spend_kes),
        p_reward_rate: Number(values.reward_rate),
        p_statement_fee_per_200_kes: Number(values.statement_fee_per_200_kes)
      });
      if (error) { setFormStatus($('#walletFeesStatus'), friendlyError(error), 'error'); return; }
      setFormStatus($('#walletFeesStatus'), 'Fee and reward rules saved and audited.', 'success');
      await Promise.all([loadWalletSettings(), loadAuditLog()]);
    });
  };

  const loadPremiumPlans = async () => {
    const { data, error } = await db.from('premium_plans').select('*').order('duration_hours');
    if (error) throw error;
    state.premiumPlans = data || [];
    $('#premiumPlanList').innerHTML = state.premiumPlans.length ? state.premiumPlans.map((plan) => `<article class="plan-card"><header><div><h3>${escapeHtml(plan.plan_name || plan.name || 'Premium plan')}</h3><span class="status-chip">${plan.is_active ? 'Active' : 'Inactive'}</span></div><strong>${formatMoney(plan.amount_kes)}</strong></header><p>${Number(plan.duration_hours || 0)} hours of Premium access after confirmed payment.</p><div class="card-actions"><button data-edit-plan="${plan.id}">Edit Rate &amp; Duration</button></div></article>`).join('') : '<div class="loading-card">No Premium plans found.</div>';
    $$('[data-edit-plan]').forEach((button) => button.addEventListener('click', () => editPremiumPlan(button.dataset.editPlan)));
  };
  const editPremiumPlan = async (id) => {
    const plan = state.premiumPlans.find((item) => item.id === id);
    if (!plan) return;
    const amount = window.prompt('Premium price in KSh:', plan.amount_kes);
    if (amount === null) return;
    const hours = window.prompt('Access duration in hours:', plan.duration_hours);
    if (hours === null) return;
    const active = window.confirm('Press OK to keep this plan active. Press Cancel to make it inactive.');
    const { error } = await db.rpc('admin_save_premium_plan', { p_plan_id: id, p_amount_kes: Number(amount), p_duration_hours: Number(hours), p_is_active: active });
    if (error) { globalStatus(friendlyError(error), 'error'); return; }
    globalStatus('Premium plan updated and audited.');
    await Promise.all([loadPremiumPlans(), loadAuditLog()]);
  };

  const loadAccommodationSummary = async () => {
    const [hosts, properties, bookings] = await Promise.all([
      db.from('accommodation_hosts').select('*', { count: 'exact', head: true }),
      db.from('accommodation_properties').select('*', { count: 'exact', head: true }),
      db.from('accommodation_bookings').select('*', { count: 'exact', head: true })
    ]);
    if (hosts.error) throw hosts.error;
    if (properties.error) throw properties.error;
    if (bookings.error) throw bookings.error;
    $('#accommodationHostCount').textContent = hosts.count || 0;
    $('#accommodationPropertyCount').textContent = properties.count || 0;
    $('#accommodationBookingCount').textContent = bookings.count || 0;
  };

  const loadAuditLog = async () => {
    const { data, error } = await db.from('admin_audit_log').select('id,actor_email,action,entity_type,entity_id,created_at').order('created_at', { ascending: false }).limit(150);
    if (error) throw error;
    $('#auditTableBody').innerHTML = data?.length ? data.map((entry) => `<tr><td>${formatDate(entry.created_at, true)}</td><td>${escapeHtml(entry.actor_email || 'System')}</td><td><strong>${escapeHtml(entry.action)}</strong></td><td>${escapeHtml(entry.entity_type)}</td><td><small>${escapeHtml(entry.entity_id || '—')}</small></td></tr>`).join('') : '<tr><td colspan="5">No audited Admin actions yet.</td></tr>';
  };

  const changeView = (view, settingsTab = '') => {
    $$('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.adminPanel === view));
    $$('.admin-nav [data-admin-view]').forEach((button) => button.classList.toggle('active', button.dataset.adminView === view && (!button.dataset.settingsTab || button.dataset.settingsTab === settingsTab)));
    $('#adminPageTitle').textContent = viewTitles[view] || 'Admin Control Center';
    $('#adminBreadcrumb').textContent = view === 'settings' ? 'ADMINISTRATION' : 'CONTROL CENTER';
    if (view === 'settings') changeSettingsTab(settingsTab || 'business');
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeSettingsTab = (tab) => {
    $$('#settingsTabs [data-settings-panel]').forEach((button) => button.classList.toggle('active', button.dataset.settingsPanel === tab));
    $$('[data-settings-content]').forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsContent === tab));
  };
  const closeSidebar = () => { $('#adminSidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('open'); };
  const closeModals = () => { $$('.modal').forEach((modal) => { modal.hidden = true; }); state.activeApproval = null; };

  const bindEvents = () => {
    $('#adminLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('#adminLoginButton');
      setFormStatus($('#adminLoginStatus'));
      await withButtonLock(button, 'Signing in…', async () => {
        const { data, error } = await db.auth.signInWithPassword({ email: $('#adminEmail').value.trim(), password: $('#adminPassword').value });
        if (error) { setFormStatus($('#adminLoginStatus'), friendlyError(error), 'error'); return; }
        await enterAdmin(data.user);
      });
    });
    const signOut = async () => { await db?.auth.signOut(); state.admin = null; state.user = null; showGate('login'); };
    $('#adminLogout').addEventListener('click', signOut);
    $('#deniedLogout').addEventListener('click', signOut);
    $('#openSidebar').addEventListener('click', () => { $('#adminSidebar').classList.add('open'); $('#sidebarScrim').classList.add('open'); });
    $('#closeSidebar').addEventListener('click', closeSidebar);
    $('#sidebarScrim').addEventListener('click', closeSidebar);
    $$('[data-admin-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.adminView, button.dataset.settingsTab || '')));
    $$('[data-open-view]').forEach((button) => button.addEventListener('click', () => {
      changeView(button.dataset.openView);
      if (button.dataset.filterTarget) {
        state.approvalFilter = button.dataset.filterTarget;
        $$('#approvalFilters [data-approval-filter]').forEach((item) => item.classList.toggle('active', item.dataset.approvalFilter === state.approvalFilter));
        renderApprovals();
      }
    }));
    $$('#settingsTabs [data-settings-panel]').forEach((button) => button.addEventListener('click', () => changeSettingsTab(button.dataset.settingsPanel)));
    $$('#approvalFilters [data-approval-filter]').forEach((button) => button.addEventListener('click', () => {
      state.approvalFilter = button.dataset.approvalFilter;
      $$('#approvalFilters [data-approval-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderApprovals();
    }));
    $('#refreshAdminData').addEventListener('click', () => withButtonLock($('#refreshAdminData'), 'Refreshing…', loadAll));
    $('#refreshApprovals').addEventListener('click', () => withButtonLock($('#refreshApprovals'), 'Refreshing…', async () => { await Promise.all([loadApprovals(), loadDashboard()]); }));
    $('#refreshAudit').addEventListener('click', () => withButtonLock($('#refreshAudit'), 'Refreshing…', loadAuditLog));
    $('#customerSearch').addEventListener('input', renderCustomers);
    $('#businessSettingsForm').addEventListener('submit', saveBusinessSettings);
    $('#walletFeesForm').addEventListener('submit', saveWalletSettings);
    $('#addPaymentAccount').addEventListener('click', () => openPaymentModal());
    $('#paymentAccountType').addEventListener('change', togglePaymentFields);
    $('#paymentAccountForm').addEventListener('submit', savePaymentAccount);
    $('#addPickupStation').addEventListener('click', () => openPickupModal());
    $('#pickupStationForm').addEventListener('submit', savePickupStation);
    $$('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
    $$('#reviewActions [data-review-action]').forEach((button) => button.addEventListener('click', () => reviewApproval(button)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModals(); closeSidebar(); } });
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    initializeAuth();
  });
})();

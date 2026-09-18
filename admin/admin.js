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
    audit: [],
    dashboard: null,
    dashboardRange: 'today',
    dashboardFrom: null,
    dashboardTo: null,
    selectedCustomers: new Set(),
    selectedData: new Set(),
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
    renderDataManagement();
    $('#lastSynced').textContent = formatDate(new Date().toISOString(), true);
  };

  const dashboardDates = () => {
    const now = new Date();
    let from;
    if (state.dashboardRange === 'custom' && state.dashboardFrom && state.dashboardTo) {
      from = new Date(`${state.dashboardFrom}T00:00:00+03:00`);
      const to = new Date(`${state.dashboardTo}T00:00:00+03:00`); to.setDate(to.getDate() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const nairobiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    from = new Date(nairobiNow); from.setHours(0, 0, 0, 0);
    if (state.dashboardRange !== 'today') from.setDate(from.getDate() - (Number(state.dashboardRange) - 1));
    return { from: new Date(from.getTime() - 3 * 3600000).toISOString(), to: now.toISOString() };
  };
  const metricValue = (metric, money = false) => !metric?.supported ? '—' : money ? formatMoney(metric.value) : Number(metric.value || 0).toLocaleString('en-KE');
  const dashboardLabel = () => state.dashboardRange === 'today' ? 'Today' : state.dashboardRange === 'custom' ? `${state.dashboardFrom} to ${state.dashboardTo}` : `Last ${state.dashboardRange} days`;
  const loadDashboard = async () => {
    const range = dashboardDates();
    const { data, error } = await db.rpc('admin_production_dashboard', { p_from: range.from, p_to: range.to });
    if (error) throw error;
    state.dashboard = data;
    $('#statOrders').textContent = metricValue(data.top.orders);
    $('#statSales').textContent = metricValue(data.top.gross_sales, true);
    $('#statRevenue').textContent = formatMoney(data.top.leogo_revenue.value);
    $('#statApprovals').textContent = metricValue(data.top.pending_approvals);
    $('#statDeliveries').textContent = metricValue(data.top.active_deliveries);
    $('#sidebarApprovalCount').textContent = data.top.pending_approvals.value ?? 0;
    $('#financialOverview').innerHTML = [
      ['Gross Order Sales', data.revenue.gross_order_sales, true], ['Platform / Service Fees', data.revenue.platform_fees, true],
      ['Delivery Fees Earned', data.revenue.delivery_fees, true], ['Pickup Station Fees', data.revenue.pickup_fees, true],
      ['Premium Revenue', data.revenue.premium, true], ['Service Commission', data.revenue.service_commission, true],
      ['Accommodation Commission', data.revenue.accommodation_commission, true], ['Other LEOGO Revenue', data.revenue.other, true]
    ].map(([label, value, money]) => `<div><span>${label}</span><strong class="${value.supported ? '' : 'not-connected'}">${metricValue(value, money)}</strong><small>${value.supported ? '' : 'Not connected'}</small></div>`).join('') + `<div class="metric-total"><span>Total LEOGO Revenue</span><strong>${formatMoney(data.revenue.total_leogo)}</strong><small>${escapeHtml(dashboardLabel())}</small></div>`;
    const wallet = data.wallet;
    $('#walletSnapshot').innerHTML = [
      ['Deposits', formatMoney(wallet.deposits)], ['Withdrawals', formatMoney(wallet.withdrawals)], ['Savings Deposits', formatMoney(wallet.savings_deposits)],
      ['Pending Deposits', wallet.pending_deposits], ['Pending Withdrawals', wallet.pending_withdrawals], ['Active Challenges', wallet.active_challenges],
      ['Loan Applications', wallet.loan_applications], ['Active Loans', metricValue(wallet.active_loans)], ['Overdue Loans', metricValue(wallet.overdue_loans)]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
    const networkMap = [['Customers','customers','customers'],['Sellers','sellers','sellers'],['Service Providers','service_providers','providers'],['Transport Providers','transport_providers','transport'],['Premium Profiles','premium_profiles','premium'],['Accommodation Providers','accommodation_providers','accommodation'],['Products','products','products'],['Pickup Stations','pickup_stations','transport']];
    $('#networkOverview').innerHTML = networkMap.map(([label,key,view]) => `<button data-open-view="${view}"><span>${escapeHtml(label)}</span><strong>${metricValue(data.network[key])}</strong><small>${data.network[key].supported ? 'Open module →' : 'Not connected'}</small></button>`).join('');
    $('#systemAlertList').innerHTML = data.alerts?.length ? data.alerts.map((item) => `<div class="alert-row ${escapeHtml(item.level)}"><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></div><button data-alert-view="${escapeHtml(item.view)}" data-alert-tab="${escapeHtml(item.tab || '')}">Review →</button></div>`).join('') : '<div class="empty-mini">No operational exceptions detected.</div>';
    $('#recentAdminActivity').innerHTML = data.recent_admin_activity?.length ? data.recent_admin_activity.map((item) => `<div><div><b>${escapeHtml(item.action.replaceAll('.', ' '))}</b><small>${escapeHtml(item.admin)} · ${formatDate(item.created_at, true)}</small></div><span class="status-chip">${escapeHtml(item.entity)}</span></div>`).join('') : '<div class="empty-mini">No Admin activity yet.</div>';
    $$('[data-open-view]', $('#networkOverview')).forEach((button) => button.addEventListener('click', () => changeView(button.dataset.openView)));
    $$('[data-alert-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.alertView, button.dataset.alertTab)));
  };

  const loadApprovals = async () => {
    const { data, error } = await db.rpc('admin_list_approval_queue');
    if (error) throw error;
    state.approvals = data || [];
    renderApprovals();
    const compact = $('#dashboardApprovalList');
    const recent = state.approvals.slice(0, 5);
    compact.innerHTML = recent.length ? recent.map((item) => `<div><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.applicant_name)} · ${formatDate(item.submitted_at)}</small></div><button data-dashboard-review="${escapeHtml(item.record_id)}" data-dashboard-kind="${escapeHtml(item.kind)}">Review →</button></div>`).join('') : '<div class="empty-mini">No urgent action required.</div>';
    $$('[data-dashboard-review]', compact).forEach((button) => button.addEventListener('click', () => openApproval(button.dataset.dashboardKind, button.dataset.dashboardReview)));
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
    $('#customerTableBody').innerHTML = rows.length ? rows.map((customer) => `<tr><td><input type="checkbox" data-customer-select="${customer.user_id}" ${state.selectedCustomers.has(customer.user_id) ? 'checked' : ''} aria-label="Select ${escapeHtml(customer.full_name || 'customer')}"></td><td><strong>${escapeHtml(customer.full_name || 'Profile incomplete')}</strong><small>${escapeHtml(customer.email || '')}</small></td><td>${escapeHtml(customer.phone || '—')}</td><td>${escapeHtml([customer.county, customer.sub_county, customer.estate].filter(Boolean).join(' · ') || '—')}</td><td>${formatDate(customer.created_at)}</td><td>${formatDate(customer.last_sign_in_at, true)}</td></tr>`).join('') : '<tr><td colspan="6">No customers match this search.</td></tr>';
    $$('[data-customer-select]').forEach((input) => input.addEventListener('change', () => { input.checked ? state.selectedCustomers.add(input.dataset.customerSelect) : state.selectedCustomers.delete(input.dataset.customerSelect); updateCustomerSelection(rows); }));
    updateCustomerSelection(rows);
  };
  const filteredCustomers = () => {
    const term = ($('#customerSearch')?.value || '').trim().toLowerCase();
    return state.customers.filter((customer) => !term || [customer.full_name, customer.email, customer.phone, customer.county, customer.sub_county, customer.estate].some((value) => String(value || '').toLowerCase().includes(term)));
  };
  const updateCustomerSelection = (rows = filteredCustomers()) => {
    $('#customerSelectedCount').textContent = `${state.selectedCustomers.size} selected`;
    $('#selectAllCustomers').checked = rows.length > 0 && rows.every((item) => state.selectedCustomers.has(item.user_id));
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
    $('#pickupStationList').innerHTML = state.pickupStations.length ? state.pickupStations.map((station) => `<article class="station-card"><header><div><h3>${escapeHtml(station.station_name)}</h3><span class="status-chip">${station.is_active ? 'Active' : 'Inactive'}</span></div><strong>${Number(station.service_fee_percent || 0)}%</strong></header><p>${escapeHtml(station.address_line)}${station.door_number ? `, Door ${escapeHtml(station.door_number)}` : ''}<br>${escapeHtml([station.town, station.sub_county, station.county].filter(Boolean).join(' · '))}<br>${escapeHtml(station.landmark || '')}${station.contact_phone ? `<br>☎ ${escapeHtml(station.contact_phone)}` : ''}${station.operating_hours ? `<br>◷ ${escapeHtml(station.operating_hours)}` : ''}</p><div class="card-actions"><button data-edit-station="${station.id}">Edit Station</button></div></article>`).join('') : '<div class="loading-card">No pickup stations configured.</div>';
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
    state.audit = data || [];
    $('#auditTableBody').innerHTML = data?.length ? data.map((entry) => `<tr><td>${formatDate(entry.created_at, true)}</td><td>${escapeHtml(entry.actor_email || 'System')}</td><td><strong>${escapeHtml(entry.action)}</strong></td><td>${escapeHtml(entry.entity_type)}</td><td><small>${escapeHtml(entry.entity_id || '—')}</small></td></tr>`).join('') : '<tr><td colspan="5">No audited Admin actions yet.</td></tr>';
    if ($('#dataTypeFilter')?.value === 'audit_log') renderDataManagement();
  };

  const dataRows = () => {
    const type = $('#dataTypeFilter')?.value || 'customers';
    let rows = type === 'customers' ? state.customers : type === 'pickup_stations' ? state.pickupStations : type === 'payment_accounts' ? state.paymentAccounts : state.audit;
    const status = $('#dataStatusFilter')?.value || 'all';
    const from = $('#dataFromFilter')?.value ? new Date(`${$('#dataFromFilter').value}T00:00:00`) : null;
    const to = $('#dataToFilter')?.value ? new Date(`${$('#dataToFilter').value}T23:59:59`) : null;
    return rows.filter((row) => {
      const rowStatus = row.status || (row.is_active === true ? 'active' : row.is_active === false ? 'inactive' : 'all');
      const date = new Date(row.created_at || row.submitted_at || 0);
      return (status === 'all' || rowStatus === status) && (!from || date >= from) && (!to || date <= to);
    });
  };
  const dataRecordId = (row) => String(row.user_id || row.id);
  const renderDataManagement = () => {
    const type = $('#dataTypeFilter').value;
    const rows = dataRows();
    const protectedTypes = new Set(['customers','audit_log']);
    const definitions = {
      customers: [['Customer',r=>r.full_name || 'Profile incomplete'],['Email',r=>r.email || '—'],['Location',r=>[r.county,r.sub_county,r.estate].filter(Boolean).join(' · ') || '—']],
      pickup_stations: [['Station',r=>r.station_name],['Location',r=>[r.town,r.sub_county,r.county].filter(Boolean).join(' · ')],['Status',r=>r.is_active ? 'Active':'Inactive'],['Fee',r=>`${Number(r.service_fee_percent||0)}%`]],
      payment_accounts: [['Account',r=>r.display_name],['Type',r=>r.account_type],['Number',r=>accountNumber(r)],['Status',r=>r.status]],
      audit_log: [['Date',r=>formatDate(r.created_at,true)],['Admin',r=>r.actor_email||'System'],['Action',r=>r.action],['Entity',r=>r.entity_type]]
    };
    const cols = definitions[type];
    $('#dataTableHead').innerHTML = `<tr><th></th>${cols.map(([label])=>`<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
    $('#dataTableBody').innerHTML = rows.length ? rows.map((row)=>`<tr><td><input type="checkbox" data-data-select="${escapeHtml(dataRecordId(row))}" ${state.selectedData.has(dataRecordId(row))?'checked':''}></td>${cols.map(([,getter])=>`<td>${escapeHtml(getter(row))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length+1}">No records match the current filters.</td></tr>`;
    $('#dataProtectionNote').textContent = protectedTypes.has(type) ? 'Protected records: export is available, but destructive actions are disabled to preserve identity, financial and audit history.' : type === 'pickup_stations' ? 'Archive changes selected stations to inactive; records remain available for history.' : 'Payment accounts with history are deactivated or archived, never permanently deleted.';
    $('#archiveSelectedData').disabled = type !== 'pickup_stations';
    $$('[data-data-select]').forEach((input)=>input.addEventListener('change',()=>{ input.checked ? state.selectedData.add(input.dataset.dataSelect) : state.selectedData.delete(input.dataset.dataSelect); updateDataSelection(rows); }));
    updateDataSelection(rows);
  };
  const updateDataSelection = (rows=dataRows()) => {
    $('#dataSelectedCount').textContent = `${state.selectedData.size} selected`;
    $('#selectAllData').checked = rows.length>0 && rows.every((row)=>state.selectedData.has(dataRecordId(row)));
  };

  const crcTable = (() => { const table=[]; for(let n=0;n<256;n++){let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; table[n]=c>>>0;} return table; })();
  const crc32 = (bytes) => { let c=0xffffffff; for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
  const zipStore = (files) => { const encoder=new TextEncoder(), parts=[], central=[]; let offset=0; const u16=n=>new Uint8Array([n&255,(n>>>8)&255]), u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); for(const [name,content] of Object.entries(files)){const nb=encoder.encode(name), data=typeof content==='string'?encoder.encode(content):content, crc=crc32(data); const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...nb]); parts.push(local,data); const cd=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...nb]); central.push(cd); offset+=local.length+data.length;} const centralSize=central.reduce((n,p)=>n+p.length,0), end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(centralSize),...u32(offset),...u16(0)]); return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); };
  const xmlEscape = (v) => String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  const xlsxBlob = (title, rows) => { const matrix=[[title],['Generated',formatDate(new Date().toISOString(),true)],[],...rows]; const sheet=matrix.map((row,i)=>`<row r="${i+1}">${row.map((cell,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`).join('')}</row>`).join(''); return zipStore({'[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>','_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>','xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`}); };
  const pdfBlob = (title, rows) => { const safe=s=>String(s??'').replace(/[()\\]/g,'\\$&').replace(/[^\x20-\x7E]/g,' '); const lines=[title,`Reporting period: ${dashboardLabel()}`,`Generated: ${formatDate(new Date().toISOString(),true)}`,'',...rows.map(r=>r.join(' | '))].slice(0,52); const content=['BT','/F1 11 Tf','50 790 Td',...lines.flatMap((line,i)=>i===0?[`(${safe(line)}) Tj`]:['0 -14 Td',`(${safe(line).slice(0,115)}) Tj`]),'ET'].join('\n'); const objects=['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj','2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj','3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj','4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',`5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`]; let pdf='%PDF-1.4\n', offsets=[0]; objects.forEach(o=>{offsets.push(pdf.length);pdf+=o+'\n';}); const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return new Blob([pdf],{type:'application/pdf'}); };
  const downloadBlob = (blob,name) => { const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000); };
  const auditExport = async (report,scope,format,count,filters={}) => { const {error}=await db.rpc('admin_record_export',{p_report:report,p_scope:scope,p_format:format,p_record_count:count,p_filters:filters}); if(error) throw error; };
  const exportRows = async (report, scope, format, rows, filters={}) => { await auditExport(report,scope,format,rows.length,filters); const filename=`leogo-${report}-${new Date().toISOString().slice(0,10)}.${format}`; downloadBlob(format==='xlsx'?xlsxBlob(`LEOGO DIGITAL MARKET — ${report}`,rows):pdfBlob(`LEOGO DIGITAL MARKET — ${report}`,rows),filename); await loadAuditLog(); };
  const exportDashboard = async (format) => {
    if (!state.dashboard) return;
    const d=state.dashboard, rows=[['Metric','Value'],['Reporting Period',dashboardLabel()],['Today / Range Orders',metricValue(d.top.orders)],['Gross Order Sales',metricValue(d.revenue.gross_order_sales,true)],['LEOGO Revenue',formatMoney(d.revenue.total_leogo)],['Pending Approvals',metricValue(d.top.pending_approvals)],['Active Deliveries',metricValue(d.top.active_deliveries)],[],['LEOGO Earnings','Amount'],['Premium Revenue',formatMoney(d.revenue.premium.value)],['Other LEOGO Revenue',formatMoney(d.revenue.other.value)],[],['Wallet/SACCO Activity (not revenue)','Value'],['Deposits',formatMoney(d.wallet.deposits)],['Withdrawals',formatMoney(d.wallet.withdrawals)],['Savings Deposits',formatMoney(d.wallet.savings_deposits)],['Pending Deposits',d.wallet.pending_deposits],['Pending Withdrawals',d.wallet.pending_withdrawals]];
    await exportRows('dashboard','dashboard',format,rows,{range:dashboardLabel(),from:d.range.from,to:d.range.to});
    globalStatus(`Dashboard ${format.toUpperCase()} report downloaded and audited.`);
  };
  const exportCustomers = async (scope,format='xlsx') => { const source=scope==='selected'?state.customers.filter(r=>state.selectedCustomers.has(r.user_id)):filteredCustomers(); const rows=[['Name','Email','Phone','County','Sub-County','Estate','Registered'],...source.map(r=>[r.full_name,r.email,r.phone,r.county,r.sub_county,r.estate,formatDate(r.created_at)])]; if(!source.length){globalStatus('Select at least one customer to export.','error');return;} await exportRows('customers',scope,format,rows,{search:$('#customerSearch').value}); globalStatus(`${source.length} customer record(s) exported and audited.`); };
  const exportData = async (scope,format='xlsx') => { const type=$('#dataTypeFilter').value, source=scope==='selected'?dataRows().filter(r=>state.selectedData.has(dataRecordId(r))):dataRows(); if(!source.length){globalStatus('Select at least one record to export.','error');return;} const rows=[['Record ID','Record Data'],...source.map(r=>[dataRecordId(r),JSON.stringify(r)])]; await exportRows(type,scope,format,rows,{status:$('#dataStatusFilter').value,from:$('#dataFromFilter').value,to:$('#dataToFilter').value}); globalStatus(`${source.length} ${type.replaceAll('_',' ')} record(s) exported and audited.`); };

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
    if (tab === 'data') renderDataManagement();
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
    $$('[data-admin-view]').forEach((button) => button.addEventListener('click', () => { changeView(button.dataset.adminView, button.dataset.settingsTab || ''); if(button.dataset.filterTarget){state.approvalFilter=button.dataset.filterTarget;$$('#approvalFilters [data-approval-filter]').forEach(item=>item.classList.toggle('active',item.dataset.approvalFilter===state.approvalFilter));renderApprovals();} }));
    $$('[data-nav-group]').forEach((button) => button.addEventListener('click', () => { const children=$(`[data-nav-children="${button.dataset.navGroup}"]`); if(children) children.classList.toggle('open'); }));
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
    $('#selectAllCustomers').addEventListener('change', (event) => { filteredCustomers().forEach(r=>event.target.checked?state.selectedCustomers.add(r.user_id):state.selectedCustomers.delete(r.user_id)); renderCustomers(); });
    $('#selectFilteredCustomers').addEventListener('click',()=>{filteredCustomers().forEach(r=>state.selectedCustomers.add(r.user_id));renderCustomers();});
    $('#clearCustomerSelection').addEventListener('click',()=>{state.selectedCustomers.clear();renderCustomers();});
    $$('[data-export-table="customers"]').forEach(button=>button.addEventListener('click',async()=>{const format=(window.prompt('Export format: xlsx or pdf','xlsx')||'').toLowerCase();if(['xlsx','pdf'].includes(format)) await exportCustomers(button.dataset.exportScope,format);}));
    $$('#dashboardRange [data-range]').forEach(button=>button.addEventListener('click',async()=>{state.dashboardRange=button.dataset.range;$$('#dashboardRange [data-range]').forEach(b=>b.classList.toggle('active',b===button));$('#customRange').hidden=state.dashboardRange!=='custom';if(state.dashboardRange!=='custom')await loadDashboard();}));
    $('#applyCustomRange').addEventListener('click',async()=>{state.dashboardFrom=$('#rangeFrom').value;state.dashboardTo=$('#rangeTo').value;if(!state.dashboardFrom||!state.dashboardTo||state.dashboardTo<state.dashboardFrom){globalStatus('Choose a valid custom date range.','error');return;}await loadDashboard();});
    $('#dashboardExportToggle').addEventListener('click',()=>{$('#dashboardExportMenu').hidden=!$('#dashboardExportMenu').hidden;});
    $$('[data-dashboard-export]').forEach(button=>button.addEventListener('click',async()=>{await exportDashboard(button.dataset.dashboardExport);$('#dashboardExportMenu').hidden=true;}));
    $('#businessSettingsForm').addEventListener('submit', saveBusinessSettings);
    $('#walletFeesForm').addEventListener('submit', saveWalletSettings);
    $('#addPaymentAccount').addEventListener('click', () => openPaymentModal());
    $('#paymentAccountType').addEventListener('change', togglePaymentFields);
    $('#paymentAccountForm').addEventListener('submit', savePaymentAccount);
    $('#addPickupStation').addEventListener('click', () => openPickupModal());
    $('#pickupStationForm').addEventListener('submit', savePickupStation);
    ['dataTypeFilter','dataStatusFilter','dataFromFilter','dataToFilter'].forEach(id=>$('#'+id).addEventListener('change',()=>{state.selectedData.clear();renderDataManagement();}));
    $('#selectAllData').addEventListener('change',event=>{dataRows().forEach(r=>event.target.checked?state.selectedData.add(dataRecordId(r)):state.selectedData.delete(dataRecordId(r)));renderDataManagement();});
    $('#selectFilteredData').addEventListener('click',()=>{dataRows().forEach(r=>state.selectedData.add(dataRecordId(r)));renderDataManagement();});
    $('#clearDataSelection').addEventListener('click',()=>{state.selectedData.clear();renderDataManagement();});
    $$('[data-data-export]').forEach(button=>button.addEventListener('click',async()=>{const format=(window.prompt('Export format: xlsx or pdf','xlsx')||'').toLowerCase();if(['xlsx','pdf'].includes(format))await exportData(button.dataset.dataExport,format);}));
    $('#archiveSelectedData').addEventListener('click',async()=>{if($('#dataTypeFilter').value!=='pickup_stations'||!state.selectedData.size)return;const ids=[...state.selectedData];if(!window.confirm(`Archive ${ids.length} selected pickup station record(s)? They will become inactive and remain in history.`))return;const {error}=await db.rpc('admin_archive_pickup_stations',{p_ids:ids});if(error){globalStatus(friendlyError(error),'error');return;}state.selectedData.clear();await Promise.all([loadPickupStations(),loadDashboard(),loadAuditLog()]);renderDataManagement();globalStatus('Selected pickup stations archived safely.');});
    $$('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
    $$('#reviewActions [data-review-action]').forEach((button) => button.addEventListener('click', () => reviewApproval(button)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModals(); closeSidebar(); } });
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    initializeAuth();
  });
})();

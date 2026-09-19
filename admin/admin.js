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
    approvalSearch: '',
    selectedApprovals: new Set(),
    activeApproval: null,
    customers: [],
    business: null,
    paymentAccounts: [],
    paymentAssignments: [],
    pickupStations: [],
    walletSettings: null,
    premiumPlans: [],
    premiumCustomers: [],
    premiumProfiles: [],
    sellers: [],
    sellerSettlementAccounts: [],
    sellerSettlementRequests: [],
    sellerSettlements: [],
    serviceCounties: [],
    serviceSubcounties: [],
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
    products: 'Products & Categories', sellers: 'Sellers', settlements: 'Seller Settlements', providers: 'Service Providers',
    transport: 'Transport & Parcel Delivery', wallet: 'Wallet & SACCO', premium: 'Premium',
    accommodation: 'Accommodation', loyalty: 'Loyalty & Rewards', reports: 'Reports',
    settings: 'System Settings', audit: 'Audit Log'
  };
  const kindLabels = {
    seller_application: 'Seller Registration',
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
    const loaders = [loadDashboard, loadApprovals, loadCustomers, loadSellers, loadSellerSettlements, loadServiceLocations, loadBusinessSettings,
      loadPaymentSettings, loadPickupStations, loadWalletSettings, loadPremiumCustomers, loadPremiumProfiles, loadPremiumPlans,
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

  const approvalGroup = (kind) => kind === 'seller_application' ? 'sellers' : kind.startsWith('premium') ? 'premium' : kind.startsWith('wallet') ? 'wallet' : kind.startsWith('accommodation') ? 'accommodation' : 'other';
  const approvalIsFinancial = (item) => item.kind === 'premium_payment' || item.kind.startsWith('wallet');
  const approvalKey = (item) => `${item.kind}::${item.record_id}`;
  const approvalMatchesFilter = (item) => {
    if (state.approvalFilter === 'all') return true;
    if (state.approvalFilter === 'financial') return approvalIsFinancial(item);
    return approvalGroup(item.kind) === state.approvalFilter;
  };
  const approvalMatchesSearch = (item) => {
    const term = state.approvalSearch.trim().toLowerCase();
    if (!term) return true;
    const payload = item.payload && typeof item.payload === 'object' ? JSON.stringify(item.payload) : '';
    return [kindLabels[item.kind], item.kind, item.title, item.applicant_name, item.applicant_email, item.subtitle, item.status, item.record_id, payload]
      .some((value) => String(value || '').toLowerCase().includes(term));
  };
  const visibleApprovals = () => state.approvals.filter((item) => approvalMatchesFilter(item) && approvalMatchesSearch(item));
  const waitingAge = (value) => {
    if (!value) return '—';
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    if (!Number.isFinite(diff)) return '—';
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return '<1 hr';
    if (hours < 24) return `${hours} hr`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  };
  const renderApprovalSummary = () => {
    const financial = state.approvals.filter(approvalIsFinancial).length;
    const wallet = state.approvals.filter((item) => approvalGroup(item.kind) === 'wallet').length;
    const sellers = state.approvals.filter((item) => approvalGroup(item.kind) === 'sellers').length;
    const premium = state.approvals.filter((item) => approvalGroup(item.kind) === 'premium').length;
    const accommodation = state.approvals.filter((item) => approvalGroup(item.kind) === 'accommodation').length;
    const oldest = [...state.approvals].filter((item) => item.submitted_at).sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
    $('#approvalTotalCount').textContent = state.approvals.length;
    $('#approvalFinancialCount').textContent = financial;
    $('#approvalPremiumCount').textContent = premium;
    $('#approvalAccommodationCount').textContent = accommodation;
    $('#approvalOldestWaiting').textContent = oldest ? waitingAge(oldest.submitted_at) : '—';
    const counts = { all: state.approvals.length, financial, wallet, sellers, premium, accommodation };
    Object.entries(counts).forEach(([key, count]) => {
      const target = $(`#approvalFilters [data-approval-filter="${key}"] b`);
      if (target) target.textContent = count;
    });
  };
  const updateApprovalSelection = (visible = visibleApprovals()) => {
    const count = state.selectedApprovals.size;
    $('#approvalSelectedCount').textContent = `${count} selected`;
    $('#exportSelectedApprovals').disabled = count === 0;
    $('#clearApprovalSelection').disabled = count === 0;
    $('#selectAllApprovals').checked = visible.length > 0 && visible.every((item) => state.selectedApprovals.has(approvalKey(item)));
  };
  const renderApprovals = () => {
    const visible = visibleApprovals();
    renderApprovalSummary();
    $('#approvalQueue').innerHTML = visible.length ? visible.map((item) => {
      const key = approvalKey(item);
      const detail = item.amount_kes == null ? (item.subtitle || 'Application details') : formatMoney(item.amount_kes);
      const requestContext = item.amount_kes == null ? '' : (item.subtitle || '');
      return `<tr class="approval-row">
        <td class="approval-select-cell" data-label="Select"><input type="checkbox" data-approval-select="${escapeHtml(key)}" ${state.selectedApprovals.has(key) ? 'checked' : ''} aria-label="Select approval"></td>
        <td data-label="Type"><strong>${escapeHtml(kindLabels[item.kind] || item.kind)}</strong><small>${escapeHtml(approvalGroup(item.kind))}</small>${approvalIsFinancial(item) ? '<span class="financial-verification-badge">Financial verification</span>' : ''}</td>
        <td data-label="Applicant / Customer"><strong>${escapeHtml(item.applicant_name || 'Customer')}</strong><small>${escapeHtml(item.applicant_email || 'No email')}</small></td>
        <td data-label="Request"><strong>${escapeHtml(item.title || 'Review request')}</strong><small>${escapeHtml(requestContext)}</small></td>
        <td data-label="Amount / Details">${escapeHtml(detail)}</td>
        <td data-label="Submitted">${formatDate(item.submitted_at, true)}</td>
        <td data-label="Status"><span class="status-chip">${escapeHtml(item.status)}</span></td>
        <td class="approval-action-cell" data-label="Action"><button class="approval-review-button" type="button" data-review-id="${escapeHtml(item.record_id)}" data-review-kind="${escapeHtml(item.kind)}">Review →</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8">No pending requests match this queue.</td></tr>';
    $$('[data-review-id]', $('#approvalQueue')).forEach((button) => button.addEventListener('click', () => openApproval(button.dataset.reviewKind, button.dataset.reviewId)));
    $$('[data-approval-select]', $('#approvalQueue')).forEach((input) => input.addEventListener('change', () => {
      input.checked ? state.selectedApprovals.add(input.dataset.approvalSelect) : state.selectedApprovals.delete(input.dataset.approvalSelect);
      updateApprovalSelection(visible);
    }));
    updateApprovalSelection(visible);
  };

  const approvalMediaFields = {
    profile_picture_path: { label: 'Profile Picture', bucket: 'premium-profile-media' },
    passport_photo_path: { label: 'Passport-size Photo', bucket: 'premium-verification' },
    id_document_path: { label: 'Identity Document', bucket: 'premium-verification' },

    business_id_document_path: { label: 'Business ID / Identification', bucket: 'seller-verification' },
    business_licence_path: { label: 'Business Licence', bucket: 'seller-verification' },
    registration_certificate_path: { label: 'CR12 / Registration Certificate', bucket: 'seller-verification' },
    other_permit_paths: { label: 'Other Related Permit', bucket: 'seller-verification', multiple: true },

    main_image_path: { label: 'Product Main Image', bucket: 'seller-product-media' },
    gallery_image_paths: { label: 'Product Gallery Image', bucket: 'seller-product-media', multiple: true },

    cover_image_url: { label: 'Property Cover Image', directUrl: true },
    gallery_image_urls: { label: 'Property Gallery Image', directUrl: true, multiple: true }
  };

  const adminMediaEntries = (payload = {}) => {
    const entries = [];
    Object.entries(approvalMediaFields).forEach(([key, config]) => {
      const raw = payload?.[key];
      const values = config.multiple ? (Array.isArray(raw) ? raw : []) : (raw ? [raw] : []);
      values.filter(Boolean).forEach((value, index) => {
        entries.push({
          key,
          config,
          value: String(value),
          label: config.multiple ? `${config.label} ${index + 1}` : config.label
        });
      });
    });
    return entries;
  };

  const isPdfMedia = (value = '') => /\.pdf(?:$|\?)/i.test(String(value));
  const isImageMedia = (value = '') => /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(String(value));

  const secureAdminMediaUrl = async (entry) => {
    if (entry.config.directUrl) return entry.value;
    const { data, error } = await db.storage.from(entry.config.bucket).createSignedUrl(entry.value, 900);
    if (error) throw error;
    const url = data?.signedUrl || '';
    if (!url) throw new Error('No secure file URL was returned.');
    return url;
  };

  const renderAdminMediaCard = async (entry) => {
    const card = document.createElement('article');
    card.className = 'review-media-card';
    card.innerHTML = `<div class="review-media-card-head"><strong>${escapeHtml(entry.label)}</strong><span>Loading…</span></div><div class="review-media-loading">Preparing secure preview…</div>`;

    try {
      const url = await secureAdminMediaUrl(entry);
      const pdf = isPdfMedia(entry.value);
      const image = isImageMedia(entry.value) || (!pdf && entry.config.directUrl);

      if (image) {
        card.innerHTML = `
          <div class="review-media-card-head"><strong>${escapeHtml(entry.label)}</strong><span>Image</span></div>
          <a class="review-media-image-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(entry.label)}">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(entry.label)} submitted for Admin review">
          </a>
          <div class="review-media-actions"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View full image ↗</a></div>
        `;
        const img = $('img', card);
        img?.addEventListener('error', () => {
          const link = $('.review-media-image-link', card);
          if (link) link.innerHTML = '<div class="review-media-file-preview"><b>Image preview unavailable</b><small>Open the submitted file to review it.</small></div>';
        }, { once: true });
      } else {
        card.innerHTML = `
          <div class="review-media-card-head"><strong>${escapeHtml(entry.label)}</strong><span>${pdf ? 'PDF document' : 'Submitted file'}</span></div>
          <a class="review-media-file-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <div class="review-media-file-preview"><b>${pdf ? 'PDF' : 'FILE'}</b><small>Open document for Admin review</small></div>
          </a>
          <div class="review-media-actions"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View document ↗</a></div>
        `;
      }
    } catch (error) {
      card.innerHTML = `
        <div class="review-media-card-head"><strong>${escapeHtml(entry.label)}</strong><span>Preview unavailable</span></div>
        <div class="review-media-error">${escapeHtml(friendlyError(error))}</div>
      `;
    }
    return card;
  };

  const approvalMediaPreview = async (payload = {}) => {
    const media = $('#reviewMedia');
    if (!media) return;

    const entries = adminMediaEntries(payload);
    if (!entries.length) {
      media.hidden = true;
      media.innerHTML = '';
      return;
    }

    media.hidden = false;
    media.innerHTML = '<div class="review-media-heading"><span>UPLOADED FILES</span><strong>Images & Verification Documents</strong><small>Review the actual submitted files before making an Admin decision.</small></div><div class="review-media-grid" id="reviewMediaGrid"></div>';
    const grid = $('#reviewMediaGrid');

    for (const entry of entries) {
      grid.appendChild(await renderAdminMediaCard(entry));
    }
  };

  const openApproval = async (kind, id) => {
    const item = state.approvals.find((entry) => entry.kind === kind && entry.record_id === id);
    if (!item) return;
    state.activeApproval = item;
    $('#reviewModalTitle').textContent = item.title;
    $('#reviewApplicant').innerHTML = `<strong>${escapeHtml(item.applicant_name || 'Customer')}</strong><p>${escapeHtml(item.applicant_email || '')}<br>${escapeHtml(item.subtitle || '')}${item.amount_kes == null ? '' : `<br><b>${formatMoney(item.amount_kes)}</b>`}</p>`;
    const mediaKeys = new Set(Object.keys(approvalMediaFields));
    const hiddenKeys = new Set(['id', 'user_id', 'withdrawal_pin_hash', ...mediaKeys]);
    const detailRows = Object.entries(item.payload || {}).filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== '' && typeof value !== 'object');
    $('#reviewDetails').innerHTML = detailRows.map(([key, value]) => `<div><small>${escapeHtml(key.replaceAll('_', ' '))}</small><b>${escapeHtml(typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value)}</b></div>`).join('');
    $('#reviewNotes').value = '';
    setFormStatus($('#reviewStatus'));
    const underReview = $('[data-review-action="under_review"]');
    const requestChanges = $('[data-review-action="changes_requested"]');
    const reject = $('[data-review-action="reject"]');
    const approve = $('[data-review-action="approve"]');
    const awaitingCorrection = kind === 'seller_application' && item.status === 'changes_requested';
    underReview.hidden = ['premium_payment', 'wallet_deposit', 'wallet_withdrawal'].includes(kind) || awaitingCorrection;
    requestChanges.hidden = !['seller_application','premium_customer', 'premium_profile'].includes(kind) || awaitingCorrection;
    reject.hidden = awaitingCorrection;
    approve.hidden = awaitingCorrection;
    $('#reviewNotesLabel').textContent = requestChanges.hidden ? 'Admin notes / reason' : 'Admin notes / correction request';
    approve.textContent = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'Mark Customer Called' : 'Approve';
    approve.dataset.reviewAction = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'contacted' : 'approve';
    if (awaitingCorrection) {
      setFormStatus($('#reviewStatus'), 'Waiting for the Seller to correct and resubmit this application. It remains in Approval Center for tracking.', 'info');
    }
    $('#approvalReviewModal').hidden = false;
    await approvalMediaPreview(item.payload || {});
  };

  const reviewApproval = async (button) => {
    const item = state.activeApproval;
    if (!item) return;
    const decision = button.dataset.reviewAction;
    const notes = $('#reviewNotes').value.trim();
    if (['reject','changes_requested'].includes(decision) && notes.length < 3) {
      setFormStatus($('#reviewStatus'), decision === 'changes_requested' ? 'Explain what the applicant needs to correct before resubmitting.' : 'Add a clear rejection reason before rejecting.', 'error'); return;
    }
    await withButtonLock(button, 'Saving…', async () => {
      const rpcName = item.kind === 'seller_application' ? 'admin_review_seller_application' : 'admin_review_approval';
      const rpcArgs = item.kind === 'seller_application'
        ? { p_record_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : { p_kind: item.kind, p_record_id: item.record_id, p_decision: decision, p_notes: notes || null };
      const { error } = await db.rpc(rpcName, rpcArgs);
      if (error) { setFormStatus($('#reviewStatus'), friendlyError(error), 'error'); return; }
      closeModals();
      globalStatus(
        decision === 'contacted'
          ? 'Customer call recorded. The withdrawal can now be approved.'
          : decision === 'changes_requested'
            ? 'Correction request saved and audited. The application remains in Approval Center with status CHANGES REQUESTED until the Seller resubmits.'
            : 'Approval decision saved and audited.'
      );
      await Promise.all([loadApprovals(), loadDashboard(), loadAuditLog(), loadSellers(), loadPremiumCustomers(), loadPremiumProfiles()]);
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

  const renderServiceLocations = () => {
    const countySelect = $('#serviceSubcountyCounty');
    if (countySelect) countySelect.innerHTML = '<option value="">Choose county</option>' + state.serviceCounties.map((county) => '<option value="' + escapeHtml(county.code) + '">' + escapeHtml(county.name) + '</option>').join('');
    const list = $('#serviceLocationList');
    if (!list) return;
    list.innerHTML = state.serviceCounties.length ? state.serviceCounties.map((county) => {
      const subs = state.serviceSubcounties.filter((sub) => sub.county_code === county.code);
      return '<article class="location-admin-card"><header><div><strong>' + escapeHtml(county.name) + '</strong><small>' + subs.length + ' active sub-counties</small></div><button type="button" data-service-county-toggle="' + escapeHtml(county.code) + '" data-next-active="false">Deactivate</button></header><div class="location-subcounty-chips">' + (subs.length ? subs.map((sub) => '<span>' + escapeHtml(sub.name) + '</span>').join('') : '<small>No active sub-counties.</small>') + '</div></article>';
    }).join('') : '<div class="loading-card">No active service counties.</div>';
    $$('[data-service-county-toggle]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Deactivate this county for new customer and partner selections? Existing records will remain.')) return;
      const { error } = await db.rpc('admin_set_service_county_active', { p_code: button.dataset.serviceCountyToggle, p_active: false });
      if (error) { setFormStatus($('#serviceLocationStatus'), friendlyError(error), 'error'); return; }
      setFormStatus($('#serviceLocationStatus'), 'County deactivated. Existing records were preserved.', 'success');
      await loadServiceLocations();
    }));
  };
  const loadServiceLocations = async () => {
    const [countyResult, subcountyResult] = await Promise.all([
      db.from('kenya_counties').select('code,name').eq('is_active', true).order('name'),
      db.from('kenya_subcounties').select('code,county_code,name').eq('is_active', true).order('name')
    ]);
    if (countyResult.error || subcountyResult.error) throw countyResult.error || subcountyResult.error;
    state.serviceCounties = countyResult.data || [];
    state.serviceSubcounties = subcountyResult.data || [];
    renderServiceLocations();
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

  const filteredSellers = () => {
    const term = ($('#adminSellerSearch')?.value || '').trim().toLowerCase();
    const statusFilter = $('#adminSellerStatusFilter')?.value || 'all';
    return state.sellers.filter((seller) => {
      const values = [seller.business_name,seller.owner_name,seller.id_number,seller.phone,seller.email,seller.town,seller.county].map((v)=>String(v||'').toLowerCase());
      return (!term || values.some((v)=>v.includes(term))) && (statusFilter==='all' || seller.application_status===statusFilter);
    });
  };
  const renderSellers = () => {
    $('#adminSellerTotal').textContent = state.sellers.length;
    $('#adminSellerApproved').textContent = state.sellers.filter((s)=>s.application_status==='approved').length;
    $('#adminSellerPending').textContent = state.sellers.filter((s)=>['submitted','under_review'].includes(s.application_status)).length;
    $('#adminSellerProducts').textContent = state.sellers.reduce((sum,s)=>sum+Number(s.product_count||0),0);
    const rows=filteredSellers();
    $('#adminSellerTableBody').innerHTML = rows.length ? rows.map((s)=>`<tr class="seller-admin-row">
      <td data-label="Business"><strong>${escapeHtml(s.business_name)}</strong><small>${escapeHtml(s.email||'')}</small></td>
      <td data-label="Owner"><strong>${escapeHtml(s.owner_name)}</strong></td>
      <td data-label="ID / Phone"><strong>${escapeHtml(s.id_number)}</strong><small>${escapeHtml(s.phone)}</small></td>
      <td data-label="Location"><strong>${escapeHtml(s.town||'—')}</strong><small>${escapeHtml([s.sub_county,s.county].filter(Boolean).join(', '))}</small></td>
      <td data-label="Status"><span class="status-chip">${escapeHtml(s.application_status)}</span></td>
      <td data-label="Products"><strong>${Number(s.product_count||0)}</strong><small>${Number(s.active_product_count||0)} active</small></td>
      <td data-label="Flash Sale"><strong>${Number(s.flash_sale_request_count||0)}</strong></td>
      <td data-label="Action"><button type="button" class="seller-record-button" data-seller-record="${s.user_id}">View Record →</button></td>
    </tr>`).join('') : '<tr><td colspan="8">No sellers match the current filters.</td></tr>';
    $$('[data-seller-record]').forEach((button)=>button.addEventListener('click',()=>openSellerRecord(button.dataset.sellerRecord)));
  };
  const loadSellers = async () => {
    const {data,error}=await db.rpc('admin_list_sellers');
    if(error) throw error;
    state.sellers=data||[];
    renderSellers();
  };
  const sellerDocumentCard = async (label,path) => {
    if(!path) return '<article class="review-media-card"><div class="review-media-card-head"><strong>'+escapeHtml(label)+'</strong><span>Not provided</span></div></article>';
    try{
      const {data,error}=await db.storage.from('seller-verification').createSignedUrl(String(path),900);
      if(error)throw error;
      const url=data?.signedUrl||'';
      const isPdf=/\.pdf(?:\?|$)/i.test(path);
      return '<article class="review-media-card"><div class="review-media-card-head"><strong>'+escapeHtml(label)+'</strong><span>Private document</span></div>'+(isPdf?'':'<a class="review-media-image-link" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer"><img src="'+escapeHtml(url)+'" alt="'+escapeHtml(label)+'"></a>')+'<div class="review-media-actions"><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">View document ↗</a></div></article>';
    }catch(error){return '<article class="review-media-card"><div class="review-media-card-head"><strong>'+escapeHtml(label)+'</strong><span>Preview unavailable</span></div><div class="review-media-error">'+escapeHtml(friendlyError(error))+'</div></article>';}
  };
  const openSellerRecord = async (userId) => {
    const s=state.sellers.find((item)=>item.user_id===userId);
    if(!s)return;
    $('#sellerRecordTitle').textContent=s.business_name||'Seller';
    const rows=[
      ['Business name',s.business_name],['Owner name',s.owner_name],['Email',s.email],['ID number',s.id_number],['Phone',s.phone],
      ['County',s.county],['Sub-County',s.sub_county],['Town',s.town],['Location / landmark',s.location_details],
      ['Business description',s.business_description],['Application status',s.application_status],['Submitted',formatDate(s.submitted_at,true)],
      ['Approved',formatDate(s.approved_at,true)],['Admin notes',s.admin_notes],['Products',s.product_count],['Active products',s.active_product_count],
      ['Flash Sale requests',s.flash_sale_request_count],['Account created',formatDate(s.created_at,true)]
    ];
    $('#sellerRecordGrid').innerHTML=rows.map(([label,value])=>`<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value==null||value===''?'—':value)}</strong></div>`).join('');
    const existingDocs=$('#sellerRecordModal .seller-admin-docs'); if(existingDocs) existingDocs.remove();
    const docs=[['Business ID / Identification',s.business_id_document_path],['Business Licence',s.business_licence_path],['CR12 / Registration Certificate',s.registration_certificate_path],...((s.other_permit_paths||[]).map((path,index)=>['Other Permit '+(index+1),path]))];
    const docHtml=await Promise.all(docs.map(([label,path])=>sellerDocumentCard(label,path)));
    $('#sellerRecordGrid').insertAdjacentHTML('afterend','<section class="review-media seller-admin-docs"><div class="review-media-heading"><span>PRIVATE VERIFICATION DOCUMENTS</span><strong>Business Documents</strong><small>Visible only to authorized LEOGO Admin users.</small></div><div class="review-media-grid">'+docHtml.join('')+'</div></section>');
    $('#sellerRecordModal').hidden=false;
  };


  const settlementDestination = (account) => {
    if (account.account_type === 'mpesa_mobile') return account.phone_number || '—';
    if (account.account_type === 'mpesa_till') return 'Till ' + (account.till_number || '—');
    if (account.account_type === 'mpesa_paybill') return 'Paybill ' + (account.paybill_number || '—') + ' · A/C ' + (account.account_number || '—');
    return (account.bank_name || 'Bank') + ' · ' + (account.account_number || '—') + (account.bank_branch ? ' · ' + account.bank_branch : '');
  };
  const loadSellerSettlements = async () => {
    const [accountsResult, requestsResult, settlementsResult] = await Promise.all([
      db.rpc('admin_list_seller_settlement_accounts'),
      db.rpc('admin_list_seller_settlement_requests'),
      db.rpc('admin_list_seller_settlements')
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (requestsResult.error) throw requestsResult.error;
    if (settlementsResult.error) throw settlementsResult.error;
    state.sellerSettlementAccounts = accountsResult.data || [];
    state.sellerSettlementRequests = requestsResult.data || [];
    state.sellerSettlements = settlementsResult.data || [];
    renderSellerSettlements();
  };
  const renderSellerSettlementAccountOptions = () => {
    const sellerId = $('#adminSettlementSeller')?.value || '';
    const approved = state.sellerSettlementAccounts.filter((account) => account.seller_id === sellerId && account.status === 'approved');
    $('#adminSettlementAccount').innerHTML = approved.length
      ? '<option value="">Choose approved account…</option>' + approved.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)} — ${escapeHtml(settlementDestination(account))}${account.is_primary ? ' (Primary)' : ''}</option>`).join('')
      : '<option value="">No approved settlement account</option>';
  };
  const renderSellerSettlements = () => {
    const pending = state.sellerSettlementAccounts.filter((account) => account.status === 'pending_review').length;
    const approved = state.sellerSettlementAccounts.filter((account) => account.status === 'approved').length;
    const pendingRequests = state.sellerSettlementRequests.filter((request) => ['pending','under_review'].includes(request.status)).length;
    $('#adminSettlementPending').textContent = pending + pendingRequests;
    $('#adminSettlementApproved').textContent = approved;
    $('#adminSettlementCount').textContent = state.sellerSettlements.length;
    $('#adminSettlementTotal').textContent = formatMoney(state.sellerSettlements.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount_kes || 0), 0));
    $('#sidebarSettlementCount').textContent = pending + pendingRequests;

    const approvedSellerIds = [...new Set(state.sellerSettlementAccounts.filter((account) => account.status === 'approved').map((account) => account.seller_id))];
    const currentSeller = $('#adminSettlementSeller')?.value || '';
    $('#adminSettlementSeller').innerHTML = '<option value="">Choose approved Seller…</option>' + approvedSellerIds.map((sellerId) => {
      const account = state.sellerSettlementAccounts.find((item) => item.seller_id === sellerId);
      const seller = state.sellers.find((item) => item.user_id === sellerId);
      return `<option value="${escapeHtml(sellerId)}" ${sellerId === currentSeller ? 'selected' : ''}>${escapeHtml(seller?.business_name || account?.seller_name || 'Seller')} — ${escapeHtml(seller?.owner_name || account?.seller_email || '')}</option>`;
    }).join('');
    renderSellerSettlementAccountOptions();

    $('#sellerSettlementRequestTableBody').innerHTML = state.sellerSettlementRequests.length ? state.sellerSettlementRequests.map((request) => {
      const account=state.sellerSettlementAccounts.find((item)=>item.id===request.settlement_account_id);
      const open=['pending','under_review'].includes(request.status);
      return `<tr>
        <td><strong>${escapeHtml(request.seller_name||'Seller')}</strong><small>${escapeHtml(request.seller_email||'')}</small></td>
        <td><strong>${formatMoney(request.requested_amount_kes)}</strong><small>${formatDate(request.submitted_at,true)}</small></td>
        <td>${account?'<strong>'+escapeHtml(account.account_name)+'</strong><small>'+escapeHtml(settlementDestination(account))+'</small>':'—'}</td>
        <td>${escapeHtml(request.seller_note||'—')}</td>
        <td><span class="status-chip">${escapeHtml(request.status.replaceAll('_',' '))}</span>${request.admin_notes?'<small>'+escapeHtml(request.admin_notes)+'</small>':''}</td>
        <td class="settlement-admin-actions">
          ${open?'<button data-request-review="under_review" data-request-id="'+escapeHtml(request.id)+'">Under Review</button><button class="danger" data-request-review="reject" data-request-id="'+escapeHtml(request.id)+'">Reject</button><button data-request-pay="'+escapeHtml(request.id)+'">Pay & Record</button>':''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6">No Seller settlement requests yet.</td></tr>';

    $('#sellerSettlementAccountTableBody').innerHTML = state.sellerSettlementAccounts.length ? state.sellerSettlementAccounts.map((account) => {
      const canReview = account.status === 'pending_review';
      const canDisable = account.status === 'approved';
      return `<tr>
        <td><strong>${escapeHtml(account.seller_name || 'Seller')}</strong><small>${escapeHtml(account.seller_email || '')}</small></td>
        <td><strong>${escapeHtml(account.account_name)}</strong><small>${escapeHtml(account.account_type.replaceAll('_',' '))} · ${escapeHtml(settlementDestination(account))}${account.is_primary ? ' · PRIMARY' : ''}</small></td>
        <td><span class="status-chip">${escapeHtml(account.status.replaceAll('_',' '))}</span></td>
        <td>${formatDate(account.submitted_at, true)}</td>
        <td>${escapeHtml(account.admin_notes || '—')}</td>
        <td class="settlement-admin-actions">
          ${canReview ? '<button data-settlement-review="approve" data-settlement-account="'+escapeHtml(account.id)+'">Approve</button><button class="danger" data-settlement-review="reject" data-settlement-account="'+escapeHtml(account.id)+'">Reject</button>' : ''}
          ${canDisable ? '<button class="danger" data-settlement-review="disable" data-settlement-account="'+escapeHtml(account.id)+'">Disable</button><button data-settle-seller="'+escapeHtml(account.seller_id)+'" data-settle-account="'+escapeHtml(account.id)+'">Settle</button>' : ''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6">No Seller settlement accounts yet.</td></tr>';

    $('#sellerSettlementHistoryBody').innerHTML = state.sellerSettlements.length ? state.sellerSettlements.map((item) => `<tr>
      <td>${formatDate(item.paid_at, true)}</td><td><strong>${escapeHtml(item.seller_name || 'Seller')}</strong><small>${escapeHtml(item.seller_email || '')}</small></td>
      <td><strong>${formatMoney(item.amount_kes)}</strong></td><td>${escapeHtml(item.settlement_reference)}</td><td><span class="status-chip">${escapeHtml(item.status)}</span></td>
    </tr>`).join('') : '<tr><td colspan="5">No Seller settlements recorded yet.</td></tr>';

    $('[data-request-review]').forEach((button)=>button.addEventListener('click',async()=>{
      const decision=button.dataset.requestReview;
      let notes='';
      if(decision==='reject'){
        notes=window.prompt('Reason for rejecting this settlement request:','')||'';
        if(notes.trim().length<3){globalStatus('A clear rejection reason is required.','error');return;}
      }
      await withButtonLock(button,'Saving…',async()=>{
        const {error}=await db.rpc('admin_review_seller_settlement_request',{p_request_id:button.dataset.requestId,p_decision:decision,p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadSellerSettlements(),loadAuditLog()]);
        globalStatus(decision==='reject'?'Settlement request rejected.':'Settlement request marked under review.');
      });
    }));
    $('[data-request-pay]').forEach((button)=>button.addEventListener('click',async()=>{
      const request=state.sellerSettlementRequests.find((item)=>item.id===button.dataset.requestPay);
      if(!request)return;
      const reference=window.prompt('Enter the actual M-Pesa / bank transaction reference after sending '+formatMoney(request.requested_amount_kes)+':','')||'';
      if(reference.trim().length<3){globalStatus('A payment reference is required before marking the request paid.','error');return;}
      const notes=window.prompt('Settlement note (optional):','')||'';
      if(!window.confirm('Confirm the money has already been sent to the approved Seller settlement account?'))return;
      await withButtonLock(button,'Recording…',async()=>{
        const {error}=await db.rpc('admin_pay_seller_settlement_request',{p_request_id:request.id,p_reference:reference.trim(),p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadSellerSettlements(),loadAuditLog()]);
        globalStatus('Settlement request paid and recorded.');
      });
    }));

    $$('[data-settlement-review]').forEach((button) => button.addEventListener('click', async () => {
      const decision = button.dataset.settlementReview;
      let notes = '';
      if (decision === 'reject') {
        notes = window.prompt('Reason for rejecting this settlement account:','') || '';
        if (notes.trim().length < 3) { globalStatus('A clear rejection reason is required.','error'); return; }
      } else if (decision === 'disable') {
        notes = window.prompt('Reason for disabling this settlement account (optional):','') || '';
        if (!window.confirm('Disable this approved settlement account? It will no longer be available for new Seller payouts.')) return;
      }
      await withButtonLock(button,'Saving…',async()=>{
        const {error}=await db.rpc('admin_review_seller_settlement_account',{p_account_id:button.dataset.settlementAccount,p_decision:decision,p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadSellerSettlements(),loadAuditLog()]);
        globalStatus(decision==='approve'?'Settlement account approved.':decision==='reject'?'Settlement account rejected.':'Settlement account disabled.');
      });
    }));
    $$('[data-settle-seller]').forEach((button) => button.addEventListener('click', () => {
      changeView('settlements');
      $('#adminSettlementSeller').value = button.dataset.settleSeller;
      renderSellerSettlementAccountOptions();
      $('#adminSettlementAccount').value = button.dataset.settleAccount;
      $('#adminSettlementAmount').focus();
      $('#adminSellerSettlementForm').scrollIntoView({behavior:'smooth',block:'center'});
    }));
  };
  const recordSellerSettlement = async (event) => {
    event.preventDefault();
    const sellerId = $('#adminSettlementSeller').value;
    const accountId = $('#adminSettlementAccount').value;
    const amount = Number($('#adminSettlementAmount').value);
    const reference = $('#adminSettlementReference').value.trim();
    if (!sellerId || !accountId || !amount || amount <= 0 || reference.length < 3) {
      setFormStatus($('#adminSettlementStatus'),'Choose a Seller, approved settlement account, amount and payment reference.','error');
      return;
    }
    if (!window.confirm(`Confirm that KSh ${amount.toLocaleString('en-KE')} has been sent to this approved Seller settlement account?`)) return;
    const button = $('#adminSellerSettlementForm button[type="submit"]');
    await withButtonLock(button,'Recording…',async()=>{
      const {error}=await db.rpc('admin_record_seller_settlement',{
        p_seller_id:sellerId,p_account_id:accountId,p_amount_kes:amount,p_reference:reference,
        p_notes:$('#adminSettlementNotes').value.trim()||null
      });
      if(error){setFormStatus($('#adminSettlementStatus'),friendlyError(error),'error');return;}
      event.target.reset();
      setFormStatus($('#adminSettlementStatus'),'Settlement recorded successfully and the Seller has been notified.','success');
      await Promise.all([loadSellerSettlements(),loadAuditLog()]);
      globalStatus('Seller settlement recorded.');
    });
  };

  const effectivePremiumStatus = (customer) => customer.effective_subscription_status || customer.membership_status || 'none';
  const filteredPremiumCustomers = () => {
    const term = ($('#premiumCustomerSearch')?.value || '').trim().toLowerCase();
    const application = $('#premiumCustomerStatusFilter')?.value || 'all';
    const subscription = $('#premiumSubscriptionFilter')?.value || 'all';
    return state.premiumCustomers.filter((customer) => {
      const haystack = [customer.real_name, customer.email, customer.phone, customer.id_number, customer.location, customer.sex, customer.plan_name].map((value) => String(value || '').toLowerCase());
      return (!term || haystack.some((value) => value.includes(term)))
        && (application === 'all' || customer.application_status === application)
        && (subscription === 'all' || effectivePremiumStatus(customer) === subscription);
    });
  };
  const renderPremiumCustomerSummary = () => {
    $('#premiumCustomerTotal').textContent = state.premiumCustomers.length;
    $('#premiumCustomerApproved').textContent = state.premiumCustomers.filter((item) => item.application_status === 'approved').length;
    $('#premiumSubscriptionActive').textContent = state.premiumCustomers.filter((item) => effectivePremiumStatus(item) === 'active').length;
    $('#premiumSubscriptionInactive').textContent = state.premiumCustomers.filter((item) => ['expired','none','inactive'].includes(effectivePremiumStatus(item))).length;
  };
  const renderPremiumCustomers = () => {
    renderPremiumCustomerSummary();
    const rows = filteredPremiumCustomers();
    $('#premiumCustomerTableBody').innerHTML = rows.length ? rows.map((customer) => {
      const subscription = effectivePremiumStatus(customer);
      const plan = customer.plan_name || 'No active plan';
      return `<tr class="premium-customer-row">
        <td data-label="Customer"><strong>${escapeHtml(customer.real_name || 'Premium Customer')}</strong><small>${escapeHtml(customer.email || '')}</small></td>
        <td data-label="Contact"><strong>${escapeHtml(customer.phone || '—')}</strong><small>${escapeHtml(customer.location || '—')}</small></td>
        <td data-label="Application"><span class="status-chip">${escapeHtml(customer.application_status || '—')}</span><small>${customer.approved_at ? 'Approved ' + formatDate(customer.approved_at) : 'Submitted ' + formatDate(customer.submitted_at)}</small></td>
        <td data-label="Subscription"><span class="status-chip premium-subscription-${escapeHtml(subscription)}">${escapeHtml(subscription)}</span></td>
        <td data-label="Plan"><strong>${escapeHtml(plan)}</strong><small>${customer.plan_amount_kes ? formatMoney(customer.plan_amount_kes) : ''}</small></td>
        <td data-label="Expires">${customer.membership_ends_at ? formatDate(customer.membership_ends_at, true) : '—'}</td>
        <td data-label="Payments"><strong>${Number(customer.payment_count || 0)}</strong><small>Confirmed: ${formatMoney(customer.confirmed_payment_total_kes || 0)}</small></td>
        <td data-label="Action"><button class="premium-customer-view-button" type="button" data-premium-customer-view="${customer.user_id}">View Record →</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8">No Premium customers match the current filters.</td></tr>';
    $$('[data-premium-customer-view]').forEach((button) => button.addEventListener('click', () => openPremiumCustomerRecord(button.dataset.premiumCustomerView)));
  };
  const loadPremiumCustomers = async () => {
    const { data, error } = await db.rpc('admin_list_premium_customers');
    if (error) throw error;
    state.premiumCustomers = data || [];
    renderPremiumCustomers();
  };
  const premiumCustomerMediaPreview = async (customer) => {
    const media = $('#premiumCustomerMedia');
    const fields = [
      ['Profile Picture','premium-profile-media',customer.profile_picture_path],
      ['Passport-size Photo','premium-verification',customer.passport_photo_path],
      ['Identity Document','premium-verification',customer.id_document_path]
    ].filter(([, , path]) => path);
    if (!media || !fields.length) { if (media) { media.hidden = true; media.innerHTML = ''; } return; }
    media.hidden = false;
    media.innerHTML = '<div class="review-media-heading"><span>RETAINED VERIFICATION FILES</span><strong>Customer Images &amp; Documents</strong><small>Visible only to authorized Admin users.</small></div><div class="review-media-grid" id="premiumCustomerMediaGrid"></div>';
    const grid = $('#premiumCustomerMediaGrid');
    for (const [label,bucket,path] of fields) {
      const card = document.createElement('article');
      card.className = 'review-media-card';
      card.innerHTML = `<div class="review-media-card-head"><strong>${escapeHtml(label)}</strong><span>Secure file</span></div><div class="review-media-loading">Loading image…</div>`;
      grid.appendChild(card);
      try {
        const { data, error } = await db.storage.from(bucket).createSignedUrl(String(path), 900);
        if (error) throw error;
        const url = data?.signedUrl || '';
        if (!url) throw new Error('No secure image URL was returned.');
        card.innerHTML = `<div class="review-media-card-head"><strong>${escapeHtml(label)}</strong><span>Secure preview</span></div><a class="review-media-image-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"></a><div class="review-media-actions"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View full image ↗</a></div>`;
      } catch (error) {
        card.innerHTML = `<div class="review-media-card-head"><strong>${escapeHtml(label)}</strong><span>Preview unavailable</span></div><div class="review-media-error">${escapeHtml(friendlyError(error))}</div>`;
      }
    }
  };
  const openPremiumCustomerRecord = async (userId) => {
    const customer = state.premiumCustomers.find((item) => item.user_id === userId);
    if (!customer) return;
    $('#premiumCustomerModalTitle').textContent = customer.real_name || customer.email || 'Premium Customer';
    const subscription = effectivePremiumStatus(customer);
    $('#premiumCustomerDetailSummary').innerHTML = `<div><span>Application</span><strong>${escapeHtml(customer.application_status || '—')}</strong></div><div><span>Subscription</span><strong>${escapeHtml(subscription)}</strong></div><div><span>Current Plan</span><strong>${escapeHtml(customer.plan_name || 'No active plan')}</strong></div><div><span>Confirmed Payments</span><strong>${formatMoney(customer.confirmed_payment_total_kes || 0)}</strong></div>`;
    const detailRows = [
      ['Real name',customer.real_name],['Email',customer.email],['Phone',customer.phone],['ID number',customer.id_number],
      ['Sex',customer.sex],['Age',customer.age],['Location',customer.location],['Application status',customer.application_status],
      ['Submitted',formatDate(customer.submitted_at,true)],['Approved',formatDate(customer.approved_at,true)],
      ['Age consent',customer.age_consent ? 'Yes':'No'],['Responsibility consent',customer.responsibility_consent ? 'Yes':'No'],
      ['Privacy consent',customer.privacy_consent ? 'Yes':'No'],['Membership status',customer.membership_status || 'None'],
      ['Effective subscription',subscription],['Plan',customer.plan_name || 'None'],['Plan price',customer.plan_amount_kes ? formatMoney(customer.plan_amount_kes):'—'],
      ['Duration',customer.duration_hours ? customer.duration_hours + ' hours':'—'],['Starts',formatDate(customer.membership_starts_at,true)],['Expires',formatDate(customer.membership_ends_at,true)],
      ['Last payment status',customer.last_payment_status || 'None'],['Last payment reference',customer.last_payment_reference || '—'],
      ['Last payment amount',customer.last_payment_amount_kes ? formatMoney(customer.last_payment_amount_kes):'—'],['Last payment submitted',formatDate(customer.last_payment_submitted_at,true)],
      ['Last payment reviewed',formatDate(customer.last_payment_reviewed_at,true)],['Admin payment notes',customer.last_payment_admin_notes || '—']
    ];
    $('#premiumCustomerDetailGrid').innerHTML = detailRows.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value == null || value === '' ? '—' : value)}</strong></div>`).join('');
    const history = Array.isArray(customer.payment_history) ? customer.payment_history : [];
    $('#premiumCustomerPaymentHistory').innerHTML = history.length ? history.map((payment) => `<article class="premium-payment-history-row"><div><strong>${escapeHtml(payment.plan_name || 'Premium payment')}</strong><small>${escapeHtml(payment.payment_reference || '')}</small></div><div><strong>${formatMoney(payment.amount_kes || 0)}</strong><small>${formatDate(payment.submitted_at,true)}</small></div><div><span class="status-chip">${escapeHtml(payment.payment_status || '—')}</span><small>${escapeHtml(payment.admin_notes || '')}</small></div></article>`).join('') : '<div class="empty-mini">No Premium payment history recorded.</div>';
    $('#premiumCustomerModal').hidden = false;
    await premiumCustomerMediaPreview(customer);
  };

  const loadPremiumProfiles = async () => {
    const { data, error } = await db.from('premium_profiles')
      .select('user_id,display_name,gender,general_location,application_status,submitted_at,approved_at,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.premiumProfiles = data || [];
    const body = $('#premiumProfileTableBody');
    if (!body) return;
    body.innerHTML = state.premiumProfiles.length ? state.premiumProfiles.map((profile) => `<tr class="premium-profile-row">
      <td data-label="Profile"><strong>${escapeHtml(profile.display_name || 'Premium Profile')}</strong><small>${escapeHtml(profile.user_id)}</small></td>
      <td data-label="Gender">${escapeHtml(profile.gender || '—')}</td>
      <td data-label="Location">${escapeHtml(profile.general_location || '—')}</td>
      <td data-label="Status"><span class="status-chip">${escapeHtml(profile.application_status || '—')}</span></td>
      <td data-label="Submitted">${formatDate(profile.submitted_at || profile.created_at, true)}</td>
      <td data-label="Approved">${formatDate(profile.approved_at, true)}</td>
    </tr>`).join('') : '<tr><td colspan="6">No Premium Profiles have been registered yet.</td></tr>';
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
  const exportApprovals = async (scope='selected', format='xlsx') => {
    const source = scope === 'filtered'
      ? visibleApprovals()
      : state.approvals.filter((item) => state.selectedApprovals.has(approvalKey(item)));
    if (!source.length) {
      globalStatus(scope === 'filtered' ? 'There are no approval records in the current filtered view.' : 'Select at least one approval record to export.', 'error');
      return;
    }
    const rows = [['Type','Applicant','Email','Request','Amount / Details','Submitted','Status','Reference'], ...source.map((item) => [
      kindLabels[item.kind] || item.kind,
      item.applicant_name || 'Customer',
      item.applicant_email || '',
      item.title || '',
      item.amount_kes == null ? (item.subtitle || '') : item.amount_kes,
      formatDate(item.submitted_at, true),
      item.status || '',
      item.record_id
    ])];
    await exportRows('approval-center',scope,format,rows,{filter:state.approvalFilter,search:state.approvalSearch});
    globalStatus(`${source.length} approval record(s) exported and audited.`);
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
  const changePremiumAdminTab = (tab = 'profiles') => {
    const resolved = ['profiles','subscriptions'].includes(tab) ? tab : 'profiles';
    document.querySelectorAll('#premiumAdminTabs [data-premium-admin-tab]').forEach((button) => button.classList.toggle('active', button.dataset.premiumAdminTab === resolved));
    document.querySelectorAll('[data-premium-admin-content]').forEach((panel) => panel.classList.toggle('active', panel.dataset.premiumAdminContent === resolved));
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
    $$('[data-admin-view]').forEach((button) => button.addEventListener('click', () => { changeView(button.dataset.adminView, button.dataset.settingsTab || ''); if(button.dataset.premiumTarget) changePremiumAdminTab(button.dataset.premiumTarget); if(button.dataset.filterTarget){state.approvalFilter=button.dataset.filterTarget;$$('#approvalFilters [data-approval-filter]').forEach(item=>item.classList.toggle('active',item.dataset.approvalFilter===state.approvalFilter));renderApprovals();} }));
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
    $('#approvalSearch').addEventListener('input', (event) => { state.approvalSearch = event.target.value; renderApprovals(); });
    $('#selectAllApprovals').addEventListener('change', (event) => {
      visibleApprovals().forEach((item) => event.target.checked ? state.selectedApprovals.add(approvalKey(item)) : state.selectedApprovals.delete(approvalKey(item)));
      renderApprovals();
    });
    $('#clearApprovalSelection').addEventListener('click', () => { state.selectedApprovals.clear(); renderApprovals(); });
    $('#exportSelectedApprovals').addEventListener('click', async () => {
      const format = (window.prompt('Export format: xlsx or pdf', 'xlsx') || '').toLowerCase();
      if (['xlsx','pdf'].includes(format)) await exportApprovals('selected', format);
    });
    $('#exportFilteredApprovals').addEventListener('click', async () => {
      const format = (window.prompt('Export format: xlsx or pdf', 'xlsx') || '').toLowerCase();
      if (['xlsx','pdf'].includes(format)) await exportApprovals('filtered', format);
    });
    $('#refreshAdminData').addEventListener('click', () => withButtonLock($('#refreshAdminData'), 'Refreshing…', loadAll));
    $('#refreshApprovals').addEventListener('click', () => withButtonLock($('#refreshApprovals'), 'Refreshing…', async () => { await Promise.all([loadApprovals(), loadDashboard()]); }));
    $('#refreshAudit').addEventListener('click', () => withButtonLock($('#refreshAudit'), 'Refreshing…', loadAuditLog));
    document.querySelectorAll('#premiumAdminTabs [data-premium-admin-tab]').forEach((button) => button.addEventListener('click', () => {
      changePremiumAdminTab(button.dataset.premiumAdminTab);
    }));
    $('#adminSellerSearch').addEventListener('input', renderSellers);
    $('#adminSellerStatusFilter').addEventListener('change', renderSellers);
    $('#refreshSellerSettlements').addEventListener('click', () => withButtonLock($('#refreshSellerSettlements'), 'Refreshing…', loadSellerSettlements));
    $('#adminSettlementSeller').addEventListener('change', renderSellerSettlementAccountOptions);
    $('#adminSellerSettlementForm').addEventListener('submit', recordSellerSettlement);
    $('#addServiceCountyForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = $('#newServiceCountyName').value.trim();
      if (!name) return;
      setFormStatus($('#serviceLocationStatus'), 'Adding county…');
      const { error } = await db.rpc('admin_add_service_county', { p_name: name });
      if (error) { setFormStatus($('#serviceLocationStatus'), friendlyError(error), 'error'); return; }
      event.target.reset();
      setFormStatus($('#serviceLocationStatus'), 'County added to the shared LEOGO location list.', 'success');
      await loadServiceLocations();
    });
    $('#addServiceSubcountyForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const countyCode = $('#serviceSubcountyCounty').value;
      const name = $('#newServiceSubcountyName').value.trim();
      if (!countyCode || !name) return;
      setFormStatus($('#serviceLocationStatus'), 'Adding sub-county…');
      const { error } = await db.rpc('admin_add_service_subcounty', { p_county_code: countyCode, p_name: name });
      if (error) { setFormStatus($('#serviceLocationStatus'), friendlyError(error), 'error'); return; }
      $('#newServiceSubcountyName').value = '';
      setFormStatus($('#serviceLocationStatus'), 'Sub-county added to the shared LEOGO location list.', 'success');
      await loadServiceLocations();
    });
        $('#premiumCustomerSearch').addEventListener('input', renderPremiumCustomers);
    $('#premiumCustomerStatusFilter').addEventListener('change', renderPremiumCustomers);
    $('#premiumSubscriptionFilter').addEventListener('change', renderPremiumCustomers);
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

// LEOGO DIGITAL MARKET — Admin Control Center V1
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const STAFF_PORTAL_URL = 'https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/staff/';
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
    marketplaceOrders: [],
    aftersalesCases: [],
    activeAftersalesCaseId: null,
    activeMarketplaceOrderId: null,
    activeMarketplaceOrderDetail: null,
    orderDetailLoadToken: 0,
    catalogueProducts: [],
    catalogueCategories: [],
    productReviews: [],
    orderReviews: [],
    personalSales: [],
    personalSaleInterests: [],
    approvalFilter: 'all',
    approvalSearch: '',
    selectedApprovals: new Set(),
    activeApproval: null,
    customers: [],
    supportThreads: [],
    supportMessages: [],
    activeSupportThreadId: null,
    business: null,
    paymentAccounts: [],
    paymentAssignments: [],
    pickupStations: [],
    walletSettings: null,
    premiumPlans: [],
    premiumCustomers: [],
    premiumProfiles: [],
    sellers: [],
    serviceProviders: [],
    sellerSettlementAccounts: [],
    sellerSettlementRequests: [],
    sellerSettlements: [],
    riders: [],
    staffDirectory: [],
    staffRolePresets: [],
    activeStaff: null,
    activeStaffDocuments: null,
    deliveryJobs: [],
    deliverySellerStates: [],
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
    dashboard: 'Dashboard', approvals: 'Approval Center', orders: 'Orders', aftersales: 'Aftersales', customers: 'Customers',
    chat: 'Customer Care Chats', products: 'Products & Categories', sellers: 'Sellers', settlements: 'Seller Settlements', providers: 'Service Providers',
    transport: 'Transport & Parcel Delivery', wallet: 'Wallet & SACCO', premium: 'Premium',
    accommodation: 'Accommodation', loyalty: 'Loyalty & Rewards', reports: 'Reports',
    staff: 'Staff Management', settings: 'System Settings', audit: 'Audit Log'
  };
  const kindLabels = {
    seller_application: 'Seller Registration', seller_product: 'Seller Product', customer_personal_sale: 'Customer Item Sale',
    service_provider_application: 'Service Provider Registration', service_listing: 'Service Listing',
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
  const normaliseErrorMessage = (value) => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || String(value);
    if (typeof value === 'object') {
      const candidates=[
        value.error_description,
        value.error?.message,
        value.error,
        value.message,
        value.msg,
        value.details,
        value.hint,
        value.code
      ];
      for(const candidate of candidates){
        const text=normaliseErrorMessage(candidate);
        if(text) return text;
      }
      try{return JSON.stringify(value);}catch{return String(value);}
    }
    return String(value);
  };

  const friendlyError = (error) => {
    const message = normaliseErrorMessage(error) || 'Something went wrong.';
    if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
    if (/admin access required|permission required/i.test(message)) return 'This account does not have permission for that Admin action.';
    if (/invalid jwt|jwt.*invalid|unauthorized.*jwt/i.test(message)) return 'Your Admin session could not be verified. Sign out and sign in again, then retry.';
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
    try {
      return await work();
    } catch (error) {
      globalStatus(friendlyError(error), 'error');
      return null;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };

  window.addEventListener('unhandledrejection',(event)=>{
    const message=friendlyError(event.reason);
    globalStatus('Admin action stopped safely: '+message,'error');
    console.error('LEOGO Admin unhandled action error:',event.reason);
  });
  window.addEventListener('error',(event)=>{
    const message=friendlyError(event.error||event.message);
    globalStatus('Admin screen error: '+message,'error');
    console.error('LEOGO Admin runtime error:',event.error||event.message);
  });

  const adminHas = (permission) => {
    const admin = state.admin;
    if (!admin || admin.status !== 'active') return false;
    if (['super_admin','admin'].includes(admin.role)) return true;
    return !permission || (Array.isArray(admin.permissions) && admin.permissions.includes(permission));
  };
  const isSuperAdmin = () => state.admin?.status === 'active' && state.admin?.role === 'super_admin';

  const viewAllowed = (view, settingsTab = '') => {
    if (isSuperAdmin()) return true;
    const checks = {
      dashboard: () => adminHas('dashboard.read'),
      approvals: () => adminHas('approvals.read'),
      orders: () => adminHas('orders.read'),
      aftersales: () => adminHas('orders.read'),
      customers: () => adminHas('customers.read'),
      chat: () => adminHas('support.chat'),
      products: () => adminHas('products.read'),
      sellers: () => adminHas('sellers.read'),
      settlements: () => adminHas('settlements.read'),
      providers: () => adminHas('approvals.read'),
      transport: () => adminHas('orders.read') || adminHas('delivery.manage'),
      wallet: () => adminHas('approvals.read'),
      premium: () => adminHas('premium.read'),
      accommodation: () => adminHas('approvals.read'),
      loyalty: () => adminHas('settings.manage'),
      reports: () => adminHas('reports.export'),
      staff: () => false,
      audit: () => false,
      settings: () => settingsTab === 'payments'
        ? adminHas('payments.manage')
        : adminHas('settings.manage') || adminHas('fees.manage')
    };
    return checks[view] ? checks[view]() : false;
  };

  const applyAdminNavigationPermissions = () => {
    document.querySelectorAll('.admin-nav [data-admin-view]').forEach((button) => {
      const view = button.dataset.adminView;
      const tab = button.dataset.settingsTab || '';
      button.hidden = !viewAllowed(view, tab);
    });

    document.querySelectorAll('[data-nav-children]').forEach((group) => {
      const visibleChild = [...group.querySelectorAll('[data-admin-view]')].some((button) => !button.hidden);
      group.hidden = !visibleChild;
      const parent = document.querySelector('[data-nav-group="'+group.dataset.navChildren+'"]');
      if (parent && !visibleChild) parent.hidden = true;
    });
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
      applyAdminNavigationPermissions();
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
    if (error || !data.session?.user) {
      window.location.replace('../staff/?next=admin');
      return;
    }
    await enterAdmin(data.session.user);
  };

  const loadAll = async () => {
    const loaderSpecs = [
      [loadDashboard, () => adminHas('dashboard.read')],
      [loadApprovals, () => adminHas('approvals.read')],
      [loadMarketplaceOrders, () => adminHas('orders.read')],
      [loadAftersalesCases, () => adminHas('orders.read')],
      [loadCatalogue, () => adminHas('products.read')],
      [loadPersonalMarketplace, () => adminHas('products.read')],
      [loadCustomers, () => adminHas('customers.read')],
      [loadSupportChats, () => adminHas('support.chat')],
      [loadSellers, () => adminHas('sellers.read')],
      [loadServiceProviders, () => adminHas('approvals.read')],
      [loadSellerSettlements, () => adminHas('settlements.read')],
      [loadDeliveryOps, () => adminHas('orders.read') || adminHas('delivery.manage')],
      [loadServiceLocations, () => adminHas('settings.manage')],
      [loadBusinessSettings, () => adminHas('settings.manage')],
      [loadPaymentSettings, () => adminHas('payments.manage')],
      [loadPickupStations, () => adminHas('orders.read') || adminHas('delivery.manage')],
      [loadWalletSettings, () => adminHas('approvals.read') || adminHas('fees.manage')],
      [loadPremiumCustomers, () => adminHas('premium.read')],
      [loadPremiumProfiles, () => adminHas('premium.read')],
      [loadPremiumPlans, () => adminHas('premium.read')],
      [loadAccommodationSummary, () => adminHas('approvals.read')],
      [loadAuditLog, () => isSuperAdmin()],
      [loadStaffManagement, () => isSuperAdmin()]
    ];
    const loaders = loaderSpecs.filter(([,allowed]) => allowed()).map(([load]) => load);
    const results = await Promise.allSettled(loaders.map((load) => load()));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) globalStatus(`Some permitted Admin data could not load: ${friendlyError(failed.reason)}`, 'error');
    if (isSuperAdmin()) renderDataManagement();
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
    const liveApprovalCount = state.approvals.length || Number(data.top.pending_approvals.value || 0);
    $('#statApprovals').textContent = liveApprovalCount.toLocaleString('en-KE');
    $('#statDeliveries').textContent = metricValue(data.top.active_deliveries);
    $('#sidebarApprovalCount').textContent = liveApprovalCount;
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
    const [coreResult,personalSaleResult,serviceProviderResult] = await Promise.all([
      db.rpc('admin_list_approval_queue'),
      db.rpc('admin_list_personal_sale_approvals'),
      db.rpc('admin_list_service_provider_approvals')
    ]);
    if (coreResult.error) throw coreResult.error;
    if (personalSaleResult.error) throw personalSaleResult.error;
    if (serviceProviderResult.error) throw serviceProviderResult.error;

    state.approvals = [
      ...(Array.isArray(coreResult.data) ? coreResult.data : []),
      ...(Array.isArray(personalSaleResult.data) ? personalSaleResult.data : []),
      ...(Array.isArray(serviceProviderResult.data) ? serviceProviderResult.data : [])
    ].sort((a,b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
    renderApprovals();
    if (state.serviceProviders.length) renderServiceProviders();

    // Keep Dashboard and sidebar counts synchronized with the actual Approval Center queue,
    // including Seller product submissions.
    if ($('#statApprovals')) $('#statApprovals').textContent = Number(state.approvals.length).toLocaleString('en-KE');
    if ($('#sidebarApprovalCount')) $('#sidebarApprovalCount').textContent = state.approvals.length;

    const compact = $('#dashboardApprovalList');
    const recent = state.approvals.slice(0, 5);
    compact.innerHTML = recent.length ? recent.map((item) => `<div><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.applicant_name)} · ${formatDate(item.submitted_at)}</small></div><button data-dashboard-review="${escapeHtml(item.record_id)}" data-dashboard-kind="${escapeHtml(item.kind)}">Review →</button></div>`).join('') : '<div class="empty-mini">No urgent action required.</div>';
    $$('[data-dashboard-review]', compact).forEach((button) => button.addEventListener('click', () => openApproval(button.dataset.dashboardKind, button.dataset.dashboardReview)));
  };

  const approvalGroup = (kind) => ['seller_application','seller_product'].includes(kind) ? 'sellers' : ['service_provider_application','service_listing'].includes(kind) ? 'providers' : kind.startsWith('premium') ? 'premium' : kind.startsWith('wallet') ? 'wallet' : kind.startsWith('accommodation') ? 'accommodation' : 'other';
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
    const providers = state.approvals.filter((item) => approvalGroup(item.kind) === 'providers').length;
    const accommodation = state.approvals.filter((item) => approvalGroup(item.kind) === 'accommodation').length;
    const oldest = [...state.approvals].filter((item) => item.submitted_at).sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
    $('#approvalTotalCount').textContent = state.approvals.length;
    $('#approvalFinancialCount').textContent = financial;
    $('#approvalPremiumCount').textContent = premium;
    $('#approvalAccommodationCount').textContent = accommodation;
    $('#approvalOldestWaiting').textContent = oldest ? waitingAge(oldest.submitted_at) : '—';
    const counts = { all: state.approvals.length, financial, wallet, sellers, providers, premium, accommodation };
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
    professional_licence_path: { label: 'Professional Licence / Certificate', bucket: 'service-provider-verification' },

    main_image_path: { label: 'Product Main Image', bucket: 'seller-product-media' },
    gallery_image_paths: { label: 'Product Gallery Image', bucket: 'seller-product-media', multiple: true },
    variant_image_paths: { label: 'Variant Image', bucket: 'seller-product-media', multiple: true },
    item_image_path: { label: 'Item Picture', bucket: 'customer-sale-media' },
    ownership_proof_path: { label: 'Ownership Proof', bucket: 'customer-sale-verification' },

    cover_image_url: { label: 'Property Cover Image', directUrl: true },
    gallery_image_urls: { label: 'Property Gallery Image', directUrl: true, multiple: true }
  };

  const adminMediaEntries = (payload = {}, kind = '') => {
    const entries = [];
    const providerVerificationFields = new Set(['business_id_document_path','business_licence_path','registration_certificate_path','other_permit_paths']);
    Object.entries(approvalMediaFields).forEach(([key, config]) => {
      const resolvedConfig = kind === 'service_provider_application' && providerVerificationFields.has(key)
        ? { ...config, bucket: 'service-provider-verification' }
        : config;
      const raw = payload?.[key];
      const values = resolvedConfig.multiple ? (Array.isArray(raw) ? raw : []) : (raw ? [raw] : []);
      values.filter(Boolean).forEach((value, index) => {
        entries.push({
          key,
          config: resolvedConfig,
          value: String(value),
          label: resolvedConfig.multiple ? `${resolvedConfig.label} ${index + 1}` : resolvedConfig.label
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

  const approvalMediaPreview = async (payload = {}, kind = '') => {
    const media = $('#reviewMedia');
    if (!media) return;

    const entries = adminMediaEntries(payload, kind);
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
    const awaitingCorrection = ['seller_application','seller_product','service_provider_application','service_listing'].includes(kind) && item.status === 'changes_requested';
    underReview.hidden = ['premium_payment', 'wallet_deposit', 'wallet_withdrawal'].includes(kind) || awaitingCorrection;
    requestChanges.hidden = !['seller_application','seller_product','service_provider_application','service_listing','premium_customer', 'premium_profile'].includes(kind) || awaitingCorrection || kind === 'customer_personal_sale';
    reject.hidden = awaitingCorrection;
    approve.hidden = awaitingCorrection;
    $('#reviewNotesLabel').textContent = requestChanges.hidden ? 'Admin notes / reason' : 'Admin notes / correction request';
    approve.textContent = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'Mark Customer Called' : 'Approve';
    approve.dataset.reviewAction = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'contacted' : 'approve';
    if (awaitingCorrection) {
      setFormStatus($('#reviewStatus'), 'Waiting for the Seller to correct and resubmit this application. It remains in Approval Center for tracking.', 'info');
    }
    $('#approvalReviewModal').hidden = false;
    await approvalMediaPreview(item.payload || {}, kind);
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
      const rpcName = item.kind === 'seller_application'
        ? 'admin_review_seller_application'
        : item.kind === 'seller_product'
          ? 'admin_review_seller_product'
          : item.kind === 'customer_personal_sale'
            ? 'admin_review_personal_sale'
            : item.kind === 'service_provider_application'
              ? 'admin_review_service_provider_application'
              : item.kind === 'service_listing'
                ? 'admin_review_service_listing'
                : 'admin_review_approval';
      const rpcArgs = ['seller_application','seller_product','customer_personal_sale','service_provider_application','service_listing'].includes(item.kind)
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
      await Promise.all([loadApprovals(), loadDashboard(), loadAuditLog(), loadSellers(), loadServiceProviders(), loadCatalogue(), loadPremiumCustomers(), loadPremiumProfiles()]);
    });
  };

  const STAFF_PERMISSION_DEFS = [
    ['dashboard.read','Dashboard','View operational dashboard'],
    ['approvals.read','Approvals','View Approval Center'],
    ['approvals.manage','Approvals','Approve, reject and return applications'],
    ['orders.read','Orders','View customer orders'],
    ['orders.manage','Orders','Manage order fulfilment and operational controls'],
    ['orders.payment_verify','Finance','Verify or reject customer order payments'],
    ['delivery.manage','Delivery','Assign Riders and manage delivery operations'],
    ['customers.read','Customers','View customer accounts'],
    ['support.chat','Customer Support','Handle assigned private Customer Care chats'],
    ['sellers.read','Sellers','View Seller accounts'],
    ['settlements.read','Finance','View Seller settlement accounts, requests and payout history'],
    ['settlements.manage','Finance','Approve settlement accounts and process Seller payouts'],
    ['products.read','Marketplace','View products and categories'],
    ['products.manage','Marketplace','Manage product listings and catalogue'],
    ['premium.read','Premium','View Premium records'],
    ['premium.manage','Premium','Manage Premium records'],
    ['reports.export','Reports','Export operational / financial reports'],
    ['payments.manage','Payments','Manage LEOGO payment accounts — highly sensitive'],
    ['fees.manage','Settings','Manage supported fee rules'],
    ['settings.manage','Settings','Manage system and business settings — highly sensitive']
  ];

  const selectedPermissionValues = (container) =>
    [...(container?.querySelectorAll('input[data-staff-permission]:checked') || [])].map((input) => input.value);

  const presetForRole = (role) => state.staffRolePresets.find((preset) => preset.code === role);

  const renderPermissionGrid = (container, selected = []) => {
    if (!container) return;
    const chosen = new Set(Array.isArray(selected) ? selected : []);
    container.innerHTML = STAFF_PERMISSION_DEFS.map(([code,group,label]) =>
      '<label class="staff-permission-option'+(['payments.manage','settings.manage'].includes(code)?' sensitive':'')+'">'+
        '<input type="checkbox" data-staff-permission value="'+escapeHtml(code)+'" '+(chosen.has(code)?'checked':'')+'>'+
        '<span><b>'+escapeHtml(label)+'</b><small>'+escapeHtml(group)+' · '+escapeHtml(code)+'</small></span>'+
      '</label>'
    ).join('');
  };

  const renderStaffRoleOptions = () => {
    const options = state.staffRolePresets.map((preset) =>
      '<option value="'+escapeHtml(preset.code)+'">'+escapeHtml(preset.label)+'</option>'
    ).join('');
    if ($('#staffRole')) $('#staffRole').innerHTML=options;
    if ($('#staffEditorRole')) $('#staffEditorRole').innerHTML=options;
  };

  const applyCreateRolePreset = () => {
    const preset=presetForRole($('#staffRole')?.value);
    if(!preset) return;
    $('#staffDepartment').value=preset.department||'';
    $('#staffJobTitle').value=preset.label||'';
    $('#staffRoleDescription').innerHTML='<strong>'+escapeHtml(preset.label)+'</strong><span>'+escapeHtml(preset.description||'')+'</span>';
    renderPermissionGrid($('#staffPermissionGrid'),preset.permissions||[]);
  };

  const resetEditorRolePermissions = () => {
    const preset=presetForRole($('#staffEditorRole')?.value);
    renderPermissionGrid($('#staffEditorPermissionGrid'),preset?.permissions||[]);
  };

  const filteredStaffDirectory = () => {
    const term=($('#staffSearch')?.value||'').trim().toLowerCase();
    const role=$('#staffRoleFilter')?.value||'all';
    const status=$('#staffStatusFilter')?.value||'all';
    return state.staffDirectory.filter((staff)=>{
      const matchesTerm=!term||[
        staff.display_name,staff.email,staff.phone,staff.role_label,staff.department,
        staff.job_title,staff.vehicle_type,staff.vehicle_registration
      ].some((value)=>String(value||'').toLowerCase().includes(term));
      const matchesRole=role==='all'
        || (role==='admin_staff'&&staff.account_kind==='admin_staff')
        || staff.role_code===role;
      const matchesStatus=status==='all'||staff.status===status;
      return matchesTerm&&matchesRole&&matchesStatus;
    });
  };

  const renderStaffDirectory = () => {
    const list=$('#staffDirectoryList');
    if(!list) return;

    const all=state.staffDirectory;
    const rows=filteredStaffDirectory();
    $('#staffTotalCount').textContent=all.length;
    $('#staffAdminCount').textContent=all.filter((s)=>s.account_kind==='admin_staff'&&s.status==='active').length;
    $('#staffRiderCount').textContent=all.filter((s)=>s.account_kind==='rider'&&s.status==='active').length;
    $('#staffInactiveCount').textContent=all.filter((s)=>s.status!=='active').length;

    list.innerHTML=rows.length?rows.map((staff)=>{
      const permissions=Array.isArray(staff.permissions)?staff.permissions:[];
      const isOwner=staff.role_code==='super_admin';
      const riderMeta=staff.account_kind==='rider'
        ? '<div class="staff-card-meta"><span><small>Vehicle</small><strong>'+escapeHtml(staff.vehicle_type||'Not set')+(staff.vehicle_registration?' · '+escapeHtml(staff.vehicle_registration):'')+'</strong></span><span><small>Availability</small><strong>'+escapeHtml(String(staff.availability_status||'available').replaceAll('_',' '))+'</strong></span></div>'
        : '<div class="staff-card-permissions"><small>'+permissions.length+' permission'+(permissions.length===1?'':'s')+'</small><span>'+permissions.slice(0,4).map((permission)=>'<b>'+escapeHtml(permission)+'</b>').join('')+(permissions.length>4?'<b>+'+(permissions.length-4)+' more</b>':'')+'</span></div>';

      return '<article class="staff-directory-item">'+
        '<div class="staff-avatar">'+escapeHtml(String(staff.display_name||'?').split(/\\s+/).slice(0,2).map((x)=>x[0]||'').join('').toUpperCase())+'</div>'+
        '<div class="staff-directory-main">'+
          '<div class="staff-directory-title"><div><span>'+escapeHtml(staff.account_kind==='rider'?'DELIVERY STAFF':'ADMIN STAFF')+'</span><h4>'+escapeHtml(staff.display_name)+'</h4><p>'+escapeHtml(staff.email||'')+(staff.phone?' · '+escapeHtml(staff.phone):'')+'</p></div>'+
            '<div class="staff-directory-badges"><span class="status-chip">'+escapeHtml(staff.role_label||staff.role_code)+'</span><span class="status-chip">'+escapeHtml(staff.status)+'</span></div></div>'+
          '<div class="staff-card-meta"><span><small>Department</small><strong>'+escapeHtml(staff.department||'—')+'</strong></span><span><small>Last sign in</small><strong>'+escapeHtml(formatDate(staff.last_sign_in_at,true))+'</strong></span><span><small>Created</small><strong>'+escapeHtml(formatDate(staff.created_at))+'</strong></span></div>'+
          riderMeta+
          '<div class="staff-directory-actions">'+
            (isOwner
              ?'<span class="staff-owner-protected">🔒 Owner account protected</span>'
              :'<button type="button" data-manage-staff="'+escapeHtml(staff.user_id)+'" data-staff-kind="'+escapeHtml(staff.account_kind)+'">Manage Access</button>'+
               '<button type="button" data-send-staff-access="'+escapeHtml(staff.user_id)+'" data-staff-email="'+escapeHtml(staff.email||'')+'">Send Access Email</button>')+
          '</div>'+
        '</div>'+
      '</article>';
    }).join(''):'<div class="loading-card">No staff match the current filters.</div>';

    Array.from(list.querySelectorAll('[data-manage-staff]')).forEach((button)=>button.addEventListener('click',()=>{
      openStaffEditor(button.dataset.manageStaff,button.dataset.staffKind);
    }));
    Array.from(list.querySelectorAll('[data-send-staff-access]')).forEach((button)=>button.addEventListener('click',async()=>{
      const email=(button.dataset.staffEmail||'').trim();
      if(!email){
        globalStatus('This staff account does not have an email address.','error');
        return;
      }
      const original=button.textContent;
      button.disabled=true;
      button.textContent='Sending…';
      try{
        const {error}=await db.auth.resetPasswordForEmail(email,{
          redirectTo:STAFF_PORTAL_URL+'?recovery=1'
        });
        if(error) throw error;
        globalStatus('Staff access email sent to '+email+'. The staff member can create a new password from the secure LEOGO link.','success');
      }catch(error){
        globalStatus('Access email could not be sent: '+friendlyError(error),'error');
      }finally{
        button.disabled=false;
        button.textContent=original;
      }
    }));
  };

  const loadStaffManagement = async () => {
    if(!isSuperAdmin()) return;
    const [directoryResult,presetResult]=await Promise.all([
      db.rpc('admin_list_staff_directory'),
      db.rpc('admin_staff_role_presets')
    ]);
    if(directoryResult.error) throw directoryResult.error;
    if(presetResult.error) throw presetResult.error;
    state.staffDirectory=Array.isArray(directoryResult.data)?directoryResult.data:[];
    state.staffRolePresets=Array.isArray(presetResult.data)?presetResult.data:[];
    renderStaffRoleOptions();
    if($('#staffRole')&&!$('#staffRole').value&&state.staffRolePresets[0]) $('#staffRole').value=state.staffRolePresets[0].code;
    if(!$('#staffPermissionGrid')?.children.length) applyCreateRolePreset();
    renderStaffDirectory();
  };

  const STAFF_DOCUMENT_BUCKET = 'staff-private-documents';
  const STAFF_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
  const STAFF_DOCUMENT_MIME_TYPES = new Set(['image/jpeg','image/png','image/webp']);

  const validateStaffDocumentFile = (file,label) => {
    if(!file) return;
    if(!STAFF_DOCUMENT_MIME_TYPES.has(file.type)) throw new Error(label+' must be a JPG, PNG or WEBP image.');
    if(file.size>STAFF_DOCUMENT_MAX_BYTES) throw new Error(label+' must be 8 MB or smaller.');
  };

  const staffDocumentExtension = (file) => {
    if(file.type==='image/png') return 'png';
    if(file.type==='image/webp') return 'webp';
    return 'jpg';
  };

  const uploadStaffPrivateDocument = async (userId,accountKind,documentType,file) => {
    validateStaffDocumentFile(file,documentType==='passport'?'Passport photo':'ID picture');
    const token=(crypto.randomUUID?.()||String(Date.now())).replace(/[^a-zA-Z0-9-]/g,'').slice(0,36);
    const path=accountKind+'/'+userId+'/'+documentType+'-'+Date.now()+'-'+token+'.'+staffDocumentExtension(file);
    const {error}=await db.storage.from(STAFF_DOCUMENT_BUCKET).upload(path,file,{
      cacheControl:'3600',
      upsert:false,
      contentType:file.type
    });
    if(error) throw error;
    return path;
  };

  const removeStaffPrivateDocuments = async (paths) => {
    const clean=(paths||[]).filter(Boolean);
    if(!clean.length) return;
    try{ await db.storage.from(STAFF_DOCUMENT_BUCKET).remove(clean); }catch{}
  };

  const renderStaffDocumentPreview = async (container,path,alt) => {
    if(!container) return;
    if(!path){
      container.innerHTML='<small>Not uploaded</small>';
      return;
    }
    container.innerHTML='<small>Loading protected image…</small>';
    const {data,error}=await db.storage.from(STAFF_DOCUMENT_BUCKET).createSignedUrl(path,600);
    if(error||!data?.signedUrl){
      container.innerHTML='<small>Private image unavailable</small>';
      return;
    }
    container.innerHTML='<img src="'+escapeHtml(data.signedUrl)+'" alt="'+escapeHtml(alt)+'">';
  };

  const loadStaffDocuments = async (staff) => {
    if(!staff||!isSuperAdmin()) return;
    $('#staffPassportPhotoPreview').innerHTML='<small>Loading…</small>';
    $('#staffIdPicturePreview').innerHTML='<small>Loading…</small>';
    setFormStatus($('#staffDocumentStatus'));
    const {data,error}=await db.rpc('admin_get_staff_documents',{p_user_id:staff.user_id});
    if(error){
      state.activeStaffDocuments=null;
      setFormStatus($('#staffDocumentStatus'),friendlyError(error),'error');
      return;
    }
    state.activeStaffDocuments=data||{
      user_id:staff.user_id,
      account_kind:staff.account_kind,
      passport_photo_path:null,
      id_picture_path:null
    };
    await Promise.all([
      renderStaffDocumentPreview($('#staffPassportPhotoPreview'),state.activeStaffDocuments.passport_photo_path,'Staff passport photo'),
      renderStaffDocumentPreview($('#staffIdPicturePreview'),state.activeStaffDocuments.id_picture_path,'Staff ID picture')
    ]);
  };

  const saveStaffDocuments = async () => {
    const staff=state.activeStaff;
    if(!staff||!isSuperAdmin()) return;
    const passportFile=$('#staffEditorPassportPhoto')?.files?.[0]||null;
    const idFile=$('#staffEditorIdPicture')?.files?.[0]||null;
    if(!passportFile&&!idFile){
      setFormStatus($('#staffDocumentStatus'),'Choose a passport photo or ID picture to upload.','error');
      return;
    }

    try{
      validateStaffDocumentFile(passportFile,'Passport photo');
      validateStaffDocumentFile(idFile,'ID picture');
    }catch(error){
      setFormStatus($('#staffDocumentStatus'),friendlyError(error),'error');
      return;
    }

    await withButtonLock($('#saveStaffDocuments'),'Uploading…',async()=>{
      setFormStatus($('#staffDocumentStatus'),'Uploading protected staff documents…');
      const current=state.activeStaffDocuments||{};
      let passportPath=current.passport_photo_path||null;
      let idPath=current.id_picture_path||null;
      const uploaded=[];

      try{
        if(passportFile){
          passportPath=await uploadStaffPrivateDocument(staff.user_id,staff.account_kind,'passport',passportFile);
          uploaded.push(passportPath);
        }
        if(idFile){
          idPath=await uploadStaffPrivateDocument(staff.user_id,staff.account_kind,'id-picture',idFile);
          uploaded.push(idPath);
        }

        const {error}=await db.rpc('admin_set_staff_documents',{
          p_user_id:staff.user_id,
          p_account_kind:staff.account_kind,
          p_passport_photo_path:passportPath,
          p_id_picture_path:idPath
        });
        if(error) throw error;

        const oldToRemove=[];
        if(passportFile&&current.passport_photo_path&&current.passport_photo_path!==passportPath) oldToRemove.push(current.passport_photo_path);
        if(idFile&&current.id_picture_path&&current.id_picture_path!==idPath) oldToRemove.push(current.id_picture_path);
        await removeStaffPrivateDocuments(oldToRemove);

        $('#staffEditorPassportPhoto').value='';
        $('#staffEditorIdPicture').value='';
        setFormStatus($('#staffDocumentStatus'),'Private staff documents updated successfully.','success');
        await loadStaffDocuments(staff);
        await loadAuditLog();
      }catch(error){
        await removeStaffPrivateDocuments(uploaded);
        setFormStatus($('#staffDocumentStatus'),friendlyError(error),'error');
      }
    });
  };

  const openStaffEditor = (userId,accountKind) => {
    const staff=state.staffDirectory.find((item)=>item.user_id===userId&&item.account_kind===accountKind);
    if(!staff||staff.role_code==='super_admin') return;
    state.activeStaff=staff;

    $('#staffEditorUserId').value=staff.user_id;
    $('#staffEditorAccountKind').value=staff.account_kind;
    $('#staffEditorName').value=staff.display_name||'';
    $('#staffEditorPhone').value=staff.phone||'';
    $('#staffEditorTitle').textContent='Manage '+staff.display_name;
    $('#staffEditorSubtitle').textContent=staff.email+' · '+(staff.role_label||staff.role_code);

    const rider=staff.account_kind==='rider';
    $('#staffEditorRoleWrap').hidden=rider;
    $('#staffEditorDepartmentWrap').hidden=rider;
    $('#staffEditorJobTitleWrap').hidden=rider;
    $('#staffEditorPermissionSection').hidden=rider;
    $('#staffEditorVehicleWrap').hidden=!rider;
    $('#staffEditorRegistrationWrap').hidden=!rider;
    $('#staffEditorIdWrap').hidden=!rider;
    $('#staffEditorLicenseWrap').hidden=!rider;
    $('#staffEditorAvailabilityWrap').hidden=!rider;

    if(rider){
      $('#staffEditorStatus').innerHTML='<option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>';
      $('#staffEditorVehicleType').value=staff.vehicle_type||'';
      $('#staffEditorVehicleRegistration').value=staff.vehicle_registration||'';
      $('#staffEditorIdNumber').value=staff.id_number||'';
      $('#staffEditorLicenseNumber').value=staff.license_number||'';
      $('#staffEditorAvailability').value=staff.availability_status||'available';
    }else{
      $('#staffEditorStatus').innerHTML='<option value="active">Active</option><option value="suspended">Suspended</option>';
      $('#staffEditorRole').value=staff.role_code||'read_only';
      $('#staffEditorDepartment').value=staff.department||'';
      $('#staffEditorJobTitle').value=staff.job_title||'';
      renderPermissionGrid($('#staffEditorPermissionGrid'),staff.permissions||[]);
    }
    $('#staffEditorStatus').value=staff.status||'active';
    $('#staffEditorPassportPhoto').value='';
    $('#staffEditorIdPicture').value='';
    setFormStatus($('#staffAccessStatus'));
    setFormStatus($('#staffDocumentStatus'));
    $('#staffAccessEditor').hidden=false;
    $('#staffAccessEditor').scrollIntoView({behavior:'smooth',block:'start'});
    loadStaffDocuments(staff).catch((error)=>setFormStatus($('#staffDocumentStatus'),friendlyError(error),'error'));
  };

  const closeStaffEditor = () => {
    state.activeStaff=null;
    state.activeStaffDocuments=null;
    if($('#staffAccessEditor')) $('#staffAccessEditor').hidden=true;
    if($('#staffEditorPassportPhoto')) $('#staffEditorPassportPhoto').value='';
    if($('#staffEditorIdPicture')) $('#staffEditorIdPicture').value='';
    if($('#staffPassportPhotoPreview')) $('#staffPassportPhotoPreview').innerHTML='<small>Not uploaded</small>';
    if($('#staffIdPicturePreview')) $('#staffIdPicturePreview').innerHTML='<small>Not uploaded</small>';
    setFormStatus($('#staffAccessStatus'));
    setFormStatus($('#staffDocumentStatus'));
  };

  const createStaffAccount = async (event) => {
    event.preventDefault();

    const statusBox=$('#createStaffStatus');
    const form=$('#createStaffForm');
    const createButton=$('#createStaffButton');

    if(!isSuperAdmin()){
      setFormStatus(statusBox,'Super Admin access required.','error');
      return;
    }
    if(!form){
      globalStatus('Staff form is unavailable. Refresh Admin Center and try again.','error');
      return;
    }
    if(!form.reportValidity()){
      setFormStatus(statusBox,'Complete the required staff fields highlighted above.','error');
      return;
    }

    const kind=$('#staffAccountKind')?.value||'';
    if(kind==='admin_staff'&&!$('#staffRole')?.value){
      setFormStatus(statusBox,'Choose a Staff role before creating the account.','error');
      return;
    }
    if(kind==='rider'&&($('#staffPhone')?.value||'').trim().length<7){
      setFormStatus(statusBox,'Enter the Rider phone number.','error');
      return;
    }

    const passportFile=$('#staffPassportPhoto')?.files?.[0]||null;
    const idFile=$('#staffIdPicture')?.files?.[0]||null;
    try{
      validateStaffDocumentFile(passportFile,'Passport photo');
      validateStaffDocumentFile(idFile,'ID picture');
    }catch(error){
      setFormStatus(statusBox,friendlyError(error),'error');
      return;
    }

    const body={
      account_kind:kind,
      display_name:($('#staffDisplayName')?.value||'').trim(),
      email:($('#staffEmail')?.value||'').trim(),
      phone:($('#staffPhone')?.value||'').trim(),
      role_code:kind==='admin_staff'?$('#staffRole')?.value:'rider',
      department:kind==='admin_staff'?($('#staffDepartment')?.value||'').trim():'Delivery',
      job_title:kind==='admin_staff'?($('#staffJobTitle')?.value||'').trim():'LEOGO Rider',
      permissions:kind==='admin_staff'?selectedPermissionValues($('#staffPermissionGrid')):[],
      vehicle_type:kind==='rider'?($('#staffVehicleType')?.value||''):'',
      vehicle_registration:kind==='rider'?($('#staffVehicleRegistration')?.value||'').trim():'',
      id_number:kind==='rider'?($('#staffIdNumber')?.value||'').trim():'',
      license_number:kind==='rider'?($('#staffLicenseNumber')?.value||'').trim():''
    };

    await withButtonLock(createButton,'Creating Account…',async()=>{
      try{
        setFormStatus(statusBox,'Creating staff account and sending activation email…');

        const {data:{session},error:sessionError}=await db.auth.getSession();
        if(sessionError||!session?.access_token){
          setFormStatus(statusBox,'Your Admin session is not available. Sign out, sign in again, and retry.','error');
          return;
        }

        const response=await fetch(PROJECT_URL+'/functions/v1/admin-create-staff',{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'apikey':PUBLISHABLE_KEY,
            'Authorization':'Bearer '+session.access_token
          },
          body:JSON.stringify(body)
        });

        const rawText=await response.text();
        let data=null;
        try{ data=rawText?JSON.parse(rawText):null; }
        catch{ data={ok:false,error:rawText||('Staff service returned HTTP '+response.status),stage:'response'}; }

        if(!response.ok||!data?.ok){
          const stage=data?.stage?String(data.stage).replaceAll('_',' '):'creation';
          const message=normaliseErrorMessage(data?.error||data?.message||data||('HTTP '+response.status));
          setFormStatus(statusBox,'Staff account was not created ('+stage+'): '+message,'error');
          return;
        }

        let documentMessage='Staff account created successfully. Activation email sent to '+body.email+'.';
        let documentStatus='success';

        if(data.user_id&&(passportFile||idFile)){
          setFormStatus(statusBox,'Staff account created. Uploading protected staff documents…');
          const uploaded=[];
          try{
            let passportPath=null;
            let idPicturePath=null;

            if(passportFile){
              passportPath=await uploadStaffPrivateDocument(data.user_id,kind,'passport',passportFile);
              uploaded.push(passportPath);
            }
            if(idFile){
              idPicturePath=await uploadStaffPrivateDocument(data.user_id,kind,'id-picture',idFile);
              uploaded.push(idPicturePath);
            }

            const {error:documentError}=await db.rpc('admin_set_staff_documents',{
              p_user_id:data.user_id,
              p_account_kind:kind,
              p_passport_photo_path:passportPath,
              p_id_picture_path:idPicturePath
            });
            if(documentError) throw documentError;

            documentMessage='Staff account and private documents created successfully. Activation email sent to '+body.email+'.';
          }catch(documentError){
            await removeStaffPrivateDocuments(uploaded);
            documentMessage='Staff account was created and its activation email was sent, but the private documents could not be saved: '+friendlyError(documentError)+' You can upload them later from Manage Access.';
            documentStatus='error';
          }
        }

        setFormStatus(statusBox,documentMessage,documentStatus);

        form.reset();
        $('#staffAccountKind').value='admin_staff';
        $('#staffPhone').required=false;
        $('#staffRole').required=true;
        $('#adminStaffFields').hidden=false;
        $('#riderStaffFields').hidden=true;
        renderStaffRoleOptions();
        if(state.staffRolePresets[0]) $('#staffRole').value=state.staffRolePresets[0].code;
        applyCreateRolePreset();

        const refreshes=await Promise.allSettled([
          loadStaffManagement(),
          loadDeliveryOps(),
          loadAuditLog()
        ]);
        const refreshFailure=refreshes.find((result)=>result.status==='rejected');
        if(refreshFailure){
          console.warn('Staff account created but one Admin refresh failed:',refreshFailure.reason);
        }
      }catch(error){
        console.error('Create staff failed:',error);
        setFormStatus(statusBox,friendlyError(error),'error');
      }
    });
  };

  const saveStaffAccess = async (event) => {
    event.preventDefault();
    const staff=state.activeStaff;
    if(!staff) return;

    const rider=staff.account_kind==='rider';
    await withButtonLock($('#saveStaffAccess'),'Saving…',async()=>{
      setFormStatus($('#staffAccessStatus'),'Saving staff access…');
      const args={
        p_user_id:staff.user_id,
        p_account_kind:staff.account_kind,
        p_display_name:$('#staffEditorName').value.trim(),
        p_phone:$('#staffEditorPhone').value.trim()||null,
        p_department:rider?null:($('#staffEditorDepartment').value.trim()||null),
        p_job_title:rider?null:($('#staffEditorJobTitle').value.trim()||null),
        p_role_code:rider?null:$('#staffEditorRole').value,
        p_status:$('#staffEditorStatus').value,
        p_permissions:rider?[]:selectedPermissionValues($('#staffEditorPermissionGrid')),
        p_vehicle_type:rider?($('#staffEditorVehicleType').value.trim()||null):null,
        p_vehicle_registration:rider?($('#staffEditorVehicleRegistration').value.trim()||null):null,
        p_id_number:rider?($('#staffEditorIdNumber').value.trim()||null):null,
        p_license_number:rider?($('#staffEditorLicenseNumber').value.trim()||null):null,
        p_availability_status:rider?$('#staffEditorAvailability').value:null
      };
      const {error}=await db.rpc('admin_update_staff_access',args);
      if(error){
        setFormStatus($('#staffAccessStatus'),friendlyError(error),'error');
        return;
      }
      setFormStatus($('#staffAccessStatus'),'Staff access updated and recorded in the Audit Log.','success');
      await Promise.all([loadStaffManagement(),loadDeliveryOps(),loadAuditLog()]);
      const refreshed=state.staffDirectory.find((item)=>item.user_id===staff.user_id&&item.account_kind===staff.account_kind);
      if(refreshed) state.activeStaff=refreshed;
    });
  };

  const loadMarketplaceOrders = async ({refreshActiveDetail=false}={}) => {
    const {data,error}=await db.rpc('admin_list_marketplace_orders');
    if(error) throw error;
    state.marketplaceOrders=Array.isArray(data)?data:[];
    renderMarketplaceOrders();

    if(refreshActiveDetail && state.activeMarketplaceOrderId && !$('#adminOrderDetailPanel')?.hidden){
      await loadMarketplaceOrderDetail(state.activeMarketplaceOrderId,{scroll:false});
    }
  };

  const aftersalesStatusLabel=(status)=>({
    submitted:'Submitted',
    in_review:'Under review',
    contacted:'Customer contacted',
    resolved:'Resolved',
    rejected:'Closed — not approved',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const aftersalesIssueLabel=(value)=>({
    wrong_or_missing_item:'Wrong or missing item',
    damaged_item:'Damaged item',
    return_or_refund:'Return or refund request',
    warranty:'Warranty assistance',
    delivery_problem:'Delivery complaint',
    other:'Other follow-up'
  }[value]||String(value||'').replaceAll('_',' '));

  const aftersalesSolutionLabel=(value)=>({
    replacement:'Replacement',
    refund_review:'Refund review',
    repair_or_warranty:'Repair or warranty help',
    seller_follow_up:'Seller follow-up',
    customer_care_call:'Customer-care call'
  }[value]||String(value||'').replaceAll('_',' '));

  const filteredAftersalesCases=()=>{
    const term=($('#adminAftersalesSearch')?.value||'').trim().toLowerCase();
    const status=$('#adminAftersalesStatusFilter')?.value||'all';
    return state.aftersalesCases.filter((item)=>{
      const haystack=[
        item.case_reference,item.order_reference,item.customer_name,item.customer_phone,
        item.issue_type,item.preferred_solution,item.details,item.status
      ].map((value)=>String(value||'').toLowerCase());
      return (!term||haystack.some((value)=>value.includes(term)))
        && (status==='all'||item.status===status);
    });
  };

  const renderAftersalesCases=()=>{
    const all=state.aftersalesCases;
    const rows=filteredAftersalesCases();
    const openStatuses=['submitted','in_review','contacted'];
    $('#aftersalesOpenCount').textContent=all.filter((item)=>openStatuses.includes(item.status)).length;
    $('#aftersalesNewCount').textContent=all.filter((item)=>item.status==='submitted').length;
    $('#aftersalesReviewCount').textContent=all.filter((item)=>['in_review','contacted'].includes(item.status)).length;
    $('#aftersalesResolvedCount').textContent=all.filter((item)=>item.status==='resolved').length;
    $('#sidebarAftersalesCount').textContent=all.filter((item)=>openStatuses.includes(item.status)).length;

    $('#adminAftersalesBody').innerHTML=rows.length?rows.map((item)=>`
      <tr class="${state.activeAftersalesCaseId===item.case_id?'admin-order-row-active':''}">
        <td><strong>${escapeHtml(item.case_reference)}</strong><small>${formatDate(item.created_at,true)}</small></td>
        <td><strong>${escapeHtml(item.order_reference)}</strong><small>${formatMoney(item.grand_total_kes)}</small></td>
        <td><strong>${escapeHtml(item.customer_name||'Customer')}</strong><small>${escapeHtml(item.customer_phone||'')}</small></td>
        <td><strong>${escapeHtml(aftersalesIssueLabel(item.issue_type))}</strong><small>${escapeHtml(aftersalesSolutionLabel(item.preferred_solution))}</small></td>
        <td>${formatDate(item.created_at,true)}</td>
        <td><span class="status-chip">${escapeHtml(aftersalesStatusLabel(item.status))}</span></td>
        <td><button type="button" data-open-aftersales-case="${escapeHtml(item.case_id)}">Open Case</button></td>
      </tr>
    `).join(''):'<tr><td colspan="7">No Aftersales cases match the current filters.</td></tr>';
  };

  const renderAftersalesDetail=()=>{
    const item=state.aftersalesCases.find((row)=>row.case_id===state.activeAftersalesCaseId);
    const panel=$('#adminAftersalesDetail');
    if(!item||!panel){ if(panel) panel.hidden=true; return; }

    panel.hidden=false;
    $('#adminAftersalesTitle').textContent=item.case_reference;
    $('#adminAftersalesSubtitle').textContent='Order '+item.order_reference+' · submitted '+formatDate(item.created_at,true);
    $('#adminAftersalesCustomer').innerHTML=
      '<div><small>Customer</small><strong>'+escapeHtml(item.customer_name||'Customer')+'</strong></div>'+
      '<div><small>Phone</small><strong>'+escapeHtml(item.customer_phone||'—')+'</strong></div>'+
      '<div><small>Order</small><strong>'+escapeHtml(item.order_reference)+'</strong></div>'+
      '<div><small>Delivered</small><strong>'+escapeHtml(formatDate(item.delivered_at,true))+'</strong></div>';
    $('#adminAftersalesState').innerHTML=
      '<div><small>Status</small><strong>'+escapeHtml(aftersalesStatusLabel(item.status))+'</strong></div>'+
      '<div><small>Case submitted</small><strong>'+escapeHtml(formatDate(item.created_at,true))+'</strong></div>'+
      '<div><small>Last updated</small><strong>'+escapeHtml(formatDate(item.updated_at,true))+'</strong></div>'+
      '<div><small>Resolved</small><strong>'+escapeHtml(formatDate(item.resolved_at,true))+'</strong></div>';
    $('#adminAftersalesRequest').innerHTML=
      '<div><small>Issue</small><strong>'+escapeHtml(aftersalesIssueLabel(item.issue_type))+'</strong></div>'+
      '<div><small>Preferred solution</small><strong>'+escapeHtml(aftersalesSolutionLabel(item.preferred_solution))+'</strong></div>'+
      '<div class="admin-aftersales-details-copy"><small>Customer explanation</small><p>'+escapeHtml(item.details||'—')+'</p></div>';

    $('#adminAftersalesCaseStatus').value=item.status;
    $('#adminAftersalesNotes').value=item.admin_notes||'';
    $('#openAftersalesEvidence').disabled=!item.evidence_path;
    $('#openAftersalesEvidence').textContent=item.evidence_path?'View Customer Evidence':'No Evidence Attached';
    setFormStatus($('#adminAftersalesStatus'),'');
  };

  const loadAftersalesCases=async()=>{
    const {data,error}=await db.rpc('admin_list_marketplace_aftersales');
    if(error) throw error;
    state.aftersalesCases=Array.isArray(data)?data:[];
    if(state.activeAftersalesCaseId&&!state.aftersalesCases.some((item)=>item.case_id===state.activeAftersalesCaseId)){
      state.activeAftersalesCaseId=null;
    }
    renderAftersalesCases();
    renderAftersalesDetail();
  };

  const saveActiveAftersalesCase=async(button)=>{
    const item=state.aftersalesCases.find((row)=>row.case_id===state.activeAftersalesCaseId);
    if(!item){
      setFormStatus($('#adminAftersalesStatus'),'Open an Aftersales case first.','error');
      return;
    }
    const nextStatus=$('#adminAftersalesCaseStatus').value;
    const notes=$('#adminAftersalesNotes').value.trim();
    if(['resolved','rejected'].includes(nextStatus)&&notes.length<3){
      setFormStatus($('#adminAftersalesStatus'),'Add Customer Care notes before closing this case.','error');
      return;
    }
    await withButtonLock(button,'Saving…',async()=>{
      const {data,error}=await db.rpc('admin_update_marketplace_aftersales',{
        p_case_id:item.case_id,
        p_status:nextStatus,
        p_admin_notes:notes||null
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      await Promise.all([loadAftersalesCases(),loadAuditLog()]);
      setFormStatus($('#adminAftersalesStatus'),'Case updated and the customer was notified.','success');
      globalStatus('Aftersales case '+item.case_reference+' updated.');
    });
  };

  const openActiveAftersalesEvidence=async(button)=>{
    const item=state.aftersalesCases.find((row)=>row.case_id===state.activeAftersalesCaseId);
    if(!item?.evidence_path) return;
    await withButtonLock(button,'Opening…',async()=>{
      const {data,error}=await db.storage.from('marketplace-aftersales-evidence').createSignedUrl(item.evidence_path,600);
      if(error) throw error;
      if(!data?.signedUrl) throw new Error('Evidence link could not be created');
      window.open(data.signedUrl,'_blank','noopener');
    });
  };

  const paymentStatusLabel=(status)=>({
    submitted:'Submitted — verify',
    verified_paid:'Paid',
    cod_due:'COD due',
    cod_paid:'Paid on delivery',
    rejected:'Rejected'
  }[status]||String(status||'').replaceAll('_',' '));

  const orderStatusLabel=(status)=>({
    placed:'Placed',
    processing:'Seller preparing',
    with_rider:'With rider',
    delivered:'Delivered',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const sellerFulfilmentLabel=(status)=>({
    new:'New order',
    received:'Received',
    packed_ready:'Packed & ready',
    handed_to_rider:'Handed to rider',
    delivered:'Delivered',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const deliveryStatusLabel=(status)=>({
    awaiting_assignment:'Awaiting assignment',
    assigned:'Rider assigned',
    picked_up:'Picked up from Seller',
    arrived_sorting_center:'Arrived at LEOGO Sorting Center',
    sorting_received:'Received at LEOGO Sorting Center',
    ready_for_dispatch:'Ready for dispatch',
    on_the_way:'On the way to customer',
    delivered:'Delivered',
    failed:'Failed',
    cancelled:'Cancelled'
  }[status]||String(status||'').replaceAll('_',' '));

  const filteredMarketplaceOrders=()=>{
    const term=($('#adminOrderSearch')?.value||'').trim().toLowerCase();
    const payment= $('#adminOrderPaymentFilter')?.value||'all';
    const status= $('#adminOrderStatusFilter')?.value||'all';

    return state.marketplaceOrders.filter((order)=>{
      const values=[
        order.order_reference,order.receiver_name,order.contact_number,order.customer_email,
        order.payment_method,order.payment_status,order.order_status
      ].map((value)=>String(value||'').toLowerCase());

      return (!term||values.some((value)=>value.includes(term)))
        && (payment==='all'||order.payment_status===payment)
        && (status==='all'||order.order_status===status);
    });
  };

  const verifyMarketplaceOrderPayment=async(button,orderId,paid)=>{
    if(!adminHas('orders.payment_verify')){
      globalStatus('Your staff role cannot verify customer payments.','error');
      return;
    }
    let notes='';
    if(!paid){
      notes=window.prompt('Reason the payment could not be verified:','')||'';
      if(notes.trim().length<3){
        globalStatus('Enter a clear payment rejection reason.','error');
        return;
      }
    }

    if(paid&&!window.confirm('Confirm that this customer payment has been verified in the LEOGO receiving account?')) return;

    await withButtonLock(button,paid?'Verifying…':'Rejecting…',async()=>{
      const {error}=await db.rpc('admin_verify_marketplace_order_payment',{
        p_order_id:orderId,
        p_paid:paid,
        p_notes:notes||null
      });
      if(error){
        globalStatus(friendlyError(error),'error');
        return;
      }

      await Promise.all([loadMarketplaceOrders({refreshActiveDetail:false}),loadAuditLog()]);
      if(state.activeMarketplaceOrderId===orderId){
        await loadMarketplaceOrderDetail(orderId,{scroll:false});
      }
      globalStatus(paid?'Order payment verified.':'Order payment rejected.');
    });
  };

  const renderMarketplaceOrders=()=>{
    const all=state.marketplaceOrders;
    const orders=filteredMarketplaceOrders();

    $('#adminOrderTotal').textContent=all.length;
    $('#adminOrderPaymentPending').textContent=all.filter((o)=>o.payment_status==='submitted').length;
    $('#adminOrderWithRider').textContent=all.filter((o)=>o.order_status==='with_rider').length;
    $('#adminOrderDelivered').textContent=all.filter((o)=>o.order_status==='delivered').length;

    $('#adminMarketplaceOrderBody').innerHTML=orders.length?orders.map((o)=>`<tr class="${state.activeMarketplaceOrderId===o.id?'admin-order-row-active':''}">
      <td><strong>${escapeHtml(o.order_reference)}</strong><small>${formatDate(o.created_at,true)}</small></td>
      <td><strong>${escapeHtml(o.receiver_name)}</strong><small>${escapeHtml(o.customer_email||o.contact_number||'')}</small></td>
      <td><strong>${formatMoney(o.grand_total_kes)}</strong><small>${Number(o.seller_count||0)} Seller(s)</small></td>
      <td><span class="status-chip">${escapeHtml(paymentStatusLabel(o.payment_status))}</span><small>${escapeHtml(String(o.payment_method||'').replaceAll('_',' '))}</small></td>
      <td><span class="status-chip">${escapeHtml(orderStatusLabel(o.order_status))}</span></td>
      <td><small class="order-payment-proof">${escapeHtml(o.payment_message||'No payment message')}</small></td>
      <td class="settlement-admin-actions admin-order-row-actions">
        <button type="button" data-open-marketplace-order="${escapeHtml(o.id)}">View Order</button>
        ${o.payment_status==='submitted' && adminHas('orders.payment_verify')
          ? '<button type="button" data-order-payment="paid" data-order-id="'+escapeHtml(o.id)+'">Verify Paid</button><button type="button" class="danger" data-order-payment="reject" data-order-id="'+escapeHtml(o.id)+'">Reject</button>'
          : ''}
      </td>
    </tr>`).join(''):'<tr><td colspan="7">No marketplace orders match the current filters.</td></tr>';

    $$('[data-open-marketplace-order]').forEach((button)=>button.addEventListener('click',()=>{
      loadMarketplaceOrderDetail(button.dataset.openMarketplaceOrder,{scroll:true});
    }));

    $$('[data-order-payment]').forEach((button)=>button.addEventListener('click',()=>{
      verifyMarketplaceOrderPayment(button,button.dataset.orderId,button.dataset.orderPayment==='paid');
    }));
  };

  const orderItemMediaUrl=(path)=>{
    if(!path) return '';
    return db.storage.from('seller-product-media').getPublicUrl(String(path)).data?.publicUrl||'';
  };

  const safeHttpUrl=(value)=>{
    try{
      const url=new URL(String(value||''));
      return ['http:','https:'].includes(url.protocol)?url.href:'';
    }catch{return '';}
  };

  const orderDeliveryAddress=(order)=>{
    if(order.delivery_zone==='pickup'){
      return order.pickup_station_name
        ? [order.pickup_station_name,order.pickup_station_address].filter(Boolean).join(' — ')
        : 'Customer collection at selected LEOGO pickup station';
    }
    return [order.estate,order.landmark,order.sub_county,order.county].filter(Boolean).join(', ')||'Delivery address not supplied';
  };

  const sellerReadiness=(sellers)=>{
    if(!sellers.length) return {ready:false,label:'Waiting for Seller order records'};
    const ready=sellers.every((seller)=>['packed_ready','handed_to_rider','delivered'].includes(seller.fulfilment_status));
    return {
      ready,
      label:ready?'All Seller portions are packed & ready':'Waiting for Seller preparation'
    };
  };

  const deliveryQrTarget = (order) => {
    const url=new URL('../scan/',window.location.href);
    url.searchParams.set('order',order.id);
    url.searchParams.set('ref',order.order_reference||'');
    url.searchParams.set('type','marketplace');
    return url.href;
  };

  const loadImageForCanvas = (src) => new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Image could not load'));
    image.src=src;
  });

  const canvasWrapText = (ctx,text,x,y,maxWidth,lineHeight,maxLines=99) => {
    const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
    const lines=[];
    let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width>maxWidth && line){
        lines.push(line);
        line=word;
        if(lines.length>=maxLines) break;
      }else{
        line=test;
      }
    }
    if(lines.length<maxLines && line) lines.push(line);
    if(words.length && lines.length===maxLines){
      const joined=lines.join(' ');
      if(joined.length<String(text||'').trim().length){
        let last=lines[lines.length-1]||'';
        while(last.length>3 && ctx.measureText(last+'...').width>maxWidth) last=last.slice(0,-1);
        lines[lines.length-1]=last+'...';
      }
    }
    lines.forEach((value,index)=>ctx.fillText(value,x,y+(index*lineHeight)));
    return y+(lines.length*lineHeight);
  };

  const buildDeliveryQrCanvas = async (text,size=250) => {
    if(!window.QRCode) throw new Error('QR generator did not load. Refresh Admin and try again.');
    const holder=document.createElement('div');
    holder.style.position='fixed';
    holder.style.left='-10000px';
    holder.style.top='-10000px';
    document.body.appendChild(holder);
    try{
      new window.QRCode(holder,{
        text,
        width:size,
        height:size,
        correctLevel:window.QRCode.CorrectLevel?.M ?? 0
      });
      await new Promise((resolve)=>window.setTimeout(resolve,30));
      const qrCanvas=holder.querySelector('canvas');
      if(qrCanvas) return qrCanvas;

      const img=holder.querySelector('img');
      if(img){
        if(!img.complete) await new Promise((resolve)=>{img.onload=resolve;});
        const canvas=document.createElement('canvas');
        canvas.width=size;
        canvas.height=size;
        canvas.getContext('2d').drawImage(img,0,0,size,size);
        return canvas;
      }
      throw new Error('QR code could not be generated.');
    }finally{
      holder.remove();
    }
  };

  const buildOrderDeliverySummaryCanvas = async (detail) => {
    if(!detail?.order) throw new Error('Open an order before downloading its delivery summary.');

    const order=detail.order;
    const items=Array.isArray(detail.items)?detail.items:[];
    const sellers=Array.isArray(detail.sellers)?detail.sellers:[];
    const delivery=detail.delivery||null;
    const width=1240;
    const height=1754;
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext('2d');

    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#07152f';
    ctx.fillRect(0,0,width,220);
    ctx.fillStyle='#ff7800';
    ctx.fillRect(0,220,width,16);

    try{
      const logoUrl=new URL('../assets/images/leogo-official-logo.jpg',window.location.href).href;
      const logo=await loadImageForCanvas(logoUrl);
      ctx.fillStyle='#ffffff';
      ctx.fillRect(52,44,126,126);
      ctx.drawImage(logo,52,44,126,126);
    }catch{}

    ctx.textBaseline='top';
    ctx.fillStyle='#ffffff';
    ctx.font='700 42px Arial, sans-serif';
    ctx.fillText('LEOGO DIGITAL MARKET',205,54);
    ctx.font='700 24px Arial, sans-serif';
    ctx.fillStyle='#ffb26e';
    ctx.fillText('ORDER SUMMARY / DELIVERY LABEL',205,110);
    ctx.font='18px Arial, sans-serif';
    ctx.fillStyle='#d7dfeb';
    ctx.fillText('For fulfilment, pickup, Rider handover and final delivery.',205,150);

    const qrUrl=deliveryQrTarget(order);
    const qr=await buildDeliveryQrCanvas(qrUrl,250);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(930,278,270,330);
    ctx.drawImage(qr,940,288,250,250);
    ctx.fillStyle='#07152f';
    ctx.font='700 16px Arial, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('SCAN ORDER',1065,546);
    ctx.font='700 13px Arial, sans-serif';
    ctx.fillStyle='#5d6b7f';
    ctx.fillText(String(order.order_reference||'LEOGO ORDER'),1065,572);
    ctx.textAlign='left';

    let y=286;
    ctx.fillStyle='#6b778b';
    ctx.font='700 16px Arial, sans-serif';
    ctx.fillText('ORDER REFERENCE',54,y);
    y+=30;
    ctx.fillStyle='#07152f';
    ctx.font='700 38px Arial, sans-serif';
    ctx.fillText(String(order.order_reference||'ORDER'),54,y);
    y+=62;

    ctx.fillStyle='#fff4e8';
    ctx.fillRect(54,y,830,82);
    ctx.fillStyle='#b44f00';
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillText('STATUS',72,y+18);
    ctx.fillStyle='#07152f';
    ctx.font='700 24px Arial, sans-serif';
    ctx.fillText(orderStatusLabel(order.order_status).toUpperCase()+'  |  '+deliveryStatusLabel(delivery?.status||'awaiting_assignment').toUpperCase(),175,y+13);
    y+=116;

    const sectionTitle=(title,atY)=>{
      ctx.fillStyle='#07152f';
      ctx.font='700 22px Arial, sans-serif';
      ctx.fillText(title,54,atY);
      ctx.fillStyle='#ff7800';
      ctx.fillRect(54,atY+31,830,4);
      return atY+52;
    };

    y=sectionTitle('DELIVER TO',y);
    ctx.fillStyle='#07152f';
    ctx.font='700 30px Arial, sans-serif';
    ctx.fillText(String(order.receiver_name||'Receiver'),54,y);
    y+=44;
    ctx.font='700 23px Arial, sans-serif';
    ctx.fillStyle='#26364f';
    ctx.fillText(String(order.contact_number||'No phone'),54,y);
    y+=38;
    ctx.font='22px Arial, sans-serif';
    ctx.fillStyle='#44526a';
    y=canvasWrapText(ctx,orderDeliveryAddress(order),54,y,830,31,4)+12;

    y=sectionTitle('ORDER ITEMS',y);
    const visibleItems=items.slice(0,7);
    if(!visibleItems.length){
      ctx.font='20px Arial, sans-serif';
      ctx.fillStyle='#6b778b';
      ctx.fillText('No item lines found.',54,y);
      y+=40;
    }else{
      for(const item of visibleItems){
        const name=item.variant_name?item.product_name+' - '+item.variant_name:item.product_name;
        ctx.font='700 22px Arial, sans-serif';
        ctx.fillStyle='#07152f';
        ctx.fillText(Number(item.quantity||0)+' x',54,y);
        ctx.font='22px Arial, sans-serif';
        canvasWrapText(ctx,name,112,y,570,29,2);
        ctx.font='700 20px Arial, sans-serif';
        ctx.textAlign='right';
        ctx.fillText(formatMoney(item.line_total_kes),880,y);
        ctx.textAlign='left';
        y+=58;
        ctx.fillStyle='#e2e8f0';
        ctx.fillRect(54,y-9,830,1);
      }
      if(items.length>visibleItems.length){
        ctx.fillStyle='#6b778b';
        ctx.font='700 18px Arial, sans-serif';
        ctx.fillText('+'+(items.length-visibleItems.length)+' more item line(s)',54,y);
        y+=34;
      }
    }

    y=sectionTitle('PAYMENT',Math.min(y+8,1250));
    const codDue=order.payment_status==='cod_due';
    ctx.fillStyle=codDue?'#fff0e5':'#edf9f1';
    ctx.fillRect(54,y,830,92);
    ctx.fillStyle=codDue?'#a94300':'#177245';
    ctx.font='700 20px Arial, sans-serif';
    ctx.fillText(codDue?'COLLECT ON DELIVERY':'PAYMENT STATUS',72,y+16);
    ctx.font='700 30px Arial, sans-serif';
    ctx.fillText(codDue?formatMoney(order.grand_total_kes):paymentStatusLabel(order.payment_status).toUpperCase(),72,y+46);
    ctx.fillStyle='#394960';
    ctx.font='18px Arial, sans-serif';
    ctx.textAlign='right';
    ctx.fillText(String(order.payment_method||'').replaceAll('_',' ').toUpperCase(),865,y+53);
    ctx.textAlign='left';
    y+=122;

    ctx.fillStyle='#07152f';
    ctx.font='700 19px Arial, sans-serif';
    ctx.fillText('RIDER',54,y);
    ctx.font='20px Arial, sans-serif';
    ctx.fillStyle='#34445d';
    ctx.fillText(delivery?.rider_name||'Not yet assigned',150,y);
    if(delivery?.rider_phone){
      ctx.font='18px Arial, sans-serif';
      ctx.fillText(delivery.rider_phone,500,y+2);
    }

    y+=42;
    ctx.font='700 19px Arial, sans-serif';
    ctx.fillStyle='#07152f';
    ctx.fillText('SELLER(S)',54,y);
    ctx.font='18px Arial, sans-serif';
    ctx.fillStyle='#34445d';
    y=canvasWrapText(ctx,sellers.map((seller)=>seller.business_name).filter(Boolean).join(', ')||'Seller details available in Admin',165,y,715,26,2)+28;

    if(delivery?.admin_notes){
      ctx.font='700 17px Arial, sans-serif';
      ctx.fillStyle='#07152f';
      ctx.fillText('STAFF / RIDER INSTRUCTIONS',54,y);
      ctx.font='17px Arial, sans-serif';
      ctx.fillStyle='#44526a';
      y=canvasWrapText(ctx,delivery.admin_notes,54,y+28,830,24,3)+18;
    }

    if(delivery?.rider_notes){
      ctx.font='700 17px Arial, sans-serif';
      ctx.fillStyle='#07152f';
      ctx.fillText('RIDER UPDATE',54,y);
      ctx.font='17px Arial, sans-serif';
      ctx.fillStyle='#44526a';
      canvasWrapText(ctx,delivery.rider_notes,54,y+28,830,24,2);
    }

    const footerY=1608;
    ctx.fillStyle='#07152f';
    ctx.fillRect(0,footerY,width,height-footerY);
    ctx.fillStyle='#ffffff';
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillText('Permanent LEOGO order QR — authorized Staff and future Pickup Agents can use it to identify this order.',54,footerY+28);
    ctx.font='16px Arial, sans-serif';
    ctx.fillStyle='#c9d4e4';
    ctx.fillText('Printed '+formatDate(new Date().toISOString(),true)+'  |  Do not expose this label after delivery.',54,footerY+62);
    ctx.textAlign='right';
    ctx.fillStyle='#ffb26e';
    ctx.font='700 17px Arial, sans-serif';
    ctx.fillText(String(order.order_reference||''),1186,footerY+47);
    ctx.textAlign='left';

    return canvas;
  };

  const downloadOrderDeliverySummary = async () => {
    const detail=state.activeMarketplaceOrderDetail;
    if(!detail?.order) return;
    const button=$('#downloadOrderDeliverySummary');
    const original=button?.textContent||'Download Order Summary + QR';
    try{
      if(button){button.disabled=true;button.textContent='Preparing Summary…';}
      setFormStatus($('#adminOrderDetailStatus'),'Generating order summary with permanent LEOGO order QR…');
      const canvas=await buildOrderDeliverySummaryCanvas(detail);
      const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Delivery summary image could not be created.');
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=(detail.order.order_reference||'LEOGO-order')+'-order-summary.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      setFormStatus($('#adminOrderDetailStatus'),'Order summary with QR downloaded successfully.','success');
    }catch(error){
      setFormStatus($('#adminOrderDetailStatus'),friendlyError(error),'error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  };

  const printOrderDeliverySummary = async () => {
    const detail=state.activeMarketplaceOrderDetail;
    if(!detail?.order) return;

    const paperSize=$('#orderSummaryPaperSize')?.value||'a6';
    const popup=window.open('','_blank',paperSize==='80mm'?'width=420,height=760':'width=900,height=1100');
    if(!popup){
      setFormStatus($('#adminOrderDetailStatus'),'Your browser blocked the print window. Allow pop-ups for LEOGO Admin and try again.','error');
      return;
    }

    const button=$('#printOrderDeliverySummary');
    const original=button?.textContent||'Print Order Summary';
    try{
      if(button){button.disabled=true;button.textContent='Preparing…';}
      popup.document.write('<!doctype html><title>Preparing LEOGO Delivery Summary</title><body style="font-family:Arial;padding:24px">Preparing delivery summary…</body>');
      const canvas=await buildOrderDeliverySummaryCanvas(detail);
      const dataUrl=canvas.toDataURL('image/png');
      const pageCss=paperSize==='80mm'
        ? '@page{size:80mm 113mm;margin:0}html,body{width:80mm;height:113mm;margin:0;padding:0;background:#fff}img{width:80mm;height:113mm;object-fit:contain;display:block;margin:0}'
        : '@page{size:A6 portrait;margin:0}html,body{width:105mm;height:148mm;margin:0;padding:0;background:#fff}img{width:105mm;height:148mm;object-fit:contain;display:block;margin:0}';
      const paperLabel=paperSize==='80mm'?'80 mm thermal':'A6';
      popup.document.open();
      popup.document.write('<!doctype html><html><head><title>'+escapeHtml(detail.order.order_reference||'LEOGO Order Summary')+'</title><style>'+pageCss+'</style></head><body><img id="label" src="'+dataUrl+'" alt="LEOGO Order Summary"><script>document.getElementById("label").onload=function(){setTimeout(function(){window.print();},120)};<\/script></body></html>');
      popup.document.close();
      setFormStatus($('#adminOrderDetailStatus'),'Order summary opened for '+paperLabel+' printing.','success');
    }catch(error){
      popup.close();
      setFormStatus($('#adminOrderDetailStatus'),friendlyError(error),'error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  };

  const renderMarketplaceOrderDetail=()=>{
    const panel=$('#adminOrderDetailPanel');
    const detail=state.activeMarketplaceOrderDetail;
    if(!panel||!detail?.order) return;

    const order=detail.order;
    const items=Array.isArray(detail.items)?detail.items:[];
    const sellers=Array.isArray(detail.sellers)?detail.sellers:[];
    const delivery=detail.delivery||null;
    const readiness=sellerReadiness(sellers);
    const codNeedsCollection=String(order.payment_method||'').toLowerCase()==='cod'
      && !['cod_paid','verified_paid'].includes(String(order.payment_status||'').toLowerCase());
    const codInstruction='COD: Collect and confirm the full '+formatMoney(order.grand_total_kes)+' payment before handing over the order to the customer.';

    panel.hidden=false;
    if($('#downloadOrderDeliverySummary')) $('#downloadOrderDeliverySummary').disabled=false;
    if($('#printOrderDeliverySummary')) $('#printOrderDeliverySummary').disabled=false;
    $('#adminOrderDetailTitle').textContent=order.order_reference||'Order Details';
    $('#adminOrderDetailSubtitle').textContent=formatDate(order.created_at,true)+' · '+orderStatusLabel(order.order_status);
    setFormStatus($('#adminOrderDetailStatus'));

    const locationUrl=safeHttpUrl(order.location_link);
    $('#adminOrderCustomerDetail').innerHTML=
      '<div class="admin-order-info-row"><small>Receiver</small><strong>'+escapeHtml(order.receiver_name||'—')+'</strong></div>'+
      '<div class="admin-order-info-row"><small>Phone</small><strong>'+escapeHtml(order.contact_number||'—')+'</strong></div>'+
      '<div class="admin-order-info-row"><small>Customer email</small><strong>'+escapeHtml(order.customer_email||'—')+'</strong></div>'+
      '<div class="admin-order-info-row"><small>Delivery method</small><strong>'+escapeHtml(String(order.delivery_zone||'').replaceAll('_',' '))+'</strong></div>'+
      '<div class="admin-order-info-row admin-order-address-row"><small>Destination</small><strong>'+escapeHtml(orderDeliveryAddress(order))+'</strong></div>'+
      (locationUrl?'<a class="admin-order-location-link" href="'+escapeHtml(locationUrl)+'" target="_blank" rel="noopener">Open customer location pin ↗</a>':'');

    const paymentActions=order.payment_status==='submitted' && adminHas('orders.payment_verify')
      ? '<div class="admin-order-payment-actions"><button type="button" data-detail-payment="paid">Verify Paid</button><button type="button" class="danger" data-detail-payment="reject">Reject Payment</button></div>'
      : '';

    $('#adminOrderPaymentDetail').innerHTML=
      '<div class="admin-order-info-row"><small>Payment method</small><strong>'+escapeHtml(String(order.payment_method||'').replaceAll('_',' '))+'</strong></div>'+
      '<div class="admin-order-info-row"><small>Payment status</small><strong>'+escapeHtml(paymentStatusLabel(order.payment_status))+'</strong></div>'+
      '<div class="admin-order-payment-proof-full"><small>Payment confirmation / proof</small><p>'+escapeHtml(order.payment_message||'No payment message submitted')+'</p></div>'+
      '<div class="admin-order-totals">'+
        '<span><small>Items subtotal</small><strong>'+formatMoney(order.items_subtotal_kes)+'</strong></span>'+
        '<span><small>Service fee</small><strong>'+formatMoney(order.service_fee_kes)+'</strong></span>'+
        '<span><small>Pickup fee</small><strong>'+formatMoney(order.pickup_fee_kes)+'</strong></span>'+
        '<span><small>Delivery fee</small><strong>'+formatMoney(order.delivery_fee_kes)+'</strong></span>'+
        '<span class="grand"><small>Grand total</small><strong>'+formatMoney(order.grand_total_kes)+'</strong></span>'+
      '</div>'+
      (order.payment_verified_at?'<p class="admin-order-verified-note">Verified '+escapeHtml(formatDate(order.payment_verified_at,true))+(order.payment_verified_by_name?' by '+escapeHtml(order.payment_verified_by_name):'')+'</p>':'')+
      paymentActions;

    $('#adminOrderItemList').innerHTML=items.length?items.map((item)=>{
      const imageUrl=orderItemMediaUrl(item.variant_image_path||item.product_image_path);
      const itemName=item.variant_name?item.product_name+' — '+item.variant_name:item.product_name;
      return '<article class="admin-order-item-card">'+
        '<div class="admin-order-item-image">'+(imageUrl?'<img src="'+escapeHtml(imageUrl)+'" alt="">':'<span>📦</span>')+'</div>'+
        '<div class="admin-order-item-main">'+
          '<span>'+escapeHtml(item.seller_name||'Seller')+'</span>'+
          '<h5>'+escapeHtml(itemName)+'</h5>'+
          '<p>'+Number(item.quantity)+' × '+formatMoney(item.unit_price_kes)+(item.measurement_unit?' · '+escapeHtml(item.measurement_unit):'')+'</p>'+
        '</div>'+
        '<strong>'+formatMoney(item.line_total_kes)+'</strong>'+
      '</article>';
    }).join(''):'<div class="loading-card">No order items found.</div>';

    $('#adminOrderSellerList').innerHTML=sellers.length?sellers.map((seller)=>{
      const stages=[
        ['Received',seller.received_at],
        ['Packed & Ready',seller.packed_ready_at],
        ['Handed to Rider',seller.handed_to_rider_at],
        ['Delivered',seller.delivered_at]
      ];
      return '<article class="admin-order-seller-card">'+
        '<header><div><span>SELLER</span><h5>'+escapeHtml(seller.business_name||'Seller')+'</h5><p>'+escapeHtml(seller.seller_phone||'')+(seller.seller_email?' · '+escapeHtml(seller.seller_email):'')+'</p></div>'+
          '<span class="status-chip">'+escapeHtml(sellerFulfilmentLabel(seller.fulfilment_status))+'</span></header>'+
        '<div class="admin-order-seller-facts">'+
          '<span><small>Seller subtotal</small><strong>'+formatMoney(seller.seller_subtotal_kes)+'</strong></span>'+
          '<span><small>Pickup location</small><strong>'+escapeHtml(seller.seller_location||'Not supplied')+'</strong></span>'+
        '</div>'+
        '<div class="admin-order-timeline">'+stages.map(([label,date])=>'<span class="'+(date?'done':'')+'"><i></i><b>'+escapeHtml(label)+'</b><small>'+escapeHtml(date?formatDate(date,true):'Pending')+'</small></span>').join('')+'</div>'+
      '</article>';
    }).join(''):'<div class="loading-card">No Seller fulfilment records found.</div>';

    const activeRiders=state.riders.filter((r)=>r.status==='active');
    const assignmentLocked=delivery&&['picked_up','arrived_sorting_center','sorting_received','ready_for_dispatch','on_the_way','delivered'].includes(delivery.status);
    const canAssignRider=adminHas('delivery.manage')||adminHas('orders.manage');
    const canManageSorting=adminHas('delivery.manage')||adminHas('orders.manage');
    const sortingActionHtml=!delivery||!canManageSorting
      ? ''
      : ['picked_up','arrived_sorting_center'].includes(delivery.status)
        ? '<div class="admin-sorting-actions"><button type="button" data-sorting-status="sorting_received">Confirm Received at Sorting Center</button><small>Use this when the order is physically handed in at LEOGO Sorting Center.</small></div>'
        : delivery.status==='sorting_received'
          ? '<div class="admin-sorting-actions"><button type="button" data-sorting-status="ready_for_dispatch">Mark Ready for Dispatch</button><small>After this, the assigned Rider can continue final delivery from the Sorting Center.</small></div>'
          : delivery.status==='ready_for_dispatch'
            ? '<div class="admin-sorting-ready"><strong>✓ Ready for dispatch</strong><span>The assigned Rider can now start final delivery from LEOGO Sorting Center.</span></div>'
            : '';
    const riderOptions='<option value="">Choose active LEOGO rider…</option>'+activeRiders.map((r)=>
      '<option value="'+escapeHtml(r.user_id)+'" '+(delivery?.rider_id===r.user_id?'selected':'')+'>'+
        escapeHtml(r.display_name)+(r.vehicle_registration?' · '+escapeHtml(r.vehicle_registration):'')+
      '</option>'
    ).join('');

    const deliveryTimeline=[
      ['Assigned',delivery?.assigned_at],
      ['Picked Up from Seller',delivery?.picked_up_at],
      ['Arrived Sorting Center',delivery?.arrived_sorting_center_at],
      ['Received at Sorting Center',delivery?.sorting_received_at],
      ['Ready for Dispatch',delivery?.ready_for_dispatch_at],
      ['On the Way',delivery?.on_the_way_at],
      ['Delivered',delivery?.delivered_at]
    ];

    $('#adminOrderDeliveryDetail').innerHTML=
      '<div class="admin-order-delivery-summary">'+
        '<span><small>Seller readiness</small><strong>'+escapeHtml(readiness.label)+'</strong></span>'+
        '<span><small>Delivery status</small><strong>'+escapeHtml(deliveryStatusLabel(delivery?.status||'awaiting_assignment'))+'</strong></span>'+
        '<span><small>Current rider</small><strong>'+escapeHtml(delivery?.rider_name||'Not assigned')+'</strong></span>'+
        '<span><small>Rider phone</small><strong>'+escapeHtml(delivery?.rider_phone||'—')+'</strong></span>'+
      '</div>'+
      '<div class="admin-order-timeline admin-order-delivery-timeline">'+deliveryTimeline.map(([label,date])=>'<span class="'+(date?'done':'')+'"><i></i><b>'+escapeHtml(label)+'</b><small>'+escapeHtml(date?formatDate(date,true):'Pending')+'</small></span>').join('')+'</div>'+
      sortingActionHtml+
      (codNeedsCollection
        ? '<div class="admin-order-cod-warning"><strong>💵 COD — payment must be collected before customer handover</strong><span>'+escapeHtml(codInstruction)+'</span></div>'
        : '')+
      '<div class="admin-order-delivery-notes">'+
        '<label><span>Rider instructions / delivery notes</span><textarea id="adminRiderInstructions" maxlength="2000" rows="3" placeholder="Add pickup, customer, payment or handling instructions for the Rider…">'+escapeHtml(delivery?.admin_notes||'')+'</textarea></label>'+
        '<div class="admin-order-delivery-note-actions">'+
          (codNeedsCollection?'<button type="button" class="secondary" id="useCodRiderInstruction">Use COD Instruction</button>':'')+
          '<button type="button" id="saveAdminRiderInstructions">Save Instructions</button>'+
        '</div>'+
        '<div class="admin-order-rider-note-readback"><small>Rider notes / delivery update</small><p>'+escapeHtml(delivery?.rider_notes||'No Rider notes added yet.')+'</p></div>'+
      '</div>'+
      (!canAssignRider
        ? '<div class="admin-order-assignment-locked">Your staff role can view delivery status but cannot assign or reassign Riders.</div>'
        : assignmentLocked
          ? '<div class="admin-order-assignment-locked">Rider assignment is locked because delivery has already started.</div>'
          : activeRiders.length
            ? '<div class="admin-order-rider-assign"><select id="adminOrderRiderSelect">'+riderOptions+'</select><button type="button" id="assignRiderFromOrder">'+(delivery?.rider_id?'Reassign Rider':'Assign Rider')+'</button></div><div id="adminOrderDeliveryStatus" class="form-status" aria-live="polite"></div>'
            : '<div class="admin-order-no-rider"><strong>No active LEOGO rider account exists yet.</strong><p>Create a Rider from Staff Management and the Rider will become selectable here automatically.</p><button type="button" disabled>Assign Rider</button></div>'
      );

    $$('[data-detail-payment]').forEach((button)=>button.addEventListener('click',()=>{
      verifyMarketplaceOrderPayment(button,order.id,button.dataset.detailPayment==='paid');
    }));


  };

  const updateActiveOrderSortingStatus = async (button,status) => {
    const order=state.activeMarketplaceOrderDetail?.order;
    if(!order?.id){
      showOrderDeliveryStatus('The open order could not be identified. Refresh and try again.','error');
      return;
    }

    const label=status==='sorting_received'
      ?'confirm this order has been received at the LEOGO Sorting Center'
      :'mark this order ready for dispatch from the LEOGO Sorting Center';
    if(!window.confirm('Confirm you want to '+label+'?')) return;

    await withButtonLock(button,status==='sorting_received'?'Confirming…':'Updating…',async()=>{
      showOrderDeliveryStatus(status==='sorting_received'
        ?'Confirming Sorting Center receipt…'
        :'Marking order ready for dispatch…');
      try{
        const {data,error}=await db.rpc('admin_update_sorting_center_status',{
          p_order_id:order.id,
          p_status:status
        });
        if(error) throw error;
        if(data?.error) throw new Error(data.error);

        showOrderDeliveryStatus(status==='sorting_received'
          ?'Order received at LEOGO Sorting Center.'
          :'Order is ready for dispatch. The assigned Rider can continue delivery.','success');
        await Promise.all([loadDeliveryOps(),loadMarketplaceOrders({refreshActiveDetail:false}),loadAuditLog()]);
        await loadMarketplaceOrderDetail(order.id,{scroll:false});
      }catch(error){
        showOrderDeliveryStatus(friendlyError(error),'error');
      }
    });
  };

  const saveActiveOrderRiderInstructions = async (button) => {
    const order=state.activeMarketplaceOrderDetail?.order;
    const notes=$('#adminRiderInstructions')?.value||'';
    if(!order?.id){
      showOrderDeliveryStatus('The open order could not be identified. Refresh and try again.','error');
      return;
    }

    await withButtonLock(button,'Saving…',async()=>{
      showOrderDeliveryStatus('Saving Rider instructions…');
      try{
        const {data,error}=await db.rpc('admin_update_delivery_instructions',{
          p_order_id:order.id,
          p_admin_notes:notes
        });
        if(error) throw error;
        if(data?.error) throw new Error(data.error);
        showOrderDeliveryStatus('Rider instructions saved successfully.','success');
        await Promise.all([loadAuditLog(),loadMarketplaceOrders({refreshActiveDetail:false})]);
        await loadMarketplaceOrderDetail(order.id,{scroll:false});
      }catch(error){
        showOrderDeliveryStatus(friendlyError(error),'error');
      }
    });
  };

  const applyCodRiderInstruction = () => {
    const detail=state.activeMarketplaceOrderDetail;
    const order=detail?.order;
    const box=$('#adminRiderInstructions');
    if(!order||!box) return;
    const instruction='COD: Collect and confirm the full '+formatMoney(order.grand_total_kes)+' payment before handing over the order to the customer.';
    const current=box.value.trim();
    box.value=current
      ? (current.includes(instruction)?current:current+'\n'+instruction)
      : instruction;
    box.focus();
  };

  const showOrderDeliveryStatus = (message='',type='') => {
    setFormStatus($('#adminOrderDetailStatus'),message,type);
    setFormStatus($('#adminOrderDeliveryStatus'),message,type);
  };

  const assignActiveOrderRider = async (button) => {
    const detail=state.activeMarketplaceOrderDetail;
    const order=detail?.order;
    const riderId=$('#adminOrderRiderSelect')?.value;

    if(!order?.id){
      showOrderDeliveryStatus('The open order could not be identified. Refresh the order and try again.','error');
      return;
    }
    if(!riderId){
      showOrderDeliveryStatus('Choose an active LEOGO rider first.','error');
      return;
    }

    await withButtonLock(button,'Assigning…',async()=>{
      showOrderDeliveryStatus('Assigning rider…');
      try{
        const {data,error}=await db.rpc('admin_assign_rider_to_order',{
          p_order_id:order.id,
          p_rider_id:riderId
        });
        if(error) throw error;
        if(data?.error) throw new Error(data.error);

        showOrderDeliveryStatus('Rider assigned successfully. Customer, Seller and Rider were notified.','success');
        await Promise.all([loadDeliveryOps(),loadMarketplaceOrders({refreshActiveDetail:false}),loadAuditLog()]);
        await loadMarketplaceOrderDetail(order.id,{scroll:false});
      }catch(error){
        showOrderDeliveryStatus(friendlyError(error),'error');
      }
    });
  };

  const loadMarketplaceOrderDetail=async(orderId,{scroll=true}={})=>{
    const panel=$('#adminOrderDetailPanel');
    const loadToken=++state.orderDetailLoadToken;
    state.activeMarketplaceOrderId=orderId;
    state.activeMarketplaceOrderDetail=null;

    if(panel){
      panel.hidden=false;
      if($('#downloadOrderDeliverySummary')) $('#downloadOrderDeliverySummary').disabled=true;
      if($('#printOrderDeliverySummary')) $('#printOrderDeliverySummary').disabled=true;
      $('#adminOrderDetailTitle').textContent='Loading order…';
      $('#adminOrderDetailSubtitle').textContent='Retrieving customer, Seller, item, payment and delivery information.';
      $('#adminOrderCustomerDetail').textContent='Loading…';
      $('#adminOrderPaymentDetail').textContent='Loading…';
      $('#adminOrderItemList').innerHTML='<div class="loading-card">Loading items…</div>';
      $('#adminOrderSellerList').innerHTML='<div class="loading-card">Loading Seller fulfilment…</div>';
      $('#adminOrderDeliveryDetail').innerHTML='<div class="loading-card">Loading delivery state…</div>';
    }

    renderMarketplaceOrders();

    const [detailResult,riderResult,sortingResult]=await Promise.all([
      db.rpc('admin_get_marketplace_order_detail',{p_order_id:orderId}),
      db.rpc('admin_list_riders'),
      db.rpc('admin_get_delivery_sorting_state',{p_order_id:orderId})
    ]);
    if(loadToken!==state.orderDetailLoadToken || state.activeMarketplaceOrderId!==orderId) return;
    if(detailResult.error){
      state.activeMarketplaceOrderDetail=null;
      setFormStatus($('#adminOrderDetailStatus'),friendlyError(detailResult.error),'error');
      return;
    }
    if(!riderResult.error) state.riders=Array.isArray(riderResult.data)?riderResult.data:[];

    state.activeMarketplaceOrderDetail=detailResult.data;
    if(!sortingResult.error&&sortingResult.data&&state.activeMarketplaceOrderDetail?.delivery){
      state.activeMarketplaceOrderDetail.delivery={
        ...state.activeMarketplaceOrderDetail.delivery,
        ...sortingResult.data
      };
    }
    renderMarketplaceOrderDetail();

    if(scroll) panel?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const closeMarketplaceOrderDetail=()=>{
    state.orderDetailLoadToken++;
    state.activeMarketplaceOrderId=null;
    state.activeMarketplaceOrderDetail=null;
    if($('#adminOrderDetailPanel')) $('#adminOrderDetailPanel').hidden=true;
    if($('#downloadOrderDeliverySummary')) $('#downloadOrderDeliverySummary').disabled=true;
    if($('#printOrderDeliverySummary')) $('#printOrderDeliverySummary').disabled=true;
    renderMarketplaceOrders();
  };

  const catalogueMediaUrl = (path) => {
    if (!path) return '';
    return db.storage.from('seller-product-media').getPublicUrl(String(path)).data?.publicUrl || '';
  };

  const filteredCatalogueProducts = () => {
    const term = ($('#adminCatalogueSearch')?.value || '').trim().toLowerCase();
    const statusFilter = $('#adminCatalogueStatusFilter')?.value || 'all';
    const sellerFilter = $('#adminCatalogueSellerFilter')?.value || 'all';
    const categoryFilter = $('#adminCatalogueCategoryFilter')?.value || 'all';

    return state.catalogueProducts.filter((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const searchable = [
        product.product_name, product.seller_name, product.seller_owner,
        product.category_name, product.subcategory_name, product.product_details,
        ...variants.map((variant) => variant.variant_name)
      ].map((value) => String(value || '').toLowerCase());

      return (!term || searchable.some((value) => value.includes(term)))
        && (statusFilter === 'all' || product.listing_status === statusFilter)
        && (sellerFilter === 'all' || product.seller_id === sellerFilter)
        && (categoryFilter === 'all' || product.category_id === categoryFilter);
    });
  };

  const renderCatalogueCategories = () => {
    const box = $('#adminCatalogueCategoryList');
    if (!box) return;

    box.innerHTML = state.catalogueCategories.length
      ? state.catalogueCategories.map((category) => {
          const subs = Array.isArray(category.subcategories) ? category.subcategories : [];
          return `<article class="admin-category-card">
            <header>
              <div><strong>${escapeHtml(category.name)}</strong><small>${Number(category.product_count || 0)} product(s) · ${Number(category.active_product_count || 0)} active</small></div>
              <span class="status-chip">${category.is_aggregator ? 'Aggregator' : category.is_assignable ? 'Seller category' : 'System category'}</span>
            </header>
            <div class="admin-category-subs">${subs.length
              ? subs.map((sub) => `<span><b>${escapeHtml(sub.name)}</b><small>${Number(sub.product_count || 0)} product(s)</small></span>`).join('')
              : '<span><b>No sub-categories</b></span>'}</div>
          </article>`;
        }).join('')
      : '<div class="loading-card">No categories configured.</div>';
  };

  const renderCatalogueProducts = () => {
    const products = filteredCatalogueProducts();
    const box = $('#adminCatalogueProductList');
    if (!box) return;

    $('#adminCatalogueTotal').textContent = state.catalogueProducts.length;
    $('#adminCatalogueActive').textContent = state.catalogueProducts.filter((p) => p.listing_status === 'active').length;
    $('#adminCatalogueVariants').textContent = state.catalogueProducts.filter((p) => p.has_variants).length;
    $('#adminCatalogueCategories').textContent = state.catalogueCategories.filter((c) => c.is_active).length;

    const sellers = [...new Map(state.catalogueProducts.map((p) => [p.seller_id, p.seller_name])).entries()]
      .sort((a,b) => String(a[1] || '').localeCompare(String(b[1] || '')));
    const sellerSelect = $('#adminCatalogueSellerFilter');
    if (sellerSelect) {
      const current = sellerSelect.value || 'all';
      sellerSelect.innerHTML = '<option value="all">All Sellers</option>' + sellers
        .map(([id,name]) => '<option value="'+escapeHtml(id)+'">'+escapeHtml(name || 'Seller')+'</option>').join('');
      sellerSelect.value = sellers.some(([id]) => id === current) ? current : 'all';
    }

    const categorySelect = $('#adminCatalogueCategoryFilter');
    if (categorySelect) {
      const current = categorySelect.value || 'all';
      categorySelect.innerHTML = '<option value="all">All Categories</option>' + state.catalogueCategories
        .filter((c) => c.is_active && !c.is_aggregator)
        .map((c) => '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
      categorySelect.value = state.catalogueCategories.some((c) => c.id === current) ? current : 'all';
    }

    if (!products.length) {
      box.innerHTML = '<div class="loading-card">No Seller products match the current filters.</div>';
      return;
    }

    box.innerHTML = products.map((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const mainUrl = catalogueMediaUrl(product.main_image_path);
      const variantHtml = product.has_variants
        ? '<div class="admin-product-variants">' + (
            variants.length
              ? variants.map((variant) => {
                  const imageUrl = catalogueMediaUrl(variant.image_path);
                  return '<div class="admin-product-variant">' +
                    (imageUrl ? '<img src="'+escapeHtml(imageUrl)+'" alt="">' : '<span class="admin-media-placeholder">📷</span>') +
                    '<div><b>'+escapeHtml(variant.variant_name)+'</b><small>'+formatMoney(variant.price_kes)+' · Qty '+Number(variant.quantity_available || 0)+'</small></div>' +
                  '</div>';
                }).join('')
              : '<div class="admin-product-warning">Variant-enabled product has no saved variant rows.</div>'
          ) + '</div>'
        : '';

      const nextAction = product.listing_status === 'suspended'
        ? '<button type="button" data-admin-product-status="active" data-admin-product-id="'+escapeHtml(product.id)+'">Reactivate</button>'
        : '<button type="button" class="danger" data-admin-product-status="suspended" data-admin-product-id="'+escapeHtml(product.id)+'">Suspend Listing</button>';

      return `<article class="admin-catalogue-product-card">
        <div class="admin-catalogue-product-image">${mainUrl
          ? '<img src="'+escapeHtml(mainUrl)+'" alt="'+escapeHtml(product.product_name)+'">'
          : '<span>📦</span>'}</div>
        <div class="admin-catalogue-product-main">
          <div class="admin-catalogue-product-title">
            <div>
              <span>${escapeHtml(product.category_name || 'Uncategorised')}${product.subcategory_name ? ' · '+escapeHtml(product.subcategory_name) : ''}</span>
              <h3>${escapeHtml(product.product_name)}</h3>
              <p>Seller: <strong>${escapeHtml(product.seller_name || 'Unknown Seller')}</strong> · ${escapeHtml(product.seller_email || '')}</p>
            </div>
            <div class="admin-catalogue-badges">
              <span class="status-chip">Approval: ${escapeHtml(product.product_approval_status || 'pending')}</span>
              <span class="status-chip">${escapeHtml(product.listing_status)}</span>
              <span class="status-chip">${escapeHtml(product.availability_status)}</span>
              ${product.has_variants ? '<span class="status-chip">'+variants.length+' variants</span>' : ''}
            </div>
          </div>
          <div class="admin-product-facts">
            <span><small>Price</small><strong>${formatMoney(product.price_kes)}</strong></span>
            <span><small>Stock</small><strong>${Number(product.quantity_available || 0)} ${escapeHtml(product.measurement_unit || '')}</strong></span>
            <span><small>Updated</small><strong>${formatDate(product.updated_at, true)}</strong></span>
            <span><small>Seller status</small><strong>${escapeHtml(product.seller_status || '—')}</strong></span>
          </div>
          <p class="admin-product-description">${escapeHtml(product.product_details || '')}</p>
          ${variantHtml}
          <div class="admin-catalogue-actions">
            <button type="button" data-seller-record="${escapeHtml(product.seller_id)}">View Seller</button>
            ${nextAction}
          </div>
        </div>
      </article>`;
    }).join('');

    $$('[data-admin-product-status]', box).forEach((button) => button.addEventListener('click', async () => {
      const status = button.dataset.adminProductStatus;
      const product = state.catalogueProducts.find((item) => item.id === button.dataset.adminProductId);
      if (!product) return;

      const prompt = status === 'suspended'
        ? 'Suspend "'+product.product_name+'" from the marketplace? The Seller will be notified.'
        : 'Reactivate "'+product.product_name+'" as an active listing?';
      if (!window.confirm(prompt)) return;

      await withButtonLock(button, status === 'suspended' ? 'Suspending…' : 'Activating…', async () => {
        const { error } = await db.rpc('admin_set_seller_product_listing_status', {
          p_product_id: product.id,
          p_status: status
        });
        if (error) {
          globalStatus(friendlyError(error), 'error');
          return;
        }
        await Promise.all([loadCatalogue(), loadSellers(), loadAuditLog()]);
        globalStatus(status === 'suspended' ? 'Product listing suspended. Seller notified.' : 'Product listing reactivated. Seller notified.');
      });
    }));

    $$('[data-seller-record]', box).forEach((button) => button.addEventListener('click', () => openSellerRecord(button.dataset.sellerRecord)));
  };

  const personalSaleMediaUrl = (path) => {
    if (!path) return '';
    return db.storage.from('customer-sale-media').getPublicUrl(String(path)).data?.publicUrl || '';
  };

  const renderPersonalMarketplaceAdmin = () => {
    const listingBox = $('#adminPersonalSaleList');
    const interestBox = $('#adminPersonalInterestList');
    if (!listingBox || !interestBox) return;

    const listings = state.personalSales;
    const interests = state.personalSaleInterests;
    $('#adminPersonalSaleTotal').textContent = listings.length;
    $('#adminPersonalSaleAvailable').textContent = listings.filter((item) => item.approval_status === 'approved' && item.sale_status === 'available').length;
    $('#adminPersonalSaleClosed').textContent = listings.filter((item) => ['sold','removed'].includes(item.sale_status)).length;
    $('#adminPersonalInterestOpen').textContent = interests.filter((item) => ['new','contacted'].includes(item.status)).length;

    listingBox.innerHTML = listings.length ? listings.map((item) => {
      const imageUrl = personalSaleMediaUrl(item.item_image_path);
      const approved = item.approval_status === 'approved';
      const canManage = approved;
      const statusActions = !canManage
        ? '<span class="status-chip">Awaiting / historical approval</span>'
        : item.sale_status === 'available'
          ? '<button type="button" class="danger" data-personal-sale-status="sold" data-personal-sale-id="'+escapeHtml(item.id)+'">Mark Sold</button><button type="button" class="danger" data-personal-sale-status="removed" data-personal-sale-id="'+escapeHtml(item.id)+'">Remove Listing</button>'
          : '<button type="button" data-personal-sale-status="available" data-personal-sale-id="'+escapeHtml(item.id)+'">Restore as Available</button>';

      return `<article class="admin-personal-sale-card">
        <div class="admin-personal-sale-image">${imageUrl ? '<img src="'+escapeHtml(imageUrl)+'" alt="">' : '<span>🏷️</span>'}</div>
        <div class="admin-personal-sale-main">
          <div class="admin-personal-sale-title">
            <div><span>PERSONAL ITEM</span><h4>${escapeHtml(item.item_name)}</h4><p>${escapeHtml(item.seller_name)} · ${escapeHtml(item.seller_email || '')}</p></div>
            <div class="admin-catalogue-badges">
              <span class="status-chip">Approval: ${escapeHtml(item.approval_status)}</span>
              <span class="status-chip">Sale: ${escapeHtml(item.sale_status)}</span>
            </div>
          </div>
          <div class="admin-product-facts">
            <span><small>Marked price</small><strong>${formatMoney(item.marked_price_kes)}</strong></span>
            <span><small>Owner phone</small><strong>${escapeHtml(item.phone || '—')}</strong></span>
            <span><small>Location</small><strong>${escapeHtml(item.location || '—')}</strong></span>
            <span><small>Buyer interest</small><strong>${Number(item.open_interest_count || 0)} open / ${Number(item.interest_count || 0)} total</strong></span>
          </div>
          <div class="admin-catalogue-actions">${statusActions}</div>
        </div>
      </article>`;
    }).join('') : '<div class="loading-card">No personal item listings have been submitted yet.</div>';

    interestBox.innerHTML = interests.length ? interests.map((item) => {
      const open = ['new','contacted'].includes(item.status);
      return `<article class="admin-personal-interest-card">
        <div class="admin-personal-interest-headline">
          <div><span>${escapeHtml(item.status)}</span><h4>${escapeHtml(item.buyer_name)} is interested in ${escapeHtml(item.item_name)}</h4><p>${formatMoney(item.marked_price_kes)} · ${formatDate(item.created_at,true)}</p></div>
        </div>
        <div class="admin-contact-grid">
          <div><small>BUYER — ADMIN ONLY</small><strong>${escapeHtml(item.buyer_name)}</strong><span>${escapeHtml(item.buyer_phone || '—')}</span><span>${escapeHtml(item.buyer_email || '—')}</span></div>
          <div><small>ITEM OWNER — ADMIN ONLY</small><strong>${escapeHtml(item.seller_name)}</strong><span>${escapeHtml(item.seller_phone || '—')}</span><span>${escapeHtml(item.seller_email || '—')}</span></div>
        </div>
        ${item.message ? '<div class="admin-interest-message"><small>BUYER MESSAGE</small><p>'+escapeHtml(item.message)+'</p></div>' : ''}
        <div class="admin-catalogue-actions">
          ${item.status === 'new' ? '<button type="button" data-personal-interest-status="contacted" data-personal-interest-id="'+escapeHtml(item.id)+'">Mark Contacted</button>' : ''}
          ${open ? '<button type="button" data-personal-interest-status="closed" data-personal-interest-id="'+escapeHtml(item.id)+'">Close Request</button>' : '<span class="status-chip">Closed</span>'}
        </div>
      </article>`;
    }).join('') : '<div class="loading-card">No customer interest requests yet.</div>';

    Array.from(listingBox.querySelectorAll('[data-personal-sale-status]')).forEach((button)=>button.addEventListener('click',async()=>{
      const status=button.dataset.personalSaleStatus;
      const listing=state.personalSales.find((item)=>item.id===button.dataset.personalSaleId);
      if(!listing) return;
      const prompt=status==='sold'
        ? 'Mark "'+listing.item_name+'" as SOLD? It will disappear from the public marketplace.'
        : status==='removed'
          ? 'Remove "'+listing.item_name+'" from the public marketplace?'
          : 'Restore "'+listing.item_name+'" as available?';
      if(!window.confirm(prompt)) return;
      await withButtonLock(button,status==='available'?'Restoring…':'Updating…',async()=>{
        const {error}=await db.rpc('admin_set_personal_sale_status',{
          p_listing_id:listing.id,p_status:status,p_notes:null
        });
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadPersonalMarketplace(),loadAuditLog()]);
        globalStatus(status==='sold'?'Personal item marked sold.':status==='removed'?'Personal item removed from public marketplace.':'Personal item restored as available.');
      });
    }));

    Array.from(interestBox.querySelectorAll('[data-personal-interest-status]')).forEach((button)=>button.addEventListener('click',async()=>{
      const status=button.dataset.personalInterestStatus;
      await withButtonLock(button,status==='contacted'?'Updating…':'Closing…',async()=>{
        const {error}=await db.rpc('admin_update_personal_sale_interest',{
          p_interest_id:button.dataset.personalInterestId,p_status:status,p_notes:null
        });
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadPersonalMarketplace(),loadAuditLog()]);
        globalStatus(status==='contacted'?'Interest request marked contacted. Both customers were notified.':'Interest request closed.');
      });
    }));
  };

  const loadPersonalMarketplace = async () => {
    const listingBox=$('#adminPersonalSaleList');
    const interestBox=$('#adminPersonalInterestList');
    try{
      const [listingResult,interestResult]=await Promise.all([
        db.rpc('admin_list_personal_marketplace'),
        db.rpc('admin_list_personal_sale_interests')
      ]);
      if(listingResult.error) throw listingResult.error;
      if(interestResult.error) throw interestResult.error;
      state.personalSales=Array.isArray(listingResult.data)?listingResult.data:[];
      state.personalSaleInterests=Array.isArray(interestResult.data)?interestResult.data:[];
      renderPersonalMarketplaceAdmin();
    }catch(error){
      console.error('Personal marketplace admin load failed:',error);
      if(listingBox) listingBox.innerHTML='<div class="loading-card admin-load-error">Personal listings could not load: '+escapeHtml(friendlyError(error))+'</div>';
      if(interestBox) interestBox.innerHTML='<div class="loading-card admin-load-error">Interest requests could not load.</div>';
      throw error;
    }
  };

  $('#refreshPersonalMarketplace')?.addEventListener('click',()=>withButtonLock($('#refreshPersonalMarketplace'),'Refreshing…',loadPersonalMarketplace));

  const adminReviewStars=(rating)=>{
    const value=Math.max(0,Math.min(5,Number(rating||0)));
    return '★'.repeat(value)+'☆'.repeat(5-value);
  };

  const renderProductReviews=()=>{
    const box=$('#adminProductReviewList');
    if(!box) return;
    const filter=$('#adminProductReviewStatusFilter')?.value||'submitted';
    const rows=state.productReviews.filter((review)=>filter==='all'||review.moderation_status===filter);
    const pending=state.productReviews.filter((review)=>review.moderation_status==='submitted').length;
    if($('#adminProductReviewPending')) $('#adminProductReviewPending').textContent=pending;

    if(!rows.length){
      box.innerHTML='<div class="loading-card">No product reviews match this filter.</div>';
      return;
    }

    box.innerHTML=rows.map((review)=>{
      const approved=review.moderation_status==='approved';
      const rejected=review.moderation_status==='rejected';
      return '<article class="admin-product-review-card" data-product-review-card="'+escapeHtml(review.review_id)+'">'+
        '<header><div><span>VERIFIED PURCHASE REVIEW</span><h4>'+escapeHtml(review.product_name)+(review.variant_name?' · '+escapeHtml(review.variant_name):'')+'</h4>'+
        '<p>Order <strong>'+escapeHtml(review.order_reference)+'</strong> · Seller <strong>'+escapeHtml(review.seller_name)+'</strong></p></div>'+
        '<div class="admin-product-review-rating"><strong>'+adminReviewStars(review.rating)+'</strong><span>'+Number(review.rating)+'/5</span></div></header>'+
        '<div class="admin-product-review-meta">'+
          '<span><small>Customer</small><strong>'+escapeHtml(review.customer_name||'Customer')+'</strong></span>'+
          '<span><small>Submitted</small><strong>'+formatDate(review.created_at,true)+'</strong></span>'+
          '<span><small>Status</small><strong>'+escapeHtml(String(review.moderation_status||'submitted').replaceAll('_',' '))+'</strong></span>'+
        '</div>'+
        '<div class="admin-product-review-comment"><small>CUSTOMER REVIEW</small><p>'+escapeHtml(review.comment||'Rating only — no written comment.')+'</p></div>'+
        '<label class="admin-product-review-note"><span>Admin moderation note</span><textarea data-product-review-note maxlength="1500" rows="2" placeholder="Required when rejecting; optional when approving…">'+escapeHtml(review.admin_notes||'')+'</textarea></label>'+
        '<div class="admin-product-review-actions">'+
          (approved?'<span class="admin-product-review-approved">✓ Approved & public</span>':'<button type="button" data-product-review-action="approved" data-review-id="'+escapeHtml(review.review_id)+'">Approve Review</button>')+
          (rejected?'<span class="admin-product-review-rejected">Rejected</span>':'<button type="button" class="danger" data-product-review-action="rejected" data-review-id="'+escapeHtml(review.review_id)+'">Reject</button>')+
        '</div>'+
      '</article>';
    }).join('');
  };

  const renderOrderReviews=()=>{ 
    const box=$('#adminOrderReviewList');
    if(!box) return;
    const filter=$('#adminOrderReviewStatusFilter')?.value||'submitted';
    const rows=state.orderReviews.filter((review)=>filter==='all'||review.moderation_status===filter);

    if(!rows.length){
      box.innerHTML='<div class="loading-card">No overall order reviews match this filter.</div>';
      return;
    }

    box.innerHTML=rows.map((review)=>{
      const approved=review.moderation_status==='approved';
      const rejected=review.moderation_status==='rejected';
      return '<article class="admin-product-review-card" data-order-review-card="'+escapeHtml(review.review_id)+'">'+
        '<header><div><span>VERIFIED DELIVERED ORDER REVIEW</span><h4>'+escapeHtml(review.order_reference)+'</h4>'+
        '<p>'+Number(review.item_count||0)+' item(s) · '+Number(review.seller_count||0)+' Seller(s)</p></div>'+
        '<div class="admin-product-review-rating"><strong>'+adminReviewStars(review.rating)+'</strong><span>'+Number(review.rating)+'/5</span></div></header>'+
        '<div class="admin-product-review-meta">'+
          '<span><small>Customer</small><strong>'+escapeHtml(review.customer_name||'Customer')+'</strong></span>'+
          '<span><small>Email</small><strong>'+escapeHtml(review.customer_email||'—')+'</strong></span>'+
          '<span><small>Submitted</small><strong>'+formatDate(review.created_at,true)+'</strong></span>'+
          '<span><small>Status</small><strong>'+escapeHtml(String(review.moderation_status||'submitted').replaceAll('_',' '))+'</strong></span>'+
        '</div>'+
        '<div class="admin-product-review-comment"><small>OVERALL ORDER REVIEW</small><p>'+escapeHtml(review.comment||'Rating only — no written comment.')+'</p></div>'+
        '<label class="admin-product-review-note"><span>Admin moderation note</span><textarea data-order-review-note maxlength="1500" rows="2" placeholder="Required when rejecting; optional when approving…">'+escapeHtml(review.admin_notes||'')+'</textarea></label>'+
        '<div class="admin-product-review-actions">'+
          (approved?'<span class="admin-product-review-approved">✓ Approved</span>':'<button type="button" data-order-review-action="approved" data-review-id="'+escapeHtml(review.review_id)+'">Approve Review</button>')+
          (rejected?'<span class="admin-product-review-rejected">Rejected</span>':'<button type="button" class="danger" data-order-review-action="rejected" data-review-id="'+escapeHtml(review.review_id)+'">Reject</button>')+
        '</div>'+
      '</article>';
    }).join('');
  };

  const moderateOrderReview=async(button)=>{
    const reviewId=button.dataset.reviewId;
    const action=button.dataset.orderReviewAction;
    const card=button.closest('[data-order-review-card]');
    const notes=card?.querySelector('[data-order-review-note]')?.value.trim()||'';

    if(action==='rejected'&&!notes){
      globalStatus('Add an Admin note explaining why this order review is rejected.','error');
      card?.querySelector('[data-order-review-note]')?.focus();
      return;
    }

    const confirmation=action==='approved'
      ? 'Approve this overall order review?'
      : 'Reject this order review? The customer will be notified.';
    if(!window.confirm(confirmation)) return;

    await withButtonLock(button,action==='approved'?'Approving…':'Rejecting…',async()=>{
      const {data,error}=await db.rpc('admin_moderate_order_review',{
        p_review_id:reviewId,
        p_action:action,
        p_admin_notes:notes||null
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);

      await Promise.all([loadCatalogue(),loadAuditLog()]);
      globalStatus(action==='approved'
        ? 'Order review approved.'
        : 'Order review rejected. Customer notified.');
    });
  };

  const moderateProductReview=async(button)=>{
    const reviewId=button.dataset.reviewId;
    const action=button.dataset.productReviewAction;
    const card=button.closest('[data-product-review-card]');
    const notes=card?.querySelector('[data-product-review-note]')?.value.trim()||'';

    if(action==='rejected'&&!notes){
      globalStatus('Add an Admin note explaining why this product review is rejected.','error');
      card?.querySelector('[data-product-review-note]')?.focus();
      return;
    }

    const confirmation=action==='approved'
      ? 'Approve this verified product review and publish it on the customer website?'
      : 'Reject this review? It will remain private and the customer will be notified.';
    if(!window.confirm(confirmation)) return;

    await withButtonLock(button,action==='approved'?'Approving…':'Rejecting…',async()=>{
      const {data,error}=await db.rpc('admin_moderate_product_review',{
        p_review_id:reviewId,
        p_action:action,
        p_admin_notes:notes||null
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);

      await Promise.all([loadCatalogue(),loadAuditLog()]);
      globalStatus(action==='approved'
        ? 'Product review approved and published.'
        : 'Product review rejected. Customer notified.');
    });
  };

  const loadCatalogue = async () => {
    const productBox = $('#adminCatalogueProductList');
    const categoryBox = $('#adminCatalogueCategoryList');

    try {
      if (productBox && !state.catalogueProducts.length) {
        productBox.innerHTML = '<div class="loading-card">Loading Seller products…</div>';
      }
      if (categoryBox && !state.catalogueCategories.length) {
        categoryBox.innerHTML = '<div class="loading-card">Loading categories…</div>';
      }

      const [productsResult,categoriesResult,reviewsResult,orderReviewsResult] = await Promise.all([
        db.rpc('admin_list_catalogue_products'),
        db.rpc('admin_list_catalogue_categories'),
        db.rpc('admin_list_product_reviews'),
        db.rpc('admin_list_order_reviews')
      ]);

      if (productsResult.error) throw productsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (reviewsResult.error) throw reviewsResult.error;
      if (orderReviewsResult.error) throw orderReviewsResult.error;

      state.catalogueProducts = Array.isArray(productsResult.data) ? productsResult.data : [];
      state.catalogueCategories = Array.isArray(categoriesResult.data) ? categoriesResult.data : [];
      state.productReviews = Array.isArray(reviewsResult.data) ? reviewsResult.data : [];
      state.orderReviews = Array.isArray(orderReviewsResult.data) ? orderReviewsResult.data : [];

      renderCatalogueProducts();
      renderCatalogueCategories();
      renderProductReviews();
      renderOrderReviews();
      return state.catalogueProducts;
    } catch (error) {
      console.error('Admin catalogue load failed:', error);
      if (productBox) {
        productBox.innerHTML =
          '<div class="loading-card admin-load-error"><strong>Seller products could not load.</strong><small>'+
          escapeHtml(friendlyError(error))+
          '</small><button type="button" id="retryAdminCatalogue">Retry Catalogue</button></div>';
        $('#retryAdminCatalogue')?.addEventListener('click', () => loadCatalogue());
      }
      if (categoryBox) {
        categoryBox.innerHTML = '<div class="loading-card">Categories could not load. Use Refresh Catalogue.</div>';
      }
      throw error;
    }
  };

  $('#refreshAdminCatalogue')?.addEventListener('click', () =>
    withButtonLock($('#refreshAdminCatalogue'), 'Refreshing…', loadCatalogue)
  );
  $('#refreshProductReviews')?.addEventListener('click', () =>
    withButtonLock($('#refreshProductReviews'), 'Refreshing…', loadCatalogue)
  );
  $('#refreshOrderReviews')?.addEventListener('click', () =>
    withButtonLock($('#refreshOrderReviews'), 'Refreshing…', loadCatalogue)
  );
  $('#adminProductReviewStatusFilter')?.addEventListener('change', renderProductReviews);
  $('#adminOrderReviewStatusFilter')?.addEventListener('change', renderOrderReviews);
  $('#adminProductReviewList')?.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-product-review-action]');
    if(button) moderateProductReview(button);
  });
  $('#adminOrderReviewList')?.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-order-review-action]');
    if(button) moderateOrderReview(button);
  });
  $('#adminCatalogueSearch')?.addEventListener('input', renderCatalogueProducts);
  $('#adminCatalogueStatusFilter')?.addEventListener('change', renderCatalogueProducts);
  $('#adminCatalogueSellerFilter')?.addEventListener('change', renderCatalogueProducts);
  $('#adminCatalogueCategoryFilter')?.addEventListener('change', renderCatalogueProducts);

  let supportChatPollTimer=null;

  const supportChatStatusLabel=(status)=>({
    waiting:'Waiting for assignment',
    open:'Open',
    closed:'Closed'
  }[status]||String(status||'').replaceAll('_',' '));

  const filteredSupportChats=()=>{
    const term=($('#supportChatSearch')?.value||'').trim().toLowerCase();
    const filter=$('#supportChatFilter')?.value||'active';
    const uid=state.user?.id||'';
    return state.supportThreads.filter((thread)=>{
      const haystack=[thread.customer_name,thread.customer_phone,thread.last_message_preview,thread.assigned_staff_name]
        .map((value)=>String(value||'').toLowerCase());
      if(term&&!haystack.some((value)=>value.includes(term))) return false;
      if(filter==='mine') return thread.assigned_staff_id===uid && thread.status!=='closed';
      if(filter==='waiting') return !thread.assigned_staff_id && thread.status!=='closed';
      if(filter==='closed') return thread.status==='closed';
      if(filter==='active') return thread.status!=='closed';
      return true;
    });
  };

  const renderSupportChatThreads=()=>{
    const list=$('#supportChatThreadList');
    if(!list) return;
    const uid=state.user?.id||'';
    const waiting=state.supportThreads.filter((thread)=>!thread.assigned_staff_id&&thread.status!=='closed').length;
    const mine=state.supportThreads.filter((thread)=>thread.assigned_staff_id===uid&&thread.status!=='closed').length;
    const unread=state.supportThreads.reduce((sum,thread)=>sum+Number(thread.unread_count||0),0);
    const attention=state.supportThreads.filter((thread)=>!thread.assigned_staff_id||Number(thread.unread_count||0)>0).length;

    if($('#supportChatWaitingCount')) $('#supportChatWaitingCount').textContent=waiting;
    if($('#supportChatMineCount')) $('#supportChatMineCount').textContent=mine;
    if($('#supportChatUnreadCount')) $('#supportChatUnreadCount').textContent=unread;
    if($('#sidebarChatCount')) $('#sidebarChatCount').textContent=attention;

    const rows=filteredSupportChats();
    list.innerHTML=rows.length?rows.map((thread)=>{
      const active=state.activeSupportThreadId===thread.thread_id;
      const mineThread=thread.assigned_staff_id===uid;
      const badge=Number(thread.unread_count||0)>0
        ? '<b class="support-chat-unread">'+Number(thread.unread_count||0)+'</b>'
        : '';
      return '<button type="button" class="support-chat-thread'+(active?' active':'')+'" data-support-thread="'+escapeHtml(thread.thread_id)+'">'+
        '<div class="support-chat-thread-top"><strong>'+escapeHtml(thread.customer_name||'Customer')+'</strong>'+badge+'</div>'+
        '<span>'+escapeHtml(thread.last_message_preview||'No messages yet')+'</span>'+
        '<footer><small>'+escapeHtml(thread.assigned_staff_name?('Assigned: '+thread.assigned_staff_name):(thread.status==='closed'?'Closed':'Waiting for assignment'))+'</small>'+
          '<time>'+escapeHtml(formatDate(thread.last_message_at||thread.created_at,true))+'</time></footer>'+
        (mineThread?'<i>MY CHAT</i>':'')+
      '</button>';
    }).join(''):'<div class="loading-card">No Customer Care chats match this filter.</div>';
  };

  const renderSupportChatConversation=()=>{
    const empty=$('#supportChatEmpty');
    const active=$('#supportChatActive');
    const thread=state.supportThreads.find((item)=>item.thread_id===state.activeSupportThreadId);
    if(!thread){
      if(empty) empty.hidden=false;
      if(active) active.hidden=true;
      return;
    }
    if(empty) empty.hidden=true;
    if(active) active.hidden=false;

    const uid=state.user?.id||'';
    const mine=thread.assigned_staff_id===uid;
    const elevated=['super_admin','admin'].includes(state.admin?.role||'');
    $('#supportChatCustomerName').textContent=thread.customer_name||'Customer';
    $('#supportChatCustomerMeta').textContent=[thread.customer_phone||'',supportChatStatusLabel(thread.status)].filter(Boolean).join(' · ');
    $('#supportChatAssignment').textContent=thread.assigned_staff_name
      ? 'Assigned to '+thread.assigned_staff_name
      : 'Waiting for assignment';

    const claim=$('#claimSupportChat');
    if(claim){
      claim.hidden=mine||(thread.assigned_staff_id&&!elevated);
      claim.textContent=thread.assigned_staff_id?'Assign to Me':'Claim Chat';
    }
    const toggle=$('#toggleSupportChatStatus');
    if(toggle){
      toggle.disabled=!(mine||elevated);
      toggle.textContent=thread.status==='closed'?'Reopen Chat':'Close Chat';
    }
    const reply=$('#supportChatReply');
    const send=$('#sendSupportChatReply');
    if(reply) reply.disabled=!mine||thread.status==='closed';
    if(send) send.disabled=!mine||thread.status==='closed';

    const box=$('#supportChatMessages');
    if(box){
      box.innerHTML=state.supportMessages.length?state.supportMessages.map((message)=>{
        const staffMessage=message.sender_role==='staff';
        return '<article class="support-chat-message '+(staffMessage?'staff':'customer')+'">'+
          '<div><strong>'+(staffMessage?'LEOGO Customer Care':escapeHtml(thread.customer_name||'Customer'))+'</strong><span>'+escapeHtml(formatDate(message.created_at,true))+'</span></div>'+
          '<p>'+escapeHtml(message.body).replace(/\n/g,'<br>')+'</p>'+
        '</article>';
      }).join(''):'<div class="support-chat-empty-message">No messages in this conversation yet.</div>';
      window.setTimeout(()=>{box.scrollTop=box.scrollHeight;},20);
    }
  };

  const loadSupportThread=async(threadId,{silent=false}={})=>{
    if(!threadId) return;
    state.activeSupportThreadId=threadId;
    if(!silent) setFormStatus($('#supportChatStatus'),'Loading conversation…');
    const {data,error}=await db.rpc('staff_list_support_messages',{p_thread_id:threadId});
    if(error) throw error;
    state.supportMessages=Array.isArray(data)?data:[];
    const current=state.supportThreads.find((thread)=>thread.thread_id===threadId);
    if(current&&current.assigned_staff_id===state.user?.id) current.unread_count=0;
    renderSupportChatThreads();
    renderSupportChatConversation();
    setFormStatus($('#supportChatStatus'));
  };

  const loadSupportChats=async({refreshActive=false}={})=>{
    const {data,error}=await db.rpc('staff_list_support_threads');
    if(error) throw error;
    state.supportThreads=Array.isArray(data)?data:[];
    if(state.activeSupportThreadId&&!state.supportThreads.some((thread)=>thread.thread_id===state.activeSupportThreadId)){
      state.activeSupportThreadId=null;
      state.supportMessages=[];
    }
    renderSupportChatThreads();
    renderSupportChatConversation();
    if(refreshActive&&state.activeSupportThreadId){
      await loadSupportThread(state.activeSupportThreadId,{silent:true});
    }
  };

  const claimActiveSupportChat=async(button)=>{
    const threadId=state.activeSupportThreadId;
    if(!threadId) return;
    await withButtonLock(button,'Assigning…',async()=>{
      const {data,error}=await db.rpc('staff_claim_support_thread',{p_thread_id:threadId});
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      await loadSupportChats();
      await loadSupportThread(threadId,{silent:true});
      globalStatus('Customer Care chat assigned to your desk.');
    });
  };

  const setActiveSupportChatStatus=async(button)=>{
    const thread=state.supportThreads.find((item)=>item.thread_id===state.activeSupportThreadId);
    if(!thread) return;
    const next=thread.status==='closed'?'open':'closed';
    await withButtonLock(button,next==='closed'?'Closing…':'Reopening…',async()=>{
      const {data,error}=await db.rpc('staff_set_support_thread_status',{
        p_thread_id:thread.thread_id,
        p_status:next
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      await loadSupportChats();
      await loadSupportThread(thread.thread_id,{silent:true});
      globalStatus(next==='closed'?'Customer Care chat closed.':'Customer Care chat reopened.');
    });
  };

  const sendSupportChatReply=async(event)=>{
    event.preventDefault();
    const thread=state.supportThreads.find((item)=>item.thread_id===state.activeSupportThreadId);
    const textarea=$('#supportChatReply');
    const body=textarea?.value.trim()||'';
    if(!thread||!body) return;
    const button=$('#sendSupportChatReply');
    await withButtonLock(button,'Sending…',async()=>{
      setFormStatus($('#supportChatStatus'),'Sending private reply…');
      const {data,error}=await db.rpc('staff_send_support_message',{
        p_thread_id:thread.thread_id,
        p_body:body
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      textarea.value='';
      await Promise.all([
        loadSupportChats(),
        loadSupportThread(thread.thread_id,{silent:true})
      ]);
      setFormStatus($('#supportChatStatus'),'Reply sent to customer.','success');
    });
  };

  const stopSupportChatPolling=()=>{
    if(supportChatPollTimer){
      window.clearInterval(supportChatPollTimer);
      supportChatPollTimer=null;
    }
  };

  const startSupportChatPolling=()=>{
    stopSupportChatPolling();
    supportChatPollTimer=window.setInterval(()=>{
      const open=document.querySelector('[data-admin-panel="chat"]')?.classList.contains('active');
      if(open&&document.visibilityState==='visible'){
        loadSupportChats({refreshActive:true}).catch(()=>{});
      }
    },4500);
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

  const loadDeliveryOps = async () => {
    const [ridersResult,jobsResult,sellerStatesResult]=await Promise.all([
      db.rpc('admin_list_riders'),
      db.rpc('admin_list_delivery_jobs'),
      db.from('marketplace_seller_orders').select('order_id,fulfilment_status')
    ]);
    if(ridersResult.error) throw ridersResult.error;
    if(jobsResult.error) throw jobsResult.error;
    if(sellerStatesResult.error) throw sellerStatesResult.error;
    state.riders=ridersResult.data||[];
    state.deliveryJobs=jobsResult.data||[];
    state.deliverySellerStates=sellerStatesResult.data||[];
    renderDeliveryOps();
  };
  const renderDeliveryOps = () => {
    const activeRiders=state.riders.filter(r=>r.status==='active');
    $('#adminRiderCount').textContent=activeRiders.length;
    $('#adminDeliveryAwaiting').textContent=state.deliveryJobs.filter(j=>j.status==='awaiting_assignment').length;
    $('#adminDeliveryActive').textContent=state.deliveryJobs.filter(j=>['assigned','picked_up','on_the_way'].includes(j.status)).length;
    $('#adminDeliveryDone').textContent=state.deliveryJobs.filter(j=>j.status==='delivered').length;

    $('#adminRiderList').innerHTML=state.riders.length?state.riders.map(r=>`<article class="station-card">
      <header><div><h3>${escapeHtml(r.display_name)}</h3><span class="status-chip">${escapeHtml(r.status)}</span></div><strong>Rider</strong></header>
      <p>${escapeHtml(r.email||'')}<br>${escapeHtml(r.phone||'No phone')}${r.vehicle_type?'<br>'+escapeHtml(r.vehicle_type)+(r.vehicle_registration?' · '+escapeHtml(r.vehicle_registration):''):''}</p>
    </article>`).join(''):'<div class="loading-card">No LEOGO riders authorized yet.</div>';

    $('#adminDeliveryJobBody').innerHTML=state.deliveryJobs.length?state.deliveryJobs.map(job=>{
      const states=state.deliverySellerStates.filter(s=>s.order_id===job.order_id).map(s=>s.fulfilment_status);
      const readiness=states.length&&states.every(s=>['packed_ready','handed_to_rider','delivered'].includes(s))?'Ready for rider':states.length?states.map(s=>String(s).replaceAll('_',' ')).join(', '):'Waiting for Seller';
      const riderOptions='<option value="">Choose rider…</option>'+activeRiders.map(r=>'<option value="'+escapeHtml(r.user_id)+'" '+(r.user_id===job.rider_id?'selected':'')+'>'+escapeHtml(r.display_name)+(r.vehicle_registration?' · '+escapeHtml(r.vehicle_registration):'')+'</option>').join('');
      const destination=[job.estate,job.landmark,job.sub_county,job.county].filter(Boolean).join(', ')||job.delivery_zone;
      const assignable=!['picked_up','on_the_way','delivered','cancelled'].includes(job.status);
      return `<tr>
        <td><strong>${escapeHtml(job.order_reference)}</strong><small>${formatDate(job.created_at,true)}</small></td>
        <td><strong>${escapeHtml(job.customer_name)}</strong><small>${escapeHtml(job.customer_phone||'')} · ${escapeHtml(destination||'')}</small></td>
        <td><span class="status-chip">${escapeHtml(readiness)}</span></td>
        <td><strong>${escapeHtml(job.rider_name||'Not assigned')}</strong><small>${escapeHtml(job.rider_phone||'')}</small></td>
        <td><span class="status-chip">${escapeHtml(String(job.status).replaceAll('_',' '))}</span></td>
        <td>${assignable?'<div class="delivery-assign"><select data-delivery-rider="'+escapeHtml(job.order_id)+'">'+riderOptions+'</select><button data-assign-delivery="'+escapeHtml(job.order_id)+'">Assign</button></div>':'—'}</td>
      </tr>`;
    }).join(''):'<tr><td colspan="6">No delivery jobs yet.</td></tr>';

    $$('[data-assign-delivery]').forEach(button=>button.addEventListener('click',async()=>{
      const select=$('[data-delivery-rider="'+button.dataset.assignDelivery+'"]');
      if(!select?.value){globalStatus('Choose an active LEOGO rider first.','error');return;}
      await withButtonLock(button,'Assigning…',async()=>{
        const {error}=await db.rpc('admin_assign_rider_to_order',{p_order_id:button.dataset.assignDelivery,p_rider_id:select.value});
        if(error){globalStatus(friendlyError(error),'error');return;}
        globalStatus('Order assigned to LEOGO rider. Customer and Seller were notified.');
        await Promise.all([loadDeliveryOps(),loadMarketplaceOrders({refreshActiveDetail:false}),loadAuditLog()]);
      });
    }));
  };
  const addRider = async (event) => {
    event.preventDefault();
    const button=event.submitter;
    await withButtonLock(button,'Authorizing…',async()=>{
      const {error}=await db.rpc('admin_add_rider',{
        p_email:$('#adminRiderEmail').value.trim(),
        p_display_name:$('#adminRiderName').value.trim(),
        p_phone:$('#adminRiderPhone').value.trim()||null,
        p_vehicle_type:$('#adminRiderVehicle').value.trim()||null,
        p_vehicle_registration:$('#adminRiderPlate').value.trim()||null
      });
      if(error){setFormStatus($('#adminRiderStatus'),friendlyError(error),'error');return;}
      event.currentTarget.reset();
      setFormStatus($('#adminRiderStatus'),'Rider account authorized successfully.','success');
      await Promise.all([loadDeliveryOps(),loadDashboard(),loadAuditLog()]);
    });
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

  const renderServiceProviders = () => {
    const rows=state.serviceProviders||[];
    const approved=rows.filter((item)=>item.application_status==='approved').length;
    const pending=rows.filter((item)=>['submitted','under_review','changes_requested'].includes(item.application_status)).length;
    const approvedServices=rows.reduce((sum,item)=>sum+Number(item.approved_service_count||0),0);
    $('#serviceProviderTotal').textContent=rows.length;
    $('#serviceProviderApproved').textContent=approved;
    $('#serviceProviderPending').textContent=pending;
    $('#serviceProviderApprovedServices').textContent=approvedServices;
    $('#serviceProviderTableBody').innerHTML=rows.length?rows.map((item)=>{
      const pendingApproval=state.approvals.find((approval)=>approval.kind==='service_provider_application'&&approval.record_id===item.user_id);
      return '<tr>'+
        '<td data-label="Provider"><strong>'+escapeHtml(item.business_name||'Service Provider')+'</strong><small>'+escapeHtml(item.owner_name||item.email||'')+'</small></td>'+
        '<td data-label="Primary Service"><strong>'+escapeHtml(item.primary_service||'—')+'</strong><small>'+escapeHtml(item.service_category||'')+'</small></td>'+
        '<td data-label="Location"><strong>'+escapeHtml(item.town||'—')+'</strong><small>'+escapeHtml([item.sub_county,item.county].filter(Boolean).join(', '))+'</small></td>'+
        '<td data-label="Availability"><span class="status-chip">'+escapeHtml(String(item.availability_status||'available').replaceAll('_',' '))+'</span></td>'+
        '<td data-label="Status"><span class="status-chip">'+escapeHtml(String(item.application_status||'').replaceAll('_',' '))+'</span></td>'+
        '<td data-label="Services"><strong>'+Number(item.service_count||0)+'</strong><small>'+Number(item.approved_service_count||0)+' approved</small></td>'+
        '<td data-label="Action">'+(pendingApproval?'<button type="button" data-provider-review="'+escapeHtml(item.user_id)+'">Open Approval →</button>':'<span class="status-chip">'+(item.application_status==='approved'?'Active':'No pending action')+'</span>')+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7">No Service Provider accounts yet.</td></tr>';
    $$('[data-provider-review]', $('#serviceProviderTableBody')).forEach((button)=>button.addEventListener('click',()=>openApproval('service_provider_application',button.dataset.providerReview)));
  };
  const loadServiceProviders = async () => {
    const {data,error}=await db.rpc('admin_list_service_providers');
    if(error)throw error;
    state.serviceProviders=Array.isArray(data)?data:[];
    renderServiceProviders();
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

    $$('[data-request-review]').forEach((button)=>button.addEventListener('click',async()=>{
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
    $$('[data-request-pay]').forEach((button)=>button.addEventListener('click',async()=>{
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
    if (!viewAllowed(view, settingsTab)) {
      globalStatus('Your staff role does not have access to this Admin module.', 'error');
      return;
    }
    document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.adminPanel === view));
    document.querySelectorAll('.admin-nav [data-admin-view]').forEach((button) => button.classList.toggle('active', button.dataset.adminView === view && (!button.dataset.settingsTab || button.dataset.settingsTab === settingsTab)));
    $('#adminPageTitle').textContent = viewTitles[view] || 'Admin Control Center';
    $('#adminBreadcrumb').textContent = view === 'settings' ? 'ADMINISTRATION' : 'CONTROL CENTER';

    // Catalogue is refreshed again when Admin opens it, so a failure in any
    // unrelated dashboard module cannot leave Seller products hidden.
    if (view === 'aftersales') {
      loadAftersalesCases().catch((error) => globalStatus('Aftersales cases could not load: '+friendlyError(error), 'error'));
    }
    if (view === 'chat') {
      loadSupportChats({refreshActive:true}).catch((error) => globalStatus('Customer Care chats could not load: '+friendlyError(error), 'error'));
      startSupportChatPolling();
    } else {
      stopSupportChatPolling();
    }
    if (view === 'products') {
      Promise.all([loadCatalogue(),loadPersonalMarketplace()])
        .catch((error) => globalStatus('Product management data could not load: '+friendlyError(error), 'error'));
    }
    if (view === 'providers') {
      loadServiceProviders().catch((error) => globalStatus('Service Providers could not load: '+friendlyError(error), 'error'));
    }
    if (view === 'staff' && isSuperAdmin()) {
      loadStaffManagement().catch((error) => globalStatus('Staff directory could not load: '+friendlyError(error), 'error'));
    }
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
    $('#adminLoginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      window.location.href='../staff/?next=admin';
    });
    const signOut = async () => {
      await db?.auth.signOut();
      state.admin = null;
      state.user = null;
      window.location.replace('../staff/');
    };
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
    $('#refreshServiceProviders')?.addEventListener('click', () => withButtonLock($('#refreshServiceProviders'), 'Refreshing…', async () => { await Promise.all([loadServiceProviders(),loadApprovals()]); }));
    $('#refreshAftersalesCases')?.addEventListener('click', () => withButtonLock($('#refreshAftersalesCases'), 'Refreshing…', loadAftersalesCases));
    $('#adminAftersalesSearch')?.addEventListener('input', renderAftersalesCases);
    $('#adminAftersalesStatusFilter')?.addEventListener('change', renderAftersalesCases);
    $('#adminAftersalesBody')?.addEventListener('click',(event)=>{
      const button=event.target.closest?.('[data-open-aftersales-case]');
      if(!button) return;
      state.activeAftersalesCaseId=button.dataset.openAftersalesCase;
      renderAftersalesCases();
      renderAftersalesDetail();
      $('#adminAftersalesDetail')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('#closeAdminAftersalesDetail')?.addEventListener('click',()=>{
      state.activeAftersalesCaseId=null;
      $('#adminAftersalesDetail').hidden=true;
      renderAftersalesCases();
    });
    $('#saveAftersalesCase')?.addEventListener('click',(event)=>saveActiveAftersalesCase(event.currentTarget));
    $('#openAftersalesEvidence')?.addEventListener('click',(event)=>openActiveAftersalesEvidence(event.currentTarget));
    $('#refreshSupportChats')?.addEventListener('click',()=>withButtonLock($('#refreshSupportChats'),'Refreshing…',async()=>loadSupportChats({refreshActive:true})));
    $('#supportChatSearch')?.addEventListener('input',renderSupportChatThreads);
    $('#supportChatFilter')?.addEventListener('change',renderSupportChatThreads);
    $('#supportChatThreadList')?.addEventListener('click',(event)=>{
      const button=event.target.closest?.('[data-support-thread]');
      if(!button) return;
      loadSupportThread(button.dataset.supportThread).catch((error)=>globalStatus(friendlyError(error),'error'));
    });
    $('#claimSupportChat')?.addEventListener('click',(event)=>claimActiveSupportChat(event.currentTarget));
    $('#toggleSupportChatStatus')?.addEventListener('click',(event)=>setActiveSupportChatStatus(event.currentTarget));
    $('#supportChatReplyForm')?.addEventListener('submit',sendSupportChatReply);
    $('#refreshStaffDirectory')?.addEventListener('click', () => withButtonLock($('#refreshStaffDirectory'), 'Refreshing…', loadStaffManagement));
    $('#staffSearch')?.addEventListener('input', renderStaffDirectory);
    $('#staffRoleFilter')?.addEventListener('change', renderStaffDirectory);
    $('#staffStatusFilter')?.addEventListener('change', renderStaffDirectory);
    $('#staffAccountKind')?.addEventListener('change', () => {
      const rider=$('#staffAccountKind').value==='rider';
      $('#adminStaffFields').hidden=rider;
      $('#riderStaffFields').hidden=!rider;
      $('#staffPhone').required=rider;
      $('#staffRole').required=!rider;
    });
    $('#staffRole')?.addEventListener('change', applyCreateRolePreset);
    $('#resetStaffPermissions')?.addEventListener('click', applyCreateRolePreset);
    $('#createStaffForm')?.addEventListener('submit', createStaffAccount);
    $('#closeStaffEditor')?.addEventListener('click', closeStaffEditor);
    $('#staffEditorRole')?.addEventListener('change', resetEditorRolePermissions);
    $('#resetEditorPermissions')?.addEventListener('click', resetEditorRolePermissions);
    $('#staffAccessForm')?.addEventListener('submit', saveStaffAccess);
    $('#saveStaffDocuments')?.addEventListener('click', saveStaffDocuments);
    $('#refreshMarketplaceOrders').addEventListener('click', () => withButtonLock($('#refreshMarketplaceOrders'), 'Refreshing…', loadMarketplaceOrders));
    $('#adminOrderSearch')?.addEventListener('input', renderMarketplaceOrders);
    $('#adminOrderPaymentFilter')?.addEventListener('change', renderMarketplaceOrders);
    $('#adminOrderStatusFilter')?.addEventListener('change', renderMarketplaceOrders);
    $('#downloadOrderDeliverySummary')?.addEventListener('click', downloadOrderDeliverySummary);
    $('#printOrderDeliverySummary')?.addEventListener('click', printOrderDeliverySummary);
    $('#closeAdminOrderDetail')?.addEventListener('click', closeMarketplaceOrderDetail);
    $('#adminOrderDeliveryDetail')?.addEventListener('click',(event)=>{
      const assignButton=event.target.closest?.('#assignRiderFromOrder');
      if(assignButton){ assignActiveOrderRider(assignButton); return; }
      const saveButton=event.target.closest?.('#saveAdminRiderInstructions');
      if(saveButton){ saveActiveOrderRiderInstructions(saveButton); return; }
      const codButton=event.target.closest?.('#useCodRiderInstruction');
      if(codButton){ applyCodRiderInstruction(); return; }
      const sortingButton=event.target.closest?.('[data-sorting-status]');
      if(sortingButton) updateActiveOrderSortingStatus(sortingButton,sortingButton.dataset.sortingStatus);
    });
    $('#refreshDeliveryOps').addEventListener('click', () => withButtonLock($('#refreshDeliveryOps'), 'Refreshing…', loadDeliveryOps));
    $('#adminAddRiderForm').addEventListener('submit', addRider);
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

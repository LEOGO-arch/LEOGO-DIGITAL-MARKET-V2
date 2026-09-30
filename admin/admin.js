Warning: truncated output (original token count: 97308)
Total output lines: 5796

// LEOGO DIGITAL MARKET — Admin Control Center V1
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const STAFF_PORTAL_URL = 'https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/staff/';
  const supabaseFactory = window.supabase?.createClient;
  const STAFF_AUTH_STORAGE_KEY = 'leogo-staff-auth-v2';
  const db = supabaseFactory ? supabaseFactory(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: STAFF_AUTH_STORAGE_KEY
    }
  }) : null;
  // Admin/Staff authentication is deliberately isolated from Customer/Partner authentication.
  // This prevents a Partner login in another tab from replacing the active Admin JWT.
  window.leogoAdminDb = db;
  window.leogoStaffAuthStorageKey = STAFF_AUTH_STORAGE_KEY;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => root ? Array.from(root.querySelectorAll(selector)) : [];
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
    pickupStationPartners: [],
    pickupStationEvents: [],
    pickupStationWithdrawals: [],
    pickupStationReturns: [],
    walletSettings: null,
    transportFinanceSettings: null,
    deliveryRateSettings: null,
    accommodationFinanceSettings: null,
    premiumPlans: [],
    premiumCustomers: [],
    premiumProfiles: [],
    sellers: [],
    serviceProviders: [],
    serviceListings: [],
    serviceRequests: [],
    serviceReviews: [],
    transportProviders: [],
    transportVehicles: [],
    transportRequests: [],
    serviceMarketplaceSettings: null,
    paymentActions: [],
    sellerSettlementAccounts: [],
    providerSettlementAccounts: [],
    transportSettlementAccounts: [],
    sellerSettlementRequests: [],
    providerSettlementRequests: [],
    transportSettlementRequests: [],
    sellerSettlements: [],
    providerSettlements: [],
    transportSettlements: [],
    riders: [],
    staffDirectory: [],
    staffRolePresets: [],
    activeStaff: null,
    activeStaffDocuments: null,
    deliveryJobs: [],
    deliverySellerStates: [],
    serviceCounties: [],
    serviceSubcounties: [],
    accommodationProviders: [],
    accommodationBookings: [],
    advertisements: [],
    adminNotifications: [],
    audit: [],
    dashboard: null,
    dashboardRange: 'today',
    dashboardFrom: null,
    dashboardTo: null,
    selectedCustomers: new Set(),
    selectedData: new Set(),
    reportCode: 'orders',
    reportRows: [],
    reportSelected: new Set(),
    reportStatuses: {},
    reportPage: 1,
    reportPageSize: 25,
    reportInitialized: false,
    busy: false
  };

  const viewTitles = {
    dashboard: 'Dashboard', approvals: 'Approval Center', orders: 'Orders', aftersales: 'Aftersales', customers: 'Customers',
    chat: 'Customer Care Chats', products: 'Products & Categories', sellers: 'Sellers', settlements: 'Partner Settlements', providers: 'Service Providers',
    transport: 'Transport & Parcel Delivery', wallet: 'Wallet & SACCO', premium: 'Premium',
    accommodation: 'Accommodation', advertisements: 'Advertisements', loyalty: 'Loyalty & Rewards', reports: 'Reports',
    staff: 'Staff Management', settings: 'System Settings', audit: 'Audit Log'
  };
  const kindLabels = {
    seller_application: 'Seller Registration', seller_profile_change: 'Seller Profile Update', seller_product: 'Seller Product', customer_personal_sale: 'Customer Item Sale',
    seller_settlement_account: 'Seller Settlement Account',
    service_provider_application: 'Service Provider Registration', service_provider_profile_change: 'Service Provider Profile Update', service_listing: 'Service Listing',
    service_provider_settlement_account: 'Service Provider Settlement Account',
    transport_provider_settlement_account: 'Transport Provider Settlement Account',
    transport_provider_application: 'Transport / Parcel Provider Registration', transport_provider_profile_change: 'Transport Provider Profile Update',
    transport_vehicle: 'Transport Vehicle',
    pickup_station_application: 'Pickup Station Registration',
    accommodation_provider_profile_change: 'Accommodation Provider Profile Update',
    premium_partner_profile_change: 'Premium Profile Update',
    premium_customer: 'Premium Customer', premium_profile: 'Verified Premium Profile',
    premium_payment: 'Premium Payment', partner_subscription_payment: 'Partner Subscription Payment', premium_extra_acceptance_payment: 'Premium Extra Acceptance', wallet_deposit: 'Wallet Deposit', wallet_loan: 'Wallet Loan',
    wallet_withdrawal: 'Wallet Withdrawal', accommodation_host: 'Accommodation Host',
    accommodation_property: 'Accommodation Property',
    accommodation_unit: 'Accommodation Room / Unit',
    cyber_application: 'Cyber Partner Registration', cyber_service: 'Cyber Service', cyber_product: 'Cyber Shop Item', cyber_profile_change: 'Cyber Profile Update'
  };
  const functionLabels = {
    wallet_sacco_deposits: 'Wallet / SACCO Deposits', savings_challenge: 'Savings Challenge',
    loan_repayment: 'Loan Repayment', marketplace_orders: 'Marketplace Orders',
    lipa_pole_pole: 'Lipa Pole Pole', premium_payments: 'Premium Payments',
    accommodation_payments: 'Accommodation Payments', service_payments: 'Service Payments',
    transport_payments: 'Transport & Parcel Delivery', cyber_orders: 'Cyber Orders', other_revenue: 'Other Revenue'
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
  const adminNotificationSeenStorageKey = () => 'leogo_admin_notification_seen_'+String(state.user?.id||'anonymous');
  const adminNotificationSeenSet = () => {
    try {
      const raw=JSON.parse(localStorage.getItem(adminNotificationSeenStorageKey())||'[]');
      return new Set(Array.isArray(raw)?raw:[]);
    } catch (_error) {
      return new Set();
    }
  };
  const saveAdminNotificationSeenSet = (seen) => {
    try {
      localStorage.setItem(adminNotificationSeenStorageKey(),JSON.stringify([...seen].slice(-500)));
    } catch (_error) {}
  };
  const adminNotificationTime = (item) => item.updated_at||item.submitted_at||item.created_at||new Date().toISOString();
  const buildAdminActivityNotifications = () => {
    const items=[];

    (state.approvals||[]).forEach((item)=>{
      const key='approval:'+String(item.kind||'approval')+':'+String(item.record_id||'');
      items.push({
        key,
        category:'Approval',
        title:item.title||kindLabels[item.kind]||'Approval waiting',
        message:(item.applicant_name||item.customer_name||'Applicant')+' is waiting for Admin review.',
        created_at:item.submitted_at,
        view:'approvals',
        kind:item.kind,
        recordId:item.record_id,
        priority:true
      });
    });

    (state.paymentActions||[]).forEach((item)=>{
      const source=String(item.record_id||item.source_id||item.payment_id||item.id||item.submitted_at||item.title||'payment');
      items.push({
        key:'payment:'+source,
        category:'Payment',
        title:item.title||'Payment awaiting verification',
        message:(item.customer_name||'Customer')+' · '+(item.detail||'Payment needs Admin verification')+(Number(item.amount_kes||0)>0?' · '+formatMoney(item.amount_kes):''),
        created_at:item.submitted_at||item.created_at,
        view:item.view||'approvals',
        tab:item.tab||'',
        priority:true
      });
    });

    (state.transportRequests||[]).filter((item)=>['submitted','declined'].includes(item.request_status)).forEach((item)=>{
      items.push({
        key:'transport-request:'+String(item.id)+':'+String(item.request_status),
        category:'Transport',
        title:'Transport request '+String(item.request_reference||''),
        message:(item.customer_name||'Customer')+' · '+(item.pickup_location||'Pickup')+' → '+(item.destination_location||'Destination'),
        created_at:item.created_at,
        view:'transport',
        sourceId:item.id,
        priority:true
      });
    });

    (state.accommodationBookings||[]).forEach((item)=>{
      const statusLabel=String(item.booking_status||'pending_host').replaceAll('_',' ');
      const pending=item.booking_status==='pending_host';
      items.push({
        key:'accommodation-booking:'+String(item.id)+':'+String(item.booking_status||''),
        category:'Accommodation',
        title:pending?'New accommodation booking':'Accommodation booking '+statusLabel,
        message:String(item.booking_reference||'Booking')+' · '+String(item.provider_name||item.property_name||'Accommodation')+' · '+String(item.guest_name||'Guest'),
        created_at:pending?item.created_at:(item.updated_at||item.created_at),
        view:'accommodation',
        sourceId:item.id,
        priority:pending
      });
    });

    (state.pickupStationEvents||[]).slice(0,20).forEach((item)=>{
      const type=String(item.event_type||'update').replaceAll('_',' ');
      items.push({
        key:'pickup-station:'+String(item.event_id||'')+':'+String(item.event_type||''),
        category:'Pickup Station',
        title:'Pickup Station '+type,
        message:String(item.station_name||'Pickup Station')+' · '+String(item.parcel_reference||'Parcel')+(item.notes?' · '+String(item.notes):''),
        created_at:item.created_at,
        view:'transport',
        tab:'pickup',
        sourceId:item.pickup_station_id,
        priority:['received','handed_over','return_booked','withdrawal_requested'].includes(item.event_type)
      });
    });

    (state.dashboard?.alerts||[]).forEach((item)=>{
      items.push({
        key:'system-alert:'+String(item.title||'alert')+':'+String(item.view||'dashboard')+':'+String(item.detail||''),
        category:'System',
        title:item.title||'System alert',
        message:item.detail||'Admin attention may be required.',
        created_at:new Date().toISOString(),
        view:item.view||'dashboard',
        tab:item.tab||'',
        priority:true
      });
    });

    (state.dashboard?.recent_admin_activity||[]).slice(0,10).forEach((item)=>{
      items.push({
        key:'admin-activity:'+String(item.created_at||'')+':'+String(item.action||''),
        category:'Admin Activity',
        title:String(item.action||'Admin activity').replaceAll('.',' '),
        message:(item.admin||'Admin')+' · '+(item.entity||'record'),
        created_at:item.created_at,
        view:'audit',
        priority:false
      });
    });

    return items
      .filter((item)=>item.key)
      .sort((a,b)=>new Date(adminNotificationTime(b)||0)-new Date(adminNotificationTime(a)||0))
      .slice(0,60);
  };

  const markAdminNotificationSeen = (key) => {
    const seen=adminNotificationSeenSet();
    seen.add(String(key));
    saveAdminNotificationSeenSet(seen);
  };

  const renderAdminNotifications = () => {
    state.adminNotifications=buildAdminActivityNotifications();
    const seen=adminNotificationSeenSet();
    const unread=state.adminNotifications.filter((item)=>!seen.has(item.key)).length;
    const badge=$('#adminNotificationBadge');
    if(badge){
      badge.hidden=!unread;
      badge.textContent=unread>99?'99+':String(unread);
    }
    const list=$('#adminNotificationList');
    if(!list)return;
    list.innerHTML=state.adminNotifications.length?state.adminNotifications.map((item)=>{
      const isSeen=seen.has(item.key);
      return '<article class="admin-notification-item '+(isSeen?'':'unread')+' '+(item.priority?'priority':'')+'">'+
        '<div class="admin-notification-icon">'+(item.category==='Accommodation'?'🏨':item.category==='Payment'?'KSh':item.category==='Transport'?'🚚':item.category==='Approval'?'✓':item.category==='System'?'!':'◴')+'</div>'+
        '<div class="admin-notification-copy"><span>'+escapeHtml(item.category)+'</span><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(item.message)+'</p><small>'+escapeHtml(formatDate(item.created_at,true))+'</small></div>'+
        '<button type="button" data-open-admin-notification="'+escapeHtml(item.key)+'">Open</button>'+
      '</article>';
    }).join(''):'<div class="empty-mini">No Admin activity notifications right now.</div>';
  };

  const openAdminActivityNotification = (key) => {
    const item=state.adminNotifications.find((row)=>row.key===key);
    if(!item)return;
    markAdminNotificationSeen(item.key);
    renderAdminNotifications();
    const panel=$('#adminNotificationPanel');
    if(panel)panel.hidden=true;
    $('#adminNotificationBell')?.setAttribute('aria-expanded','false');

    if(item.category==='Approval'&&item.kind&&item.recordId){
      changeView('approvals');
      const approval=state.approvals.find((row)=>String(row.kind)===String(item.kind)&&String(row.record_id)===String(item.recordId));
      if(approval)window.setTimeout(()=>openApproval(item.kind,item.recordId),60);
      return;
    }
    if(item.category==='Pickup Station'){
      activeTransportSection='pickup';
      changeView('transport');
      changeTransportSection('pickup');
      window.setTimeout(()=>$('#pickupStationEventList')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
      return;
    }
    if(item.category==='Transport'){
      activeTransportSection='jobs';
      changeView('transport');
      changeTransportSection('jobs');
      window.setTimeout(()=>{
        const node=document.querySelector('[data-admin-transport-request="'+CSS.escape(String(item.sourceId||''))+'"]');
        (node||$('#adminTransportRequestList'))?.scrollIntoView({behavior:'smooth',block:'start'});
      },80);
      return;
    }
    if(item.category==='Accommodation'){
      changeView('accommodation');
      window.setTimeout(()=>$('#adminAccommodationBookingBody')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
      return;
    }
    changeView(item.view||'dashboard',item.tab||'');
    if(item.view==='premium'&&item.tab)changePremiumAdminTab(item.tab);
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
      advertisements: () => adminHas('settings.manage'),
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
      [loadServiceListings, () => adminHas('approvals.read')],
      [loadServiceOperations, () => adminHas('approvals.read')],
      [loadServiceReviews, () => adminHas('approvals.read') || adminHas('delivery.manage') || adminHas('products.read')],
      [loadSellerSettlements, () => adminHas('settlements.read')],
      [loadTransportNetwork, () => adminHas('approvals.read') || adminHas('delivery.manage')],
      [loadDeliveryOps, () => adminHas('orders.read') || adminHas('delivery.manage')],
      [loadServiceLocations, () => adminHas('settings.manage')],
      [loadBusinessSettings, () => adminHas('settings.manage')],
      [loadPaymentSettings, () => adminHas('payments.manage')],
      [loadPartnerSubscriptionSettings, () => adminHas('settings.manage') || adminHas('fees.manage')],
      [loadPickupStations, () => adminHas('orders.read') || adminHas('delivery.manage')],
      [loadWalletSettings, () => adminHas('approvals.read') || adminHas('fees.manage')],
      [loadTransportFinanceSettings, () => adminHas('settings.manage') || adminHas('fees.manage') || adminHas('delivery.manage')],
      [loadDeliveryRateSettings, () => adminHas('settings.manage') || adminHas('fees.manage') || adminHas('delivery.manage') || adminHas('approvals.read')],
      [loadAccommodationFinanceSettings, () => adminHas('settings.manage') || adminHas('fees.manage') || adminHas('approvals.read')],
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
    renderAdminNotifications();
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
    if($('#statOrdersNote')) $('#statOrdersNote').textContent = data.top.orders?.supported ? dashboardLabel() : 'Not connected';
    if($('#statSalesNote')) $('#statSalesNote').textContent = data.top.gross_sales?.supported ? dashboardLabel() : 'Not connected';
    const liveApprovalCount = state.approvals.length || Number(data.top.pending_approvals.value || 0);
    $('#statApprovals').textContent = liveApprovalCount.toLocaleString('en-KE');
    $('#statDeliveries').textContent = metricValue(data.top.active_deliveries);
    if($('#statDeliveriesNote')) $('#statDeliveriesNote').textContent = data.top.active_deliveries?.supported ? 'Live delivery jobs' : 'Not connected';
    $('#sidebarApprovalCount').textContent = liveApprovalCount;

    const recentOrders=Array.isArray(data.recent_orders)?data.recent_orders:[];
    if($('#dashboardRecentOrders')){
      $('#dashboardRecentOrders').innerHTML=recentOrders.length?recentOrders.map((order)=>`
        <div class="dashboard-order-row">
          <div>
            <b>${escapeHtml(order.order_reference||'Order')}</b>
            <small>${escapeHtml(order.customer||'Customer')} · ${formatDate(order.created_at,true)}</small>
          </div>
          <div class="dashboard-order-row-meta">
            <strong>${formatMoney(order.amount)}</strong>
            <small>${escapeHtml(String(order.order_status||'').replaceAll('_',' '))} · ${escapeHtml(String(order.delivery_status||'awaiting_assignment').replaceAll('_',' '))}</small>
          </div>
          <button type="button" data-dashboard-order-id="${escapeHtml(order.id)}">View →</button>
        </div>
      `).join(''):'<div class="empty-mini">No marketplace orders have been created yet.</div>';

      $$('[data-dashboard-order-id]',$('#dashboardRecentOrders')).forEach((button)=>button.addEventListener('click',()=>{
        changeView('orders');
        loadMarketplaceOrderDetail(button.dataset.dashboardOrderId,{scroll:true});
      }));
    }

    const delivery=data.delivery||{};
    const deliveryMetrics=[
      ['dashboardDeliveryAwaiting','awaiting_assignment'],
      ['dashboardDeliveryAssigned','assigned'],
      ['dashboardDeliveryPickedUp','picked_up'],
      ['dashboardDeliverySorting','sorting_center'],
      ['dashboardDeliveryReady','ready_for_dispatch'],
      ['dashboardDeliveryOnWay','on_the_way'],
      ['dashboardDeliveryDelivered','delivered'],
      ['dashboardDeliveryProblems','problems']
    ];
    deliveryMetrics.forEach(([id,key])=>{
      const node=$('#'+id);
      if(node) node.textContent=delivery.supported?Number(delivery[key]||0).toLocaleString('en-KE'):'—';
    });
    if($('#dashboardDeliveryNote')) $('#dashboardDeliveryNote').textContent=delivery.supported?'Live marketplace delivery jobs.':'Delivery jobs are not connected.';
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
    const [coreResult,personalSaleResult,serviceProviderResult,transportResult,pickupStationResult,profileChangesResult,partnerSettlementResult,accommodationCorrectionsResult,accommodationUnitsResult,cyberResult,partnerBillingResult,paymentActionsResult,transportRequestsResult] = await Promise.all([
      db.rpc('admin_list_approval_queue'),
      db.rpc('admin_list_personal_sale_approvals'),
      db.rpc('admin_list_service_provider_approvals'),
      db.rpc('admin_list_transport_approvals'),
      db.rpc('admin_list_pickup_station_approvals'),
      db.rpc('admin_list_partner_profile_changes'),
      db.rpc('admin_list_partner_settlement_approvals'),
      db.rpc('admin_list_accommodation_corrections'),
      db.rpc('admin_list_accommodation_unit_approvals'),
      db.rpc('admin_list_cyber_approvals'),
      db.rpc('admin_list_partner_billing_approvals'),
      db.rpc('admin_list_pending_payment_actions'),
      db.rpc('admin_list_transport_requests')
    ]);
    if (coreResult.error) throw coreResult.error;
    if (personalSaleResult.error) throw personalSaleResult.error;
    if (serviceProviderResult.error) throw serviceProviderResult.error;
    if (transportResult.error) throw transportResult.error;
    if (pickupStationResult.error) throw pickupStationResult.error;
    if (profileChangesResult.error) throw profileChangesResult.error;
    if (partnerSettlementResult.error) throw partnerSettlementResult.error;
    if (accommodationCorrectionsResult.error) throw accommodationCorrectionsResult.error;
    if (accommodationUnitsResult.error) throw accommodationUnitsResult.error;
    if (cyberResult.error) throw cyberResult.error;
    if (partnerBillingResult.error) throw partnerBillingResult.error;
    if (paymentActionsResult.error) throw paymentActionsResult.error;
    if (transportRequestsResult.error) throw transportRequestsResult.error;

    state.approvals = [
      ...(Array.isArray(coreResult.data) ? coreResult.data : []),
      ...(Array.isArray(personalSaleResult.data) ? personalSaleResult.data : []),
      ...(Array.isArray(serviceProviderResult.data) ? serviceProviderResult.data : []),
      ...(Array.isArray(transportResult.data) ? transportResult.data : []),
      ...(Array.isArray(pickupStationResult.data) ? pickupStationResult.data : []),
      ...(Array.isArray(profileChangesResult.data) ? profileChangesResult.data : []),
      ...(Array.isArray(partnerSettlementResult.data) ? partnerSettlementResult.data : []),
      ...(Array.isArray(accommodationCorrectionsResult.data) ? accommodationCorrectionsResult.data : []),
      ...(Array.isArray(accommodationUnitsResult.data) ? accommodationUnitsResult.data : []),
      ...(Array.isArray(cyberResult.data) ? cyberResult.data : []),
      ...(Array.isArray(partnerBillingResult.data) ? partnerBillingResult.data : [])
    ].sort((a,b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
    state.paymentActions=Array.isArray(paymentActionsResult.data)?paymentActionsResult.data:[];
    state.transportRequests=Array.isArray(transportRequestsResult.data)?transportRequestsResult.data:state.transportRequests;
    renderApprovals();
    renderTransportRequests();
    if (state.serviceProviders.length) renderServiceProviders();

    // Keep Dashboard and sidebar counts synchronized with the actual Approval Center queue,
    // including Seller product submissions.
    if ($('#statApprovals')) $('#statApprovals').textContent = Number(state.approvals.length).toLocaleString('en-KE');
    if ($('#sidebarApprovalCount')) $('#sidebarApprovalCount').textContent = state.approvals.length;

    const compact = $('#dashboardApprovalList');
    const nonPaymentApprovals=state.approvals
      .filter((item)=>!['premium_payment','wallet_deposit'].includes(item.kind))
      .slice(0,5)
      .map((item)=>({...item,action_type:'approval'}));
    const pendingPayments=state.paymentActions.map((item)=>({...item,action_type:'payment'}));
    const pendingTransportRequests=(state.transportRequests||[])
      .filter((item)=>['submitted','declined'].includes(item.request_status))
      .map((item)=>({
        ...item,
        action_type:'transport_request',
        submitted_at:item.created_at,
        title:'Transport Request '+(item.request_reference||''),
        applicant_name:item.customer_name||'Customer'
      }));
    const actions=[...pendingPayments,...pendingTransportRequests,...nonPaymentApprovals]
      .sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0));
    compact.innerHTML=actions.length?actions.map((item)=>item.action_type==='payment'
      ? `<div><div><b>${escapeHtml(item.title)} · ${formatMoney(item.amount_kes)}</b><small>${escapeHtml(item.customer_name||'Customer')} · ${escapeHtml(item.detail||'Payment awaiting verification')} · ${formatDate(item.submitted_at)}</small></div><button data-dashboard-payment-view="${escapeHtml(item.view)}" data-dashboard-payment-tab="${escapeHtml(item.tab||'')}">Verify →</button></div>`
      : item.action_type==='transport_request'
        ? `<div><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.customer_name||'Customer')} · ${escapeHtml(item.pickup_location||'Pickup')} → ${escapeHtml(item.destination_location||'Destination')} · ${formatDate(item.created_at,true)}</small></div><button data-dashboard-transport-request="${escapeHtml(item.id)}">Assign →</button></div>`
        : `<div><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.applicant_name)} · ${formatDate(item.submitted_at)}</small></div><button data-dashboard-review="${escapeHtml(item.record_id)}" data-dashboard-kind="${escapeHtml(item.kind)}">Review →</button></div>`
    ).join(''):'<div class="empty-mini">No urgent action required.</div>';
    Array.from(compact.querySelectorAll('[data-dashboard-review]')).forEach((button)=>button.addEventListener('click',()=>openApproval(button.dataset.dashboardKind,button.dataset.dashboardReview)));
    Array.from(compact.querySelectorAll('[data-dashboard-payment-view]')).forEach((button)=>button.addEventListener('click',()=>{
      changeView(button.dataset.dashboardPaymentView);
      if(button.dataset.dashboardPaymentView==='premium')changePremiumAdminTab(button.dataset.dashboardPaymentTab||'subscriptions');
    }));
    Array.from(compact.querySelectorAll('[data-dashboard-transport-request]')).forEach((button)=>button.addEventListener('click',()=>{
      activeTransportSection='jobs';
      changeView('transport');
      changeTransportSection('jobs');
      window.setTimeout(()=>{
        const request=document.querySelector('[data-admin-transport-request="'+CSS.escape(button.dataset.dashboardTransportRequest)+'"]');
        (request||$('#adminTransportRequestList'))?.scrollIntoView({behavior:'smooth',block:'start'});
      },80);
    }));
    renderAdminNotifications();
  };

  const approvalGroup = (kind) => ['seller_application','seller_profile_change','seller_product','seller_settlement_account'].includes(kind) ? 'sellers' : ['service_provider_application','service_provider_profile_change','service_listing','service_provider_settlement_account'].includes(kind) ? 'providers' : ['transport_provider_application','transport_provider_profile_change','transport_vehicle','transport_provider_settlement_account','pickup_station_application'].includes(kind) ? 'transport' : kind.startsWith('cyber_') ? 'cyber' : kind.startsWith('premium') ? 'premium' : kind.startsWith('wallet') ? 'wallet' : kind.startsWith('accommodation') ? 'accommodation' : 'other';
  const approvalIsFinancial = (item) => ['premium_payment','partner_subscription_payment','premium_extra_acceptance_payment'].includes(item.kind) || item.kind.startsWith('wallet') || item.kind.endsWith('_settlement_account');
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
    const transport = state.approvals.filter((item) => approvalGroup(item.kind) === 'transport').length;
    const cyber = state.approvals.filter((item) => approvalGroup(item.kind) === 'cyber').length;
    const accommodation = state.approvals.filter((item) => approvalGroup(item.kind) === 'accommodation').length;
    const oldest = [...state.approvals].filter((item) => item.submitted_at).sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
    $('#approvalTotalCount').textContent = state.approvals.length;
    $('#approvalFinancialCount').textContent = financial;
    $('#approvalPremiumCount').textContent = premium;
    $('#approvalAccommodationCount').textContent = accommodation;
    $('#approvalOldestWaiting').textContent = oldest ? waitingAge(oldest.submitted_at) : '—';
    const counts = { all: state.approvals.length, financial, wallet, sellers, providers, transport, cyber, premium, accommodation };
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
    gallery_paths: { label: 'Premium Gallery Photo', bucket: 'premium-profile-media', multiple: true },
    passport_photo_path: { label: 'Passport-size Photo', bucket: 'premium-verification' },
    id_document_path: { label: 'Identity Document', bucket: 'premium-verification' },

    business_id_document_path: { label: 'Business ID / Identification', bucket: 'seller-verification' },
    business_licence_path: { label: 'Business Licence', bucket: 'seller-verification' },
    registration_certificate_path: { label: 'CR12 / Registration Certificate', bucket: 'seller-verification' },
    other_permit_paths: { label: 'Other Related Permit', bucket: 'seller-verification', multiple: true },
    professional_licence_path: { label: 'Professional Licence / Certificate', bucket: 'service-provider-verification' },
    transport_operator_permit_path: { label: 'Transport / Operator Permit', bucket: 'transport-verification' },
    vehicle_profile_picture_path: { label: 'Vehicle Profile Picture', bucket: 'transport-public-media', publicBucket: true },
    driver_passport_photo_path: { label: 'Driver Passport Photo — Admin Only', bucket: 'transport-driver-private' },

    main_image_path: { label: 'Product Main Image', bucket: 'seller-product-media' },
    gallery_image_paths: { label: 'Product Gallery Image', bucket: 'seller-product-media', multiple: true },
    variant_image_paths: { label: 'Variant Image', bucket: 'seller-product-media', multiple: true },
    item_image_path: { label: 'Item Picture', bucket: 'customer-sale-media' },
    ownership_proof_path: { label: 'Ownership Proof', bucket: 'customer-sale-verification' },
    cyber_product_image_path: { label: 'Cyber Product Picture', bucket: 'cyber-public-media', publicBucket: true },

    cover_image_url: { label: 'Property Cover Image', directUrl: true },
    gallery_image_urls: { label: 'Property Gallery Image', directUrl: true, multiple: true },
    unit_image_url: { label: 'Room / Unit Main Image', directUrl: true }
  };

  const adminMediaEntries = (payload = {}, kind = '') => {
    // Customer one-off sale media is deliberately isolated from every partner bucket.
    // This prevents a Cyber, Seller, Premium, Transport or Accommodation upload from
    // ever being rendered inside a Customer Item Sale review card.
    if (kind === 'customer_personal_sale') {
      const entries = [];
      if (payload?.item_image_path) {
        entries.push({
          key:'item_image_path',
          config:{ label:'Item Picture', bucket:'customer-sale-media' },
          value:String(payload.item_image_path),
          label:'Item Picture'
        });
      }
      if (payload?.ownership_proof_path) {
        entries.push({
          key:'ownership_proof_path',
          config:{ label:'Ownership Proof', bucket:'customer-sale-verification' },
          value:String(payload.ownership_proof_path),
          label:'Ownership Proof'
        });
      }
      return entries;
    }

    const entries = [];
    const providerVerificationFields = new Set(['passport_photo_path','business_id_document_path','business_licence_path','registration_certificate_path','professional_licence_path','other_permit_paths']);
    const transportVerificationFields = new Set(['business_id_document_path','business_licence_path','registration_certificate_path','transport_operator_permit_path','other_permit_paths']);
    const cyberVerificationFields = new Set(['business_id_document_path','business_licence_path','registration_certificate_path','other_permit_paths']);
    const pickupStationVerificationFields = new Set(['business_id_document_path','business_licence_path','registration_certificate_path','other_permit_paths']);
    Object.entries(approvalMediaFields).forEach(([key, config]) => {
      let resolvedConfig = config;
      if (['cyber_application','cyber_profile_change'].includes(kind) && key === 'profile_picture_path') {
        resolvedConfig = { ...config, bucket:'cyber-public-media', publicBucket:true, label:'Cyber Shop Profile Picture' };
      } else if (['cyber_application','cyber_profile_change'].includes(kind) && cyberVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket:'cyber-verification', publicBucket:false };
      } else if (kind === 'cyber_product' && key === 'cyber_product_image_path') {
        resolvedConfig = { ...config, bucket:'cyber-public-media', publicBucket:true, label:'Cyber Product Picture' };
      } else if (kind === 'pickup_station_application' && pickupStationVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket:'pickup-station-verification', publicBucket:false };
      } else if (['service_provider_application','service_provider_profile_change'].includes(kind) && key === 'profile_picture_path') {
        resolvedConfig = { ...config, bucket: 'service-provider-public-media', publicBucket: true, label: 'Customer Profile Picture' };
      } else if (['service_provider_application','service_provider_profile_change'].includes(kind) && key === 'passport_photo_path') {
        resolvedConfig = { ...config, bucket: 'service-provider-passport-photo', label: 'Passport-size Photo (Admin Only)' };
      } else if (['service_provider_application','service_provider_profile_change'].includes(kind) && providerVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket: 'service-provider-verification' };
      } else if (['transport_provider_application','transport_provider_profile_change'].includes(kind) && transportVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket: 'transport-verification' };
      } else if (kind === 'transport_vehicle' && key === 'vehicle_profile_picture_path') {
        resolvedConfig = { ...config, bucket: 'transport-public-media', publicBucket: true, label: 'Vehicle Profile Picture' };
      } else if (kind === 'transport_vehicle' && key === 'driver_passport_photo_path') {
        resolvedConfig = { ...config, bucket: 'transport-driver-private', label: 'Driver Passport Photo — Admin Only' };
      } else if (['accommodation_host','accommodation_provider_profile_change'].includes(kind) && key === 'profile_picture_path') {
        resolvedConfig = { ...config, bucket: 'accommodation-public-media', publicBucket: true, label: 'Accommodation Provider Profile Picture' };
      } else if (['accommodation_host','accommodation_provider_profile_change'].includes(kind) && ['passport_photo_path','business_id_document_path','business_licence_path','registration_certificate_path','other_permit_paths'].includes(key)) {
        resolvedConfig = { ...config, bucket: 'accommodation-verification', label: key==='passport_photo_path'?'Passport-size Photo — Admin Only':config.label };
      }
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
    if (entry.config.publicBucket) return db.storage.from(entry.config.bucket).getPublicUrl(entry.value).data.publicUrl;
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

  let approvalMediaRenderToken = 0;
  const approvalMediaPreview = async (payload = {}, kind = '') => {
    const renderToken = ++approvalMediaRenderToken;
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
      const card = await renderAdminMediaCard(entry);
      if (renderToken !== approvalMediaRenderToken || !grid?.isConnected) return;
      grid.appendChild(card);
    }
  };

  const openApproval = async (kind, id) => {
    const item = state.approvals.find((entry) => entry.kind === kind && String(entry.record_id) === String(id));
    if (!item) return;
    state.activeApproval = item;
    $('#reviewModalTitle').textContent = item.title;
    $('#reviewApplicant').innerHTML = `<strong>${escapeHtml(item.applicant_name || 'Customer')}</strong><p>${escapeHtml(item.applicant_email || '')}<br>${escapeHtml(item.subtitle || '')}${item.amount_kes == null ? '' : `<br><b>${formatMoney(item.amount_kes)}</b>`}</p>`;
    const mediaKeys = new Set(Object.keys(approvalMediaFields));
    const hiddenKeys = new Set(['id', 'user_id', 'withdrawal_pin_hash', ...mediaKeys]);
    const detailRows = Object.entries(item.payload || {}).filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== '' && typeof value !== 'object');
    const safeAdminLocationLink=(value)=>{
      try{
        const url=new URL(String(value||'').trim());
        if(!['http:','https:'].includes(url.protocol))return '';
        return url.href;
      }catch(_error){return '';}
    };
    $('#reviewDetails').innerHTML = detailRows.map(([key, value]) => {
      const label=escapeHtml(key.replaceAll('_', ' '));
      const display=typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
      if(['base_map_link','shop_map_link','waiting_point_map_link','map_link'].includes(key)){
        const href=safeAdminLocationLink(value);
        return `<div><small>${label}</small>${href?`<a class="admin-location-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">📍 Open pinned location in Google Maps ↗</a>`:`<b>${escapeHtml(display)}</b>`}</div>`;
      }
      return `<div><small>${label}</small><b>${escapeHtml(display)}</b></div>`;
    }).join('');
    $('#reviewNotes').value = '';
    setFormStatus($('#reviewStatus'));
    const underReview = $('[data-review-action="under_review"]');
    const requestChanges = $('[data-review-action="changes_requested"]');
    const reject = $('[data-review-action="reject"]');
    const approve = $('[data-review-action="approve"]');
    const awaitingCorrection = ['seller_application','seller_profile_change','seller_product','service_provider_application','service_provider_profile_change','service_listing','transport_provider_application','transport_provider_profile_change','transport_vehicle','pickup_station_application','accommodation_host','accommodation_provider_profile_change','premium_partner_profile_change','cyber_application','cyber_service','cyber_product','cyber_profile_change'].includes(kind) && item.status === 'changes_requested';
    const settlementAccountApproval = ['seller_settlement_account','service_provider_settlement_account','transport_provider_settlement_account'].includes(kind);
    underReview.hidden = ['premium_payment','partner_subscription_payment','premium_extra_acceptance_payment','wallet_deposit','wallet_withdrawal'].includes(kind) || awaitingCorrection || settlementAccountApproval;
    requestChanges.hidden = !['seller_application','seller_profile_change','seller_product','service_provider_application','service_provider_profile_change','service_listing','transport_provider_application','transport_provider_profile_change','transport_vehicle','pickup_station_application','accommodation_host','accommodation_provider_profile_change','premium_partner_profile_change','cyber_application','cyber_service','cyber_product','cyber_profile_change','premium_customer', 'premium_profile'].includes(kind) || awaitingCorrection || kind === 'customer_personal_sale' || settlementAccountApproval;
    reject.hidden = awaitingCorrection;
    approve.hidden = awaitingCorrection;
    $('#reviewNotesLabel').textContent = requestChanges.hidden ? 'Admin notes / reason' : 'Admin notes / correction request';
    approve.textContent = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'Mark Customer Called' : 'Approve';
    approve.dataset.reviewAction = kind === 'wallet_withdrawal' && item.status === 'pending_call' ? 'contacted' : 'approve';
    if (awaitingCorrection) {
      setFormStatus($('#reviewStatus'), 'Waiting for the partner to correct and resubmit this record. It remains in Approval Center for tracking.', 'info');
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
      const rpcName = ['partner_subscription_payment','premium_extra_acceptance_payment'].includes(item.kind)
        ? 'admin_review_partner_billing_payment'
        : item.kind === 'cyber_application'
        ? 'admin_review_cyber_provider'
        : item.kind === 'cyber_service'
          ? 'admin_review_cyber_service'
          : item.kind === 'cyber_product'
            ? 'admin_review_cyber_product'
            : item.kind === 'cyber_profile_change'
              ? 'admin_review_cyber_profile_change'
              : item.kind === 'seller_application'
                ? 'admin_review_seller_application'
                : item.kind === 'seller_product'
                  ? 'admin_review_seller_product'
                  : item.kind === 'customer_personal_sale'
                    ? 'admin_review_personal_sale'
                    : item.kind === 'service_provider_application'
                      ? 'admin_review_service_provider_application'
                      : item.kind === 'service_listing'
                        ? 'admin_review_service_listing'
                        : item.kind === 'transport_provider_application'
                          ? 'admin_review_transport_provider_application'
                          : item.kind === 'transport_vehicle'
                            ? 'admin_review_transport_vehicle'
                            : item.kind === 'pickup_station_application'
                              ? 'admin_review_pickup_station_application'
                              : item.kind === 'accommodation_unit'
                              ? 'admin_review_accommodation_unit'
                              : ['seller_profile_change','service_provider_profile_change','transport_provider_profile_change'].includes(item.kind)
                                ? 'admin_review_partner_profile_change'
                                : item.kind === 'accommodation_provider_profile_change'
                                  ? 'admin_review_accommodation_profile_change'
                                  : item.kind === 'premium_partner_profile_change'
                                    ? 'admin_review_premium_profile_change'
                                    : item.kind === 'seller_settlement_account'
                                      ? 'admin_review_seller_settlement_account'
                                      : item.kind === 'service_provider_settlement_account'
                                        ? 'admin_review_service_provider_settlement_account'
                                        : item.kind === 'transport_provider_settlement_account'
                                          ? 'admin_review_transport_provider_settlement_account'
                                          : 'admin_review_approval';
      const rpcArgs = ['partner_subscription_payment','premium_extra_acceptance_payment'].includes(item.kind)
        ? { p_payment_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : item.kind === 'cyber_application'
        ? { p_user_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : item.kind === 'cyber_service'
          ? { p_service_id: item.record_id, p_decision: decision, p_notes: notes || null }
          : item.kind === 'cyber_product'
            ? { p_product_id: item.record_id, p_decision: decision, p_notes: notes || null }
            : item.kind === 'cyber_profile_change'
              ? { p_change_id: item.record_id, p_decision: decision, p_notes: notes || null }
              : item.kind === 'pickup_station_application'
                ? { p_record_id: item.record_id, p_decision: decision, p_notes: notes || null, p_service_fee_percent: 0 }
                : ['seller_settlement_account','service_provider_settlement_account','transport_provider_settlement_account'].includes(item.kind)
                  ? { p_account_id: item.record_id, p_decision: decision, p_notes: notes || null }
                : ['seller_profile_change','service_provider_profile_change','transport_provider_profile_change','accommodation_provider_profile_change','premium_partner_profile_change'].includes(item.kind)
                  ? { p_change_id: item.record_id, p_decision: decision, p_notes: notes || null }
                  : item.kind === 'accommodation_unit'
                    ? { p_unit_id: item.record_id, p_decision: decision, p_notes: notes || null }
                    : ['seller_application','seller_product','customer_personal_sale','service_provider_application','service_listing','transport_provider_application','transport_vehicle','pickup_station_application'].includes(item.kind)
                      ? { p_record_id: item.record_id, p_decision: decision, p_notes: notes || null }
                      : { p_kind: item.kind, p_record_id: item.record_id, p_decision: decision, p_notes: notes || null };
      if(item.kind==='pickup_station_application'&&decision==='approve'){
        const raw=window.prompt('Set the Pickup Station service fee percentage for this station (0-100):','0');
        if(raw===null)return;
        const fee=Number(raw);
        if(!Number.isFinite(fee)||fee<0||fee>100){
          setFormStatus($('#reviewStatus'),'Enter a valid Pickup Station service fee between 0 and 100%.','error');
          return;
        }
        rpcArgs.p_service_fee_percent=fee;
      }
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
      const refreshers=[loadApprovals(),loadDashboard(),loadSellers(),loadServiceProviders(),loadCatalogue(),loadPremiumCustomers(),loadPremiumProfiles(),loadAccommodationSummary(),loadPickupStations()];
      if(isSuperAdmin()) refreshers.push(loadAuditLog());
      if(adminHas('settlements.read')) refreshers.push(loadSellerSettlements());
      await Promise.allSettled(refreshers);
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
    $('#admi…47308 tokens truncated…port',partner_name:item.provider_name,partner_email:item.provider_email}))
    ].sort((a,b)=>new Date(b.paid_at||0)-new Date(a.paid_at||0));
    const pendingRequests = partnerRequests.filter((request) => ['pending','under_review'].includes(request.status)).length;
    $('#adminSettlementPending').textContent = pending + pendingRequests;
    $('#adminSettlementApproved').textContent = approved;
    $('#adminSettlementCount').textContent = partnerSettlements.length;
    $('#adminSettlementTotal').textContent = formatMoney(partnerSettlements.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount_kes || 0), 0));
    $('#sidebarSettlementCount').textContent = pending + pendingRequests;

    renderManualSettlementPartners($('#adminSettlementSeller')?.value || '');

    $('#sellerSettlementRequestTableBody').innerHTML = partnerRequests.length ? partnerRequests.map((request) => {
      const accounts=request.partner_type==='seller'?state.sellerSettlementAccounts:request.partner_type==='transport'?state.transportSettlementAccounts:state.providerSettlementAccounts;
      const account=accounts.find((item)=>item.id===request.settlement_account_id);
      const open=['pending','under_review'].includes(request.status);
      const partnerLabel=request.partner_type==='seller'?'Seller':request.partner_type==='transport'?'Transport Provider':'Service Provider';
      return `<tr>
        <td><strong>${escapeHtml(request.partner_name||partnerLabel)}</strong><small>${escapeHtml(request.partner_email||'')}</small><small>${partnerLabel}</small></td>
        <td><strong>${formatMoney(request.requested_amount_kes)}</strong><small>${formatDate(request.submitted_at,true)}</small></td>
        <td>${account?'<strong>'+escapeHtml(account.account_name)+'</strong><small>'+escapeHtml(settlementDestination(account))+'</small>':'—'}</td>
        <td>${escapeHtml(request.partner_note||'—')}</td>
        <td><span class="status-chip">${escapeHtml(request.status.replaceAll('_',' '))}</span>${request.admin_notes?'<small>'+escapeHtml(request.admin_notes)+'</small>':''}</td>
        <td class="settlement-admin-actions">
          ${open?'<button data-request-review="under_review" data-request-kind="'+escapeHtml(request.partner_type)+'" data-request-id="'+escapeHtml(request.id)+'">Under Review</button><button class="danger" data-request-review="reject" data-request-kind="'+escapeHtml(request.partner_type)+'" data-request-id="'+escapeHtml(request.id)+'">Reject</button><button data-request-pay="'+escapeHtml(request.id)+'" data-request-kind="'+escapeHtml(request.partner_type)+'">Pay & Record</button>':''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6">No Partner settlement requests yet.</td></tr>';

    $('#sellerSettlementAccountTableBody').innerHTML = partnerAccounts.length ? partnerAccounts.map((account) => {
      const canReview = account.status === 'pending_review';
      const canDisable = account.status === 'approved';
      const isSeller = account.partner_type === 'seller';
      const partnerLabel = isSeller ? 'Seller' : account.partner_type==='transport' ? 'Transport Provider' : 'Service Provider';
      return `<tr>
        <td><strong>${escapeHtml(account.partner_name || partnerLabel)}</strong><small>${escapeHtml(account.partner_email || '')}</small><small>${partnerLabel}</small></td>
        <td><strong>${escapeHtml(account.account_name)}</strong><small>${escapeHtml(account.account_type.replaceAll('_',' '))} · ${escapeHtml(settlementDestination(account))}${account.is_primary ? ' · PRIMARY' : ''}</small></td>
        <td><span class="status-chip">${escapeHtml(account.status.replaceAll('_',' '))}</span></td>
        <td>${formatDate(account.submitted_at, true)}</td>
        <td>${escapeHtml(account.admin_notes || '—')}</td>
        <td class="settlement-admin-actions">
          ${canReview ? '<button data-settlement-review="approve" data-settlement-kind="'+escapeHtml(account.partner_type)+'" data-settlement-account="'+escapeHtml(account.id)+'">Approve</button><button class="danger" data-settlement-review="reject" data-settlement-kind="'+escapeHtml(account.partner_type)+'" data-settlement-account="'+escapeHtml(account.id)+'">Reject</button>' : ''}
          ${canDisable ? '<button class="danger" data-settlement-review="disable" data-settlement-kind="'+escapeHtml(account.partner_type)+'" data-settlement-account="'+escapeHtml(account.id)+'">Disable</button>' : ''}
          ${canDisable ? '<button data-settle-partner="'+escapeHtml(account.partner_id)+'" data-settle-partner-type="'+escapeHtml(account.partner_type)+'" data-settle-account="'+escapeHtml(account.id)+'">Settle</button>' : ''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6">No Partner settlement accounts yet.</td></tr>';

    $('#sellerSettlementHistoryBody').innerHTML = partnerSettlements.length ? partnerSettlements.map((item) => `<tr>
      <td>${formatDate(item.paid_at, true)}</td><td><strong>${escapeHtml(item.partner_name || (item.partner_type==='seller'?'Seller':item.partner_type==='transport'?'Transport Provider':'Service Provider'))}</strong><small>${escapeHtml(item.partner_email || '')} · ${item.partner_type==='seller'?'Seller':item.partner_type==='transport'?'Transport Provider':'Service Provider'}</small></td>
      <td><strong>${formatMoney(item.amount_kes)}</strong></td><td>${escapeHtml(item.settlement_reference)}</td><td><span class="status-chip">${escapeHtml(item.status)}</span></td>
    </tr>`).join('') : '<tr><td colspan="5">No Partner settlements recorded yet.</td></tr>';

    $$('[data-request-review]').forEach((button)=>button.addEventListener('click',async()=>{
      const decision=button.dataset.requestReview;
      let notes='';
      if(decision==='reject'){
        notes=window.prompt('Reason for rejecting this settlement request:','')||'';
        if(notes.trim().length<3){globalStatus('A clear rejection reason is required.','error');return;}
      }
      await withButtonLock(button,'Saving…',async()=>{
        const rpcName=button.dataset.requestKind==='service_provider'
          ? 'admin_review_service_provider_settlement_request'
          : button.dataset.requestKind==='transport'
            ? 'admin_review_transport_provider_settlement_request'
            : 'admin_review_seller_settlement_request';
        const {error}=await db.rpc(rpcName,{p_request_id:button.dataset.requestId,p_decision:decision,p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadSellerSettlements(),loadAuditLog()]);
        globalStatus(decision==='reject'?'Settlement request rejected.':'Settlement request marked under review.');
      });
    }));
    $$('[data-request-pay]').forEach((button)=>button.addEventListener('click',async()=>{
      const kind=button.dataset.requestKind||'seller';
      const source=kind==='service_provider'?state.providerSettlementRequests:kind==='transport'?state.transportSettlementRequests:state.sellerSettlementRequests;
      const request=source.find((item)=>item.id===button.dataset.requestPay);
      if(!request)return;
      const partnerLabel=kind==='service_provider'?'Service Provider':kind==='transport'?'Transport Provider':'Seller';
      const reference=window.prompt('Enter the actual M-Pesa / bank transaction reference after sending '+formatMoney(request.requested_amount_kes)+':','')||'';
      if(reference.trim().length<3){globalStatus('A payment reference is required before marking the request paid.','error');return;}
      const notes=window.prompt('Settlement note (optional):','')||'';
      if(!window.confirm('Confirm the money has already been sent to the approved '+partnerLabel+' settlement account?'))return;
      await withButtonLock(button,'Recording…',async()=>{
        const rpcName=kind==='service_provider'?'admin_pay_service_provider_settlement_request':kind==='transport'?'admin_pay_transport_provider_settlement_request':'admin_pay_seller_settlement_request';
        const {error}=await db.rpc(rpcName,{p_request_id:request.id,p_reference:reference.trim(),p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.allSettled([loadSellerSettlements(),loadAuditLog()]);
        globalStatus(partnerLabel+' settlement request paid and recorded.');
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
        const rpcName=button.dataset.settlementKind==='service_provider'
          ? 'admin_review_service_provider_settlement_account'
          : button.dataset.settlementKind==='transport'
            ? 'admin_review_transport_provider_settlement_account'
            : 'admin_review_seller_settlement_account';
        const {error}=await db.rpc(rpcName,{p_account_id:button.dataset.settlementAccount,p_decision:decision,p_notes:notes||null});
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadSellerSettlements(),loadAuditLog()]);
        globalStatus(decision==='approve'?'Settlement account approved.':decision==='reject'?'Settlement account rejected.':'Settlement account disabled.');
      });
    }));
    $$('[data-settle-partner]').forEach((button) => button.addEventListener('click', () => {
      changeView('settlements');
      $('#adminSettlementPartnerType').value = button.dataset.settlePartnerType || 'seller';
      renderManualSettlementPartners(button.dataset.settlePartner);
      $('#adminSettlementSeller').value = button.dataset.settlePartner;
      renderSellerSettlementAccountOptions();
      $('#adminSettlementAccount').value = button.dataset.settleAccount;
      $('#adminSettlementAmount').focus();
      $('#adminSellerSettlementForm').scrollIntoView({behavior:'smooth',block:'center'});
    }));
  };
  const recordSellerSettlement = async (event) => {
    event.preventDefault();
    const partnerType = $('#adminSettlementPartnerType').value;
    const partnerId = $('#adminSettlementSeller').value;
    const accountId = $('#adminSettlementAccount').value;
    const amount = Number($('#adminSettlementAmount').value);
    const reference = $('#adminSettlementReference').value.trim();
    const label = partnerType === 'seller' ? 'Seller' : partnerType === 'service_provider' ? 'Service Provider' : 'Transport Provider';
    if (!partnerId || !accountId || !amount || amount <= 0 || reference.length < 3) {
      setFormStatus($('#adminSettlementStatus'),'Choose a Partner, approved settlement account, amount and payment reference.','error');
      return;
    }
    if (!window.confirm(`Confirm that KSh ${amount.toLocaleString('en-KE')} has already been sent to this approved ${label} settlement account? This does not require a Partner payout request.`)) return;
    const button = $('#adminSellerSettlementForm button[type="submit"]');
    await withButtonLock(button,'Recording…',async()=>{
      const rpcName = partnerType === 'seller'
        ? 'admin_record_seller_settlement'
        : partnerType === 'service_provider'
          ? 'admin_record_service_provider_settlement'
          : 'admin_record_transport_provider_settlement';
      const args = partnerType === 'seller'
        ? {p_seller_id:partnerId,p_account_id:accountId,p_amount_kes:amount,p_reference:reference,p_notes:$('#adminSettlementNotes').value.trim()||null}
        : {p_provider_id:partnerId,p_account_id:accountId,p_amount_kes:amount,p_reference:reference,p_notes:$('#adminSettlementNotes').value.trim()||null};
      const {error}=await db.rpc(rpcName,args);
      if(error){setFormStatus($('#adminSettlementStatus'),friendlyError(error),'error');return;}
      event.target.reset();
      $('#adminSettlementPartnerType').value=partnerType;
      renderManualSettlementPartners();
      setFormStatus($('#adminSettlementStatus'),'Settlement recorded successfully. The '+label+' has been notified.','success');
      await Promise.all([loadSellerSettlements(),loadAuditLog()]);
      globalStatus(label+' settlement recorded.');
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

  const accommodationAdminPdfSafe = (value='') => String(value ?? '')
    .replace(/[–—]/g,'-')
    .replace(/[‘’]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/[^\x20-\x7E\n]/g,' ');

  const accommodationAdminPdfDate = (value,withTime=false) => {
    if(!value)return '—';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    return new Intl.DateTimeFormat('en-KE',{
      timeZone:'Africa/Nairobi',
      year:'numeric',month:'short',day:'2-digit',
      ...(withTime?{hour:'2-digit',minute:'2-digit'}:{})
    }).format(date);
  };

  const accommodationAdminPdfLine = (doc,label,value,y) => {
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(65);
    doc.text(accommodationAdminPdfSafe(label),14,y);
    doc.setFont('helvetica','normal');
    doc.setTextColor(25);
    const lines=doc.splitTextToSize(accommodationAdminPdfSafe(value||'—'),138);
    doc.text(lines,58,y);
    return y+Math.max(6,lines.length*5);
  };

  const downloadAdminAccommodationGuestPdf = (item) => {
    const Pdf=window.jspdf?.jsPDF;
    if(!Pdf){
      globalStatus('PDF generator could not load. Refresh the Admin page and try again.','error');
      return;
    }

    const doc=new Pdf({orientation:'portrait',unit:'mm',format:'a4'});
    doc.setProperties({
      title:'Accommodation Guest Details - '+(item.booking_reference||'Booking'),
      subject:'LEOGO Admin accommodation guest booking details',
      author:'LEOGO DIGITAL MARKET'
    });

    doc.setFillColor(7,27,61);
    doc.rect(0,0,210,34,'F');
    doc.setTextColor(255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(17);
    doc.text('LEOGO DIGITAL MARKET',14,13);
    doc.setFontSize(11);
    doc.text('Admin - Accommodation Guest Booking Details',14,22);
    doc.setFontSize(9);
    doc.text(accommodationAdminPdfSafe(item.booking_reference||''),196,22,{align:'right'});

    let y=44;
    const fields=[
      ['Booking reference',item.booking_reference],
      ['Booking status',String(item.booking_status||'').replaceAll('_',' ')],
      ['Guest name',item.guest_name],
      ['Guest phone',item.guest_phone],
      ['Accommodation Provider',item.provider_name],
      ['Property',item.property_name],
      ['Room',String(item.room_category||'Room')+' - '+String(item.room_name||'')],
      ['Rate plan',item.rate_name],
      ['Check-in',accommodationAdminPdfDate(item.check_in)],
      ['Check-out',accommodationAdminPdfDate(item.check_out)],
      ['Stay',Number(item.nights||0)+' night(s) - '+Number(item.guests||0)+' guest(s)'],
      ['Nightly rate',formatMoney(item.nightly_price_kes)],
      ['Hotel booking amount',formatMoney(item.hotel_booking_amount_kes ?? item.total_amount_kes)],
      ['Hotel commission ('+Number(item.hotel_commission_percent||0)+'%)',formatMoney(item.hotel_commission_kes||0)],
      ['Hotel net amount',formatMoney(item.hotel_net_amount_kes ?? item.hotel_booking_amount_kes ?? item.total_amount_kes)],
      ['Customer service fee ('+Number(item.customer_service_fee_percent||0)+'%)',formatMoney(item.customer_service_fee_kes||0)],
      ['Customer total',formatMoney(item.customer_total_kes ?? item.total_amount_kes)],
      ['LEOGO gross earning',formatMoney(item.leogo_revenue_kes||0)],
      ['Booking received',accommodationAdminPdfDate(item.created_at,true)]
    ];
    fields.forEach(([label,value])=>{y=accommodationAdminPdfLine(doc,label,value,y);});

    const addSection=(title,value)=>{
      if(y>250){doc.addPage();y=20;}
      y+=3;
      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
      doc.setTextColor(7,27,61);
      doc.text(title,14,y);
      y+=6;
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(40);
      const lines=doc.splitTextToSize(accommodationAdminPdfSafe(value||'—'),180);
      doc.text(lines,14,y);
      y+=Math.max(8,lines.length*5);
    };

    addSection('Guest special request',item.special_requests||'No special request provided.');
    addSection('Property response',item.host_response||'No property response recorded yet.');

    const pages=doc.getNumberOfPages();
    for(let page=1;page<=pages;page++){
      doc.setPage(page);
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text('Private Admin booking record - LEOGO DIGITAL MARKET',14,292);
      doc.text('Page '+page+' of '+pages,196,292,{align:'right'});
    }

    const safeRef=String(item.booking_reference||'booking').replace(/[^a-zA-Z0-9-]+/g,'-');
    doc.save('leogo-admin-guest-'+safeRef+'.pdf');
    globalStatus('Guest booking PDF downloaded.');
  };

  const renderAccommodationBookings = () => {
    const target=$('#adminAccommodationBookingBody');
    if(!target)return;
    const rows=state.accommodationBookings||[];
    target.innerHTML=rows.length?rows.map((item)=>`
      <tr class="${item.booking_status==='pending_host'?'attention-row':''}">
        <td data-label="Booking"><strong>${escapeHtml(item.booking_reference||'Booking')}</strong><small>${formatDate(item.created_at,true)}</small></td>
        <td data-label="Provider / Property"><strong>${escapeHtml(item.provider_name||'Accommodation Provider')}</strong><small>${escapeHtml(item.property_name||'Property')}</small></td>
        <td data-label="Guest"><strong>${escapeHtml(item.guest_name||'—')}</strong><small>${escapeHtml(item.guest_phone||'—')}</small></td>
        <td data-label="Stay"><strong>${escapeHtml(String(item.check_in||'—'))} → ${escapeHtml(String(item.check_out||'—'))}</strong><small>${Number(item.nights||0)} night(s) · ${Number(item.guests||0)} guest(s)</small></td>
        <td data-label="Room / Rate"><strong>${escapeHtml(item.room_category||'Room')} · ${escapeHtml(item.room_name||'Room')}</strong><small>${escapeHtml(item.rate_name||'Room rate')}</small></td>
        <td data-label="Financials"><strong>Customer: ${formatMoney(item.customer_total_kes ?? item.total_amount_kes)}</strong><small>Hotel base ${formatMoney(item.hotel_booking_amount_kes ?? item.total_amount_kes)} · Hotel commission ${Number(item.hotel_commission_percent||0)}% = ${formatMoney(item.hotel_commission_kes||0)} · Service fee ${Number(item.customer_service_fee_percent||0)}% = ${formatMoney(item.customer_service_fee_kes||0)} · LEOGO ${formatMoney(item.leogo_revenue_kes||0)} · Hotel net ${formatMoney(item.hotel_net_amount_kes ?? item.hotel_booking_amount_kes ?? item.total_amount_kes)}</small></td>
        <td data-label="Status"><span class="status-chip">${escapeHtml(String(item.booking_status||'').replaceAll('_',' '))}</span>${item.host_response?`<small>${escapeHtml(item.host_response)}</small>`:''}</td>
        <td data-label="Action"><button type="button" class="accommodation-admin-pdf-button" data-admin-accommodation-guest-pdf="${escapeHtml(item.id)}">Download Guest PDF</button></td>
      </tr>`).join(''):'<tr><td colspan="8">No Accommodation bookings yet.</td></tr>';
    Array.from(target.querySelectorAll('[data-admin-accommodation-guest-pdf]')).forEach((button)=>button.addEventListener('click',()=>{
      const item=state.accommodationBookings.find((row)=>String(row.id)===String(button.dataset.adminAccommodationGuestPdf));
      if(item)downloadAdminAccommodationGuestPdf(item);
    }));
  };

  const renderAccommodationProviders = () => {
    const target=$('#accommodationProviderTableBody');
    if(!target)return;
    const rows=state.accommodationProviders||[];
    target.innerHTML=rows.length?rows.map((item)=>`
      <tr>
        <td data-label="Provider"><strong>${escapeHtml(item.business_name||'Accommodation Provider')}</strong><small>${escapeHtml(item.owner_name||'')}</small></td>
        <td data-label="Contact"><strong>${escapeHtml(item.phone||'—')}</strong><small>${escapeHtml(item.email||'')}</small></td>
        <td data-label="Location"><strong>${escapeHtml([item.town,item.sub_county,item.county].filter(Boolean).join(' · ')||'—')}</strong><small>${escapeHtml(item.location_details||'')}</small></td>
        <td data-label="Status"><span class="status-chip">${escapeHtml(String(item.verification_status||'').replaceAll('_',' '))}</span></td>
        <td data-label="Properties"><strong>${Number(item.property_count||0)}</strong></td>
        <td data-label="Bookings"><strong>${Number(item.booking_count||0)}</strong></td>
        <td data-label="Action"><div class="partner-record-actions">
          <button type="button" data-view-accommodation-provider="${escapeHtml(item.id)}">View Details</button>
          ${item.verification_status==='approved'
            ? '<button type="button" class="danger" data-accommodation-provider-suspend="true" data-accommodation-host-id="'+escapeHtml(item.id)+'">Suspend Account</button>'
            : item.verification_status==='suspended'
              ? '<button type="button" data-accommodation-provider-suspend="false" data-accommodation-host-id="'+escapeHtml(item.id)+'">Reactivate</button>'
              : '<button type="button" data-open-accommodation-approval="'+escapeHtml(item.id)+'">Open Approval</button>'}
        </div></td>
      </tr>`).join(''):'<tr><td colspan="7">No Accommodation Providers registered yet.</td></tr>';

    Array.from(target.querySelectorAll('[data-view-accommodation-provider]')).forEach((button)=>button.addEventListener('click',()=>openAccommodationProviderRecord(button.dataset.viewAccommodationProvider)));
    Array.from(target.querySelectorAll('[data-accommodation-provider-suspend]')).forEach((button)=>button.addEventListener('click',()=>setAccommodationProviderSuspended(button,button.dataset.accommodationHostId,button.dataset.accommodationProviderSuspend==='true')));
    Array.from(target.querySelectorAll('[data-open-accommodation-approval]')).forEach((button)=>button.addEventListener('click',()=>{
      changeView('approvals');
      state.approvalFilter='accommodation';
      renderApprovals();
      const row=state.approvals.find((entry)=>entry.kind==='accommodation_host'&&String(entry.record_id)===String(button.dataset.openAccommodationApproval));
      if(row)openApproval('accommodation_host',row.record_id);
    }));
  };

  const openAccommodationProviderRecord = async (hostId) => {
    const item=(state.accommodationProviders||[]).find((row)=>String(row.id)===String(hostId));
    if(!item||!openPartnerRecordShell('ACCOMMODATION PROVIDER RECORD',item.business_name||'Accommodation Provider'))return;
    $('#partnerRecordGrid').innerHTML=partnerRecordGridHtml([
      ['Business / Operator',item.business_name],['Owner / Manager',item.owner_name],['Email',item.email],['Phone',item.phone],
      ['ID Number',item.id_number],['County',item.county],['Sub-County',item.sub_county],['Town / Area',item.town],
      ['Business / Operating Location',item.location_details],['Latitude',item.base_latitude],['Longitude',item.base_longitude],
      ['Application Status',String(item.verification_status||'').replaceAll('_',' ')],['Submitted',formatDate(item.submitted_at,true)],
      ['Approved',formatDate(item.approved_at,true)],['Admin Notes',item.admin_notes],['Business Description',item.business_description],
      ['Properties',Number(item.property_count||0)],['Bookings',Number(item.booking_count||0)]
    ]);
    await renderPartnerRecordMedia(item,'accommodation_host');
    const mapLink=(()=>{try{const value=String(item.base_map_link||'').trim();if(!value)return '';const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}})();
    $('#partnerRecordRelated').innerHTML=
      '<div class="review-media-heading"><span>ACCOMMODATION ACCOUNT</span><strong>Post-approval control</strong><small>This provider record remains available after approval. Suspension hides the provider\'s published accommodation from customers without deleting history.</small></div>'+
      (mapLink?'<a class="admin-location-link" href="'+escapeHtml(mapLink)+'" target="_blank" rel="noopener noreferrer">📍 Open Accommodation location in Google Maps ↗</a>':'');
  };

  const setAccommodationProviderSuspended = async (button,hostId,suspended) => {
    const notes=window.prompt((suspended?'Reason / note for suspension':'Optional reactivation note')+':','')||'';
    if(suspended&&!window.confirm('Suspend this Accommodation Provider account? Published properties will immediately be hidden from customers.'))return;
    await withButtonLock(button,suspended?'Suspending…':'Reactivating…',async()=>{
      const {error}=await db.rpc('admin_set_accommodation_provider_status',{p_host_id:hostId,p_suspended:suspended,p_notes:notes||null});
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadAccommodationSummary(),loadApprovals(),loadDashboard(),loadAuditLog().catch(()=>{})]);
      globalStatus(suspended?'Accommodation Provider suspended and customer listings hidden.':'Accommodation Provider reactivated.');
    });
  };

  const loadAccommodationSummary = async () => {
    const [summaryResult,providersResult,bookingsResult] = await Promise.all([
      db.rpc('admin_accommodation_summary'),
      db.rpc('admin_list_accommodation_providers'),
      db.rpc('admin_list_accommodation_bookings')
    ]);
    if(summaryResult.error)throw summaryResult.error;
    if(providersResult.error)throw providersResult.error;
    if(bookingsResult.error)throw bookingsResult.error;
    const summary=summaryResult.data||{};
    state.accommodationProviders=Array.isArray(providersResult.data)?providersResult.data:[];
    state.accommodationBookings=Array.isArray(bookingsResult.data)?bookingsResult.data:[];
    $('#accommodationHostCount').textContent=Number(summary.hosts||0);
    $('#accommodationPropertyCount').textContent=Number(summary.properties||0);
    $('#accommodationBookingCount').textContent=Number(summary.bookings||0);
    renderAccommodationProviders();
    renderAccommodationBookings();
    renderAdminNotifications();
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

  const reportDefinitions = {
    orders:{group:'Commerce',title:'Orders',description:'Customer orders, payment status, fees and fulfilment totals.',columns:[['date','Date','date'],['reference','Order'],['customer','Customer'],['payment_status','Payment'],['status','Order status'],['items_subtotal_kes','Items','money'],['service_fee_kes','Service fee','money'],['delivery_fee_kes','Delivery fee','money'],['pickup_fee_kes','Pickup fee','money'],['total_kes','Total','money']]},
    sales_revenue:{group:'Finance',title:'Sales & Revenue',description:'Gross trading value and recognised LEOGO revenue by source. Wallet balances are excluded.',columns:[['date','Date','date'],['source','Source'],['reference','Reference'],['status','Status'],['gross_kes','Gross value','money'],['leogo_revenue_kes','LEOGO revenue','money'],['basis','Revenue basis']]},
    customers:{group:'People',title:'Customers',description:'Registered customer profiles and locations.',columns:[['date','Registered','date'],['customer','Customer'],['phone','Phone'],['location','Location'],['status','Status']]},
    products:{group:'Commerce',title:'Products',description:'Seller catalogue, pricing, stock and approval status.',columns:[['date','Created','date'],['product','Product'],['seller','Seller'],['category','Category'],['price_kes','Price','money'],['quantity','Stock','number'],['availability','Availability'],['status','Approval']]},
    sellers:{group:'Partners',title:'Sellers',description:'Seller businesses, locations and application status.',columns:[['date','Registered','date'],['business','Business'],['owner','Owner'],['phone','Phone'],['location','Location'],['status','Status'],['approved_at','Approved','date']]},
    service_providers:{group:'Partners',title:'Service Providers',description:'Provider accounts, categories, locations and availability.',columns:[['date','Registered','date'],['business','Business'],['owner','Owner'],['phone','Phone'],['category','Category'],['location','Location'],['availability','Availability'],['status','Status']]},
    service_requests:{group:'Operations',title:'Service Requests',description:'Customer service requests, quotations, fees and job progress.',columns:[['date','Created','date'],['reference','Reference'],['provider','Provider'],['type','Type'],['location','Location'],['payment_status','Payment'],['status','Status'],['quotation_fee_kes','Quotation fee','money'],['direct_fee_kes','Direct fee','money'],['provider_quote_kes','Provider quote','money'],['provider_labour_kes','Labour','money']]},
    transport:{group:'Operations',title:'Transport & Parcel',description:'Transport requests, routes, quotations, LEOGO fees and partner net.',columns:[['date','Created','date'],['reference','Reference'],['service_type','Service'],['provider','Provider'],['route','Route'],['status','Status'],['provider_quote_kes','Provider quote','money'],['customer_total_kes','Customer total','money'],['leogo_commission_kes','Commission','money'],['service_fee_kes','Service fee','money'],['partner_net_kes','Partner net','money']]},
    deliveries:{group:'Operations',title:'Deliveries',description:'Marketplace delivery jobs, riders and fulfilment milestones.',columns:[['date','Created / assigned','date'],['reference','Order'],['customer','Customer'],['rider_id','Rider ID'],['destination','Destination'],['status','Status'],['picked_up_at','Picked up','date'],['delivered_at','Delivered','date']]},
    pickup_stations:{group:'Operations',title:'Pickup Stations',description:'Station locations, charges, parcel activity and partner earnings.',columns:[['date','Created','date'],['station','Station'],['location','Location'],['contact','Contact'],['service_fee_percent','Service fee','percent'],['shipping_fee_kes','Shipping fee','money'],['parcels','Parcels','number'],['earnings_kes','Earnings','money'],['status','Status']]},
    wallet:{group:'Wallet / SACCO',title:'Wallet Overview',description:'Customer wallet accounts and confirmed funds. These values are not LEOGO revenue.',wallet:true,columns:[['date','Opened','date'],['customer','Customer'],['phone','Phone'],['status','Status'],['confirmed_balance_kes','Balance','money'],['deposits_kes','Confirmed deposits','money'],['withdrawals_kes','Completed withdrawals','money']]},
    deposits:{group:'Wallet / SACCO',title:'Deposits',description:'Wallet and savings deposit requests. Deposited funds are not LEOGO revenue.',wallet:true,columns:[['date','Submitted','date'],['customer','Customer'],['kind','Kind'],['amount_kes','Amount','money'],['reference','Payment reference'],['status','Status'],['reviewed_at','Reviewed','date']]},
    withdrawals:{group:'Wallet / SACCO',title:'Withdrawals',description:'Customer withdrawal requests and settlement progress. These are not expenses or revenue.',wallet:true,columns:[['date','Submitted','date'],['customer','Customer'],['amount_kes','Amount','money'],['method','Method'],['account','Destination'],['status','Status'],['settlement_reference','Settlement reference'],['completed_at','Completed','date']]},
    savings:{group:'Wallet / SACCO',title:'Savings Challenges',description:'Customer savings commitments and targets. Savings balances are not LEOGO revenue.',wallet:true,columns:[['date','Created','date'],['customer','Customer'],['daily_amount_kes','Daily amount','money'],['period_days','Days','number'],['target_kes','Target','money'],['start_date','Start','date'],['end_date','End','date'],['status','Status']]},
    loans:{group:'Wallet / SACCO',title:'Loan Applications',description:'Loan requests and eligibility snapshots; customer balances remain separate from revenue.',wallet:true,columns:[['date','Submitted','date'],['customer','Customer'],['amount_kes','Requested','money'],['purpose','Purpose'],['wallet_balance_kes','Wallet balance','money'],['saved_kes','Saved','money'],['saving_days','Saving days','number'],['status','Status'],['reviewed_at','Reviewed','date']]},
    premium:{group:'Programs',title:'Premium',description:'Membership payments, plan periods and current membership status.',columns:[['date','Submitted','date'],['customer','Customer'],['plan','Plan'],['amount_kes','Amount','money'],['duration_hours','Hours','number'],['reference','Reference'],['status','Payment status'],['membership_status','Membership'],['ends_at','Ends','date']]},
    accommodation:{group:'Programs',title:'Accommodation',description:'Bookings with customer total, hotel net and recognised LEOGO revenue.',columns:[['date','Created','date'],['reference','Booking'],['guest','Guest'],['property','Property'],['unit','Room / unit'],['stay','Stay'],['status','Status'],['customer_total_kes','Customer total','money'],['hotel_commission_kes','Hotel commission','money'],['service_fee_kes','Service fee','money'],['leogo_revenue_kes','LEOGO revenue','money'],['hotel_net_kes','Hotel net','money']]},
    cyber:{group:'Programs',title:'Cyber Services',description:'Cyber service and shop orders, payments and fulfilment.',columns:[['date','Created','date'],['reference','Order'],['item_type','Type'],['item','Item'],['quantity','Qty','number'],['fulfilment','Fulfilment'],['payment_status','Payment'],['status','Status'],['subtotal_kes','Subtotal','money'],['delivery_fee_kes','Delivery fee','money'],['total_kes','Total','money']]},
    payments:{group:'Finance',title:'Payments',description:'Customer payment records across marketplace, Premium, accommodation and cyber modules.',columns:[['date','Date','date'],['module','Module'],['reference','Reference'],['party','Customer / item'],['amount_kes','Amount','money'],['method','Method'],['status','Status']]},
    settlements:{group:'Finance',title:'Partner Settlements',description:'Seller, service provider, transport and Pickup Station settlement requests and completed payouts.',columns:[['date','Created','date'],['partner_type','Partner type'],['partner','Partner'],['amount_kes','Amount','money'],['reference','Reference'],['status','Status'],['paid_at','Paid','date']]},
    loyalty:{group:'Programs',title:'Loyalty & Points',description:'Shopping reward credits, eligible spend and reward rates.',columns:[['date','Credited','date'],['customer','Customer'],['reference','Order'],['eligible_subtotal_kes','Eligible spend','money'],['reward_rate','Reward rate','percent'],['reward_amount_kes','Reward','money'],['status','Status']]},
    approvals:{group:'Governance',title:'Approvals',description:'Seller, provider, wallet deposit and loan approval activity.',columns:[['date','Submitted','date'],['type','Type'],['applicant','Applicant'],['phone','Phone'],['amount_or_detail','Amount / detail'],['status','Status']]},
    admin_activity:{group:'Governance',title:'Admin Activity',description:'Immutable administrative action history for oversight and audit.',columns:[['date','Date','date'],['admin','Admin'],['action','Action'],['entity_type','Entity'],['reference','Reference'],['status','State']]},
    advertisements:{group:'Governance',title:'Advertisements',description:'Advertisement schedule, publication state and website pop-up use.',columns:[['date','Created','date'],['title','Title'],['starts_at','Starts','date'],['ends_at','Ends','date'],['published_at','Published','date'],['popup','Website pop-up','boolean'],['status','Status']]}
  };
  const reportRowId = (row) => String(row.id || row.reference || JSON.stringify(row));
  const reportCell = (value,type,exporting=false) => {
    if(value===null||value===undefined||value==='') return exporting ? '' : '—';
    if(type==='money') return exporting ? Number(value||0) : formatMoney(value);
    if(type==='date') return formatDate(value,true);
    if(type==='percent') return `${Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2})}%`;
    if(type==='boolean') return value ? 'Yes' : 'No';
    if(type==='number') return Number(value||0).toLocaleString('en-KE');
    return String(value).replaceAll('_',' ');
  };
  const reportPeriodLabel = () => `${$('#reportFrom')?.value||'—'} to ${$('#reportTo')?.value||'—'}`;
  const renderReportCatalogue = () => {
    const search=String($('#reportCatalogueSearch')?.value||'').trim().toLowerCase();
    const groups={};
    Object.entries(reportDefinitions).forEach(([code,definition])=>{if(search&&!`${definition.title} ${definition.group}`.toLowerCase().includes(search))return;(groups[definition.group] ||= []).push([code,definition]);});
    $('#reportCatalogue').innerHTML=Object.entries(groups).map(([group,items])=>`<div class="report-catalogue-group"><strong>${escapeHtml(group)}</strong>${items.map(([code,item])=>`<button type="button" data-report-code="${escapeHtml(code)}" class="${code===state.reportCode?'active':''}">${escapeHtml(item.title)}</button>`).join('')}</div>`).join('')||'<small>No reports match.</small>';
    $$('[data-report-code]',$('#reportCatalogue')).forEach(button=>button.addEventListener('click',()=>selectReport(button.dataset.reportCode)));
  };
  const renderReportSummary = () => {
    const definition=reportDefinitions[state.reportCode];
    const moneyColumns=definition.columns.filter(([, ,type])=>type==='money').slice(0,3);
    const cards=[['Records',state.reportRows.length.toLocaleString('en-KE')],...moneyColumns.map(([key,label])=>[label,formatMoney(state.reportRows.reduce((sum,row)=>sum+Number(row[key]||0),0))])];
    $('#reportSummary').innerHTML=cards.map(([label,value])=>`<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`).join('');
  };
  const renderReport = () => {
    const definition=reportDefinitions[state.reportCode], pageSize=state.reportPageSize, pageCount=Math.max(1,Math.ceil(state.reportRows.length/pageSize));
    state.reportPage=Math.min(Math.max(1,state.reportPage),pageCount);
    const start=(state.reportPage-1)*pageSize, rows=state.reportRows.slice(start,start+pageSize);
    $('#reportTable thead').innerHTML=`<tr><th><input id="reportPageCheckbox" type="checkbox" aria-label="Select visible rows"></th>${definition.columns.map(([,label])=>`<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
    $('#reportTable tbody').innerHTML=rows.length?rows.map(row=>`<tr><td><input type="checkbox" data-report-row="${escapeHtml(reportRowId(row))}" ${state.reportSelected.has(reportRowId(row))?'checked':''}></td>${definition.columns.map(([key,,type])=>`<td data-label="${escapeHtml(key)}">${escapeHtml(reportCell(row[key],type))}</td>`).join('')}</tr>`).join(''):`<tr><td class="report-empty" colspan="${definition.columns.length+1}">No records match this report and filter period.</td></tr>`;
    $('#reportRecordCount').textContent=`${state.reportRows.length.toLocaleString('en-KE')} record${state.reportRows.length===1?'':'s'}`;
    $('#reportSelectionCount').textContent=`${state.reportSelected.size.toLocaleString('en-KE')} selected`;
    $('#reportPageLabel').textContent=`Page ${state.reportPage} of ${pageCount}`;
    $('#reportPreviousPage').disabled=state.reportPage<=1;$('#reportNextPage').disabled=state.reportPage>=pageCount;
    const pageCheckbox=$('#reportPageCheckbox');if(pageCheckbox)pageCheckbox.checked=rows.length>0&&rows.every(row=>state.reportSelected.has(reportRowId(row)));
    $$('[data-report-row]',$('#reportTable')).forEach(input=>input.addEventListener('change',()=>{input.checked?state.reportSelected.add(input.dataset.reportRow):state.reportSelected.delete(input.dataset.reportRow);renderReport();}));
    pageCheckbox?.addEventListener('change',()=>{rows.forEach(row=>pageCheckbox.checked?state.reportSelected.add(reportRowId(row)):state.reportSelected.delete(reportRowId(row)));renderReport();});
    renderReportSummary();
  };
  const updateReportStatusOptions = () => {
    const select=$('#reportStatus'), current=select.value;
    const remembered=new Set(state.reportStatuses[state.reportCode]||[]);
    state.reportRows.forEach(row=>{if(row.status)remembered.add(String(row.status));});
    state.reportStatuses[state.reportCode]=[...remembered].sort();
    select.innerHTML='<option value="">All statuses</option>'+state.reportStatuses[state.reportCode].map(status=>`<option value="${escapeHtml(status)}">${escapeHtml(status.replaceAll('_',' '))}</option>`).join('');
    select.value=current;
  };
  const loadReport = async () => {
    const from=$('#reportFrom').value,to=$('#reportTo').value;
    if(!from||!to||to<from){globalStatus('Choose a valid report date range.','error');return;}
    const status=$('#reportLoadStatus');status.textContent='Loading…';status.className='report-load-status loading';
    try{
      const {data,error}=await db.rpc('admin_generate_report',{p_report_code:state.reportCode,p_from:from,p_to:to,p_status:$('#reportStatus').value||null,p_search:$('#reportSearch').value.trim()||null});
      if(error)throw error;
      state.reportRows=Array.isArray(data?.records)?data.records:[];state.reportSelected.clear();state.reportPage=1;
      updateReportStatusOptions();renderReport();status.textContent=`Updated ${formatDate(data?.generated_at||new Date().toISOString(),true)}`;status.className='report-load-status';
    }catch(error){status.textContent='Could not load';status.className='report-load-status error';globalStatus('Report could not load: '+friendlyError(error),'error');}
  };
  const selectReport = async (code) => {
    if(!reportDefinitions[code])return;
    state.reportCode=code;state.reportRows=[];state.reportSelected.clear();state.reportPage=1;
    $('#reportStatus').value='';$('#reportSearch').value='';
    const definition=reportDefinitions[code];$('#reportEyebrow').textContent=definition.group.toUpperCase();$('#reportTitle').textContent=definition.title;$('#reportDescription').textContent=definition.description;$('#reportFinanceNote').hidden=!definition.wallet;
    renderReportCatalogue();renderReport();await loadReport();
  };
  const initializeReports = async () => {
    if(!state.reportInitialized){const to=new Date(),from=new Date();from.setDate(from.getDate()-30);$('#reportTo').value=to.toISOString().slice(0,10);$('#reportFrom').value=from.toISOString().slice(0,10);state.reportInitialized=true;renderReportCatalogue();}
    await selectReport(state.reportCode);
  };
  const reportExportRows = (rows) => {const definition=reportDefinitions[state.reportCode];return [definition.columns.map(([,label])=>label),...rows.map(row=>definition.columns.map(([key,,type])=>reportCell(row[key],type,true)))];};
  const reportPdfBlob = (definition,rows) => {
    const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)return pdfBlob(`LEOGO DIGITAL MARKET — ${definition.title}`,reportExportRows(rows));
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),margin=10,pageWidth=277,columns=definition.columns,colWidth=pageWidth/columns.length;
    const generatedBy=state.admin?.display_name||state.user?.email||'LEOGO Admin';
    const totals=columns.filter(([, ,type])=>type==='money').slice(0,3).map(([key,label])=>`${label}: ${formatMoney(rows.reduce((sum,row)=>sum+Number(row[key]||0),0))}`).join('   ');
    const header=()=>{doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('LEOGO DIGITAL MARKET',margin,12);doc.setFontSize(11);doc.text(definition.title,margin,19);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.text(`Period: ${reportPeriodLabel()}   Generated: ${formatDate(new Date().toISOString(),true)}   By: ${generatedBy}`,margin,25);doc.text(`Summary — Records: ${rows.length}${totals?'   '+totals:''}`,margin,30);doc.setFillColor(240,243,247);doc.rect(margin,34,pageWidth,8,'F');doc.setFont('helvetica','bold');columns.forEach(([,label],i)=>doc.text(doc.splitTextToSize(label,colWidth-2)[0]||'',margin+i*colWidth+1,39));doc.setFont('helvetica','normal');};
    header();let y=47;doc.setFontSize(6.5);
    rows.forEach(row=>{const cells=columns.map(([key,,type])=>doc.splitTextToSize(String(reportCell(row[key],type,true)),colWidth-2).slice(0,2));const height=Math.max(7,...cells.map(lines=>lines.length*3+2));if(y+height>196){doc.addPage();header();y=47;doc.setFontSize(6.5);}cells.forEach((lines,i)=>doc.text(lines,margin+i*colWidth+1,y));doc.setDrawColor(225,229,235);doc.line(margin,y+height-2,margin+pageWidth,y+height-2);y+=height;});
    return doc.output('blob');
  };
  const exportReport = async (format) => {
    const scope=$('#reportExportScope').value,source=scope==='selected'?state.reportRows.filter(row=>state.reportSelected.has(reportRowId(row))):state.reportRows;
    if(!source.length){globalStatus(scope==='selected'?'Select at least one report row first.':'There are no filtered records to export.','error');return;}
    const definition=reportDefinitions[state.reportCode],filters={from:$('#reportFrom').value,to:$('#reportTo').value,status:$('#reportStatus').value,search:$('#reportSearch').value};
    await auditExport(state.reportCode,scope,format,source.length,filters);
    const filename=`leogo-${state.reportCode}-${new Date().toISOString().slice(0,10)}.${format}`;
    const rows=reportExportRows(source),blob=format==='xlsx'?xlsxBlob(`LEOGO DIGITAL MARKET — ${definition.title}`,[[`Reporting period: ${reportPeriodLabel()}`],[`Generated by: ${state.admin?.display_name||state.user?.email||'LEOGO Admin'}`],[],...rows]):reportPdfBlob(definition,source);
    downloadBlob(blob,filename);globalStatus(`${source.length} ${definition.title} record(s) exported and audited.`);
    if(isSuperAdmin())await loadAuditLog().catch(()=>{});
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

  let activeTransportSection='providers';
  const transportSectionMeta={
    providers:{eyebrow:'TRANSPORT / PARCEL PARTNERS',title:'Transport / Parcel Providers',description:'Manage provider registrations, approved accounts, vehicles and Transport approvals.'},
    jobs:{eyebrow:'DELIVERY OPERATIONS',title:'Delivery Jobs',description:'Manage customer Transport requests and LEOGO staff-rider marketplace delivery jobs.'},
    zones:{eyebrow:'DELIVERY SETTINGS',title:'Delivery Zones',description:'Manage delivery areas, coverage and future zone-based delivery pricing from one dedicated page.'},
    pickup:{eyebrow:'PICKUP STATIONS',title:'Pickup Stations',description:'Manage customer Pickup Stations, addresses, service fees and pinned station locations.'}
  };
  const changeTransportSection=(target='providers')=>{
    const resolved=transportSectionMeta[target]?target:'providers';
    activeTransportSection=resolved;
    $$('[data-transport-section]').forEach(section=>section.hidden=section.dataset.transportSection!==resolved);
    const meta=transportSectionMeta[resolved];
    if($('#transportSectionEyebrow'))$('#transportSectionEyebrow').textContent=meta.eyebrow;
    if($('#transportSectionTitle'))$('#transportSectionTitle').textContent=meta.title;
    if($('#transportSectionDescription'))$('#transportSectionDescription').textContent=meta.description;
    if($('#openTransportApprovals'))$('#openTransportApprovals').hidden=resolved!=='providers';
    $$('.admin-nav [data-admin-view="transport"]').forEach(button=>{
      if(button.dataset.navGroup==='transport'){button.classList.add('active');return;}
      const buttonTarget=button.dataset.transportTarget||'providers';
      button.classList.toggle('active',buttonTarget===resolved);
    });
  };

  const changeView = (view, settingsTab = '') => {
    if (!viewAllowed(view, settingsTab)) {
      globalStatus('Your staff role does not have access to this Admin module.', 'error');
      return;
    }
    document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.adminPanel === view));
    document.querySelectorAll('.admin-nav [data-admin-view]').forEach((button) => {
      if(view==='transport'&&button.dataset.adminView==='transport')return;
      button.classList.toggle('active', button.dataset.adminView === view && (!button.dataset.settingsTab || button.dataset.settingsTab === settingsTab));
    });
    $('#adminPageTitle').textContent = viewTitles[view] || 'Admin Control Center';
    $('#adminBreadcrumb').textContent = view === 'settings' ? 'ADMINISTRATION' : 'CONTROL CENTER';

    if(view==='dashboard'){
      Promise.all([loadDashboard(),loadApprovals()])
        .catch((error)=>globalStatus('Dashboard actions could not refresh: '+friendlyError(error),'error'));
    }

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
    if (view === 'reports') {
      initializeReports().catch((error)=>globalStatus('Reports could not load: '+friendlyError(error),'error'));
    }
    if (view === 'providers') {
      Promise.all([loadServiceProviders(),loadServiceListings(),loadServiceOperations()]).catch((error) => globalStatus('Service operations could not load: '+friendlyError(error), 'error'));
    }
    if(view==='transport'){
      changeTransportSection(activeTransportSection);
      if(activeTransportSection==='providers') loadTransportNetwork().catch((error)=>globalStatus('Transport Provider data could not load: '+friendlyError(error),'error'));
      if(activeTransportSection==='jobs') Promise.all([loadTransportNetwork(),loadDeliveryOps()]).catch((error)=>globalStatus('Delivery jobs could not load: '+friendlyError(error),'error'));
      if(activeTransportSection==='zones') loadDeliveryRateSettings().catch((error)=>globalStatus('Delivery rates could not load: '+friendlyError(error),'error'));
      if(activeTransportSection==='pickup') loadPickupStations().catch((error)=>globalStatus('Pickup Stations could not load: '+friendlyError(error),'error'));
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
    $$('[data-admin-view]').forEach((button) => button.addEventListener('click', () => {
      if(button.dataset.adminView==='transport'&&button.dataset.transportTarget)activeTransportSection=button.dataset.transportTarget;
      changeView(button.dataset.adminView, button.dataset.settingsTab || '');
      if(button.dataset.adminView==='transport')changeTransportSection(activeTransportSection);
      if(button.dataset.premiumTarget) changePremiumAdminTab(button.dataset.premiumTarget);
      if(button.dataset.filterTarget){state.approvalFilter=button.dataset.filterTarget;$$('#approvalFilters [data-approval-filter]').forEach(item=>item.classList.toggle('active',item.dataset.approvalFilter===state.approvalFilter));renderApprovals();}
    }));
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
    $('#adminNotificationBell')?.addEventListener('click',(event)=>{
      event.stopPropagation();
      renderAdminNotifications();
      const panel=$('#adminNotificationPanel');
      if(!panel)return;
      panel.hidden=!panel.hidden;
      $('#adminNotificationBell').setAttribute('aria-expanded',panel.hidden?'false':'true');
    });
    $('#markAllAdminNotificationsSeen')?.addEventListener('click',(event)=>{
      event.stopPropagation();
      const seen=adminNotificationSeenSet();
      state.adminNotifications.forEach((item)=>seen.add(item.key));
      saveAdminNotificationSeenSet(seen);
      renderAdminNotifications();
    });
    $('#adminNotificationList')?.addEventListener('click',(event)=>{
      const button=event.target.closest?.('[data-open-admin-notification]');
      if(button)openAdminActivityNotification(button.dataset.openAdminNotification);
    });
    document.addEventListener('click',(event)=>{
      const shell=$('#adminNotificationShell');
      const panel=$('#adminNotificationPanel');
      if(!shell||!panel||panel.hidden||shell.contains(event.target))return;
      panel.hidden=true;
      $('#adminNotificationBell')?.setAttribute('aria-expanded','false');
    });

    $('#refreshAdminData').addEventListener('click', () => withButtonLock($('#refreshAdminData'), 'Refreshing…', loadAll));
    $('#reportCatalogueSearch')?.addEventListener('input',renderReportCatalogue);
    $('#reportFilters')?.addEventListener('submit',(event)=>{event.preventDefault();loadReport();});
    $('#refreshReport')?.addEventListener('click',(event)=>withButtonLock(event.currentTarget,'Refreshing…',loadReport));
    $('#selectAllReportRows')?.addEventListener('click',()=>{state.reportRows.forEach(row=>state.reportSelected.add(reportRowId(row)));renderReport();});
    $('#clearReportSelection')?.addEventListener('click',()=>{state.reportSelected.clear();renderReport();});
    $('#reportPageSize')?.addEventListener('change',(event)=>{state.reportPageSize=Number(event.target.value)||25;state.reportPage=1;renderReport();});
    $('#reportPreviousPage')?.addEventListener('click',()=>{state.reportPage=Math.max(1,state.reportPage-1);renderReport();});
    $('#reportNextPage')?.addEventListener('click',()=>{state.reportPage+=1;renderReport();});
    $$('[data-report-export]').forEach(button=>button.addEventListener('click',()=>withButtonLock(button,'Exporting…',()=>exportReport(button.dataset.reportExport))));
    $('#refreshApprovals').addEventListener('click', () => withButtonLock($('#refreshApprovals'), 'Refreshing…', async () => { await Promise.all([loadApprovals(), loadDashboard()]); }));
    $('#refreshServiceProviders')?.addEventListener('click', () => withButtonLock($('#refreshServiceProviders'), 'Refreshing…', async () => { await Promise.all([loadServiceProviders(),loadServiceListings(),loadServiceOperations(),loadServiceReviews(),loadApprovals()]); }));
    $('#refreshAccommodationProviders')?.addEventListener('click',()=>withButtonLock($('#refreshAccommodationProviders'),'Refreshing…',async()=>{await Promise.all([loadAccommodationSummary(),loadApprovals()]);}));
    $('#refreshAccommodationBookingsAdmin')?.addEventListener('click',()=>withButtonLock($('#refreshAccommodationBookingsAdmin'),'Refreshing…',loadAccommodationSummary));
    $('#adminServiceListingFilter')?.addEventListener('change',renderServiceListings);
    $('#serviceQuotationFeeForm')?.addEventListener('submit',saveServiceQuotationFee);
    $('#partnerSubscriptionSettingsForm')?.addEventListener('submit',savePartnerSubscriptionSettings);
    $('#adminServiceRequestFilter')?.addEventListener('change',renderServiceRequests);
    $('#adminServiceRequestList')?.addEventListener('click',(event)=>{const button=event.target.closest?.('[data-service-payment],[data-dispatch-service-request],[data-cancel-service-request]');if(button)handleServiceRequestAction(button);});
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
    $('#refreshDeliveryOps').addEventListener('click', () => withButtonLock($('#refreshDeliveryOps'), 'Refreshing…', async()=>{
      if(activeTransportSection==='providers')await loadTransportNetwork();
      else if(activeTransportSection==='jobs')await Promise.all([loadTransportNetwork(),loadDeliveryOps()]);
      else if(activeTransportSection==='zones')await loadDeliveryRateSettings();
      else if(activeTransportSection==='pickup')await loadPickupStations();
      else await Promise.resolve();
    }));
    $('#openTransportApprovals')?.addEventListener('click',()=>{
      changeView('approvals');
      state.approvalFilter='transport';
      $$('#approvalFilters [data-approval-filter]').forEach(button=>button.classList.toggle('active',button.dataset.approvalFilter==='transport'));
      renderApprovals();
    });
    $('#deliveryRateSettingsForm')?.addEventListener('submit',saveDeliveryRateSettings);
    $('#pickupStationFinanceForm')?.addEventListener('submit',savePickupStationFinanceSettings);
    $('#adminAddRiderForm').addEventListener('submit', addRider);
    $('#refreshAudit').addEventListener('click', () => withButtonLock($('#refreshAudit'), 'Refreshing…', loadAuditLog));
    document.querySelectorAll('#premiumAdminTabs [data-premium-admin-tab]').forEach((button) => button.addEventListener('click', () => {
      changePremiumAdminTab(button.dataset.premiumAdminTab);
    }));
    $('#adminSellerSearch').addEventListener('input', renderSellers);
    $('#adminSellerStatusFilter').addEventListener('change', renderSellers);
    $('#adminServiceReviewStatusFilter')?.addEventListener('change',renderServiceReviews);
    $('#adminTransportReviewStatusFilter')?.addEventListener('change',renderServiceReviews);
    $('#refreshServiceReviews')?.addEventListener('click',()=>withButtonLock($('#refreshServiceReviews'),'Refreshing…',loadServiceReviews));
    $('#refreshTransportReviews')?.addEventListener('click',()=>withButtonLock($('#refreshTransportReviews'),'Refreshing…',loadServiceReviews));
    $('#refreshSellerSettlements').addEventListener('click', () => withButtonLock($('#refreshSellerSettlements'), 'Refreshing…', loadSellerSettlements));
    $('#adminSettlementPartnerType').addEventListener('change',()=>renderManualSettlementPartners());
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
    $('#customerThemeForm')?.addEventListener('submit', saveCustomerTheme);
    $('#customerThemeForm')?.addEventListener('input', renderCustomerThemePreview);
    $('#walletFeesForm').addEventListener('submit', saveWalletSettings);
    $('#transportFinanceSettingsForm')?.addEventListener('submit', saveTransportFinanceSettings);
    $('#accommodationFinanceSettingsForm')?.addEventListener('submit', saveAccommodationFinanceSettings);
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

  const refreshPickupActivityForBell = async () => {
    if(!state.admin || state.admin.status!=='active' || document.visibilityState!=='visible')return;
    const {data,error}=await db.rpc('admin_list_pickup_station_events',{p_limit:30});
    if(error)return;
    state.pickupStationEvents=Array.isArray(data)?data:[];
    renderAdminNotifications();
    if(activeTransportSection==='pickup' && document.querySelector('[data-admin-panel="transport"]')?.classList.contains('active')){
      renderPickupStationEvents();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    initializeAuth();
    // Pickup Station receipt/handover events feed the Admin bell without requiring a manual refresh.
    window.setInterval(()=>refreshPickupActivityForBell().catch(()=>{}),20000);
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')refreshPickupActivityForBell().catch(()=>{}); });
  });
})();

// LEOGO DIGITAL MARKET — Admin Control Center V1
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const STAFF_PORTAL_URL = 'https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/staff/';
  const ADMIN_RECOVERY_URL = 'https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/admin/recover.html';
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
    systemMonitoring: null,
    dataCleanupOverview: null,
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
    dashboard: 'Dashboard', approvals: 'Approval Center', orders: 'Orders', assisted: 'Assisted Shopping', flashsales: 'Flash Sales', aftersales: 'Aftersales', customers: 'Customers',
    chat: 'Customer Care Chats', products: 'Products & Categories', sellers: 'Sellers', health: 'Health & Medicine', settlements: 'Partner Settlements', providers: 'Service Providers',
    transport: 'Transport & Parcel Delivery', wallet: 'Wallet & SACCO', premium: 'Premium',
    accommodation: 'Accommodation', vacant_houses: 'Houses & Property', advertisements: 'Advertisements', loyalty: 'Loyalty & Rewards', reports: 'Reports',
    staff: 'Staff Management', settings: 'System Settings', diagnostics: 'System Diagnosis', audit: 'Audit Log'
  };
  const kindLabels = {
    seller_application: 'Seller Registration', seller_profile_change: 'Seller Profile Update', seller_product: 'Seller Product', customer_personal_sale: 'Customer Item Sale', customer_looking_request: 'Customer Looking Request',
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
    premium_payment: 'Premium Payment', partner_subscription_payment: 'Partner Subscription Payment', premium_extra_acceptance_payment: 'Premium Partner Extra Acceptance', premium_customer_meetup_payment: 'Premium Customer Extra Meetup', wallet_deposit: 'Wallet Deposit', wallet_loan: 'Wallet Loan',
    wallet_withdrawal: 'Wallet Withdrawal', accommodation_host: 'Accommodation Host',
    accommodation_property: 'Accommodation Property',
    accommodation_unit: 'Accommodation Room / Unit',
    health_medicine_application: 'Health & Medicine Registration', health_medicine_product: 'Health & Medicine Product', health_medicine_service: 'Health Specialist Service',
    cyber_application: 'Cyber Partner Registration', cyber_service: 'Cyber Service', cyber_product: 'Cyber Shop Item', cyber_profile_change: 'Cyber Profile Update',
    partner_flash_sale: 'Flash Sale'
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
  const formatBytes = (value) => {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes < 1024) return bytes.toLocaleString('en-KE') + ' B';
    const units = ['KB','MB','GB','TB'];
    let amount = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    return amount.toLocaleString('en-KE', { maximumFractionDigits: amount >= 100 ? 0 : amount >= 10 ? 1 : 2 }) + ' ' + unit;
  };
  const formatDate = (value, withTime = false) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-KE', withTime
      ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }
      : { dateStyle: 'medium', timeZone: 'Africa/Nairobi' }).format(date);
  };
  const setSidebarActionCount = (id, value) => {
    const node = $('#'+id);
    if (!node) return;
    const count = Math.max(0, Number(value || 0));
    node.textContent = count.toLocaleString('en-KE');
    node.hidden = false;
    node.setAttribute('aria-label', count+' item'+(count===1?'':'s')+' requiring Admin attention');
  };

  const updateSidebarActionCounts = () => {
    const approvals = Array.isArray(state.approvals) ? state.approvals : [];
    const countApprovalKinds = (kinds) => approvals.filter((item) => kinds.includes(String(item.kind||''))).length;
    const countApprovalPrefix = (prefix) => approvals.filter((item) => String(item.kind||'').startsWith(prefix)).length;

    const orderAttention = (state.marketplaceOrders||[])
      .filter((item) => item.payment_status === 'submitted').length;

    const productAttention =
      countApprovalKinds(['seller_product']) +
      (state.productReviews||[]).filter((item)=>item.moderation_status==='submitted').length +
      (state.orderReviews||[]).filter((item)=>item.moderation_status==='submitted').length;

    const flashCounts=window.leogoFlashSaleActionCounts||{};
    const sellerAttention = countApprovalKinds([
      'seller_application','seller_profile_change'
    ]) + Math.max(0,Number(flashCounts.seller||0));

    const providerAttention =
      countApprovalKinds([
        'service_provider_application','service_provider_profile_change','service_listing'
      ]) +
      (state.serviceRequests||[]).filter((item)=>
        ['awaiting_payment_verification','submitted','payment_verified'].includes(item.request_status)
      ).length +
      Math.max(0,Number(flashCounts.service_provider||0));

    const transportApprovalAttention = countApprovalKinds([
      'transport_provider_application','transport_provider_profile_change','transport_vehicle','pickup_station_application'
    ]);
    const transportRequestAttention = (state.transportRequests||[])
      .filter((item)=>['submitted','declined'].includes(item.request_status)).length;
    const deliveryAttention = (state.deliveryJobs||[])
      .filter((item)=>['awaiting_assignment','failed'].includes(item.status)).length;
    const pickupWithdrawalAttention = (state.pickupStationWithdrawals||[])
      .filter((item)=>['pending','approved'].includes(item.status)).length;
    const pickupReturnAttention = (state.pickupStationReturns||[])
      .filter((item)=>['received_at_station','awaiting_dispatch'].includes(item.status)).length;
    const transportAttention =
      transportApprovalAttention + transportRequestAttention + deliveryAttention +
      pickupWithdrawalAttention + pickupReturnAttention;

    const walletApprovalAttention = countApprovalPrefix('wallet');
    const wallet = state.dashboard?.wallet || {};
    const walletDashboardAttention =
      Number(wallet.pending_deposits||0) +
      Number(wallet.pending_withdrawals||0) +
      Number(wallet.loan_applications||0);
    const walletAttention =
      Math.max(walletApprovalAttention, walletDashboardAttention) +
      Math.max(0, Number(window.leogoLoanRepaymentActionCount||0));

    const premiumAttention = countApprovalPrefix('premium');
    const accommodationAttention =
      countApprovalPrefix('accommodation') +
      (state.accommodationBookings||[]).filter((item)=>item.booking_status==='pending_host').length;

    setSidebarActionCount('sidebarOrderCount', orderAttention);
    setSidebarActionCount('sidebarProductCount', productAttention);
    setSidebarActionCount('sidebarSellerCount', sellerAttention);
    setSidebarActionCount('sidebarProviderCount', providerAttention);
    setSidebarActionCount('sidebarTransportCount', transportAttention);
    setSidebarActionCount('sidebarWalletCount', walletAttention);
    setSidebarActionCount('sidebarPremiumCount', premiumAttention);
    setSidebarActionCount('sidebarAccommodationCount', accommodationAttention);
  };

  document.addEventListener('leogo:loan-action-count',()=>updateSidebarActionCounts());
  document.addEventListener('leogo:flash-sale-action-counts',()=>updateSidebarActionCounts());

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

    (state.systemMonitoring?.incidents||[]).forEach((incident)=>{
      const active=incident.status==='active';
      const transition=active
        ? 'active:'+String(incident.reopened_count||0)
        : 'recovered:'+String(incident.recovered_at||'');
      items.push({
        key:'system-diagnosis:'+String(incident.id||incident.check_id||'incident')+':'+transition,
        category:'System Diagnosis',
        title:active
          ? String(incident.severity||'warning').toUpperCase()+': '+String(incident.title||'System monitoring incident')
          : 'Recovered: '+String(incident.title||'System monitoring incident'),
        message:active
          ? String(incident.evidence||incident.summary||'System Diagnosis detected a preventive monitoring finding.')
          : 'Preventive monitoring verified that this incident is no longer active.',
        created_at:active?(incident.last_detected_at||incident.first_detected_at):incident.recovered_at,
        view:'diagnostics',
        sourceId:incident.id,
        priority:active&&incident.severity==='critical'
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
        '<div class="admin-notification-icon">'+(item.category==='Accommodation'?'🏨':item.category==='Payment'?'KSh':item.category==='Transport'?'🚚':item.category==='Approval'?'✓':(item.category==='System'||item.category==='System Diagnosis')?'!':'◴')+'</div>'+
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
      assisted: () => adminHas('orders.read'),
      flashsales: () => adminHas('approvals.read'),
      aftersales: () => adminHas('orders.read'),
      customers: () => adminHas('customers.read'),
      chat: () => adminHas('support.chat'),
      products: () => adminHas('products.read'),
      sellers: () => adminHas('sellers.read'),
      health: () => adminHas('approvals.read'),
      settlements: () => adminHas('settlements.read'),
      providers: () => adminHas('approvals.read'),
      transport: () => adminHas('orders.read') || adminHas('delivery.manage'),
      wallet: () => adminHas('approvals.read'),
      premium: () => adminHas('premium.read'),
      accommodation: () => adminHas('approvals.read'),
      vacant_houses: () => adminHas('approvals.read') || adminHas('settings.manage') || adminHas('fees.manage'),
      advertisements: () => adminHas('settings.manage'),
      loyalty: () => adminHas('settings.manage') || adminHas('fees.manage') || adminHas('reports.export'),
      reports: () => adminHas('reports.export'),
      staff: () => false,
      diagnostics: () => false,
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

    const securityTab=$('#adminSecuritySettingsTab');
    if(securityTab) securityTab.hidden=!isSuperAdmin();
    const securityPanel=$('#adminSecuritySettingsPanel');
    if(securityPanel && !isSuperAdmin()) securityPanel.classList.remove('active');
    const dataTab=$('#dataManagementSettingsTab');
    if(dataTab) dataTab.hidden=!isSuperAdmin();
    const dataPanel=$('[data-settings-content="data"]');
    if(dataPanel && !isSuperAdmin()) dataPanel.classList.remove('active');
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

  let systemMonitoringPollTimer=null;
  let adminNotificationSignalChannel=null;
  let adminNotificationSignalPollTimer=null;
  let adminNotificationSignalRefreshTimer=null;
  let adminNotificationSignalQueued=null;
  let adminNotificationSignalState=null;
  let adminNotificationSignalRefreshRunning=false;

  const fetchAdminNotificationSignal=async()=>{
    if(!db||!state.admin)return null;
    const {data,error}=await db
      .from('admin_notification_signal')
      .select('id,version,approvals_version,orders_version,transport_version,pickup_version,accommodation_version,updated_at')
      .eq('id',1)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  };

  const adminSignalChanged=(next,previous,key)=>Number(next?.[key]||0)!==Number(previous?.[key]||0);

  const applyAdminNotificationSignal=async(nextSignal,{force=false}={})=>{
    if(!state.admin||!nextSignal)return;
    const previous=adminNotificationSignalState;
    if(!previous){
      adminNotificationSignalState=nextSignal;
      return;
    }
    if(document.hidden&&!force)return;

    const refreshers=[];
    const add=(key,task)=>{
      if(!refreshers.some((entry)=>entry.key===key))refreshers.push({key,task});
    };

    if(adminSignalChanged(nextSignal,previous,'approvals_version')&&adminHas('approvals.read')){
      add('approvals',()=>loadApprovals());
    }
    if(adminSignalChanged(nextSignal,previous,'orders_version')){
      if(adminHas('orders.read'))add('orders',()=>loadMarketplaceOrders({refreshActiveDetail:true}));
      if(adminHas('dashboard.read'))add('dashboard',()=>loadDashboard());
    }
    if(adminSignalChanged(nextSignal,previous,'transport_version')&&(adminHas('approvals.read')||adminHas('delivery.manage'))){
      add('transport',()=>loadTransportNetwork());
    }
    if(adminSignalChanged(nextSignal,previous,'pickup_version')&&(adminHas('orders.read')||adminHas('delivery.manage'))){
      add('pickup',()=>loadPickupStations());
    }
    if(adminSignalChanged(nextSignal,previous,'accommodation_version')&&adminHas('approvals.read')){
      add('accommodation',()=>loadAccommodationSummary());
    }

    if(!refreshers.length){
      adminNotificationSignalState=nextSignal;
      return;
    }

    const results=await Promise.allSettled(refreshers.map((entry)=>entry.task()));
    results.forEach((result,index)=>{
      if(result.status==='rejected'){
        console.warn('Admin realtime refresh failed for '+refreshers[index].key+':',result.reason);
      }
    });
    renderAdminNotifications();
    updateSidebarActionCounts();
    if($('#lastSynced'))$('#lastSynced').textContent=formatDate(new Date().toISOString(),true);
    adminNotificationSignalState=nextSignal;
  };

  const queueAdminNotificationSignal=(signal)=>{
    if(!signal||!state.admin)return;
    adminNotificationSignalQueued=signal;
    if(adminNotificationSignalRefreshTimer)clearTimeout(adminNotificationSignalRefreshTimer);
    adminNotificationSignalRefreshTimer=setTimeout(async()=>{
      adminNotificationSignalRefreshTimer=null;
      if(adminNotificationSignalRefreshRunning)return;
      const next=adminNotificationSignalQueued;
      adminNotificationSignalQueued=null;
      if(!next)return;
      adminNotificationSignalRefreshRunning=true;
      try{
        await applyAdminNotificationSignal(next);
      }finally{
        adminNotificationSignalRefreshRunning=false;
        if(adminNotificationSignalQueued)queueAdminNotificationSignal(adminNotificationSignalQueued);
      }
    },220);
  };

  const syncAdminNotificationSignal=async({force=false}={})=>{
    if(!state.admin||!db)return;
    try{
      const signal=await fetchAdminNotificationSignal();
      if(force)await applyAdminNotificationSignal(signal,{force:true});
      else queueAdminNotificationSignal(signal);
    }catch(error){
      console.warn('Admin notification sync failed:',error);
    }
  };

  const stopAdminNotificationRealtime=()=>{
    if(adminNotificationSignalRefreshTimer)clearTimeout(adminNotificationSignalRefreshTimer);
    adminNotificationSignalRefreshTimer=null;
    adminNotificationSignalQueued=null;
    adminNotificationSignalRefreshRunning=false;
    if(adminNotificationSignalPollTimer)clearInterval(adminNotificationSignalPollTimer);
    adminNotificationSignalPollTimer=null;
    if(adminNotificationSignalChannel&&db){
      const channel=adminNotificationSignalChannel;
      adminNotificationSignalChannel=null;
      db.removeChannel(channel).catch?.(()=>{});
    }
    adminNotificationSignalState=null;
  };

  const startAdminNotificationRealtime=async()=>{
    stopAdminNotificationRealtime();
    if(!db||!state.admin||!state.user)return;

    try{
      adminNotificationSignalState=await fetchAdminNotificationSignal();
    }catch(error){
      console.warn('Admin notification baseline could not load:',error);
    }

    adminNotificationSignalChannel=db
      .channel('leogo-admin-notification-signal-'+state.user.id)
      .on('postgres_changes',{
        event:'UPDATE',
        schema:'public',
        table:'admin_notification_signal',
        filter:'id=eq.1'
      },(payload)=>{
        const signal=payload?.new;
        if(signal)queueAdminNotificationSignal(signal);
      })
      .subscribe((subscriptionStatus)=>{
        if(['CHANNEL_ERROR','TIMED_OUT'].includes(subscriptionStatus)){
          console.warn('Admin realtime notification channel is unavailable; fallback sync remains active.');
        }
      });

    adminNotificationSignalPollTimer=setInterval(()=>{
      if(state.admin&&!document.hidden)syncAdminNotificationSignal();
    },30000);
  };

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&state.admin)syncAdminNotificationSignal({force:true});
  });
  window.addEventListener('focus',()=>{
    if(state.admin)syncAdminNotificationSignal({force:true});
  });

  const loadSystemMonitoringSnapshot=async()=>{
    if(!db||!isSuperAdmin())return null;
    const {data,error}=await db.rpc('admin_get_system_monitoring_snapshot');
    if(error)throw error;
    state.systemMonitoring=data||null;
    document.dispatchEvent(new CustomEvent('leogo:system-monitoring-snapshot',{detail:data||{}}));
    return data;
  };

  const startSystemMonitoringPolling=()=>{
    if(systemMonitoringPollTimer)clearInterval(systemMonitoringPollTimer);
    if(!isSuperAdmin())return;
    systemMonitoringPollTimer=setInterval(()=>{
      if(!state.admin||!isSuperAdmin()||document.hidden)return;
      loadSystemMonitoringSnapshot()
        .then(()=>renderAdminNotifications())
        .catch(()=>{});
    },60000);
  };

  document.addEventListener('leogo:system-monitoring-updated',(event)=>{
    if(!event.detail||!isSuperAdmin())return;
    state.systemMonitoring=event.detail;
    renderAdminNotifications();
  });

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
      if($('#adminSecurityEmail')) $('#adminSecurityEmail').value=user.email||'';
      if($('#adminRecoveryDestination')) $('#adminRecoveryDestination').textContent=user.email||'No email on account';
      applyAdminNavigationPermissions();
      await loadAll();
      startSystemMonitoringPolling();
      startAdminNotificationRealtime().catch((error)=>console.warn('Admin realtime notification startup failed:',error));
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
      showGate('login');
      return;
    }
    await enterAdmin(data.session.user);
  };

  const settleLoadersWithConcurrency = async (loaders, limit = 2) => {
    const results = new Array(loaders.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= loaders.length) return;
        try {
          await loaders[index]();
          results[index] = { status: 'fulfilled' };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };
    const workerCount = Math.min(Math.max(1, limit), Math.max(1, loaders.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
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
      [loadOrderSettings, () => adminHas('settings.manage') || adminHas('fees.manage')],
      [loadLipaPolePoleSettings, () => adminHas('settings.manage') || adminHas('fees.manage')],
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
      [loadSystemMonitoringSnapshot, () => isSuperAdmin()],
      [loadStaffManagement, () => isSuperAdmin()]
    ];
    const loaders = loaderSpecs.filter(([,allowed]) => allowed()).map(([load]) => load);
    // Mobile browsers were previously asked to start every permitted Admin loader
    // at once, which could create 100+ Supabase requests in a single second.
    // Keep the same loaders, but cap top-level concurrency to avoid network storms.
    const results = await settleLoadersWithConcurrency(loaders, 2);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) globalStatus(`Some permitted Admin data could not load: ${friendlyError(failed.reason)}`, 'error');
    if (isSuperAdmin()) renderDataManagement();
    $('#lastSynced').textContent = formatDate(new Date().toISOString(), true);
    updateSidebarActionCounts();
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
    const [dashboardResult,connectedRevenueResult,extendedNetworkResult] = await Promise.all([
      db.rpc('admin_production_dashboard', { p_from: range.from, p_to: range.to }),
      db.rpc('admin_financial_overview_service_accommodation', { p_from: range.from, p_to: range.to }),
      db.rpc('admin_network_overview_extended')
    ]);
    const { data, error } = dashboardResult;
    if (error) throw error;

    // Service Provider and Accommodation earnings are connected through a
    // small additive RPC so the existing marketplace/order dashboard remains
    // untouched. If the additive RPC is temporarily unavailable, keep the
    // existing "Not connected" fallback instead of breaking the Dashboard.
    if (!connectedRevenueResult.error && connectedRevenueResult.data) {
      const connected=connectedRevenueResult.data;
      const serviceRevenue=Number(connected.service?.leogo_revenue_kes||0);
      const accommodationRevenue=Number(connected.accommodation?.leogo_revenue_kes||0);
      data.revenue.service_commission={
        supported:true,
        value:serviceRevenue,
        request_fees_kes:Number(connected.service?.request_fees_kes||0),
        referral_commission_kes:Number(connected.service?.referral_commission_kes||0),
        referral_commission_rate:Number(connected.service?.referral_commission_rate||0)
      };
      data.revenue.accommodation_commission={
        supported:true,
        value:accommodationRevenue,
        hotel_commission_kes:Number(connected.accommodation?.hotel_commission_kes||0),
        customer_service_fee_kes:Number(connected.accommodation?.customer_service_fee_kes||0)
      };
      data.revenue.total_leogo=
        Number(data.revenue.total_leogo||0)+serviceRevenue+accommodationRevenue;
      if(data.top?.leogo_revenue){
        data.top.leogo_revenue.supported=true;
        data.top.leogo_revenue.value=data.revenue.total_leogo;
      }
    }

    // Extra network counts are additive so a temporary failure here never
    // blocks the main Admin dashboard.
    if (!extendedNetworkResult.error && extendedNetworkResult.data) {
      data.network={...(data.network||{}),...extendedNetworkResult.data};
    }

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
      ['Premium Revenue', data.revenue.premium, true], ['Service Fees & Commission', data.revenue.service_commission, true],
      ['Accommodation Revenue', data.revenue.accommodation_commission, true], ['Other LEOGO Revenue', data.revenue.other, true]
    ].map(([label, value, money]) => `<div><span>${label}</span><strong class="${value.supported ? '' : 'not-connected'}">${metricValue(value, money)}</strong><small>${value.supported ? '' : 'Not connected'}</small></div>`).join('') + `<div class="metric-total"><span>Total LEOGO Revenue</span><strong>${formatMoney(data.revenue.total_leogo)}</strong><small>${escapeHtml(dashboardLabel())}</small></div>`;
    const wallet = data.wallet;
    $('#walletSnapshot').innerHTML = [
      ['Deposits', formatMoney(wallet.deposits)], ['Withdrawals', formatMoney(wallet.withdrawals)], ['Savings Deposits', formatMoney(wallet.savings_deposits)],
      ['Pending Deposits', wallet.pending_deposits], ['Pending Withdrawals', wallet.pending_withdrawals], ['Active Challenges', wallet.active_challenges],
      ['Loan Applications', wallet.loan_applications], ['Active Loans', metricValue(wallet.active_loans)], ['Overdue Loans', metricValue(wallet.overdue_loans)]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
    const networkMap = [
      ['Customers','customers','customers'],
      ['Sellers','sellers','sellers'],
      ['Service Providers','service_providers','providers'],
      ['Transport Providers','transport_providers','transport'],
      ['Premium Profiles','premium_profiles','premium'],
      ['Accommodation Providers','accommodation_providers','accommodation'],
      ['Cyber Providers','cyber_providers','cyber'],
      ['Health & Medicine Providers','health_medicine_providers','health'],
      ['LEOGO Riders','leogo_riders','transport'],
      ['Houses & Property','property_listings','vacant_houses'],
      ['Products','products','products'],
      ['Pickup Stations','pickup_stations','transport']
    ];
    $('#networkOverview').innerHTML = networkMap.map(([label,key,view]) => {
      const metric=data.network?.[key]||{supported:false,value:null};
      return `<button data-open-view="${view}"><span>${escapeHtml(label)}</span><strong>${metricValue(metric)}</strong><small>${metric.supported ? 'Open module →' : 'Not connected'}</small></button>`;
    }).join('');
    $('#systemAlertList').innerHTML = data.alerts?.length ? data.alerts.map((item) => `<div class="alert-row ${escapeHtml(item.level)}"><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></div><button data-alert-view="${escapeHtml(item.view)}" data-alert-tab="${escapeHtml(item.tab || '')}">Review →</button></div>`).join('') : '<div class="empty-mini">No operational exceptions detected.</div>';
    $('#recentAdminActivity').innerHTML = data.recent_admin_activity?.length ? data.recent_admin_activity.map((item) => `<div><div><b>${escapeHtml(item.action.replaceAll('.', ' '))}</b><small>${escapeHtml(item.admin)} · ${formatDate(item.created_at, true)}</small></div><span class="status-chip">${escapeHtml(item.entity)}</span></div>`).join('') : '<div class="empty-mini">No Admin activity yet.</div>';
    $$('[data-open-view]', $('#networkOverview')).forEach((button) => button.addEventListener('click', () => {
      if(button.dataset.openView==='cyber'){
        const cyberButton=$('#openCyberAdmin');
        if(cyberButton){cyberButton.click();return;}
        changeView('approvals');
        return;
      }
      changeView(button.dataset.openView);
    }));
    $$('[data-alert-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.alertView, button.dataset.alertTab)));
  };

  const loadApprovals = async () => {
    const [coreResult,personalSaleResult,lookingRequestResult,serviceProviderResult,healthMedicineResult,healthSpecialistResult,transportResult,pickupStationResult,profileChangesResult,partnerSettlementResult,accommodationCorrectionsResult,accommodationUnitsResult,cyberResult,partnerBillingResult,customerMeetupBillingResult,flashSaleResult,paymentActionsResult,transportRequestsResult] = await Promise.all([
      db.rpc('admin_list_approval_queue'),
      db.rpc('admin_list_personal_sale_approvals'),
      db.rpc('admin_list_looking_request_approvals'),
      db.rpc('admin_list_service_provider_approvals'),
      db.rpc('admin_list_health_medicine_approvals'),
      db.rpc('admin_list_health_specialist_approvals'),
      db.rpc('admin_list_transport_approvals'),
      db.rpc('admin_list_pickup_station_approvals'),
      db.rpc('admin_list_partner_profile_changes'),
      db.rpc('admin_list_partner_settlement_approvals'),
      db.rpc('admin_list_accommodation_corrections'),
      db.rpc('admin_list_accommodation_unit_approvals'),
      db.rpc('admin_list_cyber_approvals'),
      db.rpc('admin_list_partner_billing_approvals'),
      db.rpc('admin_list_premium_customer_meetup_approvals'),
      db.rpc('admin_list_partner_flash_sales'),
      db.rpc('admin_list_pending_payment_actions'),
      db.rpc('admin_list_transport_requests')
    ]);
    if (coreResult.error) throw coreResult.error;
    if (personalSaleResult.error) throw personalSaleResult.error;
    if (lookingRequestResult.error) throw lookingRequestResult.error;
    if (serviceProviderResult.error) throw serviceProviderResult.error;
    if (healthMedicineResult.error) throw healthMedicineResult.error;
    if (healthSpecialistResult.error) throw healthSpecialistResult.error;
    if (transportResult.error) throw transportResult.error;
    if (pickupStationResult.error) throw pickupStationResult.error;
    if (profileChangesResult.error) throw profileChangesResult.error;
    if (partnerSettlementResult.error) throw partnerSettlementResult.error;
    if (accommodationCorrectionsResult.error) throw accommodationCorrectionsResult.error;
    if (accommodationUnitsResult.error) throw accommodationUnitsResult.error;
    if (cyberResult.error) throw cyberResult.error;
    if (partnerBillingResult.error) throw partnerBillingResult.error;
    if (customerMeetupBillingResult.error) throw customerMeetupBillingResult.error;
    if (flashSaleResult.error) throw flashSaleResult.error;
    if (paymentActionsResult.error) throw paymentActionsResult.error;
    if (transportRequestsResult.error) throw transportRequestsResult.error;

    state.approvals = [
      ...(Array.isArray(coreResult.data) ? coreResult.data : []),
      ...(Array.isArray(personalSaleResult.data) ? personalSaleResult.data : []),
      ...(Array.isArray(lookingRequestResult.data) ? lookingRequestResult.data : []),
      ...(Array.isArray(serviceProviderResult.data) ? serviceProviderResult.data : []),
      ...(Array.isArray(healthMedicineResult.data) ? healthMedicineResult.data : []),
      ...(Array.isArray(healthSpecialistResult.data) ? healthSpecialistResult.data : []),
      ...(Array.isArray(transportResult.data) ? transportResult.data : []),
      ...(Array.isArray(pickupStationResult.data) ? pickupStationResult.data : []),
      ...(Array.isArray(profileChangesResult.data) ? profileChangesResult.data : []),
      ...(Array.isArray(partnerSettlementResult.data) ? partnerSettlementResult.data : []),
      ...(Array.isArray(accommodationCorrectionsResult.data) ? accommodationCorrectionsResult.data : []),
      ...(Array.isArray(accommodationUnitsResult.data) ? accommodationUnitsResult.data : []),
      ...(Array.isArray(cyberResult.data) ? cyberResult.data : []),
      ...(Array.isArray(partnerBillingResult.data) ? partnerBillingResult.data : []),
      ...(Array.isArray(customerMeetupBillingResult.data) ? customerMeetupBillingResult.data : []),
      ...(Array.isArray(flashSaleResult.data) ? flashSaleResult.data.filter((row)=>row.flash_status==='requested').map((row)=>({kind:'partner_flash_sale',record_id:row.item_id,applicant_name:row.partner_name||'LEOGO Partner',applicant_email:'',title:(row.item_name||'Flash Sale')+' — Flash Sale',subtitle:String(row.partner_type||'partner').replaceAll('_',' ')+' · '+formatMoney(row.flash_price_kes)+' · '+formatDate(row.starts_at,true)+' → '+formatDate(row.ends_at,true),status:'requested',submitted_at:row.updated_at,payload:{partner_type:row.partner_type,item_type:row.item_type,normal_price_kes:row.normal_price_kes,flash_price_kes:row.flash_price_kes,flash_quantity:row.flash_quantity,starts_at:row.starts_at,ends_at:row.ends_at,admin_notes:row.admin_notes}})) : [])
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
    updateSidebarActionCounts();

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

  const approvalGroup = (kind) => kind==='partner_flash_sale' ? 'sellers' : kind==='customer_looking_request' ? 'customer_requests' : ['seller_application','seller_profile_change','seller_product','seller_settlement_account'].includes(kind) ? 'sellers' : kind.startsWith('health_medicine_') ? 'health' : ['service_provider_application','service_provider_profile_change','service_listing','service_provider_settlement_account'].includes(kind) ? 'providers' : ['transport_provider_application','transport_provider_profile_change','transport_vehicle','transport_provider_settlement_account','pickup_station_application'].includes(kind) ? 'transport' : kind.startsWith('cyber_') ? 'cyber' : kind.startsWith('premium') ? 'premium' : kind.startsWith('wallet') ? 'wallet' : kind.startsWith('accommodation') ? 'accommodation' : 'other';
  const approvalIsFinancial = (item) => ['premium_payment','partner_subscription_payment','premium_extra_acceptance_payment','premium_customer_meetup_payment'].includes(item.kind) || item.kind.startsWith('wallet') || item.kind.endsWith('_settlement_account');
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
    const health = state.approvals.filter((item) => approvalGroup(item.kind) === 'health').length;
    const customer_requests = state.approvals.filter((item) => approvalGroup(item.kind) === 'customer_requests').length;
    const oldest = [...state.approvals].filter((item) => item.submitted_at).sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
    $('#approvalTotalCount').textContent = state.approvals.length;
    $('#approvalFinancialCount').textContent = financial;
    $('#approvalPremiumCount').textContent = premium;
    $('#approvalAccommodationCount').textContent = accommodation;
    $('#approvalOldestWaiting').textContent = oldest ? waitingAge(oldest.submitted_at) : '—';
    const counts = { all: state.approvals.length, financial, wallet, sellers, health, customer_requests, providers, transport, cyber, premium, accommodation };
    if ($('#sidebarHealthCount')) $('#sidebarHealthCount').textContent = health;
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
    regulatory_licence_path: { label: 'Regulatory Licence', bucket: 'health-medicine-verification' },
    professional_certificate_path: { label: 'Professional Certificate', bucket: 'health-medicine-verification' },
    transport_operator_permit_path: { label: 'Transport / Operator Permit', bucket: 'transport-verification' },
    vehicle_profile_picture_path: { label: 'Vehicle Profile Picture', bucket: 'transport-public-media', publicBucket: true },
    driver_passport_photo_path: { label: 'Driver Passport Photo — Admin Only', bucket: 'transport-driver-private' },

    main_image_path: { label: 'Product Main Image', bucket: 'seller-product-media' },
    gallery_image_paths: { label: 'Product Gallery Image', bucket: 'seller-product-media', multiple: true },
    variant_image_paths: { label: 'Variant Image', bucket: 'seller-product-media', multiple: true },
    item_image_path: { label: 'Item Picture', bucket: 'customer-sale-media' },
    ownership_proof_path: { label: 'Ownership Proof', bucket: 'customer-sale-verification' },
    identity_front_path: { label: 'ID / Passport Front', bucket: 'loan-private-documents' },
    identity_back_path: { label: 'ID / Passport Back', bucket: 'loan-private-documents' },
    applicant_passport_photo_path: { label: 'Applicant Passport-size Photo', bucket: 'loan-private-documents' },
    asset_photo_paths: { label: 'Asset Photo', bucket: 'loan-asset-media', multiple: true },
    received_photo_paths: { label: 'Pickup Station Receiving Photo', bucket: 'loan-asset-media', multiple: true },
    inspection_photo_paths: { label: 'Asset Inspection Photo', bucket: 'loan-asset-media', multiple: true },
    release_photo_path: { label: 'Asset Release Photo', bucket: 'loan-asset-media' },
    cyber_product_image_path: { label: 'Cyber Product Picture', bucket: 'cyber-public-media', publicBucket: true },
    health_product_image_path: { label: 'Health Product Picture', bucket: 'health-medicine-public-media', publicBucket: true },
    health_service_image_path: { label: 'Health Specialist Service Picture', bucket: 'health-medicine-public-media', publicBucket: true },

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
    const healthVerificationFields = new Set(['business_id_document_path','business_licence_path','regulatory_licence_path','professional_certificate_path','registration_certificate_path','other_permit_paths']);
    const pickupStationVerificationFields = new Set(['business_id_document_path','business_licence_path','registration_certificate_path','other_permit_paths']);
    Object.entries(approvalMediaFields).forEach(([key, config]) => {
      let resolvedConfig = config;
      if (kind === 'health_medicine_application' && key === 'profile_picture_path') {
        resolvedConfig = { ...config, bucket:'health-medicine-public-media', publicBucket:true, label:'Health Partner Profile Picture' };
      } else if (kind === 'health_medicine_application' && healthVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket:'health-medicine-verification', publicBucket:false };
      } else if (kind === 'health_medicine_product' && key === 'health_product_image_path') {
        resolvedConfig = { ...config, bucket:'health-medicine-public-media', publicBucket:true, label:'Health Product Picture' };
      } else if (kind === 'health_medicine_service' && key === 'health_service_image_path') {
        resolvedConfig = { ...config, bucket:'health-medicine-public-media', publicBucket:true, label:'Health Specialist Service Picture' };
      } else if (['cyber_application','cyber_profile_change'].includes(kind) && key === 'profile_picture_path') {
        resolvedConfig = { ...config, bucket:'cyber-public-media', publicBucket:true, label:'Cyber Shop Profile Picture' };
      } else if (['cyber_application','cyber_profile_change'].includes(kind) && cyberVerificationFields.has(key)) {
        resolvedConfig = { ...config, bucket:'cyber-verification', publicBucket:false };
      } else if (kind === 'cyber_product' && key === 'cyber_product_image_path') {
        resolvedConfig = { ...config, bucket:'cyber-public-media', publicBucket:true, label:'Cyber Product Picture' };
      } else if (kind === 'wallet_loan' && ['identity_front_path','identity_back_path','applicant_passport_photo_path','ownership_proof_path'].includes(key)) {
        resolvedConfig = { ...config, bucket:'loan-private-documents', publicBucket:false };
      } else if (kind === 'wallet_loan' && ['asset_photo_paths','received_photo_paths','inspection_photo_paths','release_photo_path'].includes(key)) {
        resolvedConfig = { ...config, bucket:'loan-asset-media', publicBucket:false };
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
    let item = state.approvals.find((entry) => entry.kind === kind && String(entry.record_id) === String(id));
    if (!item) return;
    if (kind === 'wallet_loan') {
      try {
        const { data } = await db.rpc('admin_list_wallet_loan_applications_v2');
        const detail = (Array.isArray(data) ? data : []).find((row) => String(row.id) === String(id));
        if (detail) item = { ...item, payload: { ...(item.payload || {}), ...detail, ...(detail.collateral || {}) } };
      } catch (_error) {}
    }
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
    const awaitingCorrection = ['seller_application','seller_profile_change','seller_product','service_provider_application','service_provider_profile_change','service_listing','health_medicine_application','health_medicine_product','health_medicine_service','transport_provider_application','transport_provider_profile_change','transport_vehicle','pickup_station_application','accommodation_host','accommodation_provider_profile_change','premium_partner_profile_change','cyber_application','cyber_service','cyber_product','cyber_profile_change'].includes(kind) && item.status === 'changes_requested';
    const settlementAccountApproval = ['seller_settlement_account','service_provider_settlement_account','transport_provider_settlement_account'].includes(kind);
    underReview.hidden = ['premium_payment','partner_subscription_payment','premium_extra_acceptance_payment','premium_customer_meetup_payment','wallet_deposit','wallet_withdrawal'].includes(kind) || awaitingCorrection || settlementAccountApproval;
    requestChanges.hidden = !['seller_application','seller_profile_change','seller_product','service_provider_application','service_provider_profile_change','service_listing','health_medicine_application','health_medicine_product','health_medicine_service','transport_provider_application','transport_provider_profile_change','transport_vehicle','pickup_station_application','accommodation_host','accommodation_provider_profile_change','premium_partner_profile_change','cyber_application','cyber_service','cyber_product','cyber_profile_change','premium_customer', 'premium_profile'].includes(kind) || awaitingCorrection || kind === 'customer_personal_sale' || settlementAccountApproval;
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
      const rpcName = item.kind==='partner_flash_sale'
        ? 'admin_review_partner_flash_sale'
        : item.kind==='premium_customer_meetup_payment'
        ? 'admin_review_premium_customer_meetup_payment'
        : ['partner_subscription_payment','premium_extra_acceptance_payment'].includes(item.kind)
        ? 'admin_review_partner_billing_payment'
        : item.kind === 'health_medicine_application'
        ? 'admin_review_health_medicine_application'
        : item.kind === 'health_medicine_product'
          ? 'admin_review_health_medicine_product'
        : item.kind === 'health_medicine_service'
          ? 'admin_review_health_specialist_service'
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
                    : item.kind === 'customer_looking_request'
                      ? 'admin_review_looking_request'
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
      const rpcArgs = item.kind==='partner_flash_sale'
        ? { p_partner_type: item.payload?.partner_type, p_item_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : item.kind==='premium_customer_meetup_payment'
        ? { p_payment_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : ['partner_subscription_payment','premium_extra_acceptance_payment'].includes(item.kind)
        ? { p_payment_id: item.record_id, p_decision: decision, p_notes: notes || null }
        : ['health_medicine_application','health_medicine_product','health_medicine_service'].includes(item.kind)
        ? { p_record_id: item.record_id, p_decision: decision, p_notes: notes || null }
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
                    : ['seller_application','seller_product','customer_personal_sale','customer_looking_request','service_provider_application','service_listing','transport_provider_application','transport_vehicle','pickup_station_application'].includes(item.kind)
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
      if(window.leogoLoadHealthMedicineAdmin)refreshers.push(window.leogoLoadHealthMedicineAdmin());
      if(window.leogoLoadHealthSpecialistAdmin)refreshers.push(window.leogoLoadHealthSpecialistAdmin());
      if(isSuperAdmin()) refreshers.push(loadAuditLog());
      if(adminHas('settlements.read')) refreshers.push(loadSellerSettlements());
      await Promise.allSettled(refreshers);
    });
  };

  const STAFF_PERMISSION_DEFS = [
    ['dashboard.read','Dashboard & Monitoring','View operational dashboard, live metrics and Wallet loan overview','Dashboard · network summaries · action counts · Wallet loan overview'],
    ['approvals.read','Approvals & Partner Onboarding','View Approval Center and approval-backed partner/customer queues','Seller / product approvals · Service Providers · Transport · Cyber · Premium applications · Accommodation · Wallet approvals · Flash Sales'],
    ['approvals.manage','Approvals & Partner Onboarding','Approve, reject, return and moderate approval-backed requests','Partner applications · products/listings · Flash Sales · service operations · feedback · loan reviews'],
    ['orders.read','Orders & Fulfilment','View marketplace orders and order-linked operational records','Orders · Assisted Shopping · Aftersales · Group Orders · Delivery Jobs · Rider records'],
    ['orders.write','Orders & Fulfilment','Perform limited operational order updates','Pickup Station return status and other supported operational write actions'],
    ['orders.manage','Orders & Fulfilment','Manage fulfilment, Assisted Shopping, Aftersales, Group Orders and sorting controls','Order operations · Assisted Shopping quotes/assignment/cancellation · Aftersales · Group Orders · Sorting Center · Rider assignment'],
    ['orders.payment_verify','Payments & Finance','Verify or reject customer/order payments','Marketplace · Group Order · Service/Cyber payment verification where supported'],
    ['delivery.manage','Transport, Rider & Pickup','Manage Rider assignments, transport operations and Pickup Stations','Riders · Transport requests/providers/vehicles · delivery jobs · Pickup Stations · returns · delivery operations'],
    ['customers.read','Customers','View customer accounts and customer-submitted records','Customer directory · customer details · feedback/testimonial visibility'],
    ['support.chat','Customer Care','Handle assigned private Customer Care conversations','Customer Care inbox · claim/reply/close assigned chats'],
    ['sellers.read','Sellers','View Seller accounts and Seller operational records','Seller directory · Seller record visibility'],
    ['settlements.read','Settlements','View settlement accounts, requests and payout history','Seller · Service Provider · Transport Provider settlement records'],
    ['settlements.manage','Settlements','Approve settlement accounts and process payouts','Settlement account review · settlement requests · payout recording'],
    ['products.read','Marketplace Catalogue','View products, categories, listings and approved reviews','Products · categories · personal marketplace · product/service review visibility'],
    ['products.manage','Marketplace Catalogue','Manage product/listing visibility and moderation','Catalogue management · product reviews · personal-sale status/interests'],
    ['premium.read','Premium','View Premium customer/profile/subscription records','Premium profiles · Premium customers · subscription records'],
    ['premium.manage','Premium','Manage Premium records and plans','Premium plans · supported Premium management actions'],
    ['reports.export','Reports & Data','Open reports and export operational/financial data','Report catalogue · PDF/Excel exports · Loyalty dashboard read access'],
    ['data.read','Reports & Data','Read protected operational media/data where explicitly supported','Protected Premium/media data access used by secured system functions'],
    ['payments.manage','Payments & Finance','Manage LEOGO payment accounts and assignments — highly sensitive','Till / Paybill / Bank destinations · payment account status and routing'],
    ['settings.read','System Configuration','Read supported system/service configuration','Read-only configuration access where a module supports it'],
    ['fees.manage','System Configuration','Manage supported fee, commission and reward rules','Wallet/Loyalty rules · order fees · subscriptions · accommodation/transport/pickup finance settings'],
    ['settings.manage','System Configuration','Manage business, notification, delivery and system settings — highly sensitive','Business identity · email notifications · advertisements · delivery/service settings · system preferences']
  ];

  const STAFF_PERMISSION_GROUP_INFO = {
    'Dashboard & Monitoring':'Operational overview and high-level monitoring.',
    'Approvals & Partner Onboarding':'Approval Center, partner onboarding and moderation responsibilities.',
    'Orders & Fulfilment':'Marketplace order, Assisted Shopping, Aftersales and fulfilment responsibilities.',
    'Transport, Rider & Pickup':'Rider, Transport/Parcel, delivery and Pickup Station responsibilities.',
    'Customers':'Customer records and customer-submitted information.',
    'Customer Care':'Private Customer Care communication.',
    'Sellers':'Seller account visibility.',
    'Settlements':'Partner settlement review and payout responsibilities.',
    'Marketplace Catalogue':'Products, categories, listings and review moderation.',
    'Premium':'Premium customer/profile/subscription responsibilities.',
    'Payments & Finance':'Payment verification and payment-account responsibilities.',
    'Reports & Data':'Reports, exports and protected operational data.',
    'System Configuration':'Fees and system configuration responsibilities.'
  };

  const STAFF_PERMISSION_DEPENDENCIES = {
    'approvals.manage':['approvals.read'],
    'orders.write':['orders.read'],
    'orders.manage':['orders.read'],
    'orders.payment_verify':['orders.read'],
    'settlements.manage':['settlements.read'],
    'products.manage':['products.read'],
    'premium.manage':['premium.read'],
    'settings.manage':['settings.read']
  };

  const STAFF_SENSITIVE_PERMISSIONS = new Set([
    'approvals.manage','orders.manage','orders.payment_verify','settlements.manage',
    'premium.manage','payments.manage','fees.manage','settings.manage'
  ]);

  const normalizeStaffPermissionValues = (values = []) => {
    const chosen=new Set(Array.isArray(values)?values:[]);
    let changed=true;
    while(changed){
      changed=false;
      [...chosen].forEach((code)=>{
        (STAFF_PERMISSION_DEPENDENCIES[code]||[]).forEach((dependency)=>{
          if(!chosen.has(dependency)){chosen.add(dependency);changed=true;}
        });
      });
    }
    return [...chosen];
  };

  const selectedPermissionValues = (container) =>
    normalizeStaffPermissionValues([...(container?.querySelectorAll('input[data-staff-permission]:checked') || [])].map((input) => input.value));

  const presetForRole = (role) => state.staffRolePresets.find((preset) => preset.code === role);

  const syncPermissionDependencies = (container) => {
    if(!container)return;
    const normalized=new Set(selectedPermissionValues(container));
    container.querySelectorAll('input[data-staff-permission]').forEach((input)=>{
      input.checked=normalized.has(input.value);
    });
  };

  const renderPermissionGrid = (container, selected = []) => {
    if (!container) return;
    const chosen = new Set(normalizeStaffPermissionValues(selected));
    const grouped=new Map();
    STAFF_PERMISSION_DEFS.forEach((definition)=>{
      const group=definition[1];
      if(!grouped.has(group))grouped.set(group,[]);
      grouped.get(group).push(definition);
    });

    container.innerHTML=[...grouped.entries()].map(([group,definitions])=>
      '<section class="staff-permission-group">'+
        '<header><strong>'+escapeHtml(group)+'</strong><small>'+escapeHtml(STAFF_PERMISSION_GROUP_INFO[group]||'')+'</small></header>'+
        '<div class="staff-permission-group-list">'+definitions.map(([code,_group,label,coverage]) =>
          '<label class="staff-permission-option'+(STAFF_SENSITIVE_PERMISSIONS.has(code)?' sensitive':'')+'">'+
            '<input type="checkbox" data-staff-permission value="'+escapeHtml(code)+'" '+(chosen.has(code)?'checked':'')+'>'+
            '<span><b>'+escapeHtml(label)+'</b><small>'+escapeHtml(code)+(STAFF_SENSITIVE_PERMISSIONS.has(code)?' · Sensitive':'')+'</small><em>'+escapeHtml(coverage||'')+'</em></span>'+
          '</label>'
        ).join('')+'</div>'+
      '</section>'
    ).join('');

    container.querySelectorAll('input[data-staff-permission]').forEach((input)=>input.addEventListener('change',()=>{
      if(input.checked)syncPermissionDependencies(container);
    }));
  };

  const setAllStaffPermissions = (container, checked) => {
    if(!container)return;
    container.querySelectorAll('input[data-staff-permission]').forEach((input)=>{input.checked=checked;});
    if(checked)syncPermissionDependencies(container);
  };

  const renderStaffRoleOptions = () => {
    const options = state.staffRolePresets.map((preset) =>
      '<option value="'+escapeHtml(preset.code)+'">'+escapeHtml(preset.label)+'</option>'
    ).join('');
    if ($('#staffRole')) $('#staffRole').innerHTML=options;
    if ($('#staffEditorRole')) $('#staffEditorRole').innerHTML=options;
  };

  const normalizeLocationText=(value)=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const staffLocationLabel=(staff)=>[staff?.sub_county,staff?.county].filter(Boolean).join(', ')||'Location not set';

  const setStaffLocationSelection=(countySelect,subCountySelect,countyCode='',subCountyCode='')=>{
    if(!countySelect||!subCountySelect)return;
    const counties=Array.isArray(state.serviceCounties)?state.serviceCounties:[];
    const subcounties=Array.isArray(state.serviceSubcounties)?state.serviceSubcounties:[];
    countySelect.innerHTML='<option value="">Choose county</option>'+counties.map((county)=>
      '<option value="'+escapeHtml(county.code)+'">'+escapeHtml(county.name)+'</option>'
    ).join('');
    countySelect.value=counties.some((county)=>county.code===countyCode)?countyCode:'';
    const filtered=countySelect.value?subcounties.filter((sub)=>sub.county_code===countySelect.value):[];
    subCountySelect.innerHTML=countySelect.value
      ? '<option value="">Choose sub-county</option>'+filtered.map((sub)=>'<option value="'+escapeHtml(sub.code)+'">'+escapeHtml(sub.name)+'</option>').join('')
      : '<option value="">Choose county first</option>';
    subCountySelect.disabled=!countySelect.value;
    subCountySelect.value=filtered.some((sub)=>sub.code===subCountyCode)?subCountyCode:'';
  };

  const refreshCreateStaffLocation=()=>{
    const county=$('#staffCounty');
    const subCounty=$('#staffSubCounty');
    const countyCode=county?.value||'';
    const subCountyCode=subCounty?.value||'';
    setStaffLocationSelection(county,subCounty,countyCode,subCountyCode);
  };

  const riderLocationMatchScore=(rider,county,subCounty)=>{
    const riderSub=normalizeLocationText(rider?.sub_county);
    const riderCounty=normalizeLocationText(rider?.county);
    const targetSub=normalizeLocationText(subCounty);
    const targetCounty=normalizeLocationText(county);
    if(targetSub&&riderSub===targetSub)return 2;
    if(targetCounty&&riderCounty===targetCounty)return 1;
    return 0;
  };

  const prioritizeRidersForLocation=(riders,county,subCounty)=>[...(riders||[])].sort((a,b)=>{
    const score=riderLocationMatchScore(b,county,subCounty)-riderLocationMatchScore(a,county,subCounty);
    if(score)return score;
    return String(a.display_name||'').localeCompare(String(b.display_name||''));
  });

  const riderAssignmentLabel=(rider,county,subCounty)=>{
    const match=riderLocationMatchScore(rider,county,subCounty);
    const location=staffLocationLabel(rider);
    const matchLabel=match===2?' · LOCAL MATCH':match===1?' · COUNTY MATCH':'';
    return String(rider.display_name||'Rider')+(rider.vehicle_registration?' · '+rider.vehicle_registration:'')+' · '+location+matchLabel;
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
        staff.job_title,staff.vehicle_type,staff.vehicle_registration,staff.county,staff.sub_county
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
          '<div class="staff-card-meta"><span><small>Department</small><strong>'+escapeHtml(staff.department||'—')+'</strong></span><span><small>Operating location</small><strong>'+escapeHtml(staffLocationLabel(staff))+'</strong></span><span><small>Last sign in</small><strong>'+escapeHtml(formatDate(staff.last_sign_in_at,true))+'</strong></span><span><small>Created</small><strong>'+escapeHtml(formatDate(staff.created_at))+'</strong></span></div>'+
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
    const [directoryResult,presetResult,countyResult,subcountyResult]=await Promise.all([
      db.rpc('admin_list_staff_directory'),
      db.rpc('admin_staff_role_presets'),
      db.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      db.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    if(directoryResult.error) throw directoryResult.error;
    if(presetResult.error) throw presetResult.error;
    if(countyResult.error||subcountyResult.error) throw countyResult.error||subcountyResult.error;
    state.staffDirectory=Array.isArray(directoryResult.data)?directoryResult.data:[];
    state.staffRolePresets=Array.isArray(presetResult.data)?presetResult.data:[];
    state.serviceCounties=Array.isArray(countyResult.data)?countyResult.data:[];
    state.serviceSubcounties=Array.isArray(subcountyResult.data)?subcountyResult.data:[];
    renderStaffRoleOptions();
    refreshCreateStaffLocation();
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
    setStaffLocationSelection($('#staffEditorCounty'),$('#staffEditorSubCounty'),staff.county_code||'',staff.sub_county_code||'');
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
      county_code:$('#staffCounty')?.value||'',
      sub_county_code:$('#staffSubCounty')?.value||'',
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
        setStaffLocationSelection($('#staffCounty'),$('#staffSubCounty'),'','');
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
        p_availability_status:rider?$('#staffEditorAvailability').value:null,
        p_county_code:$('#staffEditorCounty').value||null,
        p_sub_county_code:$('#staffEditorSubCounty').value||null
      };
      const {error}=await db.rpc('admin_update_staff_access_v2',args);
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

  let codFeeAdminRpcUnavailable=false;
  const loadMarketplaceOrders = async ({refreshActiveDetail=false}={}) => {
    const [ordersResult,codQueueResult]=await Promise.all([
      db.rpc('admin_list_marketplace_orders'),
      codFeeAdminRpcUnavailable?Promise.resolve({data:[],error:null}):db.rpc('admin_list_cod_delivery_fee_queue')
    ]);
    if(ordersResult.error)throw ordersResult.error;
    if(codQueueResult.error && (codQueueResult.error.code==='PGRST202'||codQueueResult.error.status===404))codFeeAdminRpcUnavailable=true;
    const codFeeQueue=new Map((Array.isArray(codQueueResult.data)?codQueueResult.data:[])
      .map(item=>[item.order_id,item.status]));
    state.marketplaceOrders=(Array.isArray(ordersResult.data)?ordersResult.data:[])
      .map(order=>({...order,cod_fee_status:codFeeQueue.get(order.id)||'not_required'}));
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
    on_the_way:'On the way',
    delivered_to_pickup_station:'Delivered to Pickup Station — awaiting receipt',
    ready_for_pickup:'Pickup Station received — Ready for Pickup',
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
    $('#adminOrderPaymentPending').textContent=all.filter((o)=>o.payment_status==='submitted'||o.cod_fee_status==='submitted').length;
    $('#adminOrderWithRider').textContent=all.filter((o)=>o.order_status==='with_rider').length;
    $('#adminOrderDelivered').textContent=all.filter((o)=>o.order_status==='delivered').length;
    updateSidebarActionCounts();

    $('#adminMarketplaceOrderBody').innerHTML=orders.length?orders.map((o)=>`<tr class="${state.activeMarketplaceOrderId===o.id?'admin-order-row-active':''}">
      <td><strong>${escapeHtml(o.order_reference)}</strong><small>${formatDate(o.created_at,true)}</small></td>
      <td><strong>${escapeHtml(o.receiver_name)}</strong><small>${escapeHtml(o.customer_email||o.contact_number||'')}</small></td>
      <td><strong>${formatMoney(o.grand_total_kes)}</strong><small>${Number(o.seller_count||0)} Seller(s)</small></td>
      <td><span class="status-chip">${escapeHtml(paymentStatusLabel(o.payment_status))}</span><small>${escapeHtml(String(o.payment_method||'').replaceAll('_',' '))}</small>${o.cod_fee_status==='submitted'?'<small>⚠ COD delivery fee awaiting verification</small>':o.cod_fee_status==='awaiting_payment'?'<small>Delivery fee payment required</small>':''}</td>
      <td><span class="status-chip">${escapeHtml(orderStatusLabel(o.order_status))}</span></td>
      <td><small class="order-payment-proof">${escapeHtml(o.payment_message||'No payment message')}</small></td>
      <td class="settlement-admin-actions admin-order-row-actions">
        <button type="button" data-open-marketplace-order="${escapeHtml(o.id)}">${o.cod_fee_status==='submitted'?'Review COD Fee':'View Order'}</button>
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

  const renderPickupStationHandoverEvidence = async ({loadToken,orderId}={}) => {
    const card=$('#adminOrderPickupHandoverEvidenceCard');
    const host=$('#adminOrderPickupHandoverEvidence');
    const detail=state.activeMarketplaceOrderDetail;
    const order=detail?.order;
    if(!card||!host||!order) return;

    if(String(order.delivery_zone||'').toLowerCase()!=='pickup'){
      card.hidden=true;
      host.innerHTML='';
      return;
    }

    card.hidden=false;
    const evidence=detail.pickup_station_handover||null;
    const evidenceError=detail.pickup_station_handover_error||'';

    if(evidenceError){
      host.innerHTML='<div class="review-media-error">'+escapeHtml(evidenceError)+'</div>';
      return;
    }

    if(!evidence){
      host.innerHTML='<div class="loading-card"><strong>No Pickup Station parcel record yet.</strong><p>The handover evidence will appear here after this order enters the Pickup Station workflow.</p></div>';
      return;
    }

    const statusLabel=String(evidence.parcel_status||'pending').replaceAll('_',' ');
    const summary=
      '<div class="admin-order-delivery-summary">'+
        '<span><small>Pickup Station</small><strong>'+escapeHtml(evidence.pickup_station_name||order.pickup_station_name||'Pickup Station')+'</strong></span>'+
        '<span><small>Parcel status</small><strong>'+escapeHtml(statusLabel)+'</strong></span>'+
        '<span><small>Handed over</small><strong>'+escapeHtml(evidence.handed_over_at?formatDate(evidence.handed_over_at,true):'Not yet')+'</strong></span>'+
      '</div>';

    if(!evidence.handover_photo_path){
      host.innerHTML=summary+
        '<div class="loading-card"><strong>Handover image not captured yet.</strong><p>Once the Pickup Station completes customer handover with the required photo, the evidence will be shown here automatically.</p></div>';
      return;
    }

    host.innerHTML=summary+
      '<div class="review-media">'+
        '<div class="review-media-heading"><span>HANDOVER PHOTO</span><strong>Pickup Station collection evidence</strong><small>Secure Admin-only preview of the image captured when the parcel was released to the customer.</small></div>'+
        '<div class="review-media-grid"><article class="review-media-card" id="adminOrderHandoverEvidenceMedia">'+
          '<div class="review-media-card-head"><strong>Customer Handover Evidence</strong><span>Secure file</span></div>'+
          '<div class="review-media-loading">Loading handover image…</div>'+
        '</article></div>'+
      '</div>';

    try{
      const {data,error}=await db.storage.from('pickup-station-proof').createSignedUrl(String(evidence.handover_photo_path),900);
      if(error) throw error;
      const url=data?.signedUrl||'';
      if(!url) throw new Error('No secure handover image URL was returned.');

      if(loadToken!==state.orderDetailLoadToken || state.activeMarketplaceOrderId!==orderId) return;
      const media=$('#adminOrderHandoverEvidenceMedia');
      if(!media) return;
      media.innerHTML=
        '<div class="review-media-card-head"><strong>Customer Handover Evidence</strong><span>Secure preview</span></div>'+
        '<a class="review-media-image-link" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+
          '<img src="'+escapeHtml(url)+'" alt="Pickup Station customer handover evidence">'+
        '</a>'+
        '<div class="review-media-actions"><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">View full handover image ↗</a></div>';
    }catch(error){
      if(loadToken!==state.orderDetailLoadToken || state.activeMarketplaceOrderId!==orderId) return;
      const media=$('#adminOrderHandoverEvidenceMedia');
      if(media){
        media.innerHTML=
          '<div class="review-media-card-head"><strong>Customer Handover Evidence</strong><span>Preview unavailable</span></div>'+
          '<div class="review-media-error">'+escapeHtml(friendlyError(error))+'</div>';
      }
    }
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
    const qr=await buildDeliveryQrCanvas(qrUrl,230);
    const contentWidth=width-108;

    // Keep the summary full-width. The QR is placed below the summary instead
    // of beside it so the printed label reads naturally from top to bottom.
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
    ctx.fillRect(54,y,contentWidth,82);
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
      ctx.fillRect(54,atY+31,contentWidth,4);
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
    y=canvasWrapText(ctx,orderDeliveryAddress(order),54,y,contentWidth,31,3)+12;

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
        canvasWrapText(ctx,name,112,y,840,29,2);
        ctx.font='700 20px Arial, sans-serif';
        ctx.textAlign='right';
        ctx.fillText(formatMoney(item.line_total_kes),1180,y);
        ctx.textAlign='left';
        y+=58;
        ctx.fillStyle='#e2e8f0';
        ctx.fillRect(54,y-9,contentWidth,1);
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
    ctx.fillRect(54,y,contentWidth,92);
    ctx.fillStyle=codDue?'#a94300':'#177245';
    ctx.font='700 20px Arial, sans-serif';
    ctx.fillText(codDue?'COLLECT ON DELIVERY':'PAYMENT STATUS',72,y+16);
    ctx.font='700 30px Arial, sans-serif';
    ctx.fillText(codDue?formatMoney(codAmountToCollect(order)):paymentStatusLabel(order.payment_status).toUpperCase(),72,y+46);
    ctx.fillStyle='#394960';
    ctx.font='18px Arial, sans-serif';
    ctx.textAlign='right';
    ctx.fillText(String(order.payment_method||'').replaceAll('_',' ').toUpperCase(),1170,y+53);
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
    y=canvasWrapText(ctx,sellers.map((seller)=>seller.business_name).filter(Boolean).join(', ')||'Seller details available in Admin',165,y,1010,26,2)+28;

    if(delivery?.admin_notes){
      ctx.font='700 17px Arial, sans-serif';
      ctx.fillStyle='#07152f';
      ctx.fillText('STAFF / RIDER INSTRUCTIONS',54,y);
      ctx.font='17px Arial, sans-serif';
      ctx.fillStyle='#44526a';
      y=canvasWrapText(ctx,delivery.admin_notes,54,y+28,contentWidth,24,3)+18;
    }

    if(delivery?.rider_notes){
      ctx.font='700 17px Arial, sans-serif';
      ctx.fillStyle='#07152f';
      ctx.fillText('RIDER UPDATE',54,y);
      ctx.font='17px Arial, sans-serif';
      ctx.fillStyle='#44526a';
      y=canvasWrapText(ctx,delivery.rider_notes,54,y+28,contentWidth,24,2)+12;
    }

    // QR block below the order summary.
    const footerY=1658;
    const qrSize=230;
    const qrBlockHeight=qrSize+76;
    const preferredQrY=Math.max(y+22,1260);
    const qrY=Math.min(preferredQrY,footerY-qrBlockHeight-16);
    const qrX=Math.round((width-qrSize)/2);

    ctx.fillStyle='#ffffff';
    ctx.fillRect(qrX-14,qrY-12,qrSize+28,qrBlockHeight);
    ctx.drawImage(qr,qrX,qrY,qrSize,qrSize);
    ctx.fillStyle='#07152f';
    ctx.font='700 17px Arial, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('SCAN ORDER',width/2,qrY+qrSize+14);
    ctx.font='700 14px Arial, sans-serif';
    ctx.fillStyle='#5d6b7f';
    ctx.fillText(String(order.order_reference||'LEOGO ORDER'),width/2,qrY+qrSize+40);
    ctx.textAlign='left';

    ctx.fillStyle='#07152f';
    ctx.fillRect(0,footerY,width,height-footerY);
    ctx.fillStyle='#ffffff';
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillText('Permanent LEOGO order QR — authorized Staff and assigned Pickup Station Partners can use it to identify this order.',54,footerY+28);
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

  const codAmountToCollect=(order={})=>{
    const external=Number(order.external_amount_due_kes??order.grand_total_kes??0);
    const alreadyPaid=order.payment_method==='cod' && order.cod_delivery_fee_status==='verified'
      ? Math.min(external,Number(order.delivery_fee_kes||0)):0;
    return Math.max(0,Math.round((external-alreadyPaid)*100)/100);
  };
  const orderSummaryPaymentDisplay = (order={}) => {
    const status=String(order.payment_status||'').toLowerCase();
    const pointsUsed=Number(order.reward_points_redeemed_kes||0);
    const rawMethod=String(order.payment_method||'').replaceAll('_',' ').trim().toUpperCase();
    const method=rawMethod||(pointsUsed>0?'LEOGO POINTS':'PAYMENT');
    if(status==='cod_due'){
      return {
        primary:'CASH ON DELIVERY',
        secondary:method==='PAYMENT'?'COD':method,
        amountLabel:'AMOUNT TO COLLECT',
        amount:formatMoney(codAmountToCollect(order))
      };
    }
    if(status==='cod_paid'){
      return {
        primary:'PAID ON DELIVERY',
        secondary:method==='PAYMENT'?'COD':method,
        amountLabel:'TOTAL ORDER',
        amount:formatMoney(order.grand_total_kes)
      };
    }
    if(status==='verified_paid'){
      return {
        primary:'PREPAID / PAID',
        secondary:method,
        amountLabel:'TOTAL ORDER',
        amount:formatMoney(order.grand_total_kes)
      };
    }
    if(status==='submitted'){
      return {
        primary:'PREPAID — AWAITING VERIFICATION',
        secondary:method,
        amountLabel:'TOTAL ORDER',
        amount:formatMoney(order.grand_total_kes)
      };
    }
    return {
      primary:paymentStatusLabel(order.payment_status).toUpperCase(),
      secondary:method,
      amountLabel:'TOTAL ORDER',
      amount:formatMoney(order.grand_total_kes)
    };
  };

  const buildOrderAddressSummaryCanvas = async (detail) => {
    if(!detail?.order) throw new Error('Open an order before generating its address summary.');

    const order=detail.order;
    const payment=orderSummaryPaymentDisplay(order);
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
    ctx.font='700 25px Arial, sans-serif';
    ctx.fillStyle='#ffb26e';
    ctx.fillText('ADDRESS / DELIVERY SUMMARY',205,110);
    ctx.font='18px Arial, sans-serif';
    ctx.fillStyle='#d7dfeb';
    ctx.fillText('Privacy label — order items intentionally hidden.',205,150);

    const contentWidth=width-108;
    let y=292;

    ctx.fillStyle='#6b778b';
    ctx.font='700 16px Arial, sans-serif';
    ctx.fillText('ORDER NUMBER',54,y);
    y+=30;
    ctx.fillStyle='#07152f';
    ctx.font='700 40px Arial, sans-serif';
    ctx.fillText(String(order.order_reference||'ORDER'),54,y);
    y+=62;

    ctx.fillStyle='#6b778b';
    ctx.font='700 16px Arial, sans-serif';
    ctx.fillText('ORDER DATE',54,y);
    ctx.fillStyle='#07152f';
    ctx.font='700 20px Arial, sans-serif';
    ctx.fillText(formatDate(order.created_at,true),190,y-2);
    y+=54;

    ctx.fillStyle='#f3f6f9';
    ctx.fillRect(54,y,contentWidth,4);
    y+=34;

    ctx.fillStyle='#07152f';
    ctx.font='700 22px Arial, sans-serif';
    ctx.fillText('DELIVER TO',54,y);
    y+=42;
    ctx.font='700 38px Arial, sans-serif';
    ctx.fillText(String(order.receiver_name||'Receiver'),54,y);
    y+=58;
    ctx.font='700 28px Arial, sans-serif';
    ctx.fillStyle='#26364f';
    ctx.fillText(String(order.contact_number||'No phone'),54,y);
    y+=50;
    ctx.font='28px Arial, sans-serif';
    ctx.fillStyle='#34445d';
    y=canvasWrapText(ctx,orderDeliveryAddress(order),54,y,contentWidth,40,4)+26;

    ctx.fillStyle='#ff7800';
    ctx.fillRect(54,y,contentWidth,4);
    y+=34;

    ctx.fillStyle='#07152f';
    ctx.font='700 22px Arial, sans-serif';
    ctx.fillText('PAYMENT',54,y);
    y+=42;

    const paymentBoxY=y;
    ctx.fillStyle=String(order.payment_status||'')==='cod_due'?'#fff0e5':'#edf9f1';
    ctx.fillRect(54,paymentBoxY,contentWidth,180);
    ctx.fillStyle=String(order.payment_status||'')==='cod_due'?'#a94300':'#177245';
    ctx.font='700 28px Arial, sans-serif';
    ctx.fillText(payment.primary,76,paymentBoxY+22);
    ctx.fillStyle='#07152f';
    ctx.font='700 38px Arial, sans-serif';
    ctx.fillText(payment.amount,76,paymentBoxY+72);
    ctx.fillStyle='#4c5a6c';
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillText(payment.amountLabel,76,paymentBoxY+120);
    ctx.textAlign='right';
    ctx.font='700 22px Arial, sans-serif';
    ctx.fillText(payment.secondary,1160,paymentBoxY+76);
    ctx.textAlign='left';
    y+=220;

    const qr=await buildDeliveryQrCanvas(deliveryQrTarget(order),330);
    const qrSize=330;
    const qrX=Math.round((width-qrSize)/2);
    const qrY=Math.max(y+18,1070);
    ctx.drawImage(qr,qrX,qrY,qrSize,qrSize);
    ctx.fillStyle='#07152f';
    ctx.textAlign='center';
    ctx.font='700 24px Arial, sans-serif';
    ctx.fillText('SCAN ORDER',width/2,qrY+qrSize+20);
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillStyle='#5d6b7f';
    ctx.fillText(String(order.order_reference||'LEOGO ORDER'),width/2,qrY+qrSize+58);
    ctx.textAlign='left';

    const footerY=1658;
    ctx.fillStyle='#07152f';
    ctx.fillRect(0,footerY,width,height-footerY);
    ctx.fillStyle='#ffffff';
    ctx.font='700 18px Arial, sans-serif';
    ctx.fillText('Authorized LEOGO address summary — item details intentionally excluded for customer privacy.',54,footerY+28);
    ctx.font='16px Arial, sans-serif';
    ctx.fillStyle='#c9d4e4';
    ctx.fillText('Printed '+formatDate(new Date().toISOString(),true)+'  |  Keep this label with the parcel until final handover.',54,footerY+62);

    return canvas;
  };

  const buildOrderAddressThermalReceiptHtml = async (detail) => {
    if(!detail?.order) throw new Error('Open an order before printing its address summary.');

    const order=detail.order;
    const payment=orderSummaryPaymentDisplay(order);
    const qr=await buildDeliveryQrCanvas(deliveryQrTarget(order),300);
    const qrDataUrl=qr.toDataURL('image/png');
    const logoUrl=new URL('../assets/images/leogo-official-logo.jpg',window.location.href).href;
    const printedAt=formatDate(new Date().toISOString(),true);
    const orderDate=formatDate(order.created_at,true);

    return '<!doctype html><html><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title></title>'+
      '<style>'+
        '@page{margin:0;}'+
        '*{box-sizing:border-box;}'+
        'html,body{width:80mm;min-width:80mm;max-width:80mm;margin:0;padding:0;background:#fff;color:#000;}'+
        'body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'+
        '.receipt{width:72mm;margin:0 auto;padding:1mm 0 1.4mm;font-size:7.6pt;line-height:1.08;font-weight:800;color:#000;}'+
        '.receipt-header{display:grid;grid-template-columns:10mm minmax(0,1fr);gap:2mm;align-items:center;}'+
        '.receipt-logo{width:9mm;height:9mm;object-fit:cover;filter:grayscale(1) contrast(1.3);}'+
        '.receipt-header h1{margin:0;font-size:10.2pt;line-height:1;font-weight:900;}'+
        '.receipt-title-line{display:flex;align-items:baseline;justify-content:space-between;gap:1.5mm;margin:.35mm 0 0;}'+
        '.receipt-title-line h2{margin:0;font-size:6.9pt;font-weight:900;white-space:nowrap;}'+
        '.receipt-print-time{font-size:5.5pt;font-weight:900;white-space:nowrap;}'+
        '.receipt-header p{margin:.28mm 0 0;font-size:6.1pt;font-weight:800;}'+
        '.receipt-rule{border:0;border-top:1px dashed #000;margin:.9mm 0;}'+
        '.receipt-reference{display:flex;align-items:baseline;gap:1.2mm;}'+
        '.receipt-reference small{font-size:6.2pt;font-weight:900;white-space:nowrap;}'+
        '.receipt-reference strong{font-size:8.6pt;font-weight:900;word-break:break-word;}'+
        '.receipt-row{display:flex;justify-content:space-between;gap:2mm;font-size:7.1pt;margin:.25mm 0;}'+
        '.receipt-row span{font-weight:800;}'+
        '.receipt-row strong{text-align:right;font-weight:900;}'+
        '.receipt-section h3{margin:0 0 .4mm;font-size:6.8pt;font-weight:900;letter-spacing:.2px;}'+
        '.receipt-section p{margin:.2mm 0;font-size:7.4pt;font-weight:800;line-height:1.09;overflow-wrap:anywhere;}'+
        '.receipt-section .customer{font-size:9.1pt;font-weight:900;}'+
        '.receipt-section .phone{font-size:8.2pt;font-weight:900;}'+
        '.payment-box{border:1.4px solid #000;padding:1mm 1.2mm;margin:.35mm 0;}'+
        '.payment-box strong{display:block;font-size:8.4pt;font-weight:900;}'+
        '.payment-box .amount{font-size:10pt;margin:.5mm 0;}'+
        '.payment-box small{display:block;font-size:6.4pt;font-weight:900;}'+
        '.receipt-qr{text-align:center;margin-top:.3mm;break-inside:avoid;}'+
        '.receipt-qr img{display:block;width:23mm;height:23mm;margin:0 auto;image-rendering:pixelated;image-rendering:crisp-edges;}'+
        '.receipt-qr strong{display:block;margin-top:.3mm;font-size:7pt;font-weight:900;}'+
        '.receipt-qr small{display:block;margin-top:.15mm;font-size:6pt;font-weight:800;}'+
        '.receipt-footer{margin-top:.45mm;text-align:center;font-size:5.9pt;font-weight:800;line-height:1.08;}'+
        '@media print{html,body{width:80mm!important;height:auto!important;overflow:visible!important;margin:0!important}.receipt{width:72mm!important;page-break-after:auto}.receipt-section,.payment-box,.receipt-qr{break-inside:avoid;}}'+
      '</style></head><body>'+
        '<main class="receipt">'+
          '<header class="receipt-header">'+
            '<img class="receipt-logo" src="'+logoUrl+'" alt="LEOGO logo">'+
            '<div>'+
              '<h1>LEOGO DIGITAL MARKET</h1>'+
              '<div class="receipt-title-line"><h2>ADDRESS / DELIVERY SUMMARY</h2><span class="receipt-print-time">'+escapeHtml(printedAt)+'</span></div>'+
              '<p>Private label — order items hidden</p>'+
            '</div>'+
          '</header>'+
          '<hr class="receipt-rule">'+
          '<div class="receipt-reference"><small>ORDER NO.</small><strong>'+escapeHtml(order.order_reference||'ORDER')+'</strong></div>'+
          '<div class="receipt-row"><span>Order date</span><strong>'+escapeHtml(orderDate)+'</strong></div>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section">'+
            '<h3>DELIVER TO</h3>'+
            '<p class="customer">'+escapeHtml(order.receiver_name||'Receiver')+'</p>'+
            '<p class="phone">'+escapeHtml(order.contact_number||'No phone')+'</p>'+
            '<p>'+escapeHtml(orderDeliveryAddress(order))+'</p>'+
          '</section>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section">'+
            '<h3>PAYMENT</h3>'+
            '<div class="payment-box">'+
              '<strong>'+escapeHtml(payment.primary)+'</strong>'+
              '<strong class="amount">'+escapeHtml(payment.amount)+'</strong>'+
              '<small>'+escapeHtml(payment.amountLabel)+' · '+escapeHtml(payment.secondary)+'</small>'+
            '</div>'+
          '</section>'+
          '<hr class="receipt-rule">'+
          '<div class="receipt-qr">'+
            '<img src="'+qrDataUrl+'" alt="Order QR">'+
            '<strong>SCAN ORDER</strong>'+
            '<small>'+escapeHtml(order.order_reference||'LEOGO ORDER')+'</small>'+
            '<footer class="receipt-footer">'+
              '<div>Authorized LEOGO address summary.</div>'+
              '<div>Order item details intentionally excluded.</div>'+
            '</footer>'+
          '</div>'+
        '</main>'+
        '<script>window.addEventListener("load",function(){requestAnimationFrame(function(){requestAnimationFrame(function(){var receipt=document.querySelector(".receipt");var pxPerMm=96/25.4;var renderedPx=receipt?receipt.getBoundingClientRect().height:0;var renderedMm=renderedPx/pxPerMm;var heightMm=Math.max(46,Math.min(120,Math.ceil(renderedMm+2)));var pageStyle=document.createElement("style");pageStyle.textContent="@page{size:80mm "+heightMm+"mm;margin:0!important}";document.head.appendChild(pageStyle);document.documentElement.style.height=heightMm+"mm";document.body.style.height=heightMm+"mm";document.documentElement.style.overflow="hidden";document.body.style.overflow="hidden";setTimeout(function(){window.print();},180);})})});<\/script>'+
      '</body></html>';
  };

  const downloadOrderDeliverySummary = async () => {
    const detail=state.activeMarketplaceOrderDetail;
    if(!detail?.order) return;
    const summaryType=$('#orderSummaryType')?.value==='address'?'address':'detailed';
    const button=$('#downloadOrderDeliverySummary');
    const original=button?.textContent||'Download Summary + QR';
    const label=summaryType==='address'?'address / delivery summary':'detailed order summary';
    try{
      if(button){button.disabled=true;button.textContent='Preparing Summary…';}
      setFormStatus($('#adminOrderDetailStatus'),'Generating '+label+' with permanent LEOGO order QR…');
      const canvas=summaryType==='address'
        ? await buildOrderAddressSummaryCanvas(detail)
        : await buildOrderDeliverySummaryCanvas(detail);
      const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Delivery summary image could not be created.');
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=(detail.order.order_reference||'LEOGO-order')+(summaryType==='address'?'-address-summary.png':'-order-summary.png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      setFormStatus($('#adminOrderDetailStatus'),(summaryType==='address'?'Address / delivery summary':'Detailed order summary')+' with QR downloaded successfully.','success');
    }catch(error){
      setFormStatus($('#adminOrderDetailStatus'),friendlyError(error),'error');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  };

  const buildOrderThermalReceiptHtml = async (detail) => {
    if(!detail?.order) throw new Error('Open an order before printing its delivery summary.');

    const order=detail.order;
    const items=Array.isArray(detail.items)?detail.items:[];
    const sellers=Array.isArray(detail.sellers)?detail.sellers:[];
    const delivery=detail.delivery||null;
    const qr=await buildDeliveryQrCanvas(deliveryQrTarget(order),300);
    const qrDataUrl=qr.toDataURL('image/png');
    const logoUrl=new URL('../assets/images/leogo-official-logo.jpg',window.location.href).href;
    const codDue=String(order.payment_status||'').toLowerCase()==='cod_due';
    const sellerNames=sellers.map((seller)=>seller.business_name).filter(Boolean).join(', ');
    const printedAt=formatDate(new Date().toISOString(),true);
    const orderDate=formatDate(order.created_at,true);
    const itemLineCount=items.length;

    const itemRows=items.length
      ? items.map((item)=>{
          const name=item.variant_name
            ? String(item.product_name||'Item')+' - '+String(item.variant_name)
            : String(item.product_name||'Item');
          return '<div class="receipt-item">'+
            '<div class="receipt-item-main"><b>'+escapeHtml(String(Number(item.quantity||0)))+' x</b><span>'+escapeHtml(name)+'</span></div>'+
            '<strong>'+escapeHtml(formatMoney(item.line_total_kes))+'</strong>'+
          '</div>';
        }).join('')
      : '<div class="receipt-empty">No order items found.</div>';

    const feeRow=(label,value,always=false)=>{
      const amount=Number(value||0);
      if(!always&&amount===0)return '';
      return '<div class="receipt-money-row"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(formatMoney(amount))+'</strong></div>';
    };

    const noteBlock=(title,value)=>value
      ? '<section class="receipt-section receipt-note"><h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(value)+'</p></section>'
      : '';

    return '<!doctype html><html><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title></title>'+
      '<style>'+
        '@page{margin:0;}'+
        '*{box-sizing:border-box;}'+
        'html,body{width:80mm;min-width:80mm;max-width:80mm;margin:0;padding:0;background:#fff;color:#000;}'+
        'body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'+
        '.receipt{width:72mm;margin:0 auto;padding:1mm 0 1.4mm;font-size:7.4pt;line-height:1.08;font-weight:800;color:#000;transform-origin:top center;}'+
        '.receipt-header{display:grid;grid-template-columns:10mm minmax(0,1fr);gap:2mm;align-items:center;text-align:left;}'+
        '.receipt-logo{width:9mm;height:9mm;object-fit:cover;filter:grayscale(1) contrast(1.3);}'+
        '.receipt-header-copy{min-width:0;}'+
        '.receipt-header h1{margin:0;font-size:10.2pt;line-height:1;font-weight:900;letter-spacing:.1px;}'+
        '.receipt-title-line{display:flex;align-items:baseline;justify-content:space-between;gap:1.5mm;margin:.35mm 0 0;}'+
        '.receipt-header h2{margin:0;font-size:6.9pt;line-height:1.02;font-weight:900;white-space:nowrap;}'+
        '.receipt-print-time{font-size:5.5pt;line-height:1;font-weight:900;text-align:right;white-space:nowrap;}'+
        '.receipt-header p{margin:.28mm 0 0;font-size:6.2pt;font-weight:800;}'+
        '.receipt-rule{border:0;border-top:1px dashed #000;margin:.8mm 0;}'+
        '.receipt-reference{display:flex;align-items:baseline;gap:1.2mm;text-align:left;margin:.2mm 0;}'+
        '.receipt-reference small{display:block;font-size:6.3pt;font-weight:900;white-space:nowrap;}'+
        '.receipt-reference strong{display:block;margin:0;font-size:8.3pt;line-height:1.04;font-weight:900;word-break:break-word;}'+
        '.receipt-status{display:grid;grid-template-columns:1fr;gap:.18mm;text-align:left;font-size:7pt;}'+
        '.receipt-status div{display:flex;justify-content:space-between;gap:2mm;}'+
        '.receipt-status span{font-weight:800;}'+
        '.receipt-status strong{text-align:right;font-weight:900;}'+
        '.receipt-section{margin:0;}'+
        '.receipt-section h3{margin:0 0 .35mm;font-size:6.8pt;font-weight:900;letter-spacing:.2px;}'+
        '.receipt-section p{margin:.18mm 0;font-size:7.2pt;font-weight:800;line-height:1.07;overflow-wrap:anywhere;}'+
        '.receipt-section .primary{font-size:8.2pt;font-weight:900;}'+
        '.receipt-items{display:grid;gap:0;}'+
        '.receipt-item{display:grid;grid-template-columns:minmax(0,1fr) 17mm;gap:.8mm;padding:.45mm 0;border-bottom:1px dotted #000;align-items:start;break-inside:avoid;}'+
        '.receipt-item:last-child{border-bottom:0;}'+
        '.receipt-item-main{display:grid;grid-template-columns:6.5mm minmax(0,1fr);gap:.45mm;min-width:0;}'+
        '.receipt-item-main b{font-size:7.2pt;font-weight:900;}'+
        '.receipt-item-main span{font-size:7.2pt;font-weight:800;line-height:1.06;overflow-wrap:anywhere;}'+
        '.receipt-item>strong{text-align:right;font-size:7.2pt;font-weight:900;white-space:nowrap;}'+
        '.receipt-empty{padding:.5mm 0;font-size:7pt;font-weight:800;}'+
        '.receipt-money{display:grid;gap:.15mm;}'+
        '.receipt-money-row{display:flex;justify-content:space-between;gap:2mm;font-size:7.2pt;}'+
        '.receipt-money-row span{font-weight:800;}'+
        '.receipt-money-row strong{font-weight:900;white-space:nowrap;}'+
        '.receipt-total{margin-top:.35mm;padding-top:.45mm;border-top:1.5px solid #000;font-size:9.4pt;line-height:1.02;font-weight:900;}'+
        '.receipt-total span,.receipt-total strong{font-weight:900;}'+
        '.receipt-note p{font-size:6.8pt;line-height:1.08;font-weight:800;}'+
        '.receipt-meta{display:grid;gap:.16mm;font-size:6.9pt;}'+
        '.receipt-meta div{display:grid;grid-template-columns:12mm minmax(0,1fr);gap:.8mm;}'+
        '.receipt-meta b{font-weight:900;}'+
        '.receipt-meta span{font-weight:800;overflow-wrap:anywhere;}'+
        '.receipt-qr{text-align:center;margin-top:.2mm;break-inside:avoid;}'+
        '.receipt-qr img{display:block;width:19mm;height:19mm;margin:0 auto;image-rendering:pixelated;image-rendering:crisp-edges;}'+
        '.receipt-qr strong{display:block;margin-top:.25mm;font-size:6.8pt;font-weight:900;}'+
        '.receipt-qr small{display:block;margin-top:.15mm;font-size:5.8pt;font-weight:800;overflow-wrap:anywhere;}'+
        '.receipt-footer{margin-top:.45mm;text-align:center;font-size:5.9pt;font-weight:800;line-height:1.08;}'+
        '@media print{html,body{width:80mm!important;height:auto!important;overflow:visible!important;color:#000!important;background:#fff!important;}.receipt{width:72mm!important;page-break-after:auto;}.receipt-section,.receipt-item,.receipt-qr{break-inside:avoid;}}'+
      '</style></head><body>'+
        '<main class="receipt">'+
          '<header class="receipt-header">'+
            '<img class="receipt-logo" src="'+logoUrl+'" alt="LEOGO logo">'+
            '<div class="receipt-header-copy">'+
              '<h1>LEOGO DIGITAL MARKET</h1>'+
              '<div class="receipt-title-line"><h2>ORDER SUMMARY / DELIVERY RECEIPT</h2><span class="receipt-print-time">'+escapeHtml(printedAt)+'</span></div>'+
              '<p>Any market to your Door Step</p>'+
            '</div>'+
          '</header>'+
          '<hr class="receipt-rule">'+
          '<div class="receipt-reference"><small>ORDER REFERENCE</small><strong>'+escapeHtml(order.order_reference||'ORDER')+'</strong></div>'+
          '<div class="receipt-status">'+
            '<div><span>Order</span><strong>'+escapeHtml(orderStatusLabel(order.order_status))+'</strong></div>'+
            '<div><span>Delivery</span><strong>'+escapeHtml(deliveryStatusLabel(delivery?.status||'awaiting_assignment'))+'</strong></div>'+
            '<div><span>Date</span><strong>'+escapeHtml(orderDate)+'</strong></div>'+
          '</div>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section">'+
            '<h3>DELIVER TO</h3>'+
            '<p class="primary">'+escapeHtml(order.receiver_name||'Receiver')+'</p>'+
            '<p>'+escapeHtml(order.contact_number||'No phone')+'</p>'+
            '<p>'+escapeHtml(orderDeliveryAddress(order))+'</p>'+
          '</section>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section">'+
            '<h3>ORDER ITEMS</h3>'+
            '<div class="receipt-items">'+itemRows+'</div>'+
          '</section>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section receipt-money">'+
            '<h3>PAYMENT</h3>'+
            feeRow('Items subtotal',order.items_subtotal_kes,true)+
            feeRow('Service fee',order.service_fee_kes)+
            feeRow('Pickup fee',order.pickup_fee_kes)+
            feeRow('Delivery fee',order.delivery_fee_kes)+
            (Number(order.reward_points_redeemed_kes||0)>0?feeRow('LEOGO Points used',order.reward_points_redeemed_kes,true):'')+
            '<div class="receipt-money-row receipt-total"><span>TOTAL</span><strong>'+escapeHtml(formatMoney(order.grand_total_kes))+'</strong></div>'+
            '<div class="receipt-money-row"><span>Method</span><strong>'+escapeHtml(String(order.payment_method||'').replaceAll('_',' ').toUpperCase())+'</strong></div>'+
            '<div class="receipt-money-row"><span>Status</span><strong>'+escapeHtml(codDue?'COLLECT ON DELIVERY':paymentStatusLabel(order.payment_status).toUpperCase())+'</strong></div>'+
            (codDue?'<div class="receipt-money-row"><span>Amount to collect</span><strong>'+escapeHtml(formatMoney(codAmountToCollect(order)))+'</strong></div>':'')+
          '</section>'+
          '<hr class="receipt-rule">'+
          '<section class="receipt-section receipt-meta">'+
            '<h3>FULFILMENT</h3>'+
            '<div><b>Rider</b><span>'+escapeHtml(delivery?.rider_name||'Not yet assigned')+'</span></div>'+
            (delivery?.rider_phone?'<div><b>Phone</b><span>'+escapeHtml(delivery.rider_phone)+'</span></div>':'')+
            '<div><b>Seller(s)</b><span>'+escapeHtml(sellerNames||'Seller details available in Admin')+'</span></div>'+
          '</section>'+
          noteBlock('STAFF / RIDER INSTRUCTIONS',delivery?.admin_notes)+
          noteBlock('RIDER UPDATE',delivery?.rider_notes)+
          '<hr class="receipt-rule">'+
          '<div class="receipt-qr">'+
            '<img src="'+qrDataUrl+'" alt="Order QR">'+
            '<strong>SCAN ORDER</strong>'+
            '<small>'+escapeHtml(order.order_reference||'LEOGO ORDER')+'</small>'+
            '<footer class="receipt-footer">'+
              '<div>Authorized LEOGO order summary.</div>'+
              '<div>Keep this receipt with the order until final handover.</div>'+
            '</footer>'+
          '</div>'+
        '</main>'+
        '<script>window.addEventListener("load",function(){requestAnimationFrame(function(){requestAnimationFrame(function(){var receipt=document.querySelector(".receipt");var pxPerMm=96/25.4;var itemLineCount='+JSON.stringify(itemLineCount)+';var naturalPx=receipt?receipt.getBoundingClientRect().height:0;var naturalMm=naturalPx/pxPerMm;var targetShortReceiptMm=116;if(receipt&&itemLineCount<=1&&naturalMm>targetShortReceiptMm){receipt.style.zoom=String(targetShortReceiptMm/naturalMm);}requestAnimationFrame(function(){var renderedPx=receipt?receipt.getBoundingClientRect().height:0;var renderedMm=renderedPx/pxPerMm;var heightMm=Math.max(38,Math.ceil(renderedMm+2));if(itemLineCount<=1){heightMm=Math.min(120,heightMm);}var pageStyle=document.createElement("style");pageStyle.textContent="@page{size:80mm "+heightMm+"mm;margin:0!important}";document.head.appendChild(pageStyle);document.documentElement.style.height=heightMm+"mm";document.body.style.height=heightMm+"mm";document.documentElement.style.overflow="hidden";document.body.style.overflow="hidden";setTimeout(function(){window.print();},180);})})})});<\/script>'+
      '</body></html>';
  };

  const printOrderDeliverySummary = async () => {
    const detail=state.activeMarketplaceOrderDetail;
    if(!detail?.order) return;

    const paperSize=$('#orderSummaryPaperSize')?.value||'a6';
    const summaryType=$('#orderSummaryType')?.value==='address'?'address':'detailed';
    const popup=window.open('','_blank',paperSize==='80mm'?'width=430,height=820':'width=900,height=1100');
    if(!popup){
      setFormStatus($('#adminOrderDetailStatus'),'Your browser blocked the print window. Allow pop-ups for LEOGO Admin and try again.','error');
      return;
    }

    const button=$('#printOrderDeliverySummary');
    const original=button?.textContent||'Print Selected Summary';
    try{
      if(button){button.disabled=true;button.textContent='Preparing…';}
      popup.document.write('<!doctype html><title>Preparing LEOGO Summary</title><body style="font-family:Arial;padding:24px">Preparing selected summary…</body>');

      if(paperSize==='80mm'){
        const receiptHtml=summaryType==='address'
          ? await buildOrderAddressThermalReceiptHtml(detail)
          : await buildOrderThermalReceiptHtml(detail);
        popup.document.open();
        popup.document.write(receiptHtml);
        popup.document.close();
        setFormStatus(
          $('#adminOrderDetailStatus'),
          (summaryType==='address'?'Address / delivery':'Detailed order')+' thermal summary ready. Keep print Margins = None and turn OFF browser Headers and footers for the shortest roll.',
          'success'
        );
        return;
      }

      const canvas=summaryType==='address'
        ? await buildOrderAddressSummaryCanvas(detail)
        : await buildOrderDeliverySummaryCanvas(detail);
      const dataUrl=canvas.toDataURL('image/png');
      const pageCss='@page{size:A6 portrait;margin:0}html,body{width:105mm;height:148mm;margin:0;padding:0;background:#fff}img{width:105mm;height:148mm;object-fit:contain;display:block;margin:0}';
      popup.document.open();
      popup.document.write('<!doctype html><html><head><title>'+escapeHtml(detail.order.order_reference||'LEOGO Summary')+'</title><style>'+pageCss+'</style></head><body><img id="label" src="'+dataUrl+'" alt="LEOGO Summary"><script>document.getElementById("label").onload=function(){setTimeout(function(){window.print();},120)};<\/script></body></html>');
      popup.document.close();
      setFormStatus($('#adminOrderDetailStatus'),(summaryType==='address'?'Address / delivery':'Detailed order')+' summary opened for A6 printing.','success');
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
    const codInstruction='COD: Collect and confirm '+formatMoney(codAmountToCollect(order))+' before handing over the order to the customer.'+(Number(order.reward_points_redeemed_kes||0)>0?' LEOGO Points already covered '+formatMoney(order.reward_points_redeemed_kes)+'.':'');

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

    const fee=detail.cod_delivery_fee||null;
    const feeReviewAvailable=String(order.payment_method)==='cod' && Number(order.delivery_fee_kes||0)>0 && fee && fee.status!=='not_required';
    const feeReviewActions=feeReviewAvailable && fee.status==='submitted' && adminHas('orders.payment_verify')
      ? '<div class="admin-order-payment-actions"><button type="button" data-cod-fee-review="approve">Verify COD Delivery Fee</button><button type="button" class="danger" data-cod-fee-review="reject">Reject Fee Proof</button></div>'
      : '';
    const feeReviewHtml=feeReviewAvailable
      ? '<div class="admin-order-payment-proof-full"><strong>COD delivery fee — '+escapeHtml(String(fee.status).replaceAll('_',' '))+'</strong>'+
          '<p>Delivery fee: '+formatMoney(fee.amount_kes)+' · separate from the COD balance payable at handover.</p>'+
          '<p>Customer fee reference: '+escapeHtml(fee.reference||'Not submitted')+'</p>'+
          (fee.review_notes?'<p>Review notes: '+escapeHtml(fee.review_notes)+'</p>':'')+
          (fee.status!=='verified'?'<p>Rider assignment / dispatch must wait until this fee is verified.</p>':'')+
          feeReviewActions+'</div>'
      : '';
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
        (Number(order.reward_points_redeemed_kes||0)>0
          ? '<span><small>LEOGO Points used</small><strong>'+formatMoney(order.reward_points_redeemed_kes)+'</strong></span>'+
            '<span class="grand"><small>Other payment amount</small><strong>'+formatMoney(order.external_amount_due_kes)+'</strong></span>'
          : '')+
      '</div>'+
      (order.payment_verified_at?'<p class="admin-order-verified-note">Verified '+escapeHtml(formatDate(order.payment_verified_at,true))+(order.payment_verified_by_name?' by '+escapeHtml(order.payment_verified_by_name):'')+'</p>':'')+
      paymentActions+feeReviewHtml;

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
      const sellerItems=(seller.items||[]).map((item)=>'<li><strong>'+escapeHtml(item.product_name||'Product')+'</strong>'+(item.variant_name?' · '+escapeHtml(item.variant_name):'')+' · '+Number(item.quantity)+(item.measurement_unit?' '+escapeHtml(item.measurement_unit):'')+'</li>').join('');
      return '<article class="admin-order-seller-card">'+
        '<header><div><span>SELLER</span><h5>'+escapeHtml(seller.business_name||'Seller')+'</h5><p>'+escapeHtml(seller.seller_phone||'')+(seller.seller_email?' · '+escapeHtml(seller.seller_email):'')+'</p></div>'+
          '<span class="status-chip">'+escapeHtml(sellerFulfilmentLabel(seller.fulfilment_status))+'</span></header>'+
        '<div class="admin-order-seller-facts">'+
          '<span><small>Seller subtotal</small><strong>'+formatMoney(seller.seller_subtotal_kes)+'</strong></span>'+
          '<span><small>Pickup location</small><strong>'+escapeHtml(seller.seller_location||'Not supplied')+'</strong></span>'+
          '<span><small>Shop coordinates</small><strong>'+(seller.seller_latitude!=null&&seller.seller_longitude!=null?escapeHtml(seller.seller_latitude+', '+seller.seller_longitude):'Not pinned')+'</strong></span>'+
        '</div>'+
        (seller.seller_map_link?'<p><a class="download-quote" href="'+escapeHtml(seller.seller_map_link)+'" target="_blank" rel="noopener noreferrer">📍 Open Seller Shop in Google Maps ↗</a></p>':'')+
        (sellerItems?'<div class="admin-order-seller-products"><small>PRODUCTS FROM THIS SELLER</small><ul>'+sellerItems+'</ul></div>':'')+
        '<div class="admin-order-timeline">'+stages.map(([label,date])=>'<span class="'+(date?'done':'')+'"><i></i><b>'+escapeHtml(label)+'</b><small>'+escapeHtml(date?formatDate(date,true):'Pending')+'</small></span>').join('')+'</div>'+
      '</article>';
    }).join(''):'<div class="loading-card">No Seller fulfilment records found.</div>';

    const activeRiders=prioritizeRidersForLocation(
      state.riders.filter((r)=>r.status==='active'),
      order.county,
      order.sub_county
    );
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
        escapeHtml(riderAssignmentLabel(r,order.county,order.sub_county))+
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

    $('[data-detail-payment]').forEach((button)=>button.addEventListener('click',()=>{
      verifyMarketplaceOrderPayment(button,order.id,button.dataset.detailPayment==='paid');
    }));
    $('[data-cod-fee-review]').forEach((button)=>button.addEventListener('click',async()=>{
      if(!adminHas('orders.payment_verify'))return;
      const approved=button.dataset.codFeeReview==='approve';
      const notes=approved?'':window.prompt('Reason for COD delivery fee rejection:','');
      if(!approved && (!notes||notes.trim().length<3))return;
      if(approved && !window.confirm('Confirm the full COD delivery fee arrived in the official LEOGO account? This is NOT verification of the remaining COD balance.'))return;
      await withButtonLock(button,approved?'Verifying fee…':'Rejecting fee…',async()=>{
        const {error}=await db.rpc('admin_review_cod_delivery_fee',{
          p_order_id:order.id,p_verified:approved,p_notes:notes||null
        });
        if(error){globalStatus(friendlyError(error),'error');return;}
        await Promise.all([loadMarketplaceOrders({refreshActiveDetail:false}),loadAuditLog()]);
        await loadMarketplaceOrderDetail(order.id,{scroll:false});
        globalStatus(approved?'Delivery fee verified — rider assignment now permitted.':'Delivery fee proof rejected; customer may resubmit.');
      });
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
    const instruction='COD: Collect and confirm '+formatMoney(codAmountToCollect(order))+' remaining COD payment before handing over the order to the customer.';
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
      if($('#adminOrderPickupHandoverEvidenceCard')) $('#adminOrderPickupHandoverEvidenceCard').hidden=true;
      if($('#adminOrderPickupHandoverEvidence')) $('#adminOrderPickupHandoverEvidence').innerHTML='';
    }

    renderMarketplaceOrders();

    const [detailResult,riderResult,sortingResult,handoverResult,codFeeResult]=await Promise.all([
      db.rpc('admin_get_marketplace_order_detail',{p_order_id:orderId}),
      db.rpc('admin_list_riders'),
      db.rpc('admin_get_delivery_sorting_state',{p_order_id:orderId}),
      db.rpc('admin_get_pickup_handover_evidence',{p_order_id:orderId}),
      db.rpc('admin_get_cod_delivery_fee_status',{p_order_id:orderId})
    ]);
    if(loadToken!==state.orderDetailLoadToken || state.activeMarketplaceOrderId!==orderId) return;
    if(detailResult.error){
      state.activeMarketplaceOrderDetail=null;
      setFormStatus($('#adminOrderDetailStatus'),friendlyError(detailResult.error),'error');
      return;
    }
    if(!riderResult.error) state.riders=Array.isArray(riderResult.data)?riderResult.data:[];

    state.activeMarketplaceOrderDetail={
      ...(detailResult.data||{}),
      cod_delivery_fee:codFeeResult.error?null:(codFeeResult.data||null),
      pickup_station_handover:handoverResult.error?null:(handoverResult.data||null),
      pickup_station_handover_error:handoverResult.error?friendlyError(handoverResult.error):''
    };
    if(!sortingResult.error&&sortingResult.data&&state.activeMarketplaceOrderDetail?.delivery){
      state.activeMarketplaceOrderDetail.delivery={
        ...state.activeMarketplaceOrderDetail.delivery,
        ...sortingResult.data
      };
    }
    // Use fee verification only for handover display; preserve gross order totals.
    if(state.activeMarketplaceOrderDetail.order){
      state.activeMarketplaceOrderDetail.order.cod_delivery_fee_status=
        state.activeMarketplaceOrderDetail.cod_delivery_fee?.status||'not_required';
    }
    renderMarketplaceOrderDetail();
    await renderPickupStationHandoverEvidence({loadToken,orderId});

    if(scroll) panel?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const closeMarketplaceOrderDetail=()=>{
    state.orderDetailLoadToken++;
    state.activeMarketplaceOrderId=null;
    state.activeMarketplaceOrderDetail=null;
    if($('#adminOrderDetailPanel')) $('#adminOrderDetailPanel').hidden=true;
    if($('#adminOrderPickupHandoverEvidenceCard')) $('#adminOrderPickupHandoverEvidenceCard').hidden=true;
    if($('#adminOrderPickupHandoverEvidence')) $('#adminOrderPickupHandoverEvidence').innerHTML='';
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
    updateSidebarActionCounts();

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
    if(send){
      send.disabled=!mine||thread.status==='closed';
      send.textContent='Send Reply';
    }

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
      setFormStatus($('#supportChatStatus'),'Submitting Customer Care reply…');
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
    const themeForm = $('#customerThemeForm');
    if (themeForm) {
      themeForm.elements.name.value = data.customer_theme_name || 'LEOGO Default';
      themeForm.elements.primary.value = data.customer_theme_primary || '#071a3a';
      themeForm.elements.secondary.value = data.customer_theme_secondary || '#123a76';
      themeForm.elements.accent.value = data.customer_theme_accent || '#ff7800';
      themeForm.elements.background.value = data.customer_theme_background || '#f5f7fb';
      themeForm.elements.active.checked = data.customer_theme_active !== false;
      renderCustomerThemePreview();
    }
  };

  const renderCustomerThemePreview = () => {
    const form = $('#customerThemeForm');
    const preview = $('#customerThemePreview');
    if (!form || !preview) return;
    preview.style.setProperty('--theme-primary', form.elements.primary.value || '#071a3a');
    preview.style.setProperty('--theme-secondary', form.elements.secondary.value || '#123a76');
    preview.style.setProperty('--theme-accent', form.elements.accent.value || '#ff7800');
    preview.style.setProperty('--theme-background', form.elements.background.value || '#f5f7fb');
  };

  const saveCustomerTheme = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter || $('button[type="submit"]', form);
    await withButtonLock(button, 'Publishing…', async () => {
      const payload = {
        name: form.elements.name.value.trim(),
        primary: form.elements.primary.value,
        secondary: form.elements.secondary.value,
        accent: form.elements.accent.value,
        background: form.elements.background.value,
        active: form.elements.active.checked
      };
      const { data, error } = await db.rpc('admin_update_customer_theme', { p_theme: payload });
      if (error) {
        setFormStatus($('#customerThemeStatus'), friendlyError(error), 'error');
        return;
      }
      state.business = { ...state.business,
        customer_theme_name: data.name,
        customer_theme_primary: data.primary,
        customer_theme_secondary: data.secondary,
        customer_theme_accent: data.accent,
        customer_theme_background: data.background,
        customer_theme_active: data.active
      };
      setFormStatus($('#customerThemeStatus'), data.active
        ? 'Customer Website theme published. Refresh the customer page to see it.'
        : 'Seasonal theme disabled. The Customer Website will use the original LEOGO colours.', 'success');
      if (isSuperAdmin()) await loadAuditLog();
    });
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

  const renderOrderSettingsPreview=(data)=>{
    const node=$('#orderSettingsPreview');if(!node)return;
    const threshold=Number(data?.service_fee_threshold_kes||3000);
    const low=Number(data?.service_fee_below_percent||2);
    const high=Number(data?.service_fee_at_or_above_percent||1.5);
    const cod=Number(data?.cod_limit_kes||10000);
    node.textContent='Checkout rule: below KSh '+threshold.toLocaleString('en-KE')+' → '+low.toLocaleString('en-KE')+'% service fee; at/above threshold → '+high.toLocaleString('en-KE')+'%. COD is unavailable at KSh '+cod.toLocaleString('en-KE')+' or above.';
  };
  const loadOrderSettings=async()=>{
    const {data,error}=await db.rpc('admin_get_order_settings');if(error)throw error;
    const form=$('#orderSettingsForm');if(!form)return;
    ['cod_limit_kes','service_fee_threshold_kes','service_fee_below_percent','service_fee_at_or_above_percent'].forEach(key=>{if(form.elements[key])form.elements[key].value=data?.[key]??'';});
    renderOrderSettingsPreview(data||{});
  };
  const saveOrderSettings=async(event)=>{
    event.preventDefault();const form=event.currentTarget;const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const {data,error}=await db.rpc('admin_save_order_settings',{
        p_cod_limit_kes:Number(form.elements.cod_limit_kes.value),
        p_service_fee_threshold_kes:Number(form.elements.service_fee_threshold_kes.value),
        p_service_fee_below_percent:Number(form.elements.service_fee_below_percent.value),
        p_service_fee_at_or_above_percent:Number(form.elements.service_fee_at_or_above_percent.value)
      });
      if(error){setFormStatus($('#orderSettingsStatus'),friendlyError(error),'error');return;}
      renderOrderSettingsPreview(data||{});
      setFormStatus($('#orderSettingsStatus'),'Order settings saved. Customer checkout will use these values automatically.','success');
      if(isSuperAdmin())await loadAuditLog();
    });
  };

  const renderLipaPolePoleSettingsPreview=(data)=>{
    const node=$('#lipaPolePoleSettingsPreview');if(!node)return;
    node.textContent='Current rule: cancellation deduction '+Number(data?.cancellation_deduction_percent||25).toLocaleString('en-KE')+'%; overdue refund deduction '+Number(data?.overdue_refund_deduction_percent||25).toLocaleString('en-KE')+'%; overdue extension interest '+Number(data?.overdue_interest_percent||5).toLocaleString('en-KE')+'%; reminder '+Number(data?.reminder_days_before_due||3)+' day(s) before the seller-set deadline.';
  };
  const loadLipaPolePoleSettings=async()=>{
    const {data,error}=await db.rpc('admin_get_lipa_pole_pole_settings');if(error)throw error;
    const form=$('#lipaPolePoleSettingsForm');if(!form)return;
    ['cancellation_deduction_percent','overdue_refund_deduction_percent','overdue_interest_percent','reminder_days_before_due'].forEach(key=>{if(form.elements[key])form.elements[key].value=data?.[key]??'';});
    renderLipaPolePoleSettingsPreview(data||{});
  };
  const saveLipaPolePoleSettings=async(event)=>{
    event.preventDefault();const form=event.currentTarget;const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const {data,error}=await db.rpc('admin_save_lipa_pole_pole_settings',{
        p_cancellation_deduction_percent:Number(form.elements.cancellation_deduction_percent.value),
        p_overdue_refund_deduction_percent:Number(form.elements.overdue_refund_deduction_percent.value),
        p_overdue_interest_percent:Number(form.elements.overdue_interest_percent.value),
        p_reminder_days_before_due:Number(form.elements.reminder_days_before_due.value)
      });
      if(error){setFormStatus($('#lipaPolePoleSettingsStatus'),friendlyError(error),'error');return;}
      renderLipaPolePoleSettingsPreview(data||{});
      setFormStatus($('#lipaPolePoleSettingsStatus'),'Lipa Pole Pole policy saved. Seller-set deposits and payment periods were not changed.','success');
      if(isSuperAdmin())await loadAuditLog();
    });
  };

  const partnerSubscriptionLabel=(value)=>({premium:'Premium Partner',seller:'Seller',service_provider:'Service Provider',cyber:'Cyber',accommodation:'Accommodation',transport:'Transporter'}[value]||value);
  const loadPartnerSubscriptionSettings=async()=>{
    const {data,error}=await db.rpc('admin_list_partner_subscription_settings');
    if(error)throw error;
    const target=$('#partnerSubscriptionSettingsList');
    if(!target)return;
    target.innerHTML=(data||[]).map(item=>`<fieldset data-partner-fee="${escapeHtml(item.partner_type)}"><legend>${escapeHtml(partnerSubscriptionLabel(item.partner_type))}</legend><label><span>Monthly (KSh)</span><input name="monthly" type="number" min="0" step="1" required value="${Number(item.monthly_amount_kes||0)}"></label><label><span>Yearly (KSh)</span><input name="yearly" type="number" min="0" step="1" required value="${Number(item.yearly_amount_kes||0)}"></label>${item.partner_type==='premium'?`<label><span>Partner extra acceptance (KSh)</span><input name="extra" type="number" min="0" step="1" required value="${Number(item.extra_acceptance_amount_kes||0)}"></label><label><span>Customer extra meetup (KSh)</span><input name="customer_extra" type="number" min="0" step="1" required value="${Number(item.customer_extra_meetup_amount_kes||0)}"></label>`:''}</fieldset>`).join('');
  };
  const savePartnerSubscriptionSettings=async(event)=>{
    event.preventDefault();const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const rows=$$('[data-partner-fee]',event.currentTarget);
      const results=await Promise.all(rows.map(row=>db.rpc('admin_save_partner_subscription_setting',{p_partner_type:row.dataset.partnerFee,p_monthly_amount_kes:Number($('[name="monthly"]',row).value),p_yearly_amount_kes:Number($('[name="yearly"]',row).value),p_extra_acceptance_amount_kes:row.dataset.partnerFee==='premium'?Number($('[name="extra"]',row).value):null,p_customer_extra_meetup_amount_kes:row.dataset.partnerFee==='premium'?Number($('[name="customer_extra"]',row).value):null})));
      const failed=results.find(result=>result.error);if(failed){setFormStatus($('#partnerSubscriptionSettingsStatus'),friendlyError(failed.error),'error');return;}
      setFormStatus($('#partnerSubscriptionSettingsStatus'),'Partner subscription fees saved. New payments will use these prices.','success');
      await Promise.all([loadPartnerSubscriptionSettings(),loadAuditLog()]);
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

  const renderTransportNetwork = () => {
    const providers=Array.isArray(state.transportProviders)?state.transportProviders:[];
    const vehicles=Array.isArray(state.transportVehicles)?state.transportVehicles:[];
    const approvedProviders=providers.filter(item=>item.application_status==='approved').length;
    const pendingProviderCount=providers.filter(item=>['submitted','under_review','changes_requested'].includes(item.application_status)).length;
    const pendingVehicles=vehicles.filter(item=>['pending','under_review','changes_requested'].includes(item.approval_status)).length;
    const approvedVehicles=vehicles.filter(item=>item.approval_status==='approved').length;
    if($('#adminTransportProviderCount'))$('#adminTransportProviderCount').textContent=providers.length;
    if($('#adminTransportApprovedCount'))$('#adminTransportApprovedCount').textContent=approvedProviders;
    if($('#adminTransportPendingCount'))$('#adminTransportPendingCount').textContent=pendingProviderCount+pendingVehicles;
    if($('#adminTransportVehicleCount'))$('#adminTransportVehicleCount').textContent=approvedVehicles;

    const providerBody=$('#adminTransportProviderBody');
    if(providerBody)providerBody.innerHTML=providers.length?providers.map(item=>`
      <tr>
        <td><strong>${escapeHtml(item.business_name||'Transport Provider')}</strong><small>${escapeHtml(item.owner_name||'')} · ${escapeHtml(item.phone||'')}</small><small>${escapeHtml(item.email||'')}</small></td>
        <td>${escapeHtml(String(item.provider_type||'').replaceAll('_',' '))}</td>
        <td>${escapeHtml((item.services_offered||[]).map(v=>String(v).replaceAll('_',' ')).join(', ')||'—')}</td>
        <td><strong>${escapeHtml(item.town||'—')}</strong><small>${escapeHtml([item.sub_county,item.county].filter(Boolean).join(', '))}</small></td>
        <td><span class="status-chip">${escapeHtml(String(item.application_status||'').replaceAll('_',' '))}</span></td>
        <td><strong>${Number(item.approved_vehicle_count||0)}</strong><small>${Number(item.vehicle_count||0)} total</small></td>
        <td><div class="partner-record-actions"><button type="button" data-view-transport-provider="${escapeHtml(item.user_id)}">View Details</button>${item.application_status==='approved'?'<button type="button" class="danger" data-transport-provider-suspend="true" data-transport-provider-id="'+escapeHtml(item.user_id)+'">Suspend Account</button>':item.application_status==='suspended'?'<button type="button" data-transport-provider-suspend="false" data-transport-provider-id="'+escapeHtml(item.user_id)+'">Reactivate</button>':''}</div></td>
      </tr>`).join(''):'<tr><td colspan="7">No Transport / Parcel Provider registrations yet.</td></tr>';

    const vehicleBody=$('#adminTransportVehicleBody');
    if(vehicleBody)vehicleBody.innerHTML=vehicles.length?vehicles.map(item=>{
      const photo=item.vehicle_profile_picture_path?db.storage.from('transport-public-media').getPublicUrl(item.vehicle_profile_picture_path).data.publicUrl:'';
      return `<tr>
        <td><div class="admin-transport-vehicle-cell">${photo?'<img src="'+escapeHtml(photo)+'" alt="Vehicle">':'<span>🚚</span>'}<div><strong>${escapeHtml(item.vehicle_type||'Vehicle')} · ${escapeHtml(item.registration_number||'')}</strong><small>${escapeHtml([item.make_model,item.colour].filter(Boolean).join(' · ')||'')}</small></div></div></td>
        <td><strong>${escapeHtml(item.provider_name||'Provider')}</strong></td>
        <td>${escapeHtml((item.service_types||[]).map(v=>String(v).replaceAll('_',' ')).join(', ')||'—')}<small>${escapeHtml(item.capacity_description||'')}</small></td>
        <td><strong>${escapeHtml(item.driver_full_name||'No driver supplied')}</strong><small>${escapeHtml([item.driver_id_number,item.driver_phone,item.driver_licence_number].filter(Boolean).join(' · ')||'Private verification')}</small></td>
        <td><span class="status-chip">${escapeHtml(String(item.approval_status||'').replaceAll('_',' '))}</span></td>
        <td>${formatDate(item.submitted_at,true)}</td>
        <td><div class="partner-record-actions"><button type="button" data-view-transport-vehicle="${escapeHtml(item.id)}">View Details</button>${item.approval_status==='approved'&&item.is_available!==false?'<button type="button" class="danger" data-transport-vehicle-active="false" data-transport-vehicle-id="'+escapeHtml(item.id)+'">Suspend Vehicle</button>':item.approval_status==='disabled'||item.is_available===false?'<button type="button" data-transport-vehicle-active="true" data-transport-vehicle-id="'+escapeHtml(item.id)+'">Reactivate</button>':''}</div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="7">No Transport Provider vehicles yet.</td></tr>';

    Array.from(providerBody.querySelectorAll('[data-view-transport-provider]')).forEach((button)=>button.addEventListener('click',()=>openTransportProviderRecord(button.dataset.viewTransportProvider)));
    Array.from(providerBody.querySelectorAll('[data-transport-provider-suspend]')).forEach((button)=>button.addEventListener('click',()=>setTransportProviderSuspended(button,button.dataset.transportProviderId,button.dataset.transportProviderSuspend==='true')));
    Array.from(vehicleBody.querySelectorAll('[data-view-transport-vehicle]')).forEach((button)=>button.addEventListener('click',()=>openTransportVehicleRecord(button.dataset.viewTransportVehicle)));
    Array.from(vehicleBody.querySelectorAll('[data-transport-vehicle-active]')).forEach((button)=>button.addEventListener('click',()=>setTransportVehicleActive(button,button.dataset.transportVehicleId,button.dataset.transportVehicleActive==='true')));
  };

  const renderTransportRequests = () => {
    const target=$('#adminTransportRequestList');
    const requests=Array.isArray(state.transportRequests)?state.transportRequests:[];
    if($('#adminTransportRequestCount'))$('#adminTransportRequestCount').textContent=requests.length;
    updateSidebarActionCounts();
    if(!target)return;
    const approvedVehicles=(state.transportVehicles||[]).filter((v)=>v.approval_status==='approved'&&v.is_available!==false);
    target.innerHTML=requests.length?requests.map((item)=>{
      const selected=item.assigned_vehicle_id||item.requested_vehicle_id||'';
      const options=approvedVehicles.map((v)=>'<option value="'+escapeHtml(v.id)+'" data-provider-id="'+escapeHtml(v.provider_id)+'" '+(String(v.id)===String(selected)?'selected':'')+'>'+escapeHtml((v.provider_name||'Provider')+' — '+(v.vehicle_type||'Vehicle')+' '+(v.registration_number||''))+'</option>').join('');
      const action=item.request_status==='submitted'||item.request_status==='declined'
        ? '<div class="admin-service-request-actions"><select data-transport-assignment-select="'+escapeHtml(item.id)+'"><option value="">Select approved vehicle</option>'+options+'</select><button type="button" data-assign-transport-request="'+escapeHtml(item.id)+'">Assign & Dispatch</button></div>'
        : '<div class="admin-service-request-actions"><span class="status-chip">'+escapeHtml(String(item.request_status||'').replaceAll('_',' '))+'</span></div>';
      return '<article class="admin-service-request-card" data-admin-transport-request="'+escapeHtml(item.id)+'">'+
        '<header><div><strong>'+escapeHtml(item.request_reference||'Transport Request')+'</strong><small>'+escapeHtml(formatDate(item.created_at,true))+' · '+escapeHtml(item.customer_name||'Customer')+' · '+escapeHtml(item.customer_phone||'')+'</small></div><b>'+escapeHtml(String(item.request_status||'').replaceAll('_',' '))+'</b></header>'+
        '<div class="admin-service-request-grid"><div><small>SERVICE</small><strong>'+escapeHtml(String(item.service_type||'Transport').replaceAll('_',' '))+'</strong></div><div><small>PICKUP</small><strong>'+escapeHtml(item.pickup_location||'—')+'</strong></div><div><small>DESTINATION</small><strong>'+escapeHtml(item.destination_location||'—')+'</strong></div></div>'+
        '<small><strong>Requested provider:</strong> '+escapeHtml(item.requested_provider_name||'—')+' · '+escapeHtml(item.requested_vehicle_label||'—')+'</small>'+
        (item.parcel_description?'<p>'+escapeHtml(item.parcel_description)+'</p>':'')+
        (item.customer_notes?'<p><strong>Customer note:</strong> '+escapeHtml(item.customer_notes)+'</p>':'')+
        (item.provider_quote_kes!=null?'<div class="admin-service-request-grid"><div><small>TRANSPORT COST</small><strong>'+formatMoney(item.provider_quote_kes)+'</strong></div><div><small>CUSTOMER SERVICE FEE</small><strong>'+formatMoney(item.quote_customer_service_fee_kes||0)+' ('+Number(item.quote_customer_service_fee_percent||0)+'%)</strong></div><div><small>CUSTOMER TOTAL</small><strong>'+formatMoney(item.quote_customer_total_kes||0)+'</strong></div><div><small>LEOGO COMMISSION</small><strong>'+formatMoney(item.quote_partner_commission_kes||0)+' ('+Number(item.quote_partner_commission_percent||0)+'%)</strong></div><div><small>PROVIDER NET</small><strong>'+formatMoney(item.quote_partner_net_kes||0)+'</strong></div></div>':'')+
        action+
      '</article>';
    }).join(''):'<div class="empty-state">No customer Transport / Parcel requests yet.</div>';
  };

  const loadTransportNetwork = async () => {
    const [providersResult,vehiclesResult,requestsResult]=await Promise.all([
      db.rpc('admin_list_transport_providers'),
      db.rpc('admin_list_transport_vehicles'),
      db.rpc('admin_list_transport_requests')
    ]);
    if(providersResult.error)throw providersResult.error;
    if(vehiclesResult.error)throw vehiclesResult.error;
    if(requestsResult.error)throw requestsResult.error;
    state.transportProviders=Array.isArray(providersResult.data)?providersResult.data:[];
    state.transportVehicles=Array.isArray(vehiclesResult.data)?vehiclesResult.data:[];
    state.transportRequests=Array.isArray(requestsResult.data)?requestsResult.data:[];
    renderTransportNetwork();
    renderTransportRequests();
  };

  document.addEventListener('click',async(event)=>{
    const button=event.target.closest?.('[data-assign-transport-request]');
    if(!button)return;
    const requestId=button.dataset.assignTransportRequest;
    const select=document.querySelector('[data-transport-assignment-select="'+CSS.escape(requestId)+'"]');
    const vehicleId=select?.value||'';
    const vehicle=(state.transportVehicles||[]).find((item)=>String(item.id)===String(vehicleId));
    if(!vehicle){globalStatus('Select an approved available Transport Provider vehicle.','error');return;}
    await withButtonLock(button,'Dispatching…',async()=>{
      const {error}=await db.rpc('admin_assign_transport_request',{
        p_request_id:requestId,
        p_provider_id:vehicle.provider_id,
        p_vehicle_id:vehicle.id,
        p_notes:null
      });
      if(error){globalStatus(friendlyError(error),'error');return;}
      globalStatus('Transport request assigned and sent to the Transport Provider.');
      await Promise.all([loadTransportNetwork(),loadAuditLog()]);
    });
  });

  const loadDeliveryOps = async () => {
    const [ridersResult,jobsResult,sellerStatesResult]=await Promise.all([
      db.rpc('admin_list_riders_v2'),
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
    updateSidebarActionCounts();

    $('#adminRiderList').innerHTML=state.riders.length?state.riders.map(r=>`<article class="station-card">
      <header><div><h3>${escapeHtml(r.display_name)}</h3><span class="status-chip">${escapeHtml(r.status)}</span></div><strong>Rider</strong></header>
      <p>${escapeHtml(r.email||'')}<br>${escapeHtml(r.phone||'No phone')}<br><strong>${escapeHtml(staffLocationLabel(r))}</strong>${r.vehicle_type?'<br>'+escapeHtml(r.vehicle_type)+(r.vehicle_registration?' · '+escapeHtml(r.vehicle_registration):''):''}</p>
    </article>`).join(''):'<div class="loading-card">No LEOGO riders authorized yet.</div>';

    $('#adminDeliveryJobBody').innerHTML=state.deliveryJobs.length?state.deliveryJobs.map(job=>{
      const states=state.deliverySellerStates.filter(s=>s.order_id===job.order_id).map(s=>s.fulfilment_status);
      const readiness=states.length&&states.every(s=>['packed_ready','handed_to_rider','delivered'].includes(s))?'Ready for rider':states.length?states.map(s=>String(s).replaceAll('_',' ')).join(', '):'Waiting for Seller';
      const matchedRiders=prioritizeRidersForLocation(activeRiders,job.county,job.sub_county);
      const riderOptions='<option value="">Choose rider…</option>'+matchedRiders.map(r=>'<option value="'+escapeHtml(r.user_id)+'" '+(r.user_id===job.rider_id?'selected':'')+'>'+escapeHtml(riderAssignmentLabel(r,job.county,job.sub_county))+'</option>').join('');
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
    const withdrawalBody=$('#pickupWithdrawalBody');
    const returnBody=$('#pickupReturnBody');
    const eventList=$('#pickupStationEventList');
    if(withdrawalBody)withdrawalBody.innerHTML='<tr><td colspan="6">Loading withdrawal requests…</td></tr>';
    if(returnBody)returnBody.innerHTML='<tr><td colspan="6">Loading return parcels…</td></tr>';
    if(eventList)eventList.innerHTML='<div class="loading-card">Loading Pickup Station activity…</div>';

    const [stationsResult,partnersResult,eventsResult,withdrawalsResult,returnsResult,financeResult]=await Promise.all([
      db.from('pickup_stations').select('*').order('display_order').order('station_name'),
      db.rpc('admin_list_pickup_station_partners'),
      db.rpc('admin_list_pickup_station_events',{p_limit:60}),
      db.rpc('admin_list_pickup_station_withdrawals'),
      db.rpc('admin_list_pickup_station_returns'),
      db.rpc('admin_get_pickup_station_finance_settings')
    ]);

    state.pickupStationPartners=!partnersResult.error&&Array.isArray(partnersResult.data)?partnersResult.data:[];
    state.pickupStationEvents=!eventsResult.error&&Array.isArray(eventsResult.data)?eventsResult.data:[];
    state.pickupStationWithdrawals=!withdrawalsResult.error&&Array.isArray(withdrawalsResult.data)?withdrawalsResult.data:[];
    state.pickupStationReturns=!returnsResult.error&&Array.isArray(returnsResult.data)?returnsResult.data:[];

    // Render these independent queues immediately so an unrelated station-card error can
    // never leave "Loading..." on screen after the RPC has already completed.
    if(withdrawalsResult.error&&withdrawalBody){
      withdrawalBody.innerHTML='<tr><td colspan="6">Withdrawal requests could not load. Use Refresh to try again.</td></tr>';
    }else{
      renderPickupStationWithdrawals();
    }
    if(returnsResult.error&&returnBody){
      returnBody.innerHTML='<tr><td colspan="6">Return parcels could not load. Use Refresh to try again.</td></tr>';
    }else{
      renderPickupStationReturns();
    }
    if(eventsResult.error&&eventList){
      eventList.innerHTML='<div class="loading-card">Pickup Station activity could not load. Use Refresh to try again.</div>';
    }else{
      renderPickupStationEvents();
    }

    if(!financeResult.error){
      state.pickupStationFinanceSettings=financeResult.data||{handled_parcel_earning_kes:20};
      const financeForm=$('#pickupStationFinanceForm');
      const earningInput=financeForm?.elements?.handled_parcel_earning_kes;
      if(earningInput)earningInput.value=Number(state.pickupStationFinanceSettings.handled_parcel_earning_kes??20);
      if($('#pickupHandledParcelEarningSummary'))$('#pickupHandledParcelEarningSummary').textContent=formatMoney(state.pickupStationFinanceSettings.handled_parcel_earning_kes??20);
    }

    if(stationsResult.error)throw stationsResult.error;
    const partnerMap=new Map(state.pickupStationPartners.map(row=>[String(row.pickup_station_id),row]));
    state.pickupStations=(Array.isArray(stationsResult.data)?stationsResult.data:[]).map(station=>({...station,partner:partnerMap.get(String(station.id))||null}));
    renderPickupStations();

    if(financeResult.error)globalStatus('Pickup Station finance settings could not load: '+friendlyError(financeResult.error),'error');
  };

  const savePickupStationFinanceSettings=async(event)=>{
    event.preventDefault();
    const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const amount=Number(event.currentTarget.elements.handled_parcel_earning_kes.value);
      if(!Number.isFinite(amount)||amount<0){
        setFormStatus($('#pickupStationFinanceStatus'),'Enter a valid earning amount of zero or above.','error');
        return;
      }
      const {data,error}=await db.rpc('admin_update_pickup_station_finance_settings',{p_handled_parcel_earning_kes:amount});
      if(error){
        setFormStatus($('#pickupStationFinanceStatus'),friendlyError(error),'error');
        return;
      }
      state.pickupStationFinanceSettings=data||{handled_parcel_earning_kes:amount};
      setFormStatus($('#pickupStationFinanceStatus'),'Pickup Station earning updated. New successful parcel handovers will use '+formatMoney(amount)+'.','success');
      if($('#pickupHandledParcelEarningSummary'))$('#pickupHandledParcelEarningSummary').textContent=formatMoney(amount);
      await loadAuditLog().catch(()=>{});
    });
  };

  const assignPickupStationPartner=async(stationId)=>{
    const station=state.pickupStations.find(row=>row.id===stationId);
    const email=(window.prompt('Enter the LEOGO account email for the Pickup Station Partner:','')||'').trim();
    if(!email)return;
    const displayName=(window.prompt('Partner display / contact name (optional):',station?.partner?.partner_name||'')||'').trim();
    const phone=(window.prompt('Partner phone number (optional):',station?.partner?.partner_phone||station?.contact_phone||'')||'').trim();
    globalStatus('Assigning Pickup Station Partner…');
    const {data,error}=await db.rpc('admin_assign_pickup_station_partner',{
      p_station_id:stationId,p_email:email,p_display_name:displayName||null,p_phone:phone||null
    });
    if(error){globalStatus(friendlyError(error),'error');return;}
    globalStatus((data?.station_name||station?.station_name||'Pickup Station')+' assigned to '+email+'.');
    await Promise.all([loadPickupStations(),loadAuditLog().catch(()=>{})]);
  };

  const unassignPickupStationPartner=async(stationId)=>{
    const station=state.pickupStations.find(row=>row.id===stationId);
    if(!window.confirm('Remove Pickup Station Partner access from '+(station?.station_name||'this station')+'?'))return;
    const {error}=await db.rpc('admin_unassign_pickup_station_partner',{p_station_id:stationId});
    if(error){globalStatus(friendlyError(error),'error');return;}
    globalStatus('Pickup Station Partner access removed.');
    await Promise.all([loadPickupStations(),loadAuditLog().catch(()=>{})]);
  };

  const renderPickupStations = () => {
    $('#pickupStationList').innerHTML = state.pickupStations.length ? state.pickupStations.map((station) => {
      const partner=station.partner||null;
      const partnerInfo=partner?.partner_user_id
        ? '<div class="station-partner"><b>📦 Pickup Partner</b><br>'+escapeHtml(partner.partner_name||partner.partner_email||'Assigned Partner')+
          (partner.partner_email?'<br>'+escapeHtml(partner.partner_email):'')+
          (partner.partner_phone?'<br>☎ '+escapeHtml(partner.partner_phone):'')+
          '<br><span class="status-chip">'+escapeHtml(partner.partner_status||'active')+'</span></div>'
        : '<div class="station-partner"><b>📦 Pickup Partner</b><br><span style="color:#7b8798">Not assigned</span></div>';
      return `<article class="station-card"><header><div><h3>${escapeHtml(station.station_name)}</h3><span class="status-chip">${station.is_active ? 'Active' : 'Inactive'}</span></div><strong>${formatMoney(station.shipping_fee_kes??0)} shipping</strong></header><p>${escapeHtml(station.address_line)}${station.door_number ? `, Door ${escapeHtml(station.door_number)}` : ''}<br>${escapeHtml([station.town, station.sub_county, station.county].filter(Boolean).join(' · '))}<br>${escapeHtml(station.landmark || '')}${station.contact_phone ? `<br>☎ ${escapeHtml(station.contact_phone)}` : ''}${station.operating_hours ? `<br>◷ ${escapeHtml(station.operating_hours)}` : ''}${station.latitude!=null&&station.longitude!=null?`<br>📍 ${escapeHtml(station.latitude)}, ${escapeHtml(station.longitude)}`:''}${station.map_link?`<br><a href="${escapeHtml(station.map_link)}" target="_blank" rel="noopener noreferrer">Open location ↗</a>`:''}<br><b>Shipping fee:</b> ${escapeHtml(formatMoney(station.shipping_fee_kes??0))}<br><b>Pickup service fee:</b> ${Number(station.service_fee_percent||0)}%</p>${partnerInfo}<div class="card-actions"><button data-edit-station="${station.id}">Edit Station</button><button class="primary-button" data-set-pickup-shipping="${station.id}">Set Shipping Fee</button>${partner?.partner_user_id?'<button class="secondary-button" data-unassign-pickup-partner="'+station.id+'">Unassign Partner</button>':'<button class="primary-button" data-assign-pickup-partner="'+station.id+'">Create / Assign Partner Account</button>'}<a class="secondary-button" href="../pickup/" target="_blank" rel="noopener">Open Partner Portal ↗</a></div></article>`;
    }).join('') : '<div class="loading-card">No pickup stations configured.</div>';
    $$('[data-edit-station]').forEach((button) => button.addEventListener('click', () => openPickupModal(button.dataset.editStation)));
    $$('[data-set-pickup-shipping]').forEach(button=>button.addEventListener('click',async()=>{
      const station=state.pickupStations.find(row=>row.id===button.dataset.setPickupShipping);
      if(!station)return;
      const raw=window.prompt('Set shipping fee for '+station.station_name+' (KSh):',String(Number(station.shipping_fee_kes??50)));
      if(raw===null)return;
      const amount=Number(raw);
      if(!Number.isFinite(amount)||amount<0){globalStatus('Enter a valid shipping fee of zero or above.','error');return;}
      button.disabled=true;
      const {error}=await db.rpc('admin_update_pickup_station_shipping_fee',{p_station_id:station.id,p_shipping_fee_kes:amount});
      button.disabled=false;
      if(error){globalStatus(friendlyError(error),'error');return;}
      globalStatus(station.station_name+' shipping fee updated to '+formatMoney(amount)+'.');
      await Promise.all([loadPickupStations(),loadAuditLog().catch(()=>{})]);
    }));
    $$('[data-assign-pickup-partner]').forEach(button=>button.addEventListener('click',()=>assignPickupStationPartner(button.dataset.assignPickupPartner)));
    $$('[data-unassign-pickup-partner]').forEach(button=>button.addEventListener('click',()=>unassignPickupStationPartner(button.dataset.unassignPickupPartner)));
  };

  const reviewPickupWithdrawal=async(button)=>{
    const id=button.dataset.pickupWithdrawal;
    const decision=button.dataset.decision;
    let notes='';
    if(decision==='reject'){
      notes=(window.prompt('Reason for rejecting this withdrawal:','')||'').trim();
      if(notes.length<3)return;
    }else if(decision==='paid'){
      if(!window.confirm('Confirm this Pickup Station withdrawal has been paid?'))return;
      notes=(window.prompt('Payment note / reference (optional):','')||'').trim();
    }
    button.disabled=true;
    const {error}=await db.rpc('admin_review_pickup_station_withdrawal',{p_withdrawal_id:id,p_decision:decision,p_notes:notes||null});
    button.disabled=false;
    if(error){globalStatus(friendlyError(error),'error');return;}
    globalStatus('Pickup Station withdrawal updated.');
    await Promise.all([loadPickupStations(),loadAuditLog().catch(()=>{})]);
  };

  const renderPickupStationWithdrawals=()=>{
    updateSidebarActionCounts();
    const body=$('#pickupWithdrawalBody');if(!body)return;
    body.innerHTML=state.pickupStationWithdrawals.length?state.pickupStationWithdrawals.map(row=>{
      const actions=row.status==='pending'
        ? '<button data-pickup-withdrawal="'+row.id+'" data-decision="approve">Approve</button><button class="secondary-button" data-pickup-withdrawal="'+row.id+'" data-decision="reject">Reject</button>'
        : row.status==='approved'
          ? '<button data-pickup-withdrawal="'+row.id+'" data-decision="paid">Mark Paid</button>'
          : '—';
      return '<tr><td><b>'+escapeHtml(row.station_name)+'</b><br><small>'+escapeHtml(row.partner_name||row.partner_email||'Partner')+'</small></td>'+
        '<td><b>'+formatMoney(row.requested_amount_kes)+'</b></td>'+
        '<td>'+escapeHtml(row.payout_method||'')+'<br><small>'+escapeHtml(row.payout_account_name||'')+(row.payout_phone?' · '+escapeHtml(row.payout_phone):'')+(row.payout_account_number?' · '+escapeHtml(row.payout_account_number):'')+'</small></td>'+
        '<td>'+escapeHtml(formatDate(row.submitted_at,true))+'</td><td><span class="status-chip">'+escapeHtml(row.status)+'</span></td><td>'+actions+'</td></tr>';
    }).join(''):'<tr><td colspan="6">No Pickup Station withdrawal requests yet.</td></tr>';
    $$('[data-pickup-withdrawal]').forEach(button=>button.addEventListener('click',()=>reviewPickupWithdrawal(button)));
  };

  const updatePickupReturnStatus=async(button)=>{
    const id=button.dataset.pickupReturn;
    const select=$('[data-pickup-return-status="'+id+'"]');
    if(!select)return;
    const notes=(window.prompt('Optional Admin note for this return parcel:','')||'').trim();
    button.disabled=true;
    const {error}=await db.rpc('admin_update_pickup_return_status',{p_return_id:id,p_status:select.value,p_notes:notes||null});
    button.disabled=false;
    if(error){globalStatus(friendlyError(error),'error');return;}
    globalStatus('Return parcel status updated.');
    await Promise.all([loadPickupStations(),loadAuditLog().catch(()=>{})]);
  };

  const renderPickupStationReturns=()=>{
    updateSidebarActionCounts();
    const body=$('#pickupReturnBody');if(!body)return;
    const statuses=['received_at_station','awaiting_dispatch','dispatched','completed','cancelled'];
    body.innerHTML=state.pickupStationReturns.length?state.pickupStationReturns.map(row=>
      '<tr><td><b>'+escapeHtml(row.return_reference)+'</b>'+(row.original_order_reference?'<br><small>Original '+escapeHtml(row.original_order_reference)+'</small>':'')+'</td>'+
      '<td>'+escapeHtml(row.station_name)+'</td><td>'+escapeHtml(row.customer_name)+'<br><small>'+escapeHtml(row.customer_phone)+'</small></td>'+
      '<td>'+escapeHtml(row.item_description)+'<br><small>'+escapeHtml(row.return_reason)+'</small></td>'+
      '<td><select data-pickup-return-status="'+row.id+'">'+statuses.map(s=>'<option value="'+s+'" '+(s===row.status?'selected':'')+'>'+escapeHtml(s.replaceAll('_',' '))+'</option>').join('')+'</select></td>'+
      '<td><button data-pickup-return="'+row.id+'">Save</button></td></tr>'
    ).join(''):'<tr><td colspan="6">No Pickup Station return parcels yet.</td></tr>';
    $$('[data-pickup-return]').forEach(button=>button.addEventListener('click',()=>updatePickupReturnStatus(button)));
  };

  const renderPickupStationEvents=()=>{
    const list=$('#pickupStationEventList');if(!list)return;
    list.innerHTML=state.pickupStationEvents.length?state.pickupStationEvents.map(row=>
      '<article class="admin-product-review-card"><div class="admin-product-review-main"><span>'+escapeHtml(String(row.event_type||'update').replaceAll('_',' '))+'</span><h4>'+escapeHtml(row.parcel_reference||'Parcel')+'</h4><p>'+escapeHtml(row.station_name||'Pickup Station')+(row.notes?' · '+escapeHtml(row.notes):'')+'</p><small>'+escapeHtml(formatDate(row.created_at,true))+(row.actor_email?' · '+escapeHtml(row.actor_email):'')+'</small></div></article>'
    ).join(''):'<div class="loading-card">No Pickup Station activity yet.</div>';
  };
  const pickupStationCoordinatesFromText=(value='')=>{
    const text=String(value||'').trim();
    const direct=text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if(direct)return {lat:Number(direct[1]),lng:Number(direct[2])};
    const maps=text.match(/(?:@|q=|query=)(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i);
    return maps?{lat:Number(maps[1]),lng:Number(maps[2])}:null;
  };
  const setPickupStationCoordinates=(lat,lng,label='Pickup Station pinned')=>{
    const latitude=Number(lat),longitude=Number(lng),target=$('#pickupStationPinStatus');
    if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){
      if(target){target.textContent='Invalid Pickup Station coordinates.';target.className='form-status error';}
      return false;
    }
    $('#pickupStationLatitude').value=latitude.toFixed(7);
    $('#pickupStationLongitude').value=longitude.toFixed(7);
    if(!$('#pickupStationMapLink').value.trim())$('#pickupStationMapLink').value='https://www.google.com/maps?q='+latitude.toFixed(7)+','+longitude.toFixed(7);
    if(target){target.textContent='✓ '+label+': '+latitude.toFixed(7)+', '+longitude.toFixed(7);target.className='form-status success';}
    return true;
  };
  $('#pinPickupStationLocation')?.addEventListener('click',()=>{
    const target=$('#pickupStationPinStatus');
    if(!navigator.geolocation){
      if(target){target.textContent='This browser cannot access location. Paste a Maps link or enter coordinates.';target.className='form-status error';}
      return;
    }
    if(target){target.textContent='Getting Pickup Station location…';target.className='form-status';}
    navigator.geolocation.getCurrentPosition((position)=>{
      setPickupStationCoordinates(position.coords.latitude,position.coords.longitude,'Pickup Station pinned');
    },(error)=>{
      if(target){target.textContent=error.code===1?'Location permission was not granted. Paste a Maps link or coordinates instead.':'Pickup Station location could not be detected.';target.className='form-status error';}
    },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
  });
  $('#pickupStationMapLink')?.addEventListener('change',(event)=>{
    const coords=pickupStationCoordinatesFromText(event.currentTarget.value);
    if(coords)setPickupStationCoordinates(coords.lat,coords.lng,'Coordinates detected from shared location');
  });

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
    const pinStatus=$('#pickupStationPinStatus');if(pinStatus){pinStatus.textContent=station?.latitude!=null&&station?.longitude!=null?'✓ Pickup Station pinned: '+station.latitude+', '+station.longitude:'Pickup Station location not pinned yet.';pinStatus.className=station?.latitude!=null&&station?.longitude!=null?'form-status success':'form-status';}
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
      const latitude=Number(values.latitude),longitude=Number(values.longitude);
      if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){setFormStatus($('#pickupStationStatus'),'Pin the Pickup Station location and confirm valid latitude and longitude before saving.','error');return;}
      values.latitude=latitude;values.longitude=longitude;
      const { error } = await db.rpc('admin_save_pickup_station', { p_station_id: id, p_station: values });
      if (error) { setFormStatus($('#pickupStationStatus'), friendlyError(error), 'error'); return; }
      closeModals();
      globalStatus(`Pickup station ${id ? 'updated' : 'created'} and audited.`);
      await Promise.all([loadPickupStations(), loadDashboard(), loadAuditLog()]);
    });
  };

  const loadDeliveryRateSettings = async () => {
    const {data,error}=await db.rpc('admin_get_delivery_rate_settings');
    if(error)throw error;
    state.deliveryRateSettings=data||{};
    const form=$('#deliveryRateSettingsForm');
    if(form){
      form.elements.cbd_fee_kes.value=Number(data?.cbd_fee_kes??50);
      form.elements.estate_fee_kes.value=Number(data?.estate_fee_kes??80);
      form.elements.outside_town_fee_kes.value=Number(data?.outside_town_fee_kes??200);
      form.elements.standard_max_weight_kg.value=Number(data?.standard_max_weight_kg??50);
      form.elements.standard_max_area_sqm.value=Number(data?.standard_max_area_sqm??1);
      form.elements.rate_note.value=data?.rate_note||'';
    }
    if($('#deliveryRateCbdSummary'))$('#deliveryRateCbdSummary').textContent=formatMoney(data?.cbd_fee_kes??50);
    if($('#deliveryRateEstateSummary'))$('#deliveryRateEstateSummary').textContent=formatMoney(data?.estate_fee_kes??80);
    if($('#deliveryRateOutsideSummary'))$('#deliveryRateOutsideSummary').textContent='From '+formatMoney(data?.outside_town_fee_kes??200);
  };
  const saveDeliveryRateSettings = async (event) => {
    event.preventDefault();
    const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const values=Object.fromEntries(new FormData(event.currentTarget).entries());
      const {data,error}=await db.rpc('admin_update_delivery_rate_settings',{
        p_cbd_fee_kes:Number(values.cbd_fee_kes),
        p_estate_fee_kes:Number(values.estate_fee_kes),
        p_outside_town_fee_kes:Number(values.outside_town_fee_kes),
        p_standard_max_weight_kg:Number(values.standard_max_weight_kg),
        p_standard_max_area_sqm:Number(values.standard_max_area_sqm),
        p_rate_note:String(values.rate_note||'').trim()||null
      });
      if(error){setFormStatus($('#deliveryRateSettingsStatus'),friendlyError(error),'error');return;}
      state.deliveryRateSettings=data||state.deliveryRateSettings;
      setFormStatus($('#deliveryRateSettingsStatus'),'Delivery rates updated. New Marketplace and Cyber orders will use these charges immediately.','success');
      await Promise.all([loadDeliveryRateSettings(),loadAuditLog().catch(()=>{})]);
      document.dispatchEvent(new CustomEvent('leogo:delivery-rates-updated',{detail:data||{}}));
    });
  };

  const loadTransportFinanceSettings = async () => {
    const {data,error}=await db.rpc('admin_get_transport_finance_settings');
    if(error)throw error;
    state.transportFinanceSettings=data||{};
    const form=$('#transportFinanceSettingsForm');
    if(form){
      form.elements.partner_commission_percent.value=Number(data?.partner_commission_percent??10);
      form.elements.customer_service_fee_percent.value=Number(data?.customer_service_fee_percent??2);
    }
  };
  const saveTransportFinanceSettings = async (event) => {
    event.preventDefault();
    const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const values=Object.fromEntries(new FormData(event.currentTarget).entries());
      const {error}=await db.rpc('admin_update_transport_finance_settings',{
        p_partner_commission_percent:Number(values.partner_commission_percent),
        p_customer_service_fee_percent:Number(values.customer_service_fee_percent)
      });
      if(error){setFormStatus($('#transportFinanceSettingsStatus'),friendlyError(error),'error');return;}
      setFormStatus($('#transportFinanceSettingsStatus'),'Transport commission and customer service fee updated. New quotes will use these rates.','success');
      await Promise.all([loadTransportFinanceSettings(),loadAuditLog()]);
    });
  };

  const loadAccommodationFinanceSettings = async () => {
    const {data,error}=await db.rpc('admin_get_accommodation_finance_settings');
    if(error)throw error;
    state.accommodationFinanceSettings=data||{};
    const form=$('#accommodationFinanceSettingsForm');
    if(form){
      form.elements.hotel_commission_percent.value=Number(data?.hotel_commission_percent??10);
      form.elements.customer_service_fee_percent.value=Number(data?.customer_service_fee_percent??3);
    }
  };
  const saveAccommodationFinanceSettings = async (event) => {
    event.preventDefault();
    const button=event.submitter;
    await withButtonLock(button,'Saving…',async()=>{
      const values=Object.fromEntries(new FormData(event.currentTarget).entries());
      const {error}=await db.rpc('admin_update_accommodation_finance_settings',{
        p_hotel_commission_percent:Number(values.hotel_commission_percent),
        p_customer_service_fee_percent:Number(values.customer_service_fee_percent)
      });
      if(error){
        setFormStatus($('#accommodationFinanceSettingsStatus'),friendlyError(error),'error');
        return;
      }
      setFormStatus($('#accommodationFinanceSettingsStatus'),'Accommodation commission and customer service fee updated. New bookings will use these rates; existing bookings keep their saved rates.','success');
      await Promise.all([loadAccommodationFinanceSettings(),loadAuditLog().catch(()=>{})]);
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
      <td data-label="Location"><strong>${escapeHtml(s.town||'—')}</strong><small>${escapeHtml([s.sub_county,s.county].filter(Boolean).join(', '))}</small><small>${s.shop_latitude!=null&&s.shop_longitude!=null?'📍 Shop pinned':'Shop pin missing'}</small></td>
      <td data-label="Status"><span class="status-chip">${escapeHtml(s.application_status)}</span></td>
      <td data-label="Products"><strong>${Number(s.product_count||0)}</strong><small>${Number(s.active_product_count||0)} active</small></td>
      <td data-label="Flash Sale"><strong>${Number(s.flash_sale_request_count||0)}</strong></td>
      <td data-label="Action"><div class="partner-record-actions"><button type="button" class="seller-record-button" data-seller-record="${s.user_id}">View Details</button>${s.application_status==='approved'?'<button type="button" class="danger" data-seller-suspend="true" data-seller-id="'+escapeHtml(s.user_id)+'">Suspend Account</button>':s.application_status==='suspended'?'<button type="button" data-seller-suspend="false" data-seller-id="'+escapeHtml(s.user_id)+'">Reactivate</button>':''}</div></td>
    </tr>`).join('') : '<tr><td colspan="8">No sellers match the current filters.</td></tr>';
    $$('[data-seller-record]').forEach((button)=>button.addEventListener('click',()=>openSellerRecord(button.dataset.sellerRecord)));
    $$('[data-seller-suspend]').forEach((button)=>button.addEventListener('click',()=>setSellerSuspended(button,button.dataset.sellerId,button.dataset.sellerSuspend==='true')));
  };
  const loadSellers = async () => {
    const {data,error}=await db.rpc('admin_list_sellers');
    if(error) throw error;
    state.sellers=data||[];
    renderSellers();
  };

  const setSellerSuspended=async(button,sellerId,suspended)=>{
    const notes=window.prompt((suspended?'Reason / note for suspension':'Optional reactivation note')+':','')||'';
    if(suspended&&!window.confirm('Suspend this Seller account? All approved Seller products will immediately disappear from the customer website until the account is reactivated.'))return;
    await withButtonLock(button,suspended?'Suspending…':'Reactivating…',async()=>{
      const {error}=await db.rpc('admin_set_seller_account_status',{
        p_seller_id:sellerId,
        p_suspended:suspended,
        p_notes:notes||null
      });
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadSellers(),loadCatalogue(),loadAuditLog().catch(()=>{})]);
      globalStatus(suspended?'Seller account suspended. Products are hidden from customers.':'Seller account reactivated.');
    });
  };

  const serviceListingPriceText=(item)=>{
    if(item.pricing_model==='quote')return 'Quote after request';
    const from=Number(item.price_from_kes||0);
    const to=Number(item.price_to_kes||0);
    if(item.pricing_model==='fixed')return formatMoney(from)+(item.unit_label?' · '+item.unit_label:'');
    if(item.pricing_model==='hourly')return formatMoney(from)+' / hour';
    if(item.pricing_model==='from')return 'From '+formatMoney(from)+(to?' – '+formatMoney(to):'')+(item.unit_label?' · '+item.unit_label:'');
    return from?formatMoney(from):'—';
  };
  const partnerRecordGridHtml=(pairs=[])=>pairs
    .filter(([,value])=>value!==undefined&&value!==null&&String(value)!=='')
    .map(([label,value])=>'<div><small>'+escapeHtml(label)+'</small><strong>'+escapeHtml(Array.isArray(value)?value.join(', '):String(value))+'</strong></div>')
    .join('');

  const openPartnerRecordShell=(eyebrow,title)=>{
    const modal=$('#partnerRecordModal');
    if(!modal)return false;
    $('#partnerRecordEyebrow').textContent=eyebrow;
    $('#partnerRecordTitle').textContent=title;
    $('#partnerRecordGrid').innerHTML='<div><small>STATUS</small><strong>Loading record…</strong></div>';
    $('#partnerRecordRelated').innerHTML='';
    $('#partnerRecordMedia').innerHTML='';
    $('#partnerRecordMedia').hidden=true;
    setFormStatus($('#partnerRecordStatus'),'');
    modal.hidden=false;
    return true;
  };

  const renderPartnerRecordMedia=async(payload,kind)=>{
    const target=$('#partnerRecordMedia');
    if(!target)return;
    const entries=adminMediaEntries(payload||{},kind);
    target.innerHTML='';
    target.hidden=!entries.length;
    if(!entries.length)return;
    const heading=document.createElement('div');
    heading.className='review-media-heading';
    heading.innerHTML='<span>FILES & PHOTOS</span><strong>Verification & profile media</strong><small>Private documents remain visible only to authorized Admin staff.</small>';
    target.appendChild(heading);
    const grid=document.createElement('div');
    grid.className='review-media-grid';
    target.appendChild(grid);
    for(const entry of entries){
      grid.appendChild(await renderAdminMediaCard(entry));
    }
  };

  const openServiceProviderRecord=async(providerId)=>{
    if(!openPartnerRecordShell('SERVICE PROVIDER RECORD','Service Provider Details'))return;
    try{
      const {data,error}=await db.rpc('admin_get_service_provider_record',{p_provider_id:providerId});
      if(error)throw error;
      const account=data?.account||{};
      const services=Array.isArray(data?.services)?data.services:[];
      $('#partnerRecordTitle').textContent=account.business_name||'Service Provider Details';
      $('#partnerRecordGrid').innerHTML=partnerRecordGridHtml([
        ['Business name',account.business_name],['Owner name',account.owner_name],['Email',account.email],['Phone',account.phone],
        ['ID number',account.id_number],['Primary service',account.primary_service],['Service category',account.service_category],
        ['Experience',account.experience_years!=null?account.experience_years+' years':''],['County',account.county],['Sub-County',account.sub_county],
        ['Town / Area',account.town],['Location details',account.location_details],['Service area notes',account.service_area_notes],
        ['Availability',String(account.availability_status||'').replaceAll('_',' ')],['Account status',String(account.application_status||'').replaceAll('_',' ')],
        ['Approved',formatDate(account.approved_at,true)],['Admin notes',account.admin_notes],['Business description',account.business_description]
      ]);
      await renderPartnerRecordMedia(account,'service_provider_application');
      $('#partnerRecordRelated').innerHTML='<div class="review-media-heading"><span>SERVICES</span><strong>'+services.length+' service listing(s)</strong></div>'+
        (services.length?'<div class="partner-related-grid">'+services.map(service=>
          '<article><div><strong>'+escapeHtml(service.service_name||'Service')+'</strong><small>'+escapeHtml(service.category_name||'')+'</small></div>'+
          '<span class="status-chip">'+escapeHtml(String(service.approval_status||'').replaceAll('_',' '))+'</span>'+
          '<p>'+escapeHtml(service.description||service.service_area||'')+'</p>'+
          '<small>'+(service.is_available?'Customer available':'Hidden / unavailable')+'</small></article>'
        ).join('')+'</div>':'<div class="loading-card">No services added yet.</div>');
    }catch(error){
      setFormStatus($('#partnerRecordStatus'),friendlyError(error),'error');
    }
  };

  const openTransportProviderRecord=async(providerId)=>{
    if(!openPartnerRecordShell('TRANSPORT PROVIDER RECORD','Transport Provider Details'))return;
    try{
      const {data,error}=await db.rpc('admin_get_transport_provider_record',{p_provider_id:providerId});
      if(error)throw error;
      const account=data?.account||{};
      const vehicles=Array.isArray(data?.vehicles)?data.vehicles:[];
      $('#partnerRecordTitle').textContent=account.business_name||'Transport Provider Details';
      $('#partnerRecordGrid').innerHTML=partnerRecordGridHtml([
        ['Business name',account.business_name],['Owner name',account.owner_name],['Email',account.email],['Phone',account.phone],
        ['ID number',account.id_number],['Provider type',String(account.provider_type||'').replaceAll('_',' ')],
        ['Services offered',account.services_offered],['County',account.county],['Sub-County',account.sub_county],['Town / Area',account.town],
        ['Location details',account.location_details],['Coverage notes',account.coverage_notes],['Availability',String(account.availability_status||'').replaceAll('_',' ')],
        ['Account status',String(account.application_status||'').replaceAll('_',' ')],['Base latitude',account.base_latitude],['Base longitude',account.base_longitude],
        ['Base map link',account.base_map_link],['Approved',formatDate(account.approved_at,true)],['Admin notes',account.admin_notes],['Business description',account.business_description]
      ]);
      await renderPartnerRecordMedia(account,'transport_provider_application');
      $('#partnerRecordRelated').innerHTML='<div class="review-media-heading"><span>VEHICLES</span><strong>'+vehicles.length+' vehicle(s)</strong><small>Use the vehicle View Details button for private driver verification.</small></div>'+
        (vehicles.length?'<div class="partner-related-grid">'+vehicles.map(vehicle=>
          '<article><div><strong>'+escapeHtml([vehicle.vehicle_type,vehicle.registration_number].filter(Boolean).join(' · ')||'Vehicle')+'</strong><small>'+escapeHtml([vehicle.make_model,vehicle.colour].filter(Boolean).join(' · '))+'</small></div>'+
          '<span class="status-chip">'+escapeHtml(String(vehicle.approval_status||'').replaceAll('_',' '))+'</span>'+
          '<p>'+escapeHtml(vehicle.capacity_description||vehicle.service_area||'')+'</p><small>'+(vehicle.is_available?'Customer available':'Hidden / unavailable')+'</small></article>'
        ).join('')+'</div>':'<div class="loading-card">No vehicles added yet.</div>');
    }catch(error){
      setFormStatus($('#partnerRecordStatus'),friendlyError(error),'error');
    }
  };

  const openTransportVehicleRecord=async(vehicleId)=>{
    const vehicle=(state.transportVehicles||[]).find((item)=>String(item.id)===String(vehicleId));
    if(!vehicle||!openPartnerRecordShell('TRANSPORT VEHICLE RECORD','Vehicle Details'))return;
    $('#partnerRecordTitle').textContent=[vehicle.vehicle_type,vehicle.registration_number].filter(Boolean).join(' · ')||'Vehicle Details';
    $('#partnerRecordGrid').innerHTML=partnerRecordGridHtml([
      ['Provider',vehicle.provider_name],['Vehicle type',vehicle.vehicle_type],['Registration',vehicle.registration_number],
      ['Make / Model',vehicle.make_model],['Colour',vehicle.colour],['Service types',vehicle.service_types],
      ['Capacity',vehicle.capacity_description],['Maximum weight',vehicle.max_weight_kg!=null?vehicle.max_weight_kg+' kg':''],
      ['Service area',vehicle.service_area],['Waiting point',vehicle.waiting_point_name],['Waiting latitude',vehicle.waiting_point_latitude],
      ['Waiting longitude',vehicle.waiting_point_longitude],['Waiting map link',vehicle.waiting_point_map_link],
      ['Vehicle status',String(vehicle.approval_status||'').replaceAll('_',' ')],['Customer availability',vehicle.is_available?'Available':'Hidden / unavailable'],
      ['Driver full name',vehicle.driver_full_name],['Driver ID number',vehicle.driver_id_number],['Driver phone',vehicle.driver_phone],
      ['Driver licence',vehicle.driver_licence_number],['Admin notes',vehicle.admin_notes],['Submitted',formatDate(vehicle.submitted_at,true)]
    ]);
    await renderPartnerRecordMedia(vehicle,'transport_vehicle');
    $('#partnerRecordRelated').innerHTML='<div class="partner-record-private-note">Driver identity details and passport photo are Admin-only verification information.</div>';
  };

  const setServiceProviderSuspended=async(button,providerId,suspended)=>{
    const label=suspended?'suspend':'reactivate';
    const notes=window.prompt((suspended?'Reason / note for suspension':'Optional reactivation note')+':','')||'';
    if(suspended&&!window.confirm('Suspend this Service Provider account? Its profile and all services will immediately disappear from the customer website.'))return;
    await withButtonLock(button,suspended?'Suspending…':'Reactivating…',async()=>{
      const {error}=await db.rpc('admin_set_service_provider_account_status',{p_provider_id:providerId,p_suspended:suspended,p_notes:notes||null});
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadServiceProviders(),loadServiceListings(),loadAuditLog().catch(()=>{})]);
      globalStatus('Service Provider account '+label+'d. Customer visibility updated.');
    });
  };

  const setServiceListingActive=async(button,serviceId,active)=>{
    const item=(state.serviceListings||[]).find((row)=>String(row.service_id)===String(serviceId));
    if(!item)return;
    const notes=window.prompt((active?'Optional reactivation note':'Reason / note for suspension')+':','')||'';
    if(!active&&!window.confirm('Suspend "'+(item.service_name||'this service')+'"? It will immediately disappear from the customer website.'))return;
    await withButtonLock(button,active?'Reactivating…':'Suspending…',async()=>{
      const {error}=await db.rpc('admin_set_service_listing_availability',{p_service_id:serviceId,p_active:active,p_notes:notes||null});
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadServiceListings(),loadServiceProviders(),loadAuditLog().catch(()=>{})]);
      globalStatus(active?'Service reactivated and customer-visible again.':'Service suspended and hidden from customers.');
    });
  };

  const setTransportProviderSuspended=async(button,providerId,suspended)=>{
    const notes=window.prompt((suspended?'Reason / note for suspension':'Optional reactivation note')+':','')||'';
    if(suspended&&!window.confirm('Suspend this Transport Provider account? All of its vehicles will immediately disappear from the customer website.'))return;
    await withButtonLock(button,suspended?'Suspending…':'Reactivating…',async()=>{
      const {error}=await db.rpc('admin_set_transport_provider_account_status',{p_provider_id:providerId,p_suspended:suspended,p_notes:notes||null});
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadTransportNetwork(),loadAuditLog().catch(()=>{})]);
      globalStatus(suspended?'Transport Provider suspended and hidden from customers.':'Transport Provider reactivated.');
    });
  };

  const setTransportVehicleActive=async(button,vehicleId,active)=>{
    const vehicle=(state.transportVehicles||[]).find((item)=>String(item.id)===String(vehicleId));
    if(!vehicle)return;
    const notes=window.prompt((active?'Optional reactivation note':'Reason / note for suspension')+':','')||'';
    if(!active&&!window.confirm('Suspend '+([vehicle.vehicle_type,vehicle.registration_number].filter(Boolean).join(' ')||'this vehicle')+'? It will immediately disappear from the customer website.'))return;
    await withButtonLock(button,active?'Reactivating…':'Suspending…',async()=>{
      const {error}=await db.rpc('admin_set_transport_vehicle_availability',{p_vehicle_id:vehicleId,p_active:active,p_notes:notes||null});
      if(error){globalStatus(friendlyError(error),'error');return;}
      await Promise.all([loadTransportNetwork(),loadAuditLog().catch(()=>{})]);
      globalStatus(active?'Vehicle reactivated and customer-visible again.':'Vehicle suspended and hidden from customers.');
    });
  };

  const renderServiceListings=()=>{
    const target=$('#adminServiceListingBody');if(!target)return;
    const filter=$('#adminServiceListingFilter')?.value||'all';
    const rows=(state.serviceListings||[]).filter((item)=>filter==='all'||item.approval_status===filter);
    target.innerHTML=rows.length?rows.map((item)=>{
      const pending=['pending','under_review','changes_requested'].includes(item.approval_status);
      const action=pending
        ? '<button type="button" data-open-service-listing-approval="'+escapeHtml(item.service_id)+'">Open Approval →</button>'
        : item.approval_status==='approved'
          ? '<div class="partner-record-actions"><button type="button" data-view-service-provider="'+escapeHtml(item.provider_id)+'">View Provider</button>'+
            (item.is_available
              ? '<button type="button" class="danger" data-service-listing-active="false" data-service-listing-id="'+escapeHtml(item.service_id)+'">Suspend Service</button>'
              : '<button type="button" data-service-listing-active="true" data-service-listing-id="'+escapeHtml(item.service_id)+'">Reactivate Service</button>')+
            '</div>'
          : '<button type="button" data-view-service-provider="'+escapeHtml(item.provider_id)+'">View Provider</button>';
      return '<tr>'+
        '<td data-label="Service"><strong>'+escapeHtml(item.service_name||'Service')+'</strong><small>'+escapeHtml(item.category_name||'Uncategorised')+'</small></td>'+
        '<td data-label="Provider"><strong>'+escapeHtml(item.provider_name||'Service Provider')+'</strong><small>'+escapeHtml(item.provider_email||'')+'</small></td>'+
        '<td data-label="Pricing"><strong>'+escapeHtml(serviceListingPriceText(item))+'</strong><small>'+escapeHtml(String(item.pricing_model||'').replaceAll('_',' '))+'</small></td>'+
        '<td data-label="Area"><strong>'+escapeHtml(item.service_area||'—')+'</strong><small>'+escapeHtml(item.availability_notes||'')+'</small></td>'+
        '<td data-label="Availability"><span class="status-chip">'+(item.is_available?'Available':'Unavailable')+'</span></td>'+
        '<td data-label="Approval"><span class="status-chip">'+escapeHtml(String(item.approval_status||'').replaceAll('_',' '))+'</span><small>'+escapeHtml(formatDate(item.approved_at||item.submitted_at,true))+'</small></td>'+
        '<td data-label="Action">'+action+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7">No Service Listings match this filter.</td></tr>';
    Array.from(target.querySelectorAll('[data-open-service-listing-approval]')).forEach((button)=>button.addEventListener('click',()=>openApproval('service_listing',button.dataset.openServiceListingApproval)));
    Array.from(target.querySelectorAll('[data-view-service-provider]')).forEach((button)=>button.addEventListener('click',()=>openServiceProviderRecord(button.dataset.viewServiceProvider)));
    Array.from(target.querySelectorAll('[data-service-listing-active]')).forEach((button)=>button.addEventListener('click',()=>setServiceListingActive(button,button.dataset.serviceListingId,button.dataset.serviceListingActive==='true')));
  };
  const loadServiceListings=async()=>{
    const {data,error}=await db.rpc('admin_list_service_listings');
    if(error)throw error;
    state.serviceListings=Array.isArray(data)?data:[];
    renderServiceListings();
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
        '<td data-label="Action"><div class="partner-record-actions">'+
          (pendingApproval?'<button type="button" data-provider-review="'+escapeHtml(item.user_id)+'">Open Approval →</button>':'')+
          '<button type="button" data-view-service-provider="'+escapeHtml(item.user_id)+'">View Details</button>'+
          (item.application_status==='approved'
            ? '<button type="button" class="danger" data-service-provider-suspend="true" data-service-provider-id="'+escapeHtml(item.user_id)+'">Suspend Account</button>'
            : item.application_status==='suspended'
              ? '<button type="button" data-service-provider-suspend="false" data-service-provider-id="'+escapeHtml(item.user_id)+'">Reactivate</button>'
              : '')+
        '</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7">No Service Provider accounts yet.</td></tr>';
    const serviceProviderTable=$('#serviceProviderTableBody');
    Array.from(serviceProviderTable?.querySelectorAll('[data-provider-review]')||[]).forEach((button)=>button.addEventListener('click',()=>openApproval('service_provider_application',button.dataset.providerReview)));
    Array.from(serviceProviderTable?.querySelectorAll('[data-view-service-provider]')||[]).forEach((button)=>button.addEventListener('click',()=>openServiceProviderRecord(button.dataset.viewServiceProvider)));
    Array.from(serviceProviderTable?.querySelectorAll('[data-service-provider-suspend]')||[]).forEach((button)=>button.addEventListener('click',()=>setServiceProviderSuspended(button,button.dataset.serviceProviderId,button.dataset.serviceProviderSuspend==='true')));
  };
  const loadServiceProviders = async () => {
    const {data,error}=await db.rpc('admin_list_service_providers');
    if(error)throw error;
    state.serviceProviders=Array.isArray(data)?data:[];
    renderServiceProviders();
  };

  const serviceRequestStatusText=(value)=>({
    submitted:'Waiting for dispatch',awaiting_payment_verification:'Payment verification',
    payment_verified:'Payment verified · ready',payment_rejected:'Payment rejected',
    dispatched:'With provider',accepted:'Accepted',declined:'Provider declined',
    quoted:'Quote sent to customer',quote_accepted:'Quote accepted',quote_rejected:'Quote rejected',
    in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));
  const renderServiceRequests=()=>{
    const all=state.serviceRequests||[];
    $('#adminServiceRequestTotal').textContent=all.length;
    $('#adminServicePaymentPending').textContent=all.filter(r=>r.request_status==='awaiting_payment_verification').length;
    $('#adminServiceReadyDispatch').textContent=all.filter(r=>['submitted','payment_verified'].includes(r.request_status)).length;
    $('#adminServiceActiveJobs').textContent=all.filter(r=>['dispatched','accepted','quoted','quote_accepted','in_progress'].includes(r.request_status)).length;
    updateSidebarActionCounts();
    const filter=$('#adminServiceRequestFilter')?.value||'all';
    let rows=all;
    if(filter==='awaiting_payment_verification')rows=rows.filter(r=>r.request_status===filter);
    if(filter==='ready')rows=rows.filter(r=>['submitted','payment_verified'].includes(r.request_status));
    if(filter==='dispatched')rows=rows.filter(r=>['dispatched','quoted'].includes(r.request_status));
    if(filter==='active')rows=rows.filter(r=>['accepted','quote_accepted','in_progress'].includes(r.request_status));
    if(filter==='closed')rows=rows.filter(r=>['completed','cancelled','declined','quote_rejected','payment_rejected'].includes(r.request_status));
    const target=$('#adminServiceRequestList');if(!target)return;
    target.innerHTML=rows.length?rows.map(item=>{
      const actions=[];
      if(item.request_status==='awaiting_payment_verification'){
        actions.push('<button class="verify" type="button" data-service-payment="'+escapeHtml(item.id)+'" data-approved="true">Verify Fee</button>');
        actions.push('<button class="reject" type="button" data-service-payment="'+escapeHtml(item.id)+'" data-approved="false">Reject Fee</button>');
      }
      if(['submitted','payment_verified'].includes(item.request_status))actions.push('<button class="dispatch" type="button" data-dispatch-service-request="'+escapeHtml(item.id)+'">Dispatch to Provider</button>');
      if(!['completed','cancelled'].includes(item.request_status))actions.push('<button class="cancel" type="button" data-cancel-service-request="'+escapeHtml(item.id)+'">Cancel</button>');
      const feeAmount=item.request_type==='direct'?Number(item.direct_request_fee_kes||0):Number(item.quotation_fee_kes||0);
      const feeLabel=item.request_type==='direct'?'Direct request fee':'Quotation fee';
      return '<article class="admin-service-request-card"><header><div><strong>'+escapeHtml(item.request_reference)+'</strong><small>'+escapeHtml(formatDate(item.created_at,true))+' · '+escapeHtml(item.service_name||'Service')+'</small></div><b>'+escapeHtml(serviceRequestStatusText(item.request_status))+'</b></header>'+
        '<div class="admin-service-request-grid"><div><small>CUSTOMER</small><strong>'+escapeHtml(item.customer_name||'Customer')+'</strong><span>'+escapeHtml(item.customer_phone||'—')+'</span></div><div><small>PROVIDER</small><strong>'+escapeHtml(item.business_name||'Provider')+'</strong><span>'+escapeHtml(item.provider_phone||'—')+'</span></div><div><small>REQUEST</small><strong>'+(item.request_type==='quotation'?'Paid quotation':'Direct service')+'</strong><span>'+escapeHtml(item.service_location||'—')+'</span></div></div>'+
        '<p><strong>Job details:</strong> '+escapeHtml(item.request_details||'—')+'</p>'+
        '<p><strong>Preferred schedule:</strong> '+escapeHtml((item.preferred_date||'Flexible date')+(item.preferred_time?' · '+String(item.preferred_time).slice(0,5):''))+(item.nearest_landmark?' · Landmark: '+escapeHtml(item.nearest_landmark):'')+'</p>'+
        (feeAmount>0?'<p><strong>'+escapeHtml(feeLabel)+':</strong> '+escapeHtml(formatMoney(feeAmount))+' · '+escapeHtml(String(item.payment_status||'').replaceAll('_',' '))+(item.payment_reference?' · Ref '+escapeHtml(item.payment_reference):'')+'</p>':'')+
        (item.provider_quote_kes?'<p><strong>Provider quotation:</strong> '+escapeHtml(formatMoney(item.provider_quote_kes))+(item.provider_quote_notes?' · '+escapeHtml(item.provider_quote_notes):'')+'</p>':'')+
        (item.admin_notes?'<p><strong>Admin note:</strong> '+escapeHtml(item.admin_notes)+'</p>':'')+
        '<div class="admin-service-request-actions">'+actions.join('')+'</div></article>';
    }).join(''):'<div class="reserved-module slim"><span>🛠️</span><h3>No matching service requests</h3><p>Requests in this status will appear here.</p></div>';
  };
  const loadServiceOperations=async()=>{
    const [requestsResult,settingsResult]=await Promise.all([
      db.rpc('admin_list_service_requests'),
      db.rpc('admin_get_service_marketplace_settings')
    ]);
    if(requestsResult.error)throw requestsResult.error;
    if(settingsResult.error)throw settingsResult.error;
    state.serviceRequests=Array.isArray(requestsResult.data)?requestsResult.data:[];
    state.serviceMarketplaceSettings=settingsResult.data||{direct_request_fee_kes:50,quotation_fee_kes:50};
    if($('#adminDirectServiceRequestFee'))$('#adminDirectServiceRequestFee').value=Number(state.serviceMarketplaceSettings.direct_request_fee_kes??50);
    if($('#adminServiceQuotationFee'))$('#adminServiceQuotationFee').value=Number(state.serviceMarketplaceSettings.quotation_fee_kes??50);
    renderServiceRequests();
  };
  const saveServiceQuotationFee=async(event)=>{
    event.preventDefault();
    const button=event.submitter||event.currentTarget.querySelector('button[type="submit"]');
    await withButtonLock(button,'Saving…',async()=>{
      const directFee=Number($('#adminDirectServiceRequestFee').value);
      const quotationFee=Number($('#adminServiceQuotationFee').value);
      const {data,error}=await db.rpc('admin_update_service_request_fees',{p_direct_request_fee_kes:directFee,p_quotation_fee_kes:quotationFee});
      if(error){setFormStatus($('#serviceQuotationFeeStatus'),friendlyError(error),'error');return;}
      state.serviceMarketplaceSettings=data;
      setFormStatus($('#serviceQuotationFeeStatus'),'Service fees saved. Direct requests: '+formatMoney(data.direct_request_fee_kes)+'; quotation requests: '+formatMoney(data.quotation_fee_kes)+'.','success');
      await loadAuditLog().catch(()=>{});
    });
  };
  const handleServiceRequestAction=async(button)=>{
    const id=button.dataset.servicePayment||button.dataset.dispatchServiceRequest||button.dataset.cancelServiceRequest;
    if(!id)return;
    await withButtonLock(button,'Saving…',async()=>{
      let result;
      if(button.dataset.servicePayment){
        const approved=button.dataset.approved==='true';
        const notes=window.prompt(approved?'Optional verification note:':'Reason payment was rejected:','')||null;
        result=await db.rpc('admin_verify_service_quotation_payment',{p_request_id:id,p_approved:approved,p_notes:notes});
      }else if(button.dataset.dispatchServiceRequest){
        const notes=window.prompt('Optional dispatch note for this request:','')||null;
        result=await db.rpc('admin_dispatch_service_request',{p_request_id:id,p_notes:notes});
      }else{
        const notes=window.prompt('Enter the cancellation reason:','')||'';
        if(notes.trim().length<3)return;
        result=await db.rpc('admin_cancel_service_request',{p_request_id:id,p_notes:notes});
      }
      if(result.error){globalStatus(friendlyError(result.error),'error');return;}
      globalStatus('Service request updated successfully.');
      await Promise.all([loadServiceOperations(),loadAuditLog().catch(()=>{})]);
    });
  };

  const adminServiceReviewStars=(rating)=>'★'.repeat(Math.max(0,Math.min(5,Number(rating)||0)))+'☆'.repeat(Math.max(0,5-(Number(rating)||0)));

  const renderReviewList=(target,rows,emptyLabel)=>{
    if(!target)return;
    target.innerHTML=rows.length?rows.map((item)=>{
      const context=item.service_name||item.vehicle_label||(item.partner_type==='transport'?'Transport & Parcel Service':'Professional Service');
      const typeLabel=item.partner_type==='transport'?'Transport & Parcel':'Service Provider';
      const verified=item.verified_completed_service
        ? '<span class="service-review-verified">✓ Verified completed LEOGO '+(item.partner_type==='transport'?'transport job':'service')+'</span>'
        : '<span class="service-review-verified neutral">Unverified review — cannot be approved</span>';
      const actions=item.moderation_status==='submitted'
        ? '<div class="admin-product-review-actions"><button class="approve" type="button" data-moderate-service-review="'+escapeHtml(item.review_id)+'" data-review-action="approved">Approve</button><button class="reject" type="button" data-moderate-service-review="'+escapeHtml(item.review_id)+'" data-review-action="rejected">Reject</button></div>'
        : '<div class="admin-product-review-actions"><span class="status-chip">'+escapeHtml(String(item.moderation_status||'').replaceAll('_',' '))+'</span></div>';
      return '<article class="admin-product-review-item admin-service-review-item">'+
        '<header><div><span>'+escapeHtml(typeLabel)+'</span><strong>'+escapeHtml(item.provider_name||typeLabel)+'</strong><small>'+escapeHtml(context)+'</small></div><b>'+escapeHtml(adminServiceReviewStars(item.rating))+' '+escapeHtml(item.rating)+'/5</b></header>'+
        '<div class="admin-service-review-meta"><span><strong>Customer:</strong> '+escapeHtml(item.customer_name||'Customer')+'</span><span><strong>Submitted:</strong> '+escapeHtml(formatDate(item.created_at,true))+'</span>'+verified+'</div>'+
        (item.request_reference?'<p><strong>Service request:</strong> '+escapeHtml(item.request_reference)+'</p>':'')+
        '<p class="admin-product-review-comment">'+escapeHtml(item.comment||'Customer submitted a rating without a written comment.')+'</p>'+
        (item.admin_notes?'<p class="admin-review-note"><strong>Admin note:</strong> '+escapeHtml(item.admin_notes)+'</p>':'')+
        actions+
      '</article>';
    }).join(''):'<div class="loading-card">'+escapeHtml(emptyLabel)+'</div>';
    $$('[data-moderate-service-review]',target).forEach((button)=>button.addEventListener('click',()=>moderateServiceReview(button)));
  };

  const renderServiceReviews=()=>{
    const all=Array.isArray(state.serviceReviews)?state.serviceReviews:[];
    const servicePending=all.filter((item)=>item.partner_type==='service_provider'&&item.moderation_status==='submitted').length;
    const transportPending=all.filter((item)=>item.partner_type==='transport'&&item.moderation_status==='submitted').length;
    if($('#adminServiceReviewPending'))$('#adminServiceReviewPending').textContent=servicePending;
    if($('#adminTransportReviewPending'))$('#adminTransportReviewPending').textContent=transportPending;

    const serviceStatus=$('#adminServiceReviewStatusFilter')?.value||'submitted';
    const transportStatus=$('#adminTransportReviewStatusFilter')?.value||'submitted';

    const serviceRows=all.filter((item)=>
      item.partner_type==='service_provider' &&
      (serviceStatus==='all'||item.moderation_status===serviceStatus)
    );
    const transportRows=all.filter((item)=>
      item.partner_type==='transport' &&
      (transportStatus==='all'||item.moderation_status===transportStatus)
    );

    renderReviewList($('#adminServiceReviewList'),serviceRows,'No Service Provider reviews match this filter.');
    renderReviewList($('#adminTransportReviewList'),transportRows,'No Transport reviews match this filter.');
  };

  const loadServiceReviews=async()=>{
    const {data,error}=await db.rpc('admin_list_service_reviews');
    if(error)throw error;
    state.serviceReviews=Array.isArray(data)?data:[];
    renderServiceReviews();
  };

  const moderateServiceReview=async(button)=>{
    const reviewId=button.dataset.moderateServiceReview;
    const action=button.dataset.reviewAction;
    if(!reviewId||!['approved','rejected'].includes(action))return;
    let notes=null;
    if(action==='rejected'){
      notes=window.prompt('Enter the reason this service review should not be published:','')||'';
      if(notes.trim().length<3){globalStatus('Add a clear rejection reason before rejecting the review.','error');return;}
    }else{
      notes=window.prompt('Optional Admin note for this approved review:','')||null;
    }
    await withButtonLock(button,action==='approved'?'Approving…':'Rejecting…',async()=>{
      const {error}=await db.rpc('admin_moderate_service_review',{
        p_review_id:reviewId,
        p_action:action,
        p_admin_notes:notes||null
      });
      if(error){globalStatus(friendlyError(error),'error');return;}
      const review=state.serviceReviews.find((item)=>String(item.review_id)===String(reviewId));
      const label=review?.partner_type==='transport'?'Transport review':'Service Provider review';
      globalStatus(action==='approved'?label+' approved and published to customers.':label+' rejected and kept off the public Customer Front.');
      await Promise.all([loadServiceReviews(),loadAuditLog().catch(()=>{})]);
    });
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
      ['Shop coordinates',(s.shop_latitude!=null&&s.shop_longitude!=null)?(s.shop_latitude+', '+s.shop_longitude):'Not pinned'],['Shop map link',s.shop_map_link||'—'],
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
    const [accountsResult,providerAccountsResult,transportAccountsResult,requestsResult,providerRequestsResult,transportRequestsResult,settlementsResult,providerSettlementsResult,transportSettlementsResult] = await Promise.all([
      db.rpc('admin_list_seller_settlement_accounts'),
      db.rpc('admin_list_service_provider_settlement_accounts'),
      db.rpc('admin_list_transport_provider_settlement_accounts'),
      db.rpc('admin_list_seller_settlement_requests'),
      db.rpc('admin_list_service_provider_settlement_requests'),
      db.rpc('admin_list_transport_provider_settlement_requests'),
      db.rpc('admin_list_seller_settlements'),
      db.rpc('admin_list_service_provider_settlements'),
      db.rpc('admin_list_transport_provider_settlements')
    ]);
    for (const result of [accountsResult,providerAccountsResult,transportAccountsResult,requestsResult,providerRequestsResult,transportRequestsResult,settlementsResult,providerSettlementsResult,transportSettlementsResult]) {
      if (result.error) throw result.error;
    }
    state.sellerSettlementAccounts = accountsResult.data || [];
    state.providerSettlementAccounts = providerAccountsResult.data || [];
    state.transportSettlementAccounts = transportAccountsResult.data || [];
    state.sellerSettlementRequests = requestsResult.data || [];
    state.providerSettlementRequests = providerRequestsResult.data || [];
    state.transportSettlementRequests = transportRequestsResult.data || [];
    state.sellerSettlements = settlementsResult.data || [];
    state.providerSettlements = providerSettlementsResult.data || [];
    state.transportSettlements = transportSettlementsResult.data || [];
    renderSellerSettlements();
  };
  const settlementAccountsForType = (partnerType) => partnerType === 'seller'
    ? state.sellerSettlementAccounts
    : partnerType === 'service_provider'
      ? state.providerSettlementAccounts
      : state.transportSettlementAccounts;
  const settlementPartnerId = (account,partnerType) => partnerType === 'seller' ? account.seller_id : account.provider_id;
  const settlementPartnerName = (account,partnerType) => partnerType === 'seller'
    ? (account.seller_name || 'Seller')
    : (account.provider_name || (partnerType === 'transport' ? 'Transport Provider' : 'Service Provider'));

  const renderManualSettlementPartners = (preservePartnerId = '') => {
    const type = $('#adminSettlementPartnerType')?.value || 'seller';
    const accounts = settlementAccountsForType(type).filter((account)=>account.status==='approved');
    const partnerIds = [...new Set(accounts.map((account)=>settlementPartnerId(account,type)).filter(Boolean))];
    const current = preservePartnerId || $('#adminSettlementSeller')?.value || '';
    $('#adminSettlementSeller').innerHTML = partnerIds.length
      ? '<option value="">Choose Partner…</option>' + partnerIds.map((partnerId)=>{
          const account=accounts.find((item)=>settlementPartnerId(item,type)===partnerId);
          const label=settlementPartnerName(account||{},type);
          return '<option value="'+escapeHtml(partnerId)+'" '+(partnerId===current?'selected':'')+'>'+escapeHtml(label)+'</option>';
        }).join('')
      : '<option value="">No approved settlement account holders</option>';
    renderSellerSettlementAccountOptions();
  };

  const renderSellerSettlementAccountOptions = () => {
    const type = $('#adminSettlementPartnerType')?.value || 'seller';
    const partnerId = $('#adminSettlementSeller')?.value || '';
    const approved = settlementAccountsForType(type).filter((account) =>
      settlementPartnerId(account,type) === partnerId && account.status === 'approved'
    );
    $('#adminSettlementAccount').innerHTML = approved.length
      ? '<option value="">Choose approved account…</option>' + approved.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)} — ${escapeHtml(settlementDestination(account))}${account.is_primary ? ' (Primary)' : ''}</option>`).join('')
      : '<option value="">No approved settlement account</option>';
  };
  const renderSellerSettlements = () => {
    const partnerAccounts = [
      ...state.sellerSettlementAccounts.map((account)=>({...account,partner_type:'seller',partner_id:account.seller_id,partner_name:account.seller_name,partner_email:account.seller_email})),
      ...state.providerSettlementAccounts.map((account)=>({...account,partner_type:'service_provider',partner_id:account.provider_id,partner_name:account.provider_name,partner_email:account.provider_email})),
      ...state.transportSettlementAccounts.map((account)=>({...account,partner_type:'transport',partner_id:account.provider_id,partner_name:account.provider_name,partner_email:account.provider_email}))
    ];
    const pending = partnerAccounts.filter((account) => account.status === 'pending_review').length;
    const approved = partnerAccounts.filter((account) => account.status === 'approved').length;
    const partnerRequests=[
      ...state.sellerSettlementRequests.map((request)=>({...request,partner_type:'seller',partner_id:request.seller_id,partner_name:request.seller_name,partner_email:request.seller_email,partner_note:request.seller_note})),
      ...state.providerSettlementRequests.map((request)=>({...request,partner_type:'service_provider',partner_id:request.provider_id,partner_name:request.provider_name,partner_email:request.provider_email,partner_note:request.provider_note})),
      ...state.transportSettlementRequests.map((request)=>({...request,partner_type:'transport',partner_id:request.provider_id,partner_name:request.provider_name,partner_email:request.provider_email,partner_note:request.provider_note}))
    ];
    const partnerSettlements=[
      ...state.sellerSettlements.map((item)=>({...item,partner_type:'seller',partner_name:item.seller_name,partner_email:item.seller_email})),
      ...state.providerSettlements.map((item)=>({...item,partner_type:'service_provider',partner_name:item.provider_name,partner_email:item.provider_email})),
      ...state.transportSettlements.map((item)=>({...item,partner_type:'transport',partner_name:item.provider_name,partner_email:item.provider_email}))
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

  const premiumProfileInitials = (name='') => {
    const parts=String(name||'Premium Profile').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0,2).map((part)=>part.charAt(0)).join('')||'PP').toUpperCase();
  };

  const loadPremiumProfileAvatar = async (profile) => {
    if(!profile?.profile_picture_path)return;
    const host=$$('[data-premium-profile-avatar]').find((item)=>item.dataset.premiumProfileAvatar===String(profile.user_id));
    if(!host)return;
    try{
      const {data,error}=await db.storage.from('premium-profile-media').createSignedUrl(String(profile.profile_picture_path),900);
      if(error)throw error;
      const url=data?.signedUrl||'';
      if(!url)throw new Error('No secure profile image URL was returned.');
      host.innerHTML=`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="View ${escapeHtml(profile.display_name||'Premium Profile')} profile picture"><img src="${escapeHtml(url)}" alt="${escapeHtml(profile.display_name||'Premium Profile')} profile picture"></a>`;
      $('img',host)?.addEventListener('error',()=>{host.innerHTML=`<span>${escapeHtml(premiumProfileInitials(profile.display_name))}</span>`;},{once:true});
    }catch(_error){
      host.innerHTML=`<span>${escapeHtml(premiumProfileInitials(profile.display_name))}</span>`;
    }
  };

  const premiumProfileRecordMediaPreview = async (record = {}) => {
    const media = $('#premiumProfileRecordMedia');
    if (!media) return;
    const profile = record.profile || {};
    const identity = record.identity || {};
    const galleryPaths = (Array.isArray(record.gallery) ? record.gallery : [])
      .map((item) => typeof item === 'string' ? item : item?.media_path)
      .filter(Boolean);
    const entries = adminMediaEntries({
      profile_picture_path: profile.profile_picture_path || '',
      gallery_paths: galleryPaths,
      passport_photo_path: identity.passport_photo_path || '',
      id_document_path: identity.id_document_path || ''
    }, 'premium_profile');

    if (!entries.length) {
      media.hidden = true;
      media.innerHTML = '';
      return;
    }

    media.hidden = false;
    media.innerHTML = '<div class="review-media-heading"><span>RETAINED PROFILE FILES</span><strong>Profile, Gallery & Verification Media</strong><small>These are the retained files linked to this Premium Profile, including records kept after approval.</small></div><div class="review-media-grid" id="premiumProfileRecordMediaGrid"></div>';
    const grid = $('#premiumProfileRecordMediaGrid');
    for (const entry of entries) {
      const card = await renderAdminMediaCard(entry);
      if (!grid?.isConnected) return;
      grid.appendChild(card);
    }
  };

  const premiumProfileRecordRows = (record = {}) => {
    const profile = record.profile || {};
    const details = record.details || {};
    const identity = record.identity || {};
    const email = state.customers.find((item) => String(item.user_id) === String(profile.user_id))?.email || '';
    const idNumber = identity.id_number || identity.id_no || identity.national_id || identity.national_id_number || '';
    const preferred = [
      ['Display name', profile.display_name],
      ['Real name', identity.real_name],
      ['Email', email],
      ['Phone', identity.phone],
      ['ID number', idNumber],
      ['Gender', profile.gender],
      ['Age', details.age],
      ['Orientation', details.orientation],
      ['Location', profile.general_location],
      ['About', profile.about],
      ['Available in Premium directory', profile.is_available],
      ['Application status', profile.application_status],
      ['Submitted', formatDate(profile.submitted_at || profile.created_at, true)],
      ['Approved', formatDate(profile.approved_at, true)],
      ['Last updated', formatDate(profile.updated_at, true)]
    ];

    const used = new Set([
      'display_name','real_name','phone','id_number','id_no','national_id','national_id_number',
      'gender','age','orientation','general_location','about','is_available','application_status',
      'submitted_at','approved_at','created_at','updated_at'
    ]);
    const skip = new Set([
      'user_id','profile_picture_path','passport_photo_path','id_document_path',
      'gallery_paths','withdrawal_pin_hash'
    ]);
    const extras = [];
    const addExtras = (source, values) => {
      Object.entries(values || {}).forEach(([key, value]) => {
        if (used.has(key) || skip.has(key) || value === null || value === '' || typeof value === 'object') return;
        let display = value;
        if (typeof value === 'boolean') display = value ? 'Yes' : 'No';
        else if (/(?:_at|_date)$/i.test(key)) display = formatDate(value, true);
        extras.push([source + ' · ' + key.replaceAll('_', ' '), display]);
      });
    };
    addExtras('Profile', profile);
    addExtras('Profile details', details);
    addExtras('Private verification', identity);

    return preferred.concat(extras).filter(([, value]) => value !== null && value !== '' && value !== '—');
  };

  const openPremiumProfileRecord = async (userId) => {
    const summary = state.premiumProfiles.find((item) => String(item.user_id) === String(userId));
    if (!summary) return;

    $('#premiumProfileRecordTitle').textContent = summary.display_name || 'Premium Profile';
    $('#premiumProfileRecordSummary').innerHTML = `<div><span>Application</span><strong>${escapeHtml(summary.application_status || '—')}</strong></div><div><span>Directory</span><strong>Retained Profile</strong></div><div><span>Location</span><strong>${escapeHtml(summary.general_location || '—')}</strong></div><div><span>Approved</span><strong>${escapeHtml(formatDate(summary.approved_at, true))}</strong></div>`;
    $('#premiumProfileRecordGrid').innerHTML = '<div><small>Loading</small><strong>Loading retained Premium Profile details…</strong></div>';
    const media = $('#premiumProfileRecordMedia');
    if (media) { media.hidden = true; media.innerHTML = ''; }
    setFormStatus($('#premiumProfileRecordStatus'), 'Loading retained profile and verification details…');
    $('#premiumProfileRecordModal').hidden = false;

    try {
      const [profileResult,detailsResult,identityResult,galleryResult] = await Promise.all([
        db.from('premium_profiles').select('*').eq('user_id', userId).maybeSingle(),
        db.from('premium_profile_details').select('*').eq('user_id', userId).maybeSingle(),
        db.from('premium_identity_details').select('*').eq('user_id', userId).maybeSingle(),
        db.from('premium_profile_gallery').select('*').eq('user_id', userId).order('sort_order', { ascending: true })
      ]);

      if (profileResult.error) throw profileResult.error;
      const warnings = [];
      if (detailsResult.error) warnings.push('additional profile details');
      if (identityResult.error) warnings.push('private verification details');
      if (galleryResult.error) warnings.push('gallery metadata');

      const record = {
        profile: profileResult.data || summary,
        details: detailsResult.error ? {} : (detailsResult.data || {}),
        identity: identityResult.error ? {} : (identityResult.data || {}),
        gallery: galleryResult.error ? [] : (galleryResult.data || [])
      };
      const rows = premiumProfileRecordRows(record);
      $('#premiumProfileRecordTitle').textContent = record.profile.display_name || summary.display_name || 'Premium Profile';
      $('#premiumProfileRecordSummary').innerHTML = `<div><span>Application</span><strong>${escapeHtml(record.profile.application_status || '—')}</strong></div><div><span>Directory</span><strong>${record.profile.is_available ? 'Available' : 'Not available'}</strong></div><div><span>Location</span><strong>${escapeHtml(record.profile.general_location || '—')}</strong></div><div><span>Approved</span><strong>${escapeHtml(formatDate(record.profile.approved_at, true))}</strong></div>`;
      $('#premiumProfileRecordGrid').innerHTML = rows.length
        ? rows.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value)}</strong></div>`).join('')
        : '<div><small>Record</small><strong>No retained detail fields are available.</strong></div>';
      setFormStatus(
        $('#premiumProfileRecordStatus'),
        warnings.length ? 'Profile loaded. Some retained data could not be opened: ' + warnings.join(', ') + '.' : 'Profile details loaded. This record remains viewable after approval.',
        warnings.length ? 'error' : 'success'
      );
      await premiumProfileRecordMediaPreview(record);
    } catch (error) {
      $('#premiumProfileRecordGrid').innerHTML = '<div><small>Unable to load</small><strong>The retained Premium Profile details could not be opened.</strong></div>';
      setFormStatus($('#premiumProfileRecordStatus'), friendlyError(error), 'error');
    }
  };

  const loadPremiumProfiles = async () => {
    const { data, error } = await db.from('premium_profiles')
      .select('user_id,display_name,profile_picture_path,gender,general_location,application_status,submitted_at,approved_at,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.premiumProfiles = data || [];
    const body = $('#premiumProfileTableBody');
    if (!body) return;
    body.innerHTML = state.premiumProfiles.length ? state.premiumProfiles.map((profile) => `<tr class="premium-profile-row">
      <td data-label="Profile" class="premium-profile-cell"><div class="premium-profile-identity"><div class="premium-profile-avatar" data-premium-profile-avatar="${escapeHtml(profile.user_id)}"><span>${escapeHtml(premiumProfileInitials(profile.display_name))}</span></div><div class="premium-profile-name"><strong>${escapeHtml(profile.display_name || 'Premium Profile')}</strong><small>Verified Premium Profile</small></div></div></td>
      <td data-label="Gender">${escapeHtml(profile.gender || '—')}</td>
      <td data-label="Location">${escapeHtml(profile.general_location || '—')}</td>
      <td data-label="Status"><span class="status-chip">${escapeHtml(profile.application_status || '—')}</span></td>
      <td data-label="Submitted">${formatDate(profile.submitted_at || profile.created_at, true)}</td>
      <td data-label="Approved">${formatDate(profile.approved_at, true)}</td>
      <td data-label="Action"><button class="premium-customer-view-button" type="button" data-premium-profile-view="${escapeHtml(profile.user_id)}">View Details →</button></td>
    </tr>`).join('') : '<tr><td colspan="7">No Premium Profiles have been registered yet.</td></tr>';

    $$('[data-premium-profile-view]', body).forEach((button) => button.addEventListener('click', () => openPremiumProfileRecord(button.dataset.premiumProfileView)));
    await Promise.all(state.premiumProfiles.map((profile)=>loadPremiumProfileAvatar(profile)));
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
    updateSidebarActionCounts();
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

  const renderDataCleanupOverview = () => {
    const overview = state.dataCleanupOverview;
    if (!overview) return;

    $('#cleanupDatabaseSize').textContent = formatBytes(overview.database_bytes);
    $('#cleanupStorageSize').textContent = formatBytes(overview.storage_bytes);
    $('#cleanupStorageObjects').textContent = Number(overview.storage_objects || 0).toLocaleString('en-KE') + ' objects';
    $('#cleanupCandidateCount').textContent = Number(overview.cleanup_candidates?.total || 0).toLocaleString('en-KE');
    $('#cleanupInactiveCustomerCount').textContent = Number(overview.review_only?.inactive_customers || 0).toLocaleString('en-KE');

    const settings = overview.settings || {};
    const form = $('#dataRetentionSettingsForm');
    if (form) {
      ['read_notification_days','diagnostic_event_days','monitoring_run_days','inactive_customer_review_days']
        .forEach((key) => { if (form.elements[key]) form.elements[key].value = settings[key] ?? ''; });
    }

    const candidates = overview.cleanup_candidates || {};
    const candidateRows = [
      ['Read customer notifications', candidates.read_customer_notifications, 'Older than the notification retention period'],
      ['Read partner notifications', candidates.read_partner_notifications, 'Older than the notification retention period'],
      ['Resolved diagnostic events', candidates.resolved_runtime_error_events, 'Only resolved/ignored issue events'],
      ['Old monitoring runs', candidates.old_monitoring_runs, 'Newest 30 and incident-linked runs stay protected']
    ];
    $('#cleanupCandidateList').innerHTML = candidateRows.map(([label,count,note]) => `
      <div class="cleanup-list-row"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(note)}</small></div><b>${Number(count || 0).toLocaleString('en-KE')}</b></div>
    `).join('');

    const buckets = Array.isArray(overview.storage_buckets) ? overview.storage_buckets : [];
    $('#cleanupBucketList').innerHTML = buckets.length ? buckets.map((bucket) => `
      <div class="cleanup-list-row"><div><strong>${escapeHtml(bucket.bucket_id || 'Storage bucket')}</strong><small>${Number(bucket.object_count || 0).toLocaleString('en-KE')} object(s)</small></div><b>${formatBytes(bucket.bytes)}</b></div>
    `).join('') : '<div class="empty-mini">No Storage objects are currently using space.</div>';

    const cleanupButton = $('#runSafeDataCleanup');
    if (cleanupButton) cleanupButton.disabled = Number(candidates.total || 0) <= 0;
  };

  const loadDataCleanupOverview = async () => {
    if (!isSuperAdmin()) return;
    const { data, error } = await db.rpc('admin_get_data_cleanup_overview');
    if (error) throw error;
    state.dataCleanupOverview = data || {};
    renderDataCleanupOverview();
    setFormStatus($('#dataCleanupStatus'), 'Storage scan completed. Nothing has been deleted.', 'success');
  };

  const saveDataRetentionSettings = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin()) {
      setFormStatus($('#dataRetentionSettingsStatus'), 'Super Admin access is required.', 'error');
      return;
    }
    const form = event.currentTarget;
    const button = event.submitter || $('button[type="submit"]', form);
    await withButtonLock(button, 'Saving…', async () => {
      const { error } = await db.rpc('admin_save_data_retention_settings', {
        p_read_notification_days: Number(form.elements.read_notification_days.value),
        p_diagnostic_event_days: Number(form.elements.diagnostic_event_days.value),
        p_monitoring_run_days: Number(form.elements.monitoring_run_days.value),
        p_inactive_customer_review_days: Number(form.elements.inactive_customer_review_days.value)
      });
      if (error) {
        setFormStatus($('#dataRetentionSettingsStatus'), friendlyError(error), 'error');
        return;
      }
      setFormStatus($('#dataRetentionSettingsStatus'), 'Retention rules saved and recorded in Audit Log.', 'success');
      await Promise.all([loadDataCleanupOverview(), loadAuditLog()]);
    });
  };

  const runSafeDataCleanup = async (button) => {
    if (!isSuperAdmin()) {
      globalStatus('Super Admin access is required for data cleanup.', 'error');
      return;
    }
    const total = Number(state.dataCleanupOverview?.cleanup_candidates?.total || 0);
    if (!total) {
      setFormStatus($('#dataCleanupStatus'), 'There are no eligible housekeeping records to delete.', 'success');
      return;
    }
    const confirmed = window.confirm(
      `Delete ${total.toLocaleString('en-KE')} eligible housekeeping record(s)?\n\nThis action only removes old READ notifications, resolved/ignored diagnostic event history and old monitoring runs. Customer accounts, orders, payments, Wallet/SACCO, loans, audit history, disputes and Storage files will NOT be deleted.`
    );
    if (!confirmed) return;

    await withButtonLock(button, 'Cleaning safely…', async () => {
      const { data, error } = await db.rpc('admin_run_safe_data_cleanup');
      if (error) {
        setFormStatus($('#dataCleanupStatus'), friendlyError(error), 'error');
        return;
      }
      const deleted = Number(data?.total_deleted || 0);
      setFormStatus(
        $('#dataCleanupStatus'),
        `Safe cleanup completed: ${deleted.toLocaleString('en-KE')} housekeeping record(s) removed. Protected business/customer data was untouched.`,
        'success'
      );
      await Promise.all([
        loadDataCleanupOverview(),
        loadAuditLog(),
        loadSystemMonitoringSnapshot().catch(() => null)
      ]);
    });
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
    const d=state.dashboard, rows=[['Metric','Value'],['Reporting Period',dashboardLabel()],['Today / Range Orders',metricValue(d.top.orders)],['Gross Order Sales',metricValue(d.revenue.gross_order_sales,true)],['LEOGO Revenue',formatMoney(d.revenue.total_leogo)],['Pending Approvals',metricValue(d.top.pending_approvals)],['Active Deliveries',metricValue(d.top.active_deliveries)],[],['LEOGO Earnings','Amount'],['Premium Revenue',formatMoney(d.revenue.premium.value)],['Service Fees & Commission',metricValue(d.revenue.service_commission,true)],['Accommodation Revenue',metricValue(d.revenue.accommodation_commission,true)],['Other LEOGO Revenue',formatMoney(d.revenue.other.value)],[],['Wallet/SACCO Activity (not revenue)','Value'],['Deposits',formatMoney(d.wallet.deposits)],['Withdrawals',formatMoney(d.wallet.withdrawals)],['Savings Deposits',formatMoney(d.wallet.savings_deposits)],['Pending Deposits',d.wallet.pending_deposits],['Pending Withdrawals',d.wallet.pending_withdrawals]];
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
    document.querySelectorAll('.admin-panel').forEach((panel) => {
      const isTarget = panel.dataset.adminPanel === view;
      panel.classList.toggle('active', isTarget);
      // Core Admin panels are class-driven. Group Orders is the only
      // additive panel that also uses the hidden attribute.
      if (panel.dataset.adminPanel === 'group_orders') panel.hidden = !isTarget;
      else panel.hidden = false;
    });
    document.querySelectorAll('.admin-nav [data-admin-view]').forEach((button) => {
      if(view==='transport'&&button.dataset.adminView==='transport')return;
      button.classList.toggle('active', button.dataset.adminView === view && (!button.dataset.settingsTab || button.dataset.settingsTab === settingsTab));
    });
    $('#adminPageTitle').textContent = viewTitles[view] || 'Admin Control Center';
    $('#adminBreadcrumb').textContent = ['settings','diagnostics'].includes(view) ? 'ADMINISTRATION' : 'CONTROL CENTER';

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
    if (view === 'diagnostics') {
      window.leogoDiagnostics?.activate?.();
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
    if(tab==='security'&&!isSuperAdmin()){
      globalStatus('Super Admin access is required for Admin Security.','error');
      return;
    }
    if(tab==='data'&&!isSuperAdmin()){
      globalStatus('Super Admin access is required for Data Cleanup & Retention.','error');
      return;
    }
    $$('#settingsTabs [data-settings-panel]').forEach((button) => button.classList.toggle('active', button.dataset.settingsPanel === tab));
    $$('[data-settings-content]').forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsContent === tab));
    if (tab === 'data') {
      renderDataManagement();
      loadDataCleanupOverview().catch((error)=>setFormStatus($('#dataCleanupStatus'),friendlyError(error),'error'));
    }
    if (tab === 'orders') loadOrderSettings().catch((error)=>setFormStatus($('#orderSettingsStatus'),friendlyError(error),'error'));
    if (tab === 'lipa') loadLipaPolePoleSettings().catch((error)=>setFormStatus($('#lipaPolePoleSettingsStatus'),friendlyError(error),'error'));
  };
  const openSystemSettingsCard=(target)=>{
    const scrollTo=(selector)=>window.setTimeout(()=>$(selector)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    if(target==='orders'){changeSettingsTab('orders');scrollTo('#orderSettingsForm');return;}
    if(target==='delivery'){
      activeTransportSection='zones';
      changeView('transport');
      changeTransportSection('zones');
      scrollTo('#deliveryRateSettingsForm');
      return;
    }
    if(target==='wallet'){changeSettingsTab('fees');scrollTo('#walletFeesForm');return;}
    if(target==='lipa'){changeSettingsTab('lipa');scrollTo('#lipaPolePoleSettingsForm');return;}
    if(target==='premium'){changeSettingsTab('fees');scrollTo('#partnerSubscriptionSettingsForm');return;}
    if(target==='accommodation'){changeSettingsTab('fees');scrollTo('#accommodationFinanceSettingsForm');return;}
    if(target==='notifications'){changeSettingsTab('email');scrollTo('#emailNotificationSettingsForm');return;}
    if(target==='security'){changeView('settings','security');scrollTo('#adminSecuritySettingsPanel');return;}
    if(target==='preferences'){changeSettingsTab('business');scrollTo('#businessSettingsForm');return;}
  };
  const closeSidebar = () => { $('#adminSidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('open'); };
  const closeModals = () => { $$('.modal').forEach((modal) => { modal.hidden = true; }); state.activeApproval = null; };


  const validateSuperAdminPassword = (password) => {
    if(String(password||'').length<12) return 'Use at least 12 characters.';
    if(!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
    if(!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
    if(!/[0-9]/.test(password)) return 'Add at least one number.';
    if(!/[^A-Za-z0-9]/.test(password)) return 'Add at least one symbol.';
    return '';
  };

  const recordAdminSecurityEvent = async (action,metadata={}) => {
    try{
      const {error}=await db.rpc('admin_record_security_event',{
        p_action:action,
        p_metadata:metadata
      });
      if(error) throw error;
      if(isSuperAdmin()) loadAuditLog().catch(()=>{});
      return true;
    }catch(error){
      console.error('LEOGO Admin security audit failed:',error);
      return false;
    }
  };

  const requestAdminRecoveryEmail = async (email,statusNode) => {
    const normalized=String(email||'').trim();
    if(!normalized){
      setFormStatus(statusNode,'Enter the Super Admin email address first.','error');
      return false;
    }
    const {error}=await db.auth.resetPasswordForEmail(normalized,{redirectTo:ADMIN_RECOVERY_URL});
    if(error) throw error;
    setFormStatus(statusNode,'If this address belongs to the LEOGO Super Admin, a secure recovery link has been sent.','success');
    return true;
  };

  const changeSuperAdminPassword = async () => {
    if(!isSuperAdmin()) throw new Error('Super Admin access required.');
    const status=$('#adminChangePasswordStatus');
    const current=$('#adminCurrentPassword')?.value||'';
    const next=$('#adminNewPassword')?.value||'';
    const confirm=$('#adminConfirmPassword')?.value||'';
    if(!current) throw new Error('Enter your current password.');
    const passwordIssue=validateSuperAdminPassword(next);
    if(passwordIssue) throw new Error(passwordIssue);
    if(next!==confirm) throw new Error('The new passwords do not match.');
    if(current===next) throw new Error('Choose a new password that is different from the current password.');
    const email=state.user?.email||'';
    if(!email) throw new Error('The Super Admin account does not have an email address.');

    setFormStatus(status,'Verifying current password…');
    const verification=await db.auth.signInWithPassword({email,password:current});
    if(verification.error) throw new Error('Current password is incorrect.');
    if(verification.data?.user?.id!==state.user?.id) throw new Error('Current password verification did not match this Super Admin account.');

    setFormStatus(status,'Updating password and revoking other sessions…');
    const update=await db.auth.updateUser({password:next});
    if(update.error) throw update.error;

    const auditOk=await recordAdminSecurityEvent('admin.security.password_changed',{
      method:'authenticated_change',
      other_sessions_revoked:true
    });

    const revoke=await db.auth.signOut({scope:'others'});
    if(revoke.error) throw revoke.error;

    $('#adminCurrentPassword').value='';
    $('#adminNewPassword').value='';
    $('#adminConfirmPassword').value='';
    setFormStatus(
      status,
      auditOk
        ? 'Password changed successfully. Other signed-in devices have been revoked.'
        : 'Password changed and other devices were revoked, but the audit entry could not be refreshed. Check Audit Log.',
      auditOk?'success':'error'
    );
  };

  const signOutOtherAdminSessions = async () => {
    if(!isSuperAdmin()) throw new Error('Super Admin access required.');
    const status=$('#adminSessionSecurityStatus');
    setFormStatus(status,'Revoking other signed-in devices…');
    await recordAdminSecurityEvent('admin.security.other_sessions_revoked',{method:'manual'});
    const {error}=await db.auth.signOut({scope:'others'});
    if(error) throw error;
    setFormStatus(status,'Other Admin sessions have been signed out. This browser remains signed in.','success');
  };

  const signOutAllAdminSessions = async () => {
    if(!isSuperAdmin()) throw new Error('Super Admin access required.');
    const accepted=window.confirm('Sign out the Super Admin account from every device, including this browser?');
    if(!accepted) return;
    const status=$('#adminSessionSecurityStatus');
    setFormStatus(status,'Signing out all Admin sessions…');
    await recordAdminSecurityEvent('admin.security.all_sessions_revoked',{method:'manual'});
    const {error}=await db.auth.signOut({scope:'global'});
    if(error) throw error;
    stopAdminNotificationRealtime();
    state.admin=null;
    state.user=null;
    showGate('login');
    if($('#adminPassword')) $('#adminPassword').value='';
    setFormStatus($('#adminLoginStatus'),'All Admin sessions were revoked. Sign in again with the current password.','success');
  };

  const bindEvents = () => {
    $('#adminLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!db) {
        setFormStatus($('#adminLoginStatus'),'The secure connection could not load. Refresh this page.','error');
        return;
      }
      const button=$('#adminLoginButton');
      await withButtonLock(button,'Signing in…',async()=>{
        try{
          setFormStatus($('#adminLoginStatus'),'Signing in securely…');
          const email=$('#adminEmail')?.value.trim()||'';
          const password=$('#adminPassword')?.value||'';
          const {data,error}=await db.auth.signInWithPassword({email,password});
          if(error){
            setFormStatus($('#adminLoginStatus'),friendlyError(error),'error');
            return;
          }
          const admin=await verifyAdmin(data.session?.user);
          if(!admin){
            await db.auth.signOut();
            state.admin=null;
            state.user=null;
            showGate('login');
            setFormStatus($('#adminLoginStatus'),'This account is not an active LEOGO administrator. Use the authorized Admin account.','error');
            return;
          }
          setFormStatus($('#adminLoginStatus'),'Admin account verified. Opening Control Center…','success');
          await enterAdmin(data.session.user);
        }catch(error){
          setFormStatus($('#adminLoginStatus'),friendlyError(error),'error');
        }
      });
    });
    $('#adminRecoveryRequest')?.addEventListener('click',async()=>{
      const button=$('#adminRecoveryRequest');
      await withButtonLock(button,'Sending recovery link…',async()=>{
        try{
          await requestAdminRecoveryEmail($('#adminEmail')?.value,$('#adminLoginStatus'));
        }catch(error){
          setFormStatus($('#adminLoginStatus'),friendlyError(error),'error');
        }
      });
    });
    const signOut = async () => {
      await db?.auth.signOut();
      stopAdminNotificationRealtime();
      state.admin = null;
      state.user = null;
      showGate('login');
      if($('#adminPassword'))$('#adminPassword').value='';
      setFormStatus($('#adminLoginStatus'),'Signed out. Sign in with an authorized LEOGO Admin account.');
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
    $('#adminChangePasswordForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const button=event.currentTarget.querySelector('button[type="submit"]');
      await withButtonLock(button,'Changing…',async()=>{
        try{await changeSuperAdminPassword();}
        catch(error){setFormStatus($('#adminChangePasswordStatus'),friendlyError(error),'error');}
      });
    });
    $('#adminSignOutOtherSessions')?.addEventListener('click',async()=>{
      const button=$('#adminSignOutOtherSessions');
      await withButtonLock(button,'Signing out…',async()=>{
        try{await signOutOtherAdminSessions();}
        catch(error){setFormStatus($('#adminSessionSecurityStatus'),friendlyError(error),'error');}
      });
    });
    $('#adminSignOutAllSessions')?.addEventListener('click',async()=>{
      const button=$('#adminSignOutAllSessions');
      await withButtonLock(button,'Signing out…',async()=>{
        try{await signOutAllAdminSessions();}
        catch(error){setFormStatus($('#adminSessionSecurityStatus'),friendlyError(error),'error');}
      });
    });
    $('#adminSendRecoveryEmail')?.addEventListener('click',async()=>{
      const button=$('#adminSendRecoveryEmail');
      await withButtonLock(button,'Sending…',async()=>{
        try{
          const sent=await requestAdminRecoveryEmail(state.user?.email,$('#adminRecoveryStatus'));
          if(sent) await recordAdminSecurityEvent('admin.security.recovery_requested',{method:'signed_in'});
        }catch(error){setFormStatus($('#adminRecoveryStatus'),friendlyError(error),'error');}
      });
    });
    $$('[data-settings-card]').forEach((button)=>button.addEventListener('click',()=>openSystemSettingsCard(button.dataset.settingsCard)));
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
    $('#staffCounty')?.addEventListener('change',()=>setStaffLocationSelection($('#staffCounty'),$('#staffSubCounty'),$('#staffCounty').value,''));
    $('#staffEditorCounty')?.addEventListener('change',()=>setStaffLocationSelection($('#staffEditorCounty'),$('#staffEditorSubCounty'),$('#staffEditorCounty').value,''));
    $('#staffAccountKind')?.addEventListener('change', () => {
      const rider=$('#staffAccountKind').value==='rider';
      $('#adminStaffFields').hidden=rider;
      $('#riderStaffFields').hidden=!rider;
      $('#staffPhone').required=rider;
      $('#staffRole').required=!rider;
    });
    $('#staffRole')?.addEventListener('change', applyCreateRolePreset);
    $('#resetStaffPermissions')?.addEventListener('click', applyCreateRolePreset);
    $('#selectAllStaffPermissions')?.addEventListener('click',()=>setAllStaffPermissions($('#staffPermissionGrid'),true));
    $('#clearStaffPermissions')?.addEventListener('click',()=>setAllStaffPermissions($('#staffPermissionGrid'),false));
    $('#createStaffForm')?.addEventListener('submit', createStaffAccount);
    $('#closeStaffEditor')?.addEventListener('click', closeStaffEditor);
    $('#staffEditorRole')?.addEventListener('change', resetEditorRolePermissions);
    $('#resetEditorPermissions')?.addEventListener('click', resetEditorRolePermissions);
    $('#selectAllEditorPermissions')?.addEventListener('click',()=>setAllStaffPermissions($('#staffEditorPermissionGrid'),true));
    $('#clearEditorPermissions')?.addEventListener('click',()=>setAllStaffPermissions($('#staffEditorPermissionGrid'),false));
    $('#staffAccessForm')?.addEventListener('submit', saveStaffAccess);
    $('#saveStaffDocuments')?.addEventListener('click', saveStaffDocuments);
    $('#refreshMarketplaceOrders').addEventListener('click', () => withButtonLock($('#refreshMarketplaceOrders'), 'Refreshing…', loadMarketplaceOrders));
    $('#adminOrderSearch')?.addEventListener('input', renderMarketplaceOrders);
    $('#adminOrderPaymentFilter')?.addEventListener('change', renderMarketplaceOrders);
    $('#adminOrderStatusFilter')?.addEventListener('change', renderMarketplaceOrders);
    $('#downloadOrderDeliverySummary')?.addEventListener('click', downloadOrderDeliverySummary);
    $('#printOrderDeliverySummary')?.addEventListener('click', printOrderDeliverySummary);
    $('#orderSummaryType')?.addEventListener('change',()=>{
      const address=$('#orderSummaryType')?.value==='address';
      const download=$('#downloadOrderDeliverySummary');
      const print=$('#printOrderDeliverySummary');
      if(download)download.textContent=address?'⬇ Download Address Summary + QR':'⬇ Download Detailed Summary + QR';
      if(print)print.textContent=address?'🖨 Print Address Summary':'🖨 Print Detailed Summary';
    });
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
    $('#orderSettingsForm')?.addEventListener('submit', saveOrderSettings);
    $('#lipaPolePoleSettingsForm')?.addEventListener('submit', saveLipaPolePoleSettings);
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
    $('#refreshDataCleanupOverview')?.addEventListener('click',(event)=>withButtonLock(event.currentTarget,'Scanning…',loadDataCleanupOverview));
    $('#dataRetentionSettingsForm')?.addEventListener('submit',saveDataRetentionSettings);
    $('#runSafeDataCleanup')?.addEventListener('click',(event)=>runSafeDataCleanup(event.currentTarget));
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

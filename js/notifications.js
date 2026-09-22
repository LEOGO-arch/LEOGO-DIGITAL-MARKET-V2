// LEOGO DIGITAL MARKET V2 — Customer notifications.
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const factory = window.supabase?.createClient;
  if (!factory) return;

  // Reuse the exact customer auth client/session created by auth.js.
  // Creating a second GoTrue client can drift from the visible customer session.
  const sharedAuth = window.leogoAuth || null;
  const client = sharedAuth?.client || factory(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  const openButton = document.getElementById('openNotifications');
  const closeButton = document.getElementById('closeNotifications');
  const panel = document.getElementById('customerNotificationPanel');
  const scrim = document.getElementById('customerNotificationScrim');
  const list = document.getElementById('customerNotificationList');
  const headerCount = document.getElementById('headerNotificationCount');
  const dashboardCount = document.getElementById('dashboardNotificationCount');
  const dashboardText = document.getElementById('dashboardNotificationText');
  const unreadText = document.getElementById('notificationUnreadText');
  const markAll = document.getElementById('markAllNotificationsRead');

  let currentUser = null;
  let notifications = [];
  let realtimeChannel = null;
  let authSignalVersion = 0;

  const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[c]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi'
    }).format(date);
  };

  const unreadCount = () => notifications.filter((item) => !item.read_at).length;

  const updateCounts = () => {
    const count = unreadCount();
    if (headerCount) {
      headerCount.textContent = count > 99 ? '99+' : String(count);
      headerCount.hidden = count === 0;
    }
    if (dashboardCount) dashboardCount.textContent = String(count);
    if (dashboardText) dashboardText.textContent = count ? `${count} unread update${count === 1 ? '' : 's'}` : 'You are up to date';
    if (unreadText) unreadText.textContent = `${count} unread`;
    if (markAll) markAll.disabled = count === 0;
  };

  const render = () => {
    updateCounts();
    if (!list) return;
    if (!currentUser) {
      list.innerHTML = '<div class="customer-notification-empty">Sign in to see your LEOGO notifications.</div>';
      return;
    }
    if (!notifications.length) {
      list.innerHTML = '<div class="customer-notification-empty">No notifications yet. Important LEOGO updates will appear here.</div>';
      return;
    }
    list.innerHTML = notifications.map((item) => `
      <article class="customer-notification-item ${item.read_at ? '' : 'unread'}" data-notification-id="${escapeHtml(item.id)}">
        <button type="button" class="customer-notification-open" data-notification-id="${escapeHtml(item.id)}" data-action-view="${escapeHtml(item.action_view || '')}">
          <span class="customer-notification-icon">${item.notification_type === 'payment' ? '💳' : item.notification_type === 'premium' ? '18+' : '🔔'}</span>
          <span class="customer-notification-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.message)}</span>
            <small>${escapeHtml(formatDate(item.created_at))}</small>
          </span>
          ${item.read_at ? '' : '<i aria-label="Unread"></i>'}
        </button>
      </article>
    `).join('');

    list.querySelectorAll('[data-notification-id]').forEach((button) => {
      if (!button.classList.contains('customer-notification-open')) return;
      button.addEventListener('click', async () => {
        const id = button.dataset.notificationId;
        const action = button.dataset.actionView;
        await markRead(id);
        if (action === 'premium') {
          closePanel();
          document.getElementById('premium')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          window.location.hash = 'premium';
        } else if (action === 'orders') {
          closePanel();
          window.leogoOpenCustomerView?.('orders');
          document.dispatchEvent(new CustomEvent('leogo:customer-data-refresh',{
            detail:{source:'notification-open'}
          }));
        }
      });
    });
  };

  const loadNotifications = async () => {
    if (!currentUser) {
      notifications = [];
      render();
      return;
    }
    const { data, error } = await client
      .from('customer_notifications')
      .select('id,notification_type,title,message,action_view,read_at,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('LEOGO notifications could not load:', error.message);
      return;
    }
    notifications = data || [];
    render();
    document.dispatchEvent(new CustomEvent('leogo:customer-data-refresh',{
      detail:{source:'notifications'}
    }));
  };

  const markRead = async (id) => {
    const item = notifications.find((entry) => entry.id === id);
    if (!item || item.read_at) return;
    const { error } = await client.rpc('mark_customer_notification_read', { p_notification_id: id });
    if (error) {
      console.error('Notification could not be marked read:', error.message);
      return;
    }
    item.read_at = new Date().toISOString();
    render();
  };

  const markAllRead = async () => {
    if (!currentUser || unreadCount() === 0) return;
    markAll.disabled = true;
    const { error } = await client.rpc('mark_all_customer_notifications_read');
    if (error) {
      console.error('Notifications could not be marked read:', error.message);
      markAll.disabled = false;
      return;
    }
    const now = new Date().toISOString();
    notifications.forEach((item) => { if (!item.read_at) item.read_at = now; });
    render();
  };

  const resolveCanonicalUser = async () => {
    const sharedUser = window.leogoAuth?.getUser?.();
    if (sharedUser) return sharedUser;
    const { data } = await client.auth.getSession();
    return data.session?.user || null;
  };

  const openPanel = async () => {
    if (!panel || !scrim) return;
    const canonicalUser = await resolveCanonicalUser();
    if ((canonicalUser?.id || null) !== (currentUser?.id || null)) {
      await setUser(canonicalUser);
    } else {
      await loadNotifications();
    }
    panel.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add('open');
      scrim.classList.add('open');
    });
    openButton?.setAttribute('aria-expanded','true');
  };

  const closePanel = () => {
    if (!panel || !scrim) return;
    panel.classList.remove('open');
    scrim.classList.remove('open');
    openButton?.setAttribute('aria-expanded','false');
    setTimeout(() => {
      panel.hidden = true;
      scrim.hidden = true;
    }, 180);
  };

  const subscribe = () => {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (!currentUser) return;
    realtimeChannel = client
      .channel(`customer-notifications-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'customer_notifications',
        filter: `user_id=eq.${currentUser.id}`
      }, () => loadNotifications())
      .subscribe();
  };

  const setUser = async (user) => {
    currentUser = user || null;
    subscribe();
    await loadNotifications();
  };

  openButton?.addEventListener('click', openPanel);
  closeButton?.addEventListener('click', closePanel);
  scrim?.addEventListener('click', closePanel);
  markAll?.addEventListener('click', markAllRead);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && panel?.classList.contains('open')) closePanel(); });
  window.addEventListener('focus', loadNotifications);

  // The customer authentication module publishes the canonical session through
  // leogo:authchange. Notifications follow that same session instead of maintaining
  // a separate view of login state.
  document.addEventListener('leogo:authchange', (event) => {
    authSignalVersion += 1;
    setUser(event.detail?.user || null);
  });

  const initializeNotificationSession = async () => {
    const startVersion = authSignalVersion;
    const sharedUser = window.leogoAuth?.getUser?.();
    if (sharedUser) {
      await setUser(sharedUser);
      return;
    }
    const { data } = await client.auth.getSession();
    // Do not allow an older initialization result to overwrite a newer
    // leogo:authchange event that already supplied the signed-in user.
    if (authSignalVersion !== startVersion) return;
    const latestSharedUser = window.leogoAuth?.getUser?.();
    await setUser(latestSharedUser || data.session?.user || null);
  };
  initializeNotificationSession();

  // Fallback only when notifications loaded without the main customer auth module.
  if (!sharedAuth) {
    client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
  }
})();

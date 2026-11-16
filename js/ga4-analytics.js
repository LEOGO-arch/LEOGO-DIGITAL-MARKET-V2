/* Optional Google Analytics 4 integration. Safe/dormant without official measurement ID. */
(() => {
  'use strict';
  const id = document.currentScript?.getAttribute('data-measurement-id')?.trim() || '';
  if (!/^G-[A-Z0-9]{5,20}$/.test(id)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  const storageKey = 'leogo-ga4-consent-v1';
  const readChoice = () => {
    try {
      const s = localStorage.getItem(storageKey);
      return s === 'accepted' || s === 'declined' ? s : null;
    } catch { return null; }
  };
  const saveChoice = s => { try { localStorage.setItem(storageKey,s); } catch {} };
  const permissions = granted => ({
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
  let loaded = false, sent = false, banner;

  function start() {
    if (loaded) {
      window.gtag('consent','update',permissions(true));
      return;
    }
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args) => window.dataLayer.push(args);
    window.gtag('consent','default',permissions(false));
    window.gtag('consent','update',permissions(true));
    window.gtag('js',new Date());
    window.gtag('config',id,{
      send_page_view:false,
      allow_google_signals:false,
      allow_ad_personalization_signals:false
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(tag);
    // Explicitly remove query strings, fragments, identifiers and referrers from GA4 events.
    if (!sent) {
      sent = true;
      window.gtag('event','page_view',{
        page_location:'https://leogo.co.ke/',
        page_title:'LEOGO Digital Market',
        page_referrer:'',
        send_to:id
      });
    }
  }
  function choose(value) {
    saveChoice(value);
    if (value === 'accepted') start();
    else if (loaded) window.gtag('consent','update',permissions(false));
    banner.hidden = true;
  }
  function button(label,onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.addEventListener('click',onClick);
    b.style.cssText = 'background:#fff;color:#07152f;border:1px solid #d1d5db;border-radius:8px;padding:9px 12px;font:600 13px system-ui;cursor:pointer';
    return b;
  }
  function init() {
    banner = document.createElement('aside');
    banner.setAttribute('role','region');
    banner.setAttribute('aria-label','Optional website analytics');
    banner.style.cssText = 'position:fixed;z-index:1900;left:12px;right:12px;bottom:12px;max-width:680px;margin:auto;background:#fff;color:#07152f;border:1px solid #d8dee8;border-radius:13px;padding:14px;box-shadow:0 10px 35px #0003;font:14px/1.5 system-ui';
    const text = document.createElement('p');
    text.style.cssText = 'margin:0 0 10px';
    text.textContent = 'LEOGO uses optional Google Analytics to understand general website visits. Allow or decline analytics; essential marketplace services work either way.';
    banner.appendChild(text);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:9px';
    actions.appendChild(button('Decline analytics',()=>choose('declined')));
    const allow = button('Allow analytics',()=>choose('accepted'));
    allow.style.background = '#07152f'; allow.style.color = '#fff';
    actions.appendChild(allow);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    const preferences = button('Analytics privacy settings',()=>{banner.hidden = false;});
    preferences.setAttribute('aria-label','Change optional analytics consent');
    preferences.style.cssText += ';position:fixed;z-index:1899;right:12px;bottom:12px;font-size:11px;opacity:.85';
    document.body.appendChild(preferences);
    banner.hidden = readChoice() !== null;
    if (readChoice() === 'accepted') start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

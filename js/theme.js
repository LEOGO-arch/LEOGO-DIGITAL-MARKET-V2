// LEOGO DIGITAL MARKET V2 — safe, Admin-controlled Customer Front colour theme.
(() => {
  'use strict';
  const defaults = { primary: '#071A3A', secondary: '#123A76', accent: '#FF7800', background: '#F5F7FB' };
  const validHex = (value) => /^#[0-9A-F]{6}$/i.test(String(value || ''));
  const applyTheme = (theme) => {
    const selected = theme?.active === false ? defaults : theme || defaults;
    const values = {
      primary: validHex(selected.primary) ? selected.primary : defaults.primary,
      secondary: validHex(selected.secondary) ? selected.secondary : defaults.secondary,
      accent: validHex(selected.accent) ? selected.accent : defaults.accent,
      background: validHex(selected.background) ? selected.background : defaults.background
    };
    const root = document.documentElement;
    root.style.setProperty('--navy', values.primary);
    root.style.setProperty('--navy2', values.secondary);
    root.style.setProperty('--orange', values.accent);
    root.style.setProperty('--soft', values.background);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = values.primary;
  };
  let retryTimer = 0;
  let retryCount = 0;
  const loadTheme = async () => {
    const client = window.leogoAuth?.client;
    if (!client) {
      applyTheme(defaults);
      if (retryCount < 20 && !retryTimer) {
        retryCount += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          loadTheme();
        }, 150);
      }
      return;
    }
    retryCount = 0;
    const { data, error } = await client.rpc('get_public_customer_theme');
    applyTheme(error || !data ? defaults : data);
  };
  loadTheme();
  document.addEventListener('DOMContentLoaded', loadTheme, { once: true });
  document.addEventListener('leogo:authchange', loadTheme);
  window.addEventListener('pageshow', loadTheme);
})();

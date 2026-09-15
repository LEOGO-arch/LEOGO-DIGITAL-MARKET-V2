// LEOGO DIGITAL MARKET V2 — Phase 1(A) visual foundation interactions.
(() => {
  'use strict';

  // Official LEOGO V2 logo presentation. This overrides the earlier temporary
  // recreated-logo styling without disturbing the locked project foundation.
  const style = document.createElement('style');
  style.textContent = `
    .official-header-logo{width:48px;height:48px;object-fit:cover;border-radius:12px;display:block}
    .visual-card{background:#fff!important;padding:18px!important;display:flex!important;align-items:center!important;justify-content:center!important}
    .visual-card>.official-hero-logo{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;border-radius:18px}
    @media(max-width:600px){.official-header-logo{width:40px;height:40px}.brand strong{display:none}.visual-card{padding:10px!important}}
  `;
  document.head.appendChild(style);

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const term = searchInput.value.trim();
      if (!term) {
        searchInput.focus();
        return;
      }
      // Catalogue/search functionality will be connected to Supabase in the approved later phase.
      window.location.hash = 'catalogue';
    });
  }
})();

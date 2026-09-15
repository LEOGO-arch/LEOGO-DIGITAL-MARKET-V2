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
  const requestModal = document.getElementById('requestModal');
  const openRequestForm = document.getElementById('openRequestForm');
  const requestForm = document.getElementById('customerRequestForm');
  const requestPinButton = document.getElementById('pinRequestLocation');
  const requestPinStatus = document.getElementById('requestPinStatus');
  const requestCoordinates = document.getElementById('requestCoordinates');
  const requestFormStatus = document.getElementById('requestFormStatus');

  const closeRequestModal = () => {
    if (!requestModal) return;
    requestModal.classList.remove('is-open');
    requestModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('request-modal-open');
    openRequestForm?.focus();
  };

  const showRequestModal = () => {
    if (!requestModal) return;
    requestModal.classList.add('is-open');
    requestModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('request-modal-open');
    requestFormStatus.textContent = '';
    window.setTimeout(() => document.getElementById('requestName')?.focus(), 50);
  };

  openRequestForm?.addEventListener('click', showRequestModal);
  requestModal?.querySelectorAll('[data-close-request-modal]').forEach((button) => {
    button.addEventListener('click', closeRequestModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && requestModal?.classList.contains('is-open')) closeRequestModal();
  });

  requestPinButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      requestPinStatus.textContent = 'Location pinning is not supported on this device.';
      return;
    }
    requestPinButton.disabled = true;
    requestPinStatus.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        requestCoordinates.value = coords.latitude.toFixed(6) + ',' + coords.longitude.toFixed(6);
        requestPinStatus.textContent = '✓ Location pinned. It will remain private for administrators.';
        requestPinButton.disabled = false;
      },
      () => {
        requestPinStatus.textContent = 'Location could not be pinned. You can continue without it or paste a location link.';
        requestPinButton.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  requestForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!requestForm.reportValidity()) return;
    requestFormStatus.textContent = 'Form design complete. Live submission and admin approval will be connected in the request workflow phase.';
  });

  const sellingModal = document.getElementById('sellingModal');
  const openSellingForm = document.getElementById('openSellingForm');
  const sellingForm = document.getElementById('customerSellingForm');
  const sellingProof = document.getElementById('sellingProof');
  const ownershipFileName = document.getElementById('ownershipFileName');
  const sellingFormStatus = document.getElementById('sellingFormStatus');

  const closeSellingModal = () => {
    if (!sellingModal) return;
    sellingModal.classList.remove('is-open');
    sellingModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('selling-modal-open');
    openSellingForm?.focus();
  };

  const showSellingModal = () => {
    if (!sellingModal) return;
    sellingModal.classList.add('is-open');
    sellingModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('selling-modal-open');
    sellingFormStatus.textContent = '';
    window.setTimeout(() => document.getElementById('sellingName')?.focus(), 50);
  };

  openSellingForm?.addEventListener('click', showSellingModal);
  sellingModal?.querySelectorAll('[data-close-selling-modal]').forEach((button) => {
    button.addEventListener('click', closeSellingModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sellingModal?.classList.contains('is-open')) closeSellingModal();
  });

  sellingProof?.addEventListener('change', () => {
    ownershipFileName.textContent = sellingProof.files?.[0]?.name || 'No document selected';
  });

  sellingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!sellingForm.reportValidity()) return;
    sellingFormStatus.textContent = 'Form design complete. Live submission and admin approval will be connected in the marketplace workflow phase.';
  });

})();

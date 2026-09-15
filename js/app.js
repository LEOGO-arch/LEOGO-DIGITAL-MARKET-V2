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

  const openLeogoBar = document.getElementById('openLeogoBar');
  const barConsentModal = document.getElementById('barConsentModal');
  const barAgeConsent = document.getElementById('barAgeConsent');
  const enterLeogoBar = document.getElementById('enterLeogoBar');
  const barConsentStatus = document.getElementById('barConsentStatus');
  const barSection = document.getElementById('leogo-bar');
  const reviewBarWarning = document.getElementById('reviewBarWarning');
  const barConsentKey = 'leogo_bar_18_consent';

  const closeBarConsent = () => {
    if (!barConsentModal) return;
    barConsentModal.classList.remove('is-open');
    barConsentModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bar-consent-open');
  };

  const showBarConsent = () => {
    if (!barConsentModal) return;
    barConsentModal.classList.add('is-open');
    barConsentModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bar-consent-open');
    barConsentStatus.textContent = '';
    window.setTimeout(() => barAgeConsent?.focus(), 50);
  };

  const revealLeogoBar = () => {
    if (!barSection) return;
    barSection.hidden = false;
    closeBarConsent();
    window.setTimeout(() => barSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  openLeogoBar?.addEventListener('click', (event) => {
    event.preventDefault();
    if (sessionStorage.getItem(barConsentKey) === 'accepted') revealLeogoBar();
    else showBarConsent();
  });

  reviewBarWarning?.addEventListener('click', showBarConsent);
  barConsentModal?.querySelectorAll('[data-close-bar-consent]').forEach((button) => {
    button.addEventListener('click', closeBarConsent);
  });
  barAgeConsent?.addEventListener('change', () => {
    enterLeogoBar.disabled = !barAgeConsent.checked;
    barConsentStatus.textContent = '';
  });
  enterLeogoBar?.addEventListener('click', () => {
    if (!barAgeConsent.checked) {
      barConsentStatus.textContent = 'You must confirm that you are 18 years or older before entering.';
      return;
    }
    sessionStorage.setItem(barConsentKey, 'accepted');
    revealLeogoBar();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && barConsentModal?.classList.contains('is-open')) closeBarConsent();
  });

  const openPremiumConsent = document.getElementById('openPremiumConsent');
  const premiumConsentModal = document.getElementById('premiumConsentModal');
  const premiumAgeConsent = document.getElementById('premiumAgeConsent');
  const premiumResponsibilityConsent = document.getElementById('premiumResponsibilityConsent');
  const enterPremiumArea = document.getElementById('enterPremiumArea');
  const premiumConsentStatus = document.getElementById('premiumConsentStatus');
  const premiumEntryStatus = document.getElementById('premiumEntryStatus');
  const premiumConsentKey = 'leogo_premium_18_consent';

  const closePremiumConsent = () => {
    if (!premiumConsentModal) return;
    premiumConsentModal.classList.remove('is-open');
    premiumConsentModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('premium-consent-open');
  };

  const showPremiumConsent = () => {
    if (!premiumConsentModal) return;
    premiumConsentModal.classList.add('is-open');
    premiumConsentModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('premium-consent-open');
    premiumConsentStatus.textContent = '';
    window.setTimeout(() => premiumAgeConsent?.focus(), 50);
  };

  const updatePremiumConsentButton = () => {
    enterPremiumArea.disabled = !(premiumAgeConsent.checked && premiumResponsibilityConsent.checked);
    premiumConsentStatus.textContent = '';
  };

  openPremiumConsent?.addEventListener('click', () => {
    if (sessionStorage.getItem(premiumConsentKey) === 'accepted') {
      premiumEntryStatus.textContent = '✓ Consent accepted for this session. Sign-in, verification and membership access will be connected in the Premium phase.';
      return;
    }
    showPremiumConsent();
  });
  premiumAgeConsent?.addEventListener('change', updatePremiumConsentButton);
  premiumResponsibilityConsent?.addEventListener('change', updatePremiumConsentButton);
  premiumConsentModal?.querySelectorAll('[data-close-premium-consent]').forEach((button) => {
    button.addEventListener('click', closePremiumConsent);
  });
  enterPremiumArea?.addEventListener('click', () => {
    if (!(premiumAgeConsent.checked && premiumResponsibilityConsent.checked)) {
      premiumConsentStatus.textContent = 'Both confirmations are required before entering Premium.';
      return;
    }
    sessionStorage.setItem(premiumConsentKey, 'accepted');
    closePremiumConsent();
    premiumEntryStatus.textContent = '✓ Consent accepted for this session. Sign-in, verification and membership access will be connected in the Premium phase.';
    document.getElementById('premium')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && premiumConsentModal?.classList.contains('is-open')) closePremiumConsent();
  });

  const openAdvertRequest = document.getElementById('openAdvertRequest');
  const advertRequestModal = document.getElementById('advertRequestModal');
  const advertRequestForm = document.getElementById('advertRequestForm');
  const advertRequestStatus = document.getElementById('advertRequestStatus');

  const closeAdvertRequest = () => {
    if (!advertRequestModal) return;
    advertRequestModal.classList.remove('is-open');
    advertRequestModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('advert-request-open');
    openAdvertRequest?.focus();
  };

  const showAdvertRequest = () => {
    if (!advertRequestModal) return;
    advertRequestModal.classList.add('is-open');
    advertRequestModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('advert-request-open');
    advertRequestStatus.textContent = '';
    window.setTimeout(() => document.getElementById('advertRequestName')?.focus(), 50);
  };

  openAdvertRequest?.addEventListener('click', showAdvertRequest);
  advertRequestModal?.querySelectorAll('[data-close-advert-request]').forEach((button) => {
    button.addEventListener('click', closeAdvertRequest);
  });
  advertRequestForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!advertRequestForm.reportValidity()) return;
    advertRequestStatus.textContent = 'Form design complete. Live submission and Admin review will be connected in the Admin workflow phase.';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && advertRequestModal?.classList.contains('is-open')) closeAdvertRequest();
  });

  const customerShellModal = document.getElementById('customerShellModal');
  const customerShellViews = customerShellModal?.querySelectorAll('[data-customer-panel]');
  const customerShellNavButtons = customerShellModal?.querySelectorAll('.customer-shell-nav [data-customer-view]');
  const authPreviewTabs = customerShellModal?.querySelectorAll('[data-auth-tab]');
  const authPreviewPanels = customerShellModal?.querySelectorAll('[data-auth-panel]');
  const authPreviewStatus = document.getElementById('authPreviewStatus');

  const showCustomerView = (viewName) => {
    customerShellViews?.forEach((panel) => panel.classList.toggle('active', panel.dataset.customerPanel === viewName));
    customerShellNavButtons?.forEach((button) => button.classList.toggle('active', button.dataset.customerView === viewName));
    customerShellModal?.querySelector('.customer-shell-content')?.scrollTo({ top: 0, behavior: 'instant' });
  };

  const closeCustomerShell = () => {
    if (!customerShellModal) return;
    customerShellModal.classList.remove('is-open');
    customerShellModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('customer-shell-open');
  };

  const openCustomerShell = (viewName = 'dashboard') => {
    if (!customerShellModal) return;
    showCustomerView(viewName);
    customerShellModal.classList.add('is-open');
    customerShellModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('customer-shell-open');
  };

  document.querySelectorAll('[data-open-customer-view]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openCustomerShell(trigger.dataset.openCustomerView);
    });
  });
  customerShellModal?.querySelectorAll('[data-customer-view]').forEach((button) => {
    button.addEventListener('click', () => showCustomerView(button.dataset.customerView));
  });
  customerShellModal?.querySelectorAll('[data-close-customer-shell]').forEach((button) => {
    button.addEventListener('click', closeCustomerShell);
  });
  authPreviewTabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      authPreviewTabs.forEach((item) => item.classList.toggle('active', item === tab));
      authPreviewPanels?.forEach((panel) => panel.classList.toggle('active', panel.dataset.authPanel === tab.dataset.authTab));
      authPreviewStatus.textContent = '';
    });
  });
  authPreviewPanels?.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      authPreviewStatus.textContent = 'Visual preview only — secure authentication will be connected in Phase 1(B).';
    });
  });
  const profileCounty = document.getElementById('profileCounty');
  const profileSubCounty = document.getElementById('profileSubCounty');
  // Phase 1(A) starter locations. These will be loaded from Admin-managed records later.
  const profileSubCounties = {
    'Siaya': ['Alego Usonga', 'Bondo', 'Gem', 'Rarieda', 'Ugenya', 'Ugunja'],
    'Kisumu': ['Kisumu Central', 'Kisumu East', 'Kisumu West', 'Muhoroni', 'Nyakach', 'Nyando', 'Seme'],
    'Nairobi': ['Dagoretti North', 'Dagoretti South', 'Embakasi Central', 'Embakasi East', 'Embakasi North', 'Embakasi South', 'Embakasi West', 'Kamukunji', 'Kasarani', 'Kibra', "Lang'ata", 'Makadara', 'Mathare', 'Roysambu', 'Ruaraka', 'Starehe', 'Westlands'],
    'Kakamega': ['Butere', 'Kakamega Central', 'Kakamega East', 'Kakamega North', 'Kakamega South', 'Khwisero', 'Likuyani', 'Lugari', 'Matete', 'Mumias East', 'Mumias West', 'Navakholo'],
    'Bungoma': ['Bumula', 'Kabuchai', 'Kanduyi', 'Kimilili', 'Mt. Elgon', 'Sirisia', 'Tongaren', 'Webuye East', 'Webuye West'],
    'Busia': ['Budalangi', 'Butula', 'Funyula', 'Matayos', 'Nambale', 'Teso North', 'Teso South'],
    'Homa Bay': ['Homa Bay Town', 'Ndhiwa', 'Rachuonyo East', 'Rachuonyo North', 'Rachuonyo South', 'Rangwe', 'Suba North', 'Suba South'],
    'Migori': ['Awendo', 'Kuria East', 'Kuria West', 'Nyatike', 'Rongo', 'Suna East', 'Suna West', 'Uriri']
  };
  profileCounty?.addEventListener('change', () => {
    const options = profileSubCounties[profileCounty.value] || [];
    profileSubCounty.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = options.length ? 'Select sub-county' : 'Choose a county first';
    profileSubCounty.appendChild(prompt);
    options.forEach((subCounty) => {
      const option = document.createElement('option');
      option.value = subCounty;
      option.textContent = subCounty;
      profileSubCounty.appendChild(option);
    });
    profileSubCounty.disabled = options.length === 0;
  });

  const activityFilterButtons = customerShellModal?.querySelectorAll('[data-activity-filter]');
  const activityEmptyIcon = document.getElementById('activityEmptyIcon');
  const activityEmptyTitle = document.getElementById('activityEmptyTitle');
  const activityEmptyText = document.getElementById('activityEmptyText');
  const activityEmptyMessages = {
    all: ['🧾', 'No previous activity yet', 'Your product orders, service requests and transport bookings will appear here automatically, including their dates, payment and completion status.'],
    products: ['📦', 'No product orders yet', 'Your current and previous product orders will appear here when the ordering system is connected.'],
    services: ['🛠️', 'No service activity yet', 'Your requested, assigned and completed service jobs will appear here when services are connected.'],
    transport: ['🚚', 'No transport bookings yet', 'Your parcel deliveries and transport bookings will appear here when transport records are connected.'],
    active: ['⏳', 'No active activity', 'Orders, services and transport bookings currently in progress will appear here.'],
    completed: ['✅', 'No completed activity', 'Completed orders, services and transport bookings will be stored here for your history.'],
    cancelled: ['⊘', 'No cancelled activity', 'Any cancelled order, service request or transport booking will appear here with its reason and date.']
  };
  activityFilterButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      activityFilterButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      const message = activityEmptyMessages[button.dataset.activityFilter] || activityEmptyMessages.all;
      activityEmptyIcon.textContent = message[0];
      activityEmptyTitle.textContent = message[1];
      activityEmptyText.textContent = message[2];
    });
  });

  const aftersalesPreviewForm = customerShellModal?.querySelector('.aftersales-preview-form');
  const aftersalesPreviewStatus = document.getElementById('aftersalesPreviewStatus');
  aftersalesPreviewForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!aftersalesPreviewForm.reportValidity()) return;
    aftersalesPreviewStatus.textContent = 'Visual preview only — your support case will be securely submitted and tracked when the backend workflow is connected.';
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && customerShellModal?.classList.contains('is-open')) closeCustomerShell();
  });

})();

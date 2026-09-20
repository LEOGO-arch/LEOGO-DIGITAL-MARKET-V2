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
  const dashboardPremiumStatus = document.getElementById('dashboardPremiumStatus');
  const premiumConsentKey = 'leogo_premium_18_consent';

  const updateDashboardPremiumStatus = () => {
    if (!dashboardPremiumStatus) return;
    const accepted = sessionStorage.getItem(premiumConsentKey) === 'accepted';
    dashboardPremiumStatus.textContent = accepted
      ? '✓ Consent accepted for this browser session.'
      : 'Consent not completed for this session.';
    dashboardPremiumStatus.classList.toggle('is-accepted', accepted);
  };

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
      premiumEntryStatus.textContent = '✓ Consent accepted for this session. Opening your Premium area…';
      window.leogoOpenCustomerView?.('premiumaccess');
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
    updateDashboardPremiumStatus();
    closePremiumConsent();
    premiumEntryStatus.textContent = '✓ Consent accepted for this session.';
    window.leogoOpenCustomerView?.('premiumaccess');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && premiumConsentModal?.classList.contains('is-open')) closePremiumConsent();
  });
  updateDashboardPremiumStatus();

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

  const protectedCustomerViews = new Set(['dashboard', 'orders', 'aftersales', 'wallet', 'lipapolepole', 'accommodation', 'addresses', 'lookingrequests', 'premiumaccess', 'account']);
  const openCustomerShell = (viewName = 'dashboard', options = {}) => {
    if (!customerShellModal) return;
    const needsLogin = protectedCustomerViews.has(viewName);
    if (!options.skipAuthGuard && needsLogin && !window.leogoAuth?.isAuthenticated()) {
      viewName = 'auth';
      window.setTimeout(() => {
        if (authPreviewStatus && !authPreviewStatus.textContent) {
          authPreviewStatus.textContent = 'Please log in or create an account to open this customer section.';
          authPreviewStatus.classList.add('is-error');
        }
      }, 0);
    }
    if (viewName === 'premiumaccess') updateDashboardPremiumStatus();
    showCustomerView(viewName);
    customerShellModal.classList.add('is-open');
    customerShellModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('customer-shell-open');
  };
  window.leogoOpenCustomerView = openCustomerShell;

  document.querySelectorAll('[data-open-customer-view]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openCustomerShell(trigger.dataset.openCustomerView);
    });
  });
  customerShellModal?.querySelectorAll('[data-customer-view]').forEach((button) => {
    button.addEventListener('click', () => openCustomerShell(button.dataset.customerView));
  });
  customerShellModal?.querySelectorAll('[data-close-customer-shell]').forEach((button) => {
    button.addEventListener('click', closeCustomerShell);
  });
  document.getElementById('openRequestFromDashboard')?.addEventListener('click', () => {
    closeCustomerShell();
    showRequestModal();
  });
  document.getElementById('openPremiumFromDashboard')?.addEventListener('click', () => {
    if (sessionStorage.getItem(premiumConsentKey) === 'accepted') {
      premiumEntryStatus.textContent = '✓ Consent accepted for this session.';
      updateDashboardPremiumStatus();
      return;
    }
    closeCustomerShell();
    showPremiumConsent();
  });
  authPreviewTabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      authPreviewTabs.forEach((item) => item.classList.toggle('active', item === tab));
      authPreviewPanels?.forEach((panel) => panel.classList.toggle('active', panel.dataset.authPanel === tab.dataset.authTab));
      authPreviewStatus.textContent = '';
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

  const checkoutCounty = document.getElementById('checkoutCounty');
  const checkoutSubCounty = document.getElementById('checkoutSubCounty');
  const checkoutDeliveryZone = document.getElementById('checkoutDeliveryZone');
  const checkoutAddressFieldset = customerShellModal?.querySelector('.checkout-address');
  const checkoutShell = customerShellModal?.querySelector('.checkout-shell');
  const checkoutServiceRate = document.getElementById('checkoutServiceRate');
  const checkoutServiceFeeValue = document.getElementById('checkoutServiceFeeValue');
  const checkoutDeliveryFeeValue = document.getElementById('checkoutDeliveryFeeValue');
  const checkoutGrandTotalValue = document.getElementById('checkoutGrandTotalValue');
  const checkoutPickupStationWrap = document.getElementById('checkoutPickupStationWrap');
  const checkoutPickupStation = document.getElementById('checkoutPickupStation');
  const checkoutPickupStationDetails = document.getElementById('checkoutPickupStationDetails');
  const checkoutPickupStationStatus = document.getElementById('checkoutPickupStationStatus');
  const checkoutPickupFeeRow = document.getElementById('checkoutPickupFeeRow');
  const checkoutPickupFeeRate = document.getElementById('checkoutPickupFeeRate');
  const checkoutPickupFeeValue = document.getElementById('checkoutPickupFeeValue');
  const checkoutPinLocation = document.getElementById('checkoutPinLocation');
  const checkoutPinStatus = document.getElementById('checkoutPinStatus');
  const checkoutCoordinates = document.getElementById('checkoutCoordinates');
  let pickupStations = [];
  let updateCheckoutReadiness = () => {};
  const escapePickupText = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);

  const selectedPickupStation = () => pickupStations.find((station) => station.id === checkoutPickupStation?.value) || null;
  const pickupStationAddress = (station) => station ? [
    station.county,
    station.sub_county,
    station.town,
    station.address_line,
    station.door_number ? 'Door No ' + station.door_number : ''
  ].filter(Boolean).join(', ') : '';

  const renderSelectedPickupStation = () => {
    const station = selectedPickupStation();
    if (!checkoutPickupStationDetails) return;
    checkoutPickupStationDetails.hidden = !station;
    checkoutPickupStationDetails.innerHTML = station
      ? '<strong>' + escapePickupText(station.station_name) + '</strong><span>' + escapePickupText(pickupStationAddress(station)) + '</span><span>Pickup service fee: <b>' + Number(station.service_fee_percent || 0).toLocaleString() + '%</b> of the items subtotal</span>'
      : '';
  };

  const populatePickupStations = () => {
    if (!checkoutPickupStation) return;
    checkoutPickupStation.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = pickupStations.length ? 'Select pickup station' : 'No active pickup station available';
    checkoutPickupStation.appendChild(prompt);
    pickupStations.forEach((station) => {
      const option = document.createElement('option');
      option.value = station.id;
      option.textContent = station.station_name + ' — ' + station.town;
      checkoutPickupStation.appendChild(option);
    });
    checkoutPickupStation.disabled = pickupStations.length === 0;
    renderSelectedPickupStation();
  };

  const loadPickupStations = async (user) => {
    pickupStations = [];
    populatePickupStations();
    if (!user || !window.leogoAuth?.client) {
      if (checkoutPickupStationStatus) checkoutPickupStationStatus.textContent = 'Sign in to load active pickup stations.';
      updateCheckoutFees();
      updateCheckoutReadiness();
      return;
    }
    if (checkoutPickupStationStatus) checkoutPickupStationStatus.textContent = 'Loading active pickup stations…';
    const { data, error } = await window.leogoAuth.client
      .from('pickup_stations')
      .select('id,station_name,county,sub_county,town,address_line,landmark,door_number,service_fee_percent,display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('station_name', { ascending: true });
    if (error) {
      if (checkoutPickupStationStatus) checkoutPickupStationStatus.textContent = 'Pickup stations could not be loaded. Please try again.';
      updateCheckoutFees();
      updateCheckoutReadiness();
      return;
    }
    pickupStations = Array.isArray(data) ? data : [];
    populatePickupStations();
    if (checkoutPickupStationStatus) checkoutPickupStationStatus.textContent = pickupStations.length
      ? 'Pickup stations and percentage fees are managed by authorized LEOGO Admin/Staff.'
      : 'No active pickup station is available. Please choose another delivery zone.';
    updateCheckoutFees();
    updateCheckoutReadiness();
  };

  const populateCheckoutSubCounties = () => {
    const options = profileSubCounties[checkoutCounty?.value] || [];
    checkoutSubCounty?.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = options.length ? 'Select sub-county' : 'Choose a county first';
    checkoutSubCounty?.appendChild(prompt);
    options.forEach((subCounty) => {
      const option = document.createElement('option');
      option.value = subCounty;
      option.textContent = subCounty;
      checkoutSubCounty?.appendChild(option);
    });
    if (checkoutSubCounty) checkoutSubCounty.disabled = options.length === 0;
  };
  checkoutCounty?.addEventListener('change', populateCheckoutSubCounties);

  function updateCheckoutFees() {
    const subtotal = Number(checkoutShell?.dataset.checkoutSubtotal || 0);
    const serviceRate = subtotal >= 3000 ? 0.015 : 0.02;
    const serviceFee = subtotal * serviceRate;
    const deliveryRules = {
      cbd: { amount: 50, label: 'KSh 50' },
      estate: { amount: 80, label: 'KSh 80' },
      outside: { amount: 200, label: 'From KSh 200' },
      quote: { amount: null, label: 'Admin quote' },
      pickup: { amount: 0, label: 'Collect at station' }
    };
    const delivery = deliveryRules[checkoutDeliveryZone?.value];
    const station = checkoutDeliveryZone?.value === 'pickup' ? selectedPickupStation() : null;
    const pickupRate = Number(station?.service_fee_percent || 0);
    const pickupFee = subtotal * (pickupRate / 100);
    if (checkoutServiceRate) checkoutServiceRate.textContent = '(' + (serviceRate * 100) + '%)';
    if (checkoutServiceFeeValue) checkoutServiceFeeValue.textContent = 'KSh ' + Math.round(serviceFee).toLocaleString();
    if (checkoutPickupFeeRow) checkoutPickupFeeRow.hidden = checkoutDeliveryZone?.value !== 'pickup';
    if (checkoutPickupFeeRate) checkoutPickupFeeRate.textContent = '(' + pickupRate.toLocaleString() + '%)';
    if (checkoutPickupFeeValue) checkoutPickupFeeValue.textContent = 'KSh ' + Math.round(pickupFee).toLocaleString();
    if (checkoutDeliveryFeeValue) checkoutDeliveryFeeValue.textContent = delivery?.label || 'Select zone';
    if (checkoutGrandTotalValue) {
      checkoutGrandTotalValue.textContent = delivery?.amount === null
        ? 'Pending quote'
        : 'KSh ' + Math.round(subtotal + serviceFee + pickupFee + (delivery?.amount || 0)).toLocaleString();
    }
  }
  checkoutDeliveryZone?.addEventListener('change', () => {
    const isPickup = checkoutDeliveryZone.value === 'pickup';
    if (checkoutPickupStationWrap) checkoutPickupStationWrap.hidden = !isPickup;
    if (checkoutAddressFieldset) checkoutAddressFieldset.hidden = isPickup;
    updateCheckoutFees();
    updateCheckoutReadiness();
  });
  checkoutPickupStation?.addEventListener('change', () => {
    renderSelectedPickupStation();
    updateCheckoutFees();
    updateCheckoutReadiness();
  });
  document.addEventListener('leogo:authchange', (event) => loadPickupStations(event.detail?.user || null));
  updateCheckoutFees();

  checkoutPinLocation?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      checkoutPinStatus.textContent = 'Location pinning is not supported on this device.';
      return;
    }
    checkoutPinLocation.disabled = true;
    checkoutPinStatus.textContent = 'Getting your current location…';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = coords.latitude.toFixed(6);
        const longitude = coords.longitude.toFixed(6);
        const mapsLink = 'https://www.google.com/maps?q=' + latitude + ',' + longitude;
        checkoutCoordinates.value = latitude + ',' + longitude;
        const checkoutLocationLink = document.getElementById('checkoutLocationLink');
        if (checkoutLocationLink) checkoutLocationLink.value = mapsLink;
        checkoutPinStatus.textContent = '✓ Location pinned and the Google Maps link was added automatically.';
        checkoutPinLocation.disabled = false;
      },
      () => {
        checkoutPinStatus.textContent = 'Location could not be pinned. Paste a location link or continue with the written address.';
        checkoutPinLocation.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  const checkoutDetailsStep = document.getElementById('checkoutDetailsStep');
  const checkoutPaymentStep = document.getElementById('checkoutPaymentStep');
  const continueToPayment = document.getElementById('continueToPayment');
  const backToCheckoutDetails = document.getElementById('backToCheckoutDetails');
  const paymentMethodButtons = customerShellModal?.querySelectorAll('[data-payment-method]');
  const walletCheckoutPanel = document.getElementById('walletCheckoutPanel');
  const lppDepositForm = document.getElementById('lppDepositForm');
  const standardPaymentProof = document.getElementById('standardPaymentProof');
  const standardPaymentActions = document.getElementById('standardPaymentActions');
  const paymentProofLabel = document.getElementById('paymentProofLabel');
  const mpesaPaymentMessage = document.getElementById('mpesaPaymentMessage');
  const markPaymentPaid = document.getElementById('markPaymentPaid');
  const markPaymentPaidLabel = document.getElementById('markPaymentPaidLabel');
  const paymentStepStatus = document.getElementById('paymentStepStatus');
  const paymentOrderTotal = document.getElementById('paymentOrderTotal');
  const selectedPaymentLabel = document.getElementById('selectedPaymentLabel');
  const selectedPaymentStatus = document.getElementById('selectedPaymentStatus');
  const makeCheckoutOrder = document.getElementById('makeCheckoutOrder');
  const orderCreatedPanel = document.getElementById('orderCreatedPanel');
  const createdOrderReference = document.getElementById('createdOrderReference');
  const downloadOrderReceipt = document.getElementById('downloadOrderReceipt');
  const sendOrderWhatsApp = document.getElementById('sendOrderWhatsApp');
  const checkoutTillNumber = customerShellModal?.querySelector('[data-admin-managed="mpesa-till-number"]');
  const checkoutPaybillNumber = customerShellModal?.querySelector('[data-admin-managed="mpesa-paybill-number"]');
  const checkoutTillButton = customerShellModal?.querySelector('[data-payment-method="till"]');
  const checkoutPaybillButton = customerShellModal?.querySelector('[data-payment-method="paybill"]');
  const checkoutPaymentDestination = document.getElementById('checkoutAdminPaymentDestination');
  const checkoutPaymentDestinationTitle = document.getElementById('checkoutPaymentDestinationTitle');
  const checkoutPaymentDestinationName = document.getElementById('checkoutPaymentDestinationName');
  const checkoutPaymentDestinationNumber = document.getElementById('checkoutPaymentDestinationNumber');
  const checkoutPaymentDestinationInstructions = document.getElementById('checkoutPaymentDestinationInstructions');
  const copyCheckoutPaymentDestination = document.getElementById('copyCheckoutPaymentDestination');
  let selectedCheckoutPayment = '';
  let previewOrderReference = '';
  let marketplacePaymentDestination = null;

  const checkoutTotalText = () => checkoutGrandTotalValue?.textContent || 'KSh 0';
  const checkoutSubtotal = () => Number(checkoutShell?.dataset.checkoutSubtotal || 0);

  const clearUnavailableMarketplaceSelection = () => {
    if (!['till','paybill'].includes(selectedCheckoutPayment)) return;
    const requiredType = selectedCheckoutPayment === 'till' ? 'mpesa_till' : 'mpesa_paybill';
    if (marketplacePaymentDestination?.account_type === requiredType) return;
    selectedCheckoutPayment = '';
    paymentMethodButtons?.forEach((item) => item.classList.remove('active'));
    if (selectedPaymentLabel) selectedPaymentLabel.textContent = 'Not selected';
    if (selectedPaymentStatus) selectedPaymentStatus.textContent = 'Waiting';
  };

  const renderMarketplacePaymentDestination = (destination, error = null) => {
    marketplacePaymentDestination = destination || null;
    const accountType = destination?.account_type || '';
    const number = window.leogoPayments?.paymentNumber(destination) || '';
    const name = window.leogoPayments?.destinationName(destination) || '';
    const typeLabel = window.leogoPayments?.typeLabel(destination) || 'Order Payment Account';

    const tillAvailable = accountType === 'mpesa_till' && Boolean(destination?.till_number);
    const paybillAvailable = accountType === 'mpesa_paybill' && Boolean(destination?.paybill_number);

    if (checkoutTillNumber) checkoutTillNumber.textContent = tillAvailable ? destination.till_number : 'Not assigned';
    if (checkoutPaybillNumber) checkoutPaybillNumber.textContent = paybillAvailable ? destination.paybill_number : 'Not assigned';

    if (checkoutTillButton) {
      checkoutTillButton.classList.toggle('is-disabled', !tillAvailable);
      checkoutTillButton.setAttribute('aria-disabled', String(!tillAvailable));
      checkoutTillButton.dataset.paymentUnavailableMessage = tillAvailable ? '' : 'M-Pesa Till is not the active Admin-assigned account for Order Payments.';
    }
    if (checkoutPaybillButton) {
      checkoutPaybillButton.classList.toggle('is-disabled', !paybillAvailable);
      checkoutPaybillButton.setAttribute('aria-disabled', String(!paybillAvailable));
      checkoutPaybillButton.dataset.paymentUnavailableMessage = paybillAvailable ? '' : 'M-Pesa Paybill is not the active Admin-assigned account for Order Payments.';
    }

    if (checkoutPaymentDestinationTitle) {
      checkoutPaymentDestinationTitle.textContent = destination
        ? `${typeLabel} — ${destination.display_name || 'LEOGO Payment'}`
        : 'Order payment account unavailable';
    }
    if (checkoutPaymentDestinationName) {
      checkoutPaymentDestinationName.textContent = destination ? name : '';
    }
    if (checkoutPaymentDestinationNumber) {
      if (accountType === 'bank') {
        checkoutPaymentDestinationNumber.textContent = [destination.bank_name, destination.account_number].filter(Boolean).join(' · ') || 'Bank details configured';
      } else {
        checkoutPaymentDestinationNumber.textContent = number || '—';
      }
    }
    if (checkoutPaymentDestinationInstructions) {
      checkoutPaymentDestinationInstructions.textContent = error
        ? 'The Admin payment account could not be loaded. Refresh and try again before paying.'
        : destination
          ? (destination.instructions || 'Use this Admin-assigned account for this order payment.')
          : 'Admin has not assigned an active account to Order Payments. Do not send payment until one is assigned.';
    }
    if (copyCheckoutPaymentDestination) copyCheckoutPaymentDestination.disabled = !number;

    clearUnavailableMarketplaceSelection();
  };

  const loadMarketplacePaymentDestination = async (force = false) => {
    if (!window.leogoAuth?.isAuthenticated?.()) {
      renderMarketplacePaymentDestination(null);
      return null;
    }
    if (!window.leogoPayments) {
      renderMarketplacePaymentDestination(null, new Error('Payment routing is not ready.'));
      return null;
    }
    if (checkoutPaymentDestinationTitle) checkoutPaymentDestinationTitle.textContent = 'Loading Admin payment account…';
    const { data, error } = await window.leogoPayments.getDestination('marketplace_orders', { force });
    renderMarketplacePaymentDestination(data, error);
    return data;
  };

  const updateCashOnDeliveryAvailability = () => {
    const limit = Number(checkoutShell?.dataset.codLimit || 10000);
    const codButton = customerShellModal?.querySelector('[data-payment-method="cod"]');
    const unavailable = checkoutSubtotal() >= limit;
    codButton?.classList.toggle('is-disabled', unavailable);
    codButton?.setAttribute('aria-disabled', String(unavailable));
    if (unavailable && selectedCheckoutPayment === 'cod') {
      selectedCheckoutPayment = '';
      codButton?.classList.remove('active');
      selectedPaymentLabel.textContent = 'Not selected';
    }
  };

  const showCheckoutStep = (step) => {
    const payment = step === 'payment';
    checkoutDetailsStep.hidden = payment;
    checkoutPaymentStep.hidden = !payment;
    checkoutDetailsStep.classList.toggle('active', !payment);
    checkoutPaymentStep.classList.toggle('active', payment);
    if (payment) {
      paymentOrderTotal.textContent = checkoutTotalText();
      updateCashOnDeliveryAvailability();
    }
  };
  const checkoutReadinessMessage = document.getElementById('checkoutReadinessMessage');
  const deliveryAddressFields = [
    checkoutCounty,
    checkoutSubCounty,
    document.getElementById('checkoutEstate'),
    document.getElementById('checkoutLandmark')
  ];
  const checkoutBaseFields = [
    document.getElementById('checkoutReceiverName'),
    document.getElementById('checkoutContactNumber'),
    checkoutDeliveryZone
  ];
  const checkoutObservedFields = [...checkoutBaseFields, ...deliveryAddressFields, checkoutPickupStation];
  updateCheckoutReadiness = () => {
    const isPickup = checkoutDeliveryZone?.value === 'pickup';
    deliveryAddressFields.forEach((field) => {
      if (field) field.required = !isPickup;
    });
    const requiredFields = isPickup
      ? [...checkoutBaseFields, checkoutPickupStation]
      : [...checkoutBaseFields, ...deliveryAddressFields];
    const detailsComplete = requiredFields.every((field) => field && field.value.trim() !== '');
    const cartReady = typeof testCart !== 'undefined' && testCart.length > 0;
    const ready = detailsComplete && cartReady;
    if (continueToPayment) {
      continueToPayment.disabled = !ready;
      continueToPayment.classList.toggle('is-ready', ready);
      continueToPayment.setAttribute('aria-disabled', String(!ready));
    }
    if (checkoutReadinessMessage) {
      checkoutReadinessMessage.classList.toggle('is-ready', ready);
      checkoutReadinessMessage.textContent = ready
        ? '✓ All required details are complete. Continue to payment.'
        : cartReady
          ? isPickup
            ? 'Complete receiver name, phone and choose an active pickup station.'
            : 'Complete receiver name, phone, County, Sub-County, Estate, landmark and delivery zone.'
          : 'Add an item to the cart and complete all required delivery details.';
    }
  };
  checkoutObservedFields.forEach((field) => {
    field?.addEventListener('input', updateCheckoutReadiness);
    field?.addEventListener('change', updateCheckoutReadiness);
  });

  continueToPayment?.addEventListener('click', async () => {
    if (!testCart.length) {
      openCustomerShell('cart');
      return;
    }
    showCheckoutStep('payment');
    await loadMarketplacePaymentDestination(true);
  });
  backToCheckoutDetails?.addEventListener('click', () => showCheckoutStep('details'));

  paymentMethodButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') {
        paymentStepStatus.textContent = button.dataset.paymentUnavailableMessage || 'This payment method is not currently available.';
        return;
      }
      selectedCheckoutPayment = button.dataset.paymentMethod;
      paymentMethodButtons.forEach((item) => item.classList.toggle('active', item === button));
      const labels = { till: 'M-Pesa Till', paybill: 'M-Pesa Paybill', cod: 'Cash on Delivery', lipapolepole: 'Lipa Pole Pole', wallet: 'LEOGO Savings Wallet' };
      selectedPaymentLabel.textContent = labels[selectedCheckoutPayment];
      selectedPaymentStatus.textContent = 'Waiting for confirmation';
      paymentStepStatus.textContent = '';
      const isLipaPolePole = selectedCheckoutPayment === 'lipapolepole';
      const isWallet = selectedCheckoutPayment === 'wallet';
      if (lppDepositForm) lppDepositForm.hidden = !isLipaPolePole;
      if (walletCheckoutPanel) walletCheckoutPanel.hidden = !isWallet;
      if (standardPaymentProof) standardPaymentProof.hidden = isLipaPolePole || isWallet;
      if (standardPaymentActions) standardPaymentActions.hidden = isLipaPolePole || isWallet;
      if (isLipaPolePole) {
        openLppDepositForm();
      } else if (isWallet) {
        const walletOrderTotal = document.getElementById('walletCheckoutOrderTotal');
        if (walletOrderTotal) walletOrderTotal.textContent = checkoutTotalText();
      } else if (selectedCheckoutPayment === 'cod') {
        paymentProofLabel.textContent = 'Paste M-Pesa message for the Transport & Parcel Delivery fee';
        markPaymentPaidLabel.textContent = 'I confirm that I paid the Transport & Parcel Delivery fee first. I will pay the order balance in cash on delivery.';
      } else {
        const destinationNumber = window.leogoPayments?.paymentNumber(marketplacePaymentDestination) || '';
        paymentProofLabel.textContent = destinationNumber
          ? `Paste M-Pesa payment message after paying ${destinationNumber}`
          : 'Paste M-Pesa payment message';
        markPaymentPaidLabel.textContent = 'I confirm that I prepaid this order to the Admin-assigned payment account and want to mark the payment as paid.';
      }
    });
  });

  copyCheckoutPaymentDestination?.addEventListener('click', async () => {
    const number = window.leogoPayments?.paymentNumber(marketplacePaymentDestination) || '';
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      copyCheckoutPaymentDestination.textContent = 'Copied';
      window.setTimeout(() => { copyCheckoutPaymentDestination.textContent = 'Copy'; }, 1400);
    } catch {
      if (paymentStepStatus) paymentStepStatus.textContent = `Payment number: ${number}. Press and hold the number to copy it.`;
    }
  });

  makeCheckoutOrder?.addEventListener('click', async () => {
    paymentStepStatus.textContent = '';
    if (!testCart.length) {
      paymentStepStatus.textContent = 'Your cart is empty. Add a Seller product before making an order.';
      return;
    }
    if (!window.leogoAuth?.isAuthenticated?.()) {
      window.leogoAuth?.requireLogin?.('Please sign in before placing your order.');
      return;
    }
    if (!selectedCheckoutPayment) {
      paymentStepStatus.textContent = 'Select a payment method before making the order.';
      return;
    }
    if (!['till','paybill','cod'].includes(selectedCheckoutPayment)) {
      paymentStepStatus.textContent = 'This payment method is not yet connected to Seller marketplace order creation. Use Till, Paybill or Cash on Delivery.';
      return;
    }
    if (!mpesaPaymentMessage.value.trim()) {
      paymentStepStatus.textContent = selectedCheckoutPayment === 'cod'
        ? 'Paste the M-Pesa confirmation for the Transport & Parcel Delivery fee.'
        : 'Paste the complete M-Pesa payment confirmation message.';
      mpesaPaymentMessage.focus();
      return;
    }
    if (!markPaymentPaid.checked) {
      paymentStepStatus.textContent = 'Tick the payment confirmation box before making the order.';
      markPaymentPaid.focus();
      return;
    }
    const unsupported = testCart.find(item => !item.productId || !item.sellerId);
    if (unsupported) {
      paymentStepStatus.textContent = 'Your cart contains an old preview item. Remove it and add the current Seller product again.';
      return;
    }

    const button = makeCheckoutOrder;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Creating Order…';
    paymentStepStatus.textContent = 'Creating your order and sending it to the Seller…';
    try {
      const pickupStation = checkoutDeliveryZone?.value === 'pickup' ? selectedPickupStation() : null;
      const { data, error } = await window.leogoAuth.client.rpc('customer_create_marketplace_order', {
        p_items: testCart.map(item => ({ product_id: item.productId, quantity: item.quantity })),
        p_receiver_name: document.getElementById('checkoutReceiverName')?.value.trim(),
        p_contact_number: document.getElementById('checkoutContactNumber')?.value.trim(),
        p_delivery_zone: checkoutDeliveryZone?.value,
        p_county: checkoutCounty?.value || null,
        p_sub_county: checkoutSubCounty?.value || null,
        p_estate: document.getElementById('checkoutEstate')?.value.trim() || null,
        p_landmark: document.getElementById('checkoutLandmark')?.value.trim() || null,
        p_location_link: document.getElementById('checkoutLocationLink')?.value.trim() || null,
        p_pickup_station_id: pickupStation?.id || null,
        p_payment_method: selectedCheckoutPayment,
        p_payment_message: mpesaPaymentMessage.value.trim()
      });
      if (error) throw error;
      previewOrderReference = data?.order_reference || '';
      createdOrderReference.textContent = previewOrderReference;
      selectedPaymentStatus.textContent = selectedCheckoutPayment === 'cod' ? 'COD — payment due on delivery' : 'Payment submitted — awaiting Admin verification';
      orderCreatedPanel.hidden = false;
      paymentStepStatus.textContent = 'Order created successfully and sent to the Seller.';
      testCart = [];
      saveTestCart();
      renderTestCart();
      await loadCustomerMarketplaceOrders();
      orderCreatedPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      paymentStepStatus.textContent = error?.message || 'Order could not be created. Please try again.';
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  const receiptEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);

  const getReceiptLogoDataUrl = async () => {
    try {
      const logoUrl = new URL('assets/images/leogo-official-logo.jpg', window.location.href).href;
      const response = await fetch(logoUrl);
      if (!response.ok) throw new Error('Logo unavailable');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const buildBrandedReceiptHtml = async () => {
    const logoDataUrl = await getReceiptLogoDataUrl();
    const receiver = document.getElementById('checkoutReceiverName')?.value || 'Customer';
    const contact = document.getElementById('checkoutContactNumber')?.value || 'Not provided';
    const locationLink = document.getElementById('checkoutLocationLink')?.value || '';
    const pickupStation = checkoutDeliveryZone?.value === 'pickup' ? selectedPickupStation() : null;
    const writtenDeliveryAddress = [
      checkoutCounty?.value,
      checkoutSubCounty?.value,
      document.getElementById('checkoutEstate')?.value,
      document.getElementById('checkoutLandmark')?.value
    ].filter(Boolean).join(', ') || 'Not provided';
    const deliveryAddress = pickupStation ? pickupStationAddress(pickupStation) : writtenDeliveryAddress;
    const subtotal = testCartSubtotal();
    const serviceRate = subtotal >= 3000 ? 0.015 : 0.02;
    const serviceFee = Math.round(subtotal * serviceRate);
    const pickupRate = Number(pickupStation?.service_fee_percent || 0);
    const pickupFee = Math.round(subtotal * (pickupRate / 100));
    const deliveryFee = checkoutDeliveryFeeValue?.textContent || 'Not selected';
    const itemsRows = testCart.map((item) => `
      <tr>
        <td><strong>${receiptEscape(item.name)}</strong></td>
        <td class="number">${item.quantity}</td>
        <td class="number">${receiptEscape(money(item.price))}</td>
        <td class="number"><strong>${receiptEscape(money(item.price * item.quantity))}</strong></td>
      </tr>`).join('');
    const logoMarkup = logoDataUrl
      ? '<img src="' + logoDataUrl + '" alt="LEOGO logo">'
      : '<div class="logo-fallback">LEO<span>GO</span></div>';
    const mapMarkup = !pickupStation && locationLink
      ? '<a class="map-link" href="' + receiptEscape(locationLink) + '">Open pinned delivery location</a>'
      : pickupStation
        ? '<span class="muted">Customer collection at the selected LEOGO pickup station</span>'
        : '<span class="muted">No location link supplied</span>';
    const pickupFeeMarkup = pickupStation
      ? '<div><span>Pickup station fee (' + receiptEscape(pickupRate.toLocaleString()) + '%)</span><strong>' + receiptEscape(money(pickupFee)) + '</strong></div>'
      : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${receiptEscape(previewOrderReference)} — LEOGO Receipt</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf2f8;color:#07152f;font-family:Arial,Helvetica,sans-serif}.receipt{max-width:820px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 18px 55px rgba(7,21,47,.14)}.top{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:26px 30px;background:#071b3d;color:#fff}.brand{display:flex;gap:14px;align-items:center}.brand img{width:74px;height:74px;object-fit:cover;border-radius:14px;background:#fff}.logo-fallback{font-size:28px;font-weight:900}.logo-fallback span{color:#ff7200}.brand h1{margin:0;font-size:24px}.brand p{margin:5px 0 0;color:#c8d5e7;font-size:13px}.receipt-title{text-align:right}.receipt-title span{color:#ff963c;font-size:11px;font-weight:800;letter-spacing:.13em}.receipt-title h2{margin:5px 0 0;font-size:20px}.content{padding:28px 30px}.preview{margin-bottom:20px;padding:10px 13px;border:1px solid #ffd5b3;border-radius:10px;background:#fff7ef;color:#8a480e;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px}.box{padding:15px;border:1px solid #e1e7f0;border-radius:12px}.box h3{margin:0 0 10px;color:#ff7200;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.box p{margin:5px 0;font-size:13px;line-height:1.45}.muted{color:#758096}.map-link{color:#e35f00;font-weight:700;text-decoration:none}table{width:100%;border-collapse:collapse;margin:8px 0 22px}th{padding:11px 9px;background:#f1f5fa;color:#5a687d;text-align:left;font-size:11px;text-transform:uppercase}td{padding:13px 9px;border-bottom:1px solid #e7ebf1;font-size:13px}.number{text-align:right}.totals{width:min(100%,370px);margin-left:auto}.totals div{display:flex;justify-content:space-between;gap:20px;padding:8px 0;color:#536075;font-size:13px}.totals .grand{margin-top:5px;padding:13px 0;border-top:2px solid #071b3d;color:#07152f;font-size:18px;font-weight:900}.payment{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px;padding:16px;border-radius:13px;background:#f2f6fb}.payment div{font-size:12px}.payment strong{display:block;margin-top:4px;font-size:14px}.footer{padding:20px 30px;background:#071b3d;color:#d6e1ef;text-align:center;font-size:11px;line-height:1.65}.footer strong{color:#fff}.print{display:block;margin:22px auto 0;border:0;border-radius:10px;padding:11px 18px;background:#ff7200;color:#fff;font-weight:800;cursor:pointer}@media(max-width:620px){body{padding:0}.receipt{border-radius:0}.top,.meta,.payment{grid-template-columns:1fr;display:grid}.receipt-title{text-align:left}.content{padding:20px}.top{padding:22px}.number{white-space:nowrap}}@media print{body{padding:0;background:#fff}.receipt{box-shadow:none}.print,.preview{display:none}}
</style>
</head>
<body>
<main class="receipt">
  <header class="top">
    <div class="brand">${logoMarkup}<div><h1>LEOGO DIGITAL MARKET</h1><p>Everything You Need. Delivered.</p></div></div>
    <div class="receipt-title"><span>ORDER RECEIPT</span><h2>${receiptEscape(previewOrderReference)}</h2></div>
  </header>
  <section class="content">
    <div class="preview">Phase 1(A) test receipt — permanent verified receipts will be generated after the Supabase order system is connected.</div>
    <div class="meta">
      <div class="box"><h3>Customer</h3><p><strong>${receiptEscape(receiver)}</strong></p><p>${receiptEscape(contact)}</p><p class="muted">${receiptEscape(new Date().toLocaleString('en-KE'))}</p></div>
      <div class="box"><h3>${pickupStation ? 'Pickup Station' : 'Delivery Address'}</h3><p>${pickupStation ? '<strong>' + receiptEscape(pickupStation.station_name) + '</strong><br>' : ''}${receiptEscape(deliveryAddress)}</p><p>${mapMarkup}</p></div>
    </div>
    <table>
      <thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Total</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
      <div><span>Items subtotal</span><strong>${receiptEscape(money(subtotal))}</strong></div>
      <div><span>Service fee (${serviceRate * 100}%)</span><strong>${receiptEscape(money(serviceFee))}</strong></div>
      ${pickupFeeMarkup}
      <div><span>Delivery fee</span><strong>${receiptEscape(deliveryFee)}</strong></div>
      <div class="grand"><span>Grand total</span><strong>${receiptEscape(checkoutTotalText())}</strong></div>
    </div>
    <div class="payment">
      <div>Payment method<strong>${receiptEscape(selectedPaymentLabel?.textContent || 'Not selected')}</strong></div>
      <div>Payment status<strong>${receiptEscape(selectedPaymentStatus?.textContent || 'Waiting')}</strong></div>
    </div>
    <button class="print" onclick="window.print()">Print / Save as PDF</button>
  </section>
  <footer class="footer"><strong>LEOGO Customer Care</strong><br>Call: 0700 192 545 · WhatsApp: +254 700 192 545<br>leogodigitalmarket@gmail.com · leogodigitalmarket2@gmail.com</footer>
</main>
</body>
</html>`;
  };

  downloadOrderReceipt?.addEventListener('click', async () => {
    if (!previewOrderReference) return;
    downloadOrderReceipt.disabled = true;
    downloadOrderReceipt.textContent = 'Preparing receipt…';
    const receiptHtml = await buildBrandedReceiptHtml();
    const blob = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = previewOrderReference + '-LEOGO-receipt.html';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloadOrderReceipt.disabled = false;
    downloadOrderReceipt.textContent = '⬇ Download Receipt';
  });
  sendOrderWhatsApp?.addEventListener('click', () => {
    if (!previewOrderReference) return;
    const receiver = document.getElementById('checkoutReceiverName')?.value.trim() || 'Not provided';
    const contact = document.getElementById('checkoutContactNumber')?.value.trim() || 'Not provided';
    const county = checkoutCounty?.value || 'Not provided';
    const subCounty = checkoutSubCounty?.value || 'Not provided';
    const estate = document.getElementById('checkoutEstate')?.value.trim() || 'Not provided';
    const landmark = document.getElementById('checkoutLandmark')?.value.trim() || 'Not provided';
    const locationLink = document.getElementById('checkoutLocationLink')?.value.trim() || 'Not provided';
    const pickupStation = checkoutDeliveryZone?.value === 'pickup' ? selectedPickupStation() : null;
    const itemLines = testCart.map((item, index) =>
      (index + 1) + '. ' + item.name + ' × ' + item.quantity + ' — ' + money(item.price * item.quantity)
    );
    const message = [
      '🛍️ *LEOGO DIGITAL MARKET*',
      '*NEW CUSTOMER ORDER*',
      '',
      '🧾 *ORDER DETAILS*',
      'Order No: ' + previewOrderReference,
      'Date: ' + new Date().toLocaleString('en-KE'),
      '',
      '👤 *CUSTOMER*',
      'Name: ' + receiver,
      'Phone: ' + contact,
      '',
      '📦 *ITEMS*',
      ...itemLines,
      '',
      '💰 *ORDER SUMMARY*',
      'Items subtotal: ' + (document.getElementById('checkoutSubtotalValue')?.textContent || 'KSh 0'),
      'Service fee: ' + (checkoutServiceFeeValue?.textContent || 'KSh 0'),
      ...(pickupStation ? ['Pickup station fee ' + (checkoutPickupFeeRate?.textContent || '') + ': ' + (checkoutPickupFeeValue?.textContent || 'KSh 0')] : []),
      'Delivery fee: ' + (checkoutDeliveryFeeValue?.textContent || 'Not selected'),
      '*Grand total: ' + checkoutTotalText() + '*',
      '',
      '💳 *PAYMENT*',
      'Method: ' + selectedPaymentLabel.textContent,
      'Status: ' + selectedPaymentStatus.textContent,
      '',
      pickupStation ? '📍 *PICKUP STATION*' : '📍 *DELIVERY LOCATION*',
      ...(pickupStation ? [
        'Station: ' + pickupStation.station_name,
        'Address: ' + pickupStationAddress(pickupStation)
      ] : [
        'County: ' + county,
        'Sub-County: ' + subCounty,
        'Estate / Area: ' + estate,
        'Nearest landmark: ' + landmark,
        'Map link: ' + locationLink
      ]),
      '',
      'Please review and confirm this order.',
      '_LEOGO — Everything You Need. Delivered._'
    ].join('\n');
    window.open('https://wa.me/254700192545?text=' + encodeURIComponent(message), '_blank', 'noopener');
  });

  const testCartStorageKey = 'leogo_marketplace_cart_v1';
  const headerCartCount = document.getElementById('headerCartCount');
  const cartShellCount = document.getElementById('cartShellCount');
  const cartShellItems = document.getElementById('cartShellItems');
  const testCartFeedback = document.getElementById('testCartFeedback');
  let testCart = [];
  try {
    const savedCart = JSON.parse(localStorage.getItem(testCartStorageKey) || '[]');
    testCart = Array.isArray(savedCart) ? savedCart : [];
  } catch {
    testCart = [];
  }

  const money = (value) => 'KSh ' + Number(value || 0).toLocaleString();
  const testCartCount = () => testCart.reduce((total, item) => total + item.quantity, 0);
  const testCartSubtotal = () => testCart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const saveTestCart = () => localStorage.setItem(testCartStorageKey, JSON.stringify(testCart));

  const renderTestCart = () => {
    const count = testCartCount();
    const subtotal = testCartSubtotal();
    if (headerCartCount) headerCartCount.textContent = count;
    if (cartShellCount) cartShellCount.textContent = count + (count === 1 ? ' item' : ' items');
    if (checkoutShell) checkoutShell.dataset.checkoutSubtotal = String(subtotal);
    const subtotalValue = document.getElementById('checkoutSubtotalValue');
    if (subtotalValue) subtotalValue.textContent = money(subtotal);

    if (cartShellItems) {
      if (!testCart.length) {
        cartShellItems.innerHTML = '<div class="customer-empty-state compact"><span>🛒</span><h4>Your cart is empty</h4><p>Add one of the active sample products to test checkout.</p><button type="button" data-close-customer-shell>Browse Products</button></div>';
        cartShellItems.querySelector('[data-close-customer-shell]')?.addEventListener('click', closeCustomerShell);
      } else {
        cartShellItems.innerHTML = testCart.map((item) => `
          <article class="test-cart-item" data-cart-item="${item.id}">
            <span class="test-cart-item-icon">${item.icon}</span>
            <div class="test-cart-item-info"><strong>${item.name}</strong><small>${money(item.price)} each · ${money(item.price * item.quantity)}</small></div>
            <div class="test-cart-item-controls">
              <button type="button" data-cart-action="decrease" aria-label="Reduce ${item.name}">−</button>
              <b>${item.quantity}</b>
              <button type="button" data-cart-action="increase" aria-label="Add another ${item.name}">＋</button>
              <button type="button" data-cart-action="remove" aria-label="Remove ${item.name}">×</button>
            </div>
          </article>`).join('') + '<p class="test-cart-summary-note">Test cart is stored on this browser. Supabase account cart storage will be connected later.</p>';
      }
    }
    updateCheckoutFees();
    updateCashOnDeliveryAvailability();
    updateCheckoutReadiness();
    if (paymentOrderTotal) paymentOrderTotal.textContent = checkoutTotalText();
  };

  const sellerMarketplaceList = document.getElementById('sellerMarketplaceList');
  const exploreCategoryGrid = document.getElementById('exploreCategoryGrid');
  const liveProductGrid = document.getElementById('liveProductGrid');
  const liveCatalogueTitle = document.getElementById('liveCatalogueTitle');
  const liveCatalogueSubtitle = document.getElementById('liveCatalogueSubtitle');
  const liveCatalogueStatus = document.getElementById('liveCatalogueStatus');
  const showAllLiveProducts = document.getElementById('showAllLiveProducts');
  const viewAllProductCategories = document.getElementById('viewAllProductCategories');

  let marketplaceProducts = [];
  let marketplaceCategories = [];
  let selectedMarketplaceCategory = 'all';

  const categoryIcon = (code) => ({
    food_drinks: '🍔',
    groceries: '🛒',
    pharmacy: '💊',
    dry_goods: '📦',
    bookshop: '📚',
    hardware: '🧰',
    marketplace: '🛍️',
    second_hand_market: '♻️',
    garments_clothes_footwear: '👕',
    jewelry: '💍',
    alcoholic_leogo_bar: '🍺',
    vehicles: '🚗',
    other: '🧩'
  }[code] || '🛍️');

  const categoryDisplayName = (name = '') => String(name)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace('Footwares', 'Footwears')
    .replace('Market Place', 'Market Place');

  const sellerProductMediaUrl = (path) => {
    const client = window.leogoAuth?.client;
    if (!client || !path) return '';
    return client.storage.from('seller-product-media').getPublicUrl(String(path)).data?.publicUrl || '';
  };

  const filteredMarketplaceProducts = () => {
    if (selectedMarketplaceCategory === 'all' || selectedMarketplaceCategory === 'marketplace') {
      return marketplaceProducts;
    }
    return marketplaceProducts.filter((product) => product.category_code === selectedMarketplaceCategory);
  };

  const syncCustomerCategoryCards = () => {
    if (!exploreCategoryGrid || !marketplaceCategories.length) return;
    const firstSystemCard = exploreCategoryGrid.querySelector('[data-system-category]');

    marketplaceCategories.forEach((category) => {
      let card = exploreCategoryGrid.querySelector('[data-product-category-code="'+CSS.escape(category.code)+'"]');
      if (!card) {
        card = document.createElement('a');
        card.className = 'category-card';
        card.href = category.code === 'alcoholic_leogo_bar' ? '#leogo-bar' : '#live-product-catalogue';
        card.dataset.productCategoryCode = category.code;
        card.innerHTML = '<span>'+categoryIcon(category.code)+'</span><strong></strong>';
        exploreCategoryGrid.insertBefore(card, firstSystemCard || null);
      }

      const strong = card.querySelector('strong');
      if (strong) strong.textContent = categoryDisplayName(category.name);
      card.dataset.categoryId = category.id;

      if (category.code !== 'alcoholic_leogo_bar') {
        card.href = '#live-product-catalogue';
      }
    });
  };

  const renderLiveCatalogue = () => {
    if (!liveProductGrid || !liveCatalogueStatus) return;

    const category = marketplaceCategories.find((item) => item.code === selectedMarketplaceCategory);
    const allProducts = selectedMarketplaceCategory === 'all' || selectedMarketplaceCategory === 'marketplace';
    const products = filteredMarketplaceProducts();

    if (liveCatalogueTitle) {
      liveCatalogueTitle.textContent = allProducts
        ? 'LEOGO Marketplace'
        : categoryDisplayName(category?.name || selectedMarketplaceCategory.replaceAll('_',' '));
    }
    if (liveCatalogueSubtitle) {
      liveCatalogueSubtitle.textContent = allProducts
        ? 'All Admin-approved Seller products available on LEOGO.'
        : 'Admin-approved products in '+categoryDisplayName(category?.name || selectedMarketplaceCategory.replaceAll('_',' '))+'.';
    }

    if (!products.length) {
      liveCatalogueStatus.textContent = allProducts
        ? 'No approved Seller products are available yet.'
        : 'No approved Seller products are available in this category yet.';
      liveProductGrid.innerHTML = '<div class="customer-empty-state live-catalogue-empty"><span>'+categoryIcon(selectedMarketplaceCategory)+'</span><h4>No approved products yet</h4><p>Seller products appear here only after LEOGO Admin approves them.</p></div>';
      return;
    }

    liveCatalogueStatus.textContent = products.length+' approved product'+(products.length === 1 ? '' : 's')+' found.';

    liveProductGrid.innerHTML = products.map((product) => {
      const available = product.availability_status === 'available' && Number(product.quantity_available || 0) > 0;
      const imageUrl = sellerProductMediaUrl(product.main_image_path);
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variantMarkup = variants.length
        ? '<div class="live-product-variants">'+variants.map((variant) =>
            '<span><b>'+receiptEscape(variant.variant_name)+'</b><small>'+money(variant.price_kes)+' · Qty '+Number(variant.quantity_available || 0)+'</small></span>'
          ).join('')+'</div>'
        : '';

      return '<article class="live-product-card" data-live-product-card="'+receiptEscape(product.id)+'">'+
        '<div class="live-product-image">'+
          (imageUrl
            ? '<img src="'+receiptEscape(imageUrl)+'" alt="'+receiptEscape(product.product_name)+'">'
            : '<span>'+categoryIcon(product.category_code)+'</span>')+
        '</div>'+
        '<div class="live-product-body">'+
          '<div class="live-product-category">'+receiptEscape(categoryDisplayName(product.category_name || product.category_code || 'Marketplace'))+
            (product.subcategory_name ? ' · '+receiptEscape(product.subcategory_name) : '')+
          '</div>'+
          '<h3>'+receiptEscape(product.product_name)+'</h3>'+
          '<p class="live-product-seller">'+receiptEscape(product.seller_name || 'LEOGO Seller')+'</p>'+
          '<div class="live-product-price-row"><strong>'+money(product.price_kes)+'</strong><span>Qty '+Number(product.quantity_available || 0)+' '+receiptEscape(product.measurement_unit || 'item')+'</span></div>'+
          '<p class="live-product-description">'+receiptEscape(String(product.product_details || '').slice(0,180))+'</p>'+
          variantMarkup+
          '<button type="button" data-live-add-cart data-product-id="'+receiptEscape(product.id)+'" '+(available ? '' : 'disabled')+'>'+
            (available ? '＋ Add to Cart' : 'Out of Stock')+
          '</button>'+
        '</div>'+
      '</article>';
    }).join('');
  };

  const renderMarketplacePreview = () => {
    if (!sellerMarketplaceList) return;
    const preview = marketplaceProducts.slice(0, 8);
    sellerMarketplaceList.innerHTML = preview.length ? preview.map((product) => {
      const available = product.availability_status === 'available' && Number(product.quantity_available || 0) > 0;
      return '<div class="clip-row test-product-row"><span class="clip-icon">'+categoryIcon(product.category_code)+'</span><div><b>'+
        receiptEscape(product.product_name)+'</b><small>'+receiptEscape(product.seller_name || 'LEOGO Seller')+' · '+
        receiptEscape(categoryDisplayName(product.category_name || product.category_code || 'Marketplace'))+'</small></div><span class="clip-price">'+
        money(product.price_kes)+'</span><button type="button" data-live-add-cart data-product-id="'+receiptEscape(product.id)+'" '+(available?'':'disabled')+'>'+
        (available?'＋ Cart':'Out of stock')+'</button></div>';
    }).join('') + '<p class="test-cart-feedback" id="testCartFeedback" aria-live="polite"></p>'
      : '<div class="customer-empty-state compact"><span>🛍️</span><h4>No approved Seller products yet</h4><p>Products will appear here after Admin approval.</p></div>';
  };

  const loadMarketplaceProducts = async () => {
    const client = window.leogoAuth?.client;
    if (!client) return;

    if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Loading approved Seller products…';

    const [categoryResult, productResult] = await Promise.all([
      client.rpc('customer_product_categories'),
      client.rpc('customer_marketplace_catalogue')
    ]);

    if (categoryResult.error) {
      if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Product categories could not load: '+categoryResult.error.message;
    } else {
      marketplaceCategories = Array.isArray(categoryResult.data) ? categoryResult.data : [];
      syncCustomerCategoryCards();
    }

    if (productResult.error) {
      if (sellerMarketplaceList) {
        sellerMarketplaceList.innerHTML = '<div class="customer-empty-state compact"><span>⚠️</span><h4>Seller products could not load</h4><p>'+receiptEscape(productResult.error.message)+'</p></div>';
      }
      if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Seller products could not load: '+productResult.error.message;
      return;
    }

    marketplaceProducts = Array.isArray(productResult.data) ? productResult.data : [];
    renderMarketplacePreview();
    renderLiveCatalogue();
  };

  const addLiveProductToCart = (button) => {
    if (!button || button.disabled) return;
    const product = marketplaceProducts.find((item) => item.id === button.dataset.productId);
    if (!product) return;

    const existing = testCart.find((item) => item.productId === product.id);
    if (existing) existing.quantity += 1;
    else testCart.push({
      id: product.id,
      productId: product.id,
      sellerId: product.seller_id,
      sellerName: product.seller_name,
      name: product.product_name,
      price: Number(product.price_kes),
      deposit: Number(product.lipa_pole_pole_first_deposit_kes || 0),
      lppDays: Number(product.lipa_pole_pole_max_days || 0),
      icon: categoryIcon(product.category_code),
      quantity: 1
    });

    saveTestCart();
    renderTestCart();

    const feedback = document.getElementById('testCartFeedback');
    if (feedback) feedback.textContent = product.product_name + ' added to cart.';
    const original = button.textContent;
    button.textContent = '✓ Added';
    window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 900);
  };

  sellerMarketplaceList?.addEventListener('click', (event) => {
    addLiveProductToCart(event.target.closest('[data-live-add-cart]'));
  });
  liveProductGrid?.addEventListener('click', (event) => {
    addLiveProductToCart(event.target.closest('[data-live-add-cart]'));
  });

  exploreCategoryGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-category-code]');
    if (!card) return;
    const code = card.dataset.productCategoryCode;

    // Alcohol keeps the existing adult-gated LEOGO BAR flow.
    if (code === 'alcoholic_leogo_bar') return;

    event.preventDefault();
    selectedMarketplaceCategory = code === 'marketplace' ? 'all' : code;
    renderLiveCatalogue();
    document.getElementById('live-product-catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  showAllLiveProducts?.addEventListener('click', () => {
    selectedMarketplaceCategory = 'all';
    renderLiveCatalogue();
  });
  viewAllProductCategories?.addEventListener('click', (event) => {
    event.preventDefault();
    selectedMarketplaceCategory = 'all';
    renderLiveCatalogue();
    document.getElementById('live-product-catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('leogo:authchange', () => loadMarketplaceProducts());
  window.setTimeout(loadMarketplaceProducts, 500);

  cartShellItems?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-action]');
    const row = event.target.closest('[data-cart-item]');
    if (!button || !row) return;
    const index = testCart.findIndex((item) => item.id === row.dataset.cartItem);
    if (index < 0) return;
    if (button.dataset.cartAction === 'increase') testCart[index].quantity += 1;
    if (button.dataset.cartAction === 'decrease') {
      testCart[index].quantity -= 1;
      if (testCart[index].quantity <= 0) testCart.splice(index, 1);
    }
    if (button.dataset.cartAction === 'remove') testCart.splice(index, 1);
    saveTestCart();
    renderTestCart();
  });

  renderTestCart();

  const lppStorageKey = 'leogo_phase1_lipa_pole_pole';
  const lppDepositItem = document.getElementById('lppDepositItem');
  const lppDepositTotal = document.getElementById('lppDepositTotal');
  const lppDepositRequired = document.getElementById('lppDepositRequired');
  const lppDepositPeriod = document.getElementById('lppDepositPeriod');
  const lppDepositMessage = document.getElementById('lppDepositMessage');
  const lppDepositPaidCheck = document.getElementById('lppDepositPaidCheck');
  const lppRulesAccepted = document.getElementById('lppRulesAccepted');
  const lppDepositStatus = document.getElementById('lppDepositStatus');
  const lppAccountList = document.getElementById('lppAccountList');
  let lppPlans = [];
  try {
    const savedPlans = JSON.parse(localStorage.getItem(lppStorageKey) || '[]');
    lppPlans = Array.isArray(savedPlans) ? savedPlans : [];
  } catch {
    lppPlans = [];
  }
  lppPlans = lppPlans.map((plan) => {
    const maxDays = Number(plan.maxDays || sampleSellerPeriods[plan.itemId] || 30);
    const createdAt = plan.createdAt || plan.payments?.[0]?.submittedAt || new Date().toISOString();
    const deadline = plan.deadline || new Date(new Date(createdAt).getTime() + (maxDays * 86400000)).toISOString();
    return { ...plan, maxDays, createdAt, deadline };
  });
  const saveLppPlans = () => localStorage.setItem(lppStorageKey, JSON.stringify(lppPlans));
  const approvedLppTotal = (plan) => (plan.payments || []).filter((payment) => payment.status === 'approved').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingLppTotal = (plan) => (plan.payments || []).filter((payment) => payment.status === 'pending').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const populateLppCartItems = () => {
    if (!lppDepositItem) return;
    const selected = lppDepositItem.value;
    lppDepositItem.innerHTML = '<option value="">Select an item from your cart</option>' + testCart.map((item) =>
      '<option value="' + receiptEscape(item.id) + '">' + receiptEscape(item.name) + ' — deposit ' + receiptEscape(money((item.deposit || 0) * item.quantity)) + ' · ' + receiptEscape(item.lppDays || 0) + ' days</option>'
    ).join('');
    if (testCart.some((item) => item.id === selected)) lppDepositItem.value = selected;
  };
  const updateLppDepositValues = () => {
    const item = testCart.find((entry) => entry.id === lppDepositItem?.value);
    if (lppDepositTotal) lppDepositTotal.textContent = item ? money(item.price * item.quantity) : 'KSh 0';
    if (lppDepositRequired) lppDepositRequired.textContent = item ? money((item.deposit || 0) * item.quantity) : 'KSh 0';
    if (lppDepositPeriod) lppDepositPeriod.textContent = item ? (item.lppDays + ' days') : 'Select item';
  };
  const openLppDepositForm = () => {
    populateLppCartItems();
    updateLppDepositValues();
    if (lppDepositStatus) lppDepositStatus.textContent = '';
  };
  lppDepositItem?.addEventListener('change', updateLppDepositValues);

  const formatLppDate = (value) => new Date(value).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  const lppDaysRemaining = (deadline) => Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  const renderLppAccounts = () => {
    const activeCount = lppPlans.length;
    const allApproved = lppPlans.reduce((sum, plan) => sum + approvedLppTotal(plan), 0);
    const allPending = lppPlans.reduce((sum, plan) => sum + pendingLppTotal(plan), 0);
    const allBalance = lppPlans.reduce((sum, plan) => sum + Math.max(0, Number(plan.total) - approvedLppTotal(plan)), 0);
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('lppDashboardCount', activeCount);
    setText('lppActiveAccounts', activeCount);
    setText('lppTotalApproved', money(allApproved));
    setText('lppTotalPending', money(allPending));
    setText('lppTotalBalance', money(allBalance));
    if (!lppAccountList) return;
    if (!lppPlans.length) {
      lppAccountList.innerHTML = '<div class="customer-empty-state compact"><span>🪙</span><h4>No Lipa Pole Pole account yet</h4><p>Select Lipa Pole Pole during checkout to submit a seller-set first deposit.</p><button type="button" data-customer-view="cart">Open Cart</button></div>';
      lppAccountList.querySelector('[data-customer-view="cart"]')?.addEventListener('click', () => showCustomerView('cart'));
      return;
    }
    lppAccountList.innerHTML = lppPlans.map((plan) => {
      const paid = approvedLppTotal(plan);
      const pending = pendingLppTotal(plan);
      const balance = Math.max(0, Number(plan.total) - paid);
      const progress = plan.total ? Math.min(100, (paid / Number(plan.total)) * 100) : 0;
      return `<article class="lpp-plan-card" data-lpp-plan="${receiptEscape(plan.id)}">
        <div class="lpp-plan-head"><div><span>${receiptEscape(plan.orderRef)}</span><h4>${receiptEscape(plan.itemName)}</h4><small>Seller-set deposit: ${receiptEscape(money(plan.depositRequired))}</small></div><b class="lpp-status">${plan.cancellation?.status === 'pending' ? 'CANCELLATION PENDING' : (plan.cancellation?.status === 'approved' ? 'CANCELLED' : (balance <= 0 ? 'PAID IN FULL' : (lppDaysRemaining(plan.deadline) < 0 ? 'PAYMENT OVERDUE' : (pending > 0 ? 'PENDING CONFIRMATION' : 'ACTIVE'))))}</b></div>
        <div class="lpp-plan-terms"><div><span>Maximum Period</span><strong>${receiptEscape(plan.maxDays)} days</strong></div><div><span>Payment Deadline</span><strong>${receiptEscape(formatLppDate(plan.deadline))}</strong></div><div><span>Time Remaining</span><strong>${balance <= 0 ? 'Completed' : (lppDaysRemaining(plan.deadline) >= 0 ? lppDaysRemaining(plan.deadline) + ' days' : Math.abs(lppDaysRemaining(plan.deadline)) + ' days overdue')}</strong></div></div>
        <div class="lpp-plan-money"><div><span>Total Amount</span><strong>${money(plan.total)}</strong></div><div><span>Deposit Paid</span><strong>${money(paid)}</strong></div><div><span>Total Paid</span><strong>${money(paid)}</strong></div><div><span>Total Balance</span><strong>${money(balance)}</strong></div></div>
        <div class="lpp-progress"><i style="width:${progress}%"></i></div>
        ${pending > 0 ? '<p class="lpp-pending-note">⏳ ' + money(pending) + ' submitted and waiting for Admin/Staff confirmation. Pending payments do not reduce the balance.</p>' : ''}
        <p class="lpp-collection-lock ${lppDaysRemaining(plan.deadline) < 0 && balance > 0 ? 'lpp-deadline-warning' : ''}">${balance <= 0 ? '✓ Full payment completed. Item collection can be released after final confirmation.' : (lppDaysRemaining(plan.deadline) < 0 ? '⚠ Deadline missed: subject to a 25% refund deduction or a 5% charge on the total payable amount.' : '🔒 Item collection remains locked until the full amount is paid and confirmed.')}</p>
        ${plan.cancellation?.status === 'pending' ? '<p class="lpp-cancellation-pending">Cancellation requested. Estimated refund: <strong>' + money(plan.cancellation.estimatedRefund) + '</strong> after a 25% deduction, subject to Admin/Staff confirmation and payment verification.</p>' : ''}
        <div class="lpp-plan-actions">
          <button type="button" data-lpp-pay="${receiptEscape(plan.id)}" ${balance <= 0 || plan.cancellation ? 'disabled' : ''}>Do Payment</button>
          <button class="lpp-cancel-button" type="button" data-lpp-cancel="${receiptEscape(plan.id)}" ${plan.cancellation || balance <= 0 ? 'disabled' : ''}>Cancel Lipa Pole Pole Order</button>
        </div>
        <form class="lpp-cancel-form" data-lpp-cancel-form="${receiptEscape(plan.id)}" hidden>
          <h5>Cancel Lipa Pole Pole Order</h5>
          <div class="lpp-refund-preview"><div><span>Submitted/approved payments</span><strong>${money(paid + pending)}</strong></div><div><span>25% cancellation deduction</span><strong>− ${money(Math.round((paid + pending) * 0.25))}</strong></div><div><span>Estimated refund</span><strong>${money(Math.round((paid + pending) * 0.75))}</strong></div></div>
          <label><span>Reason for cancellation</span><select name="reason" required><option value="">Select reason</option><option>Changed my mind</option><option>Unable to complete payments</option><option>Seller or item concern</option><option>Other reason</option></select></label>
          <label><span>Additional information <small>(optional)</small></span><textarea name="details" rows="3" placeholder="Explain the cancellation request"></textarea></label>
          <label class="payment-paid-check"><input name="acceptDeduction" type="checkbox"><span>I understand that an approved cancellation refund is subject to a 25% deduction from verified payments.</span></label>
          <button type="submit">Submit Cancellation Request</button>
          <p class="payment-step-status" data-lpp-cancel-status></p>
        </form>
        <form class="lpp-topup-form" data-lpp-topup-form="${receiptEscape(plan.id)}" hidden>
          <label><span>Payment amount</span><input name="amount" type="number" min="1" max="${balance}" placeholder="Enter amount" required></label>
          <label><span>Paste M-Pesa message/reference</span><textarea name="message" rows="3" placeholder="Paste the complete payment message" required></textarea></label>
          <label class="payment-paid-check"><input name="paid" type="checkbox"><span>I have paid this amount and request Admin/Staff confirmation.</span></label>
          <button type="submit">Submit Payment for Confirmation</button>
          <p class="payment-step-status" data-lpp-topup-status></p>
        </form>
      </article>`;
    }).join('');
  };

  lppDepositForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const item = testCart.find((entry) => entry.id === lppDepositItem?.value);
    if (!item) {
      lppDepositStatus.textContent = 'Select an eligible item from the cart.';
      return;
    }
    if (!lppDepositMessage.value.trim()) {
      lppDepositStatus.textContent = 'Paste the M-Pesa deposit message/reference.';
      return;
    }
    if (!lppDepositPaidCheck.checked) {
      lppDepositStatus.textContent = 'Tick “I have paid” before submitting.';
      return;
    }
    if (!lppRulesAccepted.checked) {
      lppDepositStatus.textContent = 'Read and accept the Lipa Pole Pole rules before submitting.';
      return;
    }
    const total = item.price * item.quantity;
    const depositRequired = (item.deposit || 0) * item.quantity;
    const reference = 'LPP-' + Date.now().toString().slice(-8);
    lppPlans.push({
      id: reference,
      orderRef: reference,
      itemId: item.id,
      itemName: item.name + (item.quantity > 1 ? ' × ' + item.quantity : ''),
      total,
      depositRequired,
      maxDays: item.lppDays,
      createdAt: new Date().toISOString(),
      deadline: new Date(Date.now() + (item.lppDays * 86400000)).toISOString(),
      rulesAccepted: true,
      payments: [{ id: 'PAY-' + Date.now(), amount: depositRequired, message: lppDepositMessage.value.trim(), type: 'deposit', status: 'pending', submittedAt: new Date().toISOString() }]
    });
    saveLppPlans();
    renderLppAccounts();
    lppDepositStatus.textContent = 'Deposit submitted. It is pending Admin/Staff confirmation.';
    selectedPaymentStatus.textContent = 'Deposit pending Admin confirmation';
    window.setTimeout(() => showCustomerView('lipapolepole'), 700);
  });

  lppAccountList?.addEventListener('click', (event) => {
    const payButton = event.target.closest('[data-lpp-pay]');
    if (payButton) {
      const form = lppAccountList.querySelector('[data-lpp-topup-form="' + payButton.dataset.lppPay + '"]');
      if (form) form.hidden = !form.hidden;
      return;
    }
    const cancelButton = event.target.closest('[data-lpp-cancel]');
    if (cancelButton) {
      const form = lppAccountList.querySelector('[data-lpp-cancel-form="' + cancelButton.dataset.lppCancel + '"]');
      if (form) form.hidden = !form.hidden;
    }
  });
  lppAccountList?.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-lpp-topup-form]');
    if (!form) return;
    event.preventDefault();
    const plan = lppPlans.find((entry) => entry.id === form.dataset.lppTopupForm);
    const status = form.querySelector('[data-lpp-topup-status]');
    const amount = Number(form.elements.amount.value);
    const message = form.elements.message.value.trim();
    if (!plan || !amount || amount <= 0) {
      status.textContent = 'Enter a valid payment amount.';
      return;
    }
    if (amount > Math.max(0, plan.total - approvedLppTotal(plan))) {
      status.textContent = 'Payment cannot be higher than the outstanding balance.';
      return;
    }
    if (!message) {
      status.textContent = 'Paste the M-Pesa payment message/reference.';
      return;
    }
    if (!form.elements.paid.checked) {
      status.textContent = 'Tick “I have paid” before submitting.';
      return;
    }
    plan.payments.push({ id: 'PAY-' + Date.now(), amount, message, type: 'instalment', status: 'pending', submittedAt: new Date().toISOString() });
    saveLppPlans();
    renderLppAccounts();
  });
  lppAccountList?.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-lpp-cancel-form]');
    if (!form) return;
    event.preventDefault();
    const plan = lppPlans.find((entry) => entry.id === form.dataset.lppCancelForm);
    const status = form.querySelector('[data-lpp-cancel-status]');
    if (!plan) return;
    const reason = form.elements.reason.value;
    if (!reason) {
      status.textContent = 'Select a reason for cancelling the order.';
      return;
    }
    if (!form.elements.acceptDeduction.checked) {
      status.textContent = 'Confirm that you understand the 25% cancellation deduction.';
      return;
    }
    const verifiedOrSubmitted = approvedLppTotal(plan) + pendingLppTotal(plan);
    plan.cancellation = {
      status: 'pending',
      reason,
      details: form.elements.details.value.trim(),
      requestedAt: new Date().toISOString(),
      paymentBase: verifiedOrSubmitted,
      deduction: Math.round(verifiedOrSubmitted * 0.25),
      estimatedRefund: Math.round(verifiedOrSubmitted * 0.75)
    };
    saveLppPlans();
    renderLppAccounts();
  });
  renderLppAccounts();


  let customerMarketplaceOrders = [];
  let customerActivityFilter = 'all';
  const customerOrderStatusText = (status) => ({
    placed:'Order placed',processing:'Seller preparing order',with_rider:'Handed to rider',delivered:'Delivered',cancelled:'Cancelled'
  }[status] || String(status || '').replaceAll('_',' '));
  const customerPaymentText = (status) => ({
    submitted:'Payment submitted — verifying',verified_paid:'Paid',cod_due:'COD — due on delivery',cod_paid:'Paid on delivery',rejected:'Payment rejected'
  }[status] || String(status || '').replaceAll('_',' '));
  const renderCustomerMarketplaceOrders = () => {
    const container = document.getElementById('customerMarketplaceOrders');
    const empty = document.getElementById('customerActivityEmpty');
    if (!container) return;
    let rows = customerMarketplaceOrders;
    if (customerActivityFilter === 'active') rows = rows.filter(o => !['delivered','cancelled'].includes(o.order_status));
    if (customerActivityFilter === 'completed') rows = rows.filter(o => o.order_status === 'delivered');
    if (customerActivityFilter === 'cancelled') rows = rows.filter(o => o.order_status === 'cancelled');
    if (['services','transport'].includes(customerActivityFilter)) rows = [];
    if (customerActivityFilter === 'products') rows = customerMarketplaceOrders;
    container.innerHTML = rows.map(order => {
      const items=(order.items||[]).map(i=>'<li>'+receiptEscape(i.product_name)+' × '+Number(i.quantity)+' <strong>'+money(i.line_total_kes)+'</strong></li>').join('');
      const sellers=(order.seller_fulfilments||[]).map(s=>'<span>'+receiptEscape(s.seller_name)+' — <b>'+receiptEscape(String(s.fulfilment_status).replaceAll('_',' '))+'</b></span>').join('');
      const rider = order.rider_name ? '<div class="customer-order-delivery"><span><small>LEOGO Rider</small><strong>'+receiptEscape(order.rider_name)+'</strong></span><span><small>Delivery status</small><strong>'+receiptEscape(String(order.delivery_status||'awaiting_assignment').replaceAll('_',' '))+'</strong></span></div>' : '<div class="customer-order-delivery"><span><small>LEOGO Rider</small><strong>Awaiting assignment</strong></span><span><small>Delivery status</small><strong>'+receiptEscape(String(order.delivery_status||'awaiting_assignment').replaceAll('_',' '))+'</strong></span></div>';
      return '<article class="customer-order-card"><header><div><strong>'+receiptEscape(order.order_reference)+'</strong><small>'+formatDate(order.created_at)+'</small></div><div><b>'+receiptEscape(customerOrderStatusText(order.order_status))+'</b><small>'+receiptEscape(customerPaymentText(order.payment_status))+'</small></div></header><ul>'+items+'</ul><div class="customer-order-sellers">'+sellers+'</div>'+rider+'<div class="customer-order-total"><span>Total</span><strong>'+money(order.grand_total_kes)+'</strong></div></article>';
    }).join('');
    if (empty) empty.hidden = rows.length > 0;
    const active = customerMarketplaceOrders.filter(o=>!['delivered','cancelled'].includes(o.order_status)).length;
    const ac=document.getElementById('customerActiveOrderCount'); if(ac) ac.textContent=active;
    const at=document.getElementById('customerActiveOrderText'); if(at) at.textContent=active?active+' order(s) in progress':'No active orders';
    const pc=document.getElementById('customerProductOrderCount'); if(pc) pc.textContent=customerMarketplaceOrders.length;

  };
  async function loadCustomerMarketplaceOrders(){
    if(!window.leogoAuth?.isAuthenticated?.()){
      customerMarketplaceOrders=[];renderCustomerMarketplaceOrders();return;
    }
    const {data,error}=await window.leogoAuth.client.rpc('customer_list_marketplace_orders');
    if(error){console.error(error);return;}
    customerMarketplaceOrders=data||[];
    renderCustomerMarketplaceOrders();
  }
  document.addEventListener('leogo:authchange',()=>loadCustomerMarketplaceOrders());
  document.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-customer-view="orders"],[data-open-customer-view="orders"]')) window.setTimeout(loadCustomerMarketplaceOrders,0);
  });

  const activityFilterButtons = customerShellModal?.querySelectorAll('[data-activity-filter]');
  const activityEmptyIcon = document.getElementById('activityEmptyIcon');
  const activityEmptyTitle = document.getElementById('activityEmptyTitle');
  const activityEmptyText = document.getElementById('activityEmptyText');
  const activityEmptyMessages = {
    all: ['🧾', 'No previous activity yet', 'Your product orders, service requests and Transport & Parcel Delivery bookings will appear here automatically, including their dates, payment and completion status.'],
    products: ['📦', 'No product orders yet', 'Your current and previous product orders will appear here when the ordering system is connected.'],
    services: ['🛠️', 'No service activity yet', 'Your requested, assigned and completed service jobs will appear here when services are connected.'],
    transport: ['🚚', 'No Transport & Parcel Delivery bookings yet', 'Your Transport & Parcel Delivery bookings will appear here when the records are connected.'],
    active: ['⏳', 'No active activity', 'Orders, services and Transport & Parcel Delivery bookings currently in progress will appear here.'],
    completed: ['✅', 'No completed activity', 'Completed orders, services and Transport & Parcel Delivery bookings will be stored here for your history.'],
    cancelled: ['⊘', 'No cancelled activity', 'Any cancelled order, service request or Transport & Parcel Delivery booking will appear here with its reason and date.']
  };
  activityFilterButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      activityFilterButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      customerActivityFilter = button.dataset.activityFilter;
      const message = activityEmptyMessages[customerActivityFilter] || activityEmptyMessages.all;
      activityEmptyIcon.textContent = message[0];
      activityEmptyTitle.textContent = message[1];
      activityEmptyText.textContent = message[2];
      renderCustomerMarketplaceOrders();
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

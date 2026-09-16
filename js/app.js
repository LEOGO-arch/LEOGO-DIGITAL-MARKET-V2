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

  const checkoutCounty = document.getElementById('checkoutCounty');
  const checkoutSubCounty = document.getElementById('checkoutSubCounty');
  const checkoutDeliveryZone = document.getElementById('checkoutDeliveryZone');
  const checkoutShell = customerShellModal?.querySelector('.checkout-shell');
  const checkoutServiceRate = document.getElementById('checkoutServiceRate');
  const checkoutServiceFeeValue = document.getElementById('checkoutServiceFeeValue');
  const checkoutDeliveryFeeValue = document.getElementById('checkoutDeliveryFeeValue');
  const checkoutGrandTotalValue = document.getElementById('checkoutGrandTotalValue');
  const checkoutPinLocation = document.getElementById('checkoutPinLocation');
  const checkoutPinStatus = document.getElementById('checkoutPinStatus');
  const checkoutCoordinates = document.getElementById('checkoutCoordinates');

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

  const updateCheckoutFees = () => {
    const subtotal = Number(checkoutShell?.dataset.checkoutSubtotal || 0);
    const serviceRate = subtotal >= 3000 ? 0.015 : 0.02;
    const serviceFee = subtotal * serviceRate;
    const deliveryRules = {
      cbd: { amount: 50, label: 'KSh 50' },
      estate: { amount: 80, label: 'KSh 80' },
      outside: { amount: 200, label: 'From KSh 200' },
      quote: { amount: null, label: 'Admin quote' }
    };
    const delivery = deliveryRules[checkoutDeliveryZone?.value];
    if (checkoutServiceRate) checkoutServiceRate.textContent = '(' + (serviceRate * 100) + '%)';
    if (checkoutServiceFeeValue) checkoutServiceFeeValue.textContent = 'KSh ' + Math.round(serviceFee).toLocaleString();
    if (checkoutDeliveryFeeValue) checkoutDeliveryFeeValue.textContent = delivery?.label || 'Select zone';
    if (checkoutGrandTotalValue) {
      checkoutGrandTotalValue.textContent = delivery?.amount === null
        ? 'Pending quote'
        : 'KSh ' + Math.round(subtotal + serviceFee + (delivery?.amount || 0)).toLocaleString();
    }
  };
  checkoutDeliveryZone?.addEventListener('change', updateCheckoutFees);
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
  let selectedCheckoutPayment = '';
  let previewOrderReference = '';

  const checkoutTotalText = () => checkoutGrandTotalValue?.textContent || 'KSh 0';
  const checkoutSubtotal = () => Number(checkoutShell?.dataset.checkoutSubtotal || 0);
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
  const requiredCheckoutFields = [
    document.getElementById('checkoutReceiverName'),
    document.getElementById('checkoutContactNumber'),
    checkoutCounty,
    checkoutSubCounty,
    document.getElementById('checkoutEstate'),
    document.getElementById('checkoutLandmark'),
    checkoutDeliveryZone
  ];
  const updateCheckoutReadiness = () => {
    const detailsComplete = requiredCheckoutFields.every((field) => field && field.value.trim() !== '');
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
          ? 'Complete receiver name, phone, County, Sub-County, Estate, landmark and delivery zone.'
          : 'Add an item to the cart and complete all required delivery details.';
    }
  };
  requiredCheckoutFields.forEach((field) => {
    field?.addEventListener('input', updateCheckoutReadiness);
    field?.addEventListener('change', updateCheckoutReadiness);
  });

  continueToPayment?.addEventListener('click', () => {
    if (!testCart.length) {
      openCustomerShell('cart');
      return;
    }
    showCheckoutStep('payment');
  });
  backToCheckoutDetails?.addEventListener('click', () => showCheckoutStep('details'));

  paymentMethodButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') {
        paymentStepStatus.textContent = 'Cash on Delivery is only available for orders below KSh 10,000.';
        return;
      }
      selectedCheckoutPayment = button.dataset.paymentMethod;
      paymentMethodButtons.forEach((item) => item.classList.toggle('active', item === button));
      const labels = { till: 'M-Pesa Till', paybill: 'M-Pesa Paybill', cod: 'Cash on Delivery', lipapolepole: 'Lipa Pole Pole' };
      selectedPaymentLabel.textContent = labels[selectedCheckoutPayment];
      selectedPaymentStatus.textContent = 'Waiting for confirmation';
      paymentStepStatus.textContent = '';
      const isLipaPolePole = selectedCheckoutPayment === 'lipapolepole';
      if (lppDepositForm) lppDepositForm.hidden = !isLipaPolePole;
      if (standardPaymentProof) standardPaymentProof.hidden = isLipaPolePole;
      if (standardPaymentActions) standardPaymentActions.hidden = isLipaPolePole;
      if (isLipaPolePole) {
        openLppDepositForm();
      } else if (selectedCheckoutPayment === 'cod') {
        paymentProofLabel.textContent = 'Paste M-Pesa message for the transport fee';
        markPaymentPaidLabel.textContent = 'I confirm that I paid the transport fee first. I will pay the order balance in cash on delivery.';
      } else {
        paymentProofLabel.textContent = 'Paste M-Pesa payment message';
        markPaymentPaidLabel.textContent = 'I confirm that I prepaid this order and want to mark the payment as paid.';
      }
    });
  });

  makeCheckoutOrder?.addEventListener('click', () => {
    paymentStepStatus.textContent = '';
    if (!testCart.length) {
      paymentStepStatus.textContent = 'Your cart is empty. Add a sample product before making an order.';
      return;
    }
    if (!selectedCheckoutPayment) {
      paymentStepStatus.textContent = 'Select a payment method before making the order.';
      return;
    }
    if (!mpesaPaymentMessage.value.trim()) {
      paymentStepStatus.textContent = selectedCheckoutPayment === 'cod'
        ? 'Paste the M-Pesa confirmation for the transport fee.'
        : 'Paste the complete M-Pesa payment confirmation message.';
      mpesaPaymentMessage.focus();
      return;
    }
    if (!markPaymentPaid.checked) {
      paymentStepStatus.textContent = 'Tick the payment confirmation box before making the order.';
      markPaymentPaid.focus();
      return;
    }
    previewOrderReference = 'LEOGO-' + Date.now().toString().slice(-8);
    createdOrderReference.textContent = previewOrderReference;
    selectedPaymentStatus.textContent = selectedCheckoutPayment === 'cod' ? 'Transport paid — balance on delivery' : 'Marked paid — awaiting verification';
    orderCreatedPanel.hidden = false;
    paymentStepStatus.textContent = 'Order created in this visual preview.';
    orderCreatedPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const deliveryAddress = [
      checkoutCounty?.value,
      checkoutSubCounty?.value,
      document.getElementById('checkoutEstate')?.value,
      document.getElementById('checkoutLandmark')?.value
    ].filter(Boolean).join(', ') || 'Not provided';
    const subtotal = testCartSubtotal();
    const serviceRate = subtotal >= 3000 ? 0.015 : 0.02;
    const serviceFee = Math.round(subtotal * serviceRate);
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
    const mapMarkup = locationLink
      ? '<a class="map-link" href="' + receiptEscape(locationLink) + '">Open pinned delivery location</a>'
      : '<span class="muted">No location link supplied</span>';

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
      <div class="box"><h3>Delivery Address</h3><p>${receiptEscape(deliveryAddress)}</p><p>${mapMarkup}</p></div>
    </div>
    <table>
      <thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Total</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
      <div><span>Items subtotal</span><strong>${receiptEscape(money(subtotal))}</strong></div>
      <div><span>Service fee (${serviceRate * 100}%)</span><strong>${receiptEscape(money(serviceFee))}</strong></div>
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
      'Delivery fee: ' + (checkoutDeliveryFeeValue?.textContent || 'Not selected'),
      '*Grand total: ' + checkoutTotalText() + '*',
      '',
      '💳 *PAYMENT*',
      'Method: ' + selectedPaymentLabel.textContent,
      'Status: ' + selectedPaymentStatus.textContent,
      '',
      '📍 *DELIVERY LOCATION*',
      'County: ' + county,
      'Sub-County: ' + subCounty,
      'Estate / Area: ' + estate,
      'Nearest landmark: ' + landmark,
      'Map link: ' + locationLink,
      '',
      'Please review and confirm this order.',
      '_LEOGO — Everything You Need. Delivered._'
    ].join('\n');
    window.open('https://wa.me/254700192545?text=' + encodeURIComponent(message), '_blank', 'noopener');
  });

  const testCartStorageKey = 'leogo_phase1_test_cart';
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

  const sampleSellerDeposits = { 'samsung-smartphone': 5000, 'modern-office-chair': 2000, 'two-in-one-blender': 1000 };
  const sampleSellerPeriods = { 'samsung-smartphone': 90, 'modern-office-chair': 60, 'two-in-one-blender': 30 };
  testCart = testCart.map((item) => ({
    ...item,
    deposit: Number(item.deposit || sampleSellerDeposits[item.id] || 0),
    lppDays: Number(item.lppDays || sampleSellerPeriods[item.id] || 0)
  }));
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

  document.querySelectorAll('[data-test-add-cart]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.productId;
      const existing = testCart.find((item) => item.id === id);
      if (existing) existing.quantity += 1;
      else testCart.push({
        id,
        name: button.dataset.productName,
        price: Number(button.dataset.productPrice),
        deposit: Number(button.dataset.productDeposit || 0),
        lppDays: Number(button.dataset.productLppDays || 0),
        icon: button.dataset.productIcon,
        quantity: 1
      });
      saveTestCart();
      renderTestCart();
      if (testCartFeedback) testCartFeedback.textContent = button.dataset.productName + ' added to cart. Cart now has ' + testCartCount() + ' item(s).';
      button.textContent = '✓ Added';
      window.setTimeout(() => { button.textContent = '＋ Cart'; }, 1000);
    });
  });

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
        <div class="lpp-plan-head"><div><span>${receiptEscape(plan.orderRef)}</span><h4>${receiptEscape(plan.itemName)}</h4><small>Seller-set deposit: ${receiptEscape(money(plan.depositRequired))}</small></div><b class="lpp-status">${balance <= 0 ? 'PAID IN FULL' : (lppDaysRemaining(plan.deadline) < 0 ? 'PAYMENT OVERDUE' : (pending > 0 ? 'PENDING CONFIRMATION' : 'ACTIVE'))}</b></div>
        <div class="lpp-plan-terms"><div><span>Maximum Period</span><strong>${receiptEscape(plan.maxDays)} days</strong></div><div><span>Payment Deadline</span><strong>${receiptEscape(formatLppDate(plan.deadline))}</strong></div><div><span>Time Remaining</span><strong>${balance <= 0 ? 'Completed' : (lppDaysRemaining(plan.deadline) >= 0 ? lppDaysRemaining(plan.deadline) + ' days' : Math.abs(lppDaysRemaining(plan.deadline)) + ' days overdue')}</strong></div></div>
        <div class="lpp-plan-money"><div><span>Total Amount</span><strong>${money(plan.total)}</strong></div><div><span>Deposit Paid</span><strong>${money(paid)}</strong></div><div><span>Total Paid</span><strong>${money(paid)}</strong></div><div><span>Total Balance</span><strong>${money(balance)}</strong></div></div>
        <div class="lpp-progress"><i style="width:${progress}%"></i></div>
        ${pending > 0 ? '<p class="lpp-pending-note">⏳ ' + money(pending) + ' submitted and waiting for Admin/Staff confirmation. Pending payments do not reduce the balance.</p>' : ''}
        <p class="lpp-collection-lock ${lppDaysRemaining(plan.deadline) < 0 && balance > 0 ? 'lpp-deadline-warning' : ''}">${balance <= 0 ? '✓ Full payment completed. Item collection can be released after final confirmation.' : (lppDaysRemaining(plan.deadline) < 0 ? '⚠ Deadline missed: subject to a 25% refund deduction or a 5% charge on the total payable amount.' : '🔒 Item collection remains locked until the full amount is paid and confirmed.')}</p>
        <div class="lpp-plan-actions"><button type="button" data-lpp-pay="${receiptEscape(plan.id)}" ${balance <= 0 ? 'disabled' : ''}>Do Payment</button></div>
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
    const button = event.target.closest('[data-lpp-pay]');
    if (!button) return;
    const form = lppAccountList.querySelector('[data-lpp-topup-form="' + button.dataset.lppPay + '"]');
    if (form) form.hidden = !form.hidden;
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
  renderLppAccounts();

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

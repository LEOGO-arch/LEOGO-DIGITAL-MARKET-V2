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
  const sellingItemImage = document.getElementById('sellingItemImage');
  const sellingItemImageName = document.getElementById('sellingItemImageName');
  const sellingProof = document.getElementById('sellingProof');
  const ownershipFileName = document.getElementById('ownershipFileName');
  const sellingFormStatus = document.getElementById('sellingFormStatus');

  const safeUploadExtension = (file, fallback = 'jpg') => {
    const name = String(file?.name || '');
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'') : '';
    return ext || fallback;
  };

  const personalSaleEligibility = async () => {
    const client = window.leogoAuth?.client;
    const user = window.leogoAuth?.getUser?.();
    if (!client || !user) return { authenticated:false, eligible:true, is_seller:false };
    const { data, error } = await client.rpc('customer_personal_sale_eligibility');
    if (error) throw error;
    return data || { authenticated:true, eligible:true, is_seller:false };
  };

  const refreshPersonalSaleEligibility = async () => {
    if (!openSellingForm) return;
    try {
      const eligibility = await personalSaleEligibility();
      openSellingForm.hidden = Boolean(eligibility?.is_seller);
      openSellingForm.dataset.sellerRestricted = eligibility?.is_seller ? 'true' : 'false';
    } catch (error) {
      console.warn('Personal sale eligibility check failed:', error);
      openSellingForm.hidden = false;
    }
  };

  const closeSellingModal = () => {
    if (!sellingModal) return;
    sellingModal.classList.remove('is-open');
    sellingModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('selling-modal-open');
    openSellingForm?.focus();
  };

  const showSellingModal = async () => {
    if (!sellingModal) return;

    if (window.leogoAuth?.isAuthenticated?.()) {
      try {
        const eligibility = await personalSaleEligibility();
        if (!eligibility?.eligible) {
          sellingFormStatus.textContent = eligibility?.reason || 'Registered Sellers must use the LEOGO Partner Portal.';
          return;
        }
      } catch (error) {
        console.warn('Could not verify personal-sale eligibility:', error);
      }
    }

    const user = window.leogoAuth?.getUser?.();
    const fullName = user?.user_metadata?.full_name || '';
    const phone = user?.user_metadata?.phone || '';
    const nameField = document.getElementById('sellingName');
    const phoneField = document.getElementById('sellingPhone');
    if (nameField && !nameField.value && fullName) nameField.value = fullName;
    if (phoneField && !phoneField.value && phone) phoneField.value = phone;

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

  sellingItemImage?.addEventListener('change', () => {
    sellingItemImageName.textContent = sellingItemImage.files?.[0]?.name || 'No item picture selected';
  });
  sellingProof?.addEventListener('change', () => {
    ownershipFileName.textContent = sellingProof.files?.[0]?.name || 'No document selected';
  });

  sellingForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!sellingForm.reportValidity()) return;

    const client = window.leogoAuth?.client;
    const user = window.leogoAuth?.getUser?.();
    if (!client || !user) {
      sellingFormStatus.textContent = 'Please log in before submitting your item.';
      window.leogoAuth?.requireLogin?.('Please log in before submitting an item for sale.');
      return;
    }

    const submitButton = sellingForm.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent || 'Submit for Approval';
    const uploaded = [];

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Checking account…';
      }
      sellingFormStatus.textContent = 'Checking that this is a non-Seller customer account…';

      const eligibility = await personalSaleEligibility();
      if (!eligibility?.eligible) {
        throw new Error(eligibility?.reason || 'Registered Sellers must use the LEOGO Partner Portal.');
      }

      const itemFile = sellingItemImage?.files?.[0];
      const proofFile = sellingProof?.files?.[0] || null;
      if (!itemFile) throw new Error('Add a clear picture of the item you are selling.');
      if (!['image/jpeg','image/png','image/webp'].includes(itemFile.type)) {
        throw new Error('Item picture must be JPG, PNG or WebP.');
      }

      if (submitButton) submitButton.textContent = 'Uploading item…';
      sellingFormStatus.textContent = 'Uploading your item picture securely…';

      const itemPath = user.id+'/'+crypto.randomUUID()+'.'+safeUploadExtension(itemFile);
      const itemUpload = await client.storage.from('customer-sale-media').upload(itemPath,itemFile,{upsert:false,contentType:itemFile.type});
      if (itemUpload.error) throw itemUpload.error;
      uploaded.push({bucket:'customer-sale-media',path:itemPath});

      let proofPath = null;
      if (proofFile) {
        if (submitButton) submitButton.textContent = 'Uploading proof…';
        proofPath = user.id+'/'+crypto.randomUUID()+'.'+safeUploadExtension(proofFile, proofFile.type === 'application/pdf' ? 'pdf' : 'jpg');
        const proofUpload = await client.storage.from('customer-sale-verification').upload(proofPath,proofFile,{upsert:false,contentType:proofFile.type});
        if (proofUpload.error) throw proofUpload.error;
        uploaded.push({bucket:'customer-sale-verification',path:proofPath});
      }

      if (submitButton) submitButton.textContent = 'Sending to Admin…';
      sellingFormStatus.textContent = 'Sending your personal item to LEOGO Admin for approval…';

      const { data, error } = await client.rpc('customer_submit_personal_sale',{
        p_seller_name: document.getElementById('sellingName').value.trim(),
        p_id_number: document.getElementById('sellingIdNumber').value.trim(),
        p_phone: document.getElementById('sellingPhone').value.trim(),
        p_location: document.getElementById('sellingLocation').value.trim(),
        p_item_name: document.getElementById('sellingItem').value.trim(),
        p_marked_price_kes: Number(document.getElementById('sellingPrice').value),
        p_item_image_path: itemPath,
        p_ownership_proof_path: proofPath
      });
      if (error) throw error;

      sellingFormStatus.textContent = '✓ Submitted successfully. LEOGO Admin must approve the item before it appears publicly.';
      sellingForm.reset();
      sellingItemImageName.textContent = 'No item picture selected';
      ownershipFileName.textContent = 'No document selected';

      window.setTimeout(() => closeSellingModal(), 1600);
    } catch (error) {
      for (const file of uploaded) {
        try { await client.storage.from(file.bucket).remove([file.path]); } catch (_) {}
      }
      sellingFormStatus.textContent = error?.message || 'Your item could not be submitted. Please try again.';
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });

  document.addEventListener('leogo:authchange', refreshPersonalSaleEligibility);
  window.setTimeout(refreshPersonalSaleEligibility, 700);

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

  const customerCareAgentName=document.getElementById('customerCareAgentName');
  const customerCareAgentStatus=document.getElementById('customerCareAgentStatus');
  const customerCareAssignment=document.getElementById('customerCareAssignment');
  const customerCareMessageList=document.getElementById('customerCareMessageList');
  const customerCareChatForm=document.getElementById('customerCareChatForm');
  const customerCareMessage=document.getElementById('customerCareMessage');
  const customerCareChatStatus=document.getElementById('customerCareChatStatus');
  const refreshCustomerCareChat=document.getElementById('refreshCustomerCareChat');
  const mobileChatUnread=document.getElementById('mobileChatUnread');

  let customerCareThread=null;
  let customerCareMessages=[];
  let customerCarePollTimer=null;
  let customerCareLoading=false;

  const customerChatFormatTime=(value)=>{
    if(!value) return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-KE',{
      day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',
      timeZone:'Africa/Nairobi'
    }).format(date);
  };

  const renderCustomerCareChat=()=>{
    if(customerCareAgentName){
      customerCareAgentName.textContent=customerCareThread?.assigned_staff_name||'LEOGO Customer Care';
    }
    if(customerCareAgentStatus){
      customerCareAgentStatus.textContent=customerCareThread?.assigned_staff_name
        ? (customerCareThread.status==='closed'?'Conversation closed':'Assigned Customer Care Officer')
        : 'Waiting for Customer Care assignment';
    }
    if(customerCareAssignment){
      if(customerCareThread?.assigned_staff_name){
        customerCareAssignment.innerHTML='✓ <strong>'+receiptEscape(customerCareThread.assigned_staff_name)+'</strong> is assigned to this private conversation.';
      }else{
        customerCareAssignment.innerHTML='⏳ Your message is in the <strong>LEOGO Customer Care queue</strong>. An available Customer Support Officer will be assigned here.';
      }
    }
    if(mobileChatUnread){
      const unread=Number(customerCareThread?.unread_count||0);
      mobileChatUnread.textContent=String(unread);
      mobileChatUnread.hidden=unread<1;
    }
    if(!customerCareMessageList) return;
    if(!customerCareMessages.length){
      customerCareMessageList.innerHTML='<div class="customer-care-chat-empty"><span>💬</span><strong>Start a conversation</strong><p>Send a message and LEOGO Customer Care will respond here.</p></div>';
      return;
    }
    customerCareMessageList.innerHTML=customerCareMessages.map((message)=>{
      const mine=message.sender_role==='customer';
      return '<article class="customer-care-message '+(mine?'customer':'staff')+'">'+
        '<div class="customer-care-message-meta"><strong>'+(mine?'You':'LEOGO Customer Care')+'</strong><span>'+receiptEscape(customerChatFormatTime(message.created_at))+'</span></div>'+
        '<p>'+receiptEscape(message.body).replace(/\n/g,'<br>')+'</p>'+
      '</article>';
    }).join('');
  };

  async function loadCustomerSupportChat({scroll=true,silent=false}={}){
    if(customerCareLoading) return;
    if(!window.leogoAuth?.isAuthenticated?.()) return;
    const client=window.leogoAuth?.client;
    if(!client) return;
    customerCareLoading=true;
    if(!silent&&customerCareChatStatus) customerCareChatStatus.textContent='Connecting to LEOGO Customer Care…';
    try{
      const [threadResult,messageResult]=await Promise.all([
        client.rpc('customer_open_support_chat'),
        client.rpc('customer_list_support_messages')
      ]);
      if(threadResult.error) throw threadResult.error;
      if(messageResult.error) throw messageResult.error;
      customerCareThread=threadResult.data||null;
      customerCareMessages=Array.isArray(messageResult.data)?messageResult.data:[];
      renderCustomerCareChat();
      await client.rpc('customer_mark_support_chat_read');
      if(customerCareThread){
        customerCareThread.unread_count=0;
        renderCustomerCareChat();
      }
      if(customerCareChatStatus) customerCareChatStatus.textContent='';
      if(scroll&&customerCareMessageList){
        window.setTimeout(()=>{customerCareMessageList.scrollTop=customerCareMessageList.scrollHeight;},20);
      }
    }catch(error){
      if(customerCareChatStatus) customerCareChatStatus.textContent=error?.message||'Customer Care chat could not load.';
    }finally{
      customerCareLoading=false;
    }
  }

  const stopCustomerCarePolling=()=>{
    if(customerCarePollTimer){
      window.clearInterval(customerCarePollTimer);
      customerCarePollTimer=null;
    }
  };

  const startCustomerCarePolling=()=>{
    stopCustomerCarePolling();
    customerCarePollTimer=window.setInterval(()=>{
      const chatOpen=customerShellModal?.classList.contains('is-open')
        && customerShellModal?.querySelector('[data-customer-panel="chat"]')?.classList.contains('active');
      if(chatOpen&&document.visibilityState==='visible') loadCustomerSupportChat({scroll:false,silent:true});
    },4500);
  };

  customerCareChatForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const text=customerCareMessage?.value.trim()||'';
    if(!text) return;
    const client=window.leogoAuth?.client;
    if(!client||!window.leogoAuth?.isAuthenticated?.()){
      window.leogoAuth?.requireLogin?.('Please log in to chat with LEOGO Customer Care.');
      return;
    }
    const button=document.getElementById('sendCustomerCareMessage');
    const original=button?.textContent||'Send';
    if(button){button.disabled=true;button.textContent='Sending…';}
    if(customerCareChatStatus) customerCareChatStatus.textContent='';
    try{
      const {data,error}=await client.rpc('customer_send_support_message',{p_body:text});
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      if(customerCareMessage) customerCareMessage.value='';
      await loadCustomerSupportChat({scroll:true,silent:true});
    }catch(error){
      if(customerCareChatStatus) customerCareChatStatus.textContent=error?.message||'Message could not be sent.';
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
      customerCareMessage?.focus();
    }
  });

  refreshCustomerCareChat?.addEventListener('click',()=>loadCustomerSupportChat({scroll:true}));

  const refreshCustomerCareSummary=async()=>{
    if(!window.leogoAuth?.isAuthenticated?.()){
      customerCareThread=null;
      if(mobileChatUnread){mobileChatUnread.textContent='0';mobileChatUnread.hidden=true;}
      return;
    }
    const client=window.leogoAuth?.client;
    if(!client) return;
    const {data,error}=await client.rpc('customer_support_chat_summary');
    if(error) return;
    if(!data?.exists){
      if(mobileChatUnread){mobileChatUnread.textContent='0';mobileChatUnread.hidden=true;}
      return;
    }
    customerCareThread={...(customerCareThread||{}),...data};
    if(mobileChatUnread){
      const unread=Number(data.unread_count||0);
      mobileChatUnread.textContent=String(unread);
      mobileChatUnread.hidden=unread<1;
    }
  };

  document.addEventListener('leogo:authchange',()=>window.setTimeout(refreshCustomerCareSummary,80));
  document.addEventListener('leogo:customer-data-refresh',()=>window.setTimeout(refreshCustomerCareSummary,80));
  window.addEventListener('focus',()=>refreshCustomerCareSummary());
  window.setTimeout(refreshCustomerCareSummary,700);

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
    stopCustomerCarePolling();
  };

  const protectedCustomerViews = new Set(['dashboard', 'orders', 'chat', 'aftersales', 'wallet', 'lipapolepole', 'accommodation', 'addresses', 'lookingrequests', 'premiumaccess', 'account']);
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
    if(viewName==='chat'&&window.leogoAuth?.isAuthenticated?.()){
      loadCustomerSupportChat({scroll:true});
      startCustomerCarePolling();
    }else{
      stopCustomerCarePolling();
    }
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
        p_items: testCart.map(item => ({ product_id: item.productId, variant_id: item.variantId || null, quantity: item.quantity })),
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
  const personalSalesSeeMore = document.getElementById('personalSalesSeeMore');

  let marketplaceProducts = [];
  let marketplaceCategories = [];
  let personalSaleListings = [];
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

  const personalSaleMediaUrl = (path) => {
    const client = window.leogoAuth?.client;
    if (!client || !path) return '';
    return client.storage.from('customer-sale-media').getPublicUrl(String(path)).data?.publicUrl || '';
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

      if (category.code !== 'alcoholic_leogo_bar') card.href = '#live-product-catalogue';
    });
  };

  const productRatingStars = (rating) => {
    const rounded=Math.max(0,Math.min(5,Math.round(Number(rating||0))));
    return '★'.repeat(rounded)+'☆'.repeat(5-rounded);
  };

  const publicProductReviewsHtml = (product) => {
    const reviews=Array.isArray(product.approved_reviews)?product.approved_reviews:[];
    if(!reviews.length) return '<div class="live-product-reviews"><p>No approved reviews yet.</p></div>';
    return '<div class="live-product-reviews">'+
      reviews.map((review)=>'<article><div><strong>'+productRatingStars(review.rating)+'</strong><span>'+Number(review.rating)+'/5</span></div>'+
        (review.variant_name?'<small>Variant: '+receiptEscape(review.variant_name)+'</small>':'')+
        (review.comment?'<p>'+receiptEscape(review.comment)+'</p>':'<p>Rating only.</p>')+
        '<footer><b>✓ Verified Purchase</b><span>'+receiptEscape(customerOrderFormatDate(review.created_at,false))+'</span></footer></article>').join('')+
      '</div>';
  };

  const renderSellerProductCard = (product) => {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const activeVariants = variants.filter((variant) => variant.is_active !== false);
    const hasVariants = Boolean(product.has_variants && activeVariants.length);
    const variantStock = activeVariants.reduce((sum, variant) => sum + Number(variant.quantity_available || 0), 0);
    const available = product.availability_status === 'available'
      && (hasVariants ? variantStock > 0 : Number(product.quantity_available || 0) > 0);
    const imageUrl = sellerProductMediaUrl(product.main_image_path);
    const galleryPaths=Array.isArray(product.gallery_image_paths)?product.gallery_image_paths.filter(Boolean):[];
    const galleryImages=[product.main_image_path,...galleryPaths]
      .filter(Boolean)
      .filter((path,index,rows)=>rows.indexOf(path)===index)
      .map((path)=>({path,url:sellerProductMediaUrl(path)}))
      .filter((image)=>image.url);
    const galleryMarkup=galleryImages.length>1
      ? '<div class="live-product-detail-section live-product-gallery-section">'+
          '<div class="live-product-detail-label">Product Gallery</div>'+
          '<div class="live-product-gallery">'+
            galleryImages.map((image,index)=>'<button type="button" class="live-product-gallery-thumb '+(index===0?'active':'')+'" data-product-gallery-image="'+receiptEscape(image.url)+'" aria-label="View product photo '+(index+1)+'">'+
              '<img src="'+receiptEscape(image.url)+'" alt="'+receiptEscape(product.product_name)+' photo '+(index+1)+'">'+
            '</button>').join('')+
          '</div>'+
        '</div>'
      : '';
    const reviewCount=Number(product.review_count||0);
    const rating=Number(product.rating_average||0);

    const variantMarkup = hasVariants
      ? '<div class="live-product-variant-picker"><small>Choose variant</small><div class="live-product-variants">'+activeVariants.map((variant) => {
          const variantAvailable = Number(variant.quantity_available || 0) > 0;
          const variantImage = sellerProductMediaUrl(variant.image_path);
          return '<button type="button" class="live-product-variant-option" data-product-variant="'+receiptEscape(variant.id)+'" data-product-id="'+receiptEscape(product.id)+'" data-variant-name="'+receiptEscape(variant.variant_name)+'" data-variant-price="'+Number(variant.price_kes || 0)+'" data-variant-stock="'+Number(variant.quantity_available || 0)+'" data-variant-image="'+receiptEscape(variantImage)+'" '+(variantAvailable?'':'disabled')+'>'+
            (variantImage?'<img src="'+receiptEscape(variantImage)+'" alt="">':'')+
            '<span><b>'+receiptEscape(variant.variant_name)+'</b><small>'+money(variant.price_kes)+' · Qty '+Number(variant.quantity_available || 0)+'</small></span>'+
          '</button>';
        }).join('')+'</div><p class="live-variant-selection-note" data-variant-selection-note>Select one variant before adding to cart.</p></div>'
      : '';

    return '<article class="live-product-card live-product-card-compact" data-live-product-card="'+receiptEscape(product.id)+'" data-has-variants="'+(hasVariants?'true':'false')+'">'+
      '<div class="live-product-image" data-live-product-image>'+
        (imageUrl
          ? '<img src="'+receiptEscape(imageUrl)+'" alt="'+receiptEscape(product.product_name)+'">'
          : '<span>'+categoryIcon(product.category_code)+'</span>')+
      '</div>'+
      '<div class="live-product-body">'+
        '<h3>'+receiptEscape(product.product_name)+'</h3>'+
        '<div class="live-product-compact-price"><strong data-live-product-price>'+money(product.price_kes)+'</strong></div>'+
        '<div class="live-product-rating live-product-rating-compact"><strong>'+productRatingStars(rating)+'</strong><span>'+rating.toFixed(1)+(reviewCount?' · '+reviewCount+' review'+(reviewCount===1?'':'s'):'')+'</span></div>'+
        '<div class="live-product-primary-actions">'+
          '<button type="button" class="live-product-cart-start" data-live-cart-start data-product-id="'+receiptEscape(product.id)+'" '+(available?'':'disabled')+'>'+
            (available?'Add to Cart':'Out of Stock')+
          '</button>'+
          '<button type="button" class="live-product-details-toggle" data-product-details-toggle aria-expanded="false">View Details</button>'+
        '</div>'+
        (hasVariants
          ? '<div class="live-product-variant-panel" data-product-variant-panel hidden>'+
              variantMarkup+
              '<button type="button" class="live-product-add-cart" data-live-add-cart data-product-id="'+receiptEscape(product.id)+'" disabled>Add Selected Variant</button>'+
            '</div>'
          : '')+
        '<div class="live-product-details" data-product-details hidden>'+
          '<div class="live-product-details-head"><span>'+receiptEscape(categoryDisplayName(product.category_name || product.category_code || 'Marketplace'))+
            (product.subcategory_name ? ' · '+receiptEscape(product.subcategory_name) : '')+'</span>'+
            '<small>Seller: '+receiptEscape(product.seller_name || 'LEOGO Seller')+'</small></div>'+
          '<div class="live-product-detail-stock"><small>Availability</small><strong data-live-product-stock>Qty '+Number(hasVariants?variantStock:product.quantity_available || 0)+' '+receiptEscape(product.measurement_unit || 'item')+'</strong></div>'+
          galleryMarkup+
          (product.product_details?'<div class="live-product-detail-section"><div class="live-product-detail-label">Description</div><p class="live-product-description">'+receiptEscape(String(product.product_details || ''))+'</p></div>':'')+
          (reviewCount
            ? '<div class="live-product-detail-section live-product-review-section"><div class="live-product-detail-label">Reviews & Ratings ('+reviewCount+')</div>'+publicProductReviewsHtml(product)+'</div>'
            : '<div class="live-product-detail-section live-product-no-reviews"><span>No approved reviews yet.</span></div>')+
        '</div>'+
      '</div>'+
    '</article>';
  };
  const renderPersonalSaleCard = (listing) => {
    const imageUrl = personalSaleMediaUrl(listing.item_image_path);
    return '<article class="live-product-card personal-sale-market-card" data-personal-sale-card="'+receiptEscape(listing.id)+'">'+
      '<div class="live-product-image">'+
        (imageUrl ? '<img src="'+receiptEscape(imageUrl)+'" alt="'+receiptEscape(listing.item_name)+'">' : '<span>🏷️</span>')+
      '</div>'+
      '<div class="live-product-body">'+
        '<div class="live-product-category">PERSONAL MARKETPLACE LISTING</div>'+
        '<h3>'+receiptEscape(listing.public_title || ((listing.public_name || 'Customer')+' is Selling '+listing.item_name))+'</h3>'+
        '<p class="live-product-seller">Admin-approved one-off customer sale</p>'+
        '<div class="live-product-price-row"><strong>'+money(listing.marked_price_kes)+'</strong><span>1 item</span></div>'+
        '<p class="live-product-description">This is a personal item listing from a LEOGO customer, not a registered Seller business.</p>'+
        '<div class="personal-sale-public-badge">✓ Approved by LEOGO Admin</div>'+
        '<button type="button" class="personal-interest-button" data-personal-interest="'+receiptEscape(listing.id)+'">♥ I’m Interested</button>'+
      '</div>'+
    '</article>';
  };

  const renderLiveCatalogue = () => {
    if (!liveProductGrid || !liveCatalogueStatus) return;

    const category = marketplaceCategories.find((item) => item.code === selectedMarketplaceCategory);
    const allProducts = selectedMarketplaceCategory === 'all' || selectedMarketplaceCategory === 'marketplace';
    const sellerProducts = filteredMarketplaceProducts();

    if (liveCatalogueTitle) {
      liveCatalogueTitle.textContent = allProducts
        ? 'LEOGO Marketplace'
        : categoryDisplayName(category?.name || selectedMarketplaceCategory.replaceAll('_',' '));
    }
    if (liveCatalogueSubtitle) {
      liveCatalogueSubtitle.textContent = allProducts
        ? 'All Admin-approved Seller products and approved personal customer listings available on LEOGO.'
        : 'Admin-approved Seller products in '+categoryDisplayName(category?.name || selectedMarketplaceCategory.replaceAll('_',' '))+'.';
    }

    const combined = allProducts
      ? [
          ...sellerProducts.map((item) => ({ type:'seller', item })),
          ...personalSaleListings.map((item) => ({ type:'personal', item }))
        ].sort(() => Math.random() - 0.5)
      : sellerProducts.map((item) => ({ type:'seller', item }));

    if (!combined.length) {
      liveCatalogueStatus.textContent = allProducts
        ? 'No approved products or personal listings are available yet.'
        : 'No approved Seller products are available in this category yet.';
      liveProductGrid.innerHTML = '<div class="customer-empty-state live-catalogue-empty"><span>'+categoryIcon(selectedMarketplaceCategory)+'</span><h4>No approved listings yet</h4><p>Listings appear here only after LEOGO Admin approves them.</p></div>';
      return;
    }

    liveCatalogueStatus.textContent = combined.length+' approved listing'+(combined.length === 1 ? '' : 's')+' found.';
    liveProductGrid.innerHTML = combined.map((entry) =>
      entry.type === 'personal' ? renderPersonalSaleCard(entry.item) : renderSellerProductCard(entry.item)
    ).join('');
  };

  const renderMarketplacePreview = () => {
    if (!sellerMarketplaceList) return;
    const preview = personalSaleListings.slice(0, 8);

    sellerMarketplaceList.innerHTML = preview.length ? preview.map((listing) => {
      const imageUrl = personalSaleMediaUrl(listing.item_image_path);
      return '<div class="clip-row personal-sale-preview-row">'+
        '<span class="personal-sale-preview-image">'+
          (imageUrl ? '<img src="'+receiptEscape(imageUrl)+'" alt="'+receiptEscape(listing.item_name)+'">' : '🏷️')+
        '</span>'+
        '<div><b>'+receiptEscape(listing.public_title || ((listing.public_name || 'Customer')+' is Selling '+listing.item_name))+'</b>'+
          '<small>Personal item · Admin approved</small></div>'+
        '<span class="clip-price">'+money(listing.marked_price_kes)+'</span>'+
        '<button type="button" class="personal-interest-mini" data-personal-interest="'+receiptEscape(listing.id)+'">Interested</button>'+
      '</div>';
    }).join('')
      : '<div class="customer-empty-state compact"><span>🏷️</span><h4>No approved personal items yet</h4><p>Customer one-off items will appear here after Admin approval.</p></div>';
  };

  const loadMarketplaceProducts = async () => {
    const client = window.leogoAuth?.client;
    if (!client) return;

    if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Loading approved marketplace listings…';

    const [categoryResult,productResult,personalSaleResult] = await Promise.all([
      client.rpc('customer_product_categories'),
      client.rpc('customer_marketplace_catalogue'),
      client.rpc('customer_public_personal_sales')
    ]);

    if (categoryResult.error) {
      if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Product categories could not load: '+categoryResult.error.message;
    } else {
      marketplaceCategories = Array.isArray(categoryResult.data) ? categoryResult.data : [];
      syncCustomerCategoryCards();
    }

    if (productResult.error) {
      if (liveCatalogueStatus) liveCatalogueStatus.textContent = 'Seller products could not load: '+productResult.error.message;
      marketplaceProducts = [];
    } else {
      marketplaceProducts = Array.isArray(productResult.data) ? productResult.data : [];
    }

    if (personalSaleResult.error) {
      if (sellerMarketplaceList) {
        sellerMarketplaceList.innerHTML = '<div class="customer-empty-state compact"><span>⚠️</span><h4>Personal listings could not load</h4><p>'+receiptEscape(personalSaleResult.error.message)+'</p></div>';
      }
      personalSaleListings = [];
    } else {
      personalSaleListings = Array.isArray(personalSaleResult.data) ? personalSaleResult.data : [];
    }

    renderMarketplacePreview();
    renderLiveCatalogue();
  };

  const addLiveProductToCart = (button) => {
    if (!button || button.disabled) return;
    const product = marketplaceProducts.find((item) => item.id === button.dataset.productId);
    if (!product) return;

    const card = button.closest('[data-live-product-card]');
    const hasVariants = card?.dataset.hasVariants === 'true';
    const selectedVariantId = card?.dataset.selectedVariantId || '';
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = selectedVariantId ? variants.find((item) => item.id === selectedVariantId) : null;

    if (hasVariants && !variant) {
      const note = card?.querySelector('[data-variant-selection-note]');
      if (note) note.textContent = 'Choose a variant first.';
      button.textContent = 'Choose Variant';
      return;
    }

    const stock = Number(variant ? variant.quantity_available : product.quantity_available || 0);
    if (stock <= 0) {
      button.textContent = 'Out of Stock';
      button.disabled = true;
      return;
    }

    const cartId = variant ? product.id+':'+variant.id : product.id;
    const existing = testCart.find((item) => item.id === cartId);

    if (existing) {
      if (existing.quantity >= stock) {
        const note = card?.querySelector('[data-variant-selection-note]');
        if (note) note.textContent = 'Maximum available stock already in your cart.';
        return;
      }
      existing.quantity += 1;
      existing.stock = stock;
    } else {
      testCart.push({
        id: cartId,
        productId: product.id,
        variantId: variant?.id || null,
        variantName: variant?.variant_name || null,
        sellerId: product.seller_id,
        sellerName: product.seller_name,
        name: variant ? product.product_name+' — '+variant.variant_name : product.product_name,
        productName: product.product_name,
        price: Number(variant ? variant.price_kes : product.price_kes),
        stock,
        deposit: Number(product.lipa_pole_pole_first_deposit_kes || 0),
        lppDays: Number(product.lipa_pole_pole_max_days || 0),
        icon: categoryIcon(product.category_code),
        quantity: 1
      });
    }

    saveTestCart();
    renderTestCart();

    const feedback = document.getElementById('testCartFeedback');
    if (feedback) feedback.textContent = (variant ? product.product_name+' — '+variant.variant_name : product.product_name) + ' added to cart.';
    const original = button.textContent;
    button.textContent = '✓ Added';

    if(variant && card){
      const panel=card.querySelector('[data-product-variant-panel]');
      const start=card.querySelector('[data-live-cart-start]');
      window.setTimeout(()=>{
        if(panel) panel.hidden=true;
        if(start) start.textContent='Add to Cart';
      },700);
    }

    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 900);
  };

  liveProductGrid?.addEventListener('click', (event) => {
    const galleryButton=event.target.closest('[data-product-gallery-image]');
    if(galleryButton){
      const card=galleryButton.closest('[data-live-product-card]');
      const imageWrap=card?.querySelector('[data-live-product-image]');
      const image=imageWrap?.querySelector('img');
      if(image){
        image.src=galleryButton.dataset.productGalleryImage;
        card.querySelectorAll('[data-product-gallery-image]').forEach((button)=>button.classList.toggle('active',button===galleryButton));
      }
      return;
    }

    const cartStart=event.target.closest('[data-live-cart-start]');
    if(cartStart){
      if(cartStart.disabled) return;
      const card=cartStart.closest('[data-live-product-card]');
      if(!card) return;

      if(card.dataset.hasVariants!=='true'){
        addLiveProductToCart(cartStart);
        return;
      }

      const panel=card.querySelector('[data-product-variant-panel]');
      const details=card.querySelector('[data-product-details]');
      const detailsButton=card.querySelector('[data-product-details-toggle]');
      if(!panel) return;

      liveProductGrid.querySelectorAll('[data-live-product-card]').forEach((otherCard)=>{
        if(otherCard===card) return;
        const otherPanel=otherCard.querySelector('[data-product-variant-panel]');
        const otherDetails=otherCard.querySelector('[data-product-details]');
        const otherDetailsButton=otherCard.querySelector('[data-product-details-toggle]');
        if(otherPanel) otherPanel.hidden=true;
        if(otherDetails) otherDetails.hidden=true;
        if(otherDetailsButton){
          otherDetailsButton.setAttribute('aria-expanded','false');
          otherDetailsButton.textContent='View Details';
        }
      });

      if(details) details.hidden=true;
      if(detailsButton){
        detailsButton.setAttribute('aria-expanded','false');
        detailsButton.textContent='View Details';
      }

      panel.hidden=!panel.hidden;
      cartStart.textContent=panel.hidden?'Add to Cart':'Hide Variants';
      return;
    }

    const detailsButton=event.target.closest('[data-product-details-toggle]');
    if(detailsButton){
      const card=detailsButton.closest('[data-live-product-card]');
      const details=card?.querySelector('[data-product-details]');
      if(!details) return;

      const opening=details.hidden;
      liveProductGrid.querySelectorAll('[data-live-product-card]').forEach((otherCard)=>{
        if(otherCard===card) return;
        const otherDetails=otherCard.querySelector('[data-product-details]');
        const otherButton=otherCard.querySelector('[data-product-details-toggle]');
        const otherPanel=otherCard.querySelector('[data-product-variant-panel]');
        const otherCartStart=otherCard.querySelector('[data-live-cart-start]');
        if(otherDetails) otherDetails.hidden=true;
        if(otherPanel) otherPanel.hidden=true;
        if(otherButton){
          otherButton.setAttribute('aria-expanded','false');
          otherButton.textContent='View Details';
        }
        if(otherCartStart && otherCard.dataset.hasVariants==='true') otherCartStart.textContent='Add to Cart';
      });

      const ownPanel=card.querySelector('[data-product-variant-panel]');
      const ownCartStart=card.querySelector('[data-live-cart-start]');
      if(ownPanel) ownPanel.hidden=true;
      if(ownCartStart && card.dataset.hasVariants==='true') ownCartStart.textContent='Add to Cart';

      details.hidden=!opening;
      detailsButton.setAttribute('aria-expanded',String(opening));
      detailsButton.textContent=opening?'Hide Details':'View Details';
      return;
    }

    const variantButton = event.target.closest('[data-product-variant]');
    if (variantButton) {
      const product = marketplaceProducts.find((item) => item.id === variantButton.dataset.productId);
      const card = variantButton.closest('[data-live-product-card]');
      if (!product || !card || variantButton.disabled) return;

      card.querySelectorAll('[data-product-variant]').forEach((item) => item.classList.toggle('selected', item === variantButton));
      card.dataset.selectedVariantId = variantButton.dataset.productVariant;

      const price = card.querySelector('[data-live-product-price]');
      const stock = card.querySelector('[data-live-product-stock]');
      const note = card.querySelector('[data-variant-selection-note]');
      const addButton = card.querySelector('[data-live-add-cart]');
      const imageWrap = card.querySelector('[data-live-product-image]');

      if (price) price.textContent = money(Number(variantButton.dataset.variantPrice || 0));
      if (stock) stock.textContent = 'Qty '+Number(variantButton.dataset.variantStock || 0)+' '+(product.measurement_unit || 'item');
      if (note) note.textContent = 'Selected: '+variantButton.dataset.variantName;
      if (addButton) {
        addButton.disabled=false;
        addButton.textContent = 'Add Selected Variant';
      }

      const variantImage = variantButton.dataset.variantImage;
      if (variantImage && imageWrap) {
        imageWrap.innerHTML = '<img src="'+receiptEscape(variantImage)+'" alt="'+receiptEscape(product.product_name+' '+variantButton.dataset.variantName)+'">';
      }
      return;
    }

    addLiveProductToCart(event.target.closest('[data-live-add-cart]'));
  });

  exploreCategoryGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-category-code]');
    if (!card) return;
    const code = card.dataset.productCategoryCode;
    if (code === 'alcoholic_leogo_bar') return;

    event.preventDefault();
    selectedMarketplaceCategory = code === 'marketplace' ? 'all' : code;
    renderLiveCatalogue();
    document.getElementById('live-product-catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const openGeneralMarketplace = (event) => {
    event?.preventDefault?.();
    selectedMarketplaceCategory = 'all';
    renderLiveCatalogue();
    document.getElementById('live-product-catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  showAllLiveProducts?.addEventListener('click', openGeneralMarketplace);
  viewAllProductCategories?.addEventListener('click', openGeneralMarketplace);
  personalSalesSeeMore?.addEventListener('click', openGeneralMarketplace);

  document.addEventListener('leogo:authchange', () => loadMarketplaceProducts());
  document.addEventListener('leogo:customer-data-refresh', () => loadMarketplaceProducts());
  window.setTimeout(loadMarketplaceProducts, 500);

  const personalInterestModal = document.getElementById('personalInterestModal');
  const personalInterestForm = document.getElementById('personalInterestForm');
  const personalInterestListingId = document.getElementById('personalInterestListingId');
  const personalInterestItemSummary = document.getElementById('personalInterestItemSummary');
  const personalInterestName = document.getElementById('personalInterestName');
  const personalInterestPhone = document.getElementById('personalInterestPhone');
  const personalInterestMessage = document.getElementById('personalInterestMessage');
  const personalInterestStatus = document.getElementById('personalInterestStatus');

  const closePersonalInterest = () => {
    if (!personalInterestModal) return;
    personalInterestModal.classList.remove('is-open');
    personalInterestModal.setAttribute('aria-hidden','true');
    document.body.classList.remove('selling-modal-open');
  };

  const openPersonalInterest = (listingId) => {
    const listing=personalSaleListings.find((item)=>item.id===listingId);
    if(!listing) return;

    if(!window.leogoAuth?.isAuthenticated?.()){
      window.leogoAuth?.requireLogin?.('Please log in to send an interest request through LEOGO.');
      return;
    }

    const user=window.leogoAuth?.getUser?.();
    if(personalInterestListingId) personalInterestListingId.value=listing.id;
    if(personalInterestItemSummary) personalInterestItemSummary.innerHTML=
      '<strong>'+receiptEscape(listing.public_title || listing.item_name)+'</strong><span>'+money(listing.marked_price_kes)+'</span>';
    if(personalInterestName && !personalInterestName.value) personalInterestName.value=user?.user_metadata?.full_name || '';
    if(personalInterestPhone && !personalInterestPhone.value) personalInterestPhone.value=user?.user_metadata?.phone || '';
    if(personalInterestMessage) personalInterestMessage.value='';
    if(personalInterestStatus) personalInterestStatus.textContent='';

    personalInterestModal?.classList.add('is-open');
    personalInterestModal?.setAttribute('aria-hidden','false');
    document.body.classList.add('selling-modal-open');
    window.setTimeout(()=>personalInterestName?.focus(),50);
  };

  document.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-personal-interest]');
    if(!button) return;
    event.preventDefault();
    openPersonalInterest(button.dataset.personalInterest);
  });

  personalInterestModal?.querySelectorAll('[data-close-personal-interest]').forEach((button)=>{
    button.addEventListener('click',closePersonalInterest);
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && personalInterestModal?.classList.contains('is-open')) closePersonalInterest();
  });

  personalInterestForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!personalInterestForm.reportValidity()) return;
    const client=window.leogoAuth?.client;
    const listingId=personalInterestListingId?.value;
    if(!client || !listingId){
      personalInterestStatus.textContent='This request could not be prepared. Refresh and try again.';
      return;
    }

    const button=personalInterestForm.querySelector('button[type="submit"]');
    const original=button?.textContent || 'Send Interest Through LEOGO';
    try{
      if(button){button.disabled=true;button.textContent='Sending…';}
      personalInterestStatus.textContent='Sending your interest securely through LEOGO…';
      const {error}=await client.rpc('customer_submit_personal_sale_interest',{
        p_listing_id:listingId,
        p_buyer_name:personalInterestName.value.trim(),
        p_buyer_phone:personalInterestPhone.value.trim(),
        p_message:personalInterestMessage.value.trim() || null
      });
      if(error) throw error;
      personalInterestStatus.textContent='✓ Interest sent. LEOGO Admin will coordinate contact between you and the item owner.';
      loadCustomerNotifications().catch(()=>{});
      window.setTimeout(closePersonalInterest,1800);
    }catch(error){
      personalInterestStatus.textContent=error?.message || 'Your interest request could not be sent. Please try again.';
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  const openNotifications = document.getElementById('openNotifications');
  const closeNotifications = document.getElementById('closeNotifications');
  const customerNotificationPanel = document.getElementById('customerNotificationPanel');
  const customerNotificationScrim = document.getElementById('customerNotificationScrim');
  const customerNotificationList = document.getElementById('customerNotificationList');
  const headerNotificationCount = document.getElementById('headerNotificationCount');
  const notificationUnreadText = document.getElementById('notificationUnreadText');
  const markAllNotificationsRead = document.getElementById('markAllNotificationsRead');
  let customerNotifications = [];

  const renderCustomerNotifications = () => {
    const unread = customerNotifications.filter((item)=>!item.read_at).length;
    if(headerNotificationCount) headerNotificationCount.textContent=String(unread);
    if(notificationUnreadText) notificationUnreadText.textContent=unread+' unread';
    if(!customerNotificationList) return;

    if(!window.leogoAuth?.isAuthenticated?.()){
      customerNotificationList.innerHTML='<div class="customer-notification-empty">Sign in to see your LEOGO notifications.</div>';
      return;
    }

    customerNotificationList.innerHTML=customerNotifications.length
      ? customerNotifications.map((item)=>'<article class="customer-notification-item'+(item.read_at?'':' unread')+'">'+
          '<button type="button" class="customer-notification-open" data-customer-notification-id="'+receiptEscape(item.id)+'">'+
            '<span class="customer-notification-icon">'+(item.read_at?'✓':'●')+'</span>'+
            '<span class="customer-notification-copy">'+
              '<strong>'+receiptEscape(item.title)+'</strong>'+
              '<span>'+receiptEscape(item.message)+'</span>'+
              '<small>'+new Date(item.created_at).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'})+'</small>'+
            '</span>'+
            (item.read_at?'':'<i aria-label="Unread"></i>')+
          '</button>'+
        '</article>').join('')
      : '<div class="customer-notification-empty">No notifications yet.</div>';
  };

  const loadCustomerNotifications = async () => {
    const client=window.leogoAuth?.client;
    if(!client || !window.leogoAuth?.isAuthenticated?.()){
      customerNotifications=[];
      renderCustomerNotifications();
      return;
    }
    const {data,error}=await client.from('customer_notifications')
      .select('id,notification_type,title,message,source_type,source_id,action_view,metadata,read_at,created_at')
      .order('created_at',{ascending:false})
      .limit(30);
    if(error){console.warn('Customer notifications could not load:',error);return;}
    customerNotifications=Array.isArray(data)?data:[];
    renderCustomerNotifications();
  };

  const closeCustomerNotifications = () => {
    customerNotificationPanel?.classList.remove('open');
    customerNotificationScrim?.classList.remove('open');
    if(customerNotificationPanel) customerNotificationPanel.hidden=true;
    if(customerNotificationScrim) customerNotificationScrim.hidden=true;
    openNotifications?.setAttribute('aria-expanded','false');
  };

  const showCustomerNotifications = async () => {
    if(!window.leogoAuth?.isAuthenticated?.()){
      window.leogoAuth?.requireLogin?.('Please log in to view your LEOGO notifications.');
      return;
    }
    await loadCustomerNotifications();
    if(customerNotificationPanel) customerNotificationPanel.hidden=false;
    if(customerNotificationScrim) customerNotificationScrim.hidden=false;
    requestAnimationFrame(()=>{
      customerNotificationPanel?.classList.add('open');
      customerNotificationScrim?.classList.add('open');
    });
    openNotifications?.setAttribute('aria-expanded','true');
  };

  openNotifications?.addEventListener('click',()=>{
    if(customerNotificationPanel?.hidden) showCustomerNotifications();
    else closeCustomerNotifications();
  });
  closeNotifications?.addEventListener('click',closeCustomerNotifications);
  customerNotificationScrim?.addEventListener('click',closeCustomerNotifications);

  customerNotificationList?.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-customer-notification-id]');
    if(!button) return;
    const item=customerNotifications.find((row)=>row.id===button.dataset.customerNotificationId);
    if(!item || item.read_at) return;
    const {error}=await window.leogoAuth.client.rpc('mark_customer_notification_read',{p_notification_id:item.id});
    if(!error) await loadCustomerNotifications();
  });

  markAllNotificationsRead?.addEventListener('click',async()=>{
    if(!window.leogoAuth?.isAuthenticated?.()) return;
    const {error}=await window.leogoAuth.client.rpc('mark_all_customer_notifications_read');
    if(!error) await loadCustomerNotifications();
  });

  document.addEventListener('leogo:authchange',()=>loadCustomerNotifications());
  window.setTimeout(loadCustomerNotifications,800);
  window.setInterval(()=>{ if(window.leogoAuth?.isAuthenticated?.()) loadCustomerNotifications(); },60000);

  cartShellItems?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-action]');
    const row = event.target.closest('[data-cart-item]');
    if (!button || !row) return;
    const index = testCart.findIndex((item) => item.id === row.dataset.cartItem);
    if (index < 0) return;
    if (button.dataset.cartAction === 'increase') {
      const maxStock = Number(testCart[index].stock || 0);
      if (!maxStock || testCart[index].quantity < maxStock) testCart[index].quantity += 1;
    }
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
  const customerOrderFormatDate = (value, withTime = true) => {
    if(!value) return '—';
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-KE',withTime
      ? {dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}
      : {dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(date);
  };
  const customerOrderStatusText = (status) => ({
    placed:'Order placed',processing:'Seller preparing order',with_rider:'Delivery in progress',delivered:'Delivered',cancelled:'Cancelled'
  }[status] || String(status || '').replaceAll('_',' '));
  const customerPaymentText = (status) => ({
    submitted:'Payment submitted — verifying',verified_paid:'Paid',cod_due:'COD — due on delivery',cod_paid:'Paid on delivery',rejected:'Payment rejected'
  }[status] || String(status || '').replaceAll('_',' '));
  const customerDeliveryStatusText = (status) => ({
    awaiting_assignment:'Awaiting Rider assignment',
    assigned:'Rider assigned',
    picked_up:'Picked up from Seller',
    arrived_sorting_center:'Arrived at LEOGO Sorting Center',
    sorting_received:'Order Received at LEOGO Sorting Center',
    ready_for_dispatch:'Ready for Dispatch',
    on_the_way:'On the way to you',
    delivered:'Delivered',
    failed:'Delivery issue',
    cancelled:'Cancelled'
  }[status] || String(status || '').replaceAll('_',' '));
  const customerAftersalesStatusText = (status) => ({
    submitted:'Submitted',
    in_review:'Under review',
    contacted:'Customer contacted',
    resolved:'Resolved',
    rejected:'Closed — not approved',
    cancelled:'Cancelled'
  }[status] || String(status || '').replaceAll('_',' '));

  const customerOrderHistory = (order) => {
    const events = [];
    const add=(label,at,detail='')=>{ if(at) events.push({label,at,detail}); };
    add('Order placed',order.created_at,'Order '+order.order_reference+' was created.');
    if(order.payment_verified_at){
      add('Payment verified',order.payment_verified_at,customerPaymentText(order.payment_status));
    }else if(order.payment_status==='submitted'){
      add('Payment submitted',order.created_at,'Payment is awaiting LEOGO verification.');
    }else if(order.payment_status==='cod_due'){
      add('Cash on Delivery selected',order.created_at,'Payment will be collected before customer handover.');
    }

    (Array.isArray(order.seller_fulfilments)?order.seller_fulfilments:[]).forEach((seller)=>{
      const name=seller.seller_name||'Seller';
      add(name+' received the order',seller.received_at,'Seller accepted this order portion.');
      add(name+' packed & ready',seller.packed_ready_at,'Order portion prepared for Rider pickup.');
    });

    add('Rider assigned',order.delivery_assigned_at,order.rider_name?order.rider_name+' was assigned to the order.':'LEOGO Rider assigned.');
    add('Picked up from Seller',order.delivery_picked_up_at,'Rider collected the order from the Seller.');
    add('Arrived at LEOGO Sorting Center',order.arrived_sorting_center_at,'Rider arrived with the order at the Sorting Center.');
    add('Order Received at LEOGO Sorting Center',order.sorting_received_at,'LEOGO staff confirmed physical receipt.');
    add('Ready for Dispatch',order.ready_for_dispatch_at,'Order cleared for final delivery from the Sorting Center.');
    add('On the way to you',order.on_the_way_at,'Rider left the Sorting Center for final delivery.');
    add('Delivered',order.delivery_delivered_at||order.delivered_at,'Order delivery was completed.');
    return events.sort((a,b)=>new Date(a.at)-new Date(b.at));
  };

  const customerOrderTimelineHtml = (order,compact=false) => {
    const events=customerOrderHistory(order);
    if(!events.length) return '';
    const visible=compact?events.slice(-4):events;
    return '<div class="customer-order-history '+(compact?'compact':'')+'">'+
      visible.map((event,index)=>'<div class="customer-order-history-event done">'+
        '<i></i><div><strong>'+receiptEscape(event.label)+'</strong>'+
        '<small>'+receiptEscape(customerOrderFormatDate(event.at))+'</small>'+
        (!compact&&event.detail?'<span>'+receiptEscape(event.detail)+'</span>':'')+
        '</div></div>').join('')+
      '</div>';
  };

  const customerReviewStars = (rating) => '★'.repeat(Number(rating||0))+'☆'.repeat(Math.max(0,5-Number(rating||0)));
  const productReviewStatusText = (status) => ({
    submitted:'Pending Admin approval',
    approved:'Approved · Public on product',
    rejected:'Not published'
  }[status]||'Not reviewed');

  const orderHasProductReviews = (order) =>
    (Array.isArray(order?.items)?order.items:[]).some((item)=>item.review);

  const customerReviewBoxHtml = (order) => {
    const items=Array.isArray(order.items)?order.items:[];
    return '<div class="customer-order-review-box customer-product-review-box" data-order-review-box hidden>'+
      '<div class="customer-product-review-intro"><strong>Review purchased products</strong><span>Each product is reviewed separately. Reviews are sent to LEOGO Admin and appear publicly only after approval.</span></div>'+
      (items.length?items.map((item)=>{
        const review=item.review||null;
        const options=[5,4,3,2,1].map((rating)=>'<option value="'+rating+'" '+(Number(review?.rating)===rating?'selected':'')+'>'+rating+' / 5 — '+customerReviewStars(rating)+'</option>').join('');
        const status=review?.moderation_status||null;
        const statusHtml=review
          ? '<div class="customer-product-review-state status-'+receiptEscape(status)+'"><strong>'+receiptEscape(productReviewStatusText(status))+'</strong>'+
              (status==='rejected'&&review.admin_notes?'<span>Admin note: '+receiptEscape(review.admin_notes)+'</span>':'')+
              (status==='approved'?'<span>Your rating is included in this product’s public rating.</span>':'')+
              (status==='submitted'?'<span>LEOGO Admin will review this before it appears publicly.</span>':'')+
            '</div>'
          : '<div class="customer-product-review-state"><strong>Not reviewed yet</strong><span>Only verified purchases can be reviewed.</span></div>';
        return '<form data-product-review-form data-order-item-id="'+receiptEscape(item.order_item_id||'')+'" class="customer-product-review-form">'+
          '<div class="customer-product-review-product"><strong>'+receiptEscape(item.product_name)+'</strong>'+
            (item.variant_name?'<span>Variant: '+receiptEscape(item.variant_name)+'</span>':'')+
            '<small>Verified purchase · '+receiptEscape(order.order_reference)+'</small></div>'+
          statusHtml+
          '<label><span>Your rating</span><select name="rating" required>'+options+'</select></label>'+
          '<label><span>Product review <small>(optional)</small></span><textarea name="comment" maxlength="1500" rows="3" placeholder="What did you think about this product?">'+receiptEscape(review?.comment||'')+'</textarea></label>'+
          (review?.moderation_status==='approved'?'<p class="customer-review-edit-note">Editing an approved review sends the updated version back to Admin for approval.</p>':'')+
          '<button type="submit">'+(review?'Update Product Review':'Submit Product Review')+'</button>'+
          '<div class="customer-order-action-status" data-review-status></div>'+
        '</form>';
      }).join(''):'<p>No reviewable product items were found in this order.</p>')+
    '</div>';
  };

  const renderCustomerAftersalesCases = () => {
    const container=document.getElementById('customerAftersalesCaseList');
    if(!container) return;
    const cases=customerMarketplaceOrders
      .filter((order)=>order.aftersales_case)
      .map((order)=>({order,case:order.aftersales_case}))
      .sort((a,b)=>new Date(b.case.created_at||0)-new Date(a.case.created_at||0));

    if(!cases.length){
      container.innerHTML='<div class="customer-dashboard-order-empty">No Aftersales cases yet.</div>';
      return;
    }

    container.innerHTML=cases.map(({order,case:item})=>
      '<article class="customer-aftersales-case-card">'+
        '<div class="customer-aftersales-case-top"><div><small>CASE</small><strong>'+receiptEscape(item.case_reference)+'</strong><span>Order '+receiptEscape(order.order_reference)+'</span></div>'+
          '<b class="status-'+receiptEscape(item.status)+'">'+receiptEscape(customerAftersalesStatusText(item.status))+'</b></div>'+
        '<div class="customer-aftersales-case-grid">'+
          '<div><small>Issue</small><strong>'+receiptEscape(String(item.issue_type||'').replaceAll('_',' '))+'</strong></div>'+
          '<div><small>Preferred solution</small><strong>'+receiptEscape(String(item.preferred_solution||'').replaceAll('_',' '))+'</strong></div>'+
          '<div><small>Submitted</small><strong>'+receiptEscape(customerOrderFormatDate(item.created_at))+'</strong></div>'+
          '<div><small>Last updated</small><strong>'+receiptEscape(customerOrderFormatDate(item.updated_at||item.created_at))+'</strong></div>'+
        '</div>'+
        '<div class="customer-aftersales-case-details"><small>Your explanation</small><p>'+receiptEscape(item.details||'—')+'</p></div>'+
        (item.admin_notes?'<div class="customer-aftersales-admin-note"><small>LEOGO Customer Care update</small><p>'+receiptEscape(item.admin_notes)+'</p></div>':'')+
        (item.status==='resolved'&&item.resolved_at?'<div class="customer-aftersales-resolved">✓ Resolved '+receiptEscape(customerOrderFormatDate(item.resolved_at))+'</div>':'')+
      '</article>'
    ).join('');
  };

  const populateCustomerAftersalesOrders = () => {
    const select=document.getElementById('aftersalesOrderId');
    if(!select) return;
    const current=select.value;
    const delivered=customerMarketplaceOrders.filter((order)=>order.order_status==='delivered');
    select.innerHTML='<option value="">Select a delivered order</option>'+delivered.map((order)=>
      '<option value="'+receiptEscape(order.id)+'">'+receiptEscape(order.order_reference)+' · '+receiptEscape(customerOrderFormatDate(order.delivered_at||order.delivery_delivered_at||order.created_at))+'</option>'
    ).join('');
    if(current&&delivered.some((order)=>order.id===current)) select.value=current;
  };

  const renderCustomerDashboardOrders = () => {
    const container=document.getElementById('customerDashboardOrders');
    if(!container) return;
    const rows=customerMarketplaceOrders.slice(0,3);
    if(!rows.length){
      container.innerHTML='<div class="customer-dashboard-order-empty">Your latest product orders will appear here.</div>';
      return;
    }
    container.innerHTML=rows.map((order)=>{
      const completed=order.order_status==='delivered';
      return '<article class="customer-dashboard-order-card">'+
        '<div class="customer-dashboard-order-top"><div><small>ORDER</small><strong>'+receiptEscape(order.order_reference)+'</strong><span>'+receiptEscape(customerOrderFormatDate(order.created_at))+'</span></div>'+
        '<b class="'+(completed?'complete':'active')+'">'+receiptEscape(customerDeliveryStatusText(order.delivery_status||order.order_status))+'</b></div>'+
        customerOrderTimelineHtml(order,true)+
        '<div class="customer-dashboard-order-bottom"><strong>'+receiptEscape(money(order.grand_total_kes))+'</strong><div>'+
          '<button type="button" data-view-order-history="'+receiptEscape(order.id)+'">View History</button>'+
          (completed?'<button type="button" data-review-order="'+receiptEscape(order.id)+'">'+(orderHasProductReviews(order)?'Product Reviews':'Review Products')+'</button><button type="button" class="secondary" data-aftersales-order="'+receiptEscape(order.id)+'">'+(order.aftersales_case?'Aftersales':'Aftersales')+'</button>':'')+
        '</div></div>'+
      '</article>';
    }).join('');
  };

  let customerOrderLoadPromise = null;
  const renderCustomerMarketplaceOrders = () => {
    const container = document.getElementById('customerMarketplaceOrders');
    const empty = document.getElementById('customerActivityEmpty');

    const active = customerMarketplaceOrders.filter(o=>!['delivered','cancelled'].includes(o.order_status)).length;
    const openAftersales=customerMarketplaceOrders.filter((order)=>order.aftersales_case&&['submitted','in_review','contacted'].includes(order.aftersales_case.status)).length;
    const latest = customerMarketplaceOrders[0] || null;
    const ac=document.getElementById('customerActiveOrderCount');
    if(ac) ac.textContent=active;
    const at=document.getElementById('customerActiveOrderText');
    if(at) at.textContent=active
      ? active+' order(s) in progress'
      : latest
        ? 'Latest: '+customerDeliveryStatusText(latest.delivery_status||latest.order_status)
        : 'No active orders';
    const pc=document.getElementById('customerProductOrderCount');
    if(pc) pc.textContent=customerMarketplaceOrders.length;
    renderCustomerServiceRequests();
    const afc=document.getElementById('customerAftersalesCount');
    if(afc) afc.textContent=openAftersales;
    const aft=document.getElementById('customerAftersalesText');
    if(aft) aft.textContent=openAftersales?openAftersales+' case(s) open':'No open cases';

    renderCustomerDashboardOrders();
    populateCustomerAftersalesOrders();
    renderCustomerAftersalesCases();

    if (!container) return;
    let rows = customerMarketplaceOrders;
    if (customerActivityFilter === 'active') rows = rows.filter(o => !['delivered','cancelled'].includes(o.order_status));
    if (customerActivityFilter === 'completed') rows = rows.filter(o => o.order_status === 'delivered');
    if (customerActivityFilter === 'cancelled') rows = rows.filter(o => o.order_status === 'cancelled');
    if (['services','transport'].includes(customerActivityFilter)) rows = [];
    if (customerActivityFilter === 'products') rows = customerMarketplaceOrders;

    container.innerHTML = rows.map(order => {
      const orderItems=Array.isArray(order.items)?order.items:[];
      const items=orderItems.map(i=>'<li>'+receiptEscape(i.product_name)+(i.variant_name?' — <b>'+receiptEscape(i.variant_name)+'</b>':'')+' × '+Number(i.quantity)+' <strong>'+money(i.line_total_kes)+'</strong></li>').join('');
      const sellers=(Array.isArray(order.seller_fulfilments)?order.seller_fulfilments:[]).map(s=>'<span>'+receiptEscape(s.seller_name)+' — <b>'+receiptEscape(String(s.fulfilment_status).replaceAll('_',' '))+'</b></span>').join('');
      const rider = order.rider_name ? '<div class="customer-order-delivery"><span><small>LEOGO Rider</small><strong>'+receiptEscape(order.rider_name)+'</strong></span><span><small>Delivery status</small><strong>'+receiptEscape(customerDeliveryStatusText(order.delivery_status||'awaiting_assignment'))+'</strong></span></div>' : '<div class="customer-order-delivery"><span><small>LEOGO Rider</small><strong>Awaiting assignment</strong></span><span><small>Delivery status</small><strong>'+receiptEscape(customerDeliveryStatusText(order.delivery_status||'awaiting_assignment'))+'</strong></span></div>';
      const firstItem=orderItems[0];
      const itemSummary=firstItem
        ? receiptEscape(firstItem.product_name)+(firstItem.variant_name?' · '+receiptEscape(firstItem.variant_name):'')+' × '+Number(firstItem.quantity)+(orderItems.length>1?' · +'+(orderItems.length-1)+' more':'')
        : 'Order items';
      const completed=order.order_status==='delivered';
      const actionButtons=
        '<button type="button" class="customer-order-update-toggle" data-toggle-order-updates="'+receiptEscape(order.id)+'" aria-expanded="false">View Order Updates <span>⌄</span></button>'+
        (completed?'<button type="button" data-review-order="'+receiptEscape(order.id)+'">'+(orderHasProductReviews(order)?'Product Reviews':'Review Products')+'</button>'+
          '<button type="button" class="secondary" data-aftersales-order="'+receiptEscape(order.id)+'">'+(order.aftersales_case?'Aftersales · '+receiptEscape(customerAftersalesStatusText(order.aftersales_case.status)):'Apply for Aftersales')+'</button>':'');

      return '<article class="customer-order-card customer-order-card-compact" data-customer-order-id="'+receiptEscape(order.id)+'">'+
        '<header><div><strong>'+receiptEscape(order.order_reference)+'</strong><small>'+customerOrderFormatDate(order.created_at)+'</small></div><div><b>'+receiptEscape(customerOrderStatusText(order.order_status))+'</b><small>'+receiptEscape(customerPaymentText(order.payment_status))+'</small></div></header>'+
        '<div class="customer-order-compact-body"><div><small>ITEM</small><strong>'+itemSummary+'</strong></div><div><small>TOTAL</small><strong>'+money(order.grand_total_kes)+'</strong></div></div>'+
        '<div class="customer-order-compact-actions">'+actionButtons+'</div>'+
        '<div class="customer-order-expanded" data-order-expanded hidden>'+
          '<div class="customer-order-expanded-head"><span>ORDER DETAILS & UPDATES</span><small>'+customerOrderHistory(order).length+' updates</small></div>'+
          '<ul>'+items+'</ul><div class="customer-order-sellers">'+sellers+'</div>'+rider+
          '<div class="customer-order-history-wrap"><div class="customer-order-history-title"><span>ORDER HISTORY</span><strong>'+customerOrderHistory(order).length+' updates</strong></div>'+customerOrderTimelineHtml(order,false)+'</div>'+
          (completed ? customerReviewBoxHtml(order) : '')+
        '</div>'+
      '</article>';
    }).join('');
    if (empty) empty.hidden = rows.length > 0 || filteredCustomerServiceRequests().length > 0;
  };

  async function loadCustomerMarketplaceOrders(){
    if(customerOrderLoadPromise) return customerOrderLoadPromise;
    customerOrderLoadPromise=(async()=>{
      const auth=window.leogoAuth;
      const client=auth?.client;
      if(!client) return;

      let user=auth.getUser?.()||null;
      if(!user){
        const sessionResult=await client.auth.getSession();
        user=sessionResult.data?.session?.user||null;
      }
      if(!user){
        customerMarketplaceOrders=[];
        renderCustomerMarketplaceOrders();
        return;
      }

      const {data,error}=await client.rpc('customer_list_marketplace_orders_v2');
      if(error){
        console.error('LEOGO customer orders could not load:',error.message||error);
        const empty=document.getElementById('customerActivityEmpty');
        if(empty && !customerMarketplaceOrders.length){
          const title=document.getElementById('activityEmptyTitle');
          const text=document.getElementById('activityEmptyText');
          if(title) title.textContent='Orders could not refresh';
          if(text) text.textContent='Your order history is safe. Check your connection and reopen My Activity to try again.';
          empty.hidden=false;
        }
        return;
      }
      customerMarketplaceOrders=Array.isArray(data)?data:[];
      renderCustomerMarketplaceOrders();
    })().finally(()=>{customerOrderLoadPromise=null;});
    return customerOrderLoadPromise;
  }

  const refreshCustomerOrdersSoon=()=>window.setTimeout(()=>loadCustomerMarketplaceOrders(),40);
  document.addEventListener('leogo:authchange',refreshCustomerOrdersSoon);
  document.addEventListener('leogo:customer-data-refresh',refreshCustomerOrdersSoon);
  document.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-customer-view="dashboard"],[data-open-customer-view="dashboard"],[data-customer-view="orders"],[data-open-customer-view="orders"]')){
      refreshCustomerOrdersSoon();
      window.setTimeout(()=>loadCustomerServiceRequests(),45);
    }
  });
  window.addEventListener('focus',()=>{ if(window.leogoAuth?.getUser?.()) loadCustomerMarketplaceOrders(); });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && window.leogoAuth?.getUser?.()) loadCustomerMarketplaceOrders();
  });
  window.setTimeout(loadCustomerMarketplaceOrders,500);

  const showCustomerOrderInActivity = (orderId,{review=false,updates=false}={}) => {
    customerActivityFilter='all';
    activityFilterButtons?.forEach((button)=>{
      const selected=button.dataset.activityFilter==='all';
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    renderCustomerMarketplaceOrders();
    openCustomerShell('orders');
    window.setTimeout(()=>{
      const card=[...document.querySelectorAll('[data-customer-order-id]')].find((item)=>item.dataset.customerOrderId===orderId);
      if(!card) return;
      card.scrollIntoView({behavior:'smooth',block:'start'});
      if(review||updates){
        const expanded=card.querySelector('[data-order-expanded]');
        const toggle=card.querySelector('[data-toggle-order-updates]');
        if(expanded) expanded.hidden=false;
        if(toggle){
          toggle.setAttribute('aria-expanded','true');
          toggle.innerHTML='Hide Order Updates <span>⌃</span>';
        }
      }
      if(review){
        const box=card.querySelector('[data-order-review-box]');
        if(box){box.hidden=false;box.querySelector('select')?.focus();}
      }
    },100);
  };

  const prepareAftersalesOrder = (orderId) => {
    const order=customerMarketplaceOrders.find((item)=>item.id===orderId);
    const select=document.getElementById('aftersalesOrderId');
    const form=document.getElementById('marketplaceAftersalesForm');
    const status=document.getElementById('aftersalesPreviewStatus');
    if(select) select.value=orderId||'';
    if(status){
      status.classList.remove('is-error','is-success');
      if(order?.aftersales_case){
        status.textContent='Existing case '+order.aftersales_case.case_reference+' — '+customerAftersalesStatusText(order.aftersales_case.status)+'.';
      }else{
        status.textContent=order?'Aftersales request for '+order.order_reference+'.':'';
      }
    }
    const submit=form?.querySelector('button[type="submit"]');
    if(submit) submit.disabled=Boolean(order?.aftersales_case&&['submitted','in_review','contacted'].includes(order.aftersales_case.status));
  };

  customerShellModal?.addEventListener('click',(event)=>{
    const toggleButton=event.target.closest?.('[data-toggle-order-updates]');
    if(toggleButton){
      const card=toggleButton.closest('[data-customer-order-id]');
      const expanded=card?.querySelector('[data-order-expanded]');
      if(!expanded) return;
      const willOpen=expanded.hidden;
      expanded.hidden=!willOpen;
      toggleButton.setAttribute('aria-expanded',String(willOpen));
      toggleButton.innerHTML=willOpen?'Hide Order Updates <span>⌃</span>':'View Order Updates <span>⌄</span>';
      if(willOpen) window.setTimeout(()=>expanded.scrollIntoView({behavior:'smooth',block:'nearest'}),40);
      return;
    }
    const historyButton=event.target.closest?.('[data-view-order-history]');
    if(historyButton){
      showCustomerOrderInActivity(historyButton.dataset.viewOrderHistory,{updates:true});
      return;
    }
    const reviewButton=event.target.closest?.('[data-review-order]');
    if(reviewButton){
      showCustomerOrderInActivity(reviewButton.dataset.reviewOrder,{review:true});
      return;
    }
    const aftersalesButton=event.target.closest?.('[data-aftersales-order]');
    if(aftersalesButton){
      openCustomerShell('aftersales');
      prepareAftersalesOrder(aftersalesButton.dataset.aftersalesOrder);
    }
  });

  document.addEventListener('submit',async(event)=>{
    const form=event.target.closest?.('[data-product-review-form]');
    if(!form) return;
    event.preventDefault();
    const orderItemId=form.dataset.orderItemId;
    const button=form.querySelector('button[type="submit"]');
    const status=form.querySelector('[data-review-status]');
    const original=button?.textContent||'Submit Product Review';
    if(button){button.disabled=true;button.textContent='Sending to Admin…';}
    if(status){
      status.textContent='';
      status.classList.remove('is-error','is-success');
    }
    try{
      const {data,error}=await window.leogoAuth.client.rpc('customer_submit_product_review',{
        p_order_item_id:orderItemId,
        p_rating:Number(form.elements.rating.value),
        p_comment:form.elements.comment.value.trim()||null
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      if(status){
        status.textContent='✓ Product review sent to LEOGO Admin. It will appear publicly after approval.';
        status.classList.add('is-success');
      }
      await Promise.all([loadCustomerMarketplaceOrders(),loadMarketplaceProducts()]);
    }catch(error){
      if(status){
        status.textContent=error?.message||'Product review could not be submitted.';
        status.classList.add('is-error');
      }
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  });

  const activityFilterButtons = customerShellModal?.querySelectorAll('[data-activity-filter]');
  const activityEmptyIcon = document.getElementById('activityEmptyIcon');
  const activityEmptyTitle = document.getElementById('activityEmptyTitle');
  const activityEmptyText = document.getElementById('activityEmptyText');
  const activityEmptyMessages = {
    all: ['🧾', 'No previous activity yet', 'Your product orders, service requests and Transport & Parcel Delivery bookings will appear here automatically, including their dates, payment and completion status.'],
    products: ['📦', 'No product orders yet', 'Your current and previous product orders will appear here when the ordering system is connected.'],
    services: ['🛠️', 'No service activity yet', 'Your requested, quoted, active and completed service jobs will appear here.'],
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

  const aftersalesPreviewForm = document.getElementById('marketplaceAftersalesForm');
  const aftersalesPreviewStatus = document.getElementById('aftersalesPreviewStatus');
  const aftersalesOrderSelect = document.getElementById('aftersalesOrderId');

  aftersalesOrderSelect?.addEventListener('change',()=>prepareAftersalesOrder(aftersalesOrderSelect.value));

  aftersalesPreviewForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!aftersalesPreviewForm.reportValidity()) return;
    const orderId=aftersalesOrderSelect?.value;
    const order=customerMarketplaceOrders.find((item)=>item.id===orderId);
    if(!order||order.order_status!=='delivered'){
      aftersalesPreviewStatus.textContent='Select a completed product order first.';
      aftersalesPreviewStatus.classList.add('is-error');
      return;
    }
    if(order.aftersales_case&&['submitted','in_review','contacted'].includes(order.aftersales_case.status)){
      aftersalesPreviewStatus.textContent='This order already has active case '+order.aftersales_case.case_reference+'.';
      aftersalesPreviewStatus.classList.add('is-error');
      return;
    }

    const file=document.getElementById('aftersalesEvidenceFile')?.files?.[0]||null;
    const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
    if(file&&!allowed.has(file.type)){
      aftersalesPreviewStatus.textContent='Evidence must be JPG, PNG, WEBP or PDF.';
      aftersalesPreviewStatus.classList.add('is-error');
      return;
    }
    if(file&&file.size>10*1024*1024){
      aftersalesPreviewStatus.textContent='Evidence file must be 10 MB or smaller.';
      aftersalesPreviewStatus.classList.add('is-error');
      return;
    }

    const submit=aftersalesPreviewForm.querySelector('button[type="submit"]');
    const original=submit.textContent;
    let evidencePath=null;
    submit.disabled=true;
    submit.textContent='Submitting…';
    aftersalesPreviewStatus.classList.remove('is-error','is-success');
    aftersalesPreviewStatus.textContent='Submitting your Aftersales case to LEOGO Customer Care…';

    try{
      if(file){
        const user=window.leogoAuth.getUser?.();
        if(!user) throw new Error('Login required');
        const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
        evidencePath=user.id+'/'+orderId+'/'+Date.now()+'-'+(crypto.randomUUID?.()||'evidence')+'.'+ext;
        const upload=await window.leogoAuth.client.storage.from('marketplace-aftersales-evidence').upload(evidencePath,file,{
          upsert:false,
          contentType:file.type
        });
        if(upload.error) throw upload.error;
      }

      const {data,error}=await window.leogoAuth.client.rpc('customer_submit_marketplace_aftersales',{
        p_order_id:orderId,
        p_issue_type:document.getElementById('aftersalesIssueType').value,
        p_preferred_solution:document.getElementById('aftersalesPreferredSolution').value,
        p_details:document.getElementById('aftersalesDetails').value.trim(),
        p_evidence_path:evidencePath
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);

      aftersalesPreviewStatus.textContent='✓ Aftersales case '+data.case_reference+' submitted successfully. LEOGO Customer Care will review it.';
      aftersalesPreviewStatus.classList.add('is-success');
      document.getElementById('aftersalesIssueType').value='';
      document.getElementById('aftersalesPreferredSolution').value='';
      document.getElementById('aftersalesDetails').value='';
      document.getElementById('aftersalesEvidenceFile').value='';
      await loadCustomerMarketplaceOrders();
      prepareAftersalesOrder(orderId);
    }catch(error){
      if(evidencePath){
        try{await window.leogoAuth.client.storage.from('marketplace-aftersales-evidence').remove([evidencePath]);}catch(_){}
      }
      aftersalesPreviewStatus.textContent=error?.message||'Aftersales case could not be submitted.';
      aftersalesPreviewStatus.classList.add('is-error');
    }finally{
      submit.disabled=false;
      submit.textContent=original;
      const updated=customerMarketplaceOrders.find((item)=>item.id===orderId);
      if(updated?.aftersales_case&&['submitted','in_review','contacted'].includes(updated.aftersales_case.status)) submit.disabled=true;
    }
  });


  const publicServiceProviderList=document.getElementById('publicServiceProviderList');
  const serviceRequestModal=document.getElementById('serviceRequestModal');
  const serviceRequestForm=document.getElementById('serviceRequestForm');
  let customerPublicServices=[];
  let customerServiceConfig={direct_request_fee_kes:50,quotation_fee_kes:50,payment_destination:null};
  let customerServiceRequests=[];

  const servicePriceText=(item)=>{
    if(item.pricing_model==='quote')return 'Price after quotation';
    const from=Number(item.price_from_kes||0);
    const to=Number(item.price_to_kes||0);
    if(item.pricing_model==='fixed')return money(from)+(item.unit_label?' · '+item.unit_label:'');
    if(item.pricing_model==='hourly')return money(from)+' / hour';
    if(item.pricing_model==='from')return 'From '+money(from)+(to?' – '+money(to):'')+(item.unit_label?' · '+item.unit_label:'');
    return from?money(from):'Contact for price';
  };
  const serviceRequestStatusText=(value)=>({
    submitted:'Waiting for Admin dispatch',awaiting_payment_verification:'Service fee verification',
    payment_verified:'Payment verified · ready for dispatch',payment_rejected:'Service fee not verified',
    dispatched:'Sent to provider',accepted:'Provider accepted',declined:'Provider declined',
    quoted:'Quotation ready',quote_accepted:'Quotation accepted',quote_rejected:'Quotation declined',
    in_progress:'Service in progress',completed:'Completed',cancelled:'Cancelled'
  }[value]||String(value||'').replaceAll('_',' '));
  const servicePaymentDestinationHtml=(payment)=>{
    if(!payment)return '<div class="service-payment-destination"><strong>Payment account unavailable</strong><span>Please try again shortly or contact LEOGO Customer Care.</span></div>';
    let number=payment.till_number||payment.paybill_number||payment.account_number||'';
    let label=payment.till_number?'Till Number':payment.paybill_number?'PayBill':payment.account_number?'Account Number':'Payment details';
    return '<div class="service-payment-destination"><span>'+receiptEscape(payment.display_name||'LEOGO Payment Account')+'</span><strong>'+receiptEscape(label+(number?' · '+number:''))+'</strong>'+(payment.business_name?'<small>'+receiptEscape(payment.business_name)+'</small>':'')+(payment.instructions?'<small>'+receiptEscape(payment.instructions)+'</small>':'')+'</div>';
  };

  const createPublicServiceCard=(item)=>{
    const photo=item.profile_picture_path
      ? window.leogoAuth?.client?.storage.from('service-provider-public-media').getPublicUrl(item.profile_picture_path)?.data?.publicUrl
      : '';
    const directFee=Number(customerServiceConfig.direct_request_fee_kes??50);
    const quotationFee=Number(customerServiceConfig.quotation_fee_kes??50);
    const card=document.createElement('article');
    card.className='service-provider-public-card';
    card.innerHTML='<div class="service-provider-public-photo">'+(photo?'<img src="'+receiptEscape(photo)+'" alt="'+receiptEscape(item.business_name||'Service Provider')+'" loading="lazy">':'<span>🛠️</span>')+'</div>'+
      '<div class="service-provider-public-body"><span class="service-provider-public-badge">✓ LEOGO Approved</span>'+
      '<strong>'+receiptEscape(item.service_name||'Professional Service')+'</strong>'+
      '<b>'+receiptEscape(item.business_name||'Service Provider')+'</b>'+
      '<p>'+receiptEscape(item.description||'Approved professional service available through LEOGO.')+'</p>'+
      '<small>'+receiptEscape([item.service_area,item.town,item.county].filter(Boolean).join(' · ')||'Kenya')+'</small>'+
      '<strong class="service-provider-price">'+receiptEscape(servicePriceText(item))+'</strong>'+
      '<div class="service-provider-actions"><button class="direct" type="button" data-request-service="'+receiptEscape(item.service_id)+'" data-request-type="direct">Request Service · '+receiptEscape(money(directFee))+'</button>'+
      '<button class="quote" type="button" data-request-service="'+receiptEscape(item.service_id)+'" data-request-type="quotation">Request Quotation · '+receiptEscape(money(quotationFee))+'</button></div></div>';
    return card;
  };

  const loadPublicServices=async()=>{
    if(!publicServiceProviderList)return;
    try{
      const client=window.leogoAuth?.client;
      if(!client)throw new Error('Customer connection is not ready.');
      const [servicesResult,configResult]=await Promise.all([
        client.rpc('customer_public_services'),
        client.rpc('customer_service_marketplace_config')
      ]);
      if(servicesResult.error)throw servicesResult.error;
      if(configResult.error)throw configResult.error;
      customerPublicServices=Array.isArray(servicesResult.data)?servicesResult.data:[];
      customerServiceConfig=configResult.data||customerServiceConfig;
      publicServiceProviderList.innerHTML='';
      if(!customerPublicServices.length){
        publicServiceProviderList.innerHTML='<div class="service-provider-public-empty">Approved services will appear here after provider listings are approved.</div>';
        return;
      }
      customerPublicServices.forEach((item)=>publicServiceProviderList.appendChild(createPublicServiceCard(item)));
    }catch(error){
      console.warn('Public Services could not load:',error);
      publicServiceProviderList.innerHTML='<div class="service-provider-public-empty">Approved services are temporarily unavailable.</div>';
    }
  };

  const closeServiceRequestModal=()=>{
    serviceRequestModal?.classList.remove('open');
    serviceRequestModal?.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  const openServiceRequestModal=async(serviceId,requestType)=>{
    let user=window.leogoAuth?.getUser?.()||null;
    if(!user){
      const session=await window.leogoAuth?.client?.auth.getSession();
      user=session?.data?.session?.user||null;
    }
    if(!user){openCustomerShell('auth');return;}
    const item=customerPublicServices.find((row)=>row.service_id===serviceId);
    if(!item)return;
    serviceRequestForm?.reset();
    document.getElementById('serviceRequestServiceId').value=serviceId;
    document.getElementById('serviceRequestType').value=requestType;
    document.getElementById('serviceRequestTitle').textContent=requestType==='quotation'?'Request a Quotation':'Request Service';
    document.getElementById('serviceRequestProvider').textContent=(item.service_name||'Service')+' · '+(item.business_name||'Approved Provider');
    const payment=document.getElementById('serviceQuotationPayment');
    const fee=requestType==='direct'
      ? Number(customerServiceConfig.direct_request_fee_kes??50)
      : Number(customerServiceConfig.quotation_fee_kes??50);
    document.getElementById('serviceRequestSummary').textContent=fee>0
      ? (requestType==='quotation'
        ? 'Pay the quotation fee, submit the payment reference, then LEOGO Admin verifies and dispatches your request.'
        : 'Pay the direct service request fee, submit the payment reference, then LEOGO Admin verifies and dispatches your request.')
      : 'No request fee is currently required. LEOGO Admin will review and dispatch your request.';
    payment.hidden=fee<=0;
    document.getElementById('serviceRequestFeeLabel').textContent=requestType==='direct'?'DIRECT REQUEST SERVICE FEE':'REQUEST QUOTATION FEE';
    document.getElementById('serviceRequestFeeAmount').textContent=money(fee);
    document.getElementById('serviceRequestFeeDescription').textContent=requestType==='direct'
      ? 'This fee pays for processing and dispatching your direct service request. It is separate from the provider’s service charge.'
      : 'This fee pays for preparing and processing your quotation. It is separate from the provider’s quoted service price.';
    document.getElementById('serviceQuotationDestination').innerHTML=servicePaymentDestinationHtml(customerServiceConfig.payment_destination);
    document.getElementById('serviceQuotationReference').required=fee>0;
    document.getElementById('submitServiceRequest').textContent=fee>0
      ? (requestType==='quotation'?'Submit Paid Quotation Request':'Submit Paid Service Request')
      : (requestType==='quotation'?'Submit Quotation Request':'Submit Service Request');
    const preferred=document.getElementById('serviceRequestPreferredDate');
    preferred.min=new Date().toISOString().slice(0,10);
    const status=document.getElementById('serviceRequestStatus');status.textContent='';status.className='service-request-status';
    serviceRequestModal.classList.add('open');serviceRequestModal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  };
  document.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-request-service]');
    if(button)openServiceRequestModal(button.dataset.requestService,button.dataset.requestType);
    if(event.target.closest?.('[data-close-service-request]'))closeServiceRequestModal();
  });
  serviceRequestForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!serviceRequestForm.reportValidity())return;
    const submit=document.getElementById('submitServiceRequest');
    const original=submit.textContent;submit.disabled=true;submit.textContent='Submitting…';
    const target=document.getElementById('serviceRequestStatus');target.textContent='';target.className='service-request-status';
    try{
      const requestType=document.getElementById('serviceRequestType').value;
      const {data,error}=await window.leogoAuth.client.rpc('customer_create_service_request',{
        p_service_id:document.getElementById('serviceRequestServiceId').value,
        p_request_type:requestType,
        p_request_details:document.getElementById('serviceRequestDetails').value.trim(),
        p_service_location:document.getElementById('serviceRequestLocation').value.trim(),
        p_nearest_landmark:document.getElementById('serviceRequestLandmark').value.trim()||null,
        p_preferred_date:document.getElementById('serviceRequestPreferredDate').value||null,
        p_payment_reference:document.getElementById('serviceQuotationReference').value.trim()||null,
        p_preferred_time:document.getElementById('serviceRequestPreferredTime').value||null
      });
      if(error)throw error;
      target.textContent='✓ Request '+data.request_reference+' submitted successfully.';target.classList.add('success');
      await loadCustomerServiceRequests();
      window.setTimeout(()=>{closeServiceRequestModal();openCustomerShell('orders');},900);
    }catch(error){target.textContent=error?.message||'Service request could not be submitted.';target.classList.add('error');}
    finally{submit.disabled=false;submit.textContent=original;}
  });

  const loadCustomerServiceRequests=async()=>{
    const client=window.leogoAuth?.client;if(!client)return;
    let user=window.leogoAuth?.getUser?.()||null;
    if(!user){const s=await client.auth.getSession();user=s.data?.session?.user||null;}
    if(!user){customerServiceRequests=[];renderCustomerServiceRequests();return;}
    const {data,error}=await client.rpc('customer_list_service_requests');
    if(error){console.error('Service requests could not load:',error);return;}
    customerServiceRequests=Array.isArray(data)?data:[];
    renderCustomerServiceRequests();
  };
  const filteredCustomerServiceRequests=()=>{
    let rows=customerServiceRequests;
    if(customerActivityFilter==='products'||customerActivityFilter==='transport')return [];
    if(customerActivityFilter==='active')rows=rows.filter(r=>!['completed','cancelled','declined','quote_rejected','payment_rejected'].includes(r.request_status));
    if(customerActivityFilter==='completed')rows=rows.filter(r=>r.request_status==='completed');
    if(customerActivityFilter==='cancelled')rows=rows.filter(r=>['cancelled','declined','quote_rejected','payment_rejected'].includes(r.request_status));
    return rows;
  };
  const renderCustomerServiceRequests=()=>{
    const target=document.getElementById('customerServiceRequests');
    const rows=filteredCustomerServiceRequests();
    const count=document.getElementById('customerServiceRequestCount');if(count)count.textContent=customerServiceRequests.length;
    const active=customerServiceRequests.filter(r=>!['completed','cancelled','declined','quote_rejected','payment_rejected'].includes(r.request_status)).length;
    const dashCount=document.getElementById('customerServiceRequestDashboardCount');if(dashCount)dashCount.textContent=active;
    const dashText=document.getElementById('customerServiceRequestDashboardText');if(dashText)dashText.textContent=active?active+' open request(s)':'No open requests';
    if(target)target.innerHTML=rows.map((item)=>
      '<article class="customer-service-request-card" data-customer-service-request="'+receiptEscape(item.id)+'"><header><div><strong>'+receiptEscape(item.request_reference)+'</strong><small>'+receiptEscape(customerOrderFormatDate(item.created_at))+' · '+receiptEscape(item.service_name||'Service')+'</small></div><b>'+receiptEscape(serviceRequestStatusText(item.request_status))+'</b></header>'+
      '<div class="customer-service-request-meta"><div><small>PROVIDER</small><strong>'+receiptEscape(item.business_name||'Approved Provider')+'</strong></div><div><small>REQUEST TYPE</small><strong>'+(item.request_type==='quotation'?'Quotation':'Direct service')+'</strong></div><div><small>'+(item.provider_quote_kes?'PROVIDER QUOTE':'LOCATION')+'</small><strong>'+receiptEscape(item.provider_quote_kes?money(item.provider_quote_kes):item.service_location)+'</strong></div></div>'+
      '<small><strong>Preferred schedule:</strong> '+receiptEscape((item.preferred_date||'Flexible date')+(item.preferred_time?' · '+String(item.preferred_time).slice(0,5):''))+'</small>'+
      ((item.request_type==='direct'?Number(item.direct_request_fee_kes||0):Number(item.quotation_fee_kes||0))>0?'<small>'+(item.request_type==='direct'?'Direct request fee: ':'Quotation fee: ')+receiptEscape(money(item.request_type==='direct'?item.direct_request_fee_kes:item.quotation_fee_kes))+' · '+receiptEscape(String(item.payment_status||'').replaceAll('_',' '))+'</small>':'')+
      (item.provider_quote_notes?'<p>'+receiptEscape(item.provider_quote_notes)+'</p>':'')+
      (item.admin_notes?'<p><strong>Admin note:</strong> '+receiptEscape(item.admin_notes)+'</p>':'')+
      (item.request_status==='quoted'?'<div class="customer-service-quote-actions"><button type="button" data-service-quote-decision="'+receiptEscape(item.id)+'" data-accept="true">Accept '+receiptEscape(money(item.provider_quote_kes))+'</button><button class="reject" type="button" data-service-quote-decision="'+receiptEscape(item.id)+'" data-accept="false">Reject Quotation</button></div>':'')+
      '</article>'
    ).join('');
    const productContainer=document.getElementById('customerMarketplaceOrders');
    const productVisible=productContainer&&productContainer.innerHTML.trim();
    const empty=document.getElementById('customerActivityEmpty');
    if(empty)empty.hidden=Boolean(rows.length||productVisible);
  };
  document.addEventListener('click',async(event)=>{
    const button=event.target.closest?.('[data-service-quote-decision]');if(!button)return;
    button.disabled=true;
    try{
      const accept=button.dataset.accept==='true';
      const {error}=await window.leogoAuth.client.rpc('customer_decide_service_quote',{p_request_id:button.dataset.serviceQuoteDecision,p_accept:accept});
      if(error)throw error;
      await loadCustomerServiceRequests();
    }catch(error){window.alert(error?.message||'Quotation decision could not be saved.');button.disabled=false;}
  });
  document.addEventListener('leogo:authchange',()=>window.setTimeout(()=>{loadPublicServices();loadCustomerServiceRequests();},60));
  document.addEventListener('leogo:customer-data-refresh',()=>loadCustomerServiceRequests());
  window.setTimeout(()=>{loadPublicServices();loadCustomerServiceRequests();},550);

  const customerMobileMenu=document.getElementById('customerMobileMenu');
  const customerMobileMenuScrim=document.getElementById('customerMobileMenuScrim');
  const openCustomerMobileMenu=document.getElementById('openCustomerMobileMenu');
  const closeCustomerMobileMenu=document.getElementById('closeCustomerMobileMenu');

  const hideCustomerMobileMenu=({restoreFocus=false}={})=>{
    if(!customerMobileMenu) return;
    customerMobileMenu.classList.remove('open');
    customerMobileMenu.setAttribute('aria-hidden','true');
    customerMobileMenuScrim?.classList.remove('open');
    customerMobileMenuScrim?.setAttribute('aria-hidden','true');
    openCustomerMobileMenu?.setAttribute('aria-expanded','false');
    document.body.classList.remove('customer-mobile-menu-open');
    if(restoreFocus) openCustomerMobileMenu?.focus();
  };

  const showCustomerMobileMenu=()=>{
    if(!customerMobileMenu) return;
    closeCustomerNotifications?.();
    customerMobileMenu.classList.add('open');
    customerMobileMenu.setAttribute('aria-hidden','false');
    customerMobileMenuScrim?.classList.add('open');
    customerMobileMenuScrim?.setAttribute('aria-hidden','false');
    openCustomerMobileMenu?.setAttribute('aria-expanded','true');
    document.body.classList.add('customer-mobile-menu-open');
    window.setTimeout(()=>closeCustomerMobileMenu?.focus(),40);
  };

  openCustomerMobileMenu?.addEventListener('click',(event)=>{
    event.preventDefault();
    if(customerMobileMenu?.classList.contains('open')) hideCustomerMobileMenu({restoreFocus:true});
    else showCustomerMobileMenu();
  });
  closeCustomerMobileMenu?.addEventListener('click',()=>hideCustomerMobileMenu({restoreFocus:true}));
  customerMobileMenuScrim?.addEventListener('click',()=>hideCustomerMobileMenu({restoreFocus:true}));
  customerMobileMenu?.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-mobile-menu-close]')){
      hideCustomerMobileMenu();
    }
  });

  window.addEventListener('resize',()=>{
    if(window.innerWidth>900 && customerMobileMenu?.classList.contains('open')){
      hideCustomerMobileMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && customerMobileMenu?.classList.contains('open')) {
      hideCustomerMobileMenu({restoreFocus:true});
      return;
    }
    if (event.key === 'Escape' && customerShellModal?.classList.contains('is-open')) closeCustomerShell();
  });

})();

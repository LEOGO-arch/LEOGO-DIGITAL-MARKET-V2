// LEOGO DIGITAL MARKET V2 — Premium Phase P1 customer application and membership foundation.
(() => {
  'use strict';

  const auth = window.leogoAuth;
  const client = auth?.client;
  const consentKey = 'leogo_premium_18_consent';
  const applicationForm = document.getElementById('premiumApplicationForm');
  const paymentForm = document.getElementById('premiumPaymentForm');
  const planList = document.getElementById('premiumPlanList');
  const applicationMessage = document.getElementById('premiumApplicationMessage');
  const paymentMessage = document.getElementById('premiumPaymentMessage');
  const paymentHistory = document.getElementById('premiumPaymentHistory');
  const selectedPlanId = document.getElementById('premiumSelectedPlanId');
  const selectedPlanSummary = document.getElementById('premiumSelectedPlanSummary');
  const applicationStatus = document.getElementById('premiumApplicationStatus');
  const paymentStatus = document.getElementById('premiumPaymentStatus');
  const membershipStatus = document.getElementById('premiumMembershipStatus');
  const membershipExpiry = document.getElementById('premiumMembershipExpiry');
  const membershipRemaining = document.getElementById('premiumMembershipRemaining');
  const headerBadge = document.getElementById('premiumHeaderBadge');
  let plans = [];
  let currentUser = null;
  let currentProfile = null;
  let loadingFor = '';

  const fields = {
    realName: document.getElementById('premiumRealName'),
    idNumber: document.getElementById('premiumIdNumber'),
    phone: document.getElementById('premiumPhone'),
    idDocument: document.getElementById('premiumIdDocument'),
    displayName: document.getElementById('premiumDisplayName'),
    profilePicture: document.getElementById('premiumProfilePicture'),
    gender: document.getElementById('premiumGender'),
    orientation: document.getElementById('premiumOrientation'),
    age: document.getElementById('premiumAge'),
    location: document.getElementById('premiumLocation'),
    about: document.getElementById('premiumAbout'),
    ageConsent: document.getElementById('premiumApplicationAgeConsent'),
    responsibilityConsent: document.getElementById('premiumApplicationResponsibilityConsent'),
    privacyConsent: document.getElementById('premiumApplicationPrivacyConsent')
  };

  const setMessage = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', type === 'error');
    element.classList.toggle('is-success', type === 'success');
  };

  const prettyStatus = (value) => {
    if (!value) return 'Not started';
    return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const statusClass = (value) => {
    if (['approved', 'active', 'confirmed'].includes(value)) return 'status-approved';
    if (['submitted', 'under_review', 'pending'].includes(value)) return 'status-pending';
    if (['rejected', 'suspended', 'expired'].includes(value)) return 'status-rejected';
    return '';
  };

  const setStatusValue = (element, value, fallback) => {
    if (!element) return;
    element.textContent = value ? prettyStatus(value) : fallback;
    element.className = statusClass(value);
  };

  const formatMoney = (amount) => 'KSh ' + Number(amount || 0).toLocaleString('en-KE');
  const formatDate = (value) => value ? new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value)) : '—';

  const durationLabel = (hours) => {
    const value = Number(hours || 0);
    if (value === 24) return '24 hours';
    if (value % 24 === 0) return `${value / 24} days`;
    return `${value} hours`;
  };

  const normalizeKenyanPhone = (value) => {
    const compact = String(value || '').replace(/[\s()-]/g, '');
    if (/^0[17]\d{8}$/.test(compact)) return '+254' + compact.slice(1);
    if (/^254[17]\d{8}$/.test(compact)) return '+' + compact;
    if (/^\+254[17]\d{8}$/.test(compact)) return compact;
    return '';
  };

  const safeExtension = (file) => {
    const byType = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf'
    };
    return byType[file?.type] || '';
  };

  const runOnce = async (form, label, task) => {
    if (!form || form.dataset.submitting === 'true') return;
    const button = form.querySelector('button[type="submit"]');
    form.dataset.submitting = 'true';
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = label;
    }
    try {
      await task();
    } finally {
      form.dataset.submitting = 'false';
      if (button) {
        button.disabled = form.dataset.locked === 'true';
        button.textContent = button.dataset.originalText || 'Submit';
      }
    }
  };

  const uploadPrivateFile = async (bucket, file, maxBytes) => {
    const extension = safeExtension(file);
    if (!extension) throw new Error('Unsupported file type. Please choose one of the listed formats.');
    if (file.size > maxBytes) throw new Error(`The selected file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    const path = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from(bucket).upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false
    });
    if (error) throw error;
    return path;
  };

  const renderPlans = () => {
    if (!planList) return;
    if (!plans.length) {
      planList.innerHTML = '<p>No Premium subscription plan is currently active. Please contact LEOGO support.</p>';
      return;
    }
    planList.innerHTML = '';
    plans.forEach((plan) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'premium-plan-option';
      button.dataset.planId = plan.id;
      button.innerHTML = `<strong>${plan.name}</strong><b>${formatMoney(plan.amount_kes)}</b><span>${plan.description} · ${durationLabel(plan.duration_hours)} from Admin confirmation.</span>`;
      button.addEventListener('click', () => selectPlan(plan));
      planList.appendChild(button);
    });
  };

  const loadPlans = async () => {
    if (!client) return;
    const { data, error } = await client.from('premium_plans')
      .select('id, code, name, description, amount_kes, duration_hours')
      .eq('is_active', true).order('display_order');
    if (error) {
      setMessage(paymentMessage, 'Current Premium rates could not be loaded. Please refresh and try again.', 'error');
      return;
    }
    plans = data || [];
    renderPlans();
  };

  const selectPlan = (plan) => {
    if (!currentProfile || !['submitted', 'under_review', 'changes_requested', 'approved'].includes(currentProfile.application_status)) {
      setMessage(paymentMessage, 'Submit your Premium profile application before choosing a subscription.', 'error');
      applicationForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    document.querySelectorAll('.premium-plan-option').forEach((button) => {
      button.classList.toggle('active', button.dataset.planId === plan.id);
    });
    selectedPlanId.value = plan.id;
    selectedPlanSummary.textContent = `${plan.name}: ${formatMoney(plan.amount_kes)} for ${durationLabel(plan.duration_hours)}. The access period starts only after Admin confirmation.`;
    paymentForm.hidden = false;
    setMessage(paymentMessage, 'Paste the payment reference after paying, then submit it for Admin confirmation.');
  };

  const renderPaymentHistory = (payments) => {
    if (!paymentHistory) return;
    if (!payments?.length) {
      paymentHistory.innerHTML = '<p>No Premium payment submitted yet.</p>';
      return;
    }
    paymentHistory.innerHTML = payments.map((payment) => `
      <article><strong>${payment.plan_name} · ${formatMoney(payment.amount_kes)}</strong><span class="${statusClass(payment.payment_status)}">${prettyStatus(payment.payment_status)}</span><small>Submitted ${formatDate(payment.submitted_at)}</small></article>
    `).join('');
  };

  const setApplicationEditable = (editable) => {
    if (applicationForm) applicationForm.dataset.locked = editable ? 'false' : 'true';
    applicationForm?.querySelectorAll('input, select, textarea, button[type="submit"]').forEach((control) => {
      control.disabled = !editable;
    });
  };

  const fillExistingProfile = (profile, details, identity) => {
    if (!profile) return;
    fields.displayName.value = profile.display_name || '';
    fields.gender.value = profile.gender || '';
    fields.location.value = profile.general_location || '';
    fields.about.value = profile.about || '';
    fields.orientation.value = details?.orientation || '';
    fields.age.value = details?.age || '';
    fields.realName.value = identity?.real_name || '';
    fields.idNumber.value = identity?.id_number || '';
    fields.phone.value = identity?.phone || '';
    fields.ageConsent.checked = Boolean(identity?.age_consent);
    fields.responsibilityConsent.checked = Boolean(identity?.responsibility_consent);
    fields.privacyConsent.checked = Boolean(identity?.privacy_consent);
    fields.profilePicture.dataset.existingPath = profile.profile_picture_path || '';
    fields.idDocument.dataset.existingPath = identity?.id_document_path || '';
    fields.profilePicture.required = false;
    fields.idDocument.required = false;
  };

  const resetDashboard = () => {
    currentProfile = null;
    setStatusValue(applicationStatus, '', 'Not started');
    setStatusValue(paymentStatus, '', 'No payment');
    setStatusValue(membershipStatus, '', 'Inactive');
    if (membershipExpiry) membershipExpiry.textContent = '—';
    if (membershipRemaining) membershipRemaining.textContent = 'Choose an active plan';
    if (headerBadge) headerBadge.textContent = '18+ consent required';
    renderPaymentHistory([]);
    if (paymentForm) paymentForm.hidden = true;
  };

  const loadPremiumAccount = async (user, force = false) => {
    if (!client || !user) return;
    if (!force && loadingFor === user.id) return;
    loadingFor = user.id;
    setMessage(applicationMessage, 'Loading your Premium application…');
    const [profileResult, detailsResult, identityResult, paymentsResult, membershipResult] = await Promise.all([
      client.from('premium_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('premium_profile_details').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('premium_identity_details').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('premium_membership_payments').select('id, plan_name, amount_kes, duration_hours, payment_status, submitted_at, admin_notes').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(5),
      client.from('premium_memberships').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    if (currentUser?.id !== user.id) return;
    const firstError = [profileResult, detailsResult, identityResult, paymentsResult, membershipResult].find((result) => result.error)?.error;
    if (firstError) {
      loadingFor = '';
      setMessage(applicationMessage, 'Your Premium account could not be loaded. Please refresh and try again.', 'error');
      return;
    }
    currentProfile = profileResult.data;
    const payments = paymentsResult.data || [];
    const membership = membershipResult.data;
    if (currentProfile) fillExistingProfile(currentProfile, detailsResult.data, identityResult.data);
    setStatusValue(applicationStatus, currentProfile?.application_status, 'Not started');
    setStatusValue(paymentStatus, payments[0]?.payment_status, 'No payment');
    const active = membership && membership.membership_status === 'active' && new Date(membership.ends_at) > new Date();
    setStatusValue(membershipStatus, active ? 'active' : membership?.membership_status, 'Inactive');
    if (membershipExpiry) membershipExpiry.textContent = active ? formatDate(membership.ends_at) : '—';
    if (membershipRemaining) membershipRemaining.textContent = active ? 'Premium access is active' : 'Awaiting confirmed subscription';
    if (headerBadge) headerBadge.textContent = active ? 'Premium active' : currentProfile ? prettyStatus(currentProfile.application_status) : 'Application required';
    renderPaymentHistory(payments);
    const editable = !currentProfile || ['draft', 'changes_requested'].includes(currentProfile.application_status);
    setApplicationEditable(editable);
    setMessage(applicationMessage, currentProfile
      ? (editable ? 'Admin requested changes. Update the application and submit it again.' : `Application ${prettyStatus(currentProfile.application_status).toLowerCase()}. Admin controls the review decision.`)
      : 'Complete all required fields and private verification uploads.', currentProfile && !editable ? 'success' : '');
  };

  applicationForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !applicationForm.reportValidity()) return;
    if (sessionStorage.getItem(consentKey) !== 'accepted') {
      setMessage(applicationMessage, 'Complete the Premium 18+ consent before submitting this application.', 'error');
      return;
    }
    runOnce(applicationForm, 'Uploading securely…', async () => {
      const phone = normalizeKenyanPhone(fields.phone.value);
      if (!phone) {
        setMessage(applicationMessage, 'Enter a valid Kenyan mobile number, for example 0700 192 545.', 'error');
        fields.phone.focus();
        return;
      }
      if (Number(fields.age.value) < 18) {
        setMessage(applicationMessage, 'LEOGO Premium is available only to adults aged 18 or older.', 'error');
        fields.age.focus();
        return;
      }
      const profileFile = fields.profilePicture.files[0];
      const idFile = fields.idDocument.files[0];
      if ((!profileFile && !fields.profilePicture.dataset.existingPath) || (!idFile && !fields.idDocument.dataset.existingPath)) {
        setMessage(applicationMessage, 'Choose both a profile picture and a private ID verification document.', 'error');
        return;
      }
      try {
        let profilePath = fields.profilePicture.dataset.existingPath;
        let idPath = fields.idDocument.dataset.existingPath;
        if (profileFile) {
          setMessage(applicationMessage, 'Uploading your profile picture securely…');
          profilePath = await uploadPrivateFile('premium-profile-media', profileFile, 5 * 1024 * 1024);
        }
        if (idFile) {
          setMessage(applicationMessage, 'Uploading your private identity document…');
          idPath = await uploadPrivateFile('premium-verification', idFile, 8 * 1024 * 1024);
        }
        setMessage(applicationMessage, 'Submitting your application for Admin review…');
        const { error } = await client.rpc('submit_premium_application', {
          p_display_name: fields.displayName.value.trim(),
          p_profile_picture_path: profilePath,
          p_gender: fields.gender.value,
          p_orientation: fields.orientation.value,
          p_age: Number(fields.age.value),
          p_general_location: fields.location.value.trim(),
          p_about: fields.about.value.trim(),
          p_real_name: fields.realName.value.trim(),
          p_id_number: fields.idNumber.value.trim(),
          p_phone: phone,
          p_id_document_path: idPath,
          p_age_consent: fields.ageConsent.checked,
          p_responsibility_consent: fields.responsibilityConsent.checked,
          p_privacy_consent: fields.privacyConsent.checked
        });
        if (error) throw error;
        setMessage(applicationMessage, 'Application submitted successfully. It is now waiting for Admin review.', 'success');
        loadingFor = '';
        await loadPremiumAccount(currentUser, true);
      } catch (error) {
        const duplicate = String(error?.message || '').toLowerCase().includes('unique');
        setMessage(applicationMessage, duplicate
          ? 'That display name, ID number or phone number is already registered. Check the information and try again.'
          : (error?.message || 'The Premium application could not be submitted. Please try again.'), 'error');
      }
    });
  });

  paymentForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser || !paymentForm.reportValidity()) return;
    runOnce(paymentForm, 'Submitting securely…', async () => {
      const plan = plans.find((item) => item.id === selectedPlanId.value);
      if (!plan) {
        setMessage(paymentMessage, 'Select an active Premium plan first.', 'error');
        return;
      }
      setMessage(paymentMessage, 'Submitting your payment for Admin confirmation…');
      const { error } = await client.from('premium_membership_payments').insert({
        user_id: currentUser.id,
        plan_id: plan.id,
        payment_reference: document.getElementById('premiumPaymentReference').value.trim()
      });
      if (error) {
        setMessage(paymentMessage, error.message || 'The payment could not be submitted. Please try again.', 'error');
        return;
      }
      paymentForm.reset();
      paymentForm.hidden = true;
      document.querySelectorAll('.premium-plan-option').forEach((button) => button.classList.remove('active'));
      setMessage(paymentMessage, 'Payment submitted successfully. Membership will begin after Admin confirms it.', 'success');
      loadingFor = '';
      await loadPremiumAccount(currentUser, true);
    });
  });

  const handleUser = (user) => {
    currentUser = user || null;
    loadingFor = '';
    if (!currentUser) {
      resetDashboard();
      setMessage(applicationMessage, 'Log in to start or view your Premium application.');
      return;
    }
    const metadata = currentUser.user_metadata || {};
    if (!fields.realName.value) fields.realName.value = metadata.full_name || metadata.name || '';
    if (!fields.phone.value) fields.phone.value = metadata.phone || '';
    loadPremiumAccount(currentUser);
  };

  document.addEventListener('leogo:authchange', (event) => handleUser(event.detail?.user));
  if (!client) {
    setMessage(applicationMessage, 'The secure Premium service did not load. Please refresh the page.', 'error');
    return;
  }
  loadPlans();
  handleUser(auth.getUser());
})();

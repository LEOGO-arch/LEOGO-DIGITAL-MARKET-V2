// LEOGO DIGITAL MARKET V2 — Phase 1(B) customer authentication.
(() => {
  'use strict';

  const PROJECT_URL = 'https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const PRODUCTION_URL = 'https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/';
  const supabaseFactory = window.supabase?.createClient;

  const statusBox = document.getElementById('authPreviewStatus');
  const loginForm = document.getElementById('customerLoginForm');
  const registerForm = document.getElementById('customerRegisterForm');
  const resetRequestForm = document.getElementById('resetPasswordRequestForm');
  const resetUpdateForm = document.getElementById('resetPasswordUpdateForm');
  const signedInPanel = document.getElementById('authSignedInPanel');
  const guestControls = document.getElementById('authGuestControls');
  const logoutButton = document.getElementById('customerLogoutButton');
  const googleLoginButton = document.getElementById('customerGoogleLoginButton');
  const headerLoginButton = document.getElementById('openLoginShell');
  const authNavButton = document.querySelector('.customer-shell-nav [data-customer-view="auth"]');
  const profileForm = document.getElementById('customerProfileForm');
  const profileStatus = document.getElementById('profileSaveStatus');
  const profileCompletionText = document.getElementById('profileCompletionText');
  const profileCompletionBar = document.getElementById('profileCompletionBar');
  const profileFields = {
    fullName: document.getElementById('profileFullName'),
    phone: document.getElementById('profilePhone'),
    email: document.getElementById('profileEmail'),
    county: document.getElementById('profileCounty'),
    subCounty: document.getElementById('profileSubCounty'),
    estate: document.getElementById('profileEstate'),
    nearestLandmark: document.getElementById('profileNearestLandmark')
  };
  let currentSession = null;
  let authReady = false;
  let profileLoadedFor = '';

  const setStatus = (message = '', type = '') => {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.classList.toggle('is-error', type === 'error');
    statusBox.classList.toggle('is-success', type === 'success');
  };

  const friendlyAuthError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'The email or password is incorrect. Please try again.';
    if (message.includes('email not confirmed')) return 'Please open the confirmation email from LEOGO before logging in.';
    if (message.includes('user already registered') || message.includes('already been registered')) return 'An account already exists with this email. Please log in instead.';
    if (message.includes('password') && (message.includes('short') || message.includes('least'))) return 'Use a password containing at least 8 characters.';
    if (message.includes('rate limit')) return 'Too many attempts were made. Please wait briefly and try again.';
    if (message.includes('provider is not enabled') || message.includes('unsupported provider')) return 'Google login is not available yet. Please use email login while LEOGO completes the Google connection.';
    if (message.includes('network') || message.includes('fetch')) return 'We could not reach the secure login service. Check your internet connection and try again.';
    return error?.message || 'The request could not be completed. Please try again.';
  };

  const firstName = (session) => {
    const fullName = session?.user?.user_metadata?.full_name?.trim();
    return fullName ? fullName.split(/\s+/)[0] : 'Customer';
  };

  const initials = (session) => {
    const fullName = session?.user?.user_metadata?.full_name?.trim();
    if (!fullName) return 'LC';
    return fullName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  };

  const updateAuthUI = (session) => {
    currentSession = session || null;
    const signedIn = Boolean(currentSession?.user);
    document.documentElement.classList.toggle('customer-is-authenticated', signedIn);
    if (headerLoginButton) {
      headerLoginButton.textContent = signedIn ? firstName(currentSession) : 'Login';
      headerLoginButton.dataset.openCustomerView = signedIn ? 'dashboard' : 'auth';
      headerLoginButton.setAttribute('aria-label', signedIn ? 'Open customer dashboard' : 'Login to LEOGO');
    }
    if (authNavButton) {
      authNavButton.innerHTML = signedIn ? '<span>⇥</span>Account Session' : '<span>⇥</span>Login & Register';
    }
    if (guestControls) guestControls.hidden = signedIn;
    if (signedInPanel) signedInPanel.hidden = !signedIn;
    const name = currentSession?.user?.user_metadata?.full_name || firstName(currentSession);
    const email = currentSession?.user?.email || '';
    const phone = currentSession?.user?.user_metadata?.phone || '';
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText('signedInCustomerName', name);
    setText('signedInCustomerEmail', email);
    setText('signedInCustomerPhone', phone || 'Phone not added');
    setText('dashboardCustomerName', signedIn ? 'Welcome, ' + firstName(currentSession) : 'Welcome to LEOGO');
    setText('dashboardCustomerAvatar', signedIn ? initials(currentSession) : 'LC');
    setText('profileCustomerAvatar', signedIn ? initials(currentSession) : 'LC');
    if (!signedIn) profileLoadedFor = '';
  };

  const openAuth = (message = 'Please log in or create an account to continue.') => {
    window.leogoOpenCustomerView?.('auth', { skipAuthGuard: true });
    setStatus(message, 'error');
    window.setTimeout(() => document.getElementById('loginEmail')?.focus(), 80);
  };

  const runOnce = async (form, task) => {
    if (!form || form.dataset.submitting === 'true') return;
    const button = form.querySelector('button[type="submit"]');
    form.dataset.submitting = 'true';
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = 'Please wait…';
    }
    try {
      await task();
    } finally {
      form.dataset.submitting = 'false';
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Submit';
      }
    }
  };

  const normalizeKenyanPhone = (value) => {
    const compact = String(value || '').replace(/[\s()-]/g, '');
    if (/^0[17]\d{8}$/.test(compact)) return '+254' + compact.slice(1);
    if (/^254[17]\d{8}$/.test(compact)) return '+' + compact;
    if (/^\+254[17]\d{8}$/.test(compact)) return compact;
    return '';
  };

  const setProfileStatus = (message = '', type = '') => {
    if (!profileStatus) return;
    profileStatus.textContent = message;
    profileStatus.classList.toggle('is-error', type === 'error');
    profileStatus.classList.toggle('is-success', type === 'success');
  };

  const updateProfileCompletion = () => {
    const requiredValues = [
      profileFields.fullName?.value.trim(),
      profileFields.phone?.value.trim(),
      profileFields.email?.value.trim(),
      profileFields.county?.value,
      profileFields.subCounty?.value,
      profileFields.estate?.value.trim()
    ];
    const completed = requiredValues.filter(Boolean).length;
    const percentage = Math.round((completed / requiredValues.length) * 100);
    if (profileCompletionText) profileCompletionText.textContent = percentage + '%';
    if (profileCompletionBar) profileCompletionBar.style.width = percentage + '%';
  };

  const applyProfileValues = (user, profile = null) => {
    if (!profileForm || !user) return;
    const metadata = user.user_metadata || {};
    if (profileFields.fullName) profileFields.fullName.value = profile?.full_name || metadata.full_name || metadata.name || '';
    if (profileFields.phone) profileFields.phone.value = profile?.phone || metadata.phone || '';
    if (profileFields.email) profileFields.email.value = user.email || '';
    if (profileFields.county) {
      profileFields.county.value = profile?.county || '';
      profileFields.county.dispatchEvent(new Event('change'));
    }
    if (profileFields.subCounty) profileFields.subCounty.value = profile?.sub_county || '';
    if (profileFields.estate) profileFields.estate.value = profile?.estate || '';
    if (profileFields.nearestLandmark) profileFields.nearestLandmark.value = profile?.nearest_landmark || '';
    updateProfileCompletion();
  };

  const loadCustomerProfile = async (session, force = false) => {
    const user = session?.user;
    if (!user || !profileForm) return;
    if (!force && profileLoadedFor === user.id) return;
    profileLoadedFor = user.id;
    applyProfileValues(user);
    setProfileStatus('Loading your saved profile…');
    const { data, error } = await authClient
      .from('customer_profiles')
      .select('full_name, phone, county, sub_county, estate, nearest_landmark')
      .eq('user_id', user.id)
      .maybeSingle();
    if (currentSession?.user?.id !== user.id) return;
    if (error) {
      profileLoadedFor = '';
      setProfileStatus('Your profile could not be loaded. Please refresh and try again.', 'error');
      return;
    }
    applyProfileValues(user, data);
    setProfileStatus(data ? 'Your saved profile is ready.' : 'Complete your delivery profile and select Save Profile.', data ? 'success' : '');
  };

  if (!supabaseFactory) {
    setStatus('The secure login service did not load. Please refresh the page and try again.', 'error');
    return;
  }

  const authClient = supabaseFactory(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  window.leogoAuth = {
    isReady: () => authReady,
    isAuthenticated: () => Boolean(currentSession?.user),
    getUser: () => currentSession?.user || null,
    requireLogin: (message) => {
      if (currentSession?.user) return true;
      openAuth(message);
      return false;
    },
    client: authClient
  };

  document.addEventListener('submit', (event) => {
    const protectedForm = event.target.closest?.('[data-requires-auth]');
    if (!protectedForm || currentSession?.user) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAuth(protectedForm.dataset.authMessage || 'Please log in before submitting this request.');
  }, true);

  document.addEventListener('click', (event) => {
    const protectedAction = event.target.closest?.('[data-requires-auth]');
    if (!protectedAction || protectedAction.tagName === 'FORM' || currentSession?.user) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAuth(protectedAction.dataset.authMessage || 'Please log in before continuing.');
  }, true);

  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    runOnce(loginForm, async () => {
      setStatus('Logging you in securely…');
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(friendlyAuthError(error), 'error');
        return;
      }
      updateAuthUI(data.session);
      setStatus('Login successful. Welcome back to LEOGO.', 'success');
      loginForm.reset();
      window.setTimeout(() => window.leogoOpenCustomerView?.('dashboard'), 500);
    });
  });

  registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!registerForm.reportValidity()) return;
    runOnce(registerForm, async () => {
      const fullName = document.getElementById('registerFullName').value.trim();
      const phone = normalizeKenyanPhone(document.getElementById('registerPhone').value);
      const email = document.getElementById('registerEmail').value.trim().toLowerCase();
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerConfirmPassword').value;
      const accepted = document.getElementById('registerTerms').checked;
      if (!phone) {
        setStatus('Enter a valid Kenyan mobile number, for example 0700 192 545.', 'error');
        return;
      }
      if (password.length < 8) {
        setStatus('Create a password containing at least 8 characters.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        setStatus('The two passwords do not match.', 'error');
        return;
      }
      if (!accepted) {
        setStatus('Please accept the customer account terms to continue.', 'error');
        return;
      }
      setStatus('Creating your secure customer account…');
      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: PRODUCTION_URL,
          data: { full_name: fullName, phone }
        }
      });
      if (error) {
        setStatus(friendlyAuthError(error), 'error');
        return;
      }
      registerForm.reset();
      if (data.session) {
        updateAuthUI(data.session);
        setStatus('Account created successfully. You are now logged in.', 'success');
        window.setTimeout(() => window.leogoOpenCustomerView?.('dashboard'), 700);
      } else {
        setStatus('Account created. Check your email and use the LEOGO confirmation link to activate it.', 'success');
      }
    });
  });

  googleLoginButton?.addEventListener('click', async () => {
    if (googleLoginButton.disabled) return;
    googleLoginButton.disabled = true;
    setStatus('Opening secure Google login…');
    const { error } = await authClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: PRODUCTION_URL,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) {
      googleLoginButton.disabled = false;
      setStatus(friendlyAuthError(error), 'error');
    }
  });

  profileForm?.addEventListener('input', updateProfileCompletion);
  profileForm?.addEventListener('change', updateProfileCompletion);

  profileForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentSession?.user) {
      openAuth('Please log in before saving your profile.');
      return;
    }
    if (!profileForm.reportValidity()) return;
    runOnce(profileForm, async () => {
      const fullName = profileFields.fullName.value.trim();
      const phone = normalizeKenyanPhone(profileFields.phone.value);
      if (!phone) {
        setProfileStatus('Enter a valid Kenyan mobile number, for example 0700 192 545.', 'error');
        profileFields.phone.focus();
        return;
      }
      const payload = {
        user_id: currentSession.user.id,
        full_name: fullName,
        phone,
        county: profileFields.county.value,
        sub_county: profileFields.subCounty.value,
        estate: profileFields.estate.value.trim(),
        nearest_landmark: profileFields.nearestLandmark.value.trim() || null,
        updated_at: new Date().toISOString()
      };
      setProfileStatus('Saving your profile securely…');
      const { error } = await authClient
        .from('customer_profiles')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) {
        setProfileStatus('Your profile could not be saved. Please check the information and try again.', 'error');
        return;
      }
      const metadata = currentSession.user.user_metadata || {};
      const { data: updatedUser, error: metadataError } = await authClient.auth.updateUser({
        data: { ...metadata, full_name: fullName, phone }
      });
      if (updatedUser?.user) {
        currentSession = { ...currentSession, user: updatedUser.user };
        updateAuthUI(currentSession);
      }
      profileFields.phone.value = phone;
      profileLoadedFor = currentSession.user.id;
      updateProfileCompletion();
      setProfileStatus(
        metadataError ? 'Profile saved. Your dashboard name may update after the next login.' : 'Profile saved successfully.',
        metadataError ? '' : 'success'
      );
    });
  });

  document.getElementById('showResetPassword')?.addEventListener('click', () => {
    if (resetRequestForm) resetRequestForm.hidden = false;
    document.getElementById('resetEmail')?.focus();
    setStatus('');
  });

  resetRequestForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!resetRequestForm.reportValidity()) return;
    runOnce(resetRequestForm, async () => {
      const email = document.getElementById('resetEmail').value.trim().toLowerCase();
      const { error } = await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: PRODUCTION_URL + '?mode=reset-password'
      });
      if (error) {
        setStatus(friendlyAuthError(error), 'error');
        return;
      }
      setStatus('Password reset link sent. Please check your email.', 'success');
      resetRequestForm.reset();
    });
  });

  resetUpdateForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!resetUpdateForm.reportValidity()) return;
    runOnce(resetUpdateForm, async () => {
      const password = document.getElementById('recoveryPassword').value;
      const confirmation = document.getElementById('recoveryPasswordConfirm').value;
      if (password.length < 8 || password !== confirmation) {
        setStatus(password.length < 8 ? 'Use at least 8 characters.' : 'The two passwords do not match.', 'error');
        return;
      }
      const { error } = await authClient.auth.updateUser({ password });
      if (error) {
        setStatus(friendlyAuthError(error), 'error');
        return;
      }
      resetUpdateForm.reset();
      resetUpdateForm.hidden = true;
      setStatus('Password updated successfully. Your account is signed in.', 'success');
    });
  });

  logoutButton?.addEventListener('click', async () => {
    if (logoutButton.disabled) return;
    logoutButton.disabled = true;
    setStatus('Signing out…');
    const { error } = await authClient.auth.signOut();
    logoutButton.disabled = false;
    if (error) {
      setStatus(friendlyAuthError(error), 'error');
      return;
    }
    updateAuthUI(null);
    setStatus('You have logged out successfully.', 'success');
  });

  authClient.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session);
    if (session) loadCustomerProfile(session);
    if (event === 'PASSWORD_RECOVERY') {
      window.leogoOpenCustomerView?.('auth', { skipAuthGuard: true });
      if (guestControls) guestControls.hidden = true;
      if (signedInPanel) signedInPanel.hidden = true;
      if (resetUpdateForm) resetUpdateForm.hidden = false;
      setStatus('Create a new password for your LEOGO account.', 'success');
    }
  });

  authClient.auth.getSession().then(({ data, error }) => {
    authReady = true;
    if (error) {
      updateAuthUI(null);
      setStatus(friendlyAuthError(error), 'error');
      return;
    }
    updateAuthUI(data.session);
    if (data.session) loadCustomerProfile(data.session);
    if (data.session && window.location.hash.includes('access_token')) {
      const provider = data.session.user?.app_metadata?.provider;
      history.replaceState({}, document.title, PRODUCTION_URL);
      setStatus(provider === 'google' ? 'Google login successful. Welcome to LEOGO.' : 'Email confirmed successfully. You are now logged in.', 'success');
      window.setTimeout(() => window.leogoOpenCustomerView?.('dashboard'), 80);
    }
  }).catch((error) => {
    authReady = true;
    updateAuthUI(null);
    setStatus(friendlyAuthError(error), 'error');
  });
})();

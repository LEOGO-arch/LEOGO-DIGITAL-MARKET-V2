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
  const headerLoginButton = document.getElementById('openLoginShell');
  const authNavButton = document.querySelector('.customer-shell-nav [data-customer-view="auth"]');
  let currentSession = null;
  let authReady = false;

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
    if (/^07\d{8}$/.test(compact)) return '+254' + compact.slice(1);
    if (/^2547\d{8}$/.test(compact)) return '+' + compact;
    if (/^\+2547\d{8}$/.test(compact)) return compact;
    return '';
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
    if (data.session && window.location.hash.includes('access_token')) {
      history.replaceState({}, document.title, PRODUCTION_URL);
      setStatus('Email confirmed successfully. You are now logged in.', 'success');
    }
  }).catch((error) => {
    authReady = true;
    updateAuthUI(null);
    setStatus(friendlyAuthError(error), 'error');
  });
})();

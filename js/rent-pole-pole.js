// Separate rent application intake. No customer action credits funds or releases landlord payouts.
(() => {
  'use strict';
  const client = window.leogoAuth?.client;
  if (!client) return;
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const walletPanels = document.querySelector('.customer-view[data-customer-panel="wallet"] .wallet-tab-panels');
  const container = document.createElement('section');
  container.id = 'lipa-rent-pole-pole';
  container.className = 'section rent-pole-pole';
  container.innerHTML = `<div class="rent-intro"><div><small>LEOGO WALLET • PROPERTY</small><h2>🏡 Lipa Rent Pole Pole</h2><p>Apply to pay your rent in instalments through LEOGO. Applications, landlord accounts and terms must be verified before any rent collection or settlement.</p></div><button type="button" id="rentOpenWallet">My Rent Applications</button></div>
    <article class="rent-apply-shortcut">
      <div><span aria-hidden="true">🏡</span><div><h3>Apply for Rent Instalments</h3><p>Open the application when you are ready. The form stays hidden until you select it.</p></div></div>
      <button type="button" id="rentToggleApplication" aria-controls="rentApplicationForm" aria-expanded="false">Open Application Form</button>
    </article>
    <form id="rentApplicationForm" class="rent-form" data-requires-auth hidden>
      <h3>Apply for Rent Instalments</h3>
      <div class="rent-fields">
        <label>Full legal name<input name="full_name" maxlength="150" required autocomplete="name"></label>
        <label>National ID / Passport number<input name="identity_number" maxlength="35" required autocomplete="off"></label>
        <label>Passport photograph (JPG, PNG or WebP; max 2MB)<input name="portrait" type="file" accept="image/jpeg,image/png,image/webp" required></label>
        <label>House type<select name="house_type" id="rentHouseType" required><option value="">Choose house type</option></select></label>
        <label>Monthly rent (KSh)<input name="monthly_rent" type="number" min="1" max="10000000" step="0.01" required></label>
        <label>Deposit, if applicable (KSh)<input name="deposit_amount" type="number" min="0" max="10000000" step="0.01" value="0"></label>
        <label>Rent billing terms<select name="payment_frequency" required><option value="monthly">Monthly</option><option value="quarterly">Quarterly (3 months)</option><option value="four_months">Every 4 months</option><option value="half_yearly">Half-yearly (6 months)</option><option value="annually">Annually (12 months)</option></select></label>
        <label>Preferred instalment payment schedule<select name="preferred_installment_cadence" required><option value="">Choose your preference</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Preferred minimum amount per instalment (KSh)<input name="preferred_minimum_installment" type="number" min="1" max="10000000" step="0.01" required placeholder="Enter amount" aria-describedby="rentInstallmentGuidance"><small id="rentInstallmentGuidance" class="rent-installment-guidance" aria-live="polite">Enter monthly rent and choose a schedule to see the minimum.</small></label>
        <label>County<select name="county" id="rentCounty" required><option value="">Loading counties…</option></select></label>
        <label>Sub-county<select name="sub_county" id="rentSubCounty" required disabled><option value="">Choose county first</option></select></label>
        <label>Estate / Area<input name="estate" maxlength="150" required></label>
        <label class="rent-map-pin-field">Map pin or location URL (optional)
          <input name="map_pin" maxlength="400" placeholder="https://maps.google.com/...">
          <button type="button" id="rentUseCurrentLocation" class="rent-map-pin-button">📍 Use my current location</button>
          <small id="rentMapPinStatus" class="rent-map-pin-status" role="status" aria-live="polite">Your browser will ask for permission only after you tap the location button.</small>
        </label>
        <label>Landlord payment account (optional)<input name="landlord_account" maxlength="180" placeholder="Name, bank/till/paybill, account reference"></label>
      </div>
      <label class="rent-consent"><input type="checkbox" name="reminder_opt_in" value="yes"> I would like to receive optional rent instalment reminders when LEOGO enables them.</label>
      <p class="rent-preference-note">Your preferred instalment amount and schedule are requests for Admin review. They do not change the approved rent billing terms or guarantee a reminder service.</p>
      <label>Additional description (optional)<textarea name="description" rows="3" maxlength="1500"></textarea></label>
      <label class="rent-consent"><input type="checkbox" required> I consent to LEOGO processing the identification and property information for rent application review and landlord verification. I understand that submitting an application does not activate a payment plan.</label>
      <button type="submit">Submit for Admin Review</button><p id="rentApplicationStatus" role="status" aria-live="polite"></p>
    </form></section>`;
  document.querySelector('#vacant-houses')?.after(container);
  const propertyButton = document.createElement('a');
  propertyButton.href = '#lipa-rent-pole-pole';
  propertyButton.className = 'rent-property-shortcut';
  propertyButton.textContent = '🏡 Apply for Lipa Rent Pole Pole';
  document.querySelector('#vacant-houses .vh-head-actions')?.append(propertyButton);
  const walletPanel = document.createElement('section');
  walletPanel.id = 'walletTabRent';
  walletPanel.className = 'wallet-tab-panel';
  walletPanel.dataset.walletTabPanel = 'rent';
  walletPanel.setAttribute('role','tabpanel');
  walletPanel.hidden = true;
  walletPanel.innerHTML = '<article class="wallet-card"><h4>🏡 My Rent Instalment Applications</h4><p>Applications are reviewed by LEOGO Admin. No collection or landlord settlement starts until verification.</p><div id="rentApplicationList">Sign in to view your applications.</div><a href="#lipa-rent-pole-pole" id="rentApplyAgain">Apply for rent instalments</a></article>';
  walletPanels?.append(walletPanel);
  const rentTab = document.querySelector('[data-wallet-tab="rent"]');
  rentTab?.addEventListener('click', () => {
    document.querySelectorAll('[data-wallet-tab]').forEach(b => { b.classList.toggle('active',b===rentTab); b.setAttribute('aria-selected',b===rentTab?'true':'false'); });
    document.querySelectorAll('[data-wallet-tab-panel]').forEach(p => { p.hidden = p!==walletPanel; p.classList.toggle('active',p===walletPanel); });
  });
  document.querySelectorAll('[data-wallet-tab]:not([data-wallet-tab="rent"])').forEach(b => b.addEventListener('click',() => { walletPanel.hidden=true; walletPanel.classList.remove('active'); rentTab?.classList.remove('active'); rentTab?.setAttribute('aria-selected','false'); }));
  const form = document.getElementById('rentApplicationForm');
  const toggleApplication = document.getElementById('rentToggleApplication');
  const setApplicationOpen = (open, scroll = false) => {
    form.hidden = !open;
    toggleApplication.setAttribute('aria-expanded', String(open));
    toggleApplication.textContent = open ? 'Hide Application Form' : 'Open Application Form';
    if (scroll) (open ? form : toggleApplication).scrollIntoView({behavior:'smooth',block:'start'});
  };
  toggleApplication.addEventListener('click', () => setApplicationOpen(form.hidden, true));
  // The wallet's explicit Apply link should open the form, unlike the general
  // category shortcut which simply scrolls visitors to the compact card.
  document.getElementById('rentApplyAgain')?.addEventListener('click', () => setApplicationOpen(true));
  propertyButton.addEventListener('click', () => setApplicationOpen(true));
  const status = document.getElementById('rentApplicationStatus');
  const county = document.getElementById('rentCounty');
  const sub = document.getElementById('rentSubCounty');
  const mapPinInput = form.elements.namedItem('map_pin');
  const mapPinButton = document.getElementById('rentUseCurrentLocation');
  const mapPinStatus = document.getElementById('rentMapPinStatus');
  let subcounties = [];

  const minimumInstallmentFor = (monthlyRent, cadence) => {
    const periodsPerMonth = { daily:31, weekly:4, monthly:1 }[cadence];
    if (!periodsPerMonth || !Number.isFinite(monthlyRent) || monthlyRent <= 0) return null;
    return Math.ceil(monthlyRent / periodsPerMonth);
  };
  const monthlyRentInput = form.elements.namedItem('monthly_rent');
  const cadenceInput = form.elements.namedItem('preferred_installment_cadence');
  const minimumInstallmentInput = form.elements.namedItem('preferred_minimum_installment');
  const installmentGuidance = document.getElementById('rentInstallmentGuidance');
  const syncInstallmentMinimum = () => {
    const minimum = minimumInstallmentFor(Number(monthlyRentInput.value), cadenceInput.value);
    if (minimum === null) {
      minimumInstallmentInput.min = '1';
      installmentGuidance.textContent = monthlyRentInput.value && Number(monthlyRentInput.value) > 0
        ? 'Choose a payment schedule to calculate its minimum installment.'
        : 'Enter monthly rent and choose a schedule to see the minimum.';
      minimumInstallmentInput.setCustomValidity('');
      return;
    }
    minimumInstallmentInput.min = String(minimum);
    installmentGuidance.textContent = 'Minimum for this schedule: KSh ' + minimum.toLocaleString('en-KE') + ' per installment.';
    const entered = Number(minimumInstallmentInput.value);
    minimumInstallmentInput.setCustomValidity(
      minimumInstallmentInput.value && entered < minimum
        ? 'The minimum installment for this schedule is KSh ' + minimum.toLocaleString('en-KE') + ' or more.'
        : ''
    );
  };
  monthlyRentInput.addEventListener('input', syncInstallmentMinimum);
  cadenceInput.addEventListener('change', syncInstallmentMinimum);
  minimumInstallmentInput.addEventListener('input', syncInstallmentMinimum);
  syncInstallmentMinimum();

  const loadOptions = async () => {
    const [types, counties, subs] = await Promise.all([
      client.from('rent_house_types').select('code,label').eq('is_active',true).order('sort_order'),
      client.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    if (types.error || counties.error || subs.error) { status.textContent = 'Rent application options are temporarily unavailable.'; return; }
    document.getElementById('rentHouseType').innerHTML = '<option value="">Choose house type</option>' + (types.data || []).map(t => `<option value="${escapeHtml(t.code)}">${escapeHtml(t.label)}</option>`).join('');
    county.innerHTML = '<option value="">Select county</option>' + (counties.data || []).map(c => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)}</option>`).join('');
    subcounties = subs.data || [];
  };
  county.addEventListener('change', () => {
    sub.innerHTML = '<option value="">Select sub-county</option>' + subcounties.filter(s => s.county_code === county.value).map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.name)}</option>`).join('');
    sub.disabled = !county.value;
  });
  mapPinButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      mapPinStatus.textContent = 'This browser cannot access device location. You can paste a Google Maps link instead.';
      return;
    }
    mapPinButton.disabled = true;
    mapPinButton.textContent = 'Finding your location…';
    mapPinStatus.textContent = 'Waiting for your device location permission. The pin will be added to this application only if you submit it.';
    navigator.geolocation.getCurrentPosition(position => {
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        mapPinStatus.textContent = 'Your device returned an invalid location. Please try again or paste a Maps link.';
      } else {
        const mapUrl = new URL('https://www.google.com/maps/search/');
        mapUrl.searchParams.set('api', '1');
        mapUrl.searchParams.set('query', `${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        mapPinInput.value = mapUrl.href;
        mapPinInput.dispatchEvent(new Event('input', {bubbles:true}));
        mapPinStatus.textContent = 'Location pin added. Check the Maps link before submitting.';
      }
      mapPinButton.disabled = false;
      mapPinButton.textContent = '📍 Use my current location';
    }, error => {
      mapPinStatus.textContent = error.code === 1
        ? 'Location permission was denied. Allow location access in browser settings, or paste a Maps link instead.'
        : error.code === 2
          ? 'Your device could not determine its location. Check GPS/location settings and try again.'
          : error.code === 3
            ? 'Location lookup timed out. Try again where GPS reception is better, or paste a Maps link.'
            : 'Location could not be retrieved. Try again or paste a Maps link.';
      mapPinButton.disabled = false;
      mapPinButton.textContent = '📍 Use my current location';
    }, {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
  });
  const currentUser = async () => (await client.auth.getUser()).data?.user;
  const refresh = async () => {
    const list = document.getElementById('rentApplicationList');
    const user = await currentUser();
    if (!user) { list.textContent = 'Sign in to view your applications.'; return; }
    const {data,error} = await client.from('rent_installment_applications').select('id,house_type,monthly_rent,payment_frequency,preferred_installment_cadence,preferred_minimum_installment,reminder_opt_in,county,estate,status,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(30);
    if (error) { list.textContent = 'Could not load applications. Try again later.'; return; }
    list.innerHTML = data?.length ? data.map(a => `<article class="rent-application-item"><strong>${escapeHtml(a.house_type)} • KSh ${Number(a.monthly_rent).toLocaleString('en-KE')}/month</strong><span>${escapeHtml(a.estate)} • ${escapeHtml(a.status.replaceAll('_',' '))}</span>${a.preferred_installment_cadence?`<small>Preferred: ${escapeHtml(a.preferred_installment_cadence)}, minimum KSh ${Number(a.preferred_minimum_installment).toLocaleString('en-KE')} • Reminders: ${a.reminder_opt_in?'requested':'not requested'}</small>`:''}<small>${new Date(a.created_at).toLocaleDateString('en-KE')}</small></article>`).join('') : '<p>No rent applications yet.</p>';
  };
  const goWallet = () => {
    document.querySelector('[data-open-customer-view="wallet"]')?.click();
    document.querySelector('[data-wallet-tab="rent"]')?.click();
    refresh();
  };
  document.getElementById('rentOpenWallet').addEventListener('click',goWallet);
  document.querySelector('[data-wallet-tab="rent"]')?.addEventListener('click',refresh);
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    status.textContent = '';
    try {
      const user = await currentUser();
      if (!user) throw new Error('Please sign in before submitting your application.');
      const fd = new FormData(form);
      const minInstalment = Number(fd.get('preferred_minimum_installment'));
      const monthlyRent = Number(fd.get('monthly_rent'));
      const cadence = String(fd.get('preferred_installment_cadence') || '');
      const requiredMinimum = minimumInstallmentFor(monthlyRent, cadence);
      if (requiredMinimum === null) throw new Error('Enter a valid monthly rent and choose daily, weekly or monthly instalments.');
      if (!Number.isFinite(minInstalment) || minInstalment < requiredMinimum) {
        throw new Error('The minimum installment for ' + cadence + ' payments is KSh ' + requiredMinimum.toLocaleString('en-KE') + ' or more.');
      }
      const photo = fd.get('portrait');
      if (!(photo instanceof File) || !['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 2*1024*1024 || !photo.size) throw new Error('Select a JPG, PNG or WebP photograph of up to 2MB.');
      button.disabled = true;
      const record = {
        customer_id:user.id,full_name:String(fd.get('full_name')).trim(),identity_number:String(fd.get('identity_number')).trim(),
        house_type:String(fd.get('house_type')),monthly_rent:monthlyRent,deposit_amount:Number(fd.get('deposit_amount') || 0),
        preferred_installment_cadence:String(fd.get('preferred_installment_cadence')),preferred_minimum_installment:minInstalment,
        reminder_opt_in:fd.get('reminder_opt_in')==='yes',
        payment_frequency:String(fd.get('payment_frequency')),county:String(fd.get('county')),sub_county:String(fd.get('sub_county')),
        estate:String(fd.get('estate')).trim(),map_pin:String(fd.get('map_pin')).trim() || null,
        landlord_account:String(fd.get('landlord_account')).trim() || null,description:String(fd.get('description')).trim() || null
      };
      const {data:application,error:insertError} = await client.from('rent_installment_applications').insert(record).select('id').single();
      if (insertError) throw insertError;
      const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/${application.id}.${ext}`;
      const {error:uploadError} = await client.storage.from('rent-applicant-private').upload(path,photo,{contentType:photo.type,upsert:false});
      if (uploadError) { status.textContent = 'Application saved, but photo upload failed. Contact LEOGO support with application reference ' + application.id + '.'; return; }
      const {error:photoError} = await client.from('rent_installment_applications').update({portrait_path:path}).eq('id',application.id);
      if (photoError) { status.textContent = 'Application saved; photo verification requires support. Reference: ' + application.id; return; }
      form.reset(); county.dispatchEvent(new Event('change'));
      status.textContent = 'Application submitted for LEOGO Admin review. No payment is due until verified terms are issued.';
      refresh();
    } catch (error) { status.textContent = error.message || 'Submission failed. Please try again.'; }
    finally { button.disabled = false; }
  });
  document.addEventListener('leogo:authchange',refresh);
  loadOptions();
})();

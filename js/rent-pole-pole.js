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
    <form id="rentApplicationForm" class="rent-form" data-requires-auth>
      <h3>Apply for Rent Instalments</h3>
      <div class="rent-fields">
        <label>Full legal name<input name="full_name" maxlength="150" required autocomplete="name"></label>
        <label>National ID / Passport number<input name="identity_number" maxlength="35" required autocomplete="off"></label>
        <label>Passport photograph (JPG, PNG or WebP; max 2MB)<input name="portrait" type="file" accept="image/jpeg,image/png,image/webp" required></label>
        <label>House type<select name="house_type" id="rentHouseType" required><option value="">Choose house type</option></select></label>
        <label>Monthly rent (KSh)<input name="monthly_rent" type="number" min="1" max="10000000" step="0.01" required></label>
        <label>Deposit, if applicable (KSh)<input name="deposit_amount" type="number" min="0" max="10000000" step="0.01" value="0"></label>
        <label>Payment frequency<select name="payment_frequency" required><option value="monthly">Monthly</option><option value="quarterly">Quarterly (3 months)</option><option value="four_months">Every 4 months</option><option value="half_yearly">Half-yearly (6 months)</option><option value="annually">Annually (12 months)</option></select></label>
        <label>County<select name="county" id="rentCounty" required><option value="">Loading counties…</option></select></label>
        <label>Sub-county<select name="sub_county" id="rentSubCounty" required disabled><option value="">Choose county first</option></select></label>
        <label>Estate / Area<input name="estate" maxlength="150" required></label>
        <label>Map pin or location URL (optional)<input name="map_pin" maxlength="400" placeholder="https://maps.google.com/..."></label>
        <label>Landlord payment account (optional)<input name="landlord_account" maxlength="180" placeholder="Name, bank/till/paybill, account reference"></label>
      </div>
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
  const status = document.getElementById('rentApplicationStatus');
  const county = document.getElementById('rentCounty');
  const sub = document.getElementById('rentSubCounty');
  let subcounties = [];

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
  const currentUser = async () => (await client.auth.getUser()).data?.user;
  const refresh = async () => {
    const list = document.getElementById('rentApplicationList');
    const user = await currentUser();
    if (!user) { list.textContent = 'Sign in to view your applications.'; return; }
    const {data,error} = await client.from('rent_installment_applications').select('id,house_type,monthly_rent,payment_frequency,county,estate,status,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(30);
    if (error) { list.textContent = 'Could not load applications. Try again later.'; return; }
    list.innerHTML = data?.length ? data.map(a => `<article class="rent-application-item"><strong>${escapeHtml(a.house_type)} • KSh ${Number(a.monthly_rent).toLocaleString('en-KE')}/month</strong><span>${escapeHtml(a.estate)} • ${escapeHtml(a.status.replaceAll('_',' '))}</span><small>${new Date(a.created_at).toLocaleDateString('en-KE')}</small></article>`).join('') : '<p>No rent applications yet.</p>';
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
      const photo = fd.get('portrait');
      if (!(photo instanceof File) || !['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 2*1024*1024 || !photo.size) throw new Error('Select a JPG, PNG or WebP photograph of up to 2MB.');
      button.disabled = true;
      const record = {
        customer_id:user.id,full_name:String(fd.get('full_name')).trim(),identity_number:String(fd.get('identity_number')).trim(),
        house_type:String(fd.get('house_type')),monthly_rent:Number(fd.get('monthly_rent')),deposit_amount:Number(fd.get('deposit_amount') || 0),
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

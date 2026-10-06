// LEOGO DIGITAL MARKET V2 — Vacant Houses customer marketplace V1.
(() => {
  'use strict';

  const auth = window.leogoAuth;
  const client = auth?.client;
  if (!client) return;

  const BUCKET = 'vacant-house-public-media';
  const state = {
    settings: { is_enabled:true, voucher_enabled:false, submission_voucher_kes:0, viewing_access_fee_kes:300, max_photos:8 },
    listings: [],
    mySubmissions: [],
    myRequests: [],
    user: null,
    selected: null
  };

  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const typeLabel=v=>({
    single_room:'Single Room',bedsitter:'Bedsitter',one_bedroom:'1 Bedroom',
    two_bedroom:'2 Bedroom',three_bedroom:'3 Bedroom',four_plus_bedroom:'4+ Bedroom',
    maisonette:'Maisonette',bungalow:'Bungalow',apartment:'Apartment',
    commercial:'Commercial',land_plot:'Land / Plot',other:'Other'
  })[v]||String(v||'House').replaceAll('_',' ');
  const statusLabel=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const photoUrl=path=>{
    if(!path)return '';
    try{return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl||'';}catch{return '';}
  };
  const safeUrl=value=>{
    try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
  };
  const notify=(el,message,type='')=>{
    if(!el)return;
    el.textContent=message||'';
    el.className='vh-status'+(type?' '+type:'');
  };
  const getUser=async()=>{
    const {data}=await client.auth.getUser();
    state.user=data?.user||null;
    return state.user;
  };
  const requireUser=async()=>{
    const user=await getUser();
    if(user)return user;
    document.querySelector('[data-open-customer-view="auth"]')?.click();
    throw new Error('Sign in to continue.');
  };

  const section=document.createElement('section');
  section.className='section vacant-houses-market';
  section.id='vacant-houses';
  section.innerHTML=`
    <div class="vh-head">
      <div><span>LEOGO PROPERTY MARKET</span><h2>🏠 Houses &amp; Property</h2><p>Browse Admin-approved property for rent or for sale. Exact location and owner/agent contact stay private until viewing access is verified.</p></div>
      <div class="vh-head-actions">
        <div class="vh-fee-chip"><small>Viewing & access fee</small><strong id="vhPublicFee">Loading…</strong><span>Admin-managed</span></div>
        <button id="vhOpenSubmit" type="button">＋ Submit Property</button>
      </div>
    </div>
    <div class="vh-reward-banner" id="vhRewardBanner">Approved customer property submissions can earn an Admin-set LEOGO Shopping Voucher.</div>
    <form class="vh-filters" id="vhFilters">
      <select id="vhPurpose"><option value="">Rent &amp; Sale</option><option value="rent">For Rent</option><option value="sale">For Sale</option></select>
      <input id="vhSearch" type="search" placeholder="Search estate, town or description">
      <input id="vhCounty" type="text" placeholder="County e.g. Siaya">
      <select id="vhType">
        <option value="">All house types</option>
        <option value="single_room">Single Room</option><option value="bedsitter">Bedsitter</option>
        <option value="one_bedroom">1 Bedroom</option><option value="two_bedroom">2 Bedroom</option>
        <option value="three_bedroom">3 Bedroom</option><option value="four_plus_bedroom">4+ Bedroom</option>
        <option value="maisonette">Maisonette</option><option value="bungalow">Bungalow</option>
        <option value="apartment">Apartment</option><option value="commercial">Commercial</option><option value="land_plot">Land / Plot</option><option value="other">Other</option>
      </select>
      <input id="vhMinPrice" type="number" min="0" step="100" placeholder="Min price">
      <input id="vhMaxPrice" type="number" min="0" step="100" placeholder="Max price">
      <button type="submit">Search Houses</button>
    </form>
    <div id="vhPublicStatus" class="vh-status">Loading approved property listings…</div>
    <div id="vhGrid" class="vh-grid"></div>
    <section class="vh-mine" id="vhMine" hidden>
      <div class="vh-mine-head"><div><span>MY PROPERTY</span><h3>Submissions &amp; Viewing Access</h3></div><button id="vhRefreshMine" type="button">↻ Refresh</button></div>
      <div class="vh-mine-columns">
        <div><h4>My Property Submissions</h4><div id="vhMySubmissions" class="vh-mine-list"></div></div>
        <div><h4>My Viewing Requests</h4><div id="vhMyRequests" class="vh-mine-list"></div></div>
      </div>
    </section>`;

  const accommodation=document.querySelector('#accommodation');
  if(accommodation) accommodation.before(section);
  else document.querySelector('main')?.append(section);

  const modal=document.createElement('div');
  modal.className='vh-modal';
  modal.id='vhModal';
  modal.hidden=true;
  modal.innerHTML=`
    <button class="vh-modal-backdrop" data-vh-close type="button" aria-label="Close"></button>
    <section class="vh-modal-card" role="dialog" aria-modal="true">
      <header><div><span id="vhModalEyebrow">PROPERTY</span><h2 id="vhModalTitle">Property Details</h2></div><button data-vh-close type="button">×</button></header>
      <div id="vhModalBody" class="vh-modal-body"></div>
    </section>`;
  document.body.append(modal);

  const submitModal=document.createElement('div');
  submitModal.className='vh-modal';
  submitModal.id='vhSubmitModal';
  submitModal.hidden=true;
  submitModal.innerHTML=`
    <button class="vh-modal-backdrop" data-vh-submit-close type="button" aria-label="Close"></button>
    <section class="vh-modal-card vh-modal-wide" role="dialog" aria-modal="true">
      <header><div><span>LIST PROPERTY</span><h2>Submit Property for Admin Approval</h2><p>Choose For Rent or For Sale. Public visitors see the general area only; exact address, map pin and contact remain protected.</p></div><button data-vh-submit-close type="button">×</button></header>
      <form id="vhSubmitForm" class="vh-submit-form">
        <div class="vh-form-grid">
          <label><span>Your relationship</span><select name="submitter_role" required><option value="owner">Owner / Landlord</option><option value="caretaker">Caretaker</option><option value="agent">Agent</option><option value="other">Other authorized person</option></select></label>
          <label><span>Listing type</span><select name="listing_purpose" id="vhListingPurpose" required><option value="rent">For Rent</option><option value="sale">For Sale</option></select></label>
          <label><span>Property title</span><input name="title" maxlength="140" placeholder="e.g. 2 Bedroom House – Mjini" required></label>
          <label><span>Property type</span><select name="house_type" required><option value="single_room">Single Room</option><option value="bedsitter">Bedsitter</option><option value="one_bedroom">1 Bedroom</option><option value="two_bedroom">2 Bedroom</option><option value="three_bedroom">3 Bedroom</option><option value="four_plus_bedroom">4+ Bedroom</option><option value="maisonette">Maisonette</option><option value="bungalow">Bungalow</option><option value="apartment">Apartment</option><option value="commercial">Commercial</option><option value="land_plot">Land / Plot</option><option value="other">Other</option></select></label>
          <label id="vhRentField"><span>Monthly rent (KSh)</span><input name="monthly_rent_kes" type="number" min="1" step="1" required></label>
          <label id="vhDepositField"><span>Deposit (KSh)</span><input name="deposit_kes" type="number" min="0" step="1" value="0" required></label>
          <label id="vhSalePriceField" hidden><span>Sale price (KSh)</span><input name="sale_price_kes" type="number" min="1" step="1"></label>
          <label id="vhPropertySizeField" hidden><span>Property size <small>(optional)</small></span><input name="property_size_text" maxlength="120" placeholder="e.g. 50 x 100 ft, 0.5 acre"></label>
          <label id="vhOwnershipField" hidden><span>Ownership / title information <small>(optional)</small></span><input name="ownership_note" maxlength="300" placeholder="e.g. Title deed available"></label>
          <label id="vhAvailableFromField"><span>Available from</span><input name="available_from" type="date" required></label>
          <label><span>County</span><input name="county" maxlength="80" required></label>
          <label><span>Sub-County / Town</span><input name="sub_county" maxlength="100" required></label>
          <label><span>Estate / General area</span><input name="area_estate" maxlength="160" required></label>
          <label><span>Bedrooms</span><input name="bedrooms" type="number" min="0" max="30" value="1" required></label>
          <label><span>Bathrooms</span><input name="bathrooms" type="number" min="0" max="30" value="1" required></label>
          <label><span>Contact name</span><input name="contact_name" maxlength="120" required></label>
          <label><span>Landlord / Agent phone</span><input name="contact_phone" type="tel" maxlength="30" placeholder="+2547XXXXXXXX" required></label>
          <label class="wide"><span>Exact address <b>Private until viewing payment is verified</b></span><input name="exact_address" maxlength="500" required></label>
          <label><span>Nearest landmark <b>Private</b></span><input name="landmark" maxlength="300"></label>
          <label><span>Google Maps / shared location link <b>Private</b></span><input name="maps_link" id="vhMapsLink" maxlength="1000"></label>
          <label><span>Latitude <b>Private</b></span><input name="latitude" id="vhLatitude" type="number" step="0.0000001" min="-90" max="90"></label>
          <label><span>Longitude <b>Private</b></span><input name="longitude" id="vhLongitude" type="number" step="0.0000001" min="-180" max="180"></label>
          <div class="vh-pin-row wide"><button id="vhPinLocation" type="button">📍 Pin Current Location</button><span id="vhPinStatus">Optional, but recommended for accurate viewing directions.</span></div>
          <label class="wide"><span>Description</span><textarea name="description" minlength="10" maxlength="3000" rows="4" required placeholder="Describe the property and the important details a renter or buyer should know."></textarea></label>
          <label class="wide"><span>Property photos (1–<b id="vhMaxPhotos">8</b>)</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label>
        </div>
        <div class="vh-check-grid">
          <label><input name="furnished" type="checkbox"> Furnished</label>
          <label><input name="water_available" type="checkbox"> Water available</label>
          <label><input name="electricity_available" type="checkbox"> Electricity available</label>
          <label><input name="parking_available" type="checkbox"> Parking available</label>
          <label><input name="gated_compound" type="checkbox"> Gated compound</label>
        </div>
        <label class="vh-consent"><input name="contact_reveal_consent" type="checkbox" required> I authorize LEOGO to reveal this exact location and contact details only to a signed-in customer whose viewing/access payment has been verified by LEOGO.</label>
        <div class="vh-private-note">🔒 Exact location and contact details are not returned by the public listing API. Property photos and the general area are public only after Admin approval.</div>
        <div id="vhSubmitStatus" class="vh-status" role="status" aria-live="polite"></div>
        <button id="vhSubmitButton" class="vh-primary" type="submit">Submit for Admin Approval</button>
      </form>
    </section>`;
  document.body.append(submitModal);

  const $=id=>document.getElementById(id);
  const grid=$('vhGrid'), publicStatus=$('vhPublicStatus'), submitStatus=$('vhSubmitStatus');

  const close=(node)=>{node.hidden=true;document.body.classList.remove('vh-lock');};
  const open=(node)=>{node.hidden=false;document.body.classList.add('vh-lock');};

  document.querySelectorAll('[data-vh-close]').forEach(b=>b.addEventListener('click',()=>close(modal)));
  document.querySelectorAll('[data-vh-submit-close]').forEach(b=>b.addEventListener('click',()=>close(submitModal)));

  const renderSettings=()=>{
    $('vhPublicFee').textContent=money(state.settings.viewing_access_fee_kes);
    $('vhMaxPhotos').textContent=state.settings.max_photos||8;
    $('vhRewardBanner').innerHTML=state.settings.voucher_enabled && Number(state.settings.submission_voucher_kes)>0
      ? '🎁 <strong>List a real vacant house:</strong> when LEOGO Admin approves it, the submitting customer earns a Shopping Voucher worth <strong>'+esc(money(state.settings.submission_voucher_kes))+'</strong> as non-withdrawable LEOGO Points.'
      : 'Submit a genuine vacant house for LEOGO Admin verification. Shopping Vouchers are currently disabled.';
  };

  const loadSettings=async()=>{
    const {data,error}=await client.rpc('public_get_vacant_house_settings');
    if(error)throw error;
    if(data)state.settings={...state.settings,...data};
    renderSettings();
  };

  const loadPublic=async()=>{
    notify(publicStatus,'Loading approved property listings…');
    const {data,error}=await client.rpc('public_list_property_marketplace',{
      p_search:$('vhSearch').value.trim()||null,
      p_county:$('vhCounty').value.trim()||null,
      p_house_type:$('vhType').value||null,
      p_listing_purpose:$('vhPurpose').value||null,
      p_min_price:$('vhMinPrice').value?Number($('vhMinPrice').value):null,
      p_max_price:$('vhMaxPrice').value?Number($('vhMaxPrice').value):null
    });
    if(error)throw error;
    state.listings=Array.isArray(data)?data:[];
    renderPublic();
  };

  const renderPublic=()=>{
    if(!state.listings.length){
      grid.innerHTML='<div class="vh-empty">🏠 No approved property listings match this search yet.</div>';
      notify(publicStatus,'No matching property found.');
      return;
    }
    notify(publicStatus,state.listings.length+' approved propert'+(state.listings.length===1?'y':'ies')+' available.');
    grid.innerHTML=state.listings.map(l=>{
      const img=photoUrl((l.photo_paths||[])[0]);
      const forSale=l.listing_purpose==='sale';
      const facts=[
        l.property_size_text?l.property_size_text:null,
        l.bedrooms?l.bedrooms+' bedroom'+(Number(l.bedrooms)===1?'':'s'):null,
        l.bathrooms?l.bathrooms+' bath':null,
        l.water_available?'Water':null,l.electricity_available?'Electricity':null,
        l.parking_available?'Parking':null,l.gated_compound?'Gated':null
      ].filter(Boolean);
      return '<article class="vh-card">'+
        '<div class="vh-card-photo">'+(img?'<img src="'+esc(img)+'" alt="'+esc(l.title)+'" loading="lazy">':'<span>🏠</span>')+'<b>'+(forSale?'FOR SALE':'FOR RENT')+'</b></div>'+
        '<div class="vh-card-body"><span>'+esc(typeLabel(l.house_type))+'</span><h3>'+esc(l.title)+'</h3>'+
        '<p>📍 '+esc(l.area_estate)+', '+esc(l.sub_county)+', '+esc(l.county)+'</p>'+
        '<strong>'+esc(money(forSale?l.sale_price_kes:l.monthly_rent_kes))+(forSale?' <small>asking price</small>':' <small>/ month</small>')+'</strong>'+
        '<div class="vh-facts">'+facts.slice(0,5).map(f=>'<i>'+esc(f)+'</i>').join('')+'</div>'+
        '<button type="button" data-vh-detail="'+esc(l.id)+'">View Property</button></div></article>';
    }).join('');
  };

  const renderDetail=async listing=>{
    state.selected=listing;
    const forSale=listing.listing_purpose==='sale';
    const photos=(listing.photo_paths||[]).map(photoUrl).filter(Boolean);
    $('vhModalEyebrow').textContent=(forSale?'APPROVED PROPERTY FOR SALE':'APPROVED PROPERTY FOR RENT')+' · '+listing.listing_reference;
    $('vhModalTitle').textContent=listing.title;
    const priceFacts=forSale
      ? '<div><small>Sale price</small><strong>'+esc(money(listing.sale_price_kes))+'</strong></div>'+
        (listing.property_size_text?'<div><small>Property size</small><strong>'+esc(listing.property_size_text)+'</strong></div>':'')+
        (listing.ownership_note?'<div><small>Ownership / title</small><strong>'+esc(listing.ownership_note)+'</strong></div>':'')
      : '<div><small>Monthly rent</small><strong>'+esc(money(listing.monthly_rent_kes))+'</strong></div>'+
        '<div><small>Deposit</small><strong>'+esc(money(listing.deposit_kes))+'</strong></div>';
    $('vhModalBody').innerHTML=
      '<div class="vh-detail-gallery">'+(photos.length?photos.map((u,i)=>'<img src="'+esc(u)+'" alt="Property photo '+(i+1)+'">').join(''):'<div class="vh-photo-placeholder">🏠</div>')+'</div>'+
      '<div class="vh-detail-grid">'+priceFacts+
      '<div><small>Type</small><strong>'+esc(typeLabel(listing.house_type))+'</strong></div>'+
      '<div><small>General location</small><strong>'+esc(listing.area_estate+', '+listing.sub_county+', '+listing.county)+'</strong></div></div>'+
      '<p class="vh-description">'+esc(listing.description)+'</p>'+
      '<div class="vh-privacy-gate"><span>🔒</span><div><strong>Exact location & contact protected</strong><p>Pay the Admin-set viewing/access fee of '+esc(money(state.settings.viewing_access_fee_kes))+' and submit your payment reference. After LEOGO verifies it, the exact address, map pin and owner/agent contact are unlocked for you.</p></div></div>'+
      '<button class="vh-primary" id="vhRequestAccess" type="button">Request Viewing & Unlock Details · '+esc(money(state.settings.viewing_access_fee_kes))+'</button>'+
      '<div id="vhAccessArea"></div>';
    open(modal);
    $('vhRequestAccess').addEventListener('click',()=>startAccess(listing).catch(e=>renderAccessError(e)));
  };

  const renderAccessError=e=>{
    const host=$('vhAccessArea');
    if(host)host.innerHTML='<div class="vh-status error">'+esc(e?.message||'Unable to continue.')+'</div>';
  };

  const paymentDestination=data=>{
    if(!data)return '<div class="vh-payment-missing">LEOGO has not assigned a payment account for property viewing yet.</div>';
    const primary=data.till_number?['Till',data.till_number]:data.paybill_number?['Paybill',data.paybill_number]:data.account_number?['Account',data.account_number]:['Payment account',data.display_name||'LEOGO'];
    const secondary=data.paybill_number && data.account_number ? '<span>Account: <strong>'+esc(data.account_number)+'</strong></span>' : '';
    return '<div class="vh-payment-box"><span>Pay to '+esc(primary[0])+'</span><strong id="vhPaymentNumber">'+esc(primary[1])+'</strong>'+secondary+
      '<small>'+esc(data.business_name||data.account_name||data.display_name||'LEOGO DIGITAL MARKET')+'</small>'+
      '<button id="vhCopyPayment" type="button">Copy</button></div>';
  };

  const unlockedFor=listingId=>state.myRequests.find(r=>r.listing_id===listingId && ['verified','waived'].includes(r.payment_status));

  const showUnlocked=request=>{
    const map=safeUrl(request.maps_link);
    return '<div class="vh-unlocked"><div class="vh-unlocked-head">✓ VERIFIED VIEWING ACCESS</div>'+
      '<p><b>Contact:</b> '+esc(request.contact_name||'—')+' · <a href="tel:'+esc(request.contact_phone||'')+'">'+esc(request.contact_phone||'—')+'</a></p>'+
      '<p><b>Exact address:</b> '+esc(request.exact_address||'—')+'</p>'+
      (request.landmark?'<p><b>Landmark:</b> '+esc(request.landmark)+'</p>':'')+
      (map?'<a class="vh-map-link" href="'+esc(map)+'" target="_blank" rel="noopener">📍 Open Exact Location</a>':'')+
      ((!map && request.latitude!=null && request.longitude!=null)?'<a class="vh-map-link" href="https://www.google.com/maps?q='+encodeURIComponent(request.latitude+','+request.longitude)+'" target="_blank" rel="noopener">📍 Open Coordinates</a>':'')+
      '<small>Your payment unlocked viewing information only. It is not rent, a tenancy deposit, or a property purchase payment.</small></div>';
  };

  const startAccess=async listing=>{
    await requireUser();
    await loadMine();
    const unlocked=unlockedFor(listing.id);
    if(unlocked){
      $('vhAccessArea').innerHTML=showUnlocked(unlocked);
      return;
    }
    const {data,error}=await client.rpc('customer_get_vacant_house_access_quote',{p_listing_id:listing.id});
    if(error)throw error;
    const fee=Number(data?.fee_amount_kes||0);
    const account=data?.payment_account||null;
    const existing=data?.existing_request||null;
    let existingNote='';
    if(existing){
      existingNote='<div class="vh-existing-request"><strong>Existing request: '+esc(statusLabel(existing.payment_status))+'</strong>'+
        (existing.admin_notes?'<span>'+esc(existing.admin_notes)+'</span>':'')+
        (existing.payment_status==='submitted'?'<small>LEOGO Admin is verifying your payment.</small>':'')+'</div>';
      if(existing.payment_status==='submitted'){
        $('vhAccessArea').innerHTML=existingNote;
        return;
      }
    }
    $('vhAccessArea').innerHTML=existingNote+
      '<form id="vhAccessForm" class="vh-access-form">'+
      '<h4>Viewing & Exact Location Access</h4>'+
      '<p>This <strong>'+esc(money(fee))+'</strong> is a LEOGO viewing/access fee. It is not rent, a tenancy deposit, or a property purchase payment.</p>'+
      (fee>0?paymentDestination(account):'<div class="vh-payment-box"><strong>No viewing fee currently required</strong></div>')+
      (fee>0?'<label><span>M-Pesa / payment reference</span><textarea name="payment_reference" minlength="6" maxlength="300" required placeholder="Paste the payment confirmation/reference"></textarea></label>':'')+
      '<label><span>Preferred viewing date & time <small>(optional)</small></span><input name="preferred_viewing_at" type="datetime-local"></label>'+
      '<label><span>Message to landlord/agent <small>(optional)</small></span><textarea name="message" maxlength="1000" rows="2"></textarea></label>'+
      '<label class="vh-consent"><input name="consent" type="checkbox" required> I understand this payment only unlocks verified viewing contact/location and does not rent, reserve or purchase the property.</label>'+
      '<div id="vhAccessStatus" class="vh-status"></div>'+
      '<button class="vh-primary" type="submit" '+(fee>0&&!account?'disabled':'')+'>'+esc(fee>0?'Submit Payment for Verification':'Unlock Viewing Details')+'</button></form>';
    const copy=$('vhCopyPayment');
    if(copy)copy.addEventListener('click',async()=>{
      const value=$('vhPaymentNumber')?.textContent||'';
      await navigator.clipboard?.writeText(value);
      copy.textContent='Copied';
    });
    $('vhAccessForm')?.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const status=$('vhAccessStatus');
      notify(status,fee>0?'Submitting payment for Admin verification…':'Unlocking details…');
      const fd=new FormData(ev.currentTarget);
      const preferred=fd.get('preferred_viewing_at');
      const {data:result,error:submitError}=await client.rpc('customer_submit_vacant_house_viewing_request',{
        p_listing_id:listing.id,
        p_payment_reference:fee>0?String(fd.get('payment_reference')||'').trim():'',
        p_preferred_viewing_at:preferred?new Date(String(preferred)).toISOString():null,
        p_message:String(fd.get('message')||'').trim()||null
      });
      if(submitError){notify(status,submitError.message,'error');return;}
      await loadMine();
      const nowUnlocked=unlockedFor(listing.id);
      if(nowUnlocked){
        $('vhAccessArea').innerHTML=showUnlocked(nowUnlocked);
      }else{
        notify(status,'Payment/reference submitted. LEOGO Admin will verify it before exact location and contact are revealed.','success');
        ev.currentTarget.querySelector('button[type="submit"]').disabled=true;
      }
    });
  };

  const loadMine=async()=>{
    await getUser();
    $('vhMine').hidden=!state.user;
    if(!state.user){state.mySubmissions=[];state.myRequests=[];return;}
    const [subs,reqs]=await Promise.all([
      client.rpc('customer_get_my_vacant_house_submissions'),
      client.rpc('customer_get_my_vacant_house_viewing_requests')
    ]);
    if(subs.error)throw subs.error;
    if(reqs.error)throw reqs.error;
    state.mySubmissions=Array.isArray(subs.data)?subs.data:[];
    state.myRequests=Array.isArray(reqs.data)?reqs.data:[];
    renderMine();
  };

  const renderMine=()=>{
    const sh=$('vhMySubmissions'),rh=$('vhMyRequests');
    sh.innerHTML=state.mySubmissions.length?state.mySubmissions.map(l=>
      '<article><div><span>'+esc(l.listing_reference)+'</span><strong>'+esc(l.title)+'</strong><small>'+esc(statusLabel(l.approval_status))+' · '+esc(statusLabel(l.availability_status))+'</small>'+
      (Number(l.voucher_amount_kes)>0?'<b>🎁 '+esc(money(l.voucher_amount_kes))+' Shopping Voucher credited</b>':'')+
      (l.admin_notes?'<em>Admin: '+esc(l.admin_notes)+'</em>':'')+'</div>'+
      (l.approval_status==='approved'?'<select data-vh-owner-status="'+esc(l.id)+'"><option value="vacant" '+(l.availability_status==='vacant'?'selected':'')+'>Vacant</option><option value="occupied" '+(l.availability_status==='occupied'?'selected':'')+'>Occupied</option><option value="archived" '+(l.availability_status==='archived'?'selected':'')+'>Archive</option></select>':'')+
      '</article>'
    ).join(''):'<div class="vh-empty-mini">No house submissions yet.</div>';

    rh.innerHTML=state.myRequests.length?state.myRequests.map(r=>
      '<article><div><span>'+esc(r.request_reference)+'</span><strong>'+esc(r.title)+'</strong><small>'+esc(statusLabel(r.payment_status))+' · '+esc(money(r.fee_amount_kes))+'</small>'+
      (r.admin_notes?'<em>Admin: '+esc(r.admin_notes)+'</em>':'')+
      (['verified','waived'].includes(r.payment_status)?showUnlocked(r):'<b>🔒 Exact location and contact remain locked until payment verification.</b>')+
      '</div></article>'
    ).join(''):'<div class="vh-empty-mini">No viewing requests yet.</div>';
  };

  grid.addEventListener('click',ev=>{
    const button=ev.target.closest('[data-vh-detail]');
    if(!button)return;
    const listing=state.listings.find(x=>x.id===button.dataset.vhDetail);
    if(listing)renderDetail(listing);
  });

  $('vhMySubmissions').addEventListener('change',async ev=>{
    const select=ev.target.closest('[data-vh-owner-status]');
    if(!select)return;
    try{
      const {error}=await client.rpc('customer_set_my_vacant_house_status',{p_listing_id:select.dataset.vhOwnerStatus,p_status:select.value});
      if(error)throw error;
      await Promise.all([loadMine(),loadPublic()]);
    }catch(e){alert(e.message||'Could not update house status.');}
  });

  $('vhFilters').addEventListener('submit',ev=>{
    ev.preventDefault();
    loadPublic().catch(e=>notify(publicStatus,e.message,'error'));
  });

  $('vhRefreshMine').addEventListener('click',()=>loadMine().catch(e=>console.error(e)));

  $('vhOpenSubmit').addEventListener('click',async()=>{
    try{
      await requireUser();
      const form=$('vhSubmitForm');
      if(!form.elements.available_from.value)form.elements.available_from.value=new Date().toISOString().slice(0,10);
      notify(submitStatus,'');
      open(submitModal);
    }catch(e){notify(publicStatus,e.message,'error');}
  });

  $('vhPinLocation').addEventListener('click',()=>{
    const status=$('vhPinStatus');
    if(!navigator.geolocation){status.textContent='Location is not supported on this device.';return;}
    status.textContent='Getting current location…';
    navigator.geolocation.getCurrentPosition(pos=>{
      $('vhLatitude').value=pos.coords.latitude.toFixed(7);
      $('vhLongitude').value=pos.coords.longitude.toFixed(7);
      status.textContent='✓ Exact coordinates pinned. They remain private until viewing access is verified.';
    },err=>{status.textContent=err.message||'Could not get location.';},{enableHighAccuracy:true,timeout:15000});
  });

  $('vhSubmitForm').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const button=$('vhSubmitButton');
    const form=ev.currentTarget;
    let uploaded=[];
    try{
      const user=await requireUser();
      const fd=new FormData(form);
      const files=[...(form.elements.photos.files||[])];
      const max=Number(state.settings.max_photos||8);
      if(!files.length)throw new Error('Add at least one house photo.');
      if(files.length>max)throw new Error('Add no more than '+max+' photos.');
      button.disabled=true;
      notify(submitStatus,'Uploading house photos…');
      const draft=crypto.randomUUID();
      for(let i=0;i<files.length;i++){
        const file=files[i];
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path=user.id+'/'+draft+'/'+Date.now()+'-'+i+'.'+ext;
        const {error}=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
        if(error)throw error;
        uploaded.push(path);
      }
      notify(submitStatus,'Submitting house to LEOGO Admin…');
      const payload={
        submitter_role:String(fd.get('submitter_role')||'other'),
        title:String(fd.get('title')||'').trim(),house_type:String(fd.get('house_type')||''),
        monthly_rent_kes:Number(fd.get('monthly_rent_kes')||0),deposit_kes:Number(fd.get('deposit_kes')||0),
        available_from:String(fd.get('available_from')||''),county:String(fd.get('county')||'').trim(),
        sub_county:String(fd.get('sub_county')||'').trim(),area_estate:String(fd.get('area_estate')||'').trim(),
        bedrooms:Number(fd.get('bedrooms')||0),bathrooms:Number(fd.get('bathrooms')||0),
        contact_name:String(fd.get('contact_name')||'').trim(),contact_phone:String(fd.get('contact_phone')||'').trim(),
        exact_address:String(fd.get('exact_address')||'').trim(),landmark:String(fd.get('landmark')||'').trim(),
        maps_link:String(fd.get('maps_link')||'').trim(),latitude:String(fd.get('latitude')||'').trim(),
        longitude:String(fd.get('longitude')||'').trim(),description:String(fd.get('description')||'').trim(),
        furnished:fd.has('furnished'),water_available:fd.has('water_available'),
        electricity_available:fd.has('electricity_available'),parking_available:fd.has('parking_available'),
        gated_compound:fd.has('gated_compound'),contact_reveal_consent:fd.has('contact_reveal_consent'),
        photo_paths:uploaded
      };
      const {data,error}=await client.rpc('customer_submit_vacant_house',{p_data:payload});
      if(error)throw error;
      uploaded=[];
      notify(submitStatus,'Submitted successfully. Reference '+data.listing_reference+'. LEOGO Admin will review it before publication.'+
        (Number(data.voucher_on_approval_kes)>0?' If approved, '+money(data.voucher_on_approval_kes)+' will be credited as a Shopping Voucher.':''),'success');
      form.reset();
      form.elements.available_from.value=new Date().toISOString().slice(0,10);
      await loadMine();
    }catch(e){
      if(uploaded.length)client.storage.from(BUCKET).remove(uploaded).catch(()=>{});
      notify(submitStatus,e.message||'Could not submit vacant house.','error');
    }finally{button.disabled=false;}
  });

  const initialize=async()=>{
    try{
      await loadSettings();
      await loadPublic();
      await loadMine();
    }catch(e){
      notify(publicStatus,e.message||'Vacant Houses could not load.','error');
    }
  };

  client.auth.onAuthStateChange(()=>setTimeout(()=>loadMine().catch(()=>{}),0));
  window.addEventListener('hashchange',()=>{if(location.hash==='#vacant-houses')loadPublic().catch(()=>{});});
  initialize();
})();
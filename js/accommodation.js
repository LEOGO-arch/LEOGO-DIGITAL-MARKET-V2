// LEOGO DIGITAL MARKET V2 — accommodation marketplace and customer bookings.
(() => {
  'use strict';

  const auth = window.leogoAuth;
  const client = auth?.client;
  if (!client) return;

  const elements = {
    form: document.getElementById('accommodationSearchForm'),
    location: document.getElementById('accommodationLocationFilter'),
    type: document.getElementById('accommodationTypeFilter'),
    checkIn: document.getElementById('accommodationCheckIn'),
    checkOut: document.getElementById('accommodationCheckOut'),
    guests: document.getElementById('accommodationGuests'),
    publicStatus: document.getElementById('accommodationPublicStatus'),
    grid: document.getElementById('accommodationListingGrid'),
    modal: document.getElementById('accommodationModal'),
    modalTitle: document.getElementById('accommodationModalTitle'),
    cover: document.getElementById('accommodationProfileCover'),
    profileType: document.getElementById('accommodationProfileType'),
    profileName: document.getElementById('accommodationProfileName'),
    profileLocation: document.getElementById('accommodationProfileLocation'),
    profileDescription: document.getElementById('accommodationProfileDescription'),
    amenities: document.getElementById('accommodationProfileAmenities'),
    checkInTime: document.getElementById('accommodationCheckInTime'),
    checkOutTime: document.getElementById('accommodationCheckOutTime'),
    bookingForm: document.getElementById('accommodationBookingForm'),
    unit: document.getElementById('accommodationUnit'),
    rate: document.getElementById('accommodationRate'),
    bookingGuests: document.getElementById('accommodationBookingGuests'),
    bookingCheckIn: document.getElementById('accommodationBookingCheckIn'),
    bookingCheckOut: document.getElementById('accommodationBookingCheckOut'),
    guestName: document.getElementById('accommodationGuestName'),
    guestPhone: document.getElementById('accommodationGuestPhone'),
    specialRequests: document.getElementById('accommodationSpecialRequests'),
    price: document.getElementById('accommodationPricePreview'),
    bookingStatus: document.getElementById('accommodationBookingStatus'),
    bookingList: document.getElementById('accommodationBookingList'),
    dashboardCount: document.getElementById('accommodationDashboardCount')
  };

  let properties = [];
  let selectedProperty = null;
  let currentUser = null;
  let submissionKey = crypto.randomUUID();

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const money = (value) => 'KSh ' + Number(value || 0).toLocaleString('en-KE');
  const typeLabel = (value) => ({ hotel:'Hotel',airbnb:'Airbnb',guest_house:'Guest House',lodge:'Lodge',apartment:'Apartment',resort:'Resort',cottage:'Cottage',hostel:'Hostel',villa:'Villa',bedsitter:'Bedsitter',other:'Other' })[value] || 'Accommodation';
  const mealPlanLabel = (value) => ({bed_only:'Bed Only',bed_breakfast:'Bed & Breakfast',half_board:'Half Board',full_board:'Full Board',self_catering:'Self Catering',other:'Other'})[value] || 'Other';
  const occupancyLabel = (value) => ({single:'Single Occupancy',double:'Double Occupancy',triple:'Triple Occupancy',family:'Family',custom:'Custom'})[value] || 'Custom';
  const statusLabel = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const safeImage = (value) => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };
  const kenyaDate = (value) => new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium', timeZone: 'Africa/Nairobi'
  }).format(new Date(`${value}T12:00:00+03:00`));
  const todayKey = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const addDays = (key, days) => {
    const date = new Date(`${key}T12:00:00+03:00`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const setMessage = (element, message = '', type = '') => {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', type === 'error');
    element.classList.toggle('is-success', type === 'success');
  };
  const normalisePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
    if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
    if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
    return String(value || '').trim();
  };

  const renderProperties = (items) => {
    if (!elements.grid) return;
    if (!items.length) {
      elements.grid.innerHTML = '<div class="accommodation-empty"><span>🏨</span><h3>No approved stays match this search yet</h3><p>Hotels and Airbnb hosts will appear here after LEOGO Admin verifies and publishes their property profiles.</p></div>';
      return;
    }
    elements.grid.innerHTML = items.map((property) => {
      const units = property.units || [];
      const minimum = units.length ? Math.min(...units.map((unit) => Number(unit.nightly_price_kes))) : 0;
      const image = safeImage(property.cover_image_url);
      return `<article class="accommodation-card">
        <div class="accommodation-card-cover">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(property.property_name)}">` : '<span>🏨</span>'}<b>${escapeHtml(typeLabel(property.property_type))}</b></div>
        <div class="accommodation-card-copy"><span>📍 ${escapeHtml(property.public_location)}, ${escapeHtml(property.town)}</span><h3>${escapeHtml(property.property_name)}</h3><p>${escapeHtml(property.description)}</p><div><strong>${minimum ? `From ${money(minimum)} / night` : 'Rooms being prepared'}</strong><small>${units.length} room type${units.length === 1 ? '' : 's'}</small></div><button type="button" data-accommodation-property="${property.id}">View Profile &amp; Book</button></div>
      </article>`;
    }).join('');
  };

  const applyFilters = () => {
    const query = elements.location?.value.trim().toLowerCase() || '';
    const propertyType = elements.type?.value || '';
    const guestCount = Math.max(1, Number(elements.guests?.value || 1));
    const filtered = properties.filter((property) => {
      const place = `${property.county} ${property.town} ${property.public_location} ${property.property_name}`.toLowerCase();
      const hasUnit = (property.units || []).some((unit) => Number(unit.max_guests) >= guestCount);
      return (!query || place.includes(query)) && (!propertyType || property.property_type === propertyType) && hasUnit;
    });
    renderProperties(filtered);
    setMessage(elements.publicStatus, `${filtered.length} approved accommodation profile${filtered.length === 1 ? '' : 's'} found.`);
  };

  const loadProperties = async () => {
    setMessage(elements.publicStatus, 'Loading approved accommodation…');
    const { data, error } = await client
      .from('accommodation_properties')
      .select('id,property_name,property_type,county,town,public_location,description,cover_image_url,gallery_image_urls,amenities,house_rules,check_in_time,check_out_time,children_allowed,pets_allowed,parking_available,wifi_available,breakfast_available,smoking_zone_allowed,units:accommodation_units(id,room_category,unit_name,description,nightly_price_kes,max_guests,beds_description,inventory_count,is_active,approval_status,unit_image_url,gallery_image_urls,amenities,rates:accommodation_unit_rates(id,rate_name,meal_plan,occupancy_type,occupancy_pax,nightly_price_kes,is_active))')
      .eq('approval_status', 'approved')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(elements.publicStatus, 'Approved accommodation could not be loaded. Please try again.', 'error');
      renderProperties([]);
      return;
    }
    properties = (data || []).map((property) => ({
      ...property,
      units: (property.units || []).filter((unit) => unit.is_active && unit.approval_status === 'approved').map((unit)=>({
        ...unit,
        rates:(unit.rates||[]).filter((rate)=>rate.is_active)
      }))
    }));
    applyFilters();
  };

  const updateRateOptions = () => {
    const unit = selectedProperty?.units?.find((item) => item.id === elements.unit?.value);
    if (!elements.rate) return;
    const rates = unit?.rates || [];
    elements.rate.innerHTML = rates.length
      ? rates.map((rate)=>`<option value="${rate.id}">${escapeHtml(rate.rate_name)} — ${escapeHtml(mealPlanLabel(rate.meal_plan))} — ${escapeHtml(occupancyLabel(rate.occupancy_type))} (${rate.occupancy_pax} pax) — ${money(rate.nightly_price_kes)}/night</option>`).join('')
      : '<option value="">No approved rates available</option>';
    if (rates.length) elements.bookingGuests.max = Math.max(...rates.map((rate)=>Number(rate.occupancy_pax||1)));
    updatePrice();
  };

  const updatePrice = () => {
    const unit = selectedProperty?.units?.find((item) => item.id === elements.unit?.value);
    const rate = unit?.rates?.find((item) => item.id === elements.rate?.value);
    const checkIn = elements.bookingCheckIn?.value;
    const checkOut = elements.bookingCheckOut?.value;
    if (!unit || !rate || !checkIn || !checkOut || checkOut <= checkIn) {
      setMessage(elements.price, 'Choose valid dates, a room and a rate plan to see the estimated stay total.');
      return;
    }
    const nights = Math.round((new Date(`${checkOut}T12:00:00Z`) - new Date(`${checkIn}T12:00:00Z`)) / 86400000);
    setMessage(elements.price, `${escapeHtml(rate.rate_name)} · ${nights} night${nights === 1 ? '' : 's'} × ${money(rate.nightly_price_kes)} = ${money(nights * Number(rate.nightly_price_kes))}.`);
  };

  const closeModal = () => {
    elements.modal?.classList.remove('is-open');
    elements.modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('accommodation-modal-open');
  };

  const prefillCustomer = async () => {
    if (!currentUser) return;
    elements.guestName.value = currentUser.user_metadata?.full_name || '';
    elements.guestPhone.value = currentUser.user_metadata?.phone || '';
    const { data } = await client.from('customer_profiles').select('full_name,phone').eq('user_id', currentUser.id).maybeSingle();
    if (data) {
      elements.guestName.value = data.full_name || elements.guestName.value;
      elements.guestPhone.value = data.phone || elements.guestPhone.value;
    }
  };

  const openProperty = async (propertyId) => {
    selectedProperty = properties.find((property) => property.id === propertyId);
    if (!selectedProperty || !elements.modal) return;
    const image = safeImage(selectedProperty.cover_image_url);
    elements.modalTitle.textContent = selectedProperty.property_name;
    elements.profileType.textContent = typeLabel(selectedProperty.property_type).toUpperCase();
    elements.profileName.textContent = selectedProperty.property_name;
    elements.profileLocation.textContent = `📍 ${selectedProperty.public_location}, ${selectedProperty.town}, ${selectedProperty.county}`;
    elements.profileDescription.textContent = selectedProperty.description;
    elements.cover.innerHTML = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(selectedProperty.property_name)}">` : '<span>🏨</span>';
    const publicAmenities=[...(selectedProperty.amenities||[])];
    if(selectedProperty.parking_available) publicAmenities.push('Parking');
    if(selectedProperty.wifi_available) publicAmenities.push('Wi-Fi');
    if(selectedProperty.breakfast_available) publicAmenities.push('Breakfast available');
    if(selectedProperty.children_allowed) publicAmenities.push('Children allowed');
    if(selectedProperty.pets_allowed) publicAmenities.push('Pets allowed');
    if(selectedProperty.smoking_zone_allowed) publicAmenities.push('Smoking zone available');
    elements.amenities.innerHTML = publicAmenities.length
      ? [...new Set(publicAmenities)].map((amenity) => `<span>✓ ${escapeHtml(amenity)}</span>`).join('')
      : '<span>Amenities will be confirmed by the property.</span>';
    elements.checkInTime.textContent = String(selectedProperty.check_in_time || '14:00').slice(0, 5);
    elements.checkOutTime.textContent = String(selectedProperty.check_out_time || '10:00').slice(0, 5);
    elements.unit.innerHTML = (selectedProperty.units || []).length
      ? selectedProperty.units.map((unit) => `<option value="${unit.id}">${escapeHtml(unit.room_category || 'Room')} · ${escapeHtml(unit.unit_name)} — ${money(unit.nightly_price_kes)}/night — up to ${unit.max_guests} guest${unit.max_guests === 1 ? '' : 's'}</option>`).join('')
      : '<option value="">No active rooms available</option>';
    elements.bookingForm.querySelector('button[type="submit"]').disabled = !(selectedProperty.units || []).some((unit)=>(unit.rates||[]).length);
    elements.bookingCheckIn.value = elements.checkIn?.value || todayKey();
    elements.bookingCheckOut.value = elements.checkOut?.value || addDays(elements.bookingCheckIn.value, 1);
    elements.bookingGuests.value = elements.guests?.value || 1;
    setMessage(elements.bookingStatus);
    await prefillCustomer();
    updatePrice();
    elements.modal.classList.add('is-open');
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('accommodation-modal-open');
  };

  const renderBookings = (bookings) => {
    if (elements.dashboardCount) elements.dashboardCount.textContent = String(bookings.length);
    if (!elements.bookingList) return;
    if (!bookings.length) {
      elements.bookingList.innerHTML = '<div class="customer-empty-state compact"><span>🏨</span><h4>No accommodation bookings yet</h4><p>Your hotel and Airbnb booking requests will appear here.</p></div>';
      return;
    }
    elements.bookingList.innerHTML = bookings.map((booking) => `<article class="accommodation-booking-card">
      <div class="accommodation-booking-card-head"><div><span>${escapeHtml(booking.booking_reference)}</span><h4>${escapeHtml(booking.property_name_snapshot)}</h4><small>${escapeHtml(booking.unit_name_snapshot)}</small></div><b class="status-${escapeHtml(booking.booking_status)}">${escapeHtml(statusLabel(booking.booking_status))}</b></div>
      <div class="accommodation-booking-facts"><span><small>Stay</small><strong>${escapeHtml(kenyaDate(booking.check_in))} – ${escapeHtml(kenyaDate(booking.check_out))}</strong></span><span><small>Guests</small><strong>${booking.guests}</strong></span><span><small>Nights</small><strong>${booking.nights}</strong></span><span><small>Estimated total</small><strong>${money(booking.total_amount_kes)}</strong></span></div>
      ${booking.host_response ? `<p>Property response: ${escapeHtml(booking.host_response)}</p>` : '<p>Waiting for the property to review this request.</p>'}
    </article>`).join('');
  };

  const loadBookings = async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      renderBookings([]);
      return;
    }
    const { data, error } = await client
      .from('accommodation_bookings')
      .select('id,booking_reference,property_name_snapshot,unit_name_snapshot,check_in,check_out,nights,guests,total_amount_kes,booking_status,host_response,created_at')
      .eq('customer_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      if (elements.bookingList) elements.bookingList.innerHTML = '<div class="accommodation-booking-notice is-error">Your accommodation bookings could not be loaded.</div>';
      return;
    }
    renderBookings(data || []);
  };

  elements.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  elements.grid?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-accommodation-property]');
    if (button) openProperty(button.dataset.accommodationProperty);
  });
  elements.modal?.querySelectorAll('[data-close-accommodation-modal]').forEach((button) => button.addEventListener('click', closeModal));
  [elements.unit, elements.bookingCheckIn, elements.bookingCheckOut].forEach((input) => input?.addEventListener('change', updatePrice));

  elements.bookingForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedProperty || !elements.bookingForm.reportValidity()) return;
    if (!auth.requireLogin('Please log in or create a customer account before sending an accommodation booking.')) {
      setMessage(elements.bookingStatus, 'Login is required before this booking can be sent.', 'error');
      return;
    }
    if (elements.bookingForm.dataset.submitting === 'true') return;
    const unit = selectedProperty.units.find((item) => item.id === elements.unit.value);
    const rate = unit?.rates?.find((item)=>item.id===elements.rate?.value);
    if(!unit||!rate){setMessage(elements.bookingStatus,'Choose a room and rate plan.','error');return;}
    const phone = normalisePhone(elements.guestPhone.value);
    if (!/^\+254[17]\d{8}$/.test(phone)) {
      setMessage(elements.bookingStatus, 'Enter a valid Kenyan phone number, for example +254712345678.', 'error');
      return;
    }
    if (Number(elements.bookingGuests.value) > Number(unit.max_guests) || Number(elements.bookingGuests.value) > Number(rate.occupancy_pax)) {
      setMessage(elements.bookingStatus, `The selected ${rate.rate_name} rate allows up to ${rate.occupancy_pax} guest(s).`, 'error');
      return;
    }
    const button = elements.bookingForm.querySelector('button[type="submit"]');
    elements.bookingForm.dataset.submitting = 'true';
    button.disabled = true;
    button.textContent = 'Sending request…';
    setMessage(elements.bookingStatus, 'Creating a secure booking request…');
    const { data, error } = await client.rpc('submit_accommodation_booking', {
      p_property_id: selectedProperty.id,
      p_unit_id: unit.id,
      p_rate_id: rate.id,
      p_check_in: elements.bookingCheckIn.value,
      p_check_out: elements.bookingCheckOut.value,
      p_guests: Number(elements.bookingGuests.value),
      p_guest_name: elements.guestName.value.trim(),
      p_guest_phone: phone,
      p_special_requests: elements.specialRequests.value.trim(),
      p_idempotency_key: submissionKey
    });
    elements.bookingForm.dataset.submitting = 'false';
    button.disabled = false;
    button.textContent = 'Send Request to Property';
    if (error) {
      setMessage(elements.bookingStatus, error.message || 'The booking request could not be sent.', 'error');
      return;
    }
    submissionKey = crypto.randomUUID();
    setMessage(elements.bookingStatus, `Booking ${data.booking_reference} was sent to the property. It is awaiting acceptance.`, 'success');
    await loadBookings(auth.getUser());
  });

  const today = todayKey();
  [elements.checkIn, elements.bookingCheckIn].forEach((input) => { if (input) input.min = today; });
  [elements.checkOut, elements.bookingCheckOut].forEach((input) => { if (input) input.min = addDays(today, 1); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  document.addEventListener('leogo:authchange', (event) => loadBookings(event.detail?.user || null));
  client.auth.getSession().then(({ data }) => loadBookings(data.session?.user || null));
  loadProperties();
})();

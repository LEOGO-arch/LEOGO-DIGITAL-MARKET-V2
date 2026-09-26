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
    roomCatalogue: document.getElementById('accommodationRoomCatalogue'),
    roomDetail: document.getElementById('accommodationRoomDetail'),
    roomMainPhoto: document.getElementById('accommodationRoomMainPhoto'),
    roomGallery: document.getElementById('accommodationRoomGallery'),
    roomCategory: document.getElementById('accommodationRoomCategory'),
    roomName: document.getElementById('accommodationRoomName'),
    roomRating: document.getElementById('accommodationRoomRating'),
    roomDescription: document.getElementById('accommodationRoomDescription'),
    roomFacts: document.getElementById('accommodationRoomFacts'),
    roomAmenities: document.getElementById('accommodationRoomAmenities'),
    roomRates: document.getElementById('accommodationRoomRates'),
    roomReviews: document.getElementById('accommodationRoomReviews'),
    bookSelectedRoom: document.getElementById('accommodationBookSelectedRoom'),
    selectedRoomSummary: document.getElementById('accommodationSelectedRoomSummary'),
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
  let selectedUnit = null;
  let currentUser = null;
  let accommodationFinanceSettings = { hotel_commission_percent: 10, customer_service_fee_percent: 3 };
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
        <div class="accommodation-card-copy"><span>📍 ${escapeHtml(property.public_location)}, ${escapeHtml(property.town)}</span><h3>${escapeHtml(property.property_name)}</h3><p>${escapeHtml(property.description)}</p><div><strong>${minimum ? `From ${money(minimum)} / night` : 'Rooms being prepared'}</strong><small>${units.length} room type${units.length === 1 ? '' : 's'}</small></div><button type="button" data-accommodation-property="${property.id}">View Rooms</button></div>
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
      .select('id,property_name,property_type,county,town,public_location,description,cover_image_url,gallery_image_urls,amenities,house_rules,check_in_time,check_out_time,children_allowed,pets_allowed,parking_available,wifi_available,breakfast_available,smoking_zone_allowed,units:accommodation_units(id,room_category,unit_name,description,nightly_price_kes,max_guests,beds_description,inventory_count,is_active,approval_status,unit_image_url,gallery_image_urls,amenities,rates:accommodation_unit_rates(id,rate_name,meal_plan,occupancy_type,occupancy_pax,nightly_price_kes,is_active),reviews:accommodation_unit_reviews(id,rating,comment,moderation_status,created_at))')
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
        rates:(unit.rates||[]).filter((rate)=>rate.is_active),
        reviews:(unit.reviews||[]).filter((review)=>review.moderation_status==='approved')
      }))
    }));
    applyFilters();
  };

  const unitMinimumRate = (unit) => {
    const rates = unit?.rates || [];
    const prices = rates.map((rate) => Number(rate.nightly_price_kes || 0)).filter((price) => price > 0);
    return prices.length ? Math.min(...prices) : Number(unit?.nightly_price_kes || 0);
  };

  const unitReviews = (unit) => (unit?.reviews || []).filter((review) => review.moderation_status === 'approved');

  const unitRating = (unit) => {
    const reviews = unitReviews(unit);
    if (!reviews.length) return { average: null, count: 0, label: '☆ New · No ratings yet' };
    const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
    return { average, count: reviews.length, label: `★ ${average.toFixed(1)} (${reviews.length} review${reviews.length === 1 ? '' : 's'})` };
  };

  const unitImages = (unit) => {
    const values = [unit?.unit_image_url, ...(unit?.gallery_image_urls || [])]
      .map(safeImage)
      .filter(Boolean);
    return [...new Set(values)];
  };

  const renderRoomCatalogue = () => {
    if (!elements.roomCatalogue || !selectedProperty) return;
    const units = selectedProperty.units || [];
    if (!units.length) {
      elements.roomCatalogue.innerHTML = '<div class="accommodation-empty compact"><span>🛏️</span><h3>No approved rooms available yet</h3><p>This property will appear bookable after its room types are approved by LEOGO Admin.</p></div>';
      return;
    }
    elements.roomCatalogue.innerHTML = units.map((unit) => {
      const images = unitImages(unit);
      const rating = unitRating(unit);
      const minimum = unitMinimumRate(unit);
      return `<article class="accommodation-room-card">
        <div class="accommodation-room-card-image">${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(unit.unit_name)}">` : '<span>🛏️</span>'}<b>${escapeHtml(unit.room_category || 'Room')}</b></div>
        <div class="accommodation-room-card-copy">
          <div class="accommodation-room-card-title"><div><span>${escapeHtml(unit.room_category || 'Room')}</span><h4>${escapeHtml(unit.unit_name)}</h4></div><strong>${escapeHtml(rating.label)}</strong></div>
          <p>${escapeHtml(unit.description || 'View room details, gallery and available rates before booking.')}</p>
          <div class="accommodation-room-card-meta"><span>👥 Up to ${Number(unit.max_guests || 1)} guest${Number(unit.max_guests || 1) === 1 ? '' : 's'}</span><span>🛏️ ${escapeHtml(unit.beds_description || 'Bed details available')}</span></div>
          <div class="accommodation-room-card-bottom"><div><small>From</small><b>${minimum ? money(minimum) + '/night' : 'Rate unavailable'}</b></div><button type="button" data-view-accommodation-room="${unit.id}">View Room</button></div>
        </div>
      </article>`;
    }).join('');
  };

  const renderRoomDetail = (unitId) => {
    selectedUnit = selectedProperty?.units?.find((unit) => unit.id === unitId) || null;
    if (!selectedUnit || !elements.roomDetail) return;
    const images = unitImages(selectedUnit);
    const rating = unitRating(selectedUnit);
    const minimum = unitMinimumRate(selectedUnit);
    const reviews = unitReviews(selectedUnit);

    elements.roomCategory.textContent = String(selectedUnit.room_category || 'Room').toUpperCase();
    elements.roomName.textContent = selectedUnit.unit_name || 'Room';
    elements.roomRating.textContent = rating.label;
    elements.roomDescription.textContent = selectedUnit.description || 'Room details provided by the accommodation provider.';
    elements.roomFacts.innerHTML = [
      ['Starting price', minimum ? money(minimum) + '/night' : '—'],
      ['Guests', 'Up to ' + Number(selectedUnit.max_guests || 1)],
      ['Beds', selectedUnit.beds_description || 'See property'],
      ['Available units', Number(selectedUnit.inventory_count || 1)]
    ].map(([label,value]) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`).join('');
    elements.roomAmenities.innerHTML = (selectedUnit.amenities || []).length
      ? selectedUnit.amenities.map((amenity) => `<span>✓ ${escapeHtml(amenity)}</span>`).join('')
      : '<span>Room amenities will be confirmed by the property.</span>';

    elements.roomMainPhoto.innerHTML = images[0]
      ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(selectedUnit.unit_name)}">`
      : '<span>🛏️</span>';
    elements.roomGallery.innerHTML = images.length
      ? images.map((image, index) => `<button type="button" data-room-gallery-image="${escapeHtml(image)}" class="${index === 0 ? 'active' : ''}"><img src="${escapeHtml(image)}" alt="${escapeHtml(selectedUnit.unit_name)} photo ${index + 1}"></button>`).join('')
      : '<div class="accommodation-room-no-gallery">No additional room photos yet.</div>';

    elements.roomRates.innerHTML = (selectedUnit.rates || []).length
      ? selectedUnit.rates.map((rate) => `<div class="accommodation-room-rate-row"><div><strong>${escapeHtml(rate.rate_name)}</strong><small>${escapeHtml(mealPlanLabel(rate.meal_plan))} · ${escapeHtml(occupancyLabel(rate.occupancy_type))} · ${Number(rate.occupancy_pax || 1)} pax</small></div><b>${money(rate.nightly_price_kes)}/night</b></div>`).join('')
      : '<div class="accommodation-room-empty-mini">No approved rates available.</div>';

    elements.roomReviews.innerHTML = reviews.length
      ? reviews.slice(0, 6).map((review) => `<article class="accommodation-room-review"><strong>★ ${Number(review.rating || 0).toFixed(1)} / 5</strong><p>${escapeHtml(review.comment || 'Customer rating')}</p><small>Verified LEOGO accommodation review</small></article>`).join('')
      : '<div class="accommodation-room-empty-mini">No approved customer reviews for this room yet.</div>';

    elements.bookingForm.hidden = true;
    elements.roomDetail.hidden = false;
    elements.roomDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const beginRoomBooking = async () => {
    if (!selectedUnit || !selectedProperty) return;
    elements.unit.innerHTML = `<option value="${selectedUnit.id}">${escapeHtml(selectedUnit.room_category || 'Room')} · ${escapeHtml(selectedUnit.unit_name)}</option>`;
    elements.unit.value = selectedUnit.id;
    elements.selectedRoomSummary.innerHTML = `<div><span>Selected room</span><strong>${escapeHtml(selectedUnit.room_category || 'Room')} · ${escapeHtml(selectedUnit.unit_name)}</strong><small>${escapeHtml(unitRating(selectedUnit).label)} · From ${money(unitMinimumRate(selectedUnit))}/night</small></div><button type="button" data-change-accommodation-room>Change room</button>`;
    elements.bookingGuests.max = Number(selectedUnit.max_guests || 1);
    if (Number(elements.bookingGuests.value || 1) > Number(selectedUnit.max_guests || 1)) elements.bookingGuests.value = 1;
    updateRateOptions();
    setMessage(elements.bookingStatus);
    await prefillCustomer();
    elements.bookingForm.hidden = false;
    elements.bookingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const loadAccommodationFinanceSettings = async () => {
    const { data, error } = await client.rpc('get_accommodation_finance_settings');
    if (!error && data) {
      accommodationFinanceSettings = {
        hotel_commission_percent: Number(data.hotel_commission_percent ?? 10),
        customer_service_fee_percent: Number(data.customer_service_fee_percent ?? 3)
      };
    }
  };

  const updateRateOptions = () => {
    const unit = selectedUnit || selectedProperty?.units?.find((item) => item.id === elements.unit?.value);
    if (!elements.rate) return;
    const rates = unit?.rates || [];
    elements.rate.innerHTML = rates.length
      ? rates.map((rate)=>`<option value="${rate.id}">${escapeHtml(rate.rate_name)} — ${escapeHtml(mealPlanLabel(rate.meal_plan))} — ${escapeHtml(occupancyLabel(rate.occupancy_type))} (${rate.occupancy_pax} pax) — ${money(rate.nightly_price_kes)}/night</option>`).join('')
      : '<option value="">No approved rates available</option>';
    if (rates.length) elements.bookingGuests.max = Math.max(...rates.map((rate)=>Number(rate.occupancy_pax||1)));
    updatePrice();
  };

  const updatePrice = () => {
    const unit = selectedUnit || selectedProperty?.units?.find((item) => item.id === elements.unit?.value);
    const rate = unit?.rates?.find((item) => item.id === elements.rate?.value);
    const checkIn = elements.bookingCheckIn?.value;
    const checkOut = elements.bookingCheckOut?.value;
    if (!unit || !rate || !checkIn || !checkOut || checkOut <= checkIn) {
      setMessage(elements.price, 'Choose valid dates, a room and a rate plan to see the estimated stay total.');
      return;
    }
    const nights = Math.round((new Date(`${checkOut}T12:00:00Z`) - new Date(`${checkIn}T12:00:00Z`)) / 86400000);
    const hotelAmount = nights * Number(rate.nightly_price_kes);
    const servicePercent = Number(accommodationFinanceSettings.customer_service_fee_percent || 0);
    const serviceFee = Math.round(hotelAmount * servicePercent / 100);
    const customerTotal = hotelAmount + serviceFee;
    setMessage(elements.price, `${escapeHtml(rate.rate_name)} · Room ${money(hotelAmount)} + LEOGO service fee ${servicePercent}% (${money(serviceFee)}) = ${money(customerTotal)} total.`);
  };

  const closeModal = () => {
    selectedUnit = null;
    if (elements.bookingForm) elements.bookingForm.hidden = true;
    if (elements.roomDetail) elements.roomDetail.hidden = true;
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
    selectedUnit = null;
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
    elements.bookingCheckIn.value = elements.checkIn?.value || todayKey();
    elements.bookingCheckOut.value = elements.checkOut?.value || addDays(elements.bookingCheckIn.value, 1);
    elements.bookingGuests.value = elements.guests?.value || 1;
    elements.unit.innerHTML = '';
    elements.rate.innerHTML = '';
    elements.bookingForm.hidden = true;
    elements.roomDetail.hidden = true;
    setMessage(elements.bookingStatus);
    renderRoomCatalogue();
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
      <div class="accommodation-booking-facts"><span><small>Stay</small><strong>${escapeHtml(kenyaDate(booking.check_in))} – ${escapeHtml(kenyaDate(booking.check_out))}</strong></span><span><small>Guests</small><strong>${booking.guests}</strong></span><span><small>Room charge</small><strong>${money(booking.hotel_booking_amount_kes ?? booking.total_amount_kes)}</strong></span><span><small>LEOGO service fee (${Number(booking.customer_service_fee_percent||0)}%)</small><strong>${money(booking.customer_service_fee_kes||0)}</strong></span><span><small>Customer total</small><strong>${money(booking.customer_total_kes ?? booking.total_amount_kes)}</strong></span></div>
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
      .select('id,booking_reference,property_name_snapshot,unit_name_snapshot,check_in,check_out,nights,guests,hotel_booking_amount_kes,customer_service_fee_percent,customer_service_fee_kes,customer_total_kes,total_amount_kes,booking_status,host_response,created_at')
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
  elements.roomCatalogue?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view-accommodation-room]');
    if (button) renderRoomDetail(button.dataset.viewAccommodationRoom);
  });
  elements.roomGallery?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-room-gallery-image]');
    if (!button || !selectedUnit) return;
    elements.roomMainPhoto.innerHTML = `<img src="${escapeHtml(button.dataset.roomGalleryImage)}" alt="${escapeHtml(selectedUnit.unit_name)}">`;
    elements.roomGallery.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  });
  elements.bookSelectedRoom?.addEventListener('click', beginRoomBooking);
  elements.selectedRoomSummary?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-change-accommodation-room]')) return;
    elements.bookingForm.hidden = true;
    elements.roomCatalogue.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  elements.modal?.querySelectorAll('[data-close-accommodation-modal]').forEach((button) => button.addEventListener('click', closeModal));
  [elements.unit, elements.rate, elements.bookingCheckIn, elements.bookingCheckOut].forEach((input) => input?.addEventListener('change', updatePrice));

  elements.bookingForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedProperty || !elements.bookingForm.reportValidity()) return;
    if (!auth.requireLogin('Please log in or create a customer account before sending an accommodation booking.')) {
      setMessage(elements.bookingStatus, 'Login is required before this booking can be sent.', 'error');
      return;
    }
    if (elements.bookingForm.dataset.submitting === 'true') return;
    const unit = selectedUnit || selectedProperty.units.find((item) => item.id === elements.unit.value);
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
    setMessage(elements.bookingStatus, `Booking ${data.booking_reference} was sent to the property. Customer total: ${money(data.customer_total_kes ?? data.total_amount_kes)}. It is awaiting acceptance.`, 'success');
    await loadBookings(auth.getUser());
  });

  const today = todayKey();
  [elements.checkIn, elements.bookingCheckIn].forEach((input) => { if (input) input.min = today; });
  [elements.checkOut, elements.bookingCheckOut].forEach((input) => { if (input) input.min = addDays(today, 1); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  document.addEventListener('leogo:authchange', (event) => loadBookings(event.detail?.user || null));
  client.auth.getSession().then(({ data }) => loadBookings(data.session?.user || null));
  loadAccommodationFinanceSettings().finally(() => {
    updatePrice();
  });
  loadProperties();
})();

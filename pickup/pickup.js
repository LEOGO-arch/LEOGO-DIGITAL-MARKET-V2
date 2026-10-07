(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;
window.leogoPickupDb=client;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(v)=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmt=(v,withTime=true)=>{if(!v)return '—';try{return new Intl.DateTimeFormat('en-KE',withTime?{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}:{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(v));}catch{return '—';}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi'}).format(new Date());
const monthStart=()=>{const parts=today().split('-');return parts[0]+'-'+parts[1]+'-01';};
const setStatus=(el,msg='',type='')=>{if(!el)return;el.textContent=msg;el.className='status'+(type?' '+type:'');};

const PICKUP_LOCATION_FALLBACK={"counties":[{"code":"KE039","name":"Bungoma"},{"code":"KE040","name":"Busia"},{"code":"KE043","name":"Homa Bay"},{"code":"KE037","name":"Kakamega"},{"code":"KE042","name":"Kisumu"},{"code":"KE044","name":"Migori"},{"code":"KE047","name":"Nairobi"},{"code":"KE041","name":"Siaya"},{"code":"KE026","name":"Trans Nzoia"},{"code":"KE027","name":"Uasin Gishu"}],"subcounties":[{"code":"KE026140","name":"Cherangany","county_code":"KE026"},{"code":"KE026137","name":"Endebess","county_code":"KE026"},{"code":"KE026139","name":"Kiminini","county_code":"KE026"},{"code":"KE026136","name":"Kwanza","county_code":"KE026"},{"code":"KE026138","name":"Saboti","county_code":"KE026"},{"code":"KE027144","name":"Ainabkoi","county_code":"KE027"},{"code":"KE027145","name":"Kapseret","county_code":"KE027"},{"code":"KE027146","name":"Kesses","county_code":"KE027"},{"code":"KE027143","name":"Moiben","county_code":"KE027"},{"code":"KE027141","name":"Soy","county_code":"KE027"},{"code":"KE027142","name":"Turbo","county_code":"KE027"},{"code":"KE037207","name":"Butere","county_code":"KE037"},{"code":"KE037210","name":"Ikolomani","county_code":"KE037"},{"code":"KE037208","name":"Khwisero","county_code":"KE037"},{"code":"KE037200","name":"Likuyani","county_code":"KE037"},{"code":"KE037199","name":"Lugari","county_code":"KE037"},{"code":"KE037202","name":"Lurambi","county_code":"KE037"},{"code":"KE037201","name":"Malava","county_code":"KE037"},{"code":"KE037206","name":"Matungu","county_code":"KE037"},{"code":"KE037205","name":"Mumias East","county_code":"KE037"},{"code":"KE037204","name":"Mumias West","county_code":"KE037"},{"code":"KE037203","name":"Navakholo","county_code":"KE037"},{"code":"KE037209","name":"Shinyalu","county_code":"KE037"},{"code":"KE039219","name":"Bumula","county_code":"KE039"},{"code":"KE039218","name":"Kabuchai","county_code":"KE039"},{"code":"KE039220","name":"Kanduyi","county_code":"KE039"},{"code":"KE039223","name":"Kimilili","county_code":"KE039"},{"code":"KE039216","name":"Mt. Elgon","county_code":"KE039"},{"code":"KE039217","name":"Sirisia","county_code":"KE039"},{"code":"KE039224","name":"Tongaren","county_code":"KE039"},{"code":"KE039221","name":"Webuye East","county_code":"KE039"},{"code":"KE039222","name":"Webuye West","county_code":"KE039"},{"code":"KE040231","name":"Budalangi","county_code":"KE040"},{"code":"KE040229","name":"Butula","county_code":"KE040"},{"code":"KE040230","name":"Funyula","county_code":"KE040"},{"code":"KE040228","name":"Matayos","county_code":"KE040"},{"code":"KE040227","name":"Nambale","county_code":"KE040"},{"code":"KE040225","name":"Teso North","county_code":"KE040"},{"code":"KE040226","name":"Teso South","county_code":"KE040"},{"code":"KE041234","name":"Alego Usonga","county_code":"KE041"},{"code":"KE041236","name":"Bondo","county_code":"KE041"},{"code":"KE041235","name":"Gem","county_code":"KE041"},{"code":"KE041237","name":"Rarieda","county_code":"KE041"},{"code":"KE041232","name":"Ugenya","county_code":"KE041"},{"code":"KE041233","name":"Ugunja","county_code":"KE041"},{"code":"KE042240","name":"Kisumu Central","county_code":"KE042"},{"code":"KE042238","name":"Kisumu East","county_code":"KE042"},{"code":"KE042239","name":"Kisumu West","county_code":"KE042"},{"code":"KE042243","name":"Muhoroni","county_code":"KE042"},{"code":"KE042244","name":"Nyakach","county_code":"KE042"},{"code":"KE042242","name":"Nyando","county_code":"KE042"},{"code":"KE042241","name":"Seme","county_code":"KE042"},{"code":"KE043249","name":"Homa Bay","county_code":"KE043"},{"code":"KE043246","name":"Kabondo Kasipul","county_code":"KE043"},{"code":"KE043247","name":"Karachuonyo","county_code":"KE043"},{"code":"KE043245","name":"Kasipul","county_code":"KE043"},{"code":"KE043250","name":"Ndhiwa","county_code":"KE043"},{"code":"KE043248","name":"Rangwe","county_code":"KE043"},{"code":"KE043251","name":"Suba North","county_code":"KE043"},{"code":"KE043252","name":"Suba South","county_code":"KE043"},{"code":"KE044254","name":"Awendo","county_code":"KE044"},{"code":"KE044260","name":"Kuria East","county_code":"KE044"},{"code":"KE044259","name":"Kuria West","county_code":"KE044"},{"code":"KE044258","name":"Nyatike","county_code":"KE044"},{"code":"KE044253","name":"Rongo","county_code":"KE044"},{"code":"KE044255","name":"Suna East","county_code":"KE044"},{"code":"KE044256","name":"Suna West","county_code":"KE044"},{"code":"KE044257","name":"Uriri","county_code":"KE044"},{"code":"KE047276","name":"Dagoretti","county_code":"KE047"},{"code":"KE047284","name":"Embakasi Central","county_code":"KE047"},{"code":"KE047285","name":"Embakasi East","county_code":"KE047"},{"code":"KE047283","name":"Embakasi North","county_code":"KE047"},{"code":"KE047282","name":"Embakasi South","county_code":"KE047"},{"code":"KE047286","name":"Embakasi West","county_code":"KE047"},{"code":"KE047288","name":"Kamukunji","county_code":"KE047"},{"code":"KE047280","name":"Kasarani","county_code":"KE047"},{"code":"KE047278","name":"Kibra","county_code":"KE047"},{"code":"KE047275","name":"Kilimani","county_code":"KE047"},{"code":"KE047277","name":"Langata","county_code":"KE047"},{"code":"KE047287","name":"Makadara","county_code":"KE047"},{"code":"KE047290","name":"Mathare","county_code":"KE047"},{"code":"KE047279","name":"Roysambu","county_code":"KE047"},{"code":"KE047281","name":"Ruaraka","county_code":"KE047"},{"code":"KE047289","name":"Starehe","county_code":"KE047"},{"code":"KE047274","name":"Westlands","county_code":"KE047"}]};
let dashboard=null,pickupApplication=null,pickupCounties=[],pickupSubcounties=[],parcels=[],returns=[],withdrawals=[],history=[],earnings=null,currentUser=null;
let scannerStream=null,scannerTimer=null,scannerMode='receive';
let pickupNotificationChannel=null,pickupNotificationRefreshTimer=null;

const showView=(name)=>{
  $$('#pickupNav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $$('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
  window.scrollTo({top:0,behavior:'smooth'});
};
$$('#pickupNav [data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

const parcelStatusLabel=(s)=>({booked:'Booked for station / en route',arrived_pending_receipt:'Rider delivered — pending station receipt',received:'At station / ready for collection',handed_over:'Handed over',cancelled:'Cancelled'})[s]||String(s||'Unknown').replaceAll('_',' ');
const deliveryStatusLabel=(s)=>({
  assigned:'Assigned to rider',
  picked_up:'Picked up from seller',
  arrived_sorting_center:'Arrived at LEOGO Sorting Center',
  sorting_received:'Received at LEOGO Sorting Center',
  ready_for_dispatch:'Ready for dispatch',
  on_the_way:'On the way',
  delivered_to_pickup_station:'Delivered to Pickup Station — awaiting receipt',
  ready_for_pickup:'Pickup Station received — ready for pickup',
  delivered:'Delivered',
  placed:'Order placed',
  processing:'Processing',
  cancelled:'Cancelled',
  failed:'Delivery problem'
})[s]||String(s||'Unknown').replaceAll('_',' ');
const paymentLabel=(s)=>String(s||'').replaceAll('_',' ');
const eventLabel=(s)=>({
  booked:'Parcel booked',rider_delivered_to_station:'Rider delivered parcel to station',received:'Parcel received',handed_over:'Parcel handed over',
  return_booked:'Return parcel booked',return_dispatched:'Return dispatched',withdrawal_requested:'Withdrawal requested'
})[s]||String(s||'').replaceAll('_',' ');

const PICKUP_VERIFICATION_BUCKET='pickup-station-verification';
const PICKUP_DOCUMENT_MAX_BYTES=8*1024*1024;
const PICKUP_DOCUMENT_TYPES=new Set(['image/jpeg','image/png','image/webp','application/pdf']);

const validatePickupDocument=(file,label)=>{
  if(!file)return;
  if(file.size>PICKUP_DOCUMENT_MAX_BYTES)throw new Error(label+' must be 8 MB or smaller.');
  if(!PICKUP_DOCUMENT_TYPES.has(file.type))throw new Error(label+' must be JPG, PNG, WEBP or PDF.');
};
const pickupDocumentExtension=(file)=>{
  if(file.type==='image/png')return 'png';
  if(file.type==='image/webp')return 'webp';
  if(file.type==='application/pdf')return 'pdf';
  return 'jpg';
};
const uploadPickupDocument=async(file,prefix)=>{
  if(!file)return null;
  validatePickupDocument(file,prefix);
  const path=currentUser.id+'/'+prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.'+pickupDocumentExtension(file);
  const {error}=await client.storage.from(PICKUP_VERIFICATION_BUCKET).upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
};
const removePickupDocuments=async(paths)=>{
  const clean=(paths||[]).filter(Boolean);
  if(!clean.length)return;
  try{await client.storage.from(PICKUP_VERIFICATION_BUCKET).remove(clean);}catch(_error){}
};

const PICKUP_PROOF_BUCKET='pickup-station-proof';
const PICKUP_PROOF_MAX_BYTES=8*1024*1024;
const PICKUP_PROOF_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const validateParcelProof=(file,label)=>{
  if(!file)throw new Error(label+' is required.');
  if(file.size>PICKUP_PROOF_MAX_BYTES)throw new Error(label+' must be 8 MB or smaller.');
  if(!PICKUP_PROOF_TYPES.has(file.type))throw new Error(label+' must be JPG, PNG or WEBP.');
};
const parcelProofExtension=(file)=>{
  if(file.type==='image/png')return 'png';
  if(file.type==='image/webp')return 'webp';
  return 'jpg';
};
const uploadParcelProof=async(file,mode,parcelId)=>{
  validateParcelProof(file,mode==='receive'?'Parcel receiving photo':'Handover photo');
  if(!currentUser?.id)throw new Error('Your Pickup Station session is not ready. Refresh and sign in again.');
  const safeParcelId=String(parcelId||'parcel').replace(/[^a-zA-Z0-9-]/g,'');
  const path=currentUser.id+'/'+safeParcelId+'/'+mode+'-'+Date.now()+'-'+crypto.randomUUID()+'.'+parcelProofExtension(file);
  const {error}=await client.storage.from(PICKUP_PROOF_BUCKET).upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return path;
};
const removeParcelProof=async(path)=>{
  if(!path)return;
  try{await client.storage.from(PICKUP_PROOF_BUCKET).remove([path]);}catch(_error){}
};

const parseScannedCode=(raw)=>{
  const text=String(raw||'').replace(/[\u0000-\u001f]/g,' ').trim();
  if(!text)return '';
  try{
    const u=new URL(text);
    const keys=['ref','order','order_ref','order_reference','order_id','code','waybill'];
    for(const params of [u.searchParams,new URLSearchParams(String(u.hash||'').replace(/^#\??/,''))]){
      for(const key of keys){const value=params.get(key);if(value?.trim())return value.trim();}
    }
    const segments=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    const candidate=segments.at(-1)||'';
    if(candidate.length>=4&&/^[A-Z0-9][A-Z0-9-]*$/i.test(candidate)&&/\d/.test(candidate))return candidate;
    return text;
  }catch{return text;}
};

const renderDashboard=()=>{
  const station=dashboard?.station||{};
  const account=dashboard?.account||{};
  $('#stationName').textContent=station.station_name||'Pickup Station';
  $('#stationAddress').textContent=[station.address_line,station.town,station.sub_county,station.county].filter(Boolean).join(' · ')||'LEOGO Pickup Station';
  $('#stationStatus').textContent=account.status==='active'&&station.is_active?'Active':'Inactive';
  $('#bookedCount').textContent=Number(dashboard?.booked_parcels||0);
  if($('#pendingArrivalCount'))$('#pendingArrivalCount').textContent=Number(dashboard?.pending_arrivals||0);
  $('#atStationCount').textContent=Number(dashboard?.parcels_at_station||0);
  $('#receivedToday').textContent=Number(dashboard?.received_today||0);
  $('#handedToday').textContent=Number(dashboard?.handed_over_today||0);
  $('#monthEarnings').textContent=money(dashboard?.month_earnings_kes);
  $('#availableBalance').textContent=money(dashboard?.available_balance_kes);
  if($('#handledParcelRate'))$('#handledParcelRate').textContent=money(dashboard?.handled_parcel_earning_kes??20);

  const form=$('#payoutForm');
  if(form&&account){
    form.elements.method.value=account.payout_method||'mpesa';
    form.elements.account_name.value=account.payout_account_name||'';
    form.elements.phone.value=account.payout_phone||account.phone||'';
    form.elements.account_number.value=account.payout_account_number||'';
  }
};

const filteredParcels=()=>{
  const term=($('#parcelSearch').value||'').trim().toLowerCase();
  const filter=$('#parcelStatusFilter').value||'active';
  return parcels.filter(p=>{
    const matchesFilter=filter==='all'?true:filter==='active'?['booked','arrived_pending_receipt','received'].includes(p.parcel_status):p.parcel_status===filter;
    const hay=[p.order_reference,p.customer_name,p.customer_phone,p.seller_names,p.item_summary].join(' ').toLowerCase();
    return matchesFilter&&(!term||hay.includes(term));
  });
};
const openParcelAction=(mode,reference)=>{
  const receive=mode==='receive';
  const form=$(receive?'#receiveForm':'#handoverForm');
  const codeInput=$(receive?'#receiveCode':'#handoverCode');
  const nextInput=$(receive?'#receivePhoto':'#handoverIdNumber');
  if(!reference||!form||!codeInput||!nextInput)return;
  showView('operations');
  codeInput.value=reference;
  $('#lookupCode').value=reference;
  setStatus(receive?$('#receiveStatus'):$('#handoverStatus'),'Order '+reference+' loaded. Complete the required photo and confirmation below.','success');
  window.setTimeout(()=>{
    form.scrollIntoView({behavior:'smooth',block:'start'});
    nextInput.focus({preventScroll:true});
  },80);
};

const renderParcels=()=>{
  const rows=filteredParcels();
  $('#parcelList').innerHTML=rows.length?rows.map(p=>`
    <article class="parcel-row">
      <header><div><strong>${esc(p.order_reference)}</strong><p>${esc(p.customer_name)} · ${esc(p.customer_phone)}</p></div><span class="pill ${esc(p.parcel_status)}">${esc(parcelStatusLabel(p.parcel_status))}</span></header>
      <p><b>Items:</b> ${esc(p.item_summary)}<br><b>Seller:</b> ${esc(p.seller_names)}<br><b>Payment:</b> ${esc(paymentLabel(p.payment_status))} · <b>Total:</b> ${esc(money(p.grand_total_kes))}${Number(p.reward_points_redeemed_kes||0)>0?' · <b>Points:</b> '+esc(money(p.reward_points_redeemed_kes))+' · <b>Other payment:</b> '+esc(money(p.external_amount_due_kes)):''}</p>
      <small>Booked ${esc(fmt(p.booked_at))}${p.arrived_at?' · Rider delivered '+esc(fmt(p.arrived_at)):''}${p.received_at?' · Station received '+esc(fmt(p.received_at)):''}${p.handed_over_at?' · Collected '+esc(fmt(p.handed_over_at)):''}</small>
      ${p.parcel_status==='arrived_pending_receipt'?'<div class="arrival-pending-note"><strong>⚠ Pending Arrival Receipt</strong><span>The Rider has delivered this parcel. Confirm physical receipt with a parcel photo before it becomes Ready for Collection.</span></div>':''}
      <div class="parcel-actions">
        <button data-track="${esc(p.order_reference)}">Track</button>
        ${p.parcel_status==='arrived_pending_receipt'?'<button class="primary" data-receive="'+esc(p.order_reference)+'">Arrive</button>':''}
        ${p.parcel_status==='received'?'<button class="primary" data-handover="'+esc(p.order_reference)+'">Hand Over</button>':''}
      </div>
    </article>`).join(''):'<div class="compact-row"><strong>No parcels match this view.</strong><p>Refresh or change the filter.</p></div>';

  $$('[data-track]').forEach(b=>b.addEventListener('click',()=>{showView('operations');$('#lookupCode').value=b.dataset.track;lookupParcel(b.dataset.track);}));
  $$('[data-receive]').forEach(b=>b.addEventListener('click',()=>openParcelAction('receive',b.dataset.receive)));
  $$('[data-handover]').forEach(b=>b.addEventListener('click',()=>openParcelAction('handover',b.dataset.handover)));
};
$('#parcelSearch').addEventListener('input',renderParcels);
$('#parcelStatusFilter').addEventListener('change',renderParcels);
$$('[data-metric-view]').forEach(button=>button.addEventListener('click',async()=>{
  const view=button.dataset.metricView;
  showView(view);
  if(view==='parcels'){
    $('#parcelStatusFilter').value=button.dataset.metricFilter||'active';
    renderParcels();
    $('#parcelList').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  if(view==='history'){
    if(button.dataset.metricRange==='today'){
      const date=today();
      $('#historyFrom').value=date;
      $('#historyTo').value=date;
    }
    try{await loadHistory();}catch(error){
      $('#historyList').innerHTML='<div class="compact-row"><strong>Could not load parcel history.</strong><p>'+esc(error.message||'Please refresh and try again.')+'</p></div>';
    }
    $('#historyList').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  if(view==='earnings'){
    try{await loadEarnings();}catch(error){console.error('Pickup Station earnings could not be loaded',error);}
    $('#earningsSummary')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}));

const renderReturns=()=>{
  $('#returnList').innerHTML=returns.length?returns.map(r=>`
    <article class="compact-row"><header><strong>${esc(r.return_reference)}</strong><span class="pill">${esc(String(r.status||'').replaceAll('_',' '))}</span></header>
    <p>${esc(r.customer_name)} · ${esc(r.customer_phone)}<br>${esc(r.item_description)}<br><b>Reason:</b> ${esc(r.return_reason)}${r.original_order_reference?'<br><b>Original:</b> '+esc(r.original_order_reference):''}</p>
    <small>${esc(fmt(r.booked_at))}</small></article>`).join(''):'<div class="compact-row"><strong>No return parcels yet.</strong></div>';
};

const renderWithdrawals=()=>{
  $('#withdrawalList').innerHTML=withdrawals.length?withdrawals.map(w=>`
    <article class="compact-row"><header><strong>${esc(money(w.requested_amount_kes))}</strong><span class="pill">${esc(String(w.status||'').replaceAll('_',' '))}</span></header>
    <p>${esc(w.payout_method)} · ${esc(w.payout_account_name||'')}${w.payout_phone?' · '+esc(w.payout_phone):''}${w.payout_account_number?' · '+esc(w.payout_account_number):''}</p>
    <small>Requested ${esc(fmt(w.submitted_at))}${w.admin_notes?' · Admin: '+esc(w.admin_notes):''}</small></article>`).join(''):'<div class="compact-row"><strong>No withdrawal requests yet.</strong></div>';
};

const renderHistory=()=>{
  $('#historyList').innerHTML=history.length?history.map(e=>`
    <article class="compact-row"><header><strong>${esc(eventLabel(e.event_type))}</strong><span class="pill">${esc(e.parcel_reference)}</span></header>
    <p>${esc(e.notes||'Station activity')}</p><small>${esc(fmt(e.created_at))}</small></article>`).join(''):'<div class="compact-row"><strong>No station activity in this period.</strong></div>';
};

const renderEarnings=()=>{
  const data=earnings||{};
  $('#earningsSummary').innerHTML=`
    <article><small>Period earnings</small><strong>${esc(money(data.period_earnings_kes))}</strong></article>
    <article><small>Parcels handed over</small><strong>${Number(data.parcels||0)}</strong></article>
    <article><small>Current earning / parcel</small><strong>${esc(money(data.current_handled_parcel_rate_kes??dashboard?.handled_parcel_earning_kes??20))}</strong></article>
    <article><small>Earning source</small><strong>Delivery fee</strong></article>
    <article><small>Available balance</small><strong>${esc(money(data.available_balance_kes))}</strong></article>`;
  const daily=Array.isArray(data.daily)?data.daily:[];
  $('#earningsDaily').innerHTML=daily.length?daily.map(d=>`
    <article class="compact-row"><header><strong>${esc(d.day)}</strong><b>${esc(money(d.earnings_kes))}</b></header><p>${Number(d.parcels||0)} parcel(s) handed over</p></article>`).join(''):'<div class="compact-row"><strong>No earnings in this period.</strong></div>';
};

const renderPickupSubcounties=(preferredName='')=>{
  const countySelect=$('#applicationCounty');
  const subcountySelect=$('#applicationSubCounty');
  if(!countySelect||!subcountySelect)return;
  const selectedOption=countySelect.selectedOptions?.[0];
  const countyCode=selectedOption?.dataset?.code||'';
  if(!countyCode){
    subcountySelect.innerHTML='<option value="">Choose a county first</option>';
    subcountySelect.disabled=true;
    return;
  }
  const options=pickupSubcounties.filter(item=>item.county_code===countyCode);
  subcountySelect.innerHTML=options.length
    ? '<option value="">Select sub-county</option>'+options.map(item=>'<option value="'+esc(item.name)+'">'+esc(item.name)+'</option>').join('')
    : '<option value="">No active sub-counties configured</option>';
  subcountySelect.disabled=!options.length;
  if(preferredName&&options.some(item=>item.name===preferredName))subcountySelect.value=preferredName;
};

const paintPickupLocations=()=>{
  const countySelect=$('#applicationCounty');
  const subcountySelect=$('#applicationSubCounty');
  if(!countySelect||!subcountySelect)return;
  const previousCounty=countySelect.value;
  countySelect.innerHTML='<option value="">Select county</option>'+pickupCounties.map(item=>
    '<option value="'+esc(item.name)+'" data-code="'+esc(item.code)+'">'+esc(item.name)+'</option>'
  ).join('');
  countySelect.disabled=!pickupCounties.length;
  if(previousCounty&&pickupCounties.some(item=>item.name===previousCounty)){
    countySelect.value=previousCounty;
    renderPickupSubcounties();
  }else{
    subcountySelect.innerHTML='<option value="">Choose a county first</option>';
    subcountySelect.disabled=true;
  }
};

const loadPickupLocations=async()=>{
  const countySelect=$('#applicationCounty');
  const subcountySelect=$('#applicationSubCounty');
  if(!countySelect||!subcountySelect)return;

  // Paint the supported LEOGO locations immediately so a slow network cannot leave
  // the form stuck on "Loading counties…".
  pickupCounties=[...(PICKUP_LOCATION_FALLBACK.counties||[])];
  pickupSubcounties=[...(PICKUP_LOCATION_FALLBACK.subcounties||[])];
  paintPickupLocations();

  try{
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Location directory timeout')),5000));
    const request=Promise.all([
      client.from('kenya_counties').select('code,name').eq('is_active',true).order('name'),
      client.from('kenya_subcounties').select('code,county_code,name').eq('is_active',true).order('name')
    ]);
    const [countyResult,subcountyResult]=await Promise.race([request,timeout]);
    if(countyResult?.error||subcountyResult?.error)return;
    if(countyResult?.data?.length){
      pickupCounties=countyResult.data;
      pickupSubcounties=subcountyResult.data||pickupSubcounties;
      paintPickupLocations();
    }
  }catch(_error){
    // Keep the already rendered fallback directory.
  }
};

$('#applicationCounty')?.addEventListener('change',()=>renderPickupSubcounties());

const fillApplicationForm=(app={})=>{
  const form=$('#pickupApplicationForm');if(!form)return;
  const values={
    station_name:app.station_name||'',
    applicant_name:app.applicant_name||currentUser?.user_metadata?.full_name||currentUser?.user_metadata?.name||'',
    id_number:app.id_number||'',
    phone:app.phone||'',
    county:app.county||'',
    sub_county:app.sub_county||'',
    town:app.town||'',
    address_line:app.address_line||'',
    landmark:app.landmark||'',
    door_number:app.door_number||'',
    operating_hours:app.operating_hours||'',
    map_link:app.map_link||'',
    latitude:app.latitude??'',
    longitude:app.longitude??''
  };
  Object.entries(values).forEach(([key,value])=>{
    if(['county','sub_county'].includes(key))return;
    if(form.elements[key])form.elements[key].value=value;
  });
  const countySelect=$('#applicationCounty');
  if(countySelect&&app.county&&pickupCounties.some(item=>item.name===app.county)){
    countySelect.value=app.county;
    renderPickupSubcounties(app.sub_county||'');
  }else if(countySelect){
    countySelect.value='';
    renderPickupSubcounties();
  }
  const businessId=$('#pickupBusinessIdDocument');
  const licence=$('#pickupBusinessLicence');
  if(businessId){
    businessId.required=!app.business_id_document_path;
    businessId.dataset.existingPath=app.business_id_document_path||'';
  }
  if(licence)licence.dataset.existingPath=app.business_licence_path||'';
  if($('#pickupRegistrationCertificate'))$('#pickupRegistrationCertificate').dataset.existingPath=app.registration_certificate_path||'';
  if($('#pickupOtherPermits'))$('#pickupOtherPermits').dataset.existingPaths=JSON.stringify(Array.isArray(app.other_permit_paths)?app.other_permit_paths:[]);
};

const renderApplicationGate=()=>{
  const app=pickupApplication?.application||null;
  const status=app?.application_status||'not_submitted';
  const form=$('#pickupApplicationForm');
  const eyebrow=$('#pickupApplicationEyebrow');
  const title=$('#pickupApplicationTitle');
  const message=$('#pickupApplicationMessage');
  const notice=$('#pickupApplicationNotice');
  if(!form||!eyebrow||!title||!message||!notice)return;

  notice.className='application-notice'+(status!=='not_submitted'?' '+status:'');
  form.hidden=false;

  if(status==='pending'){
    eyebrow.textContent='APPLICATION SUBMITTED';
    title.textContent='Waiting for LEOGO Admin approval';
    message.textContent='Your Pickup Station application has been received. Parcel functions remain locked until Admin approves it.';
    notice.textContent='Status: PENDING APPROVAL. You cannot scan, receive, hand over parcels, book returns or request earnings yet.';
    form.hidden=true;
  }else if(status==='under_review'){
    eyebrow.textContent='ADMIN REVIEW';
    title.textContent='Your Pickup Station application is under review';
    message.textContent='LEOGO Admin is reviewing your station details. The operational dashboard stays locked until approval.';
    notice.textContent='Status: UNDER REVIEW. You will receive an update after Admin makes a decision.';
    form.hidden=true;
  }else if(status==='changes_requested'){
    eyebrow.textContent='CORRECTION REQUIRED';
    title.textContent='Admin requested changes to your application';
    message.textContent='Correct the station details below and resubmit for approval.';
    notice.textContent='Admin note: '+(app.admin_notes||'Please correct the requested details and resubmit.');
    fillApplicationForm(app);
  }else if(status==='rejected'){
    eyebrow.textContent='APPLICATION NOT APPROVED';
    title.textContent='Review the Admin note before resubmitting';
    message.textContent='The operational dashboard remains locked. You may correct the application and submit it again.';
    notice.textContent='Admin note: '+(app.admin_notes||'Application was not approved.');
    fillApplicationForm(app);
  }else if(status==='approved'){
    eyebrow.textContent='APPROVED';
    title.textContent='Pickup Station approved — finishing account access';
    message.textContent='Your application is approved. Refresh the portal; if access still does not open, contact LEOGO Admin.';
    notice.textContent='Status: APPROVED.';
    form.hidden=true;
  }else{
    eyebrow.textContent='PICKUP STATION PARTNER';
    title.textContent='Apply to operate a LEOGO Pickup Station';
    message.textContent='Parcel operations stay locked until LEOGO Admin approves this application or manually assigns your account to an existing approved station.';
    notice.textContent='No parcel scanning, receiving, handover, returns or earnings functions are available before approval.';
    fillApplicationForm({});
  }
};

const loadPickupApplication=async()=>{
  const {data,error}=await client.rpc('pickup_partner_get_application');
  if(error)throw error;
  pickupApplication=data||{exists:false};
  renderApplicationGate();
  return pickupApplication;
};

const loadDashboard=async()=>{
  const {data,error}=await client.rpc('pickup_partner_get_dashboard');
  if(error)throw error;
  dashboard=data||{assigned:false};
  if(!dashboard.assigned){
    stopScanner();
    $('#portal').hidden=true;
    $('#assignmentGate').hidden=false;
    await loadPickupApplication();
    return false;
  }
  if(dashboard.account?.status!=='active'){
    stopScanner();
    $('#portal').hidden=true;$('#assignmentGate').hidden=false;
    pickupApplication={exists:true,application:{application_status:'under_review'}};
    $('#pickupApplicationEyebrow').textContent='ACCESS SUSPENDED';
    $('#pickupApplicationTitle').textContent='Your Pickup Station access is not active';
    $('#pickupApplicationMessage').textContent='Contact LEOGO Admin to reactivate your Pickup Station Partner account.';
    $('#pickupApplicationNotice').textContent='Parcel operations are locked while this station access is inactive.';
    $('#pickupApplicationNotice').className='application-notice rejected';
    $('#pickupApplicationForm').hidden=true;
    return false;
  }
  $('#assignmentGate').hidden=true;$('#portal').hidden=false;renderDashboard();return true;
};
const loadParcels=async()=>{const {data,error}=await client.rpc('pickup_partner_list_parcels_v2');if(error)throw error;parcels=data||[];renderParcels();};
const loadReturns=async()=>{const {data,error}=await client.rpc('pickup_partner_list_returns');if(error)throw error;returns=data||[];renderReturns();};
const loadWithdrawals=async()=>{const {data,error}=await client.rpc('pickup_partner_list_withdrawals');if(error)throw error;withdrawals=data||[];renderWithdrawals();};
const loadHistory=async()=>{
  const from=$('#historyFrom').value||monthStart(),to=$('#historyTo').value||today();
  const {data,error}=await client.rpc('pickup_partner_list_history',{p_from:from,p_to:to});if(error)throw error;history=data||[];renderHistory();
};
const loadEarnings=async()=>{
  const from=$('#earningsFrom').value||monthStart(),to=$('#earningsTo').value||today();
  const {data,error}=await client.rpc('pickup_partner_earnings_report',{p_from:from,p_to:to});if(error)throw error;earnings=data||{};renderEarnings();
};
const loadAll=async()=>{
  const ok=await loadDashboard();if(!ok)return;
  await Promise.all([loadParcels(),loadReturns(),loadWithdrawals(),loadHistory(),loadEarnings()]);
};

const queuePickupNotificationRefresh=()=>{
  if(!currentUser)return;
  if(pickupNotificationRefreshTimer)clearTimeout(pickupNotificationRefreshTimer);
  pickupNotificationRefreshTimer=setTimeout(()=>{
    pickupNotificationRefreshTimer=null;
    loadAll().catch((error)=>console.warn('Pickup Station notification refresh failed:',error));
  },220);
};

const stopPickupNotificationRealtime=()=>{
  if(pickupNotificationRefreshTimer)clearTimeout(pickupNotificationRefreshTimer);
  pickupNotificationRefreshTimer=null;
  if(pickupNotificationChannel){
    const channel=pickupNotificationChannel;
    pickupNotificationChannel=null;
    client.removeChannel(channel).catch?.(()=>{});
  }
};

const startPickupNotificationRealtime=()=>{
  stopPickupNotificationRealtime();
  if(!currentUser)return;
  const handle=(payload)=>{
    const row=payload?.new||{};
    if(String(row.partner_type||'')==='pickup_station')queuePickupNotificationRefresh();
  };
  pickupNotificationChannel=client
    .channel('leogo-pickup-notifications-'+currentUser.id)
    .on('postgres_changes',{
      event:'INSERT',
      schema:'public',
      table:'partner_notifications',
      filter:'user_id=eq.'+currentUser.id
    },handle)
    .on('postgres_changes',{
      event:'UPDATE',
      schema:'public',
      table:'partner_notifications',
      filter:'user_id=eq.'+currentUser.id
    },handle)
    .subscribe((subscriptionStatus)=>{
      if(['CHANNEL_ERROR','TIMED_OUT'].includes(subscriptionStatus)){
        console.warn('Pickup Station realtime notifications unavailable; fallback refresh remains active.');
      }
    });
};

const lookupParcel=async(code)=>{
  const target=$('#lookupResult');
  target.innerHTML='<p>Checking parcel…</p>';
  const {data,error}=await client.rpc('pickup_partner_lookup_parcel',{p_code:parseScannedCode(code)});
  if(error){target.innerHTML='<p style="color:#b42318">'+esc(error.message)+'</p>';return null;}
  const items=Array.isArray(data?.items)?data.items:[];
  target.innerHTML=`<h3>${esc(data.order_reference)}</h3>
    <p><b>Status:</b> ${esc(parcelStatusLabel(data.parcel_status))}<br><b>Customer:</b> ${esc(data.customer_name)} · ${esc(data.customer_phone)}<br>
    <b>Payment:</b> ${esc(paymentLabel(data.payment_status))} · <b>Total:</b> ${esc(money(data.grand_total_kes))}${Number(data.reward_points_redeemed_kes||0)>0?' · <b>Points used:</b> '+esc(money(data.reward_points_redeemed_kes))+' · <b>Other payment:</b> '+esc(money(data.external_amount_due_kes)):''}</p>
    <p><b>Items:</b> ${items.map(i=>esc(i.name)+(i.variant?' — '+esc(i.variant):'')+' ×'+Number(i.quantity||1)).join(', ')||'—'}</p>
    <small>Booked ${esc(fmt(data.booked_at))}${data.arrived_at?' · Rider delivered '+esc(fmt(data.arrived_at)):''}${data.received_at?' · Station received '+esc(fmt(data.received_at)):''}${data.handed_over_at?' · Handed over '+esc(fmt(data.handed_over_at)):''}</small>`;
  return data;
};
$('#lookupForm').addEventListener('submit',e=>{e.preventDefault();lookupParcel($('#lookupCode').value);});

const runParcelAction=async(mode,code,notes='',photoFile=null,customerIdNumber='')=>{
  const parsed=parseScannedCode(code);
  if(!parsed)throw new Error('Enter or scan the order / waybill number');
  const preview=await client.rpc('pickup_partner_lookup_parcel',{p_code:parsed});
  if(preview.error)throw preview.error;
  const p=preview.data||{};

  if(mode==='receive'){
    if(p.parcel_status==='booked')throw new Error('Parcel arrival has not yet been confirmed by the Rider.');
    if(p.parcel_status==='received')throw new Error(p.order_reference+' has already been received at this Pickup Station.');
    if(p.parcel_status==='handed_over')throw new Error(p.order_reference+' has already been handed over.');
    if(p.parcel_status!=='arrived_pending_receipt')throw new Error('This parcel is not awaiting station receipt.');
  }
  if(mode==='handover'&&p.parcel_status!=='received'){
    if(p.parcel_status==='handed_over')throw new Error(p.order_reference+' has already been handed over.');
    if(p.parcel_status==='arrived_pending_receipt')throw new Error('Confirm station receipt of '+p.order_reference+' with the parcel photo before handing it over to the customer.');
    throw new Error('Receive '+p.order_reference+' at the Pickup Station before handing it over.');
  }

  validateParcelProof(photoFile,mode==='receive'?'Parcel receiving photo':'Handover photo');
  const cleanId=String(customerIdNumber||'').trim();
  if(mode==='handover'&&cleanId.length<4)throw new Error('Enter the customer ID number before handing over the parcel.');

  const cod=p.payment_status==='cod_due'? '\n\nCOD ORDER: Collect '+money(p.external_amount_due_kes??p.grand_total_kes)+' before handing over.'+(Number(p.reward_points_redeemed_kes||0)>0?' LEOGO Points already covered '+money(p.reward_points_redeemed_kes)+'.':'') : '';
  const message=mode==='receive'
    ? 'Confirm receipt of '+p.order_reference+' for '+p.customer_name+' at this Pickup Station? The parcel photo will be saved as receiving evidence.'
    : 'Confirm you are handing '+p.order_reference+' to '+p.customer_name+'? The customer ID number and handover photo will be saved as collection evidence.'+cod;
  if(!window.confirm(message))return null;

  let proofPath='';
  try{
    proofPath=await uploadParcelProof(photoFile,mode,p.parcel_id);
    const rpc=mode==='receive'?'pickup_partner_receive_parcel':'pickup_partner_handover_parcel';
    const args=mode==='receive'
      ? {p_code:parsed,p_notes:notes.trim()||null,p_receive_photo_path:proofPath}
      : {p_code:parsed,p_notes:notes.trim()||null,p_handover_photo_path:proofPath,p_customer_id_number:cleanId};
    const {data,error}=await client.rpc(rpc,args);
    if(error)throw error;
    await loadAll();
    $('#lookupCode').value=p.order_reference||parsed;
    lookupParcel(p.order_reference||parsed);
    return data;
  }catch(error){
    if(proofPath)await removeParcelProof(proofPath);
    throw error;
  }
};

$('#receiveForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!e.currentTarget.reportValidity())return;
  const b=e.submitter;const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='Receiving…';}setStatus($('#receiveStatus'),'Checking parcel and uploading receiving photo…');
  try{
    const r=await runParcelAction('receive',$('#receiveCode').value,$('#receiveNotes').value,$('#receivePhoto').files?.[0]||null);
    if(r){
      $('#receivePhoto').value='';
      setStatus($('#receiveStatus'),'✓ '+r.order_reference+' received with required parcel photo. Admin, customer and Seller updates were created.','success');
    }
  }
  catch(err){setStatus($('#receiveStatus'),err.message||'Parcel could not be received.','error');}
  finally{if(b){b.disabled=false;b.textContent=old;}}
});
$('#handoverForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!e.currentTarget.reportValidity())return;
  const b=e.submitter;const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='Handing over…';}setStatus($('#handoverStatus'),'Checking parcel and uploading handover evidence…');
  try{
    const r=await runParcelAction(
      'handover',
      $('#handoverCode').value,
      $('#handoverNotes').value,
      $('#handoverPhoto').files?.[0]||null,
      $('#handoverIdNumber').value
    );
    if(r){
      $('#handoverPhoto').value='';
      $('#handoverIdNumber').value='';
      setStatus($('#handoverStatus'),'✓ '+r.order_reference+' handed over with customer ID number and photo evidence. Earnings and notifications were updated.','success');
    }
  }
  catch(err){setStatus($('#handoverStatus'),err.message||'Parcel could not be handed over.','error');}
  finally{if(b){b.disabled=false;b.textContent=old;}}
});

$('#returnForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter,old=b.textContent;b.disabled=true;b.textContent='Booking…';setStatus($('#returnStatus'),'Booking return parcel…');
  const v=Object.fromEntries(new FormData(e.currentTarget).entries());
  try{
    const {data,error}=await client.rpc('pickup_partner_book_return',{
      p_original_order_reference:v.original_order_reference.trim()||null,
      p_customer_name:v.customer_name.trim(),p_customer_phone:v.customer_phone.trim(),
      p_item_description:v.item_description.trim(),p_return_reason:v.return_reason.trim()
    });
    if(error)throw error;e.currentTarget.reset();setStatus($('#returnStatus'),'✓ Return '+data.return_reference+' booked and Admin was updated.','success');await Promise.all([loadReturns(),loadHistory()]);
  }catch(err){setStatus($('#returnStatus'),err.message||'Return could not be booked.','error');}
  finally{b.disabled=false;b.textContent=old;}
});

$('#payoutForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter,old=b.textContent;b.disabled=true;b.textContent='Saving…';const v=Object.fromEntries(new FormData(e.currentTarget).entries());
  try{const {error}=await client.rpc('pickup_partner_update_payout',{p_method:v.method,p_account_name:v.account_name.trim(),p_phone:v.phone.trim()||null,p_account_number:v.account_number.trim()||null});if(error)throw error;setStatus($('#payoutStatus'),'✓ Payout account saved.','success');await loadDashboard();}
  catch(err){setStatus($('#payoutStatus'),err.message||'Payout account could not be saved.','error');}
  finally{b.disabled=false;b.textContent=old;}
});
$('#withdrawalForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter,old=b.textContent;b.disabled=true;b.textContent='Submitting…';const v=Object.fromEntries(new FormData(e.currentTarget).entries());
  try{const {data,error}=await client.rpc('pickup_partner_request_withdrawal',{p_amount_kes:Number(v.amount),p_note:v.note.trim()||null});if(error)throw error;e.currentTarget.reset();setStatus($('#withdrawalStatus'),'✓ Withdrawal request submitted for Admin review.','success');await Promise.all([loadDashboard(),loadWithdrawals(),loadHistory()]);}
  catch(err){setStatus($('#withdrawalStatus'),err.message||'Withdrawal could not be requested.','error');}
  finally{b.disabled=false;b.textContent=old;}
});

$('#historyFilter').addEventListener('submit',e=>{e.preventDefault();loadHistory().catch(err=>$('#historyList').innerHTML='<div class="compact-row">'+esc(err.message)+'</div>');});
$('#earningsFilter').addEventListener('submit',e=>{e.preventDefault();loadEarnings().catch(err=>$('#earningsDaily').innerHTML='<div class="compact-row">'+esc(err.message)+'</div>');});
$('#refreshParcels').addEventListener('click',()=>loadParcels().catch(()=>{}));
$('#refreshReturns').addEventListener('click',()=>loadReturns().catch(()=>{}));
$('#refreshPortal').addEventListener('click',()=>loadAll().catch(err=>alert(err.message)));

$('#pickupApplicationForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.submitter;
  const original=button?.textContent||'Submit for Admin Approval';
  if(button){button.disabled=true;button.textContent='Submitting…';}
  setStatus($('#pickupApplicationFormStatus'),'Submitting application for Admin approval…');
  const v=Object.fromEntries(new FormData(e.currentTarget).entries());
  const latitude=String(v.latitude||'').trim();
  const longitude=String(v.longitude||'').trim();
  const uploaded=[];
  try{
    if((latitude&&!longitude)||(!latitude&&longitude))throw new Error('Latitude and longitude must both be provided, or leave both blank.');

    const currentApp=pickupApplication?.application||{};
    const businessIdFile=$('#pickupBusinessIdDocument')?.files?.[0]||null;
    const businessLicenceFile=$('#pickupBusinessLicence')?.files?.[0]||null;
    const registrationFile=$('#pickupRegistrationCertificate')?.files?.[0]||null;
    const otherFiles=[...($('#pickupOtherPermits')?.files||[])];

    if(!businessIdFile&&!currentApp.business_id_document_path)throw new Error('Business ID / identification document is required.');
    if(!businessLicenceFile&&!currentApp.business_licence_path)throw new Error('Business licence is required for Pickup Station verification.');
    if(otherFiles.length>4)throw new Error('Choose a maximum of 4 other business permit files.');

    [businessIdFile,businessLicenceFile,registrationFile,...otherFiles].forEach((file,index)=>{
      if(file)validatePickupDocument(file,index===0?'Business ID / identification document':index===1?'Business licence':index===2?'Registration certificate':'Other permit');
    });

    setStatus($('#pickupApplicationFormStatus'),'Uploading private business documents…');
    const businessIdPath=businessIdFile?await uploadPickupDocument(businessIdFile,'business-id'):(currentApp.business_id_document_path||null);
    if(businessIdFile)uploaded.push(businessIdPath);
    const businessLicencePath=businessLicenceFile?await uploadPickupDocument(businessLicenceFile,'business-licence'):(currentApp.business_licence_path||null);
    if(businessLicenceFile)uploaded.push(businessLicencePath);
    const registrationPath=registrationFile?await uploadPickupDocument(registrationFile,'registration-certificate'):(currentApp.registration_certificate_path||null);
    if(registrationFile)uploaded.push(registrationPath);

    let otherPermitPaths=Array.isArray(currentApp.other_permit_paths)?currentApp.other_permit_paths:[];
    if(otherFiles.length){
      otherPermitPaths=[];
      for(let i=0;i<otherFiles.length;i++){
        const path=await uploadPickupDocument(otherFiles[i],'permit-'+i);
        uploaded.push(path);
        otherPermitPaths.push(path);
      }
    }

    setStatus($('#pickupApplicationFormStatus'),'Submitting application for Admin approval…');
    const {data,error}=await client.rpc('pickup_partner_submit_application',{
      p_station_name:String(v.station_name||'').trim(),
      p_applicant_name:String(v.applicant_name||'').trim(),
      p_id_number:String(v.id_number||'').trim(),
      p_phone:String(v.phone||'').trim(),
      p_county:String(v.county||'').trim(),
      p_sub_county:String(v.sub_county||'').trim(),
      p_town:String(v.town||'').trim(),
      p_address_line:String(v.address_line||'').trim(),
      p_landmark:String(v.landmark||'').trim()||null,
      p_door_number:String(v.door_number||'').trim()||null,
      p_operating_hours:String(v.operating_hours||'').trim()||null,
      p_latitude:latitude?Number(latitude):null,
      p_longitude:longitude?Number(longitude):null,
      p_map_link:String(v.map_link||'').trim()||null,
      p_business_id_document_path:businessIdPath,
      p_business_licence_path:businessLicencePath,
      p_registration_certificate_path:registrationPath,
      p_other_permit_paths:otherPermitPaths
    });
    if(error)throw error;
    setStatus($('#pickupApplicationFormStatus'),'✓ Application submitted. LEOGO Admin must approve it before parcel functions unlock.','success');
    await loadPickupApplication();
  }catch(err){
    await removePickupDocuments(uploaded);
    setStatus($('#pickupApplicationFormStatus'),err.message||'Application could not be submitted.','error');
  }finally{
    if(button){button.disabled=false;button.textContent=original;}
  }
});

$('#pinApplicationLocation')?.addEventListener('click',()=>{
  const statusEl=$('#pickupApplicationFormStatus');
  if(!navigator.geolocation){
    setStatus(statusEl,'This browser cannot access location. Paste a Maps link or enter coordinates manually.','error');
    return;
  }
  setStatus(statusEl,'Getting station location…');
  navigator.geolocation.getCurrentPosition(position=>{
    const lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
    $('#applicationLatitude').value=lat.toFixed(7);
    $('#applicationLongitude').value=lng.toFixed(7);
    if(!$('#applicationMapLink').value.trim())$('#applicationMapLink').value='https://www.google.com/maps?q='+lat.toFixed(7)+','+lng.toFixed(7);
    setStatus(statusEl,'✓ Station location pinned.','success');
  },error=>{
    setStatus(statusEl,error.code===1?'Location permission was not granted. Paste a Maps link or coordinates manually.':'Station location could not be detected.','error');
  },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
});

const scannerCanvas=document.createElement('canvas');
const scannerContext=scannerCanvas.getContext('2d',{willReadFrequently:true});
let scannerStartedAt=0;

const stopScanner=()=>{
  if(scannerTimer){clearTimeout(scannerTimer);scannerTimer=null;}
  if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}
  const video=$('#scannerVideo');if(video)video.srcObject=null;
  $('#scannerModal').hidden=true;
};

const decodeQrWithJsQr=(video)=>{
  if(typeof window.jsQR!=='function'||!scannerContext||!video||video.readyState<2)return '';
  const sourceWidth=Number(video.videoWidth||0);
  const sourceHeight=Number(video.videoHeight||0);
  if(!sourceWidth||!sourceHeight)return '';

  // Scan the same central region shown inside the orange guide first. This
  // makes a printed LEOGO QR larger for decoding on mobile cameras. Fall back
  // to the full frame for codes held outside the guide.
  const crops=[
    {left:.12,top:.18,width:.76,height:.64},
    {left:0,top:0,width:1,height:1}
  ];
  for(const crop of crops){
    const sx=Math.round(sourceWidth*crop.left);
    const sy=Math.round(sourceHeight*crop.top);
    const sw=Math.max(1,Math.round(sourceWidth*crop.width));
    const sh=Math.max(1,Math.round(sourceHeight*crop.height));
    // Keep small printed codes readable on phone cameras while capping the
    // frame size so repeated decoding remains responsive.
    const scale=Math.min(2,2048/sw);
    const width=Math.max(1,Math.round(sw*scale));
    const height=Math.max(1,Math.round(sh*scale));
    if(scannerCanvas.width!==width)scannerCanvas.width=width;
    if(scannerCanvas.height!==height)scannerCanvas.height=height;

    scannerContext.drawImage(video,sx,sy,sw,sh,0,0,width,height);
    const frame=scannerContext.getImageData(0,0,width,height);
    const result=window.jsQR(frame.data,width,height,{inversionAttempts:'attemptBoth'});
    if(result?.data)return result.data;
  }
  return '';
};

const finishQrScan=async(rawValue)=>{
  const code=parseScannedCode(rawValue);
  if(!code)return false;

  const input=scannerMode==='receive'?$('#receiveCode'):$('#handoverCode');
  const statusEl=scannerMode==='receive'?$('#receiveStatus'):$('#handoverStatus');

  // Preserve the decoded order number immediately, even if the lookup request
  // is slow or this station cannot match the parcel yet.
  input.value=code;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  $('#lookupCode').value=code;
  $('#scannerStatus').textContent='QR detected. Checking LEOGO order…';

  let data=null,error=null;
  const digits=code.replace(/\D/g,'');
  const suffix=digits.length>=4?digits.slice(-4):'';
  const lookupCodes=[...new Set([code,suffix].filter(Boolean))];
  for(const lookupCode of lookupCodes){
    try{
      const result=await client.rpc('pickup_partner_lookup_parcel',{p_code:lookupCode});
      data=result.data;
      error=result.error;
    }catch(err){
      data=null;
      error=err;
    }
    if(!error&&data?.order_reference)break;
  }

  if(error||!data?.order_reference){
    stopScanner();
    const reason=error?.message||'No matching parcel was found for this Pickup Station.';
    setStatus(statusEl,'QR scanned and order number filled ('+code+'), but parcel lookup failed: '+reason,'error');
    window.setTimeout(()=>{
      input.scrollIntoView({behavior:'smooth',block:'center'});
      input.focus({preventScroll:true});
    },120);
    return true;
  }

  input.value=data.order_reference;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  $('#lookupCode').value=data.order_reference;
  stopScanner();

  if(scannerMode==='receive'){
    setStatus(statusEl,'✓ QR scanned: '+data.order_reference+'. Take the parcel photo, then tap Receive Parcel.','success');
  }else{
    setStatus(statusEl,'✓ QR scanned: '+data.order_reference+'. Enter the customer ID, add the handover photo, then tap Hand Over.','success');
  }

  window.setTimeout(()=>{
    const next=scannerMode==='receive'?$('#receivePhoto'):$('#handoverIdNumber');
    next.scrollIntoView({behavior:'smooth',block:'center'});
    next.focus({preventScroll:true});
  },120);
  return true;
};

const scanLoop=async(detector)=>{
  if(!scannerStream)return;
  const video=$('#scannerVideo');

  try{
    if(video?.readyState>=2){
      let raw='';

      // Try the browser's native detector first.
      if(detector){
        try{
          const codes=await detector.detect(video);
          raw=codes?.[0]?.rawValue||'';
        }catch(_error){}
      }

      // Samsung/Android Chrome can open the camera successfully while native
      // BarcodeDetector still misses a QR. jsQR is the fallback for those frames.
      if(!raw){
        try{raw=decodeQrWithJsQr(video);}catch(_error){}
      }

      if(raw){
        const complete=await finishQrScan(raw);
        if(complete)return;
      }

      const elapsed=Date.now()-scannerStartedAt;
      if(elapsed>15000){
        $('#scannerStatus').textContent='Still scanning… move closer, keep the QR inside the orange frame, or use the phone flashlight. Tap Cancel Scan when finished.';
      }else if(elapsed>3500){
        $('#scannerStatus').textContent='Looking for QR… keep it inside the orange frame and hold the phone steady.';
      }
    }
  }catch(_error){}

  scannerTimer=setTimeout(()=>scanLoop(detector),180);
};

const startScanner=async(mode)=>{
  if(!dashboard?.assigned||dashboard?.account?.status!=='active'){
    stopScanner();
    alert('Pickup Station parcel functions are locked until LEOGO Admin approves or assigns this account.');
    return;
  }

  scannerMode=mode;
  scannerStartedAt=Date.now();
  $('#scannerTitle').textContent=mode==='receive'?'Scan to Receive Parcel':'Scan to Hand Over Parcel';
  $('#scannerModal').hidden=false;
  $('#scannerStatus').textContent='Starting camera…';

  try{
    scannerStream=await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1920},
        height:{ideal:1080},
        frameRate:{ideal:30},
        focusMode:{ideal:'continuous'}
      },
      audio:false
    });

    const video=$('#scannerVideo');
    video.srcObject=scannerStream;
    video.setAttribute('playsinline','');
    await video.play();

    const track=scannerStream.getVideoTracks()[0];
    try{
      const caps=track.getCapabilities?.()||{};
      const advanced={};
      if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous'))advanced.focusMode='continuous';
      if(Object.keys(advanced).length)await track.applyConstraints({advanced:[advanced]});
    }catch(_error){}

    let detector=null;
    if('BarcodeDetector' in window){
      try{
        const formats=await BarcodeDetector.getSupportedFormats();
        if(formats.includes('qr_code'))detector=new BarcodeDetector({formats:['qr_code']});
      }catch(_error){}
    }

    if(!detector&&typeof window.jsQR!=='function'){
      throw new Error('QR scanner could not start in this browser. Refresh the page and try again.');
    }

    const cameraSettings=track.getSettings?.()||{};
    const actualResolution=cameraSettings.width&&cameraSettings.height?' ('+cameraSettings.width+'×'+cameraSettings.height+')':'';
    $('#scannerStatus').textContent='Camera ready'+actualResolution+'. Point the camera at the LEOGO order QR.';
    scanLoop(detector);
  }catch(err){
    if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}
    $('#scannerStatus').textContent=err.message||'Camera could not start. Enter the order / waybill manually.';
  }
};
$$('[data-scan-mode]').forEach(b=>b.addEventListener('click',()=>startScanner(b.dataset.scanMode)));
$('#closeScanner').addEventListener('click',stopScanner);$('#stopScanner').addEventListener('click',stopScanner);
$('#scannerModal').addEventListener('click',e=>{if(e.target===$('#scannerModal'))stopScanner();});

$('#pickupLogout').addEventListener('click',async()=>{await client.auth.signOut();location.replace('../partner/');});

const boot=async()=>{
  $('#historyFrom').value=monthStart();$('#historyTo').value=today();$('#earningsFrom').value=monthStart();$('#earningsTo').value=today();
  const {data:{session},error}=await client.auth.getSession();
  if(error||!session){stopScanner();$('#authGate').hidden=false;$('#assignmentGate').hidden=true;$('#portal').hidden=true;return;}
  currentUser=session.user;$('#authGate').hidden=true;
  startPickupNotificationRealtime();
  try{
    await loadPickupLocations();
    await loadAll();
    const params=new URLSearchParams(location.search);
    const incoming=(params.get('ref')||params.get('order')||'').trim();
    if(incoming&&dashboard?.assigned){
      $('#receiveCode').value=incoming;$('#handoverCode').value=incoming;$('#lookupCode').value=incoming;
      showView('operations');lookupParcel(incoming);
    }
  }catch(err){
    stopScanner();
    $('#portal').hidden=true;$('#assignmentGate').hidden=false;
    $('#pickupApplicationEyebrow').textContent='PORTAL ERROR';
    $('#pickupApplicationTitle').textContent='Pickup Station portal could not load';
    $('#pickupApplicationMessage').textContent=err.message||'Refresh and try again.';
    $('#pickupApplicationNotice').textContent='Parcel functions remain locked until the portal loads and confirms an approved station account.';
    $('#pickupApplicationNotice').className='application-notice rejected';
    $('#pickupApplicationForm').hidden=true;
  }
};

client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){
    stopPickupNotificationRealtime();
    location.replace('../partner/');
    return;
  }
  if(session?.user&&!currentUser){
    currentUser=session.user;
    startPickupNotificationRealtime();
    loadAll().catch(()=>{});
  }
});
window.addEventListener('beforeunload',()=>{
  stopScanner();
  stopPickupNotificationRealtime();
});

// Keep the station dashboard fresh so newly booked parcels appear without a manual reload.
window.setInterval(()=>{
  if(document.visibilityState!=='visible'||!currentUser||!dashboard?.assigned)return;
  Promise.all([
    loadDashboard(),
    loadParcels(),
    loadWithdrawals()
  ]).catch(()=>{});
},30000);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&currentUser&&dashboard?.assigned){
    queuePickupNotificationRefresh();
  }
});
window.addEventListener('focus',()=>{
  if(currentUser&&dashboard?.assigned)queuePickupNotificationRefresh();
});

boot();
})();
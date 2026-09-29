(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(v)=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmt=(v,withTime=true)=>{if(!v)return '—';try{return new Intl.DateTimeFormat('en-KE',withTime?{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}:{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(new Date(v));}catch{return '—';}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi'}).format(new Date());
const monthStart=()=>{const parts=today().split('-');return parts[0]+'-'+parts[1]+'-01';};
const setStatus=(el,msg='',type='')=>{if(!el)return;el.textContent=msg;el.className='status'+(type?' '+type:'');};

let dashboard=null,parcels=[],returns=[],withdrawals=[],history=[],earnings=null,currentUser=null;
let scannerStream=null,scannerTimer=null,scannerMode='receive';

const showView=(name)=>{
  $$('#pickupNav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $$('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
  window.scrollTo({top:0,behavior:'smooth'});
};
$$('#pickupNav [data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

const parcelStatusLabel=(s)=>({booked:'Booked for station',received:'At station / ready for collection',handed_over:'Handed over',cancelled:'Cancelled'})[s]||String(s||'Unknown').replaceAll('_',' ');
const paymentLabel=(s)=>String(s||'').replaceAll('_',' ');
const eventLabel=(s)=>({
  booked:'Parcel booked',received:'Parcel received',handed_over:'Parcel handed over',
  return_booked:'Return parcel booked',return_dispatched:'Return dispatched',withdrawal_requested:'Withdrawal requested'
})[s]||String(s||'').replaceAll('_',' ');

const parseScannedCode=(raw)=>{
  const text=String(raw||'').trim();
  if(!text)return '';
  try{
    const u=new URL(text);
    return (u.searchParams.get('ref')||u.searchParams.get('order')||text).trim();
  }catch{return text;}
};

const renderDashboard=()=>{
  const station=dashboard?.station||{};
  const account=dashboard?.account||{};
  $('#stationName').textContent=station.station_name||'Pickup Station';
  $('#stationAddress').textContent=[station.address_line,station.town,station.sub_county,station.county].filter(Boolean).join(' · ')||'LEOGO Pickup Station';
  $('#stationStatus').textContent=account.status==='active'&&station.is_active?'Active':'Inactive';
  $('#bookedCount').textContent=Number(dashboard?.booked_parcels||0);
  $('#atStationCount').textContent=Number(dashboard?.parcels_at_station||0);
  $('#receivedToday').textContent=Number(dashboard?.received_today||0);
  $('#handedToday').textContent=Number(dashboard?.handed_over_today||0);
  $('#monthEarnings').textContent=money(dashboard?.month_earnings_kes);
  $('#availableBalance').textContent=money(dashboard?.available_balance_kes);

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
    const matchesFilter=filter==='all'?true:filter==='active'?['booked','received'].includes(p.parcel_status):p.parcel_status===filter;
    const hay=[p.order_reference,p.customer_name,p.customer_phone,p.seller_names,p.item_summary].join(' ').toLowerCase();
    return matchesFilter&&(!term||hay.includes(term));
  });
};
const renderParcels=()=>{
  const rows=filteredParcels();
  $('#parcelList').innerHTML=rows.length?rows.map(p=>`
    <article class="parcel-row">
      <header><div><strong>${esc(p.order_reference)}</strong><p>${esc(p.customer_name)} · ${esc(p.customer_phone)}</p></div><span class="pill ${esc(p.parcel_status)}">${esc(parcelStatusLabel(p.parcel_status))}</span></header>
      <p><b>Items:</b> ${esc(p.item_summary)}<br><b>Seller:</b> ${esc(p.seller_names)}<br><b>Payment:</b> ${esc(paymentLabel(p.payment_status))} · <b>Total:</b> ${esc(money(p.grand_total_kes))}</p>
      <small>Booked ${esc(fmt(p.booked_at))}${p.received_at?' · Received '+esc(fmt(p.received_at)):''}${p.handed_over_at?' · Collected '+esc(fmt(p.handed_over_at)):''}</small>
      <div class="parcel-actions">
        <button data-track="${esc(p.order_reference)}">Track</button>
        ${p.parcel_status==='booked'?'<button class="primary" data-receive="'+esc(p.order_reference)+'">Receive</button>':''}
        ${p.parcel_status==='received'?'<button class="primary" data-handover="'+esc(p.order_reference)+'">Hand Over</button>':''}
      </div>
    </article>`).join(''):'<div class="compact-row"><strong>No parcels match this view.</strong><p>Refresh or change the filter.</p></div>';

  $$('[data-track]').forEach(b=>b.addEventListener('click',()=>{showView('operations');$('#lookupCode').value=b.dataset.track;lookupParcel(b.dataset.track);}));
  $$('[data-receive]').forEach(b=>b.addEventListener('click',()=>{showView('operations');$('#receiveCode').value=b.dataset.receive;$('#receiveCode').focus();}));
  $$('[data-handover]').forEach(b=>b.addEventListener('click',()=>{showView('operations');$('#handoverCode').value=b.dataset.handover;$('#handoverCode').focus();}));
};
$('#parcelSearch').addEventListener('input',renderParcels);
$('#parcelStatusFilter').addEventListener('change',renderParcels);

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
    <article><small>Available balance</small><strong>${esc(money(data.available_balance_kes))}</strong></article>`;
  const daily=Array.isArray(data.daily)?data.daily:[];
  $('#earningsDaily').innerHTML=daily.length?daily.map(d=>`
    <article class="compact-row"><header><strong>${esc(d.day)}</strong><b>${esc(money(d.earnings_kes))}</b></header><p>${Number(d.parcels||0)} parcel(s) handed over</p></article>`).join(''):'<div class="compact-row"><strong>No earnings in this period.</strong></div>';
};

const loadDashboard=async()=>{
  const {data,error}=await client.rpc('pickup_partner_get_dashboard');
  if(error)throw error;
  dashboard=data||{assigned:false};
  if(!dashboard.assigned){
    $('#portal').hidden=true;$('#assignmentGate').hidden=false;return false;
  }
  if(dashboard.account?.status!=='active'){
    $('#portal').hidden=true;$('#assignmentGate').hidden=false;
    $('#assignmentGate h1').textContent='Your Pickup Station access is not active';
    $('#assignmentGate p').textContent='Contact LEOGO Admin to reactivate your Pickup Station Partner access.';
    return false;
  }
  $('#assignmentGate').hidden=true;$('#portal').hidden=false;renderDashboard();return true;
};
const loadParcels=async()=>{const {data,error}=await client.rpc('pickup_partner_list_parcels');if(error)throw error;parcels=data||[];renderParcels();};
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

const lookupParcel=async(code)=>{
  const target=$('#lookupResult');
  target.innerHTML='<p>Checking parcel…</p>';
  const {data,error}=await client.rpc('pickup_partner_lookup_parcel',{p_code:parseScannedCode(code)});
  if(error){target.innerHTML='<p style="color:#b42318">'+esc(error.message)+'</p>';return null;}
  const items=Array.isArray(data?.items)?data.items:[];
  target.innerHTML=`<h3>${esc(data.order_reference)}</h3>
    <p><b>Status:</b> ${esc(parcelStatusLabel(data.parcel_status))}<br><b>Customer:</b> ${esc(data.customer_name)} · ${esc(data.customer_phone)}<br>
    <b>Payment:</b> ${esc(paymentLabel(data.payment_status))} · <b>Total:</b> ${esc(money(data.grand_total_kes))}</p>
    <p><b>Items:</b> ${items.map(i=>esc(i.name)+(i.variant?' — '+esc(i.variant):'')+' ×'+Number(i.quantity||1)).join(', ')||'—'}</p>
    <small>Booked ${esc(fmt(data.booked_at))}${data.received_at?' · Received '+esc(fmt(data.received_at)):''}${data.handed_over_at?' · Handed over '+esc(fmt(data.handed_over_at)):''}</small>`;
  return data;
};
$('#lookupForm').addEventListener('submit',e=>{e.preventDefault();lookupParcel($('#lookupCode').value);});

const runParcelAction=async(mode,code,notes='')=>{
  const parsed=parseScannedCode(code);
  if(!parsed)throw new Error('Enter or scan the order / waybill number');
  const preview=await client.rpc('pickup_partner_lookup_parcel',{p_code:parsed});
  if(preview.error)throw preview.error;
  const p=preview.data||{};
  const cod=p.payment_status==='cod_due'? '\n\nCOD ORDER: Collect '+money(p.grand_total_kes)+' before handing over.' : '';
  const message=mode==='receive'
    ? 'Confirm receipt of '+p.order_reference+' for '+p.customer_name+' at this Pickup Station?'
    : 'Confirm you are handing '+p.order_reference+' to '+p.customer_name+'?'+cod;
  if(!window.confirm(message))return null;
  const rpc=mode==='receive'?'pickup_partner_receive_parcel':'pickup_partner_handover_parcel';
  const {data,error}=await client.rpc(rpc,{p_code:parsed,p_notes:notes.trim()||null});
  if(error)throw error;
  await loadAll();
  $('#lookupCode').value=parsed;lookupParcel(parsed);
  return data;
};

$('#receiveForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter;const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='Receiving…';}setStatus($('#receiveStatus'),'Confirming parcel receipt…');
  try{const r=await runParcelAction('receive',$('#receiveCode').value,$('#receiveNotes').value);if(r)setStatus($('#receiveStatus'),'✓ '+r.order_reference+' received. Admin, customer and Seller updates were created.','success');}
  catch(err){setStatus($('#receiveStatus'),err.message||'Parcel could not be received.','error');}
  finally{if(b){b.disabled=false;b.textContent=old;}}
});
$('#handoverForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter;const old=b?.textContent;
  if(b){b.disabled=true;b.textContent='Handing over…';}setStatus($('#handoverStatus'),'Confirming customer collection…');
  try{const r=await runParcelAction('handover',$('#handoverCode').value,$('#handoverNotes').value);if(r)setStatus($('#handoverStatus'),'✓ '+r.order_reference+' handed over. Earnings and notifications were updated.','success');}
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

const stopScanner=()=>{
  if(scannerTimer){clearTimeout(scannerTimer);scannerTimer=null;}
  if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}
  const video=$('#scannerVideo');if(video)video.srcObject=null;
  $('#scannerModal').hidden=true;
};
const scanLoop=async(detector)=>{
  if(!scannerStream)return;
  try{
    const codes=await detector.detect($('#scannerVideo'));
    if(codes?.length){
      const code=parseScannedCode(codes[0].rawValue);
      stopScanner();
      const input=scannerMode==='receive'?$('#receiveCode'):$('#handoverCode');
      input.value=code;
      const preview=await lookupParcel(code);
      if(preview){
        const form=scannerMode==='receive'?$('#receiveForm'):$('#handoverForm');
        window.setTimeout(()=>form.requestSubmit(),80);
      }
      return;
    }
  }catch(_){}
  scannerTimer=setTimeout(()=>scanLoop(detector),300);
};
const startScanner=async(mode)=>{
  scannerMode=mode;$('#scannerTitle').textContent=mode==='receive'?'Scan to Receive Parcel':'Scan to Hand Over Parcel';$('#scannerModal').hidden=false;
  $('#scannerStatus').textContent='Starting camera…';
  if(!('BarcodeDetector' in window)){
    $('#scannerStatus').textContent='QR camera scanning is not supported by this browser. Use the manual order / waybill field instead.';
    return;
  }
  try{
    const formats=await BarcodeDetector.getSupportedFormats();
    if(!formats.includes('qr_code'))throw new Error('QR scanning is not supported by this browser.');
    scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video=$('#scannerVideo');video.srcObject=scannerStream;await video.play();
    $('#scannerStatus').textContent='Point the camera at the LEOGO order QR.';
    scanLoop(new BarcodeDetector({formats:['qr_code']}));
  }catch(err){$('#scannerStatus').textContent=err.message||'Camera could not start. Enter the order / waybill manually.';}
};
$$('[data-scan-mode]').forEach(b=>b.addEventListener('click',()=>startScanner(b.dataset.scanMode)));
$('#closeScanner').addEventListener('click',stopScanner);$('#stopScanner').addEventListener('click',stopScanner);
$('#scannerModal').addEventListener('click',e=>{if(e.target===$('#scannerModal'))stopScanner();});

$('#pickupLogout').addEventListener('click',async()=>{await client.auth.signOut();location.replace('../partner/');});

const boot=async()=>{
  $('#historyFrom').value=monthStart();$('#historyTo').value=today();$('#earningsFrom').value=monthStart();$('#earningsTo').value=today();
  const {data:{session},error}=await client.auth.getSession();
  if(error||!session){$('#authGate').hidden=false;$('#assignmentGate').hidden=true;$('#portal').hidden=true;return;}
  currentUser=session.user;$('#authGate').hidden=true;
  try{
    await loadAll();
    const params=new URLSearchParams(location.search);
    const incoming=(params.get('ref')||params.get('order')||'').trim();
    if(incoming&&dashboard?.assigned){
      $('#receiveCode').value=incoming;$('#handoverCode').value=incoming;$('#lookupCode').value=incoming;
      showView('operations');lookupParcel(incoming);
    }
  }catch(err){
    $('#portal').hidden=true;$('#assignmentGate').hidden=false;
    $('#assignmentGate h1').textContent='Pickup Station portal could not load';
    $('#assignmentGate p').textContent=err.message||'Refresh and try again.';
  }
};

client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){location.replace('../partner/');return;}
  if(session?.user&&!currentUser){currentUser=session.user;loadAll().catch(()=>{});}
});
window.addEventListener('beforeunload',stopScanner);

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
    Promise.all([loadDashboard(),loadParcels(),loadReturns(),loadWithdrawals()]).catch(()=>{});
  }
});

boot();
})();
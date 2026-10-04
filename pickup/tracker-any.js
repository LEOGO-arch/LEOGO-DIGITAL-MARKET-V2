(() => {
  'use strict';

  const PROJECT_URL='https://uxikemfrzqatsbqutida.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_4eMZCkb3NOGEtR664VOpXQ_IkWgDRM1';
  const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  if(!client)return;

  const esc=(value='')=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=(value)=>{
    if(!value)return '—';
    try{
      return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(value));
    }catch{return '—';}
  };
  const parseCode=(raw)=>{
    const text=String(raw||'').trim();
    if(!text)return '';
    try{
      const url=new URL(text);
      return (url.searchParams.get('ref')||url.searchParams.get('order')||text).trim();
    }catch{return text;}
  };
  const statusLabel=(status)=>({
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
  })[status]||String(status||'Unknown').replaceAll('_',' ');

  const form=document.getElementById('lookupForm');
  const input=document.getElementById('lookupCode');
  const result=document.getElementById('lookupResult');
  if(!form||!input||!result)return;

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    event.stopImmediatePropagation();

    const code=parseCode(input.value);
    if(!code){
      result.innerHTML='<p class="lookup-error">Enter an order / tracking number.</p>';
      return;
    }

    result.innerHTML='<p>Checking LEOGO order…</p>';
    const {data,error}=await client.rpc('pickup_partner_track_any_order',{p_code:code});

    if(error){
      result.innerHTML='<p class="lookup-error">'+esc(error.message)+'</p>';
      return;
    }

    const station=data?.pickup_station||null;
    const address=station
      ? [station.address_line,station.town,station.sub_county,station.county].filter(Boolean).join(' · ')
      : '';
    const pickupStatus=data?.pickup_parcel_status
      ? String(data.pickup_parcel_status).replaceAll('_',' ')
      : '';
    const deliveryStatus=statusLabel(data?.delivery_status||data?.order_status);

    result.innerHTML=
      '<div class="tracking-result-head">'+
        '<div><small>LEOGO ORDER</small><h3>'+esc(data?.order_reference||'—')+'</h3></div>'+
        '<span class="pill">'+esc(deliveryStatus)+'</span>'+
      '</div>'+
      '<div class="tracking-grid">'+
        '<div><small>Delivery method</small><strong>'+esc(data?.delivery_method||'Delivery')+'</strong></div>'+
        '<div><small>Current status</small><strong>'+esc(deliveryStatus)+'</strong></div>'+
        '<div><small>Order status</small><strong>'+esc(String(data?.order_status||'').replaceAll('_',' ')||'—')+'</strong></div>'+
        '<div><small>Order date</small><strong>'+esc(fmt(data?.created_at))+'</strong></div>'+
      '</div>'+
      (station
        ? '<div class="tracking-station">'+
            '<span>PICKUP STATION</span>'+
            '<h4>'+esc(station.station_name||'LEOGO Pickup Station')+'</h4>'+
            '<p>'+esc(address||'Station details available.')+'</p>'+
            (station.landmark?'<p><b>Landmark:</b> '+esc(station.landmark)+'</p>':'')+
            (station.operating_hours?'<p><b>Operating hours:</b> '+esc(station.operating_hours)+'</p>':'')+
            (station.contact_phone?'<p><b>Station contact:</b> '+esc(station.contact_phone)+'</p>':'')+
            (pickupStatus?'<p><b>Pickup status:</b> '+esc(pickupStatus)+'</p>':'')+
          '</div>'
        : '<div class="tracking-delivery-note"><strong>🚚 '+esc(data?.delivery_method||'LEOGO Delivery')+'</strong><p>This order is not booked for Pickup Station collection. Follow the delivery status above.</p></div>'
      );
  },true);
})();
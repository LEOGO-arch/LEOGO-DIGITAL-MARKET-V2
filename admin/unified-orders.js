// LEOGO Admin — unified order visibility across existing modules.
// Read-only dashboard; every action routes to the original module.
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  const container=document.getElementById('leogoUnifiedOrders');
  if(!db||!container)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const sources=[
    {key:'marketplace',title:'Marketplace',rpc:'admin_list_marketplace_orders',view:'orders'},
    {key:'health',title:'Health & Medicine',rpc:'admin_list_health_medicine_orders',view:'health'},
    {key:'specialist',title:'Health Specialist Booking',rpc:'admin_list_health_specialist_operations',view:'health',extract:r=>r?.bookings},
    {key:'services',title:'Services',rpc:'admin_list_service_requests',view:'providers'},
    {key:'transport',title:'Transport & Parcels',rpc:'admin_list_transport_requests',view:'transport'}
  ];
  const state={records:[],errors:[],loading:false,loaded:false};
  let lastRequest=0;
  const kindFilter=document.getElementById('leogoUnifiedOrderType');
  const search=document.getElementById('leogoUnifiedOrderSearch');
  const status=document.getElementById('leogoUnifiedOrderStatus');
  const body=document.getElementById('leogoUnifiedOrderBody');
  const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'});};
  const normalise=(src,r)=>({
    id:r.id,
    source:src.key,
    type:src.title,
    view:src.view,
    reference:r.order_reference||r.request_reference||r.booking_reference||String(r.id||''),
    customer:r.receiver_name||r.customer_name||r.full_name||r.customer_phone||'Customer',
    amount:r.grand_total_kes??r.total_amount_kes??r.total_cost_kes??r.total_price_kes??null,
    status:r.order_status||r.request_status||r.booking_status||'—',
    payment:r.payment_status||'—',
    created_at:r.created_at||r.requested_at||null
  });
  const render=()=>{
    if(!body)return;
    const filter=kindFilter?.value||'all';
    const query=(search?.value||'').trim().toLowerCase();
    const rows=state.records.filter(x=>(filter==='all'||x.source===filter)
      &&(!query||[x.reference,x.customer,x.status,x.payment,x.type].some(y=>String(y||'').toLowerCase().includes(query))));
    body.innerHTML=rows.length?rows.map(x=>'<tr>'+
      '<td><strong>'+esc(x.reference)+'</strong><small>'+esc(fmtDate(x.created_at))+'</small></td>'+
      '<td>'+esc(x.type)+'</td>'+
      '<td>'+esc(x.customer)+'</td>'+
      '<td>'+(x.amount===null?'—':'KSh '+Number(x.amount||0).toLocaleString('en-KE'))+'</td>'+
      '<td><span class="status-chip">'+esc(String(x.status).replaceAll('_',' '))+'</span></td>'+
      '<td>'+esc(String(x.payment).replaceAll('_',' '))+'</td>'+
      '<td><button type="button" data-unified-open="'+esc(x.view)+'">Open '+esc(x.type)+'</button></td>'+
      '</tr>').join(''):'<tr><td colspan="7">'+(state.loading?'Loading orders…':'No matching orders.')+'</td></tr>';
    if(status)status.textContent=state.loading?'Loading all LEOGO order categories…':
      state.errors.length?'Showing '+state.records.length+' orders. Some categories could not load: '+state.errors.join('; '):
      'Showing '+state.records.length+' orders from '+sources.length+' categories.';
    body.querySelectorAll('[data-unified-open]').forEach(button=>button.addEventListener('click',()=>{
      const view=button.dataset.unifiedOpen;
      const nav=document.querySelector('[data-admin-view="'+view+'"]');
      if(nav)nav.click();
      else if(status)status.textContent='Could not locate the '+view+' screen. Please use the Admin sidebar.';
    }));
  };
  const load=async()=>{
    if(state.loading)return;
    state.loading=true;const token=++lastRequest;render();
    try{
      const results=await Promise.allSettled(sources.map(s=>db.rpc(s.rpc)));
      if(token!==lastRequest)return;
      const next=[],errors=[];
      results.forEach((result,index)=>{
        const src=sources[index];
        if(result.status==='rejected'){
          errors.push(src.title+': '+(result.reason?.message||'unavailable'));return;
        }
        if(result.value?.error){errors.push(src.title+': '+(result.value.error.message||'unavailable'));return;}
        const data=src.extract?src.extract(result.value?.data):result.value?.data;
        if(!Array.isArray(data)){errors.push(src.title+': invalid response');return;}
        next.push(...data.map(r=>normalise(src,r)));
      });
      state.records=next.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
      state.errors=errors;state.loaded=true;
    }finally{if(token===lastRequest){state.loading=false;render();}}
  };
  kindFilter?.addEventListener('change',render);
  search?.addEventListener('input',render);
  document.getElementById('leogoUnifiedOrderRefresh')?.addEventListener('click',()=>load().catch(e=>{
    if(status)status.textContent='Unable to load order summary: '+(e.message||'Please retry.');
  }));
  document.querySelectorAll('[data-admin-view="orders"]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.loaded)load().catch(()=>{});
  }));
  document.addEventListener('leogo:health-orders-refreshed',()=>{
    if(document.querySelector('[data-admin-panel="orders"]')?.classList.contains('active'))load().catch(()=>{});
  });
  if(document.querySelector('[data-admin-panel="orders"]')?.classList.contains('active'))load().catch(()=>{});
})();

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
      '<td><button type="button" data-unified-open="'+esc(x.view)+'" data-unified-source="'+esc(x.source)+'" data-unified-id="'+esc(x.id)+'">View Order</button></td>'+
      '</tr>').join(''):'<tr><td colspan="7">'+(state.loading?'Loading orders…':'No matching orders.')+'</td></tr>';
    if(status)status.textContent=state.loading?'Loading all LEOGO order categories…':
      state.errors.length?'Showing '+state.records.length+' orders. Some categories could not load: '+state.errors.join('; '):
      'Showing '+state.records.length+' orders from '+sources.length+' categories.';
    body.querySelectorAll('[data-unified-open]').forEach(button=>button.addEventListener('click',()=>{
      const source=button.dataset.unifiedSource;
      const id=button.dataset.unifiedId;
      if(source==='marketplace'){
        document.dispatchEvent(new CustomEvent('leogo:admin-open-marketplace-order',{detail:{orderId:id}}));
        return;
      }

      // Other categories already own their verification/dispatch controls.
      // Navigate to the exact record within that existing workflow.
      const selectorBySource={
        transport:'[data-admin-transport-request]',
        services:'[data-admin-service-request]',
        health:'[data-admin-health-order]',
        specialist:'[data-admin-health-specialist-booking]'
      };
      const filterBySource={
        services:'adminServiceRequestFilter',
        health:'adminHealthOrderFilter',
        specialist:'adminHealthSpecialistBookingFilter'
      };
      const filter=document.getElementById(filterBySource[source]);
      if(filter && filter.value!=='all'){
        filter.value='all';
        filter.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const nav=source==='transport'
        ?document.querySelector('[data-admin-view="transport"][data-transport-target="jobs"]')
        :document.querySelector('[data-admin-view="'+button.dataset.unifiedOpen+'"]');
      if(!nav){if(status)status.textContent='Order category is unavailable to this Admin account.';return;}
      nav.click();
      const containerSelector=selectorBySource[source];
      if(!containerSelector)return;
      let attempts=0;
      const locate=()=>{
        const record=[...document.querySelectorAll(containerSelector)]
          .find(node=>node.getAttribute(containerSelector.slice(1,-1))===id);
        if(record){
          record.scrollIntoView({behavior:'smooth',block:'center'});
          record.style.outline='3px solid #ff7900';
          record.style.outlineOffset='3px';
          window.setTimeout(()=>{record.style.outline='';record.style.outlineOffset='';},3500);
          return;
        }
        if(++attempts<12){window.setTimeout(locate,180);}
        else if(status){status.textContent='Opened '+button.dataset.unifiedOpen+'; selected order is not loaded yet. Refresh that category and try again.';}
      };
      window.setTimeout(locate,100);
    }));
  };
  const load=async()=>{
    if(state.loading)return;
    state.loading=true;const token=++lastRequest;render();
    try{
      // Keep the read-only summary gentle on the Supabase connection pool.
      const results=new Array(sources.length);
      let index=0;
      await Promise.all(Array.from({length:2},async()=>{
        while(index<sources.length){
          const i=index++;
          try{results[i]={status:'fulfilled',value:await db.rpc(sources[i].rpc)};}
          catch(reason){results[i]={status:'rejected',reason};}
        }
      }));
      if(token!==lastRequest)return;
      const next=[],errors=[];
      results.forEach((result,index)=>{
        const preservePrevious=()=>next.push(...state.records.filter(row=>row.source===sources[index].key));
        const src=sources[index];
        if(result.status==='rejected'){
          errors.push(src.title+': '+(result.reason?.message||'unavailable'));preservePrevious();return;
        }
        if(result.value?.error){errors.push(src.title+': '+(result.value.error.message||'unavailable'));preservePrevious();return;}
        const data=src.extract?src.extract(result.value?.data):result.value?.data;
        if(!Array.isArray(data)){errors.push(src.title+': invalid response');preservePrevious();return;}
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

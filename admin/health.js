// LEOGO Admin — Health & Medicine V1
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  if(!db)return;
  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const esc=(value='')=>String(value??'').replace(/[&<>'"]/g,(ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const typeLabel=(value)=>({
    pharmacy:'Pharmacy / Pharmaceuticals',
    optics:'Optics / Optical',
    medical_supplies:'Medical Equipment & Supplies',
    orthopaedic_rehab:'Orthopaedic & Rehabilitation',
    laboratory_diagnostics:'Laboratory / Diagnostics',
    health_specialist:'Health Specialist / Doctor',
    other_health:'Other Health & Medicine'
  }[value]||String(value||'').replaceAll('_',' '));
  const productTypeLabel=(value)=>({
    pharmaceutical:'Pharmaceutical',
    optical:'Optical',
    medical_supply:'Medical Supply',
    orthopaedic_rehab:'Orthopaedic / Rehabilitation',
    diagnostic_lab:'Laboratory / Diagnostic',
    other_health:'Other Health Item'
  }[value]||String(value||'').replaceAll('_',' '));
  const classificationLabel=(value)=>({
    non_medicine:'Non-medicine',
    otc:'OTC — No prescription required',
    prescription_required:'Prescription Required'
  }[value]||String(value||'').replaceAll('_',' '));
  let network={partners:[],products:[]};
  let orders=[];

  const render=()=>{
    const partners=Array.isArray(network.partners)?network.partners:[];
    const products=Array.isArray(network.products)?network.products:[];
    $('#adminHealthPartnerTotal').textContent=partners.length;
    $('#adminHealthPartnerApproved').textContent=partners.filter((x)=>x.application_status==='approved').length;
    $('#adminHealthPartnerPending').textContent=partners.filter((x)=>['submitted','under_review','changes_requested'].includes(x.application_status)).length;
    $('#adminHealthProductTotal').textContent=products.length;

    const partnerTable=$('#adminHealthPartnerTable');
    if(partnerTable){
      partnerTable.innerHTML=partners.length?partners.map((row)=>'<tr>'+
        '<td><strong>'+esc(row.business_name||'Health Partner')+'</strong><small>'+esc(row.owner_name||'')+'</small></td>'+
        '<td><span class="admin-health-type">'+esc(typeLabel(row.business_type))+'</span></td>'+
        '<td><strong>'+esc([row.town,row.sub_county,row.county].filter(Boolean).join(' · ')||'—')+'</strong><small>'+esc(row.location_details||'')+'</small></td>'+
        '<td><span class="status-chip '+esc(row.application_status)+'">'+esc(String(row.application_status||'').replaceAll('_',' '))+'</span></td>'+
        '<td>'+Number(row.product_count||0)+'</td>'+
        '<td><strong>'+esc(row.phone||'')+'</strong><small>'+esc(row.email||'')+'</small></td>'+
      '</tr>').join(''):'<tr><td colspan="6">No Health & Medicine partners registered yet.</td></tr>';
    }

    const filter=$('#adminHealthProductFilter')?.value||'all';
    const visible=filter==='all'?products:products.filter((row)=>row.approval_status===filter);
    const productTable=$('#adminHealthProductTable');
    if(productTable){
      productTable.innerHTML=visible.length?visible.map((row)=>'<tr>'+
        '<td><strong>'+esc(row.product_name||'Health Product')+'</strong>'+(row.brand?'<small>'+esc(row.brand)+'</small>':'')+'</td>'+
        '<td>'+esc(row.provider_name||'Health Partner')+'</td>'+
        '<td>'+esc(productTypeLabel(row.product_kind))+'</td>'+
        '<td>'+esc(classificationLabel(row.medicine_classification))+(row.requires_prescription?'<br><span class="admin-health-prescription">Prescription required</span>':'')+'</td>'+
        '<td>KSh '+Number(row.price_kes||0).toLocaleString('en-KE')+'</td>'+
        '<td><span class="status-chip '+esc(row.approval_status)+'">'+esc(String(row.approval_status||'').replaceAll('_',' '))+'</span>'+(row.admin_notes?'<div class="admin-health-note">'+esc(row.admin_notes)+'</div>':'')+'</td>'+
      '</tr>').join(''):'<tr><td colspan="6">No Health products match this filter.</td></tr>';
    }

    if($('#adminHealthOrderTotal'))$('#adminHealthOrderTotal').textContent=orders.length;
    const orderFilter=$('#adminHealthOrderFilter')?.value||'all';
    let orderRows=orders;
    if(orderFilter==='payment_pending')orderRows=orders.filter((row)=>row.payment_status==='submitted');
    if(orderFilter==='active')orderRows=orders.filter((row)=>!['delivered','cancelled'].includes(row.order_status));
    if(orderFilter==='closed')orderRows=orders.filter((row)=>['delivered','cancelled'].includes(row.order_status));
    const orderList=$('#adminHealthOrderList');
    if(orderList){
      orderList.innerHTML=orderRows.length?orderRows.map((row)=>{
        const items=Array.isArray(row.items)?row.items:[];
        return '<article class="admin-health-order-card" data-admin-health-order="'+esc(row.id)+'">'+
          '<header><div><span>'+esc(row.order_reference)+'</span><strong>'+esc(row.provider_name||'Health Partner')+'</strong><small>'+esc(new Date(row.created_at).toLocaleString('en-KE'))+'</small></div><b>KSh '+Number(row.grand_total_kes||0).toLocaleString('en-KE')+'</b></header>'+
          '<div class="admin-health-order-meta"><span><small>Customer</small><strong>'+esc(row.receiver_name||'Customer')+'</strong></span><span><small>Contact</small><strong>'+esc(row.contact_number||'')+'</strong></span><span><small>Payment</small><strong>'+esc(String(row.payment_status||'').replaceAll('_',' '))+'</strong></span><span><small>Order Status</small><strong>'+esc(String(row.order_status||'').replaceAll('_',' '))+'</strong></span></div>'+
          '<div class="admin-health-order-items">'+items.map((item)=>'<span>'+esc(item.product_name)+' × '+Number(item.quantity)+' <b>KSh '+Number(item.line_total_kes||0).toLocaleString('en-KE')+'</b></span>').join('')+'</div>'+
          (row.payment_message?'<div class="admin-health-payment-message"><small>Payment confirmation</small><p>'+esc(row.payment_message)+'</p></div>':'')+
          (row.payment_status==='submitted'?'<div class="admin-health-order-actions"><button type="button" data-health-payment-action="verify" data-health-payment-order="'+esc(row.id)+'">Verify Payment</button><button type="button" class="danger" data-health-payment-action="reject" data-health-payment-order="'+esc(row.id)+'">Reject Payment</button></div>':'')+
        '</article>';
      }).join(''):'<div class="loading-card">No Health & Medicine orders match this filter.</div>';
      $('[data-health-payment-action]',orderList).forEach((button)=>button.addEventListener('click',async()=>{
        const decision=button.dataset.healthPaymentAction;
        let notes=null;
        if(decision==='reject'){
          notes=window.prompt('Reason for rejecting this Health order payment:','')||'';
          if(notes.trim().length<3)return;
        }
        const original=button.textContent;button.disabled=true;button.textContent='Saving…';
        try{
          const {error}=await db.rpc('admin_review_health_medicine_order_payment',{
            p_order_id:button.dataset.healthPaymentOrder,
            p_decision:decision,
            p_notes:notes||null
          });
          if(error)throw error;
          const status=$('#adminHealthOrderStatus');
          if(status){status.textContent=decision==='verify'?'Payment verified. Health Partner can now prepare the order.':'Payment rejected and both customer and Health Partner were notified.';status.className='form-status success';}
          await load();
        }catch(error){
          const status=$('#adminHealthOrderStatus');
          if(status){status.textContent=error?.message||'Health order payment action failed.';status.className='form-status error';}
        }finally{
          button.disabled=false;button.textContent=original;
        }
      }));
    }
  };

  const load=async()=>{
    const [networkResult,ordersResult]=await Promise.all([
      db.rpc('admin_list_health_medicine_network'),
      db.rpc('admin_list_health_medicine_orders')
    ]);
    if(networkResult.error||ordersResult.error){
      const error=networkResult.error||ordersResult.error;
      console.warn('Health & Medicine Admin data could not load:',error);
      const p=$('#adminHealthPartnerTable');if(p)p.innerHTML='<tr><td colspan="6">Health & Medicine data is unavailable.</td></tr>';
      const q=$('#adminHealthProductTable');if(q)q.innerHTML='<tr><td colspan="6">Health & Medicine product data is unavailable.</td></tr>';
      const o=$('#adminHealthOrderList');if(o)o.innerHTML='<div class="loading-card">Health & Medicine orders are unavailable.</div>';
      return;
    }
    network=networkResult.data||{partners:[],products:[]};
    orders=Array.isArray(ordersResult.data)?ordersResult.data:[];
    render();
  };
  window.leogoLoadHealthMedicineAdmin=load;

  $('#refreshHealthMedicineAdmin')?.addEventListener('click',()=>load().catch(()=>{}));
  $('#adminHealthProductFilter')?.addEventListener('change',render);
  $('#adminHealthOrderFilter')?.addEventListener('change',render);
  $$('[data-admin-view="health"]').forEach((button)=>button.addEventListener('click',()=>window.setTimeout(()=>load().catch(()=>{}),50)));
})();

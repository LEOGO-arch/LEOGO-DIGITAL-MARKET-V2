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
    otc:'General / OTC',
    prescription_required:'Prescription Required',
    pharmacy_only:'Pharmacy-only'
  }[value]||String(value||'').replaceAll('_',' '));
  let network={partners:[],products:[]};

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
  };

  const load=async()=>{
    const {data,error}=await db.rpc('admin_list_health_medicine_network');
    if(error){
      console.warn('Health & Medicine Admin network could not load:',error);
      const p=$('#adminHealthPartnerTable');if(p)p.innerHTML='<tr><td colspan="6">Health & Medicine data is unavailable.</td></tr>';
      const q=$('#adminHealthProductTable');if(q)q.innerHTML='<tr><td colspan="6">Health & Medicine product data is unavailable.</td></tr>';
      return;
    }
    network=data||{partners:[],products:[]};
    render();
  };
  window.leogoLoadHealthMedicineAdmin=load;

  $('#refreshHealthMedicineAdmin')?.addEventListener('click',()=>load().catch(()=>{}));
  $('#adminHealthProductFilter')?.addEventListener('change',render);
  $$('[data-admin-view="health"]').forEach((button)=>button.addEventListener('click',()=>window.setTimeout(()=>load().catch(()=>{}),50)));
})();

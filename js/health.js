// LEOGO DIGITAL MARKET — public Health & Medicine marketplace V1
(() => {
  'use strict';
  const $=(selector,root=document)=>root?.querySelector(selector)||null;
  const $$=(selector,root=document)=>root?Array.from(root.querySelectorAll(selector)):[];
  const client=window.leogoAuth?.client;
  const section=$('#health-medicine');
  if(!client||!section)return;

  let providers=[];
  let products=[];

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
  const productKindLabel=(value)=>({
    pharmaceutical:'Pharmaceutical',
    optical:'Optical',
    medical_supply:'Medical Supply',
    orthopaedic_rehab:'Orthopaedic / Rehabilitation',
    diagnostic_lab:'Laboratory / Diagnostic',
    other_health:'Other Health Item'
  }[value]||String(value||'').replaceAll('_',' '));
  const classificationLabel=(value)=>({
    otc:'General / OTC',
    prescription_required:'Prescription Required',
    pharmacy_only:'Pharmacy-only',
    non_medicine:'Non-medicine'
  }[value]||String(value||'').replaceAll('_',' '));
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE');
  const imageUrl=(path)=>path?client.storage.from('health-medicine-public-media').getPublicUrl(path).data?.publicUrl||'':'';

  const filtered=()=>{
    const type=$('#healthMarketTypeFilter')?.value||'';
    const query=$('#healthMarketSearch')?.value.trim().toLowerCase()||'';
    const providerIds=new Set(providers.filter((row)=>{
      if(type&&row.business_type!==type)return false;
      if(!query)return true;
      return [row.business_name,row.business_type,row.other_business_type,row.county,row.sub_county,row.town,row.location_details,row.business_description]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    }).map((row)=>String(row.provider_id)));

    const filteredProducts=products.filter((row)=>{
      if(type&&row.business_type!==type)return false;
      if(!query)return true;
      return [row.product_name,row.brand,row.description,row.product_kind,row.medicine_classification,row.provider_name,row.county,row.sub_county,row.town,row.location_details]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    });
    filteredProducts.forEach((row)=>providerIds.add(String(row.provider_id)));
    return {
      providers:providers.filter((row)=>providerIds.has(String(row.provider_id))),
      products:filteredProducts
    };
  };

  const render=()=>{
    const rows=filtered();
    const status=$('#healthMarketStatus');
    if(status)status.textContent=rows.providers.length+' approved Health partner'+(rows.providers.length===1?'':'s')+' · '+rows.products.length+' approved product'+(rows.products.length===1?'':'s');

    const partnerGrid=$('#healthPartnerGrid');
    if(partnerGrid){
      partnerGrid.innerHTML=rows.providers.length?rows.providers.map((row)=>{
        const image=imageUrl(row.profile_picture_path);
        return '<article class="health-partner-card" data-health-provider-id="'+esc(row.provider_id)+'">'+
          '<div class="health-partner-photo">'+(image?'<img src="'+esc(image)+'" alt="'+esc(row.business_name)+'">':'⚕️')+'</div>'+
          '<div class="health-partner-copy"><span>'+esc(typeLabel(row.business_type))+'</span><strong>'+esc(row.business_name)+'</strong>'+
          '<small>📍 '+esc([row.location_details,row.town,row.sub_county,row.county].filter(Boolean).join(' · '))+'</small>'+
          '<em>'+Number(row.approved_product_count||0)+' approved Health product'+(Number(row.approved_product_count||0)===1?'':'s')+'</em></div>'+
        '</article>';
      }).join(''):'<div class="health-market-empty">No approved Health & Medicine partners match this filter yet.</div>';
    }

    const productGrid=$('#healthProductGrid');
    if(productGrid){
      productGrid.innerHTML=rows.products.length?rows.products.map((row)=>{
        const image=imageUrl(row.image_path);
        const classification=row.product_kind==='pharmaceutical'?classificationLabel(row.medicine_classification):productKindLabel(row.product_kind);
        return '<article class="health-public-product" data-health-product-id="'+esc(row.id)+'">'+
          '<div class="health-public-product-photo">'+(image?'<img src="'+esc(image)+'" alt="'+esc(row.product_name)+'">':'⚕️')+'</div>'+
          '<div class="health-public-product-body"><span>'+esc(productKindLabel(row.product_kind))+'</span><h4>'+esc(row.product_name)+'</h4>'+
          '<small>'+esc(row.provider_name)+' · 📍 '+esc([row.town,row.county].filter(Boolean).join(', ')||'Kenya')+'</small>'+
          (row.description?'<p>'+esc(row.description)+'</p>':'')+
          '<div class="health-public-badges"><em>'+esc(classification)+'</em>'+
            (row.requires_prescription?'<em class="prescription">Prescription required</em>':'')+
            (row.medicine_classification==='pharmacy_only'?'<em class="pharmacy-only">Pharmacy-only</em>':'')+
          '</div><b>'+money(row.price_kes)+'</b>'+
          '<button class="health-public-enquiry" type="button" data-health-enquiry="'+esc(row.id)+'">Ask LEOGO about this item</button></div>'+
        '</article>';
      }).join(''):'<div class="health-market-empty">No approved Health & Medicine products match this filter yet.</div>';
    }

    $$('[data-health-enquiry]',productGrid).forEach((button)=>button.addEventListener('click',()=>{
      const item=products.find((row)=>String(row.id)===String(button.dataset.healthEnquiry));
      if(!item)return;
      const user=window.leogoAuth?.getUser?.()||null;
      if(!user){
        document.getElementById('openLoginShell')?.click();
        return;
      }
      const chatButton=document.querySelector('[data-customer-view="chat"]')||document.querySelector('[data-open-customer-view="chat"]');
      chatButton?.click();
      window.setTimeout(()=>{
        const message=$('#customerCareMessage');
        if(message){
          message.value='Health & Medicine enquiry: '+item.product_name+' from '+item.provider_name+' ('+[item.town,item.county].filter(Boolean).join(', ')+'). Please assist me with availability and the correct ordering process.';
          message.focus();
        }
      },120);
    }));
  };

  const load=async()=>{
    const status=$('#healthMarketStatus');
    if(status)status.textContent='Loading approved Health & Medicine partners…';
    try{
      const {data,error}=await client.rpc('public_list_health_medicine');
      if(error)throw error;
      providers=Array.isArray(data?.providers)?data.providers:[];
      products=Array.isArray(data?.products)?data.products:[];
      render();
    }catch(error){
      console.warn('Health & Medicine marketplace could not load:',error);
      if(status)status.textContent='Health & Medicine listings are temporarily unavailable.';
      $('#healthPartnerGrid').innerHTML='<div class="health-market-empty">Approved Health partners could not be loaded right now.</div>';
      $('#healthProductGrid').innerHTML='<div class="health-market-empty">Approved Health products could not be loaded right now.</div>';
    }
  };

  $('#healthMarketTypeFilter')?.addEventListener('change',render);
  $('#healthMarketSearch')?.addEventListener('input',render);
  document.addEventListener('leogo:authchange',()=>load().catch(()=>{}));
  window.setTimeout(()=>load().catch(()=>{}),450);
})();

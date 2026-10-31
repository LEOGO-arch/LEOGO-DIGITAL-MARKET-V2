// Seller Market Day participation; isolated from existing Flash Sale logic.
(() => {
  'use strict';
  const client=window.leogoPartnerClient;
  if (!client) return;
  const $=(s)=>document.querySelector(s);
  const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=(message)=>{if($('#sellerMarketDayStatus'))$('#sellerMarketDayStatus').textContent=message;};
  async function load() {
    const {data:{user}}=await client.auth.getUser();if(!user)return;
    const [{data,error},{data:products,error:productsError}]=await Promise.all([
      client.rpc('seller_market_day_overview'),
      client.from('seller_products').select('id,product_name,price_kes').eq('seller_id',user.id).eq('product_approval_status','approved').eq('listing_status','active').eq('has_variants',false).eq('fulfilment_type','normal').order('product_name')
    ]);
    if(error||productsError){status((error||productsError).message);return;}
    $('#sellerMarketDayEvent').innerHTML='<option value="">Choose a Market Day…</option>'+(data?.events||[]).map(e=>`<option value="${escape(e.id)}">${escape(e.title)} (${escape(e.starts_on)} – ${escape(e.ends_on)})</option>`).join('');
    $('#sellerMarketDayProduct').innerHTML='<option value="">Choose product…</option>'+(products||[]).map(p=>`<option value="${escape(p.id)}">${escape(p.product_name)} — KSh ${Number(p.price_kes).toLocaleString('en-KE')}</option>`).join('');
    $('#sellerMarketDayList').innerHTML=(data?.offers||[]).map(o=>`<div class="panel"><strong>${escape(o.kind)}</strong> — ${escape(o.approval_status)} | Product ${escape(o.product_id)} | Stock ${escape(o.quantity_limit)}</div>`).join('')||'<p>No offers submitted yet.</p>';
  }
  $('#sellerMarketDayForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();const form=event.currentTarget;const v=Object.fromEntries(new FormData(form));
    const kind=v.kind;let tiers=[];
    if(kind==='bulk_discount') {
      try { tiers=String(v.tiers||'').split('\n').filter(Boolean).map(line=>{
        const parts=line.split(',').map(Number);if(parts.length!==2||parts.some(n=>!Number.isFinite(n)))throw new Error('Invalid bulk tiers');
        return {min_qty:parts[0],unit_price_kes:parts[1]};
      });}catch{status('Enter bulk tiers as: minimum quantity, unit price');return;}
    }
    const {error}=await client.rpc('seller_submit_market_day_offer',{
      p_event_id:v.event,p_product_id:v.product,p_kind:kind,
      p_offer_price_kes:kind==='reduced_price'?Number(v.price):null,
      p_bulk_tiers:tiers,p_quantity_limit:Number(v.quantity)
    });
    if(error){status(error.message);return;}
    status('Market Day offer submitted. Admin approval is required before publication.');
    await load();
  });
  document.querySelector('[data-seller-view="marketday"]')?.addEventListener('click',load);
})();

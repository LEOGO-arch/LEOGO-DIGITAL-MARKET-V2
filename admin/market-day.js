// LEOGO Market Day admin controls; isolated from existing Flash Sale/checkout.
(() => {
  'use strict';
  const db = window.leogoAdminDb;
  if (!db) return;
  const $ = (s) => document.querySelector(s);
  const status = (message) => { const node=$('#marketDayAdminStatus'); if(node)node.textContent=message; };
  const escape = (v) => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asMoney = (value) => 'KSh '+Number(value||0).toLocaleString('en-KE');

  async function refresh() {
    const {data,error}=await db.rpc('admin_market_day_overview');
    if(error) { status('Market Day data unavailable: '+error.message); return; }
    const events=Array.isArray(data?.events)?data.events:[];
    const offers=Array.isArray(data?.offers)?data.offers:[];
    const campaigns=Array.isArray(data?.free_delivery)?data.free_delivery:[];
    $('#marketDayEventsList').innerHTML=events.map(e=>`<div class="loading-card"><strong>${escape(e.title)}</strong> — ${escape(e.status)} | ${escape(e.starts_on)} to ${escape(e.ends_on)} | Days: ${escape((e.weekdays||[]).join(', '))}</div>`).join('')||'<p>No Market Days scheduled.</p>';
    $('#marketDayDeliveryList').innerHTML=campaigns.map(c=>`<div class="loading-card"><strong>${escape(c.title)}</strong> — ${escape(c.status)} | ${escape(c.county)} / ${escape(c.delivery_zone)} | Minimum ${asMoney(c.min_items_subtotal_kes)} | Budget ${asMoney(c.budget_kes)}</div>`).join('')||'<p>No LEOGO delivery campaigns.</p>';
    $('#marketDayOffersList').innerHTML=offers.map(o=>`<div class="loading-card"><strong>${escape(o.kind)}</strong> — ${escape(o.approval_status)} | Product: ${escape(o.product_id)} | Seller: ${escape(o.seller_id)} ${o.approval_status==='pending'?`<button type="button" data-market-offer="${escape(o.id)}" data-decision="yes">Approve</button> <button type="button" data-market-offer="${escape(o.id)}" data-decision="no">Reject</button>`:''}</div>`).join('')||'<p>No seller offers submitted.</p>';
    status('Market Day controls refreshed.');
  }

  $('#marketDayScheduleForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();const form=event.currentTarget;const v=Object.fromEntries(new FormData(form));
    const {error}=await db.rpc('admin_save_market_day',{
      p_id:null,p_title:v.title,p_starts_on:v.starts,p_ends_on:v.ends,p_start_time:v.opens,p_end_time:v.closes,
      p_weekdays:String(v.days).split(',').map(Number),p_county:v.county||null,p_status:v.status,p_description:''
    });
    if(error){status(error.message);return;}form.reset();status('Market Day schedule saved.');refresh();
  });
  $('#marketDayDeliveryForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();const form=event.currentTarget;const v=Object.fromEntries(new FormData(form));
    const {error}=await db.rpc('admin_save_free_delivery_campaign',{
      p_id:null,p_title:v.title,p_min_subtotal:Number(v.min),p_county:v.county,p_sub_county:v.subcounty||null,
      p_estate:v.estate||null,p_zone:v.zone,p_starts_at:new Date(v.starts).toISOString(),
      p_ends_at:new Date(v.ends).toISOString(),p_max_fee:Number(v.maxfee),p_budget:Number(v.budget),p_status:'draft'
    });
    if(error){status(error.message);return;}form.reset();status('Delivery campaign saved as draft.');refresh();
  });
  $('#marketDayOffersList')?.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-market-offer]');if(!button)return;
    button.disabled=true;
    const {error}=await db.rpc('admin_review_market_day_offer',{
      p_offer_id:button.dataset.marketOffer,p_approve:button.dataset.decision==='yes',p_notes:null
    });
    if(error)status(error.message);else refresh();
    button.disabled=false;
  });
  $('#marketDayRefresh')?.addEventListener('click',refresh);
  document.querySelector('[data-admin-view="marketday"]')?.addEventListener('click',()=>refresh());
})();

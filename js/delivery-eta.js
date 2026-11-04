// Advisory delivery estimates only; payment, fees and order placement remain authoritative elsewhere.
(() => {
 'use strict';
 const db=window.leogoAuth?.client;
 if(!db)return;
 const $=s=>document.querySelector(s);
 const norm=v=>String(v||'').trim().toLowerCase();
 const minutesByZone={cbd:120,estate:240,outside:1440,inter_county:2880,pickup:1440};
 const itemById=new Map();
 let loaded=false;
 const kenyaDate=(base,minutes)=>new Date(new Date(base).getTime()+minutes*60000).toLocaleString('en-KE',{
  timeZone:'Africa/Nairobi',day:'numeric',month:'long',year:'numeric',
  hour:minutes<1440?'numeric':undefined,minute:minutes<1440?'2-digit':undefined
 });
 function estimate(productId,county,zone,base=new Date(),mode='local'){
  const item=itemById.get(String(productId));
  if(!item||!norm(county)||!norm(item.seller_county)||!zone)return null;
  const crossCounty=norm(county)!==norm(item.seller_county);
  const route=crossCounty?'inter_county':zone;
  const travel=minutesByZone[route];
  if(!Number.isInteger(travel))return null;
  const handling=Number(mode==='international'?item.international_minutes:item.local_minutes)||0;
  // Seller item time and zone transit time are both end-to-end estimates;
  // take the longer promise rather than double-counting overlapping periods.
  const total=Math.max(handling,travel);
  return {minutes:total,route,crossCounty,from:item.seller_county,to:county,
   date:kenyaDate(base,total),label:'Approximate delivery: '+kenyaDate(base,total)};
 }
 function showCheckout(cart,county,zone){
  let node=$('#checkoutDeliveryEstimate');
  const parent=$('#checkoutDeliveryFeeValue')?.closest('.checkout-total-row')?.parentElement;
  if(!parent)return;
  if(!node){node=document.createElement('div');node.id='checkoutDeliveryEstimate';node.setAttribute('role','status');node.style.cssText='padding:10px 12px;border-radius:10px;background:#eef7ff;color:#173760;font-weight:600';parent.append(node);}
  const sellers=(cart||[]).filter(i=>!i.source||i.source==='seller'||i.productId);
  if(!sellers.length){node.hidden=true;return;}
  node.hidden=false;
  if(!county||!zone){node.textContent='Choose your delivery county and zone to see an approximate delivery date.';return;}
  if(!loaded){node.textContent='Calculating delivery date…';return;}
  const estimates=sellers.map(i=>estimate(i.productId||i.product_id,county,zone,new Date()));
  if(estimates.some(e=>!e)){node.textContent='Delivery estimate unavailable for one or more sellers. LEOGO will confirm the date after order review.';return;}
  const latest=estimates.reduce((a,b)=>a.minutes>=b.minutes?a:b);
  node.textContent=latest.label+' (longer of item estimate and '+(latest.crossCounty?'inter-county':'selected zone')+' timeframe; subject to confirmation).';
 }
 async function load(){
  const [durations,zones]=await Promise.all([db.rpc('public_product_delivery_durations'),db.rpc('public_delivery_eta_settings')]);
  if(durations.error||zones.error){loaded=true;document.dispatchEvent(new Event('leogo:delivery-estimates-ready'));return;}
  (durations.data||[]).forEach(row=>itemById.set(String(row.product_id),row));
  Object.entries(zones.data||{}).forEach(([k,v])=>{if(Number.isInteger(Number(v))&&Number(v)>0)minutesByZone[k]=Number(v);});
  loaded=true;
  document.dispatchEvent(new Event('leogo:delivery-estimates-ready'));
 }
 window.leogoDeliveryEta={estimate,showCheckout,load,kenyaDate};
 document.addEventListener('leogo:authchange',load);
 load();
})();

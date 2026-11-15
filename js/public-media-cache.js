(()=>{'use strict';
const BASE='https://dzdciuqkqixwutvtfotj.supabase.co/storage/v1/object/public/';
const LOCAL='/seo-catalogue/optimized-media/';
let manifest={};const failed=new WeakMap();
function safe(url){return typeof url==='string'&&/^\/seo-catalogue\/optimized-media\/[a-f0-9]{64}-(thumb|full)\.webp$/.test(url);}
function mode(img){if(img.closest('.live-product-image')){const card=img.closest('[data-live-product-card]');return card?.querySelector('[data-product-details]')?.hidden===false?'full':'thumb';}if(img.closest('.detail #main-photo,.detail>.photo,.detail .photo:not(.gallery .photo)'))return 'full';if(img.closest('.gallery,.thumb,.live-product-gallery,.live-product-variant-option,.card,.cyber-item-card,.cyber-shop-photo,.leogo-compact-partner-photo,[data-live-product-card]'))return 'thumb';return 'full';}
function apply(img){if(!(img instanceof HTMLImageElement))return;const src=img.getAttribute('src')||'';if(!src.startsWith(BASE))return;const entry=manifest[src];if(!entry)return;const target=entry[mode(img)];if(!safe(target)||failed.get(img)===src)return;img.dataset.originalPublicMedia=src;img.src=target;}
function scan(node){if(node instanceof HTMLImageElement)apply(node);if(node.querySelectorAll)node.querySelectorAll('img').forEach(apply);}
document.addEventListener('error',event=>{const img=event.target;if(!(img instanceof HTMLImageElement))return;const original=img.dataset.originalPublicMedia;if(original?.startsWith(BASE)&&img.getAttribute('src')?.startsWith(LOCAL)){failed.set(img,original);img.removeAttribute('data-original-public-media');img.src=original;}},true);
fetch(LOCAL+'manifest.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(!data||typeof data!=='object'||Array.isArray(data))return;manifest=data;scan(document);const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')apply(record.target);else record.addedNodes.forEach(scan);}});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});}).catch(()=>{});
})();

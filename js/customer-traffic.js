(()=>{
'use strict';
// Browser-level estimates, not individual identity. Respect Do Not Track.
if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;
const key='leogo-website-traffic-browser-v1';
let visitor;try{visitor=localStorage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(visitor||'')){visitor=crypto.randomUUID();localStorage.setItem(key,visitor);}}catch{visitor=crypto.randomUUID();}
function send(){const db=window.leogoAuth?.client;if(!db){return false;}db.rpc('record_customer_site_visit',{p_visitor_token:visitor}).then(({error})=>{if(error)console.info('LEOGO traffic counter unavailable');}).catch(()=>{});return true;}
if(!send()){let tries=0;const wait=setInterval(()=>{tries++;if(send()||tries>=20)clearInterval(wait);},500);}

function recordInteraction(kind,target){
 const db=window.leogoAuth?.client;
 if(!db||!visitor)return;
 db.rpc('record_customer_site_interaction',{p_visitor_token:visitor,p_event_kind:kind,p_event_target:target}).then(()=>{}).catch(()=>{});
}
const allowedTargets=new Set(['home','marketplace','groceries','food','pharmacy','services','transport','accommodation','property','premium','cyber','advertisement','cart','checkout','product','partner','whatsapp','phone','other']);
function targetFor(element){
 const raw=[element?.id,element?.getAttribute?.('href')?.split(/[?#]/)[0],element?.getAttribute?.('data-customer-view'),element?.getAttribute?.('data-category')].filter(Boolean).join(' ').toLowerCase();
 const names=['checkout','cart','groceries','food','pharmacy','services','transport','accommodation','property','premium','cyber','advertisement','marketplace','product','partner'];
 if(/wa\.me|whatsapp/.test(raw))return 'whatsapp';
 if(/tel:/.test(raw))return 'phone';
 if(/home|^\/$/.test(raw))return 'home';
 return names.find(x=>raw.includes(x))||'other';
}
let lastClickKey='',lastClickAt=0;
document.addEventListener('click',(event)=>{
 const element=event.target.closest?.('a,button,[role="button"]');
 if(!element||element.disabled||element.getAttribute('aria-disabled')==='true')return;
 const raw=(element.id+' '+(element.getAttribute('href')||'')+' '+(element.getAttribute('data-action')||'')).toLowerCase();
 let kind= 'navigation';
 if(/add.to.cart|addtocart/.test(raw))kind='add_to_cart';
 else if(/checkout|makecheckoutorder/.test(raw))kind='checkout';
 else if(/advert/.test(raw))kind='advert_click';
 else if(/product|view.details/.test(raw))kind='product_view';
 else if(/partner/.test(raw))kind='partner_view';
 else if(/category|groceries|pharmacy/.test(raw))kind='category_view';
 else if(/whatsapp|wa\.me|tel:/.test(raw))kind='contact_click';
 // Do not record arbitrary form controls, searches, user input or private actions.
 if(kind==='navigation'&&!element.matches('a[href], [data-customer-view], [data-open-customer-view]'))return;
 const target=targetFor(element);
 if(!allowedTargets.has(target))return;
 const key=kind+':'+target,now=Date.now();
 if(key===lastClickKey&&now-lastClickAt<700)return;
 lastClickKey=key;lastClickAt=now;
 recordInteraction(kind,target);
},{passive:true});
function recordPage(){recordInteraction('page_view',targetFor({id:window.location.hash||'home'}));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recordPage,{once:true});
else recordPage();
window.addEventListener('hashchange',recordPage);

})();
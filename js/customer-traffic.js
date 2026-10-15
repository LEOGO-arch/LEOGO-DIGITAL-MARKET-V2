(()=>{
'use strict';
// Browser-level estimates, not individual identity. Respect Do Not Track.
if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;
const key='leogo-website-traffic-browser-v1';
let visitor;try{visitor=localStorage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(visitor||'')){visitor=crypto.randomUUID();localStorage.setItem(key,visitor);}}catch{visitor=crypto.randomUUID();}
function send(){const db=window.leogoAuth?.client;if(!db){return false;}db.rpc('record_customer_site_visit',{p_visitor_token:visitor}).then(({error})=>{if(error)console.info('LEOGO traffic counter unavailable');}).catch(()=>{});return true;}
if(!send()){let tries=0;const wait=setInterval(()=>{tries++;if(send()||tries>=20)clearInterval(wait);},500);}
})();
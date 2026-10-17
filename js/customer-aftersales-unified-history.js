(() => {
'use strict';
const root=document.getElementById('customerAftersalesCaseList');
if(!root)return;
let cases=[],busy=false,scheduled=false;
const format=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const date=value=>value?new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}):'Not recorded';
function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function render(){
 if(!cases.length||scheduled)return;
 scheduled=true;
 queueMicrotask(()=>{
  scheduled=false;
  for(const record of cases){
   const card=[...root.querySelectorAll('[data-aftersales-case-reference]')].find(el=>el.dataset.aftersalesCaseReference===record.case_reference);
   if(!card)continue;
   const old=card.querySelector('[data-unified-aftersales]');if(old)old.remove();
   const wrapper=make('section','afs-unified-history');wrapper.dataset.unifiedAftersales=record.case_reference;
   wrapper.style.cssText='margin-top:16px;display:grid;gap:12px';
   const timeline=make('details');timeline.open=false;
   const summary=make('summary','', 'Complete Aftersales Activity History ('+(record.events?.length||0)+' updates)');
   summary.style.cssText='font-weight:750;cursor:pointer;padding:13px;border:1px solid #dce4ee;border-radius:12px';
   timeline.append(summary);
   const list=make('ol');list.style.cssText='padding-left:23px;display:grid;gap:12px';
   for(const ev of record.events||[]){
    const entry=make('li');
    const heading=make('strong','',format(ev.event)+' · '+format(ev.category));
    const who=make('div','',format(ev.actor||'LEOGO system')+' · '+date(ev.at));
    who.style.cssText='font-size:12px;color:#64748b';
    entry.append(heading,who);
    if(ev.note)entry.append(make('p','',ev.note));
    list.append(entry);
   }
   if(!list.children.length)list.append(make('li','','No recorded updates yet'));
   timeline.append(list);
   wrapper.append(timeline);
   const panels=[['Aftersales Parcel Return Station',record.return],['Aftersales Replacement Pickup Station / Delivery',record.exchange]];
   for(const [title,parcel] of panels){
    const box=make('section');box.style.cssText='padding:14px;border:1px solid #dce4ee;border-radius:12px;background:#f8fafc;display:grid;gap:5px';
    box.append(make('strong','',title));
    if(parcel){
     box.append(make('div','','Reference: '+(parcel.reference||'Not booked')));
     box.append(make('div','','Status: '+format(parcel.status)));
     if(parcel.station)box.append(make('div','','Pickup Station: '+parcel.station));
     if(parcel.delivery_choice)box.append(make('div','','Delivery method: '+format(parcel.delivery_choice)));
     if(parcel.dispatched_at)box.append(make('div','','Dispatched: '+date(parcel.dispatched_at)));
    }else box.append(make('div','','Not yet arranged for this case'));
    wrapper.append(box);
   }
   card.append(wrapper);
   // Hide only an older, duplicate case-activity disclosure within the same card.
   for(const d of card.querySelectorAll('details')){
    if(d!==timeline&&/aftersales activity history/i.test(d.querySelector('summary')?.textContent||''))d.hidden=true;
   }
  }
 });
}
async function load(){
 if(busy)return;
 const db=window.leogoAuth?.client;
 if(!db||!window.leogoAuth?.isAuthenticated?.()){cases=[];return;}
 busy=true;
 try{
  const {data,error}=await db.rpc('customer_aftersales_unified_history');
  if(error)throw error;
  cases=Array.isArray(data)?data:[];
  render();
 }catch(error){console.warn('Unified Aftersales case history unavailable:',error.message);}
 finally{busy=false;}
}
const observer=new MutationObserver(()=>{if(cases.length&&!scheduled){
 const missing=cases.some(c=>{const e=[...root.querySelectorAll('[data-aftersales-case-reference]')].find(node=>node.dataset.aftersalesCaseReference===c.case_reference);return e&&!e.querySelector('[data-unified-aftersales]');});
 if(missing)render();
}});
observer.observe(root,{childList:true,subtree:false});
document.addEventListener('leogo:customer-aftersales-activity-loaded',load);
document.addEventListener('leogo:authchange',load);
const refresh=document.getElementById('customerAftersalesRefresh');
refresh?.addEventListener('click',load);
load();
})();
// LEOGO Customer Front — optional event actions for the published advertisement.
// Independent of customer checkout, normal orders and advert pop-up rendering.
(() => {
 'use strict';
 const $=s=>document.querySelector(s);
 const buttons=$('#advertEventActionButtons');
 const dialog=$('#advertEventModal');
 const form=$('#advertEventForm');
 if(!buttons||!dialog||!form)return;
 let active=null,chosen=null,requestKey=0;
 const user=()=>window.leogoAuth?.getUser?.();
 const api=()=>window.leogoAuth?.client;
 const fieldsHost=$('#advertEventDynamicFields');
 const status=$('#advertEventFormStatus');
 const payment=$('#advertEventPaymentFields');
 const reference=$('#advertEventPaymentReference');
 function renderConfig(config){
  buttons.replaceChildren();active=config?.advertisement_id?config:null;
  if(!active){buttons.hidden=true;return;}
  const offers=[['ticket','Book & Pay Ticket',active.allow_ticket],
    ['register','Register',active.allow_register],['join','Join',active.allow_join]];
  for(const [key,label,enabled] of offers){
   if(!enabled)continue;
   const b=document.createElement('button');b.type='button';
   b.textContent=label;b.addEventListener('click',()=>openForm(key));
   buttons.append(b);
  }
  buttons.hidden=!buttons.childElementCount;
 }
 function openForm(kind){
  if(!active)return;chosen=kind;
  form.reset();status.textContent='';fieldsHost.replaceChildren();
  $('#advertEventModalTitle').textContent=kind==='ticket'?'Book & Pay Ticket':kind==='register'?'Event Registration':'Join Event';
  const price=Number(active.ticket_price_kes||0);
  $('#advertEventIntro').textContent=kind==='ticket'
   ?'Ticket rate: KSh '+price.toLocaleString('en-KE',{minimumFractionDigits:2})+' — ticket will be confirmed after LEOGO verifies payment.'
   :'Complete the questions set by LEOGO Admin for this event.';
  payment.hidden=kind!=='ticket'||price<=0;
  reference.required=kind==='ticket'&&price>0;
  const person=user();
  if(person?.user_metadata?.full_name)$('#advertEventCustomerName').value=person.user_metadata.full_name;
  if(person?.user_metadata?.phone)$('#advertEventCustomerPhone').value=person.user_metadata.phone;
  if(kind!=='ticket'){
   for(const field of Array.isArray(active.form_fields)?active.form_fields:[]){
    if(!field?.key||!field?.label)continue;
    const label=document.createElement('label');label.textContent=String(field.label);
    let inp;
    if(field.type==='select'){
     inp=document.createElement('select');
     const empty=document.createElement('option');empty.value='';empty.textContent='Choose an option';inp.append(empty);
     for(const option of Array.isArray(field.options)?field.options:[]){
      const o=document.createElement('option');o.value=String(option);o.textContent=String(option);inp.append(o);
     }
    }else{
     inp=document.createElement('input');
     inp.type=['number','date','checkbox'].includes(field.type)?field.type:'text';
     if(inp.type==='text')inp.maxLength=250;
    }
    inp.dataset.eventField=field.key;
    inp.required=!!field.required;
    label.append(inp);fieldsHost.append(label);
   }
  }
  dialog.showModal();
 }
 const close=$('#advertEventClose');close?.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.reportValidity()||!active||!chosen)return;
  const client=api();
  if(!client||!user()){
   status.textContent='Please sign in to LEOGO before booking a ticket or joining an event.';
   return;
  }
  const answers={};
  for(const element of fieldsHost.querySelectorAll('[data-event-field]')){
   answers[element.dataset.eventField]=element.type==='checkbox'?element.checked:
     element.type==='number'&&element.value!==''?Number(element.value):element.value;
  }
  const submit=$('#advertEventSubmit');submit.disabled=true;submit.textContent='Submitting…';
  status.textContent='';
  const {data,error}=await client.rpc('customer_submit_advert_event_entry',{
   p_advertisement_id:active.advertisement_id,
   p_action_kind:chosen,
   p_attendee_name:$('#advertEventCustomerName').value.trim(),
   p_attendee_phone:$('#advertEventCustomerPhone').value.trim(),
   p_form_answers:answers,
   p_payment_reference:chosen==='ticket'?reference.value.trim().toUpperCase():null
  });
  submit.disabled=false;submit.textContent='Submit Request';
  if(error){status.textContent=error.message||'Could not submit. Please retry.';return;}
  form.querySelectorAll('input,select').forEach(el=>el.disabled=true);
  submit.hidden=true;
  status.textContent='Saved! Your tracking number is '+(data?.ticket_code||'unavailable')+'. '+
   (data?.status==='pending_payment'
     ?'Payment verification is pending. This is not an approved admission ticket.'
     :'Your event request was submitted. Keep this tracking number.');
 });
 window.addEventListener('leogo-active-advertisement',async e=>{
  const id=e.detail?.id||null;
  if(!id){renderConfig(null);return;}
  const seq=++requestKey;
  try{
   const client=api();if(!client)return;
   const {data,error}=await client.rpc('public_get_active_advert_event_actions');
   if(error)throw error;
   if(seq===requestKey && data?.advertisement_id===id)renderConfig(data);
   else if(seq===requestKey)renderConfig(null);
  }catch(err){console.warn('Event actions unavailable:',err?.message);if(seq===requestKey)renderConfig(null);}
 });
})();

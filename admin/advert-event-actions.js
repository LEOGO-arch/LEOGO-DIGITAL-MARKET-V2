// LEOGO event actions editor and attendance review; independent of core Admin.
(() => {
 'use strict';
 const db=window.leogoAdminDb;
 const $=s=>document.querySelector(s);
 if(!db||!$('#advertEventFields'))return;
 const state={configs:new Map(),entries:[],fields:[]};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const defaults=()=>({allow_ticket:false,ticket_price_kes:0,ticket_capacity:null,allow_register:false,allow_join:false,registration_capacity:null,form_fields:[]});
 const addField=(initial={})=>{
  if(state.fields.length>=12){window.alert('Maximum 12 registration questions.');return;}
  const key=initial.key||('question_'+(state.fields.length+1));
  state.fields.push({key,label:initial.label||'',type:initial.type||'text',required:!!initial.required,options:initial.options||[]});
  drawFields();
 };
 const drawFields=()=>{
  const host=$('#advertEventFields');host.replaceChildren();
  for(const [i,f] of state.fields.entries()){
   const row=document.createElement('div');row.className='advert-event-field-row';
   row.innerHTML='<label>Question / label<input data-field-label maxlength="100" placeholder="e.g. Organisation" required></label>'+
    '<label>Answer type<select data-field-type><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Select options</option><option value="checkbox">Checkbox / consent</option></select></label>'+
    '<label class="advert-event-field-options">Options separated by commas (for Select)<input data-field-options placeholder="Student, Member, Visitor"></label>'+
    '<label><input type="checkbox" data-field-required> Required answer</label>'+
    '<button type="button" data-field-delete class="secondary-button">Remove question</button>';
   row.querySelector('[data-field-label]').value=f.label;
   row.querySelector('[data-field-type]').value=f.type;
   row.querySelector('[data-field-options]').value=(f.options||[]).join(', ');
   row.querySelector('[data-field-required]').checked=f.required;
   row.querySelector('[data-field-label]').addEventListener('input',e=>{state.fields[i].label=e.target.value;});
   row.querySelector('[data-field-type]').addEventListener('change',e=>{state.fields[i].type=e.target.value;});
   row.querySelector('[data-field-required]').addEventListener('change',e=>{state.fields[i].required=e.target.checked;});
   row.querySelector('[data-field-options]').addEventListener('input',e=>{state.fields[i].options=e.target.value.split(',').map(s=>s.trim()).filter(Boolean);});
   row.querySelector('[data-field-delete]').addEventListener('click',()=>{state.fields.splice(i,1);drawFields();});
   host.append(row);
  }
 };
 function reset(){
  $('#advertEventTickets').checked=false;$('#advertEventRegister').checked=false;$('#advertEventJoin').checked=false;
  $('#advertEventTicketPrice').value='0';$('#advertEventTicketCapacity').value='';
  $('#advertEventRegisterCapacity').value='';state.fields=[];drawFields();
 }
 function edit(advertisementId){
  const c=state.configs.get(advertisementId)||defaults();
  $('#advertEventTickets').checked=!!c.allow_ticket;$('#advertEventRegister').checked=!!c.allow_register;
  $('#advertEventJoin').checked=!!c.allow_join;
  $('#advertEventTicketPrice').value=c.ticket_price_kes??0;
  $('#advertEventTicketCapacity').value=c.ticket_capacity??'';
  $('#advertEventRegisterCapacity').value=c.registration_capacity??'';
  state.fields=Array.isArray(c.form_fields)?c.form_fields.map((x,i)=>({
    key:String(x.key||'question_'+i),label:String(x.label||''),type:String(x.type||'text'),
    required:!!x.required,options:Array.isArray(x.options)?x.options:[]
  })):[];
  drawFields();
 }
 const getConfig=()=>{
  const fields=state.fields.map((f,i)=>({
   key:'question_'+(i+1),label:String(f.label||'').trim(),
   type:f.type,required:!!f.required,
   options:f.type==='select'?(f.options||[]).map(s=>s.trim()).filter(Boolean).slice(0,20):[]
  }));
  if(fields.some(f=>f.label.length<2||f.label.length>100))throw Error('Each registration question requires a label of 2–100 characters.');
  if(fields.some(f=>f.type==='select'&&!f.options.length))throw Error('Choose at least one option for every Select question.');
  return {
    allow_ticket:$('#advertEventTickets').checked,
    ticket_price_kes:Number($('#advertEventTicketPrice').value||0),
    ticket_capacity:$('#advertEventTicketCapacity').value||null,
    allow_register:$('#advertEventRegister').checked,
    allow_join:$('#advertEventJoin').checked,
    registration_capacity:$('#advertEventRegisterCapacity').value||null,
    form_fields:fields
  };
 };
 async function loadConfigs(){
  const {data,error}=await db.rpc('admin_list_advert_event_actions');
  if(error){console.warn('Event settings unavailable:',error.message);return;}
  state.configs=new Map((Array.isArray(data)?data:[]).map(x=>[x.advertisement_id,x]));
 }
 async function refreshEntries(){
  const host=$('#advertEventEntriesList');if(!host)return;
  host.textContent='Loading entries…';
  const {data,error}=await db.rpc('admin_list_advert_event_entries');
  if(error){host.textContent='Unable to load ticket and registration entries: '+error.message;return;}
  state.entries=Array.isArray(data)?data:[];
  if(!state.entries.length){host.textContent='No event ticket or registration submissions yet.';return;}
  host.replaceChildren();
  for(const item of state.entries.slice(0,250)){
   const card=document.createElement('article');card.className='advert-event-entry';
   const heading=document.createElement('strong');heading.textContent=(item.advert_title||'Event')+' · '+String(item.action_kind||'').toUpperCase();
   const p=document.createElement('p');p.textContent='Tracking: '+item.ticket_code+' | '+item.attendee_name+' | '+item.attendee_phone;
   const summary=document.createElement('p');summary.textContent='Amount: KSh '+Number(item.amount_due_kes||0).toLocaleString('en-KE')+' · Payment ref: '+(item.payment_reference||'Not supplied')+' · Status: '+item.status;
   const answers=document.createElement('details'),title=document.createElement('summary');title.textContent='Registration answers';
   const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(item.form_answers||{},null,2);
   answers.append(title,pre);card.append(heading,p,summary,answers);
   if(['pending_payment','submitted'].includes(item.status)){
    const buttons=document.createElement('div');buttons.className='advert-event-entry-actions';
    for(const [label,approve] of [['Confirm',true],['Reject',false]]){
     const b=document.createElement('button');b.type='button';b.textContent=label;b.className=approve?'primary-button':'secondary-button';
     b.addEventListener('click',async()=>{
      if(approve&&item.action_kind==='ticket'&&Number(item.amount_due_kes)>0 &&
        !window.confirm('Have you independently verified the payment code and exact credited amount on LEOGO official M-PESA device/statement?'))return;
      let officialCode=null;
      if(approve&&item.action_kind==='ticket'&&Number(item.amount_due_kes)>0){
       officialCode=window.prompt('Enter the transaction code exactly as received on LEOGO official M-PESA payment device or statement:','');
       if(officialCode===null)return;
       officialCode=officialCode.trim().toUpperCase();
       if(!/^[A-Z0-9]{10}$/.test(officialCode)||officialCode!==String(item.payment_reference||'').toUpperCase()){
        window.alert('The official payment code must be 10 characters and match the customer-submitted reference.');return;
       }
      }
      const notes=window.prompt(approve?'Review note (optional)':'Reason for rejection','');
      if(notes===null)return;
      b.disabled=true;
      const {error:e}=await db.rpc('admin_review_advert_event_entry',{
        p_entry_id:item.id,p_approve:approve,p_notes:notes,p_official_reference:officialCode
      });
      b.disabled=false;
      if(e){window.alert(e.message);return;}
      await refreshEntries();
     });
     buttons.append(b);
    }
    card.append(buttons);
   }
   host.append(card);
  }
 }
 $('#advertEventAddField')?.addEventListener('click',()=>addField());
 $('#advertEventRefreshEntries')?.addEventListener('click',refreshEntries);
 window.leogoAdvertEventEditor={reset,edit,getConfig,loadConfigs,refreshEntries};
 document.addEventListener('DOMContentLoaded',async()=>{await loadConfigs();refreshEntries();});
})();

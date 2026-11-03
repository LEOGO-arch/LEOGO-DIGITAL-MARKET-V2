/* Item editors: local, account-scoped recovery for browser reloads and dropped tabs.
   Never stores passwords, payment references, identity information or uploaded files. */
(() => {
 'use strict';
 const client=window.leogoPartnerClient;
 if(!client)return;
 const formIds=[
  'sellerProductForm','providerServiceForm','transportVehicleForm',
  'accommodationPropertyForm','accommodationUnitForm',
  'cyberProductForm','cyberServiceForm',
  'healthMedicineProductForm','healthSpecialistServiceForm'
 ];
 let userId='',restoring=false;
 const pending=new Map();
 const formFor=id=>document.getElementById(id);
 const key=id=>`leogo:partner-item-draft:v1:${userId}:${id}`;
 const safeGet=id=>{try{return JSON.parse(localStorage.getItem(key(id))||'null');}catch(_){return null;}};
 const fields=form=>Array.from(form.querySelectorAll('input,select,textarea'))
  .filter(el=>el.type!=='file'&&el.type!=='password'&&el.type!=='hidden'&&el.type!=='submit'&&el.type!=='button'
   &&!el.disabled&&!el.readOnly&&!/(password|identity|national.?id|passport|payment.?ref|account.?number|secret|token|phone|email)/i.test(`${el.id} ${el.name}`)
   &&!el.matches('[data-variant-name],[data-variant-price],[data-variant-qty]'));
 const formSnapshot=form=>({
  version:1,at:Date.now(),editProductId:form.id==='sellerProductForm'?document.getElementById('sellerProductId')?.value||'':'',
  controls:fields(form).map((el,i)=>({key:el.id||`${el.name||'control'}@${i}`,value:el.value,checked:el.type==='checkbox'||el.type==='radio'?el.checked:null})),
  variants:form.id==='sellerProductForm'?Array.from(form.querySelectorAll('#variantRows .variant-row')).map(row=>({
   name:row.querySelector('[data-variant-name]')?.value||'',price:row.querySelector('[data-variant-price]')?.value||'',
   qty:row.querySelector('[data-variant-qty]')?.value||''
  })):[]
 });
 const info=form=>form.querySelector('[data-draft-info]');
 const show=(form,message)=>{const el=info(form);if(el)el.textContent=message;};
 const update=form=>{
  const restore=form.querySelector('[data-draft-restore]');
  const discard=form.querySelector('[data-draft-discard]');
  const exists=Boolean(userId&&safeGet(form.id));
  if(restore)restore.disabled=!exists;
  if(discard)discard.disabled=!exists;
  if(exists)show(form,'Saved on this device. Restore when needed; reselect image/document files after recovery.');
 };
 const save=form=>{
  if(!userId||restoring)return;
  try{
   localStorage.setItem(key(form.id),JSON.stringify(formSnapshot(form)));
   update(form);
  }catch(_){show(form,'Local draft could not be saved (browser storage is unavailable or full).');}
 };
 const clear=form=>{
  if(!userId)return;
  try{localStorage.removeItem(key(form.id));}catch(_){}
  update(form);show(form,'Local draft discarded.');
 };
 const restore=form=>{
  const draft=safeGet(form.id);if(!draft||draft.version!==1)return;
  if(form.id==='sellerProductForm'&&draft.editProductId&&draft.editProductId!==document.getElementById('sellerProductId')?.value){
   show(form,'This draft edits an existing product. Open that product with Edit first, then tap Restore Draft.');return;
  }
  restoring=true;
  try{
   if(form.hidden)form.hidden=false;
   const controls=fields(form);
   const byKey=new Map(controls.map((el,i)=>[el.id||`${el.name||'control'}@${i}`,el]));
   // Restore dependent selects in order: category controls may rebuild subcategories.
   for(const field of draft.controls||[]){
    const el=byKey.get(field.key);if(!el)continue;
    if(field.checked!==null)el.checked=Boolean(field.checked);else el.value=field.value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
   }
   if(form.id==='sellerProductForm'){
    const rows=document.getElementById('variantRows');if(rows)rows.replaceChildren();
    for(const v of draft.variants||[]){
     document.getElementById('addVariantRow')?.click();
     const row=rows?.lastElementChild;if(!row)continue;
     row.querySelector('[data-variant-name]').value=v.name;
     row.querySelector('[data-variant-price]').value=v.price;
     row.querySelector('[data-variant-qty]').value=v.qty;
    }
   }
   show(form,'Draft restored. Check values and reselect images before submitting.');
  }finally{restoring=false;}
 };
 const init=()=>{
  for(const id of formIds){
   const form=formFor(id);if(!form||form.dataset.draftRecoveryInstalled)return;
   form.dataset.draftRecoveryInstalled='true';
   const actions=document.createElement('div');actions.className='partner-draft-actions';
   actions.innerHTML='<button type="button" class="secondary" data-draft-save>Save Draft</button><button type="button" class="secondary" data-draft-restore>Restore Draft</button><button type="button" class="secondary" data-draft-discard>Discard Draft</button><small data-draft-info role="status" aria-live="polite">Drafts are stored on this device, not submitted to LEOGO. Uploaded files cannot be saved.</small>';
   form.append(actions);
   form.addEventListener('input',event=>{
    if(event.target?.type==='file'||restoring)return;
    clearTimeout(pending.get(id));pending.set(id,setTimeout(()=>save(form),500));
   });
   form.addEventListener('change',event=>{if(event.target?.type!=='file'&&!restoring)save(form);});
   actions.querySelector('[data-draft-save]').addEventListener('click',()=>save(form));
   actions.querySelector('[data-draft-restore]').addEventListener('click',()=>restore(form));
   actions.querySelector('[data-draft-discard]').addEventListener('click',()=>clear(form));
   update(form);
  }
 };
 window.addEventListener('pagehide',()=>{for(const id of formIds){const form=formFor(id);if(form&&pending.has(id))save(form);}});
 document.addEventListener('leogo:seller-product-saved',()=>{const form=formFor('sellerProductForm');if(form)clear(form);});
 client.auth.onAuthStateChange((event,session)=>{
  if(['SIGNED_OUT','SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
   const next=session?.user?.id||'';
   if(next!==userId){userId=next;for(const id of formIds){const form=formFor(id);if(form)update(form);}}
  }
 });
 init();
 client.auth.getSession().then(({data})=>{
  userId=data?.session?.user?.id||'';
  for(const id of formIds){const form=formFor(id);if(form)update(form);}
 }).catch(()=>{});
})();

// Customer-controlled optional promotional contact preferences.
(() => {
  'use strict';
  const form=document.getElementById('customerMessagePreferencesForm');
  if(!form)return;
  const panel=document.getElementById('customerMessagePreferences');
  const status=document.getElementById('customerMessagePreferencesStatus');
  let loadedFor='';
  const auth=()=>window.leogoAuth;
  const message=(value)=>{if(status)status.textContent=value;};
  const load=async()=>{
    const user=auth()?.getUser?.();
    if(!user || !auth()?.client){panel.hidden=true;loadedFor='';return;}
    panel.hidden=false;
    if(loadedFor===user.id)return;
    const {data,error}=await auth().client.rpc('customer_get_message_preferences');
    if(error){message('Preferences will be available after this feature is activated.');return;}
    form.elements.promotion_sms_opt_in.checked=Boolean(data?.promotion_sms_opt_in);
    form.elements.promotion_email_opt_in.checked=Boolean(data?.promotion_email_opt_in);
    loadedFor=user.id;message('Changes to your preferences take effect when saved.');
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!auth()?.isAuthenticated?.()){message('Sign in to save messaging preferences.');return;}
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true;message('Saving preferences…');
    try{
      const {error}=await auth().client.rpc('customer_save_message_preferences',{
        p_sms:form.elements.promotion_sms_opt_in.checked,
        p_email:form.elements.promotion_email_opt_in.checked
      });
      if(error)throw error;
      message('Preferences saved. You can change them here at any time.');
    }catch(error){message(error?.message||'Preferences could not be saved.');}
    finally{button.disabled=false;}
  });
  document.addEventListener('leogo:authchange',()=>{loadedFor='';load().catch(()=>{});});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-customer-view="account"],[data-open-customer-view="account"]'))
      setTimeout(()=>load().catch(()=>{}),70);
  });
  document.addEventListener('DOMContentLoaded',()=>{load().catch(()=>{});});
})();


/* Customer category card pictures, loaded by the existing customer script. */
(() => {
'use strict';
const grid=document.getElementById('exploreCategoryGrid');if(!grid||!window.supabase?.createClient)return;
const db=window.supabase.createClient('https://dzdciuqkqixwutvtfotj.supabase.co','sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const media=db.storage.from('category-public-media');
async function display(){
 const {data,error}=await db.rpc('customer_category_images');if(error||!Array.isArray(data))return;
 for(const record of data){const card=[...grid.querySelectorAll('[data-product-category-code]')].find(node=>node.dataset.productCategoryCode===record.code);if(!card||!record.image_path)continue;
 const url=media.getPublicUrl(record.image_path).data.publicUrl;if(!url)continue;
 let img=card.querySelector('.leogo-category-profile-picture');
 if(!img){img=document.createElement('img');img.className='leogo-category-profile-picture';img.alt='';img.loading='lazy';img.style.cssText='display:block;width:64px;height:64px;max-width:100%;object-fit:contain;border-radius:10px;margin-inline:auto';card.prepend(img);}
 img.src=url;const symbol=[...card.children].find(c=>c.tagName==='SPAN');if(symbol)symbol.style.display='none';
 }
}
const observer=new MutationObserver(()=>{clearTimeout(window.__leogoCategoryPictureDebounce);window.__leogoCategoryPictureDebounce=setTimeout(display,300);});
observer.observe(grid,{childList:true});display();
})();
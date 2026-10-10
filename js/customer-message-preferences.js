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

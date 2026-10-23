// Use only the public WhatsApp contact; never expose the full business settings row.
(() => {
  'use strict';
  const normalize = value => {
    const raw=String(value??'').trim();
    if(!raw||!/^[+\d\s().-]+$/.test(raw))return '';
    let digits=raw.replace(/\D/g,'');
    if(digits.startsWith('00'))digits=digits.slice(2);
    if(/^0[17]\d{8}$/.test(digits))digits='254'+digits.slice(1);
    return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
  };
  const read = async () => {
    const client=window.leogoAuth?.client;
    if(!client)throw new Error('Contact settings are still loading. Please try again.');
    let result;
    try{result=await client.rpc('get_public_whatsapp_contact');}
    catch(_error){throw new Error('Could not load the current WhatsApp number. Please try again.');}
    const {data,error}=result;
    if(error)throw new Error('Could not load the current WhatsApp number. Please try again.');
    const number=normalize(data?.whatsapp_number);
    if(!number)throw new Error('WhatsApp ordering is unavailable. Please contact LEOGO Customer Care.');
    return number;
  };
  const url = (number,message) => 'https://wa.me/'+number+(message?'?text='+encodeURIComponent(message):'');
  const open = async message => {
    // Open during the click gesture so mobile browsers do not block the later async navigation.
    const popup=window.open('about:blank','_blank');
    if(!popup){window.alert('Please allow the WhatsApp window and try again.');return;}
    popup.opener=null;
    try{const number=await read();popup.location.replace(url(number,message));}
    catch(error){popup.close();window.alert(error.message||'WhatsApp could not open. Please try again.');}
  };
  window.leogoWhatsApp=Object.freeze({open});
  const support=document.querySelector('[data-support-field="whatsapp_phone"]');
  const link=support?.closest('a');
  const refresh=async()=>{
    if(!link)return;
    link.removeAttribute('href');link.setAttribute('aria-disabled','true');
    try{
      const number=await read();support.textContent='+'+number;link.href=url(number);link.removeAttribute('aria-disabled');
    }catch(_error){support.textContent='Contact temporarily unavailable';}
  };
  link?.addEventListener('click',event=>{event.preventDefault();open();});
  refresh();
  window.addEventListener('pageshow',refresh);
})();

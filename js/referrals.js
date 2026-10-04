// LEOGO Share & Earn referral rewards V1
(() => {
  'use strict';

  const auth=window.leogoAuth;
  const db=auth?.client;
  if(!db)return;

  const $=(id)=>document.getElementById(id);
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const normalizeCode=(value)=>String(value||'').trim().toUpperCase();
  const validCode=(value)=>/^LEO-[A-Z0-9]{8}$/.test(normalizeCode(value));
  const PRODUCTION_URL='https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/';
  const REGISTRATION_KEY='leogoReferralRegistrationCode';
  const LANDING_KEY='leogoReferralLandingCode';

  const elements={
    card:$('referralShareEarnCard'),
    programStatus:$('referralProgramStatus'),
    rewardAmount:$('referralRewardAmount'),
    welcomeAmount:$('referralWelcomeAmount'),
    minimumOrder:$('referralMinimumOrder'),
    code:$('referralCodeDisplay'),
    codeHelp:$('referralCodeHelp'),
    copy:$('copyReferralCode'),
    share:$('shareReferralCode'),
    whatsapp:$('shareReferralWhatsApp'),
    pending:$('referralPendingCount'),
    rewarded:$('referralRewardedCount'),
    earned:$('referralRewardsEarned'),
    claimForm:$('referralClaimForm'),
    claimCode:$('referralClaimCode'),
    claimed:$('referralClaimedStatus'),
    status:$('referralShareStatus'),
    registerCode:$('registerReferralCode')
  };

  let currentUser=null;
  let currentData=null;
  let loadVersion=0;

  const setStatus=(message='',type='')=>{
    if(!elements.status)return;
    elements.status.textContent=message;
    elements.status.className='payment-step-status'+(type?' '+type:'');
  };

  const referralMessage=(data=currentData)=>{
    const code=data?.referral_code||'';
    const settings=data?.settings||{};
    const parts=[
      'Join LEOGO DIGITAL MARKET with my referral code '+code+'.',
      'Use it before your first qualifying order of '+money(settings.minimum_qualifying_order_kes)+' or more.'
    ];
    if(Number(settings.referred_welcome_reward_kes||0)>0){
      parts.push('You can earn a '+money(settings.referred_welcome_reward_kes)+' welcome Shopping Voucher after the qualifying order is paid and delivered.');
    }
    parts.push('Referral rewards are LEOGO Points for shopping.');
    return parts.join(' ');
  };

  const referralUrl=(code)=>PRODUCTION_URL+'?ref='+encodeURIComponent(code||'');

  const renderSignedOut=()=>{
    currentData=null;
    if(elements.programStatus)elements.programStatus.textContent='SIGN IN REQUIRED';
    if(elements.rewardAmount)elements.rewardAmount.textContent='KSh 0';
    if(elements.welcomeAmount)elements.welcomeAmount.textContent='KSh 0';
    if(elements.minimumOrder)elements.minimumOrder.textContent='KSh 0+';
    if(elements.code)elements.code.textContent='Sign in to generate';
    if(elements.codeHelp)elements.codeHelp.textContent='Your permanent code is created automatically after you sign in.';
    [elements.copy,elements.share,elements.whatsapp].forEach((button)=>{if(button)button.disabled=true;});
    if(elements.pending)elements.pending.textContent='0';
    if(elements.rewarded)elements.rewarded.textContent='0';
    if(elements.earned)elements.earned.textContent='KSh 0';
    if(elements.claimForm)elements.claimForm.hidden=true;
    if(elements.claimed)elements.claimed.hidden=true;
    setStatus('');
  };

  const render=(data)=>{
    currentData=data;
    const settings=data?.settings||{};
    const summary=data?.summary||{};
    const enabled=Boolean(settings.is_enabled);
    const code=data?.referral_code||'';

    if(elements.programStatus)elements.programStatus.textContent=enabled?'ACTIVE':'PAUSED BY ADMIN';
    if(elements.rewardAmount)elements.rewardAmount.textContent=money(settings.referrer_reward_kes);
    if(elements.welcomeAmount)elements.welcomeAmount.textContent=Number(settings.referred_welcome_reward_kes||0)>0?money(settings.referred_welcome_reward_kes):'Not active';
    if(elements.minimumOrder)elements.minimumOrder.textContent=money(settings.minimum_qualifying_order_kes)+'+';
    if(elements.code)elements.code.textContent=code||'Unavailable';
    if(elements.codeHelp)elements.codeHelp.textContent=enabled
      ?'Share this permanent code or referral link. Rewards are issued only after a qualifying paid and delivered order.'
      :'Your code stays reserved, but new referral rewards are paused until Admin enables the program.';
    [elements.copy,elements.share,elements.whatsapp].forEach((button)=>{if(button)button.disabled=!code;});
    if(elements.pending)elements.pending.textContent=Number(summary.pending_referrals||0).toLocaleString('en-KE');
    if(elements.rewarded)elements.rewarded.textContent=Number(summary.rewarded_referrals||0).toLocaleString('en-KE');
    if(elements.earned)elements.earned.textContent=money(summary.referral_rewards_earned_kes);

    const mine=data?.my_referral;
    if(elements.claimed){
      if(mine){
        const status=String(mine.status||'pending').replaceAll('_',' ');
        elements.claimed.textContent='Referral code '+mine.referral_code+' applied · '+status+
          (Number(mine.welcome_reward_kes||0)>0?' · Welcome Voucher '+money(mine.welcome_reward_kes):'');
        elements.claimed.hidden=false;
      }else{
        elements.claimed.hidden=true;
      }
    }

    if(elements.claimForm){
      elements.claimForm.hidden=Boolean(mine)||!data?.can_claim_referral||!enabled;
    }

    const landing=normalizeCode(localStorage.getItem(LANDING_KEY)||'');
    if(elements.claimCode&&!elements.claimCode.value&&validCode(landing))elements.claimCode.value=landing;
  };

  const claimCode=async(code,{silent=false}={})=>{
    const normalized=normalizeCode(code);
    if(!validCode(normalized)){
      if(!silent)setStatus('Enter a valid LEOGO referral code in the format LEO-XXXXXXXX.','error');
      return false;
    }
    if(!silent)setStatus('Applying referral code…');
    const {data,error}=await db.rpc('customer_claim_referral_code',{p_referral_code:normalized});
    if(error){
      if(!silent)setStatus(error.message||'Referral code could not be applied.','error');
      return false;
    }
    if(!data?.success){
      const messages={
        referral_program_disabled:'Share & Earn is currently paused by Admin.',
        invalid_referral_code:'Enter a valid LEOGO referral code.',
        referral_already_claimed:'A referral code is already linked to this account.',
        first_order_already_completed:'A referral code must be applied before your first qualifying completed order.',
        self_referral_not_allowed:'You cannot use your own referral code.',
        referral_code_not_found:'That LEOGO referral code was not found.'
      };
      if(!silent)setStatus(messages[data?.code]||'Referral code could not be applied.','error');
      return false;
    }
    localStorage.removeItem(REGISTRATION_KEY);
    localStorage.removeItem(LANDING_KEY);
    if(!silent)setStatus('Referral code applied. Rewards will be issued after your first qualifying paid and delivered order.','success');
    await load();
    return true;
  };

  const applyRegistrationReferral=async()=>{
    const pending=normalizeCode(localStorage.getItem(REGISTRATION_KEY)||'');
    if(!currentUser||!validCode(pending)||currentData?.my_referral||!currentData?.can_claim_referral)return;
    const applied=await claimCode(pending,{silent:true});
    if(applied)setStatus('Your registration referral code is linked. Complete a qualifying order to unlock the Shopping Voucher.','success');
  };

  const load=async()=>{
    const user=auth.getUser?.();
    currentUser=user||null;
    const version=++loadVersion;
    if(!currentUser){
      renderSignedOut();
      return;
    }
    setStatus('Loading Share & Earn rewards…');
    const {data,error}=await db.rpc('customer_get_referral_program');
    if(version!==loadVersion||!currentUser)return;
    if(error||!data?.success){
      setStatus(error?.message||'Share & Earn could not be loaded.','error');
      return;
    }
    render(data);
    setStatus('');
    await applyRegistrationReferral();
  };

  const markShared=async()=>{
    if(!currentUser)return;
    await db.rpc('customer_mark_referral_shared');
  };

  elements.copy?.addEventListener('click',async()=>{
    const code=currentData?.referral_code;
    if(!code)return;
    try{
      await navigator.clipboard.writeText(code);
      setStatus('Referral code copied.','success');
    }catch{
      setStatus('Copy was not available. Press and hold the code to copy it.','error');
    }
  });

  elements.share?.addEventListener('click',async()=>{
    const code=currentData?.referral_code;
    if(!code)return;
    const text=referralMessage();
    const url=referralUrl(code);
    try{
      if(navigator.share){
        await navigator.share({title:'LEOGO Share & Earn',text,url});
        await markShared();
        setStatus('Referral invitation shared.','success');
      }else{
        await navigator.clipboard.writeText(text+' '+url);
        await markShared();
        setStatus('Referral invitation copied. Share it with your friend.','success');
      }
    }catch(error){
      if(error?.name!=='AbortError')setStatus('Sharing could not be opened. Try WhatsApp or Copy Code.','error');
    }
  });

  elements.whatsapp?.addEventListener('click',()=>{
    const code=currentData?.referral_code;
    if(!code)return;
    const text=referralMessage()+' '+referralUrl(code);
    window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');
    markShared();
    setStatus('WhatsApp sharing opened.','success');
  });

  elements.claimForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!currentUser){
      auth.requireLogin?.('Sign in before applying a referral code.');
      return;
    }
    await claimCode(elements.claimCode?.value);
  });

  document.getElementById('customerRegisterForm')?.addEventListener('submit',()=>{
    const code=normalizeCode(elements.registerCode?.value);
    if(validCode(code))localStorage.setItem(REGISTRATION_KEY,code);
  });

  document.addEventListener('click',(event)=>{
    const trigger=event.target.closest?.('[data-open-referral-rewards]');
    if(!trigger)return;
    event.preventDefault();
    if(!auth.isAuthenticated?.()){
      auth.requireLogin?.('Sign in or create your LEOGO account to get your referral code.');
      return;
    }
    window.leogoOpenCustomerView?.('wallet');
    window.setTimeout(()=>{
      document.querySelector('[data-wallet-tab="rewards"]')?.click();
      elements.card?.scrollIntoView({behavior:'smooth',block:'start'});
      load();
    },120);
  });

  const captureLandingCode=()=>{
    const params=new URLSearchParams(window.location.search);
    const ref=normalizeCode(params.get('ref'));
    if(validCode(ref)){
      localStorage.setItem(LANDING_KEY,ref);
      if(elements.registerCode&&!elements.registerCode.value)elements.registerCode.value=ref;
      if(elements.claimCode&&!elements.claimCode.value)elements.claimCode.value=ref;
    }else{
      const stored=normalizeCode(localStorage.getItem(LANDING_KEY)||'');
      if(validCode(stored)&&elements.registerCode&&!elements.registerCode.value)elements.registerCode.value=stored;
    }
  };

  captureLandingCode();
  document.querySelector('[data-wallet-tab="rewards"]')?.addEventListener('click',()=>window.setTimeout(load,30));
  document.addEventListener('leogo:authchange',()=>window.setTimeout(load,60));
  document.addEventListener('leogo:walletrefresh',()=>window.setTimeout(load,60));

  window.leogoReferrals={load};

  if(auth.isReady?.())load();
  else window.setTimeout(load,180);
})();

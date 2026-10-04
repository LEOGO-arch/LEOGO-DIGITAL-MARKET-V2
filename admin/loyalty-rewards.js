// LEOGO Admin Loyalty & Rewards + Share & Earn V3
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  if(!db)return;

  const $=(s,r=document)=>r.querySelector(s);
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const date=v=>{
    if(!v)return '—';
    const d=new Date(v);
    if(Number.isNaN(d.getTime()))return '—';
    return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(d);
  };

  const status=$('#loyaltyRewardsStatus');
  const referralStatus=$('#referralRewardsSettingsStatus');
  const referralForm=$('#referralRewardsSettingsForm');
  let loading=false;

  const setStatus=(message='',type='')=>{
    if(!status)return;
    status.textContent=message;
    status.className='form-status'+(type?' '+type:'');
  };
  const setReferralStatus=(message='',type='')=>{
    if(!referralStatus)return;
    referralStatus.textContent=message;
    referralStatus.className='form-status'+(type?' '+type:'');
  };

  const rewardSourceLabel=(source)=>{
    if(source==='automatic_delivery')return 'AUTOMATIC SHOPPING';
    if(source==='referral_referrer')return 'REFERRAL VOUCHER';
    if(source==='referral_welcome')return 'WELCOME VOUCHER';
    return 'ADMIN CREDIT';
  };

  const renderLoyalty=(data={})=>{
    const settings=data.settings||{};
    const summary=data.summary||{};
    const rewards=Array.isArray(data.recent_rewards)?data.recent_rewards:[];
    const redemptions=Array.isArray(data.recent_redemptions)?data.recent_redemptions:[];

    const set=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value;};
    set('loyaltyRuleRate',Number(settings.reward_percent||0).toLocaleString('en-KE',{maximumFractionDigits:4})+'%');
    set('loyaltyRuleMinimum','From '+money(settings.reward_minimum_spend_kes)+' eligible product spend');
    set('loyaltyRewardsIssued',money(summary.total_rewards_issued_kes));
    set('loyaltyRewardCount',Number(summary.reward_credit_count||0).toLocaleString('en-KE')+' credit'+(Number(summary.reward_credit_count||0)===1?'':'s'));
    set('loyaltyCustomersRewarded',Number(summary.rewarded_customers||0).toLocaleString('en-KE'));
    set('loyaltyPointsAvailable',money(summary.active_points_value_kes));
    set('loyaltyPointsUsed',money(summary.points_used_historical_kes));

    const rewardHost=$('#loyaltyRecentRewards');
    if(rewardHost){
      rewardHost.innerHTML=rewards.length?rewards.map(row=>
        '<article class="loyalty-activity-row">'+
          '<div><span>'+esc(rewardSourceLabel(row.credit_source))+'</span><strong>'+esc(row.customer_name||'LEOGO Customer')+'</strong><small>'+esc(row.order_reference||'')+' · '+esc(date(row.credited_at))+'</small></div>'+
          '<div><small>'+(String(row.credit_source||'').startsWith('referral_')?'Shopping Voucher / LEOGO Points':'Eligible spend '+money(row.eligible_subtotal_kes)+' · '+Number(row.reward_rate||0)*100+'%')+'</small><strong>+'+money(row.reward_amount_kes)+'</strong></div>'+
        '</article>'
      ).join(''):'<div class="loading-card">No reward credits yet.</div>';
    }

    const redemptionHost=$('#loyaltyRecentRedemptions');
    if(redemptionHost){
      redemptionHost.innerHTML=redemptions.length?redemptions.map(row=>
        '<article class="loyalty-activity-row">'+
          '<div><span>POINTS USED</span><strong>'+esc(row.customer_name||'LEOGO Customer')+'</strong><small>'+esc(row.order_reference||'')+' · '+esc(date(row.applied_at))+'</small></div>'+
          '<div><small>'+esc(String(row.status||'applied').replaceAll('_',' '))+(row.restored_at?' · restored '+esc(date(row.restored_at)):'')+'</small><strong>-'+money(row.redeemed_amount_kes)+'</strong></div>'+
        '</article>'
      ).join(''):'<div class="loading-card">No point redemptions yet.</div>';
    }
  };

  const renderReferrals=(data={})=>{
    const settings=data.settings||{};
    const summary=data.summary||{};
    const referrals=Array.isArray(data.recent_referrals)?data.recent_referrals:[];
    const set=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value;};

    const enabled=$('#referralProgramEnabled');
    if(enabled)enabled.checked=Boolean(settings.is_enabled);
    const values={
      referralReferrerReward:settings.referrer_reward_kes,
      referralWelcomeReward:settings.referred_welcome_reward_kes,
      referralMinimumQualifyingOrder:settings.minimum_qualifying_order_kes,
      referralMaxRewarded:settings.max_rewarded_referrals_per_customer
    };
    Object.entries(values).forEach(([id,value])=>{const el=$('#'+id);if(el)el.value=Number(value||0);});

    set('referralCodesIssued',Number(summary.codes_issued||0).toLocaleString('en-KE'));
    set('referralShareActions',Number(summary.share_actions||0).toLocaleString('en-KE'));
    set('referralPendingAdmin',Number(summary.pending_referrals||0).toLocaleString('en-KE'));
    set('referralSuccessfulAdmin',Number(summary.successful_referrals||0).toLocaleString('en-KE'));
    set('referralVoucherIssuedAdmin',money(Number(summary.referrer_rewards_issued_kes||0)+Number(summary.welcome_rewards_issued_kes||0)));

    const host=$('#loyaltyRecentReferrals');
    if(host){
      host.innerHTML=referrals.length?referrals.map(row=>
        '<article class="loyalty-activity-row referral-admin-row">'+
          '<div><span>'+esc(String(row.status||'pending').replaceAll('_',' ').toUpperCase())+'</span><strong>'+esc(row.referrer_name||'LEOGO Customer')+' → '+esc(row.referred_name||'LEOGO Customer')+'</strong><small>'+esc(row.referral_code||'')+' · Claimed '+esc(date(row.claimed_at))+(row.qualifying_order_reference?' · '+esc(row.qualifying_order_reference):'')+'</small></div>'+
          '<div><small>'+(row.qualified_at?'Qualified '+esc(date(row.qualified_at)):'Waiting for first qualifying order')+'</small><strong>'+money(Number(row.referrer_reward_kes||0)+Number(row.referred_welcome_reward_kes||0))+'</strong></div>'+
        '</article>'
      ).join(''):'<div class="loading-card">No referral activity yet.</div>';
    }
  };

  const load=async()=>{
    if(loading)return;
    loading=true;
    setStatus('Loading live Loyalty & Rewards data…');
    try{
      const [loyaltyResult,referralResult]=await Promise.all([
        db.rpc('admin_get_loyalty_rewards_dashboard'),
        db.rpc('admin_get_referral_rewards_dashboard')
      ]);
      if(loyaltyResult.error)throw loyaltyResult.error;
      if(referralResult.error)throw referralResult.error;
      renderLoyalty(loyaltyResult.data||{});
      renderReferrals(referralResult.data||{});
      setStatus('Live Loyalty, Points and Share & Earn data is up to date.','success');
    }catch(error){
      setStatus(error?.message||'Loyalty & Rewards data could not be loaded.','error');
    }finally{
      loading=false;
    }
  };

  referralForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!referralForm.reportValidity())return;
    const button=referralForm.querySelector('button[type="submit"]');
    if(button)button.disabled=true;
    setReferralStatus('Saving Share & Earn rules…');
    try{
      const payload={
        p_is_enabled:Boolean($('#referralProgramEnabled')?.checked),
        p_referrer_reward_kes:Number($('#referralReferrerReward')?.value||0),
        p_referred_welcome_reward_kes:Number($('#referralWelcomeReward')?.value||0),
        p_minimum_qualifying_order_kes:Number($('#referralMinimumQualifyingOrder')?.value||0),
        p_max_rewarded_referrals_per_customer:Number($('#referralMaxRewarded')?.value||0)
      };
      const {data,error}=await db.rpc('admin_update_referral_reward_settings',payload);
      if(error)throw error;
      if(!data?.success)throw new Error('Share & Earn rules were not saved.');
      setReferralStatus('Share & Earn reward rules saved successfully.','success');
      await load();
    }catch(error){
      setReferralStatus(error?.message||'Share & Earn rules could not be saved.','error');
    }finally{
      if(button)button.disabled=false;
    }
  });

  $('#refreshLoyaltyRewards')?.addEventListener('click',load);
  document.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-admin-view="loyalty"]')){
      window.setTimeout(()=>load(),60);
    }
  });
  db.auth.onAuthStateChange((_event,session)=>{
    if(session?.user)window.setTimeout(load,100);
  });
})();

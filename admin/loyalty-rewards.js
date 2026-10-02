// LEOGO Admin Loyalty & Rewards V2
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
  let loading=false;

  const setStatus=(message='',type='')=>{
    if(!status)return;
    status.textContent=message;
    status.className='form-status'+(type?' '+type:'');
  };

  const render=(data={})=>{
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
          '<div><span>'+esc(row.credit_source==='automatic_delivery'?'AUTOMATIC':'ADMIN CREDIT')+'</span><strong>'+esc(row.customer_name||'LEOGO Customer')+'</strong><small>'+esc(row.order_reference||'')+' · '+esc(date(row.credited_at))+'</small></div>'+
          '<div><small>Eligible spend '+money(row.eligible_subtotal_kes)+' · '+Number(row.reward_rate||0)*100+'%</small><strong>+'+money(row.reward_amount_kes)+'</strong></div>'+
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

  const load=async()=>{
    if(loading)return;
    loading=true;
    setStatus('Loading live Loyalty & Rewards data…');
    try{
      const {data,error}=await db.rpc('admin_get_loyalty_rewards_dashboard');
      if(error)throw error;
      render(data||{});
      setStatus('Live reward data is up to date.','success');
    }catch(error){
      setStatus(error?.message||'Loyalty & Rewards data could not be loaded.','error');
    }finally{
      loading=false;
    }
  };

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

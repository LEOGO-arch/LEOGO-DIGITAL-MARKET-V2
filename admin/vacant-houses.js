// LEOGO Admin — Vacant Houses operations V1
(() => {
  'use strict';
  const db=window.leogoAdminDb;
  if(!db)return;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const photoUrl=path=>{try{return db.storage.from('vacant-house-public-media').getPublicUrl(path).data.publicUrl||'';}catch{return '';}};
  let state={settings:{},summary:{},listings:[],viewing_requests:[],payment_accounts:[]};
  let loading=false;

  const host=document.createElement('section');
  host.className='admin-panel';
  host.dataset.adminPanel='vacant_houses';
  host.innerHTML=`
    <div class="section-head"><div><span>PROPERTY MARKET</span><h2>Vacant Houses</h2><p>Approve customer house submissions, configure Shopping Vouchers and viewing/access fees, verify payments, and control vacancy status.</p></div><button id="vhAdminRefresh" class="primary-button" type="button">↻ Refresh Vacant Houses</button></div>
    <div class="vh-admin-summary">
      <article><span>Pending Listings</span><strong id="vhAdminPending">0</strong><small>Needs review</small></article>
      <article><span>Vacant & Live</span><strong id="vhAdminLive">0</strong><small>Public houses</small></article>
      <article><span>Occupied</span><strong id="vhAdminOccupied">0</strong><small>Hidden from public</small></article>
      <article><span>Payment Review</span><strong id="vhAdminPayments">0</strong><small>Viewing access fees</small></article>
      <article><span>Access Granted</span><strong id="vhAdminGranted">0</strong><small>Verified/waived</small></article>
    </div>
    <section class="content-card vh-admin-settings">
      <div class="card-head"><div><span>ADMIN CONTROLS</span><h3>Vacant House Rules</h3><p>The submission reward is credited as non-withdrawable LEOGO Shopping Voucher points only after Admin approves the house.</p></div></div>
      <form id="vhAdminSettingsForm" class="vh-admin-settings-form">
        <label class="switch-label"><input id="vhAdminEnabled" type="checkbox"><span>Vacant Houses module enabled</span></label>
        <label class="switch-label"><input id="vhAdminVoucherEnabled" type="checkbox"><span>Reward approved customer submissions</span></label>
        <label><span>Submission Shopping Voucher (KSh)</span><input id="vhAdminVoucher" type="number" min="0" max="1000000" step="1" required></label>
        <label><span>Viewing / exact-location access fee (KSh)</span><input id="vhAdminFee" type="number" min="0" max="1000000" step="1" required></label>
        <label><span>Viewing fee payment account</span><select id="vhAdminPaymentAccount"><option value="">Select active payment account</option></select></label>
        <button class="primary-button" type="submit">Save Vacant House Settings</button>
      </form>
      <div id="vhAdminSettingsStatus" class="form-status"></div>
    </section>
    <div class="vh-admin-columns">
      <section class="content-card">
        <div class="card-head"><div><span>HOUSE APPROVALS</span><h3>Submitted Houses</h3><p>Exact address and contact are visible here for Admin verification, but never in the public house feed.</p></div><select id="vhAdminListingFilter"><option value="attention">Needs attention</option><option value="all">All listings</option><option value="approved">Approved</option><option value="occupied">Occupied</option><option value="rejected">Rejected</option></select></div>
        <div id="vhAdminListingList" class="vh-admin-list"><div class="loading-card">Loading house submissions…</div></div>
      </section>
      <section class="content-card">
        <div class="card-head"><div><span>VIEWING PAYMENTS</span><h3>Exact Location Access</h3><p>Verify the submitted payment reference before the customer can receive landlord/agent contact and exact location.</p></div><select id="vhAdminPaymentFilter"><option value="attention">Needs verification</option><option value="all">All requests</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></div>
        <div id="vhAdminRequestList" class="vh-admin-list"><div class="loading-card">Loading viewing requests…</div></div>
      </section>
    </div>
    <div id="vhAdminStatus" class="form-status"></div>`;
  document.querySelector('.admin-main')?.append(host);

  const setStatus=(message='',type='')=>{const e=$('#vhAdminStatus');if(e){e.textContent=message;e.className='form-status'+(type?' '+type:'');}};
  const setSettingsStatus=(message='',type='')=>{const e=$('#vhAdminSettingsStatus');if(e){e.textContent=message;e.className='form-status'+(type?' '+type:'');}};

  const renderSummary=()=>{
    const s=state.summary||{};
    [['vhAdminPending',s.pending_listings],['vhAdminLive',s.vacant_listings],['vhAdminOccupied',s.occupied_listings],['vhAdminPayments',s.pending_payments],['vhAdminGranted',s.verified_access]].forEach(([id,v])=>{const e=$('#'+id);if(e)e.textContent=Number(v||0).toLocaleString('en-KE');});
    const badge=$('#sidebarVacantHouseCount');
    if(badge){const n=Number(s.pending_listings||0)+Number(s.pending_payments||0);badge.textContent=n;badge.hidden=false;}
  };

  const renderSettings=()=>{
    const s=state.settings||{};
    $('#vhAdminEnabled').checked=Boolean(s.is_enabled);
    $('#vhAdminVoucherEnabled').checked=Boolean(s.voucher_enabled);
    $('#vhAdminVoucher').value=Number(s.submission_voucher_kes||0);
    $('#vhAdminFee').value=Number(s.viewing_access_fee_kes||0);
    const select=$('#vhAdminPaymentAccount');
    select.innerHTML='<option value="">Select active payment account</option>'+state.payment_accounts.map(a=>
      '<option value="'+esc(a.id)+'">'+esc(a.display_name||a.account_name||a.business_name||a.account_type)+'</option>'
    ).join('');
    select.value=s.payment_account_id||'';
  };

  const listingMatches=l=>{
    const f=$('#vhAdminListingFilter')?.value||'attention';
    if(f==='all')return true;
    if(f==='attention')return ['pending','under_review'].includes(l.approval_status);
    if(f==='occupied')return l.availability_status==='occupied';
    return l.approval_status===f;
  };

  const renderListings=()=>{
    const list=$('#vhAdminListingList');
    const rows=state.listings.filter(listingMatches);
    if(!rows.length){list.innerHTML='<div class="loading-card">No house submissions in this filter.</div>';return;}
    list.innerHTML=rows.map(l=>{
      const img=photoUrl((l.photo_paths||[])[0]);
      const pending=['pending','under_review'].includes(l.approval_status);
      return '<article class="vh-admin-card">'+
        '<div class="vh-admin-photo">'+(img?'<img src="'+esc(img)+'" alt="'+esc(l.title)+'">':'<span>🏠</span>')+'</div>'+
        '<div class="vh-admin-copy"><div class="vh-admin-card-head"><div><span>'+esc(l.listing_reference)+'</span><h4>'+esc(l.title)+'</h4></div><b>'+esc(label(l.approval_status))+' · '+esc(label(l.availability_status))+'</b></div>'+
        '<div class="vh-admin-facts"><span><small>Rent</small>'+esc(money(l.monthly_rent_kes))+'</span><span><small>General area</small>'+esc(l.area_estate+', '+l.sub_county+', '+l.county)+'</span><span><small>Submitter</small>'+esc(l.submitter_name||'Customer')+' · '+esc(label(l.submitter_role))+'</span></div>'+
        '<details><summary>Private verification details</summary><div class="vh-admin-private"><p><b>Contact:</b> '+esc(l.contact_name||'—')+' · '+esc(l.contact_phone||'—')+'</p><p><b>Exact address:</b> '+esc(l.exact_address||'—')+'</p><p><b>Landmark:</b> '+esc(l.landmark||'—')+'</p><p><b>Coordinates:</b> '+esc(l.latitude??'—')+', '+esc(l.longitude??'—')+'</p>'+(l.maps_link?'<p><a href="'+esc(l.maps_link)+'" target="_blank" rel="noopener">Open submitted map link ↗</a></p>':'')+'<p>'+esc(l.description||'')+'</p></div></details>'+
        (Number(l.voucher_amount_kes)>0?'<div class="vh-admin-voucher">🎁 '+esc(money(l.voucher_amount_kes))+' Shopping Voucher credited</div>':'')+
        '<div class="vh-admin-actions">'+
          (pending?'<button data-vh-review="'+esc(l.id)+'" data-action="approve" class="approve">Approve & Publish</button><button data-vh-review="'+esc(l.id)+'" data-action="under_review">Under Review</button><button data-vh-review="'+esc(l.id)+'" data-action="reject" class="reject">Reject</button>':'')+
          (l.approval_status==='approved'?'<button data-vh-status="'+esc(l.id)+'" data-status="vacant">Mark Vacant</button><button data-vh-status="'+esc(l.id)+'" data-status="occupied">Mark Occupied</button><button data-vh-status="'+esc(l.id)+'" data-status="archived">Archive</button>':'')+
        '</div></div></article>';
    }).join('');
  };

  const requestMatches=r=>{
    const f=$('#vhAdminPaymentFilter')?.value||'attention';
    if(f==='all')return true;
    if(f==='attention')return r.payment_status==='submitted';
    return r.payment_status===f;
  };

  const renderRequests=()=>{
    const list=$('#vhAdminRequestList');
    const rows=state.viewing_requests.filter(requestMatches);
    if(!rows.length){list.innerHTML='<div class="loading-card">No viewing requests in this filter.</div>';return;}
    list.innerHTML=rows.map(r=>
      '<article class="vh-admin-request">'+
        '<div class="vh-admin-card-head"><div><span>'+esc(r.request_reference)+'</span><h4>'+esc(r.title)+'</h4></div><b>'+esc(label(r.payment_status))+'</b></div>'+
        '<p><strong>'+esc(r.customer_name||'Customer')+'</strong> · '+esc(r.customer_phone||'No saved phone')+'</p>'+
        '<div class="vh-admin-payment-ref"><small>Expected fee</small><strong>'+esc(money(r.fee_amount_kes))+'</strong><small>Submitted reference</small><code>'+esc(r.payment_reference||'—')+'</code></div>'+
        (r.preferred_viewing_at?'<p>Preferred viewing: '+esc(new Date(r.preferred_viewing_at).toLocaleString('en-KE'))+'</p>':'')+
        (r.customer_message?'<p>Message: '+esc(r.customer_message)+'</p>':'')+
        (r.admin_notes?'<p>Admin note: '+esc(r.admin_notes)+'</p>':'')+
        (r.payment_status==='submitted'?'<div class="vh-admin-actions"><button data-vh-payment="'+esc(r.id)+'" data-action="verify" class="approve">Verify & Unlock Details</button><button data-vh-payment="'+esc(r.id)+'" data-action="reject" class="reject">Reject Payment</button></div>':'')+
      '</article>'
    ).join('');
  };

  const render=()=>{renderSummary();renderSettings();renderListings();renderRequests();};

  const load=async()=>{
    if(loading)return;
    loading=true;
    setStatus('Loading Vacant Houses…');
    try{
      const {data,error}=await db.rpc('admin_get_vacant_house_dashboard');
      if(error)throw error;
      state={...state,...(data||{})};
      render();
      setStatus('Vacant Houses synchronized.','success');
    }catch(e){setStatus(e.message||'Vacant Houses could not load.','error');}
    finally{loading=false;}
  };

  $('#vhAdminRefresh').addEventListener('click',load);
  $('#vhAdminListingFilter').addEventListener('change',renderListings);
  $('#vhAdminPaymentFilter').addEventListener('change',renderRequests);

  $('#vhAdminSettingsForm').addEventListener('submit',async ev=>{
    ev.preventDefault();
    setSettingsStatus('Saving Vacant House settings…');
    try{
      const {error}=await db.rpc('admin_save_vacant_house_settings',{
        p_is_enabled:$('#vhAdminEnabled').checked,
        p_voucher_enabled:$('#vhAdminVoucherEnabled').checked,
        p_submission_voucher_kes:Number($('#vhAdminVoucher').value||0),
        p_viewing_access_fee_kes:Number($('#vhAdminFee').value||0)
      });
      if(error)throw error;
      const account=$('#vhAdminPaymentAccount').value;
      if(account && account!==String(state.settings.payment_account_id||'')){
        const assigned=await db.rpc('admin_assign_payment_account',{p_function_code:'vacant_house_viewing',p_account_id:account});
        if(assigned.error)throw assigned.error;
      }
      setSettingsStatus('Vacant House settings saved.','success');
      await load();
    }catch(e){setSettingsStatus(e.message||'Could not save settings.','error');}
  });

  $('#vhAdminListingList').addEventListener('click',async ev=>{
    const review=ev.target.closest('[data-vh-review]');
    const status=ev.target.closest('[data-vh-status]');
    try{
      if(review){
        const action=review.dataset.action;
        const notes=action==='reject'?window.prompt('Reason for rejection:',''):(action==='under_review'?window.prompt('Optional review note:',''):'');
        if(action==='reject' && !String(notes||'').trim())return;
        review.disabled=true;
        const {error}=await db.rpc('admin_review_vacant_house_listing',{p_listing_id:review.dataset.vhReview,p_decision:action,p_notes:String(notes||'').trim()||null});
        if(error)throw error;
        setStatus(action==='approve'?'House approved and published. Any configured Shopping Voucher was credited once.':'House review updated.','success');
        await load();
      }
      if(status){
        const next=status.dataset.status;
        const notes=window.prompt('Optional Admin note for '+label(next)+':','');
        status.disabled=true;
        const {error}=await db.rpc('admin_set_vacant_house_availability',{p_listing_id:status.dataset.vhStatus,p_status:next,p_notes:String(notes||'').trim()||null});
        if(error)throw error;
        setStatus('House marked '+label(next)+'.','success');
        await load();
      }
    }catch(e){setStatus(e.message||'Action failed.','error');}
  });

  $('#vhAdminRequestList').addEventListener('click',async ev=>{
    const button=ev.target.closest('[data-vh-payment]');
    if(!button)return;
    const action=button.dataset.action;
    const notes=action==='reject'?window.prompt('Reason payment was not verified:',''):'';
    if(action==='reject'&&!String(notes||'').trim())return;
    try{
      button.disabled=true;
      const {error}=await db.rpc('admin_review_vacant_house_viewing_payment',{p_request_id:button.dataset.vhPayment,p_decision:action,p_notes:String(notes||'').trim()||null});
      if(error)throw error;
      setStatus(action==='verify'?'Payment verified. Exact location and contact are now unlocked for this customer.':'Payment rejected. Customer can correct and resubmit.','success');
      await load();
    }catch(e){setStatus(e.message||'Payment review failed.','error');}
  });

  document.querySelectorAll('.admin-nav [data-admin-view="vacant_houses"]').forEach(button=>button.addEventListener('click',()=>setTimeout(load,0)));
  window.leogoVacantHousesAdmin={activate:load};
})();
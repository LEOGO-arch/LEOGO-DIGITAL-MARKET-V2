// LEOGO Admin — Customer Feedback & Testimonies moderation
(() => {
  'use strict';

  const db=window.leogoAdminDb;
  const list=document.getElementById('adminFeedbackList');
  const filter=document.getElementById('adminFeedbackStatusFilter');
  const refresh=document.getElementById('refreshCustomerFeedback');
  const statusBox=document.getElementById('adminFeedbackStatus');
  const badge=document.getElementById('sidebarFeedbackCount');
  if(!db||!list)return;

  let rows=[];

  const escapeHtml=(value='')=>String(value??'').replace(/[&<>'"]/g,(character)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
  const formatDate=(value)=>{
    if(!value)return '—';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '—';
    return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(date);
  };
  const stars=(rating)=>{
    const value=Math.max(0,Math.min(5,Number(rating||0)));
    return '★'.repeat(value)+'☆'.repeat(5-value);
  };
  const setStatus=(message='',type='')=>{
    if(!statusBox)return;
    statusBox.textContent=message;
    statusBox.className='form-status'+(type?' '+type:'');
  };

  const updateCounts=()=>{
    const total=rows.length;
    const pending=rows.filter((row)=>row.moderation_status==='submitted').length;
    const approved=rows.filter((row)=>row.moderation_status==='approved').length;
    const testimonies=rows.filter((row)=>row.entry_type==='testimonial').length;
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=String(value);};
    set('adminFeedbackTotal',total);
    set('adminFeedbackPending',pending);
    set('adminFeedbackApproved',approved);
    set('adminTestimonialCount',testimonies);
    if(badge){
      badge.textContent=String(pending);
      badge.setAttribute('aria-label',pending+' Feedback or Testimonies awaiting Admin review');
    }
  };

  const render=()=>{
    updateCounts();
    const selected=filter?.value||'submitted';
    const visible=rows.filter((row)=>selected==='all'||row.moderation_status===selected);
    if(!visible.length){
      list.innerHTML='<div class="loading-card">No Feedback or Testimonies match this filter.</div>';
      return;
    }
    list.innerHTML=visible.map((row)=>{
      const kind=row.entry_type==='testimonial'?'Testimonial':'Feedback';
      const moderation=row.moderation_status;
      const account=[row.customer_name,row.customer_phone].filter(Boolean).join(' · ')||'Customer profile';
      const stateHtml=moderation==='submitted'
        ? '<div class="admin-product-review-note"><span>Admin note / rejection reason</span><textarea rows="2" maxlength="1000" data-feedback-admin-note="'+escapeHtml(row.entry_id)+'" placeholder="Optional on approval; required if rejecting"></textarea></div>'+
          '<div class="admin-product-review-actions"><button type="button" data-feedback-admin-action="approved" data-feedback-entry="'+escapeHtml(row.entry_id)+'">Approve & Publish</button><button class="danger" type="button" data-feedback-admin-action="rejected" data-feedback-entry="'+escapeHtml(row.entry_id)+'">Reject</button></div>'
        : '<div class="'+(moderation==='approved'?'admin-product-review-approved':'admin-product-review-rejected')+'">'+escapeHtml(moderation==='approved'?'Approved & Public':'Rejected · Not Public')+'</div>'+
          (row.admin_notes?'<div class="admin-product-review-comment"><small>ADMIN NOTE</small><p>'+escapeHtml(row.admin_notes)+'</p></div>':'');
      return '<article class="admin-product-review-card">'+
        '<header><div><span>'+escapeHtml(kind.toUpperCase())+'</span><h4>'+escapeHtml(row.headline||kind+' from '+row.display_name)+'</h4><p>Public name: '+escapeHtml(row.display_name)+' · Submitted '+escapeHtml(formatDate(row.submitted_at))+'</p></div>'+
        '<div class="admin-product-review-rating"><strong>'+escapeHtml(stars(row.rating))+'</strong><span>'+escapeHtml(row.rating)+'/5</span></div></header>'+
        '<div class="admin-product-review-meta"><span><small>CUSTOMER ACCOUNT</small><strong>'+escapeHtml(account)+'</strong></span><span><small>TYPE</small><strong>'+escapeHtml(kind)+'</strong></span><span><small>STATUS</small><strong>'+escapeHtml(moderation)+'</strong></span></div>'+
        '<div class="admin-product-review-comment"><small>CUSTOMER MESSAGE</small><p>'+escapeHtml(row.message)+'</p></div>'+
        stateHtml+
      '</article>';
    }).join('');
  };

  const load=async({silent=false}={})=>{
    if(!silent)setStatus('Loading Feedback & Testimonies…');
    const {data,error}=await db.rpc('admin_list_customer_feedback_testimonials');
    if(error){
      rows=[];
      render();
      setStatus(error.message||'Feedback & Testimonies could not load.','error');
      return;
    }
    rows=Array.isArray(data)?data:[];
    render();
    if(!silent)setStatus('Feedback & Testimonies are up to date.','success');
  };

  const moderate=async(button)=>{
    const entryId=button.dataset.feedbackEntry;
    const action=button.dataset.feedbackAdminAction;
    if(!entryId||!['approved','rejected'].includes(action))return;
    const note=list.querySelector('[data-feedback-admin-note="'+CSS.escape(entryId)+'"]')?.value.trim()||'';
    if(action==='rejected'&&note.length<3){
      setStatus('Add a clear reason before rejecting this submission.','error');
      return;
    }
    const original=button.textContent;
    button.disabled=true;
    button.textContent=action==='approved'?'Publishing…':'Rejecting…';
    try{
      const {error}=await db.rpc('admin_moderate_customer_feedback_testimonial',{
        p_entry_id:entryId,
        p_action:action,
        p_admin_notes:note||null
      });
      if(error)throw error;
      setStatus(action==='approved'
        ? 'Submission approved and published on the Customer Front.'
        : 'Submission rejected and kept off the Customer Front.','success');
      await load({silent:true});
    }catch(error){
      setStatus(error?.message||'This moderation action could not be completed.','error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  filter?.addEventListener('change',render);
  refresh?.addEventListener('click',async()=>{
    const original=refresh.textContent;
    refresh.disabled=true;
    refresh.textContent='Refreshing…';
    try{await load();}finally{refresh.disabled=false;refresh.textContent=original;}
  });
  list.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-feedback-admin-action]');
    if(button)moderate(button);
  });

  document.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-admin-view="customers"]')){
      window.setTimeout(()=>load({silent:true}).catch(()=>{}),80);
    }
  });

  document.addEventListener('DOMContentLoaded',async()=>{
    const {data}=await db.auth.getSession();
    if(data?.session?.user)load({silent:true}).catch(()=>{});
  });

  db.auth.onAuthStateChange((_event,session)=>{
    if(session?.user)window.setTimeout(()=>load({silent:true}).catch(()=>{}),80);
    else{
      rows=[];
      render();
      setStatus('');
    }
  });
})();

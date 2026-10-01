// LEOGO Customer Feedback & Testimonies V1
(() => {
  'use strict';

  const escapeHtml=(value='')=>String(value??'').replace(/[&<>'"]/g,(character)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
  const formatDate=(value)=>{
    if(!value)return '—';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '—';
    return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(date);
  };
  const stars=(rating)=>{
    const value=Math.max(0,Math.min(5,Number(rating||0)));
    return '★'.repeat(value)+'☆'.repeat(5-value);
  };

  const modal=document.getElementById('feedbackTestimonialsModal');
  const openButton=document.getElementById('openFeedbackTestimonials');
  const form=document.getElementById('customerFeedbackTestimonialForm');
  const statusBox=document.getElementById('customerFeedbackStatus');
  const publicList=document.getElementById('publicFeedbackTestimonialsList');
  const ownList=document.getElementById('customerOwnFeedbackList');
  const typeFilter=document.getElementById('publicFeedbackTypeFilter');
  const loginNote=document.getElementById('feedbackLoginNote');
  const displayNameInput=document.getElementById('feedbackDisplayName');
  const ratingInput=document.getElementById('feedbackRating');
  const submitButton=document.getElementById('submitCustomerFeedback');

  if(!modal||!openButton||!form)return;

  let publicRows=[];
  let ownRows=[];
  let currentUser=null;

  const client=()=>window.leogoAuth?.client||null;

  const setStatus=(message='',type='')=>{
    if(!statusBox)return;
    statusBox.textContent=message;
    statusBox.className='service-review-status'+(type?' '+type:'');
  };

  const selectPanel=(name='public')=>{
    const target=['public','share'].includes(name)?name:'public';
    modal.querySelectorAll('[data-feedback-panel-target]').forEach((button)=>{
      const selected=button.dataset.feedbackPanelTarget===target;
      if(button.getAttribute('role')==='tab'){
        button.classList.toggle('active',selected);
        button.setAttribute('aria-selected',selected?'true':'false');
      }
    });
    modal.querySelectorAll('[data-feedback-panel]').forEach((panel)=>{
      const selected=panel.dataset.feedbackPanel===target;
      panel.classList.toggle('active',selected);
      panel.hidden=!selected;
    });
  };

  const paintRating=(rating)=>{
    const value=Number(rating||0);
    modal.querySelectorAll('[data-feedback-rating]').forEach((button)=>{
      const score=Number(button.dataset.feedbackRating);
      button.classList.toggle('active',score<=value);
      button.setAttribute('aria-checked',String(score===value));
    });
  };

  const renderPublic=()=>{
    if(!publicList)return;
    const filter=typeFilter?.value||'all';
    const rows=publicRows.filter((row)=>filter==='all'||row.entry_type===filter);
    if(!rows.length){
      publicList.innerHTML='<div class="customer-empty-state compact"><span>💬</span><h4>No approved '+(filter==='all'?'feedback or testimonies':filter==='testimonial'?'testimonies':'feedback')+' yet</h4><p>Approved customer experiences will appear here after LEOGO Admin review.</p></div>';
      return;
    }
    publicList.innerHTML=rows.map((row)=>{
      const kind=row.entry_type==='testimonial'?'Testimonial':'Feedback';
      return '<article class="feedback-public-card">'+
        '<header><div><span class="feedback-kind">'+escapeHtml(kind)+'</span><h4>'+escapeHtml(row.headline||kind+' from '+row.display_name)+'</h4></div><span class="feedback-stars" aria-label="'+escapeHtml(row.rating)+' out of 5 stars">'+escapeHtml(stars(row.rating))+'</span></header>'+
        '<p>'+escapeHtml(row.message)+'</p>'+
        '<footer><strong>'+escapeHtml(row.display_name)+'</strong><time>'+escapeHtml(formatDate(row.published_at))+'</time></footer>'+
      '</article>';
    }).join('');
  };

  const renderOwn=()=>{
    if(!ownList)return;
    if(!currentUser){
      ownList.innerHTML='<div class="feedback-own-empty">Sign in to view your submissions.</div>';
      return;
    }
    if(!ownRows.length){
      ownList.innerHTML='<div class="feedback-own-empty">You have not submitted feedback or a testimonial yet.</div>';
      return;
    }
    ownList.innerHTML=ownRows.map((row)=>{
      const label=row.entry_type==='testimonial'?'Testimonial':'Feedback';
      const note=row.moderation_status==='rejected'&&row.admin_notes
        ? ' · Admin: '+row.admin_notes
        : '';
      return '<article class="feedback-own-card"><div><strong>'+escapeHtml(row.headline||label)+'</strong><small>'+escapeHtml(label)+' · '+escapeHtml(stars(row.rating))+' · '+escapeHtml(formatDate(row.submitted_at))+escapeHtml(note)+'</small></div><b class="'+escapeHtml(row.moderation_status)+'">'+escapeHtml(row.moderation_status)+'</b></article>';
    }).join('');
  };

  const syncSubmissionAvailability=()=>{
    const pending=ownRows.some((row)=>row.moderation_status==='submitted');
    if(submitButton){
      submitButton.disabled=!currentUser||pending;
      submitButton.textContent=pending?'Awaiting Admin Review':'Send for Admin Approval';
    }
    if(loginNote){
      if(!currentUser){
        loginNote.textContent='Sign in to your LEOGO customer account before submitting.';
        loginNote.classList.remove('ready');
      }else if(pending){
        loginNote.textContent='You already have one submission awaiting LEOGO Admin review.';
        loginNote.classList.add('ready');
      }else{
        loginNote.textContent='Signed in. Your account is linked privately to this submission; customers only see the display name below.';
        loginNote.classList.add('ready');
      }
    }
  };

  const resolveUser=async()=>{
    currentUser=window.leogoAuth?.getUser?.()||null;
    if(!currentUser&&client()){
      const {data}=await client().auth.getSession();
      currentUser=data?.session?.user||null;
    }
    return currentUser;
  };

  const prefillDisplayName=async()=>{
    if(!currentUser||!displayNameInput)return;
    let name=String(currentUser.user_metadata?.full_name||'').trim();
    const {data}=await client().from('customer_profiles').select('full_name').eq('user_id',currentUser.id).maybeSingle();
    if(data?.full_name)name=String(data.full_name).trim();
    if(!displayNameInput.value.trim())displayNameInput.value=name||'LEOGO Customer';
  };

  const loadPublic=async()=>{
    const db=client();
    if(!db)return;
    const {data,error}=await db.rpc('public_list_customer_feedback_testimonials',{p_limit:50});
    if(error){
      publicRows=[];
      if(publicList)publicList.innerHTML='<div class="customer-empty-state compact"><span>⚠️</span><h4>Customer experiences could not load</h4><p>'+escapeHtml(error.message||'Please try again shortly.')+'</p></div>';
      return;
    }
    publicRows=Array.isArray(data)?data:[];
    renderPublic();
  };

  const loadOwn=async()=>{
    const db=client();
    await resolveUser();
    if(!currentUser||!db){
      ownRows=[];
      renderOwn();
      syncSubmissionAvailability();
      return;
    }
    const {data,error}=await db.rpc('customer_list_own_feedback_testimonials');
    ownRows=!error&&Array.isArray(data)?data:[];
    renderOwn();
    syncSubmissionAvailability();
    await prefillDisplayName();
  };

  const openModal=async(panel='public')=>{
    selectPanel(panel);
    setStatus('');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    await Promise.all([loadPublic(),loadOwn()]);
  };

  const closeModal=()=>{
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };

  openButton.addEventListener('click',(event)=>{
    event.preventDefault();
    openModal('public').catch(()=>{});
  });
  modal.querySelectorAll('[data-close-feedback-testimonials]').forEach((button)=>button.addEventListener('click',closeModal));
  modal.querySelectorAll('[data-feedback-panel-target]').forEach((button)=>button.addEventListener('click',()=>{
    selectPanel(button.dataset.feedbackPanelTarget);
  }));
  typeFilter?.addEventListener('change',renderPublic);

  modal.querySelectorAll('[data-feedback-rating]').forEach((button)=>button.addEventListener('click',()=>{
    const rating=Number(button.dataset.feedbackRating);
    ratingInput.value=String(rating);
    paintRating(rating);
  }));

  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    await resolveUser();
    if(!currentUser){
      closeModal();
      window.leogoAuth?.requireLogin?.('Please sign in before sharing feedback or a testimonial.');
      return;
    }
    if(!form.reportValidity())return;
    const rating=Number(ratingInput.value||0);
    if(rating<1||rating>5){
      setStatus('Choose a rating from 1 to 5 stars.','error');
      return;
    }

    const original=submitButton.textContent;
    submitButton.disabled=true;
    submitButton.textContent='Sending…';
    setStatus('Sending your submission to LEOGO Admin…');
    try{
      const {data,error}=await client().rpc('customer_submit_feedback_testimonial',{
        p_entry_type:document.getElementById('feedbackEntryType').value,
        p_rating:rating,
        p_headline:document.getElementById('feedbackHeadline').value.trim()||null,
        p_message:document.getElementById('feedbackMessage').value.trim(),
        p_display_name:displayNameInput.value.trim()
      });
      if(error)throw error;
      setStatus(data?.message||'✓ Submitted. LEOGO Admin will review it before publication.','success');
      form.reset();
      ratingInput.value='';
      paintRating(0);
      await loadOwn();
      window.setTimeout(()=>selectPanel('public'),900);
    }catch(error){
      setStatus(error?.message||'Your feedback could not be submitted.','error');
      submitButton.disabled=false;
      submitButton.textContent=original;
    }finally{
      syncSubmissionAvailability();
    }
  });

  document.addEventListener('leogo:authchange',()=>{
    window.setTimeout(()=>loadOwn().catch(()=>{}),60);
  });

  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&modal.classList.contains('open'))closeModal();
  });

  // Keep public approved experiences warm so opening the card is immediate.
  window.setTimeout(()=>loadPublic().catch(()=>{}),700);
})();

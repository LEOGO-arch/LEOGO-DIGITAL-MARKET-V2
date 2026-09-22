(() => {
'use strict';

const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const STAFF_PORTAL_URL='https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/staff/';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
if(!client)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(v)):'—';

let user=null,staff=null,jobs=[],filter='active',authEvent='';

const setupMode=()=>new URLSearchParams(window.location.search).get('setup')==='1';
const recoveryMode=()=>new URLSearchParams(window.location.search).get('recovery')==='1';

const setStatus=(selector,msg='',type='')=>{
  const e=$(selector);
  if(!e)return;
  e.textContent=msg;
  e.className='status'+(type?' '+type:'');
};

function show(mode){
  $('#staffLogin').hidden=mode!=='login';
  $('#staffForgot').hidden=mode!=='forgot';
  $('#staffPasswordSetup').hidden=mode!=='password';
  $('#staffRouting').hidden=mode!=='routing';
  $('#staffAccessDenied').hidden=mode!=='denied';
  $('#riderApp').hidden=mode!=='app';
  $('#staffLogout').hidden=['login','forgot','password'].includes(mode);
}

function configurePasswordScreen(){
  const recovery=recoveryMode()||authEvent==='PASSWORD_RECOVERY';
  $('#passwordSetupEyebrow').textContent=recovery?'PASSWORD RECOVERY':'ACCOUNT ACTIVATION';
  $('#passwordSetupTitle').textContent=recovery?'Choose a new password':'Create your password';
  $('#passwordSetupText').textContent=recovery
    ?'Enter a new private password for your LEOGO Staff account.'
    :'Set your private password to activate your LEOGO Staff account.';
}

const strongPassword=(value='') =>
  value.length>=10 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

async function routeStaffAccount(){
  if(!user){show('login');return;}

  show('routing');

  const adminResult=await client.from('admin_users')
    .select('user_id,display_name,role,status,permissions')
    .eq('user_id',user.id).maybeSingle();

  if(!adminResult.error && adminResult.data?.status==='active'){
    window.location.replace('../admin/');
    return;
  }

  const riderResult=await client.from('leogo_staff')
    .select('*').eq('user_id',user.id).maybeSingle();

  if(riderResult.error||!riderResult.data||riderResult.data.staff_role!=='rider'||riderResult.data.status!=='active'){
    show('denied');
    return;
  }

  staff=riderResult.data;
  $('#riderName').textContent=staff.display_name||'Rider Dashboard';
  show('app');
  await loadJobs();
}

async function handleSession(session,event=''){
  authEvent=event||authEvent;
  user=session?.user||null;

  if(!user){
    staff=null;
    jobs=[];
    if(setupMode()||recoveryMode()){
      setStatus('#staffLoginStatus','This secure link is invalid or has expired. Request a new password link.','error');
    }
    show('login');
    return;
  }

  if(setupMode()||recoveryMode()||event==='PASSWORD_RECOVERY'){
    configurePasswordScreen();
    show('password');
    return;
  }

  await routeStaffAccount();
}

async function loadJobs(){
  setStatus('#riderStatus');
  const {data,error}=await client.rpc('rider_list_delivery_jobs');
  if(error){setStatus('#riderStatus',error.message,'error');return;}
  jobs=data||[];
  render();
  if(!jobs.length)setStatus('#riderStatus','No delivery jobs are currently assigned to you.');
}

function render(){
  $('#riderAssignedCount').textContent=jobs.filter(j=>j.status==='assigned').length;
  $('#riderPickedCount').textContent=jobs.filter(j=>j.status==='picked_up').length;
  $('#riderTransitCount').textContent=jobs.filter(j=>j.status==='on_the_way').length;
  $('#riderDeliveredCount').textContent=jobs.filter(j=>j.status==='delivered').length;

  const visible=filter==='all'
    ?jobs
    :filter==='delivered'
      ?jobs.filter(j=>j.status==='delivered')
      :jobs.filter(j=>['assigned','picked_up','on_the_way'].includes(j.status));

  $('#riderJobList').innerHTML=visible.length?visible.map(job=>{
    const pickups=(job.seller_pickups||[]).map(s=>
      '<div class="pickup-card"><small>SELLER PICKUP</small><strong>'+esc(s.seller_name)+'</strong><p>'+
      esc(s.seller_location||'Location not provided')+(s.seller_phone?' · '+esc(s.seller_phone):'')+
      '</p><p>Status: <b>'+esc(String(s.fulfilment_status).replaceAll('_',' '))+'</b></p></div>'
    ).join('');

    const next=job.status==='assigned'
      ?['picked_up','Mark Picked Up']
      :job.status==='picked_up'
        ?['on_the_way','Start Delivery — On the Way']
        :job.status==='on_the_way'
          ?['delivered','Mark Delivered']
          :null;

    return '<article class="rider-job"><header><div><strong>'+esc(job.order_reference)+'</strong><small>Assigned '+
      fmt(job.assigned_at)+'</small></div><span class="job-status">'+esc(String(job.status).replaceAll('_',' ').toUpperCase())+
      '</span></header><div class="job-body"><div class="job-grid"><div><small>CUSTOMER</small><strong>'+
      esc(job.customer_name)+'</strong><span>'+esc(job.customer_phone)+'</span></div><div><small>DELIVERY ADDRESS</small><strong>'+
      esc([job.estate,job.landmark,job.sub_county,job.county].filter(Boolean).join(', ')||job.delivery_zone)+'</strong>'+
      (job.location_link?'<a href="'+esc(job.location_link)+'" target="_blank" rel="noopener">Open location ↗</a>':'')+
      '</div><div><small>PAYMENT</small><strong>'+esc(String(job.payment_status).replaceAll('_',' ').toUpperCase())+
      '</strong><span>'+esc(String(job.payment_method).toUpperCase())+'</span></div><div><small>ORDER</small><strong>'+
      esc(String(job.status).replaceAll('_',' ').toUpperCase())+'</strong></div></div><div class="pickup-list">'+pickups+
      '</div></div><div class="job-actions">'+
      (next?'<button data-rider-next="'+next[0]+'" data-job-id="'+esc(job.delivery_job_id)+'">'+next[1]+'</button>'
        :'<strong class="done">✓ Delivery completed</strong>')+'</div></article>';
  }).join(''):'<div class="empty">No delivery jobs in this view.</div>';

  $$('[data-rider-next]').forEach(button=>button.addEventListener('click',async()=>{
    const next=button.dataset.riderNext;
    const confirmText=next==='delivered'
      ?'Confirm that this order has been physically delivered to the customer?'
      :'Update this delivery to '+next.replaceAll('_',' ')+'?';
    if(!window.confirm(confirmText))return;

    const original=button.textContent;
    button.disabled=true;
    button.textContent='Updating…';

    const {error}=await client.rpc('rider_update_delivery_status',{
      p_delivery_job_id:button.dataset.jobId,
      p_status:next,
      p_note:null
    });

    if(error){
      setStatus('#riderStatus',error.message,'error');
      button.disabled=false;
      button.textContent=original;
      return;
    }

    setStatus('#riderStatus','Delivery status updated. Customer and Seller have been notified.','success');
    await loadJobs();
  }));
}

$('#staffLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.submitter;
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Signing in…';
  setStatus('#staffLoginStatus','Signing in…');

  const {data,error}=await client.auth.signInWithPassword({
    email:$('#staffEmail').value.trim(),
    password:$('#staffPassword').value
  });

  if(error){
    setStatus('#staffLoginStatus',error.message,'error');
    button.disabled=false;
    button.textContent=original;
    return;
  }

  await handleSession(data.session,'SIGNED_IN');
  button.disabled=false;
  button.textContent=original;
});

$('#forgotPasswordOpen').addEventListener('click',()=>{
  $('#staffForgotEmail').value=$('#staffEmail').value.trim();
  setStatus('#staffForgotStatus');
  show('forgot');
});

$('#forgotPasswordBack').addEventListener('click',()=>show('login'));

$('#staffForgotForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.submitter;
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Sending…';
  setStatus('#staffForgotStatus','Sending secure reset link…');

  const email=$('#staffForgotEmail').value.trim();
  const {error}=await client.auth.resetPasswordForEmail(email,{
    redirectTo:STAFF_PORTAL_URL+'?recovery=1'
  });

  if(error){
    setStatus('#staffForgotStatus',error.message,'error');
  }else{
    setStatus('#staffForgotStatus','Reset link sent. Check the staff email inbox and open the LEOGO password reset link.','success');
  }

  button.disabled=false;
  button.textContent=original;
});

$('#staffPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.submitter;
  const original=button.textContent;
  const password=$('#staffNewPassword').value;
  const confirmPassword=$('#staffConfirmPassword').value;

  if(!strongPassword(password)){
    setStatus('#staffPasswordStatus','Use at least 10 characters with uppercase, lowercase, a number and a symbol.','error');
    return;
  }
  if(password!==confirmPassword){
    setStatus('#staffPasswordStatus','The two passwords do not match.','error');
    return;
  }

  button.disabled=true;
  button.textContent='Saving…';
  setStatus('#staffPasswordStatus','Saving your password…');

  const {error}=await client.auth.updateUser({password});
  if(error){
    setStatus('#staffPasswordStatus',error.message,'error');
    button.disabled=false;
    button.textContent=original;
    return;
  }

  setStatus('#staffPasswordStatus','Password saved. Opening your LEOGO staff workspace…','success');
  history.replaceState({},document.title,window.location.pathname);

  const {data}=await client.auth.getSession();
  await handleSession(data.session,'PASSWORD_UPDATED');

  button.disabled=false;
  button.textContent=original;
});

const signOut=async()=>{
  await client.auth.signOut();
  user=null;
  staff=null;
  jobs=[];
  history.replaceState({},document.title,window.location.pathname);
  show('login');
};

$('#staffLogout').addEventListener('click',signOut);
$('#deniedSignOut').addEventListener('click',signOut);
$('#refreshRiderJobs').addEventListener('click',loadJobs);

$$('[data-rider-filter]').forEach(button=>button.addEventListener('click',()=>{
  filter=button.dataset.riderFilter;
  $$('[data-rider-filter]').forEach(b=>b.classList.toggle('active',b===button));
  render();
}));

client.auth.onAuthStateChange((event,session)=>{
  setTimeout(()=>handleSession(session,event),0);
});

client.auth.getSession().then(({data})=>handleSession(data.session,'INITIAL_SESSION'));
})();

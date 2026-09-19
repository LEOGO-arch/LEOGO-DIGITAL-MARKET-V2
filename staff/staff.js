(() => {
'use strict';
const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
if(!client)return;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{maximumFractionDigits:2});
const fmt=v=>v?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}).format(new Date(v)):'—';
let user=null,staff=null,jobs=[],filter='active';
const setStatus=(msg='',type='')=>{const e=$('#riderStatus');e.textContent=msg;e.className='status'+(type?' '+type:'');};
function show(mode){
  $('#staffLogin').hidden=mode!=='login';
  $('#staffAccessDenied').hidden=mode!=='denied';
  $('#riderApp').hidden=mode!=='app';
  $('#staffLogout').hidden=mode==='login';
}
async function handleSession(session){
  user=session?.user||null;
  if(!user){staff=null;jobs=[];show('login');return;}
  const {data,error}=await client.from('leogo_staff').select('*').eq('user_id',user.id).maybeSingle();
  if(error||!data||data.staff_role!=='rider'||data.status!=='active'){show('denied');return;}
  staff=data;$('#riderName').textContent=data.display_name||'Rider Dashboard';show('app');await loadJobs();
}
async function loadJobs(){
  const {data,error}=await client.rpc('rider_list_delivery_jobs');
  if(error){setStatus(error.message,'error');return;}
  jobs=data||[];render();
}
function render(){
  $('#riderAssignedCount').textContent=jobs.filter(j=>j.status==='assigned').length;
  $('#riderPickedCount').textContent=jobs.filter(j=>j.status==='picked_up').length;
  $('#riderTransitCount').textContent=jobs.filter(j=>j.status==='on_the_way').length;
  $('#riderDeliveredCount').textContent=jobs.filter(j=>j.status==='delivered').length;
  const visible=filter==='all'?jobs:filter==='delivered'?jobs.filter(j=>j.status==='delivered'):jobs.filter(j=>['assigned','picked_up','on_the_way'].includes(j.status));
  $('#riderJobList').innerHTML=visible.length?visible.map(job=>{
    const pickups=(job.seller_pickups||[]).map(s=>'<div class="pickup-card"><small>SELLER PICKUP</small><strong>'+esc(s.seller_name)+'</strong><p>'+esc(s.seller_location||'Location not provided')+(s.seller_phone?' · '+esc(s.seller_phone):'')+'</p><p>Status: <b>'+esc(String(s.fulfilment_status).replaceAll('_',' '))+'</b></p></div>').join('');
    const next=job.status==='assigned'?['picked_up','Mark Picked Up']:job.status==='picked_up'?['on_the_way','Start Delivery — On the Way']:job.status==='on_the_way'?['delivered','Mark Delivered']:null;
    return '<article class="rider-job"><header><div><strong>'+esc(job.order_reference)+'</strong><small>Assigned '+fmt(job.assigned_at)+'</small></div><span class="job-status">'+esc(String(job.status).replaceAll('_',' ').toUpperCase())+'</span></header><div class="job-body"><div class="job-grid"><div><small>CUSTOMER</small><strong>'+esc(job.customer_name)+'</strong><span>'+esc(job.customer_phone)+'</span></div><div><small>DELIVERY ADDRESS</small><strong>'+esc([job.estate,job.landmark,job.sub_county,job.county].filter(Boolean).join(', ')||job.delivery_zone)+'</strong>'+(job.location_link?'<a href="'+esc(job.location_link)+'" target="_blank" rel="noopener">Open location ↗</a>':'')+'</div><div><small>PAYMENT</small><strong>'+esc(String(job.payment_status).replaceAll('_',' ').toUpperCase())+'</strong><span>'+esc(String(job.payment_method).toUpperCase())+'</span></div><div><small>ORDER</small><strong>'+esc(String(job.status).replaceAll('_',' ').toUpperCase())+'</strong></div></div><div class="pickup-list">'+pickups+'</div></div><div class="job-actions">'+(next?'<button data-rider-next="'+next[0]+'" data-job-id="'+esc(job.delivery_job_id)+'">'+next[1]+'</button>':'<strong class="done">✓ Delivery completed</strong>')+'</div></article>';
  }).join(''):'<div class="empty">No delivery jobs in this view.</div>';
  $$('[data-rider-next]').forEach(button=>button.addEventListener('click',async()=>{
    const next=button.dataset.riderNext;
    const confirmText=next==='delivered'?'Confirm that this order has been physically delivered to the customer?':'Update this delivery to '+next.replaceAll('_',' ')+'?';
    if(!window.confirm(confirmText))return;
    const original=button.textContent;button.disabled=true;button.textContent='Updating…';
    const {error}=await client.rpc('rider_update_delivery_status',{p_delivery_job_id:button.dataset.jobId,p_status:next,p_note:null});
    if(error){setStatus(error.message,'error');button.disabled=false;button.textContent=original;return;}
    setStatus('Delivery status updated. Customer and Seller have been notified.','success');
    await loadJobs();
  }));
}
$('#staffLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;const original=button.textContent;button.disabled=true;button.textContent='Signing in…';
  $('#staffLoginStatus').textContent='Signing in…';
  const {data,error}=await client.auth.signInWithPassword({email:$('#staffEmail').value.trim(),password:$('#staffPassword').value});
  if(error){$('#staffLoginStatus').textContent=error.message;button.disabled=false;button.textContent=original;return;}
  await handleSession(data.session);button.disabled=false;button.textContent=original;
});
$('#staffLogout').addEventListener('click',async()=>{await client.auth.signOut();show('login');});
$('#deniedSignOut').addEventListener('click',async()=>{await client.auth.signOut();show('login');});
$('#refreshRiderJobs').addEventListener('click',loadJobs);
$$('[data-rider-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.riderFilter;$$('[data-rider-filter]').forEach(b=>b.classList.toggle('active',b===button));render();}));
client.auth.onAuthStateChange((event,session)=>setTimeout(()=>handleSession(session),0));
client.auth.getSession().then(({data})=>handleSession(data.session));
})();
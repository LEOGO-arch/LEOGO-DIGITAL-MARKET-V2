// Admin review of rent applications; payment settlement is deliberately not enabled here.
(() => {
  'use strict';
  const client = window.leogoAdminDb;
  if (!client) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel = document.querySelector('[data-admin-panel="wallet"]');
  if (!panel) return;
  const section = document.createElement('section');
  section.className = 'content-card';
  section.id = 'adminRentPolePole';
  section.innerHTML = `<div class="card-head"><div><span>PROPERTY • WALLET</span><h3>🏡 Lipa Rent Pole Pole Applications</h3><p>Verify applicant and landlord information. Applications cannot collect payments or release landlord settlements until the payment workflow is activated.</p></div><button id="rentAdminRefresh" type="button">Refresh</button></div>
    <div id="rentAdminStatus" role="status"></div><div id="rentAdminList"></div>
    <form id="rentHouseTypeAdmin" class="settings-form"><h4>Add a house type</h4><div class="form-grid"><label>Code (lowercase, underscores)<input name="code" pattern="[a-z0-9_]{2,50}" required></label><label>Display name<input name="label" maxlength="100" required></label><button type="submit">Add House Type</button></div></form>`;
  panel.append(section);
  const status = document.getElementById('rentAdminStatus');
  const list = document.getElementById('rentAdminList');
  const load = async () => {
    status.textContent = 'Loading rent applications…';
    const {data,error} = await client.from('rent_installment_applications').select('id,full_name,house_type,monthly_rent,deposit_amount,payment_frequency,county,sub_county,estate,landlord_account,status,portrait_path,created_at').order('created_at',{ascending:false}).limit(100);
    if (error) { status.textContent = 'Unable to load rent applications: ' + error.message; return; }
    status.textContent = `${data.length} recent application(s). Private ID details are not shown in this overview.`;
    list.innerHTML = data.length ? data.map(a=>`<article class="content-card" style="margin:12px 0;padding:16px"><strong>${esc(a.full_name)} • ${esc(a.house_type)}</strong><p>${esc(a.estate)}, ${esc(a.sub_county)}, ${esc(a.county)} • KSh ${Number(a.monthly_rent).toLocaleString('en-KE')}/month • Deposit KSh ${Number(a.deposit_amount).toLocaleString('en-KE')}</p><p>Frequency: ${esc(a.payment_frequency)} • Status: <strong>${esc(a.status)}</strong></p><p>Landlord account: ${a.landlord_account ? 'Provided — verify before activating' : 'Not yet provided'}</p><div class="card-head"><button type="button" data-rent-photo="${esc(a.portrait_path||'')}" ${a.portrait_path?'':'disabled'}>View private photo</button><button type="button" data-rent-review="${esc(a.id)}" ${a.status==='submitted'?'':'disabled'}>Mark Under Review</button><button type="button" data-rent-reject="${esc(a.id)}" ${['submitted','under_review','needs_information'].includes(a.status)?'':'disabled'}>Reject Application</button></div></article>`).join('') : '<p>No rent applications received.</p>';
  };
  list.addEventListener('click',async e=>{
    const photo=e.target.closest('[data-rent-photo]');
    if(photo){const path=photo.dataset.rentPhoto;if(!path)return;const {data,error}=await client.storage.from('rent-applicant-private').createSignedUrl(path,120);if(error){status.textContent=error.message;return;}window.open(data.signedUrl,'_blank','noopener');return;}
    const review=e.target.closest('[data-rent-review]');
    const reject=e.target.closest('[data-rent-reject]');
    if(!review&&!reject)return;
    const next=review?'under_review':'rejected';
    if(!window.confirm(`Set this rent application to ${next.replaceAll('_',' ')}?`))return;
    const id=review?.dataset.rentReview||reject?.dataset.rentReject;
    const {error}=await client.from('rent_installment_applications').update({status:next}).eq('id',id);
    if(error){status.textContent='Update failed: '+error.message;return;}
    await load();
  });
  document.getElementById('rentAdminRefresh').addEventListener('click',load);
  document.getElementById('rentHouseTypeAdmin').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
    const {error}=await client.from('rent_house_types').insert({code:String(fd.get('code')).trim(),label:String(fd.get('label')).trim()});
    status.textContent=error?'House type was not added: '+error.message:'House type added successfully.';
    if(!error)form.reset();
  });
  document.querySelector('[data-admin-view="wallet"]')?.addEventListener('click',load);
  load();
})();

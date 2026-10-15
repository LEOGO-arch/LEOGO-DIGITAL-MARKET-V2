(()=>{
'use strict';
const mount=()=>{
 const panel=document.querySelector('[data-admin-panel="reports"]');if(!panel||document.getElementById('customerSiteTraffic'))return;
 const box=document.createElement('section');box.id='customerSiteTraffic';box.className='content-card';box.style.cssText='padding:20px;margin:0 0 20px';
 box.innerHTML='<h3>Customer Website Traffic</h3><p>Daily storefront traffic, including browsers that did not register. Unique browsers are estimates, not exact people. Tracking starts after this feature is deployed.</p><form id="trafficDates" style="display:flex;flex-wrap:wrap;gap:10px;align-items:end"><label>From <input type="date" name="from" required></label><label>To <input type="date" name="to" required></label><button type="submit" class="primary-button">View Traffic</button></form><p id="trafficMessage" role="status"></p><div style="display:flex;flex-wrap:wrap;gap:20px;padding:10px 0"><strong id="trafficVisitors">Unique browsers: —</strong><strong id="trafficLoads">Page loads: —</strong></div><div class="responsive-table"><table><thead><tr><th>Day (Kenya)</th><th>Unique browsers</th><th>Page loads</th></tr></thead><tbody id="trafficRows"><tr><td colspan="3">Run report to view traffic.</td></tr></tbody></table></div>';
 const workspace=panel.querySelector('.report-workspace');(workspace||panel).before(box);
 const form=box.querySelector('#trafficDates'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'});
 form.elements.to.value=today;const d=new Date();d.setDate(d.getDate()-6);form.elements.from.value=d.toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'});
 form.addEventListener('submit',async e=>{
  e.preventDefault();const from=form.elements.from.value,to=form.elements.to.value,message=box.querySelector('#trafficMessage');
  if(!from||!to||to<from){message.textContent='Select a valid date range.';return;}
  const db=window.leogoAdminDb;if(!db){message.textContent='Admin connection unavailable.';return;}
  message.textContent='Loading traffic…';
  const {data,error}=await db.rpc('admin_customer_site_traffic',{p_from:from,p_to:to});
  if(error){message.textContent='Unable to load traffic. Verify report permissions and migration.';return;}
  const rows=Array.isArray(data)?data:[],sum=(key)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
  box.querySelector('#trafficVisitors').textContent='Daily unique-browser total: '+sum('unique_browsers').toLocaleString();
  box.querySelector('#trafficLoads').textContent='Page loads: '+sum('site_loads').toLocaleString();
  const tbody=box.querySelector('#trafficRows');tbody.replaceChildren();
  rows.forEach(item=>{const tr=document.createElement('tr');[item.visit_date,item.unique_browsers,item.site_loads].forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.append(td);});tbody.append(tr);});
  if(!rows.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="3">No recorded visits in this period.</td>';tbody.append(tr);}
  message.textContent='Showing '+rows.length+' recorded day(s).';
 });
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
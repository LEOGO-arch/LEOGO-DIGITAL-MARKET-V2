const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');
const admin=read('admin/admin.js');
const migration=read('supabase/migrations/20261006190245_admin_network_overview_extended.sql');
const html=read('admin/index.html');

new vm.Script(admin,{filename:'admin/admin.js'});
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const needle of [
  'admin_network_overview_extended',
  "'transport_providers'",
  "'cyber_providers'",
  "'health_medicine_providers'",
  "'leogo_riders'",
  "'property_listings'",
  "transport_provider_accounts where application_status='approved'",
  "cyber_provider_accounts where application_status='approved'",
  "health_medicine_accounts where application_status='approved'",
  "leogo_staff where status='active' and staff_role='rider'",
  "vacant_house_listings",
  "approval_status='approved' and availability_status='vacant'"
]) must(migration.includes(needle),'Missing extended network RPC behavior: '+needle);

for(const label of [
  'Transport Providers',
  'Cyber Providers',
  'Health & Medicine Providers',
  'LEOGO Riders',
  'Houses & Property'
]) must(admin.includes(label),'Missing Admin network card: '+label);

must(admin.includes("db.rpc('admin_network_overview_extended')"),'Dashboard must request the additive network RPC.');
must(admin.includes("data.network={...(data.network||{}),...extendedNetworkResult.data}"),'Extended network result must merge into the core dashboard safely.');
must(admin.includes("if(button.dataset.openView==='cyber')"),'Cyber network card must open the existing Cyber module.');
must(html.includes('admin.js?v=network-overview-v1'),'Admin network change must use a fresh Admin JS asset version.');

console.log('Admin extended network regression checks passed.');

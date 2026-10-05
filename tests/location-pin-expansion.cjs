const fs=require('node:fs');
const vm=require('node:vm');

const partner=fs.readFileSync('partner/partner.js','utf8');
const health=fs.readFileSync('partner/health.js','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const customerHtml=fs.readFileSync('index.html','utf8');
const assisted=fs.readFileSync('js/assisted-shopping.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261005210000_location_pin_expansion.sql','utf8');

new vm.Script(partner,{filename:'partner/partner.js'});
new vm.Script(health,{filename:'partner/health.js'});
new vm.Script(assisted,{filename:'js/assisted-shopping.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(partnerHtml.includes('id="pinHealthLocation"'),'Health & Medicine current-location pin button missing.');
must(partnerHtml.includes('id="healthPinStatus"'),'Health & Medicine pin status missing.');
must(health.includes('setHealthCoordinates'),'Health & Medicine coordinate setter missing.');
must(health.includes('navigator.geolocation.getCurrentPosition'),'Health & Medicine geolocation handler missing.');
must(health.includes("$('#healthMapLink')?.addEventListener('change'"),'Health pasted-map-link parsing missing.');

must(partnerHtml.includes('id="pinProviderLocation"'),'Service Provider current-location pin button missing.');
must(partnerHtml.includes('id="providerMapLink"'),'Service Provider map-link input missing.');
must(partnerHtml.includes('id="providerLatitude"')&&partnerHtml.includes('id="providerLongitude"'),'Service Provider coordinate inputs missing.');
must(partner.includes('setProviderCoordinates'),'Service Provider coordinate setter missing.');
must(partner.includes("submit_service_provider_application_v2"),'Service Provider registration must persist pin data through V2 RPC.');
must(partner.includes("service_provider_submit_profile_change_v2"),'Approved Service Provider edits must persist pin data through V2 profile-change RPC.');

must(customerHtml.includes('id="pinAssistedLocation"'),'Assisted Shopping current delivery pin button missing.');
must(assisted.includes("pinLocationButton?.addEventListener('click'"),'Assisted Shopping geolocation handler missing.');
must(assisted.includes("$('#assistedLocationLink').value='https://www.google.com/maps?q='"),'Assisted Shopping pin must populate the map-link field.');

must(migration.includes('add column if not exists shop_latitude numeric'),'Service Provider latitude column migration missing.');
must(migration.includes('add column if not exists shop_longitude numeric'),'Service Provider longitude column migration missing.');
must(migration.includes('add column if not exists shop_map_link text'),'Service Provider map-link column migration missing.');
must(migration.includes('service_provider_profile_pin_approval'),'Approved profile-change pin persistence trigger missing.');

console.log('Location pin expansion regression checks passed.');

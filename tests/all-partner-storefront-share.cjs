const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('js/app.js','utf8');
const health=fs.readFileSync('js/health.js','utf8');
const specialist=fs.readFileSync('js/health-specialist.js','utf8');
const accommodation=fs.readFileSync('js/accommodation.js','utf8');
const cyber=fs.readFileSync('js/cyber.js','utf8');
const premium=fs.readFileSync('js/premium.js','utf8');
const html=fs.readFileSync('index.html','utf8');

for(const [name,code] of [
  ['app.js',app],['health.js',health],['health-specialist.js',specialist],
  ['accommodation.js',accommodation],['cyber.js',cyber],['premium.js',premium]
]){
  assert.doesNotThrow(()=>new Function(code),name+' must parse');
}

assert.match(app,/data-partner-type="seller"/,'Seller product details must expose a share action');
assert.match(app,/data-partner-type="health_medicine"/,'Health product details must expose a share action');
assert.match(app,/data-partner-type="service_provider"/,'Service Provider cards must expose a share action');
assert.match(app,/data-partner-type="transport"/,'Transport cards/details must expose a share action');
assert.match(app,/getTarget\?\.\('seller'\)/,'Seller shared links must filter to the Seller storefront');
assert.match(app,/getTarget\?\.\('service_provider'\)/,'Service Provider shared links must filter to the provider services');
assert.match(app,/getTarget\?\.\('transport'\)/,'Transport shared links must filter to provider vehicles');

assert.match(health,/data-partner-type="health_medicine"/,'Health marketplace must expose Health Partner share actions');
assert.match(health,/getTarget\?\.\('health_medicine'\)/,'Health Partner shared links must filter Health products');
assert.match(specialist,/data-partner-type="health_specialist"/,'Health Specialist service cards must expose share actions');
assert.match(specialist,/getTarget\?\.\('health_specialist'\)/,'Health Specialist shared links must filter approved services');

assert.match(cyber,/data-partner-type="cyber"/,'Cyber storefront must expose share actions');
assert.match(cyber,/getTarget\?\.\('cyber'\)/,'Cyber shared links must open the selected Cyber storefront');

assert.match(accommodation,/\.select\('id,host_id,/,'Accommodation customer query must include host_id for partner-level sharing');
assert.match(accommodation,/getTarget\?\.\('accommodation'\)/,'Accommodation shared links must resolve partner storefronts');
assert.match(accommodation,/String\(property\.host_id\|\|''\) !== sharedAccommodationHostId/,'Accommodation shared links must filter all approved properties for that host');
assert.match(accommodation,/id:selectedProperty\.host_id\|\|selectedProperty\.id/,'Accommodation share must prefer the host id');

assert.match(premium,/data\.partnerType='premium_profile'/,'Verified Premium Profile cards must expose a share action');
assert.match(premium,/getTarget\?\.\('premium_profile'\)/,'Premium shared links must resolve the selected approved profile');
assert.match(premium,/Shared LEOGO Verified Premium Profile/,'Premium shared links must show a focused shared-profile view');

assert.match(html,/js\/app\.js\?v=all-partner-storefront-share-2/,'Customer app cache key must refresh');
assert.match(html,/js\/accommodation\.js\?v=all-partner-storefront-share-2/,'Accommodation cache key must refresh');
assert.match(html,/js\/premium\.js\?v=all-partner-storefront-share-2/,'Premium cache key must refresh');

console.log('All partner storefront share regression checks passed.');

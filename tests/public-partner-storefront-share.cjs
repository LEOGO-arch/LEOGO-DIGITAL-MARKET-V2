const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('js/app.js','utf8');
const cyber=fs.readFileSync('js/cyber.js','utf8');
const health=fs.readFileSync('js/health.js','utf8');
const specialist=fs.readFileSync('js/health-specialist.js','utf8');
const accommodation=fs.readFileSync('js/accommodation.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/style.css','utf8');

assert.match(app,/new URLSearchParams\(window\.location\.search\)/,'Shared links must read partner query parameters');
assert.match(app,/partner_type/,'Shared links must carry partner type');
assert.match(app,/partner_id/,'Shared links must carry partner id');
assert.match(app,/url\.search=''/,'Shared URLs must discard unrelated query parameters');
assert.match(app,/navigator\.share/,'Mobile native share must be supported');
assert.match(app,/navigator\.clipboard\.writeText/,'Desktop copy-link fallback must be supported');
assert.match(app,/data-share-partner/,'Customer page must handle partner share actions through one delegated handler');

assert.match(app,/data-partner-type="seller"/,'Seller product details must expose Share Seller');
assert.match(app,/getTarget\?\.\('seller'\)/,'Shared Seller link must open the existing Seller storefront');
assert.match(app,/selectedMarketplaceSellerId=String\(sellerShareTarget\.id\)/,'Shared Seller link must filter catalogue to the seller');

assert.match(app,/data-partner-type="service_provider"/,'Service Provider cards must expose Share Provider');
assert.match(app,/getTarget\?\.\('service_provider'\)/,'Shared Service Provider link must filter public services');
assert.match(app,/selectedPublicServiceProviderId=String\(serviceShareTarget\.id\)/,'Service Provider deep link must retain provider identity');

assert.match(app,/data-partner-type="transport"/,'Transport cards/details must expose Share Provider');
assert.match(app,/getTarget\?\.\('transport'\)/,'Shared Transport link must filter public vehicles');
assert.match(app,/selectedPublicTransportProviderId=String\(transportShareTarget\.id\)/,'Transport deep link must retain provider identity');

assert.match(cyber,/data-partner-type="cyber"/,'Cyber storefront must expose share actions');
assert.match(cyber,/getTarget\?\.\('cyber'\)/,'Shared Cyber link must open the Cyber shop');
assert.match(cyber,/openShop\(String\(match\.provider_id\)\)/,'Cyber deep link must open that shop catalogue');

assert.match(health,/data-partner-type="health_medicine"/,'Health partner/product cards must expose share actions');
assert.match(health,/getTarget\?\.\('health_medicine'\)/,'Shared Health link must filter by provider');
assert.match(health,/sharedProviderId=String\(target\.id\)/,'Health deep link must retain provider identity');

assert.match(specialist,/data-partner-type="health_specialist"/,'Health Specialist services must expose share actions');
assert.match(specialist,/getTarget\?\.\('health_specialist'\)/,'Shared Health Specialist link must filter services to that provider');
assert.match(specialist,/sharedProviderId=String\(target\.id\)/,'Health Specialist deep link must retain provider identity');

assert.match(html,/id="shareAccommodationProperty"/,'Accommodation details must expose Share Property');
assert.match(accommodation,/getTarget\?\.\('accommodation'\)/,'Shared Accommodation link must open the property profile');
assert.match(accommodation,/openProperty\(match\.id\)/,'Accommodation deep link must open rooms/details');
assert.match(accommodation,/leogoPartnerShare\?\.share/,'Accommodation Share button must use shared partner-link helper');

assert.doesNotMatch(app,/data-partner-type="premium"/,'Premium profiles must not be exposed through public partner sharing');
assert.doesNotMatch(cyber,/data-partner-type="premium"/,'Cyber module must not create Premium share links');
assert.doesNotMatch(health,/data-partner-type="premium"/,'Health module must not create Premium share links');
assert.doesNotMatch(specialist,/data-partner-type="premium"/,'Health Specialist module must not create Premium share links');

assert.match(css,/\.leogo-partner-share-button/,'Share controls must have customer-facing styles');
assert.match(css,/\.partner-share-filter-banner/,'Shared storefront filter must have visible context styling');

for(const key of [
  'css/style.css?v=partner-storefront-share-1',
  'js/app.js?v=partner-storefront-share-1',
  'js/accommodation.js?v=partner-storefront-share-1',
  'js/cyber.js?v=partner-storefront-share-1',
  'js/health.js?v=partner-storefront-share-1',
  'js/health-specialist.js?v=partner-storefront-share-1'
]){
  assert.ok(html.includes(key),'Missing customer cache key: '+key);
}

console.log('Public partner storefront sharing regression checks passed.');

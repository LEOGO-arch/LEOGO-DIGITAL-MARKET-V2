const fs=require('fs');
const assert=require('assert');

const health=fs.readFileSync('js/health.js','utf8');
const html=fs.readFileSync('index.html','utf8');

assert.doesNotThrow(()=>new Function(health),'health.js must parse');
assert.match(
  health,
  /\$\$\('\[data-health-add-cart\]',productGrid\)\.forEach/,
  'Health cart buttons must use the querySelectorAll helper'
);
assert.match(
  health,
  /\$\$\('\[data-health-enquiry\]',productGrid\)\.forEach/,
  'Health enquiry buttons must use the querySelectorAll helper'
);
assert.doesNotMatch(
  health,
  /\$\('\[data-health-(?:add-cart|enquiry)\]',productGrid\)\.forEach/,
  'Health product actions must not call forEach on a single element'
);
assert.match(
  health,
  /client\.rpc\('public_list_health_medicine'\)/,
  'Health marketplace must stay connected to the public Health catalogue RPC'
);
assert.match(
  html,
  /js\/health\.js\?v=health-marketplace-selector-fix-1/,
  'Health marketplace script cache key must be refreshed'
);

console.log('Health marketplace loading regression checks passed.');

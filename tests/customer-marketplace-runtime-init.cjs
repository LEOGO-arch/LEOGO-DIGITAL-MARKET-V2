const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('js/app.js','utf8');
const assisted = fs.readFileSync('js/assisted-shopping.js','utf8');
const html = fs.readFileSync('index.html','utf8');

assert.doesNotThrow(()=>new Function(app),'customer app must parse');
assert.doesNotThrow(()=>new Function(assisted),'assisted shopping must parse');

assert.ok(app.indexOf("let testCart = [];") < 1500,'cart state must initialize before customer events');
assert.strictEqual((app.match(/let testCart = \[\];/g)||[]).length,1,'cart state must have one declaration');
assert.ok(app.indexOf("let renderLppAccounts = () => {};") < 2000,'LPP renderer placeholder must be initialized early');
assert.match(app,/renderLppAccounts = \(\) => \{/,'full LPP renderer must be assigned later');
assert.doesNotMatch(app,/const renderLppAccounts = \(\) => \{/,'LPP renderer must not re-enter a TDZ');

assert.doesNotMatch(
  app,
  /document\.addEventListener\('leogo:authchange',\(\)=>\{ loadPublicServices\(\)\.catch/,
  'service loaders must not be referenced by an early auth listener'
);
assert.match(app,/client\.rpc\('customer_marketplace_catalogue'\)/,'marketplace catalogue RPC must remain connected');
assert.match(app,/window\.setTimeout\(loadMarketplaceProducts, 500\)/,'marketplace auto-load must remain enabled');

assert.match(
  assisted,
  /\$\$\('\[data-assisted-delivery-field\]',modal\)\.forEach/,
  'assisted shopping must iterate a node list rather than a single element'
);

assert.match(html,/js\/app\.js\?v=marketplace-runtime-init-1/,'app cache key must be refreshed');
assert.match(html,/js\/assisted-shopping\.js\?v=marketplace-runtime-init-1/,'assisted shopping cache key must be refreshed');

console.log('Customer marketplace runtime initialization regression checks passed.');

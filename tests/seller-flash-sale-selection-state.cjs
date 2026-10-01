const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('partner/partner.js', 'utf8');

new vm.Script(source, { filename: 'partner/partner.js' });

const productSet = "const selectedSellerProducts=new Set();";
const notificationSet = "const selectedSellerNotifications=new Set();";

if ((source.split(productSet).length - 1) !== 1) {
  throw new Error('selectedSellerProducts must be declared exactly once');
}
if ((source.split(notificationSet).length - 1) !== 1) {
  throw new Error('selectedSellerNotifications must be declared exactly once');
}

const firstProductUse = source.indexOf('selectedSellerProducts');
const firstNotificationUse = source.indexOf('selectedSellerNotifications');

if (firstProductUse !== source.indexOf(productSet) + 'const '.length) {
  throw new Error('selectedSellerProducts is used before its declaration');
}
if (firstNotificationUse !== source.indexOf(notificationSet) + 'const '.length) {
  throw new Error('selectedSellerNotifications is used before its declaration');
}

if (!source.includes("await loadProducts();")) {
  throw new Error('Seller Flash Sale refresh path is missing');
}

console.log('seller Flash Sale selection-state regression checks passed');

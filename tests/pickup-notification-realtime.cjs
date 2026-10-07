const fs=require('fs');
const assert=require('assert');

const pickup=fs.readFileSync('pickup/pickup.js','utf8');
const html=fs.readFileSync('pickup/index.html','utf8');

assert.match(pickup,/table:'partner_notifications'/,'Pickup Station must listen to partner notifications');
assert.match(pickup,/filter:'user_id=eq\.'\+currentUser\.id/,'Pickup Station notifications must be scoped to the signed-in user');
assert.match(pickup,/event:'INSERT'/,'Pickup Station must react to new notifications');
assert.match(pickup,/event:'UPDATE'/,'Pickup Station must react to notification updates');
assert.match(pickup,/partner_type\|\|'\'\)==='pickup_station'/,'Pickup Station must ignore other partner notification types');
assert.match(pickup,/queuePickupNotificationRefresh/,'Pickup Station notification refresh must be debounced');
assert.match(pickup,/loadAll\(\)\.catch/,'Pickup Station notification must refresh existing portal loaders');
assert.match(pickup,/30000/,'Existing 30-second fallback refresh must remain');
assert.match(html,/pickup\.js\?v=notification-realtime-1/,'Pickup Station script cache key must be refreshed');

console.log('Pickup Station realtime notification refresh checks passed.');

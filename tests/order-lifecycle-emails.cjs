const fs=require('fs');
const assert=require('assert');

const edge=fs.readFileSync('supabase/functions/send-order-email/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261007225500_marketplace_order_lifecycle_emails.sql','utf8');
const admin=fs.readFileSync('admin/email-notifications.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

assert.match(edge,/kind === "order_created"/,'Order-created email template must exist');
assert.match(edge,/kind === "order_shipped"/,'Order-shipped email template must exist');
assert.match(edge,/kind === "order_delivered"/,'Order-delivered email template must exist');
assert.match(edge,/will be shipped as soon as possible/i,'Order-created email must tell the customer it will ship soon');
assert.match(edge,/shipped \/ dispatched/i,'Shipped email must use the actual dispatch stage');
assert.match(edge,/delivered successfully/i,'Delivered email must confirm delivery');

assert.match(migration,/p_event_key='order_created'/,'Lifecycle queue must support order_created');
assert.match(migration,/p_event_key='order_shipped'/,'Lifecycle queue must support order_shipped');
assert.match(migration,/p_event_key='order_delivered'/,'Lifecycle queue must support order_delivered');
assert.match(migration,/after insert on public\.marketplace_orders/i,'Order creation must queue from the canonical order insert');
assert.match(migration,/new\.status='on_the_way'/,'Shipping email must queue only at actual Rider dispatch');
assert.match(migration,/new\.order_status='delivered'/,'Delivery email must queue from canonical delivered status');
assert.match(migration,/on conflict \(order_id,event_key\)[\s\S]*do nothing/i,'Lifecycle emails must be idempotent per order/event');
assert.match(migration,/Email infrastructure must never block order creation or lifecycle updates/i,'Email failure must not block order operations');
assert.match(migration,/revoke all on function private\.enqueue_marketplace_order_lifecycle_email/i,'Lifecycle queue helper must not be client-executable');

assert.match(admin,/Order-created, shipped, delivered/i,'Admin settings status must describe the three lifecycle emails');
assert.match(html,/Order created[\s\S]*Order shipped[\s\S]*Order delivered/i,'Admin settings must show the three lifecycle stages');
assert.match(html,/email-notifications\.js\?v=order-lifecycle-emails-1/,'Admin email script cache key must be refreshed');

console.log('Marketplace order lifecycle email regression checks passed.');

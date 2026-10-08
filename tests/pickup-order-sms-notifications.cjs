const fs = require('fs');
const assert = require('assert');

const worker = fs.readFileSync('supabase/functions/send-order-sms/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261007174500_pickup_order_sms_notifications.sql', 'utf8');
const hardening = fs.readFileSync('supabase/migrations/20261007175500_harden_pickup_order_sms_internal_functions.sql', 'utf8');
const arrivalOnly = fs.readFileSync('supabase/migrations/20261007180500_pickup_sms_arrival_only.sql', 'utf8');

assert.match(worker, /bulksms\.afrinettelecom\.co\.ke\/api\/services\/sendsms\//, 'worker must use Afrinet-issued production endpoint');
assert.match(worker, /AFRINET_PARTNER_ID/, 'worker must use server-side Partner ID secret');
assert.match(worker, /AFRINET_API_KEY/, 'worker must use server-side API key secret');
assert.match(worker, /AFRINET_SENDER_ID/, 'worker must use server-side sender ID secret');
assert.match(worker, /order_sms_outbox/, 'worker must send only queued SMS jobs');
assert.match(worker, /delivery_token/, 'worker must require per-job token');

assert.match(migration, /create table if not exists public\.order_sms_outbox/, 'SMS outbox must exist');
assert.match(migration, /pickup_station_arrived/, 'arrival SMS event must be queued');
assert.match(migration, /delivered_to_pickup_station/, 'rider arrival transition must trigger SMS');
assert.match(migration, /on conflict \(order_id,event_key\).*do nothing/s, 'duplicate order SMS events must be prevented');
assert.match(migration, /SMS transport must never interrupt order or Pickup Station operations/, 'SMS failure must not block locked order workflow');
assert.match(migration, /leogo-order-sms-retry/, 'failed SMS jobs must have retry processing');

assert.match(hardening, /revoke all on function private\.dispatch_order_sms_job/, 'internal dispatch helper must not be callable by app users');
assert.match(hardening, /revoke all on function private\.enqueue_pickup_order_sms/, 'internal enqueue helper must not be callable by app users');
assert.match(arrivalOnly, /drop trigger if exists pickup_station_sms_ready_for_pickup/, 'ready-for-pickup SMS trigger must be disabled');
assert.match(arrivalOnly, /if p_event_key <> 'pickup_station_arrived' then/, 'SMS enqueue helper must refuse non-arrival events');
assert.doesNotMatch(arrivalOnly, /pickup_station_ready/, 'arrival-only policy must not enqueue ready-for-pickup SMS');

console.log('Pickup order SMS notification regression checks passed.');


const dispatchFix = fs.readFileSync('supabase/migrations/20261008040500_pickup_sms_dispatch_shipping_contact.sql', 'utf8');

assert.match(dispatchFix, /grant select, update on table public\.order_sms_outbox to service_role/i, 'SMS worker service role must be able to read/update queued jobs');
assert.match(dispatchFix, /revoke all on table public\.order_sms_outbox from anon, authenticated/i, 'Customer/partner clients must remain blocked from the SMS outbox');
assert.match(dispatchFix, /v_order\.contact_number/, 'Pickup SMS must use the shipping contact captured on the order');
assert.doesNotMatch(dispatchFix, /customer_profiles|raw_user_meta_data|auth\.users/i, 'Pickup SMS must not fall back to profile/Auth phone numbers');
assert.match(dispatchFix, /Check your LEOGO order updates for collection status\./, 'Arrival SMS must avoid stale ready-for-pickup wording');

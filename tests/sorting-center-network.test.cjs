const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const schema = read('supabase/migrations/20261105152322_sorting_center_network.sql');
const operations = read('supabase/migrations/20261105153630_sorting_center_operations_views.sql');
const routes = read('supabase/migrations/20261105154206_sorting_center_route_options.sql');
const seller = read('supabase/migrations/20261105154542_sorting_center_seller_notifications.sql');
const staff = read('sorting/sorting.js');
const admin = read('admin/sorting-centers.js');
const partner = read('partner/sorting-center-booking.js');
const tracking = read('js/app.js');

assert.match(schema, /alter table public\.sorting_parcels enable row level security/i);
assert.match(schema, /revoke all on public\.sorting_centers[\s\S]+from public,anon,authenticated/i);
assert.match(schema, /sorting_shipment_parcels_one_active_per_parcel[\s\S]+where is_active/i);
assert.match(schema, /a\.center_id=p_center_id[\s\S]+a\.is_active/i);
assert.match(schema, /seller_book_order_to_sorting_center/);
assert.match(schema, /p_action='receive'[\s\S]+seller_handed_over/i);
assert.match(schema, /v_sh\.verified_by is null or v_sh\.verified_by=v_uid/i);
assert.match(schema, /p_received_parcel_ids uuid\[\]/);
assert.match(schema, /select p\.id,v_sh\.id,v_center_id,'missing'/i);
assert.match(routes, /sorting_staff_route_options/);
assert.match(operations, /admin_sorting_center_operations/);
assert.match(operations, /customer_notifications/);
assert.match(seller, /sorting_center_notifications/);
assert.match(seller, /seller_list_sorting_parcels/);
assert.match(staff, /sorting_staff_update_shipment/);
assert.match(staff, /BarcodeDetector/);
assert.match(admin, /admin_sorting_center_assign_staff/);
assert.match(partner, /seller_book_order_to_sorting_center/);
assert.match(partner, /seller_confirm_sorting_center_handover/);
assert.match(tracking, /customer_list_sorting_order_tracking/);
assert.match(tracking, /customerOrderEstimatedDate/);

// Sorting remains additive: no checkout, payment, fee or settlement call is
// changed by the sorting-center migrations.
for (const migration of [schema, operations, seller]) {
  assert.doesNotMatch(migration, /update public\.(marketplace_orders|seller_settlement|payment_transactions)\s+set\s+(grand_total|delivery_fee|seller_payout|amount)/i);
}

console.log('Sorting center network source contracts passed.');

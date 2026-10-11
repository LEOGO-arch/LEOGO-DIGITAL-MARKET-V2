const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('admin/index.html','utf8');
const js=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261011194000_admin_pickup_station_parcel_register.sql','utf8');

new vm.Script(js,{filename:'admin/admin.js'});

for(const id of [
  'pickupParcelReportTitle','pickupParcelStationFilter','pickupParcelStatusFilter',
  'pickupParcelSearch','pickupParcelFrom','pickupParcelTo','pickupParcelReportBody',
  'pickupParcelCountReceive','pickupParcelCountHandover','pickupParcelCountHanded',
  'refreshPickupParcelReport','exportPickupParcelReport'
]){
  assert.ok(html.includes('id="'+id+'"'),'Admin Pickup report UI needs '+id);
}
for(const status of ['arrived_pending_receipt','received','handed_over']){
  assert.ok(html.includes('value="'+status+'"'),'status filter should include '+status);
  assert.ok(js.includes("parcel_status==='"),'report status counts should be driven by parcel status');
}
assert.ok(js.includes("admin_list_pickup_station_parcels"),'Admin should load the complete Pickup parcel register');
assert.ok(js.includes('p_before_booked_at:before?.booked_at||null'),'report loader should continue with a stable keyset cursor');
assert.ok(js.includes('rows.push(...batch)'),'report loader should fetch every page, not just the first page');
assert.ok(js.includes("new Blob([csv],{type:'text/csv;charset=utf-8;'})"),'Admin can export all filtered records as CSV');
assert.ok(js.includes('rows.map(row=>columns.map(([key])=>csvCell'),'export should include every filtered record, beyond the current UI page');
assert.ok(js.includes("row.handover_photo_captured?'captured':'missing'"),'parcel register should show handover evidence availability');
assert.ok(js.includes('days_waiting_to_receive')&&js.includes('days_to_handover'),'report should expose aging for receive and handover steps');
assert.ok(js.includes('state.pickupStationParcelPage'),'report should paginate large result sets in the UI');
assert.ok(html.includes('admin.js?v=pickup-parcel-report-1'),'Admin script cache should refresh');

for(const required of [
  "private.is_leogo_admin('delivery.manage')",
  "private.is_leogo_admin('orders.read')",
  "set search_path=''",
  "p_before_booked_at is null",
  "(p.booked_at,p.id)<(p_before_booked_at,p_before_id)",
  "revoke all on function public.admin_list_pickup_station_parcels",
  "grant execute on function public.admin_list_pickup_station_parcels",
  "receive_photo_path is not null",
  "handover_photo_path is not null",
  "p.arrived_at-p.booked_at",
  "p.received_at-p.arrived_at",
  "p.handed_over_at-p.received_at"
]){
  assert.ok(migration.includes(required),'Parcel report RPC should include '+required);
}
assert.ok(!migration.includes('handover_customer_id_number'),'report must not return the customer ID number');
assert.ok(!migration.includes('receive_photo_path text'),'report must not expose private photo storage paths');

console.log('Admin Pickup Station parcel report checks passed.');

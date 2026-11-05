const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261105173000_sorting_center_rider_pickup_station_bridge.sql'),'utf8');
const rider=fs.readFileSync(path.join(root,'staff/staff.js'),'utf8');
const customer=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const staging=fs.readFileSync(path.join(__dirname,'sorting-center-lastmile-staging.sql'),'utf8');
for(const text of [
  'sorting_delivery_job_custody_bridge',
  'sorting_pickup_station_custody_bridge',
  'All Sorting Center parcels for this order must be ready for last-mile handover',
  'Pickup Station staff confirmed physical receipt with photo evidence.',
  'Rider confirmed physical receipt from the final sorting center.',
  'rider_list_sorting_center_pickups'
]) if(!migration.includes(text)) throw new Error(`Bridge database contract missing: ${text}`);
if(!rider.includes("client.rpc('rider_list_sorting_center_pickups')")||!rider.includes('SORTING CENTER ·')) throw new Error('Rider portal does not show Sorting Center handover details');
if(!customer.includes('pickup_station_received')||!customer.includes('pickup_station_arrived')) throw new Error('Customer timeline does not show Pickup Station custody events');
if(!staging.includes("'delivered_to_pickup_station'")||!staging.includes('Staging center handover')) throw new Error('Staging test does not cover the Rider/Pickup Station leg');
console.log('Sorting Center, Rider, and Pickup Station bridge contracts passed.');

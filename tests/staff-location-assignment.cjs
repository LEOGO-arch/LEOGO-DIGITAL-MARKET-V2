const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('admin/index.html','utf8');
const js=fs.readFileSync('admin/admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-create-staff/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261007204000_staff_location_assignment.sql','utf8');

assert.match(html,/id="staffCounty"[^>]*required/,'Create Staff must require County');
assert.match(html,/id="staffSubCounty"[^>]*required/,'Create Staff must require Sub-County');
assert.match(html,/id="staffEditorCounty"[^>]*required/,'Staff editor must require County');
assert.match(html,/id="staffEditorSubCounty"[^>]*required/,'Staff editor must require Sub-County');
assert.match(html,/admin\.js\?v=staff-location-assignment-1/,'Admin cache key must be updated');

assert.match(js,/kenya_counties/,'Staff Management must load canonical Kenya counties');
assert.match(js,/kenya_subcounties/,'Staff Management must load canonical Kenya sub-counties');
assert.match(js,/county_code:\$\('#staffCounty'\)/,'Create Staff payload must include County code');
assert.match(js,/sub_county_code:\$\('#staffSubCounty'\)/,'Create Staff payload must include Sub-County code');
assert.match(js,/admin_update_staff_access_v2/,'Staff editor must use location-aware update RPC');
assert.match(js,/admin_list_riders_v2/,'Rider list must include operating location');
assert.match(js,/LOCAL MATCH/,'Local rider recommendation label must be present');
assert.match(js,/prioritizeRidersForLocation/,'Rider assignment must prioritise location matches');
assert.match(js,/staff\.county,staff\.sub_county/,'Staff directory search must include location');

assert.match(edge,/kenya_counties/,'Secure staff creation must validate County server-side');
assert.match(edge,/kenya_subcounties/,'Secure staff creation must validate Sub-County server-side');
assert.match(edge,/county_code: countyCode/,'Secure staff creation must persist County');
assert.match(edge,/sub_county_code: subCountyCode/,'Secure staff creation must persist Sub-County');

assert.match(migration,/add column if not exists county_code text/,'Migration must add County code columns');
assert.match(migration,/add column if not exists sub_county_code text/,'Migration must add Sub-County code columns');
assert.match(migration,/admin_list_riders_v2/,'Migration must expose location-aware Rider list');
assert.match(migration,/admin_update_staff_access_v2/,'Migration must expose location-aware Staff editor RPC');
assert.match(migration,/revoke all on function public\.admin_update_staff_access_v2[^;]*from public, anon/i,'New privileged RPC must not be executable anonymously');

console.log('Staff County/Sub-County assignment checks passed.');

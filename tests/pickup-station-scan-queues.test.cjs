const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pickup', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'pickup', 'pickup.js'), 'utf8');

assert.equal(html.split('class="metric-link').length - 1, 8, 'all eight dashboard metrics should open a destination');
assert.ok(html.includes('data-metric-view="parcels" data-metric-filter="arrived_pending_receipt"'), 'pending arrival card should open its queue');
assert.ok(html.includes('data-metric-view="parcels" data-metric-filter="received"'), 'pending handover card should open its queue');
assert.ok(html.includes('data-metric-view="history" data-metric-range="today"'), 'today metrics should open daily history');
assert.ok(html.includes('data-metric-view="earnings"'), 'earnings metrics should open the earnings view');
assert.ok(js.includes('>Arrive</button>'), 'pending arrival rows need an Arrive shortcut');
assert.ok(js.includes('>Hand Over</button>'), 'pending handover rows need a Hand Over shortcut');
assert.ok(html.includes('type="submit">Arrive Parcel</button>'), 'arrival form needs an explicit Arrive action');

assert.ok(js.includes("$$('[data-metric-view]').forEach"), 'metric cards need click handlers');
assert.ok(js.includes("$('#parcelStatusFilter').value=button.dataset.metricFilter"), 'parcel metrics should set their status filter');
assert.ok(js.includes("const openParcelAction=(mode,reference)=>"), 'queue actions should route into the operation form');
assert.ok(js.includes("$(receive?'#receivePhoto':'#handoverIdNumber')"), 'arrival and handover shortcuts should focus their next required step');
assert.ok(js.includes("openParcelAction('receive',b.dataset.receive)"), 'Arrive action should open arrival workflow');
assert.ok(js.includes("openParcelAction('handover',b.dataset.handover)"), 'Hand Over action should open collection workflow');

const finishScan = js.slice(js.indexOf('const finishQrScan='), js.indexOf('const scanLoop='));
assert.ok(finishScan.indexOf('input.value=code') < finishScan.indexOf('await client.rpc'), 'decoded order reference must populate before parcel lookup');
assert.ok(js.includes('Math.min(2,2048/sw)'), 'small QR codes should be upscaled for decoding');
assert.ok(js.includes('QR could not be read. Enter the order / waybill number below'), 'failed scans should close the modal and expose manual entry');
assert.ok(js.includes("'pickup_partner_receive_parcel'") && js.includes("'pickup_partner_handover_parcel'"), 'existing arrival and handover RPCs should remain intact');

console.log('Pickup station scan and queue navigation checks passed.');

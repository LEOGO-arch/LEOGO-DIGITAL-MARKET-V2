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
assert.ok(js.includes('width:{ideal:4096}')&&js.includes('height:{ideal:2160}'), 'camera request should prefer the highest common video resolution');
assert.ok(js.includes('width:{exact:maxWidth},height:{exact:maxHeight}'), 'camera should first request the device-reported maximum dimensions exactly');
assert.ok(js.includes('width:{ideal:maxWidth},height:{ideal:maxHeight}'), 'camera should fall back to the device-reported maximum dimensions when exact pairing is unsupported');
const jsQrDecoder=js.slice(js.indexOf('const decodeQrWithJsQr='),js.indexOf('const finishQrScan='));
assert.ok(jsQrDecoder.includes('const width=Number(video.videoWidth||0)')&&jsQrDecoder.includes('const height=Number(video.videoHeight||0)'), 'fallback decoder should use the actual camera frame dimensions');
assert.ok(jsQrDecoder.includes('drawImage(video,0,0,width,height)'), 'fallback decoder should draw the source frame without resizing');
assert.ok(!jsQrDecoder.includes('Math.min(2,2048/sw)')&&!jsQrDecoder.includes('const crops='), 'fallback decoder must not upscale or crop the camera frame');
assert.ok(js.includes('QR could not be read. Enter the order / waybill number below'), 'failed scans should close the modal and expose manual entry');
assert.ok(js.includes("'pickup_partner_receive_parcel'") && js.includes("'pickup_partner_handover_parcel'"), 'existing arrival and handover RPCs should remain intact');

assert.ok(js.includes('const reportScannerIssue='), 'scanner failures should reach System Diagnosis runtime monitoring');
for (const operation of [
  'pickup_qr_scan.start',
  'pickup_qr_scan.decode',
  'pickup_qr_scan.no_result',
  'pickup_qr_scan.parcel_lookup'
]) {
  assert.ok(js.includes(operation), 'scanner telemetry should identify '+operation);
}
assert.ok(js.includes("module:'transport'") && js.includes("errorType:'js_error'"), 'scanner telemetry should use the existing runtime monitor contract');
assert.ok(js.includes('elapsed>60000&&!scannerNoResultReported'), 'a scan without a decoded QR should report once after 60 seconds');
assert.ok(html.includes('pickup.js?v=native-camera-resolution-1'), 'camera resolution script cache version should be refreshed');
const scannerTelemetryCalls=[...js.matchAll(/reportScannerIssue\(([\s\S]*?)\);/g)].map((match)=>match[1]);
assert.ok(scannerTelemetryCalls.length>=4, 'scanner startup, decode, no-result and lookup paths should report');
for(const call of scannerTelemetryCalls) {
  assert.ok(!/\b(?:rawValue|order_reference|receiveCode|handoverCode)\b/.test(call), 'scanner telemetry must not include QR/order identifiers');
}

console.log('Pickup station scan and queue navigation checks passed.');

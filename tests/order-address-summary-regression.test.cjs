const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('admin/admin.css','utf8');

new vm.Script(admin,{filename:'admin/admin.js'});

for(const marker of [
  'id="orderSummaryType"',
  '<option value="detailed" selected>Detailed Order Summary</option>',
  '<option value="address">Address / Delivery Summary</option>',
  'id="orderSummaryPaperSize"',
  '80 mm Thermal — Auto Length',
  '<option value="a6">A6</option>',
  'admin.js?v=order-address-summary-v1'
]){
  if(!html.includes(marker))throw new Error('Order summary selector missing: '+marker);
}

if(!css.includes('.order-summary-type-select'))throw new Error('Summary type selector styling missing');

const canvasStart=admin.indexOf('const buildOrderAddressSummaryCanvas = async (detail) =>');
const thermalStart=admin.indexOf('const buildOrderAddressThermalReceiptHtml = async (detail) =>');
const downloadStart=admin.indexOf('const downloadOrderDeliverySummary = async () =>',thermalStart);
const detailedThermalStart=admin.indexOf('const buildOrderThermalReceiptHtml = async (detail) =>',downloadStart);
const printStart=admin.indexOf('const printOrderDeliverySummary = async () =>',detailedThermalStart);
const renderStart=admin.indexOf('const renderMarketplaceOrderDetail=()=>',printStart);

if([canvasStart,thermalStart,downloadStart,detailedThermalStart,printStart,renderStart].some((value)=>value<0)){
  throw new Error('Address-summary renderer or print route missing');
}

const addressCanvas=admin.slice(canvasStart,thermalStart);
const addressThermal=admin.slice(thermalStart,downloadStart);
const download=admin.slice(downloadStart,detailedThermalStart);
const print=admin.slice(printStart,renderStart);

for(const marker of [
  'ADDRESS / DELIVERY SUMMARY',
  'Privacy label — order items intentionally hidden.',
  'ORDER NUMBER',
  'ORDER DATE',
  'DELIVER TO',
  'order.receiver_name',
  'order.contact_number',
  'orderDeliveryAddress(order)',
  'orderSummaryPaymentDisplay(order)',
  'payment.amount',
  'payment.secondary',
  'SCAN ORDER',
  'Authorized LEOGO address summary'
]){
  if(!addressCanvas.includes(marker))throw new Error('A6 address summary missing: '+marker);
}

for(const marker of [
  'ADDRESS / DELIVERY SUMMARY',
  'Private label — order items hidden',
  'ORDER NO.',
  'Order date',
  'DELIVER TO',
  'order.receiver_name',
  'order.contact_number',
  'orderDeliveryAddress(order)',
  'payment.primary',
  'payment.amount',
  'payment.secondary',
  'SCAN ORDER',
  'Authorized LEOGO address summary.',
  'Order item details intentionally excluded.',
  'Math.min(120,Math.ceil(renderedMm+2))'
]){
  if(!addressThermal.includes(marker))throw new Error('Thermal address summary missing: '+marker);
}

for(const forbidden of ['ORDER ITEMS','items.map((item)=>','sellerNames','RIDER UPDATE','SELLER(S)']){
  if(addressThermal.includes(forbidden))throw new Error('Privacy address summary exposes detailed fulfilment/item data: '+forbidden);
  if(addressCanvas.includes(forbidden))throw new Error('A6 privacy address summary exposes detailed fulfilment/item data: '+forbidden);
}

if(!download.includes("const summaryType=$('#orderSummaryType')?.value==='address'?'address':'detailed'")||
   !download.includes('buildOrderAddressSummaryCanvas(detail)')||
   !download.includes('buildOrderDeliverySummaryCanvas(detail)')||
   !download.includes("'-address-summary.png'")||
   !download.includes("'-order-summary.png'")){
  throw new Error('Download action does not respect Detailed vs Address summary selection');
}

if(!print.includes("const summaryType=$('#orderSummaryType')?.value==='address'?'address':'detailed'")||
   !print.includes('buildOrderAddressThermalReceiptHtml(detail)')||
   !print.includes('buildOrderThermalReceiptHtml(detail)')||
   !print.includes('buildOrderAddressSummaryCanvas(detail)')||
   !print.includes('buildOrderDeliverySummaryCanvas(detail)')||
   !print.includes('@page{size:A6 portrait;margin:0}')){
  throw new Error('Print action does not support both summary types on 80mm and A6');
}

for(const marker of [
  "primary:'CASH ON DELIVERY'",
  "primary:'PAID ON DELIVERY'",
  "primary:'PREPAID / PAID'",
  "primary:'PREPAID — AWAITING VERIFICATION'",
  "secondary:method"
]){
  if(!admin.includes(marker))throw new Error('Payment privacy label missing: '+marker);
}

if(!admin.includes("download.textContent=address?'⬇ Download Address Summary + QR':'⬇ Download Detailed Summary + QR'")||
   !admin.includes("print.textContent=address?'🖨 Print Address Summary':'🖨 Print Detailed Summary'")){
  throw new Error('Selected summary action labels do not update');
}

console.log('order address/privacy summary regression checks passed');

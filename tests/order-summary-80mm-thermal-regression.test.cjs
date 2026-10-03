const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

new vm.Script(admin,{filename:'admin/admin.js'});

if(!html.includes('<option value="80mm" selected>80 mm Thermal — Auto Length</option>')||
   !html.includes('<option value="a6">A6</option>')){
  throw new Error('80mm thermal must remain the default while A6 remains available');
}
if(!html.includes('admin.js?v=xprinter-80mm-compact-4')){
  throw new Error('120mm-target Xprinter thermal receipt cache version missing');
}

const thermalStart=admin.indexOf('const buildOrderThermalReceiptHtml = async (detail) =>');
const printStart=admin.indexOf('const printOrderDeliverySummary = async () =>',thermalStart);
if(thermalStart<0||printStart<0)throw new Error('Dedicated thermal receipt renderer missing');
const thermal=admin.slice(thermalStart,printStart);

for(const required of [
  "width:80mm;min-width:80mm;max-width:80mm",
  ".receipt{width:72mm",
  "font-size:9.6pt",
  "font-size:9pt",
  "font-size:6.95pt",
  "width:18mm;height:18mm",
  "receipt-logo",
  "leogo-official-logo.jpg",
  "single-item",
  "tight-single",
  "data-item-count",
  "itemCount<=1&&heightMm>118",
  "width:16.5mm;height:16.5mm",
  "receipt-bottom",
  "getBoundingClientRect().height",
  'pageStyle.textContent="@page{size:80mm "+heightMm+"mm;margin:0}"',
  "SCAN ORDER"
]){
  if(!thermal.includes(required))throw new Error('Compact thermal receipt feature missing: '+required);
}

if(thermal.includes('slice(0,7)')){
  throw new Error('80mm thermal receipt must not truncate the order item list');
}
if(thermal.includes('80mm 113mm')||thermal.includes('height:113mm')||thermal.includes('height:120mm')){
  throw new Error('80mm thermal receipt must remain auto-length rather than fixed-height');
}
if(!thermal.includes('items.map((item)=>')){
  throw new Error('80mm thermal receipt must render every order item');
}
if(!thermal.includes("const receiptClass=items.length<=1?'receipt single-item':'receipt'")){
  throw new Error('Single-item thermal receipt profile missing');
}
if(!thermal.includes("if(itemCount<=1&&heightMm>118){receipt.classList.add(\"tight-single\")")){
  throw new Error('Measured single-item tightening pass missing');
}
if(!thermal.includes("Math.max(36,Math.ceil(measure()+1))")){
  throw new Error('Compact auto-length bottom allowance missing');
}

const printEnd=admin.indexOf('const renderMarketplaceOrderDetail=()=>',printStart);
const print=admin.slice(printStart,printEnd);
if(!print.includes("if(paperSize==='80mm')")||
   !print.includes('buildOrderThermalReceiptHtml(detail)')){
  throw new Error('80mm print route is not using the dedicated thermal renderer');
}
if(!print.includes('Single-item orders target about 120 mm')){
  throw new Error('Admin print confirmation should describe the 120mm single-item target');
}
if(!print.includes('buildOrderDeliverySummaryCanvas(detail)')||
   !print.includes('@page{size:A6 portrait;margin:0}')){
  throw new Error('Existing A6 canvas print path was not preserved');
}
if(!admin.includes('const downloadOrderDeliverySummary = async () =>')||
   !admin.includes("link.download=(detail.order.order_reference||'LEOGO-order')+'-order-summary.png'")){
  throw new Error('Existing order-summary download path was disturbed');
}

console.log('compact 80mm 120mm-target thermal order summary regression checks passed');

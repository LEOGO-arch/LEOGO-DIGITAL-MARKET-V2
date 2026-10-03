const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

new vm.Script(admin,{filename:'admin/admin.js'});

if(!html.includes('<option value="80mm" selected>80 mm Thermal — Auto Length</option>')||
   !html.includes('<option value="a6">A6</option>')){
  throw new Error('80mm thermal must be the default while A6 remains available');
}
if(!html.includes('admin.js?v=xprinter-80mm-compact-3')){
  throw new Error('Xprinter thermal receipt cache version missing');
}

const thermalStart=admin.indexOf('const buildOrderThermalReceiptHtml = async (detail) =>');
const printStart=admin.indexOf('const printOrderDeliverySummary = async () =>',thermalStart);
if(thermalStart<0||printStart<0)throw new Error('Dedicated thermal receipt renderer missing');
const thermal=admin.slice(thermalStart,printStart);

for(const required of [
  "width:80mm;min-width:80mm;max-width:80mm",
  ".receipt{width:72mm",
  "font-size:10.2pt",
  "font-size:9.4pt",
  "receipt-items",
  "receipt-money-row receipt-total",
  "width:19mm;height:19mm",
  "font-size:7.2pt",
  "receipt-logo",
  "leogo-official-logo.jpg",
  "SCAN ORDER",
  "getBoundingClientRect().height",
  "requestAnimationFrame(function(){requestAnimationFrame",
  'pageStyle.textContent="@page{size:80mm "+heightMm+"mm;margin:0}"'
]){
  if(!thermal.includes(required))throw new Error('Thermal receipt feature missing: '+required);
}


if(!thermal.includes('padding:1mm 0 1.4mm')||
   !thermal.includes('margin:.8mm 0')||
   !thermal.includes('width:19mm;height:19mm')){
  throw new Error('80mm receipt fixed sections are not compact enough for short orders');
}
if(!thermal.includes("const logoUrl=new URL('../assets/images/leogo-official-logo.jpg',window.location.href).href")){
  throw new Error('Compact 80mm receipt must keep the LEOGO logo in the header corner');
}
if(!thermal.includes('Math.ceil(heightPx/pxPerMm+2)')){
  throw new Error('Thermal auto-length should use compact bottom allowance');
}

if(thermal.includes('slice(0,7)')){
  throw new Error('80mm thermal receipt must not truncate the order item list');
}
if(thermal.includes('80mm 113mm')||thermal.includes('height:113mm')){
  throw new Error('80mm thermal receipt must not use the old fixed 113mm page height');
}
if(!thermal.includes('items.map((item)=>')){
  throw new Error('80mm thermal receipt must render every order item');
}

const printEnd=admin.indexOf('const renderMarketplaceOrderDetail=()=>',printStart);
const print=admin.slice(printStart,printEnd);
if(!print.includes("if(paperSize==='80mm')")||
   !print.includes('buildOrderThermalReceiptHtml(detail)')){
  throw new Error('80mm print route is not using the dedicated thermal renderer');
}
if(!print.includes('buildOrderDeliverySummaryCanvas(detail)')||
   !print.includes('@page{size:A6 portrait;margin:0}')){
  throw new Error('Existing A6 canvas print path was not preserved');
}
if(!admin.includes('const downloadOrderDeliverySummary = async () =>')||
   !admin.includes("link.download=(detail.order.order_reference||'LEOGO-order')+'-order-summary.png'")){
  throw new Error('Existing order-summary download path was disturbed');
}

console.log('80mm thermal order summary regression checks passed');

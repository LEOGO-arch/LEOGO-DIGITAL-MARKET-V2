const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.env.LEOGO_SOURCE_ROOT||path.resolve(__dirname,'..');

function element(value=''){
  const classes=new Set(),events={};
  return {
    value,checked:false,required:false,disabled:false,hidden:false,innerHTML:'',textContent:'',dataset:{},events,
    classList:{
      add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
      toggle:(x,on)=>on?classes.add(x):classes.delete(x)
    },
    addEventListener:(name,fn)=>events[name]=fn
  };
}

function moduleScope(file,names,nodes={},collections={}){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const context={
    window:{
      supabase:{createClient:()=>({rpc:async()=>({data:[]}),auth:{getUser:async()=>({data:{user:null}})}})},
      scrollTo:()=>{}
    },
    document:{
      querySelector:s=>nodes[s]||null,
      querySelectorAll:s=>collections[s]||[],
      createElement:()=>element()
    },
    Date,Number,String,Math,Intl,console
  };
  vm.createContext(context);
  const cut=source.indexOf('const init=');
  vm.runInContext(source.slice(0,cut)+'globalThis.qa={'+names+'};})();',context);
  return {qa:context.qa,window:context.window};
}

function partnerNodes(){
  const nodes={};
  const ids=[
    'productLocalAvailable','localSellingPrice','localExpectedDeliveryDate','productLocalFields',
    'productInternationalEnabled','productInternationalFields','internationalOriginCountry',
    'internationalOriginRegion','internationalOriginTown','internationalItemPrice','internationalCenterFee',
    'internationalDistributionCenter','internationalExpectedDeliveryDate','internationalDispatchDetails',
    'internationalLandedPrice','productMoqEnabled','productMoqFields','productMoqMinimum','productMoqMaximum',
    'productGroupEnabled','groupCampaignFields','groupOpening','groupClosing','groupUnitPrice','groupClosePolicy',
    'groupDispatchDate','groupExpectedDeliveryDate','productPrice','productModeSummary','groupTermsLockNote',
    'productShippingStatus'
  ];
  for(const id of ids)nodes['#'+id]=element();
  nodes['#productLocalAvailable'].checked=true;
  nodes['#localSellingPrice'].value='12000';
  nodes['#productInternationalEnabled'].checked=true;
  nodes['#internationalOriginCountry'].value='China';
  nodes['#internationalItemPrice'].value='8500';
  nodes['#internationalCenterFee'].value='1500';
  nodes['#internationalDistributionCenter'].value='LEOGO Distribution Center — Nairobi';
  nodes['#internationalExpectedDeliveryDate'].value='2026-11-15';
  nodes['#productMoqEnabled'].checked=true;
  nodes['#productMoqMinimum'].value='5';
  nodes['#productMoqMaximum'].value='20';
  nodes['#productGroupEnabled'].checked=true;
  nodes['#groupOpening'].value='2026-10-05T09:00';
  nodes['#groupClosing'].value='2026-10-10T18:00';
  nodes['#groupUnitPrice'].value='9500';
  nodes['#groupClosePolicy'].value='deadline';
  nodes['#groupExpectedDeliveryDate'].value='2026-11-20';
  return nodes;
}

test('Seller product modes keep Local, International, MOQ and Group settings separate',()=>{
  const nodes=partnerNodes();
  const {qa}=moduleScope(
    'partner/shipping-moq.js',
    'shippingPayload,campaignPayload,internationalLandedPrice',
    nodes
  );
  const shipping=qa.shippingPayload();
  const campaign=qa.campaignPayload();

  assert.equal(shipping.local_available,true);
  assert.equal(shipping.local_price_kes,12000);
  assert.equal(shipping.international_order_enabled,true);
  assert.equal(shipping.international_price_kes,8500);
  assert.equal(shipping.international_shipping_fee_to_center_kes,1500);
  assert.equal(shipping.distribution_center,'LEOGO Distribution Center — Nairobi');
  assert.equal(shipping.moq_enabled,true);
  assert.equal(shipping.moq_minimum_quantity,5);
  assert.equal(qa.internationalLandedPrice(),10000);
  assert.equal(campaign.enabled,true);
  assert.equal(campaign.minimum_quantity,5);
  assert.equal(campaign.customer_unit_price_kes,9500);
  assert.equal(campaign.expected_dispatch_date,null);
  assert.equal(campaign.expected_delivery_date,'2026-11-20');
});

test('Group campaign accepts optional dispatch date and preserves payment window',()=>{
  const nodes=partnerNodes();
  nodes['#groupDispatchDate'].value='';
  const {qa}=moduleScope('partner/shipping-moq.js','campaignPayload',nodes);
  const campaign=qa.campaignPayload();
  assert.equal(campaign.expected_dispatch_date,null);
  assert.equal(new Date(campaign.opening_at).getTime(),new Date('2026-10-05T09:00').getTime());
  assert.equal(new Date(campaign.closing_at).getTime(),new Date('2026-10-10T18:00').getTime());
});

function customer(){
  const nodes={
    '#profileCounty':{value:'Siaya'},
    '#profileEstate':{value:'Siaya Town'},
    '#groupOrderMarketGrid':element()
  };
  return {...moduleScope('js/shipping-moq.js','classify,canJoin,detailsHtml,renderMarket,setCatalogue:x=>catalogue=x',nodes),nodes};
}

const campaign=()=>({
  id:'campaign',
  status:'collecting_orders',
  opening_at:new Date(Date.now()-60000).toISOString(),
  closing_at:new Date(Date.now()+60000).toISOString(),
  minimum_quantity:5,
  maximum_quantity:20,
  quantity_committed:2,
  close_policy:'deadline',
  customer_unit_price_kes:9500,
  expected_dispatch_date:null,
  expected_delivery_from:'2026-11-20'
});

const product=()=>({
  id:'product',
  product_name:'Bicycle',
  fulfilment_type:'group_order',
  availability_status:'available',
  quantity_available:3,
  price_kes:12000,
  variants:[],
  group_campaign:campaign(),
  shipping_profile:{
    product_id:'product',
    local_available:true,
    local_price_kes:12000,
    local_expected_delivery_date:'2026-10-05',
    international_order_enabled:true,
    international_price_kes:8500,
    international_shipping_fee_to_center_kes:1500,
    distribution_center:'LEOGO Distribution Center — Nairobi',
    international_expected_delivery_date:'2026-11-15',
    origin_type:'international',
    origin_country:'China',
    origin_county_region:'Guangdong',
    origin_town_city:'Guangzhou',
    moq_enabled:true,
    moq_minimum_quantity:5,
    moq_maximum_quantity:20
  },
  delivery_rates:{cbd_fee_kes:50,estate_fee_kes:80,outside_town_fee_kes:200},
  shipping_defaults:{international_min:20,international_max:25,international_unit:'days'}
});

test('Customer details show real Local, International, MOQ, Group and system delivery rules',()=>{
  const {qa}=customer();
  const html=qa.detailsHtml(product());
  assert.match(html,/Available Locally/);
  assert.match(html,/International Order/);
  assert.match(html,/MOQ/);
  assert.match(html,/Group \/ Global Order/);
  assert.match(html,/CBD KSh 50/);
  assert.match(html,/Estate KSh 80/);
  assert.match(html,/Outside town KSh 200/);
  assert.match(html,/Dispatch date will be updated after MOQ closes/);
});

test('joining respects payment dates, terminal states, maximum quantity and close policy',()=>{
  const {qa}=customer();
  assert.equal(qa.canJoin(campaign()),true);
  for(const status of ['paused','refunded','cancelled','moq_failed_closed','order_confirmed','delivered_collected']){
    assert.equal(qa.canJoin({...campaign(),status}),false);
  }
  assert.equal(qa.canJoin({...campaign(),opening_at:new Date(Date.now()+30000).toISOString()}),false);
  assert.equal(qa.canJoin({...campaign(),closing_at:new Date(Date.now()-30000).toISOString()}),false);
  assert.equal(qa.canJoin({...campaign(),quantity_committed:20}),false);
  assert.equal(qa.canJoin({...campaign(),close_policy:'moq',quantity_committed:5}),false);
  assert.equal(qa.canJoin({...campaign(),close_policy:'deadline',quantity_committed:5}),true);
});

test('Local + Group product exposes both normal cart and Group Order actions',()=>{
  const {window}=customer();
  window.leogoShippingMoq={joinButtonHtml:()=>'<button data-join-group="campaign">Join Group Order</button>',detailsHtml:()=>''};
  const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  const start=app.indexOf('  const renderSellerProductCard =');
  const end=app.indexOf('  const renderPersonalSaleCard',start);
  const context={
    window,
    sellerProductMediaUrl:()=>'',categoryIcon:()=>'',receiptEscape:x=>String(x||''),
    categoryDisplayName:x=>x,money:x=>'KSh '+x,productRatingStars:()=>'',publicProductReviewsHtml:()=>'',customerOrderFormatDate:()=>'', 
    sellerFlashActive:()=>false,sellerEffectivePrice:(_p,v)=>Number(v||0),sellerEffectiveStock:(_p,v)=>Number(v||0)
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start,end)+'globalThis.render=renderSellerProductCard',context);
  const html=context.render(product());
  assert.match(html,/data-live-cart-start/);
  assert.match(html,/data-join-group/);
  assert.match(html,/Local/);
  assert.match(html,/International/);

  const groupOnly=product();
  groupOnly.shipping_profile.local_available=false;
  const groupOnlyHtml=context.render(groupOnly);
  assert.doesNotMatch(groupOnlyHtml,/data-live-cart-start/);
  assert.match(groupOnlyHtml,/data-join-group/);
});

test('Seller module includes protected Group removal and post-MOQ dispatch update controls',()=>{
  const source=fs.readFileSync(path.join(root,'partner/shipping-moq.js'),'utf8');
  assert.match(source,/seller_remove_product_from_group/);
  assert.match(source,/seller_update_group_dispatch_date/);
  assert.match(source,/Customers have already joined this campaign/);
  assert.match(source,/Expected dispatch date <small>\(optional now\)<\/small>/);
});

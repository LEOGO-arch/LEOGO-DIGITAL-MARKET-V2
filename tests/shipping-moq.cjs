const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.env.LEOGO_SOURCE_ROOT||path.resolve(__dirname,'..');

function element(){
 const classes=new Set(),events={};
 return {value:'',hidden:false,innerHTML:'',dataset:{},events,
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
  addEventListener:(name,fn)=>events[name]=fn};
}
function moduleScope(file,names,nodes={},collections={}){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const context={window:{supabase:{createClient:()=>({rpc:async()=>({data:[]})})},scrollTo:()=>{}},document:{querySelector:s=>nodes[s]||null,querySelectorAll:s=>collections[s]||[],createElement:()=>element()},Date,Number,String,Math};
 vm.createContext(context);
 vm.runInContext(source.slice(0,source.indexOf('const init='))+'globalThis.qa={'+names+'};})();',context);
 return {qa:context.qa,window:context.window};
}

test('campaign dates survive an unchanged edit in the current timezone',()=>{
 const nodes={};
 for(const id of ['productFulfilmentType','shippingOriginType','shippingOriginCountry','shippingOriginCounty','shippingOriginTown','shippingDispatchDetails','shippingDispatchDate','shippingDeliveryFrom','shippingDeliveryTo','groupMinimum','groupMaximum','groupOpening','groupClosing','groupUnitPrice','groupClosePolicy','groupCampaignFields','productShippingStatus'])nodes['#'+id]=element();
 for(const a of ['sameTown','sameCounty','interCounty','international'])for(const b of ['Min','Max','Unit'])nodes['#'+a+b]=element();
 const {qa}=moduleScope('partner/shipping-moq.js','applyProductExtension,campaignPayload',nodes);
 qa.applyProductExtension({fulfilment_type:'group_order',group_campaign:{minimum_quantity:3,opening_at:'2026-10-01T09:00:00+00:00',closing_at:'2026-10-03T15:00:00+00:00',customer_unit_price_kes:100},shipping_profile:{expected_dispatch_date:'2026-10-04',expected_delivery_from:'2026-10-05'}});
 assert.equal(qa.campaignPayload().opening_at,'2026-10-01T09:00:00.000Z');
 assert.equal(qa.campaignPayload().closing_at,'2026-10-03T15:00:00.000Z');
});

function customer(){
 const nodes={'#profileCounty':{value:'Siaya'},'#profileEstate':{value:'Siaya Town'},'#groupOrderMarketGrid':element()};
 return {...moduleScope('js/shipping-moq.js','classify,canJoin,detailsHtml,renderMarket,setCatalogue:x=>catalogue=x',nodes),nodes};
}
const campaign=()=>({id:'campaign',status:'collecting_orders',opening_at:new Date(Date.now()-60000).toISOString(),closing_at:new Date(Date.now()+60000).toISOString(),minimum_quantity:3,maximum_quantity:5,quantity_committed:1,close_policy:'deadline',customer_unit_price_kes:100});
const product=()=>({id:'product',product_name:'QA product',fulfilment_type:'group_order',availability_status:'available',quantity_available:100,price_kes:90,variants:[],group_campaign:campaign(),shipping_profile:{origin_type:'domestic',origin_country:'Kenya',origin_county_region:'Siaya',origin_town_city:'Siaya Town',same_town_min:30,same_town_max:60,same_town_unit:'minutes',inter_county_min:2,inter_county_max:3,inter_county_unit:'days'},shipping_defaults:{international_min:20,international_max:25,international_unit:'days'}});

test('joining respects terminal states, dates, maximum quantity and close policy',()=>{
 const {qa}=customer();assert.equal(qa.canJoin(campaign()),true);
 for(const status of ['paused','refunded','cancelled','moq_failed_closed','order_confirmed','delivered_collected'])assert.equal(qa.canJoin({...campaign(),status}),false);
 assert.equal(qa.canJoin({...campaign(),opening_at:new Date(Date.now()+30000).toISOString()}),false);
 assert.equal(qa.canJoin({...campaign(),closing_at:new Date(Date.now()-30000).toISOString()}),false);
 assert.equal(qa.canJoin({...campaign(),quantity_committed:5}),false);
 assert.equal(qa.canJoin({...campaign(),close_policy:'moq',quantity_committed:3}),false);
 assert.equal(qa.canJoin({...campaign(),close_policy:'deadline',quantity_committed:3}),true);
});

test('closed Group cards expose no active Join button',()=>{
 const {qa,nodes}=customer();qa.setCatalogue([{...product(),group_campaign:{...campaign(),status:'refunded'}}]);qa.renderMarket();
 assert.doesNotMatch(nodes['#groupOrderMarketGrid'].innerHTML,/data-join-group/);
 assert.match(nodes['#groupOrderMarketGrid'].innerHTML,/disabled/);
});

test('origins, seller estimates and fallback estimates render for Normal and Pre-Order',()=>{
 const {qa,nodes}=customer();assert.equal(qa.classify(product()).estimate,'30–60 mins');
 nodes['#profileCounty'].value='Nairobi';nodes['#profileEstate'].value='Westlands';assert.equal(qa.classify(product()).estimate,'2–3 days');
 assert.equal(qa.classify({...product(),shipping_profile:{origin_type:'international',origin_country:'China'}}).estimate,'20–25 days');
 for(const fulfilment_type of ['normal','preorder'])assert.match(qa.detailsHtml({...product(),fulfilment_type}),/Ships from Siaya Town, Siaya, Kenya/);
 assert.match(qa.detailsHtml({...product(),fulfilment_type:'preorder'}),/Pre-Order/);
 assert.equal(qa.detailsHtml({fulfilment_type:'normal'}),'');
});

test('main catalogue routes only Group products away from ordinary cart',()=>{
 const {window}=customer();
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8'),start=app.indexOf('  const renderSellerProductCard ='),end=app.indexOf('  const renderPersonalSaleCard',start);
 const context={window,sellerProductMediaUrl:()=>'',categoryIcon:()=>'',receiptEscape:x=>String(x||''),categoryDisplayName:x=>x,money:x=>'KSh '+x,productRatingStars:()=>'',publicProductReviewsHtml:()=>''};vm.createContext(context);vm.runInContext(app.slice(start,end)+'globalThis.render=renderSellerProductCard',context);
 const group=context.render(product());assert.doesNotMatch(group,/data-live-cart-start/);assert.match(group,/data-join-group/);assert.match(group,/KSh 100/);
 for(const fulfilment_type of ['normal','preorder'])assert.match(context.render({...product(),fulfilment_type}),/data-live-cart-start/);
});

test('Admin setup and Group navigation handle collections without runtime errors',()=>{
 const button=element(),panel=element(),ordinary=element();
 const nodes={'.admin-nav':element(),'.admin-main':element(),'#openGroupOrderAdmin':button,'#groupOrderAdminPanel':panel,'#refreshAdminGroups':element()};
 const collections={'.admin-panel':[ordinary,panel],'.admin-nav button':[ordinary,button],'.admin-nav [data-admin-view]':[ordinary]};
 const {qa}=moduleScope('admin/shipping-moq.js','ensureUI',nodes,collections);qa.ensureUI();button.events.click({preventDefault(){},stopPropagation(){}});
 assert.equal(panel.hidden,false);assert.equal(panel.classList.contains('active'),true);assert.equal(ordinary.hidden,true);
 ordinary.events.click();assert.equal(panel.hidden,true);
});

test('Seller Group navigation activates its panel and clears other views',()=>{
 const nodes={},shell={querySelector:s=>nodes[s]||null,querySelectorAll:s=>collections[s]||[]},ordinary=element(),ordinaryButton=element();
 const nav={appendChild:el=>nodes['#'+el.id]=el},container={appendChild:el=>nodes['#'+el.id]=el};
 nodes['#sellerShell']=shell;nodes['.seller-sidebar']=nav;nodes['.seller-content']=container;nodes['#refreshSellerGroups']=element();
 const collections={'[data-seller-content]':[ordinary],'[data-seller-view]':[ordinaryButton]};
 const {qa}=moduleScope('partner/shipping-moq.js','ensureDashboard',nodes,collections);qa.ensureDashboard();
 const panel=nodes['#sellerGroupOrdersPanel'],button=nodes['#openSellerGroupOrders'];collections['[data-seller-content]'].push(panel);collections['[data-seller-view]'].push(button);
 button.events.click({preventDefault(){},stopPropagation(){}});assert.equal(panel.classList.contains('active'),true);assert.equal(ordinary.classList.contains('active'),false);
});

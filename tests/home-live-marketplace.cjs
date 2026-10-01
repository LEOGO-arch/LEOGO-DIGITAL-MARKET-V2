const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');

new vm.Script(app,{filename:'js/app.js'});

const once=(source,needle,label)=>{
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(label+' expected once, found '+count);
};

for(const demo of ['Royale Kitchen','ABC Grocery','Fresh Basket',"John's<br>Butchery",'CarePlus<br>Pharmacy']){
  if(html.includes(demo))throw new Error('Demo Seller content still present: '+demo);
}
if(html.includes('<small>Preview</small>')||html.includes('#wallet-preview')){
  throw new Error('Wallet preview wording/anchor still present');
}

once(html,'id="popularNearYouSellerGrid"','Popular Near You live grid');
once(html,'id="featuredLocalSellerRow"','Featured Local Sellers live row');
once(html,'id="quickDeliveryShopNow"','Quick Delivery Shop Now');
once(html,'id="wallet-savings"','Live wallet section');

const required=[
  "client.rpc('customer_nearby_sellers')",
  "const liveSellerSummaries = () =>",
  "const renderFeaturedLocalSellers = () =>",
  "const renderPopularNearYou = () =>",
  "const openSellerMarketplace = (sellerId,sellerName='LEOGO Seller') =>",
  "quickDeliveryShopNow?.addEventListener('click', openGeneralMarketplace)",
  "popularNearYouViewAll?.addEventListener('click', openGeneralMarketplace)",
  "featuredLocalSellersViewAll?.addEventListener('click', openGeneralMarketplace)"
];

for(const marker of required){
  if(!app.includes(marker))throw new Error('Missing home-market behavior: '+marker);
}

console.log('live home marketplace regression checks passed');

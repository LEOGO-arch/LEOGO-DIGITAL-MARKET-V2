const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/style.css','utf8');
const js=fs.readFileSync('js/app.js','utf8');
const searchMigration=fs.readFileSync('supabase/migrations/20261003184500_customer_global_search.sql','utf8');
const precisionMigration=fs.readFileSync('supabase/migrations/20261003185500_customer_global_search_region_precision.sql','utf8');

new vm.Script(js,{filename:'js/app.js'});

const headerStart=html.indexOf('<header class="top-header">');
const headerEnd=html.indexOf('</header>',headerStart);
if(headerStart<0||headerEnd<0)throw new Error('Customer header not found');
const header=html.slice(headerStart,headerEnd);

if(!header.includes('class="header-primary-row"'))throw new Error('Header controls must have their own row');
if(!header.includes('id="headerSearchInput"'))throw new Error('Large header search input missing');
if(!header.includes('placeholder="Search products, services or a place e.g. Kisumu"'))throw new Error('Search placeholder must advertise regional search');
if(header.indexOf('id="headerSearch"')<header.indexOf('class="header-primary-row"'))throw new Error('Search must be placed below primary header controls');
if(!header.includes('id="globalSearchResults"'))throw new Error('Global search results panel missing');

const cssMarkers=[
  '.header-primary-row{',
  '.header-search{',
  'height:56px!important',
  '.global-search-results{',
  '.global-search-list{',
  '@media(max-width:600px)',
  '.header-search input{font-size:16px!important'
];
for(const marker of cssMarkers){
  if(!css.includes(marker))throw new Error('Missing global search layout safeguard: '+marker);
}

const jsMarkers=[
  "client.rpc('customer_global_search',{p_query:query,p_limit:24})",
  "product:{label:'Product',icon:'🛍️'}",
  "service:{label:'Service',icon:'🛠️'}",
  "transport:{label:'Transport',icon:'🚚'}",
  "accommodation:{label:'Accommodation',icon:'🏨'}",
  "cyber_service:{label:'Cyber Service',icon:'🖥️'}",
  "personal_sale:{label:'Personal Sale',icon:'🏷️'}",
  "headerSearchInput?.addEventListener('input'",
  "searchForm?.addEventListener('submit'",
  "selectedMarketplaceCategory='all'",
  "data-accommodation-property",
  "data-open-cyber-shop"
];
for(const marker of jsMarkers){
  if(!js.includes(marker))throw new Error('Missing global search behavior: '+marker);
}

const sqlMarkers=[
  "create or replace function public.customer_global_search",
  "'product'::text as result_type",
  "'service'::text",
  "'transport'::text",
  "'accommodation'::text",
  "'cyber_service'::text",
  "'cyber_product'::text",
  "'personal_sale'::text",
  "private.partner_has_active_subscription(s.user_id,'seller')",
  "grant execute on function public.customer_global_search(text,integer) to anon,authenticated"
];
for(const marker of sqlMarkers){
  if(!searchMigration.includes(marker))throw new Error('Missing global search SQL coverage: '+marker);
}
if(!precisionMigration.includes('v_location_only boolean')||
   !precisionMigration.includes('public.kenya_counties')||
   !precisionMigration.includes("lower(coalesce(location,'')) like")){
  throw new Error('Official county/sub-county searches must be constrained to listing locations');
}

if(!html.includes('css/style.css?v=global-search-v1')||!html.includes('js/app.js?v=global-search-v1')){
  throw new Error('Global search cache version bump missing');
}

console.log('customer global search regression checks passed');

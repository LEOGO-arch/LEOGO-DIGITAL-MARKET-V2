const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261006152043_property_marketplace_sale_rent_v1.sql');
const legacyGuard=read('supabase/migrations/20261006152609_property_marketplace_legacy_rent_feed_guard.sql');
const customer=read('js/vacant-houses.js');
const admin=read('admin/vacant-houses.js');
const customerHtml=read('index.html');
const adminHtml=read('admin/index.html');
const adminCore=read('admin/admin.js');
const customerCss=read('css/vacant-houses.css');

new vm.Script(customer,{filename:'js/vacant-houses.js'});
new vm.Script(admin,{filename:'admin/vacant-houses.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

for(const needle of [
  "listing_purpose text not null default 'rent'",
  'sale_price_kes numeric(14,2)',
  'property_size_text text',
  'ownership_note text',
  "'rent','sale'",
  "'land_plot'",
  "'sold'",
  'public_list_property_marketplace',
  'customer_submit_vacant_house',
  "'listing_purpose',l.listing_purpose",
  "'sale_price_kes',l.sale_price_kes",
  "case when r.payment_status in ('verified','waived') then d.exact_address else null end",
  "Sale property can only be Available, Sold or Archived"
]) must(migration.includes(needle),'Missing property sale/rent behavior: '+needle);

must(legacyGuard.includes("l.listing_purpose='rent'"),'Legacy vacant-house feed must remain rent-only.');
must(customerHtml.includes('Houses &amp; Property'),'Customer category must identify the combined property market.');
must(adminHtml.includes('Houses &amp; Property'),'Admin navigation must identify the combined property market.');
must(adminCore.includes("vacant_houses: 'Houses & Property'"),'Admin page title must show Houses & Property.');
must(customer.includes('id="vhPurpose"'),'Customer rent/sale filter missing.');
must(customer.includes('name="listing_purpose" id="vhListingPurpose"'),'Property listing-purpose selector missing.');
must(customer.includes('name="sale_price_kes"'),'Sale price field missing.');
must(customer.includes('name="property_size_text"'),'Property size field missing.');
must(customer.includes('name="ownership_note"'),'Ownership/title information field missing.');
must(customer.includes("public_list_property_marketplace"),'Customer property feed RPC missing.');
must(customer.includes("forSale?'FOR SALE':'FOR RENT'"),'Property cards must show For Sale/For Rent.');
must(customer.includes("data-status=\"sold\""),'Sale owner status must support Sold.');
must(admin.includes("forSale?'Sale Price':'Monthly Rent'"),'Admin must distinguish sale price from rent.');
must(admin.includes('data-status="sold"'),'Admin must be able to mark sale property Sold.');
must(customerCss.includes('grid-template-columns:1fr 2fr 1fr 1fr 1fr 1fr auto'),'Property filter layout must fit rent/sale controls.');

console.log('Property rent/sale extension regression checks passed.');

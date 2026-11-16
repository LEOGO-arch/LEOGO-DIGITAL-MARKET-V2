import test from "node:test";
import assert from "node:assert/strict";
import {merchantFeed,merchantItems} from "./merchant.mjs";
const id="0cfbfa01-23ea-4b78-a7f3-7cdefc807405";
const image="2a73a05d-0915-4ab2-bbc8-ef60e099ac80/photo.jpg";
const good={id,category:"electronics_bcfe08f",name:"Phone & Charger",description:"A phone with 128 GB storage.",availability:"available",variants:[],current_price_kes:1000,regular_price_kes:1000,image_path:image};
test("feed renders safely escaped XML and live LEOGO price",()=>{
 const items=merchantItems([good]);assert.equal(items.length,1);const xml=merchantFeed([good]);
 assert.match(xml,/<title>Phone &amp; Charger<\/title>/);
 assert.match(xml,/<g:price>1000.00 KES<\/g:price>/);
 assert.match(xml,/seo-catalogue\/products\/0cfbfa01/);
 assert.doesNotMatch(xml,/<g:condition>/);
});
test("exclude variants, promos, unknown stock, unsafe media, empty description and restricted categories",()=>{
 const cases=[
 {...good,variants:[{name:"large"}]},
 {...good,current_price_kes:900},
 {...good,availability:"check_live"},
 {...good,image_path:"../private/photo.jpg"},
 {...good,description:""},
 {...good,category:"alcoholic_leogo_bar"}
 ];
 for(const p of cases)assert.equal(merchantItems([p]).length,0);
});
test("empty eligible catalogue still gives valid empty feed",()=>{const xml=merchantFeed([]);assert.match(xml,/<channel>/);assert.match(xml,/<\/rss>/);assert.doesNotMatch(xml,/<item>/);});
test("reject duplicated product identifiers",()=>assert.throws(()=>merchantItems([good,good]),/duplicate/));

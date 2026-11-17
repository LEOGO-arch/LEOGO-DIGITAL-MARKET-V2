import test from "node:test";
import assert from "node:assert/strict";
import {merchantFeed,merchantItems} from "./merchant.mjs";
const id="0cfbfa01-23ea-4b78-a7f3-7cdefc807405";
const image="2a73a05d-0915-4ab2-bbc8-ef60e099ac80/photo.jpg";
const good={id,category:"electronics_bcfe08f",name:"Phone & Charger",description:"A phone with 128 GB storage.",availability:"available",variants:[],current_price_kes:1000,regular_price_kes:1000,image_path:image};
test("simple product feed remains stable and escaped",()=>{
 const items=merchantItems([good]);assert.equal(items.length,1);
 const xml=merchantFeed([good]);
 assert.match(xml,/<title>Phone &amp; Charger<\/title>/);
 assert.match(xml,/<g:price>1000.00 KES<\/g:price>/);
 assert.match(xml,/seo-catalogue\/products\/0cfbfa01/);
 assert.doesNotMatch(xml,/<g:item_group_id>/);
});
test("generate two independently priced and linked color variants",()=>{
 const p={...good,availability:"check_live",current_price_kes:null,regular_price_kes:null,
  variants:[{name:"Black",available:true,price_kes:59000,image_path:image},{name:"Green",available:true,price_kes:56000,image_path:image}]};
 const items=merchantItems([p]);assert.equal(items.length,2);
 const xml=merchantFeed([p]);
 assert.match(xml,/<g:price>59000.00 KES<\/g:price>/);
 assert.match(xml,/<g:price>56000.00 KES<\/g:price>/);
 assert.match(xml,/<g:color>Black<\/g:color>/);
 assert.match(xml,/<g:item_group_id>0cfbfa01/);
 assert.match(xml,/variant=Black/);
 assert.equal(items[0].group,p.id);
 assert.notEqual(items[0].id,items[1].id);
 assert.ok(items.every(item=>item.id.length<=50));
 assert.deepEqual(merchantItems([p]).map(item=>item.id),items.map(item=>item.id));
});
test("size and food flavor attributes use distinct variant options",()=>{
 const shoe={...good,category:"garments_clothes_footwear",variants:[{name:"Size 41",available:true,price_kes:3500,image_path:image}]};
 const soda={...good,id:"ac1456a0-39a8-4b3b-b92e-e0329831950e",category:"food_drinks",variants:[{name:"Fanta Orange",available:true,price_kes:40,image_path:image}]};
 const xml=merchantFeed([shoe,soda]);
 assert.match(xml,/<g:size>41<\/g:size>/);
 assert.match(xml,/<g:name>flavor<\/g:name>/);
 assert.match(xml,/<g:value>Fanta Orange<\/g:value>/);
});
test("do not publish absent stock, unknown prices, unsafe images, duplicate or invalid variants",()=>{
 const cases=[
 {...good,variants:[{name:"Black",available:false,price_kes:1200,image_path:image}]},
 {...good,variants:[{name:"Black",available:true,price_kes:null,image_path:image}],image_path:null},
 {...good,availability:"out_of_stock",variants:[{name:"Black",available:true,price_kes:1200,image_path:image}]},
 {...good,variants:[],current_price_kes:900},
 {...good,variants:[],availability:"check_live"},
 {...good,variants:[],image_path:"../private/photo.jpg"},
 {...good,description:""},
 {...good,category:"alcoholic_leogo_bar"}
 ];
 for(const p of cases)assert.equal(merchantItems([p]).length,0);
 const variant={name:"Black",available:true,price_kes:1200,image_path:image};
 assert.equal(merchantItems([{...good,variants:[variant,variant]}]).length,1);
});
test("empty catalogue produces complete empty XML",()=>{const xml=merchantFeed([]);assert.match(xml,/<channel>/);assert.match(xml,/<\/rss>/);assert.doesNotMatch(xml,/<item>/);});
test("duplicate product ids fail fast",()=>assert.throws(()=>merchantItems([good,good]),/duplicate/));

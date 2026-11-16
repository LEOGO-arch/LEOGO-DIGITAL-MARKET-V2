import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {build} from "./render.mjs";
const script=fs.readFileSync("js/public-image-optimization.js","utf8");
const id="12345678-1234-1234-1234-123456789012";
function helper(){
 const calls=[];
 const window={};
 const document={addEventListener(){},createElement(){return {getContext(){return {drawImage(...args){calls.push(args);}}},toBlob(fn){fn({type:"image/webp",size:40_000})}};}};
 vm.runInNewContext(script,{window,document,createImageBitmap:async()=>({width:4000,height:3000,close(){}})});
 return {images:window.leogoPublicImages,calls};
}
test("product images are proportional, with full and thumbnail sizes",async()=>{
 const {images,calls}=helper();
 assert.deepEqual(Array.from(images.dimensions(4000,3000,1280)),[1280,960]);
 assert.deepEqual(Array.from(images.dimensions(300,200,1280)),[300,200]);
 const full=await images.optimize({type:"image/jpeg"});
 assert.equal(full.type,"image/webp");
 assert.equal(calls[0][3],1280);
 assert.equal(calls[0][4],960);
});
test("derived filenames support legacy images and new uploads without path traversal",()=>{
 const {images}=helper();
 assert.equal(images.thumbPath(id+"/main-old.jpg"),id+"/main-old.jpg-thumb.webp");
 assert.equal(images.thumbPath(id+"/main-old.png"),id+"/main-old.png-thumb.webp");
 assert.equal(images.thumbPath(id+"/main-new-opt.webp"),id+"/main-new-thumb.webp");
 assert.equal(images.thumbPath(id+"/main-new-thumb.webp"),null);
 assert.equal(images.thumbPath("../secret.jpg"),null);
 assert.equal(images.thumbPath("bad.js"),null);
 assert.equal(images.thumbPath("another-folder/../../private.jpg"),null);
 assert.equal(Array.from(images.mediaPaths([id+"/main-old.jpg"])).length,2);
});
test("SEO catalogue uses legacy thumbnails with full-size fallback",()=>{
 const name=id+"/main-old.png";
 const page=build([{id,name:"Shoes",category:"groceries",category_name:"Groceries",availability:"available",regular_price_kes:500,current_price_kes:500,image_path:name,variants:[]}],"https://leogo.co.ke");
 const index=page["seo-catalogue/index.html"];
 const detail=page["seo-catalogue/products/"+id+"/index.html"];
 assert.ok(index.includes("main-old.png-thumb.webp"));
 assert.ok(index.includes("data-full-image="));
 assert.ok(detail.includes("/main-old.png"));
 assert.ok(detail.includes("loading=\"lazy\""));
});
test("Cyber and property public uploads are compressed; verification uploads are unchanged",()=>{
 const cyber=fs.readFileSync("partner/cyber.js","utf8");
 const property=fs.readFileSync("js/vacant-houses.js","utf8");
 for(const s of [cyber,property])new Function(s);
 assert.ok(cyber.includes("bucket==='cyber-public-media'"));
 assert.ok(cyber.includes("leogoPublicImages.optimize(file)"));
 assert.ok(cyber.includes("contentType:publicImage?'image/webp':file.type"));
 assert.ok(property.includes("leogoPublicImages.optimize(file)"));
 assert.ok(property.includes("cacheControl:'86400'"));
 const admin=fs.readFileSync("admin/product-image-backfill.js","utf8");
 new Function(admin);
 assert.ok(admin.includes("admin_list_missing_product_thumbnails"));
 assert.ok(admin.includes("target!==optimizer.thumbPath(src)"));
 assert.ok(admin.includes("upsert:false"));
});

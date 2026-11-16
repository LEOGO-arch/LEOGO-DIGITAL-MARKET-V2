import test from "node:test";
import assert from "node:assert/strict";
import {build,validate,liveSource,media} from "./render.mjs";
const row={id:"3c69be82-a433-4496-b729-58e452f6a0a2",name:"Tomatoes <script>bad</script>",category:"groceries",category_name:"Groceries",availability:"available",regular_price_kes:110,current_price_kes:100,private_field:"secret"};
const path="seo-catalogue/products/"+row.id+"/index.html";
test("staging is noindex and excludes production shopping links",()=>{const f=build([row],"https://staging.invalid",true);assert.ok(f[path].includes("noindex,nofollow"));assert.ok(!f[path].includes("leogo.co.ke"));assert.ok(!f[path].includes("shop-link"));});
test("production product page escapes data and uses live pricing",()=>{const f=build([row],"https://leogo.co.ke");assert.ok(!f[path].includes("<script>"));assert.ok(!f[path].includes("secret"));assert.ok(!f[path].includes("KSh 100"));assert.ok(f[path].includes("product_id="+row.id));assert.ok(f[path].includes("hidden"));assert.ok(f[path].includes("/seo-catalogue/live.js"));});
test("sitemap covers home, catalogue, category, product; removal is reflected",()=>{const f=build([row],"https://leogo.co.ke");assert.ok(f["sitemap.xml"].includes("https://leogo.co.ke/</loc>"));assert.ok(f["sitemap.xml"].includes("/categories/groceries/"));assert.ok(f["sitemap.xml"].includes(row.id));assert.ok(!build([],"https://leogo.co.ke")["sitemap.xml"].includes(row.id));assert.ok(!build([],"https://leogo.co.ke")[path]);assert.ok(Object.keys(f).every(k=>k==="sitemap.xml"||k.startsWith("seo-catalogue/")));});
test("reject restricted categories, duplicate IDs and invalid price",()=>{assert.throws(()=>validate([{...row,category:"alcoholic_leogo_bar"}]));assert.throws(()=>validate([row,row]));assert.throws(()=>validate([{...row,current_price_kes:-1}]));assert.throws(()=>build([row],"https://evil.example"));assert.throws(()=>liveSource("sb_secret_test"));});
test("variant price is not invented",()=>{assert.equal(validate([{...row,current_price_kes:null,regular_price_kes:null,availability:"check_live"}])[0].current_price_kes,null);});

test("live price and eligibility gate", async()=>{
 const source=liveSource("sb_publishable_test");
 async function simulate(rows,ok=true){
  const link={hidden:true,href:""},status={textContent:""},h1={textContent:"Test"},metas=[];
  const el={dataset:{productId:row.id},querySelectorAll:()=>[link]};
  const document={querySelector:s=>s==="h1"?h1:el,querySelectorAll:()=>[],getElementById:s=>s==="live-status"?status:s==="shop-link"?link:null,createElement:()=>({}),head:{append:m=>metas.push(m)},title:"Test"};
  const fetch=async(url,opts)=>{assert.ok(url.startsWith("https://dzdciuqkqixwutvtfotj.supabase.co/"));assert.equal(opts.headers.apikey,"sb_publishable_test");return {ok,json:async()=>rows};};
  new Function("document","fetch",source)(document,fetch);
  for(let i=0;i<10;i++)await Promise.resolve();
  return {link,status,h1,metas};
 }
 let state=await simulate([row]);assert.match(state.status.textContent,/KSh 100/);assert.equal(state.link.hidden,false);assert.match(state.link.href,/product_category=groceries/);
 state=await simulate([{...row,current_price_kes:null,availability:"check_live"}]);assert.match(state.status.textContent,/Select options/);assert.doesNotMatch(state.status.textContent,/KSh/);
 state=await simulate([]);assert.equal(state.link.hidden,true);assert.match(state.status.textContent,/no longer available/);assert.equal(state.metas[0].content,"noindex");
 state=await simulate([],false);assert.equal(state.link.hidden,true);assert.match(state.status.textContent,/Live price unavailable/);
});

test("branded cards use approved image paths and escape options",()=>{const p={...row,image_path:"2a73a05d-0915-4ab2-bbc8-ef60e099ac80/main-test.jpg",gallery:[],variants:[{name:"Red <b>",price_kes:100,available:true}]};const f=build([p],"https://leogo.co.ke");assert.ok(f[path].includes("main-test.jpg"));assert.ok(f[path].includes("Red &lt;b&gt;"));assert.ok(f["seo-catalogue/index.html"].includes("data-catalogue-card"));assert.ok(f["seo-catalogue/catalogue.css"].includes("grid-template-columns"));assert.ok(!build([p],"https://staging.invalid",true)[path].includes("supabase.co"));assert.equal(media("https://evil.test/a.jpg"),"");assert.equal(media("2a73a05d-0915-4ab2-bbc8-ef60e099ac80/../x.jpg"),"");});

test("production discovery metadata is safe and canonical",()=>{const f=build([row],"https://leogo.co.ke");const html=f[path];const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);assert.ok(match);const data=JSON.parse(match[1]);assert.equal(data["@type"],"BreadcrumbList");assert.equal(data.itemListElement.length,4);assert.equal(data.itemListElement[3].name,row.name);assert.equal(data.itemListElement[3].item,"https://leogo.co.ke/seo-catalogue/products/"+row.id+"/");assert.ok(html.includes('property="og:site_name"'));assert.ok(!html.includes('"price"'));assert.ok(!html.includes('<script>bad'));assert.ok(!build([row],"https://staging.invalid",true)[path].includes("BreadcrumbList"));});

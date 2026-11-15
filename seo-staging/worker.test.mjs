import test from "node:test";
import assert from "node:assert/strict";
import {renderRoute,cleanRows,handle} from "./worker.mjs";
const origin="https://leogo-seo-staging.example.workers.dev";
const sample={id:"3c69be82-a433-4496-b729-58e452f6a0a2",name:"Test <script>alert(1)</script>",description:"<img onerror=x>",category:"phase1_artificial",category_name:"Test category",price_kes:110,available:true,image_path:"staging-qa/not-a-real-product.png",private_field:"secret"};
const path="/products/"+sample.id+"/";
test("product category sitemap and removal",()=>{
 assert.equal(renderRoute(path,origin,[sample]).status,200);
 assert.equal(renderRoute("/category/phase1_artificial/",origin,[sample]).status,200);
 assert.ok(renderRoute("/sitemap.xml",origin,[sample]).body.includes(origin+path));
 assert.equal(renderRoute(path,origin,[]).status,404);
 assert.ok(!renderRoute("/sitemap.xml",origin,[]).body.includes(path));
 assert.equal(renderRoute("/admin/",origin,[sample]).status,404);
});
test("escape text, omit private fields and reject restricted category",()=>{
 const html=renderRoute(path,origin,[sample]).body;
 assert.ok(!html.includes("<script>")); assert.ok(!html.includes("secret")); assert.ok(!html.includes("<img onerror"));
 assert.throws(()=>cleanRows([{...sample,category:"alcoholic_leogo_bar"}]));
 assert.throws(()=>cleanRows([sample,sample]));
});
test("HTTP safety and fail-closed upstream",async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.ok(url.startsWith("https://uxikemfrzqatsbqutida.supabase.co/"));assert.equal(options.headers.apikey,"sb_publishable_test");return Response.json([sample]);};
  const env={STAGING_CATALOGUE_KEY:"sb_publishable_test"};
  const res=await handle(new Request(origin+path),env);
  assert.equal(res.status,200);assert.equal(res.headers.get("X-Robots-Tag"),"noindex, nofollow");assert.equal(res.headers.get("Cache-Control"),"no-store");
  assert.equal((await handle(new Request("https://leogo.co.ke"+path),env)).status,403);
  assert.equal((await handle(new Request(origin+path,{method:"POST"}),env)).status,405);
  assert.equal((await handle(new Request(origin+path),{STAGING_CATALOGUE_KEY:"sb_secret_test"})).status,503);
  assert.equal((await handle(new Request(origin+path),{})).status,503);
  const head=await handle(new Request(origin+path,{method:"HEAD"}),env);assert.equal(await head.text(),"");
  globalThis.fetch=async()=>new Response("error",{status:500});
  assert.equal((await handle(new Request(origin+"/sitemap.xml"),env)).status,503);
 }finally{globalThis.fetch=original;}
});

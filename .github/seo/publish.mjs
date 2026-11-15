import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {execFileSync} from "node:child_process";
import {build,liveSource} from "./render.mjs";
import {extend,liveSource as businessLiveSource} from "./business.mjs";
import {verifyPublication} from "./integrity.mjs";
import {rewriteMedia} from "./media-rewrite.mjs";
const root=process.cwd(),args=process.argv.slice(2);
function writeFiles(dir,files){for(const [name,body] of Object.entries(files)){if(name!=="sitemap.xml"&&!name.startsWith("seo-catalogue/"))throw Error("Unexpected output path");const dest=path.resolve(dir,name);if(!dest.startsWith(path.resolve(dir)+path.sep))throw Error("Invalid output path");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body,"utf8");}}
if(args[0]==="--fixture"){
 if(args.length!==4||args[2]!=="--output")throw Error("Use --fixture FILE --output NEW_DIRECTORY");
 const output=path.resolve(args[3]);if(output===root||output.startsWith(root+path.sep)||fs.existsSync(output))throw Error("Staging output must be a new directory outside repository");
 const fixture=JSON.parse(fs.readFileSync(args[1],"utf8"));const rows=Array.isArray(fixture)?fixture:fixture.products;const business=Array.isArray(fixture)?[]:fixture.businesses;const images=Array.isArray(fixture)?[]:fixture.categoryImages||[];const files=extend(build(rows,"https://staging.invalid",true),business,"https://staging.invalid",true,images);verifyPublication(files,"https://staging.invalid");writeFiles(output,files);console.log("Staging preview generated; no repository files changed.");
}else{
 if(args.length!==1||args[0]!=="--production")throw Error("Explicit --production required");
 if(!fs.existsSync(path.join(root,".github/seo/render.mjs")))throw Error("Run from LEOGO repository root");
 const auth=fs.readFileSync(path.join(root,"js/auth.js"),"utf8");
 const key=auth.match(/const PUBLISHABLE_KEY\s*=\s*['"](sb_publishable_[A-Za-z0-9_-]+)['"]/)?.[1];
 if(!key||!auth.includes("dzdciuqkqixwutvtfotj.supabase.co"))throw Error("Expected production public frontend configuration");
 const res=await fetch("https://dzdciuqkqixwutvtfotj.supabase.co/rest/v1/rpc/seo_branded_catalogue_v3",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error("Catalogue request failed: "+res.status);
 const rows=await res.json();
 const businessRes=await fetch("https://dzdciuqkqixwutvtfotj.supabase.co/rest/v1/rpc/seo_public_business_v1",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(30000)});
 if(!businessRes.ok)throw Error("Business catalogue request failed: "+businessRes.status);
 const businessRows=await businessRes.json();
 const imageRes=await fetch("https://dzdciuqkqixwutvtfotj.supabase.co/rest/v1/rpc/customer_category_images",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(30000)});
 if(!imageRes.ok)throw Error("Category images request failed: "+imageRes.status);
 const categoryImages=await imageRes.json();
 if(!Array.isArray(categoryImages))throw Error("Invalid category images");
 const files=extend(build(rows,"https://leogo.co.ke"),businessRows,"https://leogo.co.ke",false,categoryImages);files["seo-catalogue/live.js"]=liveSource(key);files["seo-catalogue/business/live.js"]=businessLiveSource(key);
 const verified=verifyPublication(files,"https://leogo.co.ke");
 console.log("Verified "+verified.urls+" sitemap URLs and "+verified.pages+" generated pages; "+businessRows.length+" eligible businesses.");
 const oldSitemap=fs.readFileSync(path.join(root,"sitemap.xml"),"utf8");
 const oldUrls=[...oldSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 if(!oldUrls.length||!oldUrls.includes("https://leogo.co.ke/")||oldUrls.some(u=>u!=="https://leogo.co.ke/"&&!u.startsWith("https://leogo.co.ke/seo-catalogue/")))throw Error("Existing sitemap contains unmanaged URLs; review required");
 const target=path.join(root,"seo-catalogue");if(fs.existsSync(target)&&(!fs.existsSync(path.join(target,".generated"))||fs.readFileSync(path.join(target,".generated"),"utf8")!=="LEOGO SEO generator v2\n"))throw Error("Refusing to replace unmanaged catalogue");
 const temp=fs.mkdtempSync(path.join(root,".seo-build-"));
 try{writeFiles(temp,files);const inventory=[...rows.flatMap(r=>[r.image_path,...(r.gallery||[]),...(r.variants||[]).map(v=>v.image_path)].map(path=>({bucket:"seller-product-media",path}))),...businessRows.map(r=>({bucket:r.image_bucket,path:r.image_path})),...categoryImages.filter(r=>new Set([...rows.map(p=>p.category),"marketplace","services","cyber-branding","accommodation","transport","vacant-houses"]).has(r.code)).map(r=>({bucket:"category-public-media",path:r.image_path}))];execFileSync("python3",[path.join(root,".github/seo/optimize-media.py"),temp,target],{input:JSON.stringify(inventory),stdio:["pipe","inherit","inherit"],timeout:240000});const mediaDir=path.join(temp,"seo-catalogue/optimized-media");const manifest=JSON.parse(fs.readFileSync(path.join(mediaDir,"manifest.json"),"utf8"));for(const name of fs.readdirSync(mediaDir)){if(!/^[a-f0-9]{64}-(thumb|full)\.webp$/.test(name)&&name!=="manifest.json")throw Error("Unexpected derivative file");files["seo-catalogue/optimized-media/"+name]=fs.readFileSync(path.join(mediaDir,name));}rewriteMedia(files,manifest);verifyPublication(files,"https://leogo.co.ke");writeFiles(temp,files);const backup=path.join(temp,"backup");if(fs.existsSync(target))fs.renameSync(target,backup);try{fs.renameSync(path.join(temp,"seo-catalogue"),target);fs.renameSync(path.join(temp,"sitemap.xml"),path.join(root,"sitemap.xml"));}catch(e){if(fs.existsSync(backup)){fs.rmSync(target,{recursive:true,force:true});fs.renameSync(backup,target);}throw e;}}finally{fs.rmSync(temp,{recursive:true,force:true});}
 console.log("Prepared "+rows.length+" eligible products. Only seo-catalogue/ and sitemap.xml changed.");
}

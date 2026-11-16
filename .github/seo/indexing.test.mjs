import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const head=p=>read(p).split(/<\/head>/i)[0];
const portals=["admin/index.html","admin/recover.html","admin/sorting-centers.html","partner/index.html","pickup/index.html","sorting/index.html","staff/index.html","scan/index.html","weekend-shopping-test/admin.html","weekend-shopping-test/index.html"];
test("operational portals and test pages request noindex without blocking crawler access",()=>{for(const p of portals)assert.match(head(p),/<meta name="robots" content="noindex,nofollow">/,p);assert.doesNotMatch(head("index.html"),/<meta[^>]+name=["']robots["'][^>]+noindex/i);assert.match(head("index.html"),/<link rel="icon"[^>]*href="\/assets\/images\/leogo-official-logo\.jpg"/);assert.match(read("robots.txt"),/Sitemap:\s*https:\/\/leogo\.co\.ke\/sitemap\.xml/);assert.doesNotMatch(read("robots.txt"),/Disallow:\s*\/(?:admin|staff|partner|sorting|pickup|scan|weekend-shopping-test)/i);const urls=[...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);assert.ok(urls.includes("https://leogo.co.ke/"));assert.ok(urls.every(u=>u==="https://leogo.co.ke/"||u.startsWith("https://leogo.co.ke/seo-catalogue/")));});

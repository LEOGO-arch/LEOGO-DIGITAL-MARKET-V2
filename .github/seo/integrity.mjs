export function verifyPublication(files,origin){
 const xml=files["sitemap.xml"];
 if(typeof xml!=="string"||!xml.includes("</urlset>"))throw Error("Missing sitemap");
 const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 if(!urls.includes(origin+"/")||new Set(urls).size!==urls.length)throw Error("Invalid sitemap URL set");
 const expected=new Set(Object.keys(files).filter(p=>p.startsWith("seo-catalogue/")&&p.endsWith("/index.html")).map(p=>origin+"/"+p.slice(0,-"index.html".length)));
 for(const url of urls){if(url===origin+"/")continue;if(!expected.delete(url))throw Error("Sitemap URL has no generated page: "+url);const p=url.slice(origin.length+1)+"index.html";if(!files[p].includes('href="'+url+'"'))throw Error("Canonical URL mismatch: "+url);}
 if(expected.size)throw Error("Generated pages missing from sitemap");
 for(const [p,body] of Object.entries(files)){if(!p.endsWith(".html"))continue;for(const m of body.matchAll(/href="(\/seo-catalogue\/[^"?#]*\/)"|src="(\/seo-catalogue\/[^"?#]+)"/g)){const link=m[1]||m[2];const target=link.slice(1)+(link.endsWith("/")?"index.html":"");if(!Object.hasOwn(files,target))throw Error("Broken internal catalogue link: "+link+" from "+p);}}
 return {urls:urls.length,pages:urls.length-1};
}

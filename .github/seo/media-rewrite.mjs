export function rewriteMedia(files,manifest){
 for(const [path,body] of Object.entries(files)){
  if(!path.endsWith(".html"))continue;
  const detail=/\/products\/[^/]+\/index\.html$/.test(path)||/\/business\/[^/]+\/[^/]+\/index\.html$/.test(path);
  files[path]=body.replace(/<img\b[^>]*>/gi,tag=>{
   const match=tag.match(/\bsrc="([^"]+)"/);if(!match)return tag;
   const src=match[1],entry=manifest[src];if(!entry)return tag;
   const target=entry[detail?"full":"thumb"];
   if(typeof target!=="string"||!/^\/seo-catalogue\/optimized-media\/[a-f0-9]{64}-(thumb|full)\.webp$/.test(target))return tag;
   if(!Object.hasOwn(files,target.slice(1)))throw Error("Missing optimized image");
   return tag.replace(match[0],'src="'+target+'" data-original-public-media="'+src+'"');
  });
 }
 return files;
}

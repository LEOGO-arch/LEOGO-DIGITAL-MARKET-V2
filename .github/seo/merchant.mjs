/* Read-only Merchant Center XML based on the vetted public SEO RPC.
   Never use seller-private prices, alter checkout, or expose unknown stock. */
import {createHash} from "node:crypto";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE=/^[0-9a-f-]{36}\/[^/\\.][A-Za-z0-9_.-]*\.(?:jpe?g|png|webp|avif)$/i;
const ALLOWED=new Set(["food_drinks","groceries","dry_goods","bookshop","hardware","garments_clothes_footwear","jewelry","electronics_bcfe08f"]);
const BASE="https://dzdciuqkqixwutvtfotj.supabase.co/storage/v1/object/public/seller-product-media/";
const ROOT="https://leogo.co.ke/seo-catalogue/products/";
const clean=(s,max)=>typeof s==="string"?s.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";
const xml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const media=p=>typeof p==="string"&&IMAGE.test(p)&&!p.includes("..")?BASE+p.split("/").map(encodeURIComponent).join("/"):null;
const money=n=>typeof n==="number"&&Number.isFinite(n)&&n>0&&Math.abs(n*100-Math.round(n*100))<0.00001?n.toFixed(2)+" KES":null;
function dimension(category,name){
 const size=/^size\s+(.+)$/i.exec(name);
 if(size&&category==="garments_clothes_footwear")return {kind:"size",value:size[1].trim()};
 if(["black","green","blue","red","white","grey","gray","yellow","pink","purple","orange","brown","silver","gold"].includes(name.toLowerCase()))return {kind:"color",value:name};
 if(category==="food_drinks"||category==="groceries")return {kind:"flavor",value:name};
 return {kind:"option",value:name};
}
export function merchantItems(rows){
 if(!Array.isArray(rows)||rows.length>10000)throw Error("Invalid Merchant catalogue");
 const found=new Set(),ids=new Set(),items=[];
 for(const p of rows){
  if(!p||typeof p.id!=="string"||!UUID.test(p.id)||found.has(p.id))throw Error("Invalid or duplicate product id");
  found.add(p.id);
  if(!ALLOWED.has(p.category)||!Array.isArray(p.variants))continue;
  const title=clean(p.name,150),description=clean(p.description,5000);
  if(!title||!description)continue;
  const link=ROOT+p.id+"/";
  if(p.variants.length){
   if(p.availability==="out_of_stock"||p.variants.length>100)continue;
   const seenNames=new Set();
   for(const v of p.variants){
    const name=clean(v?.name,100);
    if(!name||seenNames.has(name.toLowerCase()))continue;
    seenNames.add(name.toLowerCase());
    if(v.available!==true)continue;
    const price=money(v.price_kes),image=media(v.image_path)||media(p.image_path);
    if(!price||!image)continue;
    // Public projection returns the final LEOGO variant selling price including approved discounts.
    const id=p.id+"-"+createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0,12);
    const dim=dimension(p.category,name);
    const item={id,title:clean(title+" - "+name,150),description,price,image,
      link:link+"?variant="+encodeURIComponent(name),group:p.id,groupTitle:title,
      dimension:dim};
    if(id.length>50||ids.has(id))throw Error("Invalid or duplicate Merchant variant id");
    ids.add(id);items.push(item);
   }
   continue;
  }
  // For single-price products, do not guess stock or an unverified promotion.
  if(p.availability!=="available"||p.current_price_kes!==p.regular_price_kes)continue;
  const price=money(p.current_price_kes),image=media(p.image_path);
  if(!price||!image||ids.has(p.id))continue;
  ids.add(p.id);items.push({id:p.id,title,description,price,image,link});
 }
 return items.sort((a,b)=>a.id.localeCompare(b.id));
}
export function merchantFeed(rows){
 const nodes=merchantItems(rows).map(p=>{
  let group="";
  if(p.group){
   group="<g:item_group_id>"+xml(p.group)+"</g:item_group_id><g:item_group_title>"+xml(p.groupTitle)+"</g:item_group_title>";
   group+="<g:variant_option><g:name>"+xml(p.dimension.kind)+"</g:name><g:value>"+xml(p.dimension.value)+"</g:value></g:variant_option>";
   if(p.dimension.kind==="size")group+="<g:size>"+xml(p.dimension.value)+"</g:size>";
   if(p.dimension.kind==="color")group+="<g:color>"+xml(p.dimension.value)+"</g:color>";
  }
  return "<item><g:id>"+xml(p.id)+"</g:id><title>"+xml(p.title)+"</title><description>"+xml(p.description)+"</description><link>"+xml(p.link)+"</link><g:image_link>"+xml(p.image)+"</g:image_link><g:availability>in_stock</g:availability><g:price>"+xml(p.price)+"</g:price>"+group+"</item>";
 }).join("\n");
 return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>LEOGO Digital Market - Kenya</title><link>https://leogo.co.ke/</link><description>Eligible approved LEOGO products and available variants in KES.</description>\n'+nodes+'\n</channel></rss>\n';
}

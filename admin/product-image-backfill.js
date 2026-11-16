(()=>{'use strict';
const db=window.leogoAdminDb;
const list=document.getElementById('adminCatalogueCategoryList');
if(!db||!list)return;
const root=document.createElement('section');
root.style.cssText='border:1px solid #dbe3ed;border-radius:14px;padding:16px;margin:12px 0;background:#f8fafc';
root.innerHTML='<h3>Older product image thumbnails</h3><p>Generate smaller browsing images for previously uploaded seller products. Originals, product details, approval status and full-size photos remain unchanged. Run during a quiet period.</p><button type="button" class="primary-button" data-generate>Generate missing thumbnails</button> <span data-status role="status" aria-live="polite"></span>';
list.before(root);
const button=root.querySelector('[data-generate]'),status=root.querySelector('[data-status]');
const hasAccess=()=>{const a=window.leogoAdminAccess?.();return Boolean(a?.active&&(a.superAdmin||a.role==='admin'||a.permissions?.includes('products.manage')));};
let running=false;
function refresh(){root.hidden=!hasAccess();button.disabled=running||root.hidden;}
document.addEventListener('leogo:admin-access-change',refresh);
document.querySelector('[data-admin-view="products"]')?.addEventListener('click',refresh);
refresh();
button.addEventListener('click',async()=>{
 if(running||!hasAccess())return;
 const optimizer=window.leogoPublicImages;
 if(!optimizer){status.textContent='Image optimizer unavailable. Refresh Admin and retry.';return;}
 running=true;refresh();
 let successes=0,failures=0,skipped=0;
 try{
  const result=await db.rpc('admin_list_missing_product_thumbnails',{p_limit:100});
  if(result.error)throw result.error;
  if(!Array.isArray(result.data))throw Error('Invalid thumbnail list.');
  const rows=result.data;
  if(!rows.length){status.textContent='All referenced product thumbnails are already available.';return;}
  for(const item of rows){
   if(!hasAccess()){status.textContent='Admin session changed; processing stopped.';break;}
   const src=item.source_path,target=item.thumbnail_path;
   if(typeof src!=='string'||!/^[-0-9a-f]{36}\/[A-Za-z0-9][A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(src)||target!==optimizer.thumbPath(src)){skipped++;continue;}
   status.textContent='Generating '+(successes+failures+skipped+1)+' of '+rows.length+'…';
   try{
    const bucket=db.storage.from('seller-product-media');
    const url=bucket.getPublicUrl(src).data.publicUrl;
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('Source image unavailable ('+response.status+')');
    const blob=await response.blob();
    if(blob.size>15*1024*1024)throw Error('Source exceeds safe image limit');
    const mime=blob.type.split(';')[0];
    if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Unsupported original image format');
    const image=await optimizer.optimize(blob,{max:360,quality:.76,target:55*1024});
    const stored=await bucket.upload(target,image,{upsert:false,contentType:'image/webp',cacheControl:'86400'});
    if(stored.error){if(/already exists|duplicate|409/i.test(stored.error.message||'')){skipped++;continue;}throw stored.error;}
    successes++;
   }catch(err){failures++;console.warn('LEOGO image thumbnail failed:',src,err);}
  }
  status.textContent='Completed: '+successes+' created, '+skipped+' skipped, '+failures+' failed.'+(rows.length===100?' Run again for the next batch.':'');
 }catch(error){status.textContent='Thumbnail process unavailable: '+(error.message||'Connection error');}
 finally{running=false;refresh();}
});
})();

(() => {
'use strict';
const grid=document.getElementById('exploreCategoryGrid');if(!grid||!window.supabase?.createClient)return;
const db=window.supabase.createClient('https://dzdciuqkqixwutvtfotj.supabase.co','sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const media=db.storage.from('category-public-media');
async function display(){
 const {data,error}=await db.rpc('customer_category_images');if(error||!Array.isArray(data))return;
 for(const record of data){const card=[...grid.querySelectorAll('[data-product-category-code]')].find(node=>node.dataset.productCategoryCode===record.code);if(!card||!record.image_path)continue;
 const url=media.getPublicUrl(record.image_path).data.publicUrl;if(!url)continue;
 let img=card.querySelector('.leogo-category-profile-picture');
 if(!img){img=document.createElement('img');img.className='leogo-category-profile-picture';img.alt='';img.loading='lazy';img.style.cssText='display:block;width:64px;height:64px;max-width:100%;object-fit:contain;border-radius:10px;margin-inline:auto';card.prepend(img);}
 img.src=url;const symbol=[...card.children].find(c=>c.tagName==='SPAN');if(symbol)symbol.style.display='none';
 }
}
const observer=new MutationObserver(()=>{clearTimeout(window.__leogoCategoryPictureDebounce);window.__leogoCategoryPictureDebounce=setTimeout(display,300);});
observer.observe(grid,{childList:true});display();
})();
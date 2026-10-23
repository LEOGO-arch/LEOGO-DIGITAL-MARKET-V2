(() => {
'use strict';
const db=window.leogoAdminDb, list=document.getElementById('adminCatalogueCategoryList');
if(!db||!list)return;
const host=document.createElement('section');host.style.cssText='border:1px solid #dbe3ed;border-radius:14px;padding:16px;margin:12px 0 18px;background:#f8fafc';
host.innerHTML='<strong>Manage Categories & Sub-categories</strong><p style="margin:6px 0 12px">Create or rename categories without changing existing product approvals. Disable unused categories instead of deleting them.</p>'+
'<form id="taxonomyAdminForm" style="display:grid;gap:10px;max-width:650px">'+
'<label>Manage <select name="entity"><option value="category">Category</option><option value="subcategory">Sub-category</option></select></label>'+
'<label>Operation <select name="mode"><option value="create">Add new</option><option value="edit">Edit existing</option></select></label>'+
'<label class="taxonomy-parent-field" hidden>Parent category <select name="parent"></select></label>'+
'<label class="taxonomy-existing-field" hidden>Existing entry <select name="existing"></select></label>'+
'<label class="taxonomy-photo-field">Category picture (optional) <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><div id="taxonomyPicturePreview" style="width:116px;height:116px;border-radius:12px;border:1px solid #d9e2ed;display:grid;place-items:center;overflow:hidden;background:#fff"></div>'+
'<label>Name <input name="title" required minlength="2" maxlength="100" placeholder="Category name" autocomplete="off"></label>'+
'<label><input type="checkbox" name="active" checked> Active (available in seller catalogue)</label>'+
'<button type="submit" class="primary-button">Save Category</button><p id="taxonomyAdminFeedback" role="status" aria-live="polite"></p></form>';
list.before(host);
const form=host.querySelector('form'), note=host.querySelector('#taxonomyAdminFeedback');
let categories=[];
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allEntries=()=>form.elements.entity.value==='category'?categories:categories.flatMap(c=>(c.subcategories||[]).map(s=>({...s,parent_name:c.name,category_id:c.id})));
function refresh(){
 const sub=form.elements.entity.value==='subcategory',editing=form.elements.mode.value==='edit';
 host.querySelector('.taxonomy-parent-field').hidden=!sub||editing;
 host.querySelector('.taxonomy-photo-field').hidden=sub;
 host.querySelector('#taxonomyPicturePreview').hidden=sub;
 host.querySelector('.taxonomy-existing-field').hidden=!editing;
 form.elements.parent.innerHTML=categories.filter(c=>c.is_assignable&&!c.is_aggregator&&c.code!=='pharmacy').map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
 form.elements.existing.innerHTML=allEntries().map(e=>'<option value="'+escapeHtml(e.id)+'">'+escapeHtml(e.parent_name?e.parent_name+' — '+e.name:e.name)+'</option>').join('');
 selectEntry();
}
function selectEntry(){
 if(form.elements.mode.value!=='edit'){form.elements.title.value='';form.elements.active.checked=true;host.querySelector('#taxonomyPicturePreview').textContent='No photo';return;}
 const e=allEntries().find(e=>e.id===form.elements.existing.value);
 if(e){form.elements.title.value=e.name;form.elements.active.checked=!!e.is_active;}
 const preview=host.querySelector('#taxonomyPicturePreview');preview.textContent='No photo';
 if(!e?.image_path)return;const url=db.storage.from('category-public-media').getPublicUrl(e.image_path).data.publicUrl;const img=document.createElement('img');img.src=url;img.alt='Current category picture';img.style.cssText='width:100%;height:100%;object-fit:contain';preview.replaceChildren(img);
}
let taxonomyLoadPending=null;
async function load(){
 const access=window.leogoAdminAccess?.();
 if(!access?.active||!(access.superAdmin||access.role==='admin'||access.permissions?.includes('products.read')))return;
 if(taxonomyLoadPending){await taxonomyLoadPending;if(window.leogoAdminAccess?.().epoch!==access.epoch)return;}
 taxonomyLoadPending=(async()=>{
  try {
   const {data,error}=await db.rpc('admin_list_catalogue_categories');
   if(error)throw error;
   if(!Array.isArray(data))throw Error('The category list response is invalid.');
   if(window.leogoAdminAccess?.().epoch!==access.epoch)return;
   categories=data;
   try {
    const images=await db.rpc('admin_category_images');
    if(window.leogoAdminAccess?.().epoch!==access.epoch)return;
    if(!images.error && Array.isArray(images.data)){
     const imageById=new Map(images.data.map(item=>[item.id,item.image_path]));
     for(const category of categories)if(imageById.has(category.id))category.image_path=imageById.get(category.id);
    }
   }catch(imageError){console.warn('Category pictures unavailable:',imageError);}
   refresh();
   note.textContent='';
  }catch(error){
   if(window.leogoAdminAccess?.().epoch!==access.epoch)return;
   console.warn('Category directory failed:',error);
   note.textContent='Unable to load categories: '+(error?.message||'Connection error')+'. Refresh the Admin page to retry.';
  }
 })();
 try{await taxonomyLoadPending;}finally{taxonomyLoadPending=null;}
}
form.elements.entity.onchange=refresh;form.elements.mode.onchange=refresh;form.elements.existing.onchange=selectEntry;
form.elements.photo.onchange=()=>{const file=form.elements.photo.files[0];if(!file)return;const url=URL.createObjectURL(file);const img=document.createElement('img');img.src=url;img.alt='New category picture preview';img.style.cssText='width:100%;height:100%;object-fit:contain';img.onload=()=>URL.revokeObjectURL(url);host.querySelector('#taxonomyPicturePreview').replaceChildren(img);};
form.onsubmit=async event=>{
 event.preventDefault(); const btn=form.querySelector('button[type=submit]');btn.disabled=true;note.textContent='Saving…';
 try {
 const args={p_entity:form.elements.entity.value,p_name:form.elements.title.value.trim(),p_active:form.elements.active.checked,p_id:form.elements.mode.value==='edit'?form.elements.existing.value:null,p_parent_id:form.elements.entity.value==='subcategory'&&form.elements.mode.value==='create'?form.elements.parent.value:null};
 const {data:saved,error}=await db.rpc('admin_manage_product_taxonomy',args);
 if(!error && saved?.id && args.p_entity==='category' && form.elements.photo.files[0]){
  try {
   const source=form.elements.photo.files[0];if(source.size>10*1024*1024)throw Error('Choose a picture below 10 MB');
   const bitmap=await createImageBitmap(source);const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,480,480);const ratio=Math.min(480/bitmap.width,480/bitmap.height);const width=Math.round(bitmap.width*ratio),height=Math.round(bitmap.height*ratio);ctx.drawImage(bitmap,(480-width)/2,(480-height)/2,width,height);bitmap.close();
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));if(!blob)throw Error('Unable to resize image');
   const path='categories/'+saved.id+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2)+'.webp';
   const uploaded=await db.storage.from('category-public-media').upload(path,blob,{contentType:'image/webp',upsert:false});if(uploaded.error)throw uploaded.error;
   const linked=await db.rpc('admin_set_category_image',{p_category_id:saved.id,p_image_path:path});if(linked.error)throw linked.error;
  } catch(photoError){btn.disabled=false;note.textContent='Category saved, but picture failed: '+photoError.message;return;}
 }
 if(error){note.textContent='Not saved: '+error.message;return;}
 note.textContent='Saved. Reloading directory and seller/customer taxonomy…';
 window.location.reload();
 } catch(error){note.textContent='Could not save category: '+(error?.message||'Unexpected error');}
 finally {btn.disabled=false;}
};
document.addEventListener('leogo:admin-access-change',()=>{categories=[];if(window.leogoAdminAccess?.().active)load();});
document.querySelector('[data-admin-view="products"]')?.addEventListener('click',load);
load();
})();
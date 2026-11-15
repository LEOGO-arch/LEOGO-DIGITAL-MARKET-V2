(()=>{'use strict';
const types=new Set(['image/jpeg','image/png','image/webp']);
function dimensions(w,h,max){const scale=Math.min(1,max/Math.max(w,h));return [Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))];}
function thumbPath(path){return typeof path==='string'&&/-opt\.webp$/.test(path)?path.replace(/-opt\.webp$/,'-thumb.webp'):null;}
function mediaPaths(paths){return [...new Set(paths.flatMap(p=>[p,thumbPath(p)].filter(Boolean)))];}
async function optimize(file,{max=1280,quality=.82,target=250*1024}={}){
 if(!types.has(file.type))throw Error('Choose a JPEG, PNG or WebP image.');
 const bitmap=await createImageBitmap(file);try{
 if(!bitmap.width||!bitmap.height)throw Error('Invalid image.');
 const canvas=document.createElement('canvas');let [w,h]=dimensions(bitmap.width,bitmap.height,max);
 for(let step=0;step<5;step++){
 canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,w,h);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',Math.max(.58,quality-step*.07)));
 if(!blob||blob.type!=='image/webp')throw Error('WebP conversion unavailable. Try a current browser.');
 if(blob.size<=target||step===4)return blob;
 w=Math.max(1,Math.round(w*.82));h=Math.max(1,Math.round(h*.82));
 }
 }finally{bitmap.close();}
}
window.leogoPublicImages={optimize,dimensions,thumbPath,mediaPaths};
})();

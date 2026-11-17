// LEOGO public Return, Refund & Exchange Policy. Existing HTML remains fallback.
(()=>{
 'use strict';
 const supabase=window.supabase?.createClient;
 if(!supabase)return;
 const client=supabase('https://dzdciuqkqixwutvtfotj.supabase.co','sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const article=document.querySelector('main article.paper');
 if(!article)return;
 const load=async()=>{
  const {data,error}=await client.rpc('public_get_return_refund_policy');
  if(error||!data||!Array.isArray(data.sections)||data.sections.length!==8)return;
  const d=new Date(data.effective_date+'T12:00:00Z');
  const date=Number.isNaN(d.valueOf())?data.effective_date:d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const eyebrow=document.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent='Customer information · Kenya';
  const h1=document.createElement('h1');h1.textContent='Return, Refund & Exchange Policy';
  const meta=document.createElement('p');meta.className='meta';meta.textContent='Effective date: '+date+' · '+data.introduction;
  const summary=document.createElement('div');summary.className='summary';
  const strong=document.createElement('strong');strong.textContent='At a glance: ';
  summary.append(strong,document.createTextNode(data.summary));
  article.replaceChildren(eyebrow,h1,meta,summary);
  for(const item of data.sections){
   const h=document.createElement('h2');h.textContent=item.heading;
   const p=document.createElement('p');p.className='policy-editable-text';p.textContent=item.body;
   article.append(h,p);
  }
 };
 void load().catch(e=>console.warn('Using bundled policy fallback',e?.message||e));
})();

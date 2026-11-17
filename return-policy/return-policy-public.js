// Published, read-only LEOGO customer policy. Preserve original page on API failure.
(()=>{
 'use strict';
 const url='https://dzdciuqkqixwutvtfotj.supabase.co/rest/v1/rpc/public_get_return_policy';
 const key='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
 const build=(body)=>{
   const root=document.createDocumentFragment();
   const segments=String(body||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
   for(const segment of segments){
     const lines=segment.split('\n').filter(Boolean);
     if(lines[0]?.startsWith('## ')){
       const title=document.createElement('h2');
       title.textContent=lines.join(' ').replace(/^## /,'');
       root.append(title);
     }else if(lines[0]?.startsWith('• ')){
       const list=document.createElement('ul');
       for(const line of lines){
         const item=document.createElement('li');
         item.textContent=line.replace(/^•\s*/,'');
         list.append(item);
       }
       root.append(list);
     }else{
       const p=document.createElement('p');
       p.textContent=segment.replace(/\n/g,' ');
       root.append(p);
     }
   }
   return root;
 };
 const refresh=async()=>{
   const controller=new AbortController();
   const stop=setTimeout(()=>controller.abort(),10000);
   try{
     const response=await fetch(url,{method:'POST',headers:{'apikey':key,'Content-Type':'application/json'},body:'{}',signal:controller.signal,cache:'no-store'});
     if(!response.ok)throw Error('Unable to load published policy');
     const policy=await response.json();
     if(!policy || typeof policy.body!=='string'||!policy.title||!policy.summary)return;
     const body=document.getElementById('returnPolicyDynamic');
     body.replaceChildren(build(policy.body));
     document.getElementById('returnPolicyPublicTitle').textContent=policy.title;
     document.getElementById('returnPolicyPublicMeta').textContent='Effective date: '+
       new Date(policy.effective_date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})+
       ' · '+policy.applicability;
     const summary=document.getElementById('returnPolicyPublicSummary');
     summary.replaceChildren();
     const strong=document.createElement('strong');strong.textContent='At a glance: ';
     summary.append(strong,document.createTextNode(policy.summary.replace(/^At a glance:\s*/i,'')));
     body.hidden=false;
     document.getElementById('returnPolicyStatic').hidden=true;
   }catch(error){console.warn('Showing original policy text:',error.message);}
   finally{clearTimeout(stop);}
 };
 void refresh();
})();

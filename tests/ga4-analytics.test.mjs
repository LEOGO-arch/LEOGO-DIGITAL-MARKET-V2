import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/ga4-analytics.js',import.meta.url),'utf8');
const homepage=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function run(id,existing=null,dnt='0'){
  const nodes=[],requests=[],writes=[],storage=new Map(existing===null?[]:[['leogo-ga4-consent-v1',existing]]);
  const make=tag=>({
    tagName:tag.toUpperCase(),children:[],style:{cssText:''},hidden:false,
    appendChild(x){this.children.push(x);return x;},
    setAttribute(k,v){this[k]=v;},
    addEventListener(k,fn){this['on'+k]=fn;}
  });
  const window={doNotTrack:dnt,dataLayer:[]};
  const document={
    currentScript:{getAttribute:k=>k==='data-measurement-id'?id:null},
    readyState:'complete',createElement:make,
    head:{appendChild:x=>{if(x.src)requests.push(x.src);}},
    body:{appendChild:x=>nodes.push(x)}
  };
  const context={window,document,navigator:{doNotTrack:dnt},localStorage:{
    getItem:k=>storage.get(k)??null,
    setItem:(k,v)=>{storage.set(k,v);writes.push([k,v]);}
  },Date,encodeURIComponent};
  vm.runInNewContext(source,context,{timeout:1000});
  return {nodes,requests,writes,storage,window};
}
test('without a valid measurement ID the integration is completely inert',()=>{
  for(const id of ['', 'G-TEST', 'UA-123456', 'G-abc_123']){
    const h=run(id);assert.equal(h.nodes.length,0);assert.equal(h.requests.length,0);
    assert.equal(h.writes.length,0);assert.equal(h.window.gtag,undefined);
  }
  assert.match(homepage,/src="js\/ga4-analytics\.js[^"]*" data-measurement-id="" defer/);
  assert.match(homepage,/src="js\/customer-traffic\.js/);
});
test('decline prevents Google tag and persists the choice',()=>{
  const h=run('G-ABC12345');
  assert.equal(h.requests.length,0);
  assert.equal(h.nodes.length,2);
  const decline=h.nodes[0].children[1].children[0];
  assert.equal(decline.textContent,'Decline analytics');
  decline.onclick();
  assert.equal(h.storage.get('leogo-ga4-consent-v1'),'declined');
  assert.equal(h.requests.length,0);
  assert.equal(h.nodes[0].hidden,true);
  assert.equal(run('G-ABC12345','declined').requests.length,0);
});
test('visitor opt-in loads tag once; URL and analytics events are sanitized',()=>{
  const h=run('G-ABC12345'),bar=h.nodes[0];
  assert.equal(h.requests.length,0);
  bar.children[1].children[1].onclick();
  assert.deepEqual(h.requests,['https://www.googletagmanager.com/gtag/js?id=G-ABC12345']);
  assert.equal(h.storage.get('leogo-ga4-consent-v1'),'accepted');
  const calls=h.window.dataLayer;
  assert.equal(calls[0][0],'consent');assert.equal(calls[0][1],'default');
  assert.equal(calls[0][2].analytics_storage,'denied');
  assert.equal(calls[1][1],'update');assert.equal(calls[1][2].analytics_storage,'granted');
  assert.equal(calls.find(x=>x[0]==='config')[2].send_page_view,false);
  assert.equal(calls.find(x=>x[0]==='config')[2].allow_google_signals,false);
  assert.equal(calls.find(x=>x[0]==='config')[2].allow_ad_personalization_signals,false);
  const event=calls.find(x=>x[0]==='event');
  assert.equal(event[1],'page_view');
  assert.equal(event[2].page_location,'https://leogo.co.ke/');
  assert.equal(event[2].page_referrer,'');
  assert.equal(event[2].page_title,'LEOGO Digital Market');
  assert.equal(bar.hidden,true);
  h.nodes[1].onclick();
  bar.children[1].children[0].onclick();
  assert.equal(calls.at(-1)[1],'update');
  assert.equal(calls.at(-1)[2].analytics_storage,'denied');
  assert.equal(h.requests.length,1);
});
test('Do Not Track disables even previously consented users',()=>{
  const h=run('G-ABC12345','accepted','1');
  assert.equal(h.nodes.length,0);assert.equal(h.requests.length,0);
});

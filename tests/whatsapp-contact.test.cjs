const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/whatsapp-contact.js','utf8');
let value='+254700192545',failure=false,blocked=false,calls=0,opened=[],alerts=[];
const window={leogoAuth:{client:{rpc:async name=>{assert.equal(name,'get_public_whatsapp_contact');calls++;if(failure)throw Error('offline');return {data:{whatsapp_number:value}};}}},open:()=>{if(blocked)return null;const p={opener:{},location:{replace:url=>p.url=url},close:()=>p.closed=true};opened.push(p);return p;},alert:x=>alerts.push(x),addEventListener:()=>{}};
vm.runInNewContext(source,{window,document:{querySelector:()=>null}});
(async()=>{
 const message='Order #ABC\nTotal KSh 1,000 & location';
 await window.leogoWhatsApp.open(message);assert.equal(opened.at(-1).url,'https://wa.me/254700192545?text='+encodeURIComponent(message));assert.equal(opened.at(-1).opener,null);
 value='0712 345 678';await window.leogoWhatsApp.open(message);assert.match(opened.at(-1).url,/wa.me\/254712345678\?/);
 value='001234567890';await window.leogoWhatsApp.open();assert.equal(opened.at(-1).url,'https://wa.me/1234567890');
 for(value of ['',null,'https://bad.example/254712345678','abc0712345678','000','+0']){await window.leogoWhatsApp.open(message);assert.equal(opened.at(-1).closed,true);assert.equal(opened.at(-1).url,undefined);}
 failure=true;await window.leogoWhatsApp.open(message);assert.equal(opened.at(-1).closed,true);assert.match(alerts.at(-1),/Could not load/);
 blocked=true;const before=calls;await window.leogoWhatsApp.open(message);assert.equal(calls,before);assert.match(alerts.at(-1),/allow/);
 const app=fs.readFileSync('js/app.js','utf8');assert.doesNotMatch(app,/wa\.me\/254700192545/);assert.match(app,/leogoWhatsApp\.open\(message\)/);
 console.log('PASS: fresh recipient per order, Kenyan/international formatting, intact encoded message, invalid contact/network failure, popup blocking, no hardcoded checkout recipient.');
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs');
const vm=require('node:vm');

const customerHtml=fs.readFileSync('index.html','utf8');
const partnerHtml=fs.readFileSync('partner/index.html','utf8');
const customerJs=fs.readFileSync('js/premium.js','utf8');
const partnerJs=fs.readFileSync('partner/partner.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003181500_premium_chat_single_photo.sql','utf8');

new vm.Script(customerJs,{filename:'js/premium.js'});
new vm.Script(partnerJs,{filename:'partner/partner.js'});

const required=[
  [customerHtml,'id="premiumPeerPhotoInput"'],
  [customerHtml,'accept="image/jpeg,image/png,image/webp"'],
  [partnerHtml,'id="premiumPartnerPhotoInput"'],
  [partnerHtml,'accept="image/jpeg,image/png,image/webp"'],
  [customerJs,"from('premium-chat-media').upload"],
  [partnerJs,"from('premium-chat-media').upload"],
  [customerJs,'p_photo_path:uploadedPath||null'],
  [partnerJs,'p_photo_path:uploadedPath||null'],
  [customerJs,"message.body||''"],
  [partnerJs,"message.body||''"],
  [migration,"add column if not exists photo_path text"],
  [migration,"'premium-chat-media'"],
  [migration,"5242880"],
  [migration,"array['image/jpeg','image/png','image/webp']"],
  [migration,'returns table(message_id uuid,sender_role text,body text,photo_path text,created_at timestamptz)'],
  [migration,'p_photo_path text'],
  [migration,"values(v_request.id,v_uid,v_role,case when v_body='' then '[Photo]' else v_body end,v_photo)"]
];
for(const [source,marker] of required){
  if(!source.includes(marker))throw new Error('Missing Premium single-photo safeguard: '+marker);
}
if(customerHtml.includes('id="premiumPeerChatMessage" rows="2" maxlength="2000" placeholder="Type a private message…" required')){
  throw new Error('Customer chat textarea must not require text when sending a photo-only message');
}
if(partnerHtml.includes('id="premiumPartnerChatMessage" rows="2" maxlength="2000" placeholder="Type a private message…" required')){
  throw new Error('Partner chat textarea must not require text when sending a photo-only message');
}
console.log('premium private chat single-photo regression checks passed');

const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20261005183000_fix_premium_storage_policy_permissions.sql',
  'utf8'
);

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(migration.includes('current_user_can_read_premium_chat_media'),'Secure Premium chat media read helper missing.');
must(migration.includes('current_user_can_upload_premium_chat_media'),'Secure Premium chat media upload helper missing.');
must(migration.includes('premium_chat_media_is_referenced'),'Secure Premium chat media reference helper missing.');

const readPolicy=migration.match(/create policy premium_chat_media_participant_read[\s\S]*?;\n/);
must(readPolicy,'Premium chat media read policy missing.');
must(!readPolicy[0].includes('from public.premium_chat_messages'),'Storage read policy must not directly query restricted premium_chat_messages.');
must(readPolicy[0].includes('private.current_user_can_read_premium_chat_media'),'Storage read policy must use the SECURITY DEFINER helper.');

const deletePolicy=migration.match(/create policy premium_chat_media_sender_cleanup[\s\S]*?;\n/);
must(deletePolicy,'Premium chat media cleanup policy missing.');
must(!deletePolicy[0].includes('from public.premium_chat_messages'),'Storage cleanup policy must not directly query restricted premium_chat_messages.');

console.log('Premium storage policy permission regression checks passed.');

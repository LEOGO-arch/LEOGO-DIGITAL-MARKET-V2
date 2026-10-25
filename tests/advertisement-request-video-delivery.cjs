const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('js/app.js','utf8');
const auth = fs.readFileSync('js/auth.js','utf8');
const admin = fs.readFileSync('admin/advertisements.js','utf8');
const adminHtml = fs.readFileSync('admin/index.html','utf8');
const customerHtml = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('css/style.css','utf8');
const migration = fs.readFileSync('supabase/migrations/20261025053000_advertisement_requests_admin_review.sql','utf8');

for (const [name, source] of Object.entries({app,auth,admin})) new vm.Script(source,{filename:name});

const must=(condition,message)=>{if(!condition)throw new Error(message);};

must(!app.includes('Form design complete. Live submission'),'Advertisement request must no longer be a visual-only form.');
must(app.includes("client.rpc('customer_submit_advertisement_request'"),'Customer form must submit to the secure RPC.');
must(app.includes("media.controls = true"),'Customer short videos must expose playback controls.');
must(app.includes("media.preload = 'metadata'"),'Customer short videos must load metadata for playback.');
must(app.includes("if (advertisementPoster.querySelector('video')) return"),'Native video controls must not open the lightbox.');
must(auth.indexOf('window.leogoAuth =') < auth.indexOf("document.addEventListener('submit'"),'Shared auth client must be exposed before form handlers run.');
must(admin.includes("db.rpc('admin_list_advertisement_requests')"),'Admin must load submitted advertisement requests.');
must(admin.includes("db.rpc('admin_update_advertisement_request'"),'Admin must be able to save review status and notes.');
must(adminHtml.includes('id="advertisementRequestList"'),'Advertisement review queue must exist in Admin.');
must(customerHtml.includes('js/app.js?v=advert-request-video-delivery-1'),'Customer app cache must be refreshed.');
must(css.includes('.advertisement-poster.has-live-poster video'),'Short video must receive responsive styling.');
must(css.includes('object-fit:contain'),'Short video must keep the full frame visible.');
must(migration.includes('alter table public.advertisement_requests enable row level security'),'Request records must use row level security.');
must(migration.includes('revoke all on table public.advertisement_requests from public, anon, authenticated'),'Personal request data must not be directly readable from the API.');
must(migration.includes("private.is_leogo_admin('settings.manage')"),'Admin-only RPCs must enforce the LEOGO admin permission.');
must(migration.includes('grant execute on function public.customer_submit_advertisement_request(text,text,text) to authenticated'),'Only signed-in customers may submit requests.');

console.log('Advertisement submission, review, and short-video regression checks passed.');

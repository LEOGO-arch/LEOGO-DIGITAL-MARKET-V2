const fs=require('node:fs');
const vm=require('node:vm');

const adminJs=fs.readFileSync('admin/advertisements.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const appJs=fs.readFileSync('js/app.js','utf8');
const customerHtml=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/style.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261005204500_advertisement_three_second_popup.sql','utf8');

new vm.Script(adminJs,{filename:'admin/advertisements.js'});
new vm.Script(appJs,{filename:'js/app.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(adminHtml.includes('id="advertisementPopupAutoClose3s"'),'Admin 3-second pop-up toggle missing.');
must(adminHtml.includes('advertisements.js?v=advert-popup-3s-1'),'Admin advertisement cache marker missing.');
must(adminJs.includes("popup_auto_close_seconds: $('#advertisementPopupAutoClose3s')?.checked ? 3 : 0"),'Admin must save 3-second pop-up setting.');
must(adminJs.includes("$('#advertisementPopupOnEntry').checked = true"),'Timed pop-up must also enable website pop-up.');
must(adminJs.includes('Auto-close 3s'),'Advertisement history must show timed pop-up status.');

must(appJs.includes('advertisement-lightbox-countdown'),'Customer countdown element missing.');
must(appJs.includes("advertisementLightboxCountdown.textContent = 'Closing in ' + remaining + 's'"),'Customer countdown text missing.');
must(appJs.includes('remaining -= 1'),'Customer countdown decrement missing.');
must(appJs.includes('closeAdvertisementLightbox({restoreFocus:false})'),'Customer auto-close action missing.');
must(appJs.includes('advertisement.popup_auto_close_seconds'),'Customer must read Admin timed pop-up setting.');
must(css.includes('.advertisement-lightbox-countdown'),'Customer countdown styling missing.');
must(customerHtml.includes('js/app.js?v=advert-popup-3s-1'),'Customer app cache marker missing.');
must(customerHtml.includes('css/style.css?v=advert-popup-3s-1'),'Customer CSS cache marker missing.');

must(migration.includes('popup_auto_close_seconds smallint not null default 0'),'Database timed pop-up setting missing.');
must(migration.includes('check (popup_auto_close_seconds in (0,3))'),'Database must restrict auto-close timing to off or 3 seconds.');
must(migration.includes("'popup_auto_close_seconds',a.popup_auto_close_seconds"),'Public advertisement response must include timed pop-up setting.');
must(migration.includes("v_popup=true"),'Timed mode must preserve existing website pop-up behavior.');

console.log('Advertisement 3-second pop-up regression checks passed.');

const fs=require('node:fs');
const vm=require('node:vm');

const adminJs=fs.readFileSync('admin/advertisements.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const appJs=fs.readFileSync('js/app.js','utf8');
const customerHtml=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('css/style.css','utf8');
const baseMigration=fs.readFileSync('supabase/migrations/20261005204500_advertisement_three_second_popup.sql','utf8');
const upgradeMigration=fs.readFileSync('supabase/migrations/20261005212500_advertisement_popup_five_seconds_and_repush.sql','utf8');

new vm.Script(adminJs,{filename:'admin/advertisements.js'});
new vm.Script(appJs,{filename:'js/app.js'});

const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(adminHtml.includes('id="advertisementPopupAutoClose5s"'),'Admin 5-second pop-up toggle missing.');
must(adminHtml.includes('advertisements.js?v=advert-popup-5s-load-1'),'Admin advertisement cache marker missing.');
must(adminJs.includes("popup_auto_close_seconds: $('#advertisementPopupAutoClose5s')?.checked ? 5 : 0"),'Admin must save 5-second pop-up setting.');
must(adminJs.includes("$('#advertisementPopupOnEntry').checked = true"),'Timed pop-up must also enable website pop-up.');
must(adminJs.includes('Auto-close 5s'),'Advertisement history must show 5-second timed pop-up status.');

must(appJs.includes('const waitForAdvertisementImage = async'),'Customer must wait for the poster image before opening.');
must(appJs.includes('image.loading = advertisement.popup_on_entry ? \'eager\' : \'lazy\''),'Pushed advert image must load eagerly.');
must(appJs.includes("image.fetchPriority = 'high'"),'Pushed advert image must use high fetch priority.');
must(appJs.includes('const ready = await waitForAdvertisementImage(advertisementLightboxImage)'),'Lightbox must wait until poster is ready.');
must(appJs.includes('advertisementLightbox.hidden = false'),'Lightbox should open only after image readiness check.');
must(appJs.includes('const seconds = Number(autoCloseSeconds) === 5 ? 5 : 0'),'Customer timer must be five seconds.');
must(appJs.includes("advertisementLightboxCountdown.textContent = 'Closing in ' + remaining + 's'"),'Customer countdown text missing.');
must(appJs.includes('closeAdvertisementLightbox({restoreFocus:false})'),'Customer auto-close action missing.');
must(appJs.includes('}, 75);'),'Automatic pop-up startup delay should be reduced.');
must(appJs.includes('configuredSeconds === 5 || configuredSeconds === 3 ? 5 : 0'),'Legacy 3-second data must safely behave as 5 seconds during rollout.');
must(css.includes('.advertisement-lightbox-countdown'),'Customer countdown styling missing.');
must(customerHtml.includes('js/app.js?v=advert-popup-5s-load-1'),'Customer app cache marker missing.');

must(baseMigration.includes('popup_auto_close_seconds'),'Original timed pop-up migration must remain in history.');
must(upgradeMigration.includes('where popup_auto_close_seconds=3'),'Upgrade must migrate existing 3-second adverts.');
must(upgradeMigration.includes('popup_revision=coalesce(popup_revision,0)+1'),'Migrated live pop-ups must be re-pushed to customers.');
must(upgradeMigration.includes('check (popup_auto_close_seconds in (0,5))'),'Database must restrict timed auto-close to off or five seconds.');
must(upgradeMigration.includes('v_requested_auto_close in (3,5) then 5'),'Save function must normalize legacy three-second input to five seconds.');

console.log('Advertisement faster-load + five-second pop-up regression checks passed.');

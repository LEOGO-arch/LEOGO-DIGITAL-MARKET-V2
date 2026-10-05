const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin/admin.js','utf8');
const css=fs.readFileSync('admin/admin.css','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

new vm.Script(admin,{filename:'admin/admin.js'});
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

must(admin.includes("profile_picture_path"),'Premium profile loader must fetch profile picture path.');
must(admin.includes("db.storage.from('premium-profile-media').createSignedUrl"),'Admin must load Premium profile pictures securely.');
must(admin.includes('premium-profile-identity'),'Premium profile identity layout missing.');
must(css.includes('.premium-profile-avatar'),'Premium profile avatar styles missing.');
must(css.includes('.premium-profile-name strong'),'Premium profile readable-name styles missing.');
must(css.includes('overflow-wrap:normal'),'Premium profile name must not break letter-by-letter on mobile.');
must(css.includes('.premium-profile-row .premium-profile-cell{grid-column:1/-1;grid-template-columns:1fr!important'),'Premium profile mobile first row must have full-width identity layout.');
must(html.includes('admin.css?v=premium-profile-card-compact-2'),'Admin Premium CSS cache version missing.');
must(html.includes('admin.js?v=premium-profile-details-1'),'Admin Premium JS cache version missing.');


must(html.includes('<th>Approved</th><th>Action</th>'),'Premium Profiles table must expose an Admin action after approval.');
must(admin.includes('data-premium-profile-view'),'Premium Profile rows must include View Details actions.');
must(admin.includes("db.from('premium_profile_details').select('*')"),'Retained Premium profile details query missing.');
must(admin.includes("db.from('premium_identity_details').select('*')"),'Retained Premium identity query missing.');
must(admin.includes("db.from('premium_profile_gallery').select('*')"),'Retained Premium gallery query missing.');
must(html.includes('id="premiumProfileRecordModal"'),'Retained Premium Profile details modal missing.');

console.log('Premium profile Admin mobile/photo regression checks passed.');

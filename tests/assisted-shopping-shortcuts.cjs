const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('js/assisted-shopping.js','utf8');
const css=fs.readFileSync('css/style.css','utf8');

new vm.Script(js,{filename:'js/assisted-shopping.js'});

const must=(ok,message)=>{if(!ok)throw new Error(message);};
const count=(text,needle)=>text.split(needle).length-1;

must(count(html,'id="assistedShoppingModal"')===1,'Assisted Shopping modal must stay unique.');
must(count(html,'id="openAssistedShopping"')===1,'Legacy Assisted Shopping quick-link id must stay unique.');
must(count(html,'data-open-assisted-shopping')>=3,'Home, dashboard and existing Assisted Shopping shortcuts must all be present.');
must(html.includes('class="assisted-shopping-feature-shortcut"'),'Customer-front Assisted Shopping shortcut missing.');
must(html.includes('class="dashboard-assisted-shopping-shortcut" data-open-assisted-shopping data-close-customer-shell'),'Customer dashboard Assisted Shopping shortcut must close dashboard shell and open existing workflow.');
must(js.includes("document.querySelectorAll('[data-open-assisted-shopping]')"),'Assisted Shopping must support multiple entry points.');
must(js.includes('openButtons.forEach'),'All Assisted Shopping shortcuts must bind to the same existing modal.');
must(html.includes('css/style.css?v=assisted-shopping-shortcuts-1'),'Assisted Shopping shortcut stylesheet cache version missing.');
must(html.includes('js/assisted-shopping.js?v=assisted-shopping-shortcuts-1'),'Assisted Shopping shortcut script cache version missing.');
must(css.includes('.assisted-shopping-feature-shortcut'),'Customer-front Assisted Shopping shortcut styles missing.');
must(css.includes('.dashboard-assisted-shopping-shortcut'),'Dashboard Assisted Shopping shortcut styles missing.');

console.log('Assisted Shopping shortcut regression checks passed.');

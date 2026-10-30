const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const renderer=fs.readFileSync(path.join(__dirname,'../js/wallet-statement-pdf.js'),'utf8');
const wallet=fs.readFileSync(path.join(__dirname,'../js/wallet.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(html,/js\/wallet-statement-pdf\.js\?v=branded-statement-1/);
assert.match(wallet,/await window\.leogoWalletStatementPdf\.generate/);
assert.match(wallet,/else await downloadStatementPdf\(statementEntries\)/);

class MockPDF{
  constructor(){this.pages=1;this.current=1;this.writes=[];}
  setFillColor(){}rect(){}roundedRect(){}setDrawColor(){}line(){}
  setFont(){}setFontSize(){}setTextColor(){}addImage(){}
  text(value){this.writes.push(String(value));}
  splitTextToSize(value,width){const chars=Math.max(8,Math.floor(width*1.8));return String(value).match(new RegExp('.{1,'+chars+'}','g'))||[''];}
  addPage(){this.pages++;}getNumberOfPages(){return this.pages;}
  setPage(page){this.current=page;}
  output(format){assert.equal(format,'blob');return {type:'application/pdf',pages:this.pages};}
}
const context={window:{jspdf:{jsPDF:MockPDF}},Image:class{set src(value){this.onerror();}}};
vm.runInNewContext(renderer,context);
const rows=Array.from({length:80},(_,i)=>({created_at:'2026-10-30T10:00:00Z',entry_type:'normal_saving',statement_label:'A recorded customer savings deposit',external_reference:'REFERENCE-'+i,cash_credit:100,cash_debit:0,rewards_credit:0,rewards_debit:0,running_cash_balance:100*(i+1),running_rewards_balance:0}));
context.window.leogoWalletStatementPdf.generate({statement:{rows,fromValue:'2026-10-01',toValue:'2026-10-30',openingCash:0,closingCash:8000,openingRewards:0,closingRewards:0},customer:'Example Customer',prettyStatus:()=> 'Normal Saving',kenyaDateTime:()=> '30 Oct 2026'}).then(blob=>{
 assert.ok(blob.pages>1,'Long statements must paginate');
 console.log('Branded statement PDF renderer and multi-page regression checks passed.');
}).catch(error=>{console.error(error);process.exitCode=1;});

// Presentation only: cash/reward balances, fees and transaction rows come from the existing wallet ledger.
(() => {
  'use strict';
  const carePhone='0700 192 545';
  const careEmail='leogodigitalmarket@gmail.com';
  const navy=[12,31,66], orange=[245,111,22], pale=[244,248,253], grey=[95,109,129];
  const number=value=>Number(value||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signed=(credit,debit)=>{
    const value=Number(credit||0)-Number(debit||0);
    return value===0?'-':(value>0?'+':'-')+number(Math.abs(value));
  };
  const loadLogo=()=>new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;
        canvas.getContext('2d').drawImage(image,0,0,180,180);
        resolve(canvas.toDataURL('image/jpeg',0.84));
      }catch(_error){resolve(null);}
    };
    image.onerror=()=>resolve(null);
    image.src='assets/images/leogo-official-logo.jpg';
  });
  const wrapCell=(value,maxChars)=>{
    const words=String(value||'').split(/\s+/).filter(Boolean);
    const lines=[];let current='';
    for(let word of words){
      while(word.length>maxChars){
        if(current){lines.push(current);current='';}
        lines.push(word.slice(0,maxChars));word=word.slice(maxChars);
      }
      if(!word)continue;
      if(current&&current.length+word.length+1>maxChars){lines.push(current);current=word;}
      else current+=(current?' ':'')+word;
    }
    if(current)lines.push(current);
    return lines.length?lines:['-'];
  };

  const generate=async ({statement,customer,prettyStatus,kenyaDateTime,financialSnapshot})=>{
    const jsPDF=window.jspdf?.jsPDF;
    if(!jsPDF)throw new Error('PDF printing library is unavailable. Refresh and try again.');
    const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const logo=await loadLogo();
    const width=210,left=12,right=198,bottom=279;
    const columns=[
      {name:['Date &','Time'],x:13,w:26},
      {name:['Transaction /','Detail'],x:39,w:42},
      {name:'Reference',x:81,w:28},
      {name:['Transaction','Type / Source'],x:109,w:27},
      {name:'Paid In',x:136,w:19,right:true},
      {name:'Paid Out',x:155,w:19,right:true},
      {name:['Balance','C/F'],x:174,w:23,right:true}
    ];
    const put=(text,x,y,size=9,color=navy,style='normal',align='left')=>{
      pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);
      pdf.text(Array.isArray(text)?text:String(text??''),x,y,{align});
    };
    const line=(y)=>{pdf.setDrawColor(224,231,239);pdf.line(left,y,right,y);};
    const header=()=>{
      pdf.setFillColor(...navy);pdf.rect(0,0,width,23,'F');
      pdf.setFillColor(...orange);pdf.rect(0,23,width,1.5,'F');
      if(logo)pdf.addImage(logo,'JPEG',12,2.5,18,18);
      put('LEOGO DIGITAL MARKET',34,10,12,[255,255,255],'bold');
      put('SAVINGS & REWARDS STATEMENT',34,17,7.5,[255,208,172],'bold');
      put('CUSTOMER COPY',197,14,6.2,[255,255,255],'bold','right');
    };
    const footer=(page,total)=>{
      line(285);
      put('LEOGO DIGITAL MARKET  |  Customer Care: '+carePhone+'  |  '+careEmail,12,290,6.6,grey);
      put('Page '+page+' of '+total,198,290,6.6,grey,'normal','right');
      put('Balance C/F is in KSh for Cash and points for Rewards. Rewards are not withdrawable savings.',12,294,6,grey);
    };
    const tableHeader=(y)=>{
      pdf.setFillColor(...navy);pdf.roundedRect(left,y,right-left,11,1,1,'F');
      for(const col of columns)put(col.name,col.right?col.x+col.w-1:col.x,y+4,6.2,[255,255,255],'bold',col.right?'right':'left');
      return y+11;
    };
    header();
    put('ACCOUNT HOLDER',left,30,6,grey,'bold');
    put(customer,left,36,9,navy,'bold');
    put('STATEMENT PERIOD',83,30,6,grey,'bold');
    put((statement.fromValue||'Account opening')+' to '+(statement.toValue||'Present'),83,36,7);
    put('ISSUED',198,30,6,grey,'bold','right');
    put(kenyaDateTime(new Date()).split(',')[0],198,36,7,navy,'normal','right');
    const summaries=[
      ['OPENING SAVINGS',number(statement.openingCash)+' KSh'],
      ['CLOSING SAVINGS',number(statement.closingCash)+' KSh'],
      ['OPENING REWARDS',number(statement.openingRewards)+' pts'],
      ['CLOSING REWARDS',number(statement.closingRewards)+' pts'],
      ['LOAN BALANCE',number(financialSnapshot?.loanBalance||0)+' KSh'],
      ['SAVINGS WAITING APPROVAL',number(financialSnapshot?.savingsWaitingApproval||0)+' KSh']
    ];
    summaries.forEach(([label,value],index)=>{
      const x=left+(index%3)*63;
      const y=41+Math.floor(index/3)*15;
      pdf.setFillColor(...pale);pdf.roundedRect(x,y,60,13,1.5,1.5,'F');
      put(label,x+2.5,y+4.5,5.5,grey,'bold');put(value,x+2.5,y+10.5,8.2,index===1?orange:navy,'bold');
    });
    put('Rewards: Loyalty Points and Shopping Vouchers. 1 point = KSh 1 for eligible shopping.',left,75,6.6,grey);
    put('TRANSACTION HISTORY',left,83,9,navy,'bold');
    put(statement.rows.length+' recorded entries',right,83,6.8,grey,'normal','right');
    let y=tableHeader(87);
    for(let index=0;index<statement.rows.length;index++){
      const entry=statement.rows[index];
      const label=String(entry.statement_label||entry.description||'');
      const reward=(Number(entry.rewards_credit||0)!==0||Number(entry.rewards_debit||0)!==0);
      const detailLines=wrapCell(label||prettyStatus(entry.entry_type),24);
      const referenceLines=wrapCell(String(entry.external_reference||'-'),15);
      const dateLines=wrapCell(kenyaDateTime(entry.created_at),17);
      const rowHeight=Math.max(9,Math.max(detailLines.length,referenceLines.length,dateLines.length)*3.3+3);
      if(y+rowHeight>bottom){pdf.addPage();header();put('TRANSACTION HISTORY - CONTINUED',left,32,8,navy,'bold');y=tableHeader(37);}
      if(index%2===0){pdf.setFillColor(...pale);pdf.rect(left,y,right-left,rowHeight,'F');}
      const middle=y+4;
      put(dateLines,columns[0].x,middle,6.1);
      put(detailLines,columns[1].x,middle,6.1);
      put(referenceLines,columns[2].x,middle,5.9);
      put(reward?'Rewards':'Cash',columns[3].x,middle,6.5);
      const values=[
        number(reward?entry.rewards_credit:entry.cash_credit),
        number(reward?entry.rewards_debit:entry.cash_debit),
        number(reward?entry.running_rewards_balance:entry.running_cash_balance)
      ];
      values.forEach((value,i)=>{
        const col=columns[i+4];put(value,col.x+col.w-1,middle,6.2,navy,'normal','right');
      });
      y+=rowHeight;
      line(y);
    }
    const total=pdf.getNumberOfPages();
    for(let page=1;page<=total;page++){pdf.setPage(page);footer(page,total);}
    return pdf.output('blob');
  };
  window.leogoWalletStatementPdf={generate};
})();

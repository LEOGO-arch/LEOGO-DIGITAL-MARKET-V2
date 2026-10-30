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

  const generate=async ({statement,customer,prettyStatus,kenyaDateTime})=>{
    const jsPDF=window.jspdf?.jsPDF;
    if(!jsPDF)throw new Error('PDF printing library is unavailable. Refresh and try again.');
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const logo=await loadLogo();
    const width=297,height=210,left=14,right=283,bottom=186;
    const columns=[
      {name:'Date',x:16,w:29},
      {name:'Transaction / details',x:45,w:66},
      {name:'Reference',x:111,w:43},
      {name:'Cash +/-',x:154,w:28,right:true},
      {name:'Rewards +/-',x:182,w:30,right:true},
      {name:'Cash balance',x:212,w:34,right:true},
      {name:'Points balance',x:246,w:35,right:true}
    ];
    const put=(text,x,y,size=9,color=navy,style='normal',align='left')=>{
      pdf.setFont('helvetica',style);pdf.setFontSize(size);pdf.setTextColor(...color);
      pdf.text(String(text??''),x,y,{align});
    };
    const line=(y)=>{pdf.setDrawColor(224,231,239);pdf.line(left,y,right,y);};
    const header=()=>{
      pdf.setFillColor(...navy);pdf.rect(0,0,width,29,'F');
      pdf.setFillColor(...orange);pdf.rect(0,29,width,2,'F');
      if(logo)pdf.addImage(logo,'JPEG',15,3,24,24);
      put('LEOGO DIGITAL MARKET',44,13,17,[255,255,255],'bold');
      put('SAVINGS & REWARDS STATEMENT',44,22,10,[255,208,172],'bold');
      put('OFFICIAL CUSTOMER COPY',282,18,8,[255,255,255],'bold','right');
    };
    const footer=(page,total)=>{
      line(190);
      put('LEOGO DIGITAL MARKET  |  Customer Care: '+carePhone+'  |  '+careEmail,15,197,8,grey);
      put('Page '+page+' of '+total,282,197,8,grey,'normal','right');
      put('This statement reflects recorded LEOGO wallet activity. Reward points are not withdrawable cash.',15,204,7,grey);
    };
    const tableHeader=(y)=>{
      pdf.setFillColor(...navy);pdf.roundedRect(left,y,right-left,10,1.5,1.5,'F');
      for(const col of columns)put(col.name,col.right?col.x+col.w-2:col.x,y+6.5,8,[255,255,255],'bold',col.right?'right':'left');
      return y+10;
    };
    header();
    put('ACCOUNT HOLDER',left,39,7,grey,'bold');
    put(customer,left,46,12,navy,'bold');
    put('STATEMENT PERIOD',118,39,7,grey,'bold');
    put((statement.fromValue||'Account opening')+'  to  '+(statement.toValue||'Present'),118,46,10);
    put('ISSUED',282,39,7,grey,'bold','right');
    put(kenyaDateTime(new Date()),282,46,9,navy,'normal','right');
    const summaries=[
      ['OPENING SAVINGS',number(statement.openingCash)+' KSh'],
      ['CLOSING SAVINGS',number(statement.closingCash)+' KSh'],
      ['OPENING REWARDS',number(statement.openingRewards)+' pts'],
      ['CLOSING REWARDS',number(statement.closingRewards)+' pts']
    ];
    summaries.forEach(([label,value],index)=>{
      const x=left+index*68;
      pdf.setFillColor(...pale);pdf.roundedRect(x,51,65,21,2,2,'F');
      put(label,x+4,58,7,grey,'bold');put(value,x+4,67,12,index===1?orange:navy,'bold');
    });
    put('Rewards include Loyalty Points and Shopping Vouchers. 1 point = KSh 1 toward eligible shopping; points never increase withdrawable savings.',left,80,8,grey);
    put('TRANSACTION HISTORY',left,91,11,navy,'bold');
    put(statement.rows.length+' recorded entries',right,91,8,grey,'normal','right');
    let y=tableHeader(96);
    for(let index=0;index<statement.rows.length;index++){
      const entry=statement.rows[index];
      const label=String(entry.statement_label||entry.description||'');
      const description=prettyStatus(entry.entry_type)+(label?' - '+label:'');
      const detailLines=pdf.splitTextToSize(description,62);
      const referenceLines=pdf.splitTextToSize(String(entry.external_reference||'-'),39);
      const rowHeight=Math.max(11,Math.max(detailLines.length,referenceLines.length)*4.1+5);
      if(y+rowHeight>bottom){pdf.addPage();header();put('TRANSACTION HISTORY - CONTINUED',left,41,10,navy,'bold');y=tableHeader(47);}
      if(index%2===0){pdf.setFillColor(...pale);pdf.rect(left,y,right-left,rowHeight,'F');}
      const middle=y+6.5;
      put(kenyaDateTime(entry.created_at).split(',')[0],columns[0].x,middle,8);
      put(detailLines,columns[1].x,middle,7.7);
      put(referenceLines,columns[2].x,middle,7.3);
      const values=[
        signed(entry.cash_credit,entry.cash_debit),
        signed(entry.rewards_credit,entry.rewards_debit),
        number(entry.running_cash_balance),number(entry.running_rewards_balance)
      ];
      values.forEach((value,i)=>{
        const col=columns[i+3];put(value,col.x+col.w-2,middle,8,navy,'normal','right');
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

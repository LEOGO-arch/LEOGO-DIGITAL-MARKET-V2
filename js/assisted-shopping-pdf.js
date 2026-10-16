// LEOGO Assisted Shopping PDF download helper
(() => {
  'use strict';

  const safe=(value='')=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  const money=(value)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:2});
  const dateText=(value,withTime=false)=>{
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return safe(value);
    return new Intl.DateTimeFormat('en-KE',withTime
      ?{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}
      :{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(d);
  };
  const labelStatus=(value='')=>safe(String(value).replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase()));

  const printChoice=()=>{
    const format=window.prompt('LEOGO print paper: enter A4 or 80 for 80 mm thermal receipt. The connected printer paper size is selected in your device print dialog.','A4');
    if(format===null)return null;
    const selected=String(format).trim().toLowerCase();
    if(!['a4','80','80mm','thermal'].includes(selected))throw new Error('Choose A4 or 80 mm.');
    return ['80','80mm','thermal'].includes(selected)?'80mm':'a4';
  };
  const loadLogo=async()=>{
    const script=[...document.scripts].find(element=>element.src?.includes('assisted-shopping-pdf.js'));
    if(!script)return null;
    const url=new URL('../assets/images/leogo-official-logo.jpg',script.src).href;
    return new Promise(resolve=>{
      const picture=new Image();
      picture.onload=()=>resolve(picture);
      picture.onerror=()=>resolve(null);
      picture.src=url;
    });
  };
  const download=async(request,options={})=>{
    const JsPdf=window.jspdf?.jsPDF;
    if(!JsPdf)throw new Error('PDF generator is still loading. Try again in a moment.');
    if(!request)throw new Error('Shopping List data is not available.');

    const type=['checklist','quotation','label'].includes(options.documentType)?options.documentType:'checklist';
    const thermal=options.paper==='80mm';
    const doc=new JsPdf({unit:'mm',format:thermal?[80,210]:'a4'});
    const left=thermal?4:15;
    const right=thermal?76:195;
    const width=right-left;
    const bottom=thermal?199:282;
    let y=thermal?10:16;
    const logo=await loadLogo();
    if(logo){
      try{
        const logoWidth=thermal?17:27;
        const logoHeight=Math.min(thermal?14:21,logoWidth*logo.naturalHeight/logo.naturalWidth);
        doc.addImage(logo,'JPEG',left,y-5,logoWidth,logoHeight,undefined,'FAST');
        y+=logoHeight+1;
      }catch(error){console.warn('[LEOGO Print] Logo image could not be embedded:',error);}
    }
    doc.setTextColor(14,55,105);
    doc.setDrawColor(16,104,166);

    const ensure=(height=8)=>{
      if(y+height>bottom){
        doc.addPage();
        y=thermal?10:16;
      }
    };
    const line=(text,size=9,bold=false,indent=0)=>{
      const value=safe(text);
      if(!value)return;
      doc.setFont('helvetica',bold?'bold':'normal');
      doc.setFontSize(size);
      const parts=doc.splitTextToSize(value,width-indent);
      ensure(parts.length*(size*0.38)+3);
      doc.text(parts,left+indent,y);
      y+=parts.length*(size*0.38)+2.2;
    };
    const pair=(label,value)=>{
      ensure(7);
      doc.setFontSize(thermal?7:8);
      doc.setFont('helvetica','bold');
      if(thermal){
        doc.text(safe(label)+':',left,y);
        y+=3.6;
        const parts=doc.splitTextToSize(safe(value||'—'),width);
        ensure(parts.length*3.1+2);
        doc.setFont('helvetica','normal');
        doc.text(parts,left,y);
        y+=parts.length*3.1+1;
      }else{
        doc.text(safe(label)+':',left,y);
        doc.setFont('helvetica','normal');
        const parts=doc.splitTextToSize(safe(value||'—'),width-42);
        doc.text(parts,left+42,y);
        y+=Math.max(5,parts.length*3.6+1);
      }
    };
    // Compact one-line label/value fields on thermal paper, wrapping only when needed.
    const inlineFields=(values)=>{
      const content=values.filter(([label,value])=>value!=null&&String(value).trim()!=='').map(([label,value])=>safe(label)+': '+safe(value)).join('; ');
      if(content)line(content,7.3,false,0);
    };
    const originalChecklist=(text)=>{
      // Customer text may be a single paragraph containing several quantity-led items.
      // Add boundaries before later quantities (e.g. "2 kg sugar 1 bar soap").
      const original=String(text||'').replace(/\r\n?/g,'\n');
      const separated=original.replace(/([^\n;,•])\s+(?=\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gm|grams?|litres?|liters?|ltr|l|ml|pcs?|pieces?|packets?|packs?|barsoap|bars?|bottles?|loaf|loaves|tins?|dozens?)\b)/gi,'$1\n');
      const entries=separated.split(/\n|;|•|,(?=\s*[A-Za-z]|\s*\d+\s*[A-Za-z])/g)
        .map(value=>value.replace(/^\s*(?:[-*]|\d+[.)])\s*/,'').trim()).filter(Boolean);
      if(!entries.length){
        line('See uploaded shopping list attachment(s).',7.5);
        return;
      }
      for(const entry of entries){
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        const wrapped=doc.splitTextToSize(safe(entry),width-9);
        ensure(Math.max(5,wrapped.length*3.6+1.3));
        doc.setDrawColor(50);
        doc.setLineWidth(0.25);
        doc.rect(left+0.4,y-2.7,3.2,3.2);
        doc.text(wrapped,left+6,y);
        y+=Math.max(4.2,wrapped.length*3.6+1.3);
      }
    };
    const section=(title)=>{
      y+=2;
      ensure(9);
      doc.setDrawColor(210);
      doc.line(left,y,right,y);
      y+=5;
      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
      doc.text(safe(title),left,y);
      y+=5;
    };

    doc.setFont('helvetica','bold');
    doc.setFontSize(thermal?12:17);
    doc.text('LEOGO DIGITAL MARKET',left,y);
    y+=7;
    doc.setFontSize(thermal?8:13);
    doc.text(type==='quotation'?'PREPARED ITEMS / QUOTATION':type==='label'?'PARCEL DELIVERY LABEL':thermal?'ASSISTED SHOPPING LIST':'ASSISTED SHOPPING / SHOPPING LIST',left,y);
    y+=6;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text('Generated '+dateText(new Date().toISOString(),true),left,y);
    y+=7;

    pair('Request Reference',request.request_reference);
    pair('Status',labelStatus(request.status));
    if(options.assignedStaffName)pair('Assigned Staff',options.assignedStaffName);
    if(request.created_at)pair('Submitted',dateText(request.created_at,true));

    if(type==='quotation'){
      section('LEOGO PREPARED ITEMS / QUOTATION');
      const items=Array.isArray(request.items)?request.items:[];
      if(!items.length)line('Quotation has not been prepared. No items to print.',9);
      items.forEach((item,index)=>{
        line((index+1)+'. '+safe(item.item_name||'Item'),thermal?8:10,true);
        line('Requested: '+safe(item.requested_quantity||0)+' '+safe(item.unit_label||'')+
          '; Prepared: '+safe(item.prepared_quantity??0)+' '+safe(item.unit_label||'')+
          '; Status: '+labelStatus(item.item_status||'available'),thermal?7:8);
        line('Unit: '+money(item.unit_price_kes)+'; Total: '+money(item.line_total_kes),thermal?7:8);
        if(item.substitution_note)line('Note: '+item.substitution_note,thermal?7:8);
      });
      if(items.length){
        section('QUOTATION TOTALS');
        pair('Items Subtotal',money(request.items_subtotal_kes));
        pair('Assisted Shopping Fee',money(request.service_fee_kes));
        if(Number(request.pickup_fee_kes||0)>0)pair('Pickup Fee',money(request.pickup_fee_kes));
        pair('Delivery Fee',money(request.delivery_fee_kes));
        pair('GRAND TOTAL',money(request.grand_total_kes));
      }
      pair('Payment Status',labelStatus(request.payment_status||'not required'));
      if(request.order_reference)pair('Order Number',request.order_reference);
    }else if(type==='label'){
      // Only genuine marketplace order numbers can be encoded; never label unaccepted quotes.
      const orderNumber=safe(request.order_reference);
      if(!request.marketplace_order_id||!orderNumber)throw new Error('A delivery label requires an accepted quotation with a generated marketplace order number.');
      if(typeof window.QRCode!=='function')throw new Error('QR-code generator is unavailable. Refresh this page and retry.');
      section('SCAN ORDER NUMBER');
      const qrHost=document.createElement('div');
      qrHost.style.cssText='position:fixed;left:-2000px;top:0;background:white';
      document.body.appendChild(qrHost);
      try{
        new window.QRCode(qrHost,{text:orderNumber,width:240,height:240,correctLevel:window.QRCode.CorrectLevel.M});
        let imageData=null;
        for(let attempt=0;attempt<20;attempt++){
          const qrCanvas=qrHost.querySelector('canvas');
          const qrImg=qrHost.querySelector('img');
          if(qrCanvas?.width&&qrCanvas?.height)imageData=qrCanvas.toDataURL('image/png');
          else if(qrImg?.complete&&qrImg?.naturalWidth)imageData=qrImg.src;
          if(imageData?.startsWith('data:image/'))break;
          await new Promise(resolve=>window.setTimeout(resolve,100));
        }
        if(!imageData||!imageData.startsWith('data:image/'))throw new Error('QR-code image could not be generated.');
        const qrSize=thermal?43:50;
        ensure(qrSize+7);
        doc.addImage(imageData,'PNG',left+(width-qrSize)/2,y,qrSize,qrSize);
        y+=qrSize+3;
      }finally{qrHost.remove();}
      line('ORDER: '+orderNumber,thermal?10:12,true);
      pair('Shopping List',request.request_reference);
      section('DELIVER TO');
      pair('Receiver',request.receiver_name||request.customer_name);
      pair('Phone',request.contact_number||request.customer_phone);
      if(request.fulfilment_method==='pickup'){
        pair('Method','Pickup Station');
        pair('Pickup Station',request.pickup_station_name||'Selected station');
        if(request.pickup_station_address)pair('Station Address',request.pickup_station_address);
      }else{
        pair('Method','Customer Delivery');
        const address=[request.estate,request.sub_county,request.county].filter(Boolean).join(', ');
        pair('Delivery Address',address||'Delivery address missing — confirm with customer before dispatch');
        if(request.landmark)pair('Landmark',request.landmark);
        if(request.location_link)pair('Location',request.location_link);
      }
      section('PAYMENT');
      pair('Payment Method',labelStatus(request.payment_method));
      pair('Payment Status',labelStatus(request.order_payment_status||request.payment_status||'pending'));
      if(request.payment_method==='cod')pair('COD Payment','Collect outstanding amount as shown in Rider/Admin order payment details.');
    }else{
    if(thermal){
      section('CUSTOMER / RECEIVER');
      inlineFields([
        ['Customer',request.customer_name||request.receiver_name],
        ['Receiver',request.receiver_name],
        ['Phone',request.contact_number||request.customer_phone],
        ['Email',request.customer_email]
      ]);

      section('SHOPPING INSTRUCTIONS');
      inlineFields([
        ['Substitution',labelStatus(request.substitution_policy)],
        ['Budget',request.budget_kes!=null?money(request.budget_kes):'Not set'],
        ['Preferred',request.preferred_delivery_date?dateText(request.preferred_delivery_date):'Flexible'],
        ['Time',request.preferred_delivery_time||'Flexible']
      ]);
      section('ORIGINAL SHOPPING CHECKLIST');
      originalChecklist(request.written_list);
    }else{
      section('CUSTOMER / RECEIVER');
      pair('Customer',request.customer_name||request.receiver_name);
      pair('Receiver',request.receiver_name);
      pair('Phone',request.contact_number||request.customer_phone);
      if(request.customer_email)pair('Email',request.customer_email);

      section('SHOPPING INSTRUCTIONS');
      pair('Substitution',labelStatus(request.substitution_policy));
      pair('Budget',request.budget_kes!=null?money(request.budget_kes):'Not set');
      pair('Preferred Date',request.preferred_delivery_date?dateText(request.preferred_delivery_date):'Flexible');
      pair('Preferred Time',request.preferred_delivery_time||'Flexible');
      section('ORIGINAL SHOPPING CHECKLIST');
      originalChecklist(request.written_list);
    }

    const files=Array.isArray(request.files)?request.files:[];
    if(files.length){
      section('UPLOADED SHOPPING LIST FILES');
      files.forEach((file,index)=>line((index+1)+'. '+safe(file.name||'Attachment'),9,false,2));
      if(!thermal)line('Private uploaded files remain in LEOGO secure storage. Use the portal attachment buttons to open/download the original files.',7,false,2);
    }

    const fulfilment=request.fulfilment_method==='pickup'
      ? 'Pickup Station'
      : 'Customer Delivery';
    if(thermal){
      section('FULFILMENT');
      if(request.fulfilment_method==='pickup'){
        inlineFields([
          ['Method',fulfilment],
          ['Station',request.pickup_station_name||'Selected Pickup Station'],
          ['Address',request.pickup_station_address]
        ]);
      }else{
        inlineFields([
          ['Method',fulfilment],['Zone',labelStatus(request.delivery_zone)],
          ['County',request.county],['Sub-County',request.sub_county],
          ['Estate',request.estate],['Landmark',request.landmark],
          ['Map',request.location_link]
        ]);
      }
    }else{
      section('FULFILMENT');
      pair('Method',fulfilment);
      if(request.fulfilment_method==='pickup'){
        pair('Pickup Station',request.pickup_station_name||'Selected Pickup Station');
        if(request.pickup_station_address)pair('Station Address',request.pickup_station_address);
      }else{
        pair('Delivery Zone',labelStatus(request.delivery_zone));
        pair('County',request.county);
        pair('Sub-County',request.sub_county);
        pair('Estate / Area',request.estate);
        pair('Landmark',request.landmark);
        if(request.location_link)pair('Location Link',request.location_link);
      }
    }

    const items=Array.isArray(request.items)?request.items:[];
    if(items.length){
      section('LEOGO PREPARED ITEMS / QUOTATION');
      items.forEach((item,index)=>{
        ensure(15);
        line((index+1)+'. '+safe(item.item_name||'Item'),9,true,1);
        const qty='Requested '+Number(item.requested_quantity||0)
          +(item.unit_label?' '+safe(item.unit_label):'')
          +' | Prepared '+Number(item.prepared_quantity||0)
          +(item.unit_label?' '+safe(item.unit_label):'')
          +' | '+labelStatus(item.item_status||'available');
        line(qty,8,false,3);
        if(item.substitution_note)line('Note: '+safe(item.substitution_note),8,false,3);
        line('Unit Price: '+money(item.unit_price_kes)+' | Line Total: '+money(item.line_total_kes),8,false,3);
      });

      section('TOTALS');
      pair('Items Subtotal',money(request.items_subtotal_kes));
      pair('Assisted Shopping Fee',money(request.service_fee_kes)+' ('+Number(request.service_fee_percent_snapshot||0).toLocaleString('en-KE',{maximumFractionDigits:2})+'%)');
      if(Number(request.pickup_fee_kes||0)>0)pair('Pickup Station Fee',money(request.pickup_fee_kes));
      pair('Delivery / Station Shipping',money(request.delivery_fee_kes));
      pair('Grand Total',money(request.grand_total_kes));
    }

    if(request.payment_status&&request.payment_status!=='not_required'){
      section('PAYMENT / ORDER');
      pair('Payment Method',labelStatus(request.payment_method));
      pair('Payment Status',labelStatus(request.payment_status));
      if(request.order_reference)pair('Fulfilment Order',request.order_reference);
      if(request.order_status)pair('Order Status',labelStatus(request.order_status));
      if(request.delivery_status)pair('Delivery Status',labelStatus(request.delivery_status));
    }

    if(request.admin_notes){
      section('LEOGO NOTE');
      line(request.admin_notes,9,false,2);
    }

    }

    y+=5;
    ensure(14);
    doc.setFontSize(7);
    doc.setFont('helvetica','normal');
    doc.text('LEOGO DIGITAL MARKET — Assisted Shopping document',left,y);
    y+=4;
    doc.text('For authorized LEOGO Admin / assigned staff use.',left,y);

    const ref=safe(request.request_reference||'Shopping-List').replace(/[^A-Za-z0-9_-]+/g,'-');
    const fileName='LEOGO-'+(type==='quotation'?'Quotation':type==='label'?'Parcel-Label':'Shopping-Checklist')+'-'+ref+'-'+(thermal?'80mm':'A4')+'.pdf';
    if(options.action==='print'){
      // The browser's print dialog controls the actual selected printer.
      const blobUrl=URL.createObjectURL(doc.output('blob'));
      const frame=document.createElement('iframe');
      frame.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      frame.src=blobUrl;
      document.body.appendChild(frame);
      frame.onload=()=>{
        try{frame.contentWindow?.focus();frame.contentWindow?.print();}
        catch(error){doc.save(fileName);}
        window.setTimeout(()=>{frame.remove();URL.revokeObjectURL(blobUrl);},90000);
      };
    }else doc.save(fileName);
  };

  const chooseAndOutput=async(request,options={})=>{
    const paper=printChoice();
    if(!paper)return false;
    const action=window.confirm('Print now using your connected printer?\nOK = Print, Cancel = Download PDF');
    await download(request,{...options,paper,action:action?'print':'download'});
    return true;
  };
  window.leogoAssistedShoppingPdf={download,chooseAndOutput};
})();

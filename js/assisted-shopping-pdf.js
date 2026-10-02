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

  const download=(request,options={})=>{
    const JsPdf=window.jspdf?.jsPDF;
    if(!JsPdf)throw new Error('PDF generator is still loading. Try again in a moment.');
    if(!request)throw new Error('Shopping List data is not available.');

    const doc=new JsPdf({unit:'mm',format:'a4'});
    const left=15;
    const right=195;
    const width=right-left;
    const bottom=282;
    let y=16;

    const ensure=(height=8)=>{
      if(y+height>bottom){
        doc.addPage();
        y=16;
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
      doc.setFontSize(8);
      doc.setFont('helvetica','bold');
      doc.text(safe(label)+':',left,y);
      doc.setFont('helvetica','normal');
      const parts=doc.splitTextToSize(safe(value||'—'),width-42);
      doc.text(parts,left+42,y);
      y+=Math.max(5,parts.length*3.6+1);
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
    doc.setFontSize(17);
    doc.text('LEOGO DIGITAL MARKET',left,y);
    y+=7;
    doc.setFontSize(13);
    doc.text('ASSISTED SHOPPING / SHOPPING LIST',left,y);
    y+=6;
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text('Generated '+dateText(new Date().toISOString(),true),left,y);
    y+=7;

    pair('Request Reference',request.request_reference);
    pair('Status',labelStatus(request.status));
    if(options.assignedStaffName)pair('Assigned Staff',options.assignedStaffName);
    if(request.created_at)pair('Submitted',dateText(request.created_at,true));

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
    line('Original Shopping List',9,true);
    line(request.written_list||'Shopping List was supplied through uploaded attachment(s).',9,false,2);

    const files=Array.isArray(request.files)?request.files:[];
    if(files.length){
      section('UPLOADED SHOPPING LIST FILES');
      files.forEach((file,index)=>line((index+1)+'. '+safe(file.name||'Attachment'),9,false,2));
      line('Private uploaded files remain in LEOGO secure storage. Use the portal attachment buttons to open/download the original files.',7,false,2);
    }

    const fulfilment=request.fulfilment_method==='pickup'
      ? 'Pickup Station'
      : 'Customer Delivery';
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

    y+=5;
    ensure(14);
    doc.setFontSize(7);
    doc.setFont('helvetica','normal');
    doc.text('LEOGO DIGITAL MARKET — Assisted Shopping document',left,y);
    y+=4;
    doc.text('For authorized LEOGO Admin / assigned staff use.',left,y);

    const ref=safe(request.request_reference||'Shopping-List').replace(/[^A-Za-z0-9_-]+/g,'-');
    doc.save('LEOGO-Shopping-List-'+ref+'.pdf');
  };

  window.leogoAssistedShoppingPdf={download};
})();

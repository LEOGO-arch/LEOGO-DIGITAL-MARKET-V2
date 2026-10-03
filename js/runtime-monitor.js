(() => {
  'use strict';

  const PROJECT_URL='https://dzdciuqkqixwutvtfotj.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF';
  const ENDPOINT=PROJECT_URL+'/rest/v1/rpc/record_system_runtime_error';
  const nativeFetch=window.fetch.bind(window);
  const recent=new Map();

  const portal=(()=>{
    const path=window.location.pathname.toLowerCase();
    if(path.includes('/admin/'))return 'admin';
    if(path.includes('/partner/'))return 'partner';
    if(path.includes('/staff/'))return 'staff';
    if(path.includes('/pickup/'))return 'pickup';
    return 'customer';
  })();

  const cleanText=(value,max=600)=>{
    let text=String(value??'').slice(0,max);
    text=text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]');
    text=text.replace(/\+?\d[\d ()-]{7,}\d/g,'[number]');
    text=text.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,'[token]');
    text=text.replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/gi,'[key]');
    return text;
  };

  const stripUrl=(value,max=260)=>{
    try{
      const url=new URL(String(value||''),window.location.origin);
      return (url.origin===window.location.origin?'':url.origin)+url.pathname;
    }catch{
      return cleanText(String(value||'').split(/[?#]/)[0],max);
    }
  };

  const getClientId=()=>{
    const key='leogo-runtime-monitor-client-v1';
    try{
      let id=localStorage.getItem(key);
      if(!id){
        id=crypto.randomUUID?.()||('c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
        localStorage.setItem(key,id);
      }
      return id;
    }catch{
      return 'ephemeral-'+Math.random().toString(36).slice(2);
    }
  };
  const clientId=getClientId();

  const operationFromUrl=(value)=>{
    const path=stripUrl(value,220);
    const rpc=path.match(/\/rest\/v1\/rpc\/([^/]+)/i);
    if(rpc)return 'rpc:'+rpc[1];
    const fn=path.match(/\/functions\/v1\/([^/]+)/i);
    if(fn)return 'edge:'+fn[1];
    const storage=path.match(/\/storage\/v1\/([^?]+)/i);
    if(storage)return 'storage:'+storage[1].split('/').slice(0,3).join('/');
    const auth=path.match(/\/auth\/v1\/([^?]+)/i);
    if(auth)return 'auth:'+auth[1].split('/')[0];
    return path||null;
  };

  const moduleFrom=(operation)=>{
    const op=String(operation||'').toLowerCase();
    if(op.includes('wallet')||op.includes('loan'))return 'wallet';
    if(op.includes('transport')||op.includes('delivery')||op.includes('pickup'))return 'transport';
    if(op.includes('service_provider')||op.includes('service_request'))return 'services';
    if(op.includes('premium'))return 'premium';
    if(op.includes('accommodation'))return 'accommodation';
    if(op.includes('cyber'))return 'cyber';
    if(op.includes('product')||op.includes('catalog')||op.includes('review'))return 'products';
    if(op.includes('order'))return 'orders';
    if(op.includes('staff')||op.includes('rider'))return 'auth_staff';
    if(op.includes('payment')||op.includes('settlement'))return 'payments';
    if(op.includes('notification')||op.includes('email'))return 'notifications';
    if(op.includes('auth'))return 'auth';
    return portal;
  };

  const shouldReportHttp=(url,status)=>{
    const path=String(url||'');
    if(path.includes('/record_system_runtime_error'))return false;
    if(status>=500)return true;
    if(status<400)return false;
    if(path.includes('/auth/v1/'))return false;
    return /\/rest\/v1\/|\/functions\/v1\/|\/storage\/v1\//.test(path);
  };

  const report=(input={})=>{
    const operation=cleanText(input.operation||'',180)||null;
    const message=cleanText(input.message||'Unknown runtime error',600);
    if(!message)return;

    const localKey=[
      portal,input.errorType||'js_error',operation||'',message
    ].join('|').toLowerCase();
    const now=Date.now();
    const last=recent.get(localKey)||0;
    if(now-last<30000)return;
    recent.set(localKey,now);
    if(recent.size>150){
      for(const [key,time] of recent){
        if(now-time>300000)recent.delete(key);
      }
    }

    const payload={
      p_portal:portal,
      p_module:cleanText(input.module||moduleFrom(operation),80),
      p_error_type:cleanText(input.errorType||'js_error',40),
      p_message:message,
      p_operation:operation,
      p_error_code:cleanText(input.errorCode||'',80)||null,
      p_page_path:window.location.pathname,
      p_source:stripUrl(input.source||'',260)||null,
      p_line_no:Number.isFinite(Number(input.line))?Number(input.line):null,
      p_column_no:Number.isFinite(Number(input.column))?Number(input.column):null,
      p_user_type:portal,
      p_client_id:clientId,
      p_severity:input.severity==='critical'?'critical':'warning',
      p_metadata:{
        status:Number.isFinite(Number(input.status))?Number(input.status):null,
        method:cleanText(input.method||'',12)||null,
        host:window.location.hostname
      }
    };

    nativeFetch(ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':PUBLISHABLE_KEY},
      body:JSON.stringify(payload),
      keepalive:true
    }).catch(()=>{});
  };

  const confirmSameOriginResourceFailure=async(resourceUrl)=>{
    try{
      const url=new URL(String(resourceUrl||''),window.location.href);
      if(url.origin!==window.location.origin)return true;
      const response=await nativeFetch(url.href,{
        method:'GET',
        cache:'no-store',
        credentials:'same-origin'
      });
      return !response.ok;
    }catch{
      return true;
    }
  };

  window.addEventListener('error',(event)=>{
    const target=event.target;
    if(target&&target!==window&&(target.src||target.href)){
      const resourceUrl=target.src||target.href;
      setTimeout(async()=>{
        const stillFailing=await confirmSameOriginResourceFailure(resourceUrl);
        if(!stillFailing)return;
        report({
          errorType:'resource_error',
          message:'Resource failed to load after retry',
          operation:operationFromUrl(resourceUrl),
          source:resourceUrl,
          severity:'warning'
        });
      },800);
      return;
    }
    report({
      errorType:'js_error',
      message:event.message||event.error?.message||'JavaScript runtime error',
      errorCode:event.error?.name||null,
      source:event.filename||null,
      line:event.lineno,
      column:event.colno,
      severity:'critical'
    });
  },true);

  window.addEventListener('unhandledrejection',(event)=>{
    const reason=event.reason;
    report({
      errorType:'unhandled_rejection',
      message:reason?.message||reason||'Unhandled Promise rejection',
      errorCode:reason?.name||null,
      severity:'critical'
    });
  });

  window.fetch=async(...args)=>{
    const request=args[0];
    const init=args[1]||{};
    const url=typeof request==='string'?request:(request?.url||'');
    const method=String(init.method||request?.method||'GET').toUpperCase();
    try{
      const response=await nativeFetch(...args);
      if(shouldReportHttp(url,response.status)){
        const operation=operationFromUrl(url);
        report({
          errorType:'http_error',
          message:'HTTP '+response.status+' '+(response.statusText||'request failed'),
          operation,
          source:url,
          status:response.status,
          method,
          severity:response.status>=500?'critical':'warning'
        });
      }
      return response;
    }catch(error){
      if(!String(url).includes('/record_system_runtime_error')){
        report({
          errorType:'http_error',
          message:'Network request failed: '+cleanText(error?.message||error,300),
          operation:operationFromUrl(url),
          source:url,
          method,
          severity:'critical'
        });
      }
      throw error;
    }
  };

  window.leogoRuntimeMonitor={report};
})();

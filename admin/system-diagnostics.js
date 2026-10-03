(() => {
  'use strict';

  const db=window.leogoAdminDb;
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const state={configured:false,lastResult:null,runtimeHours:24};

  const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]||char));

  const setStatus=(node,message,type='')=>{
    if(!node)return;
    node.textContent=message||'';
    node.className='form-status'+(type?' '+type:'');
  };

  const friendly=(error)=>{
    if(!error)return 'Unknown error';
    if(typeof error==='string')return error;
    return error.message||error.error_description||error.details||String(error);
  };

  const validatePin=(pin)=>/^\d{6}$/.test(String(pin||''));

  const setConfiguredUi=(configured)=>{
    state.configured=Boolean(configured);
    $('#diagnosticsPinSetupCard').hidden=state.configured;
    $('#diagnosticsRunCard').hidden=!state.configured;
    $('#diagnosticsPinManagement').hidden=!state.configured;
    $('#diagnosticsPinState').textContent=state.configured?'Configured':'Setup required';
    $('#diagnosticsPinState').className='diagnostics-state '+(state.configured?'healthy':'warning');
  };

  const renderHistory=(runs)=>{
    const host=$('#diagnosticsHistory');
    if(!host)return;
    const rows=Array.isArray(runs)?runs:[];
    host.innerHTML=rows.length?rows.map((run)=>`
      <article class="diagnostics-history-row">
        <div><strong>${escapeHtml(String(run.mode||'full').toUpperCase())}${run.module?' · '+escapeHtml(run.module):''}</strong><small>${escapeHtml(new Date(run.created_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}))}</small></div>
        <div><b class="diagnostic-score ${escapeHtml(run.health||'healthy')}">${Number(run.score||0)}%</b><small>${Number(run.critical_count||0)} critical · ${Number(run.warning_count||0)} warnings</small></div>
      </article>
    `).join(''):'<div class="empty-mini">No diagnostic runs yet.</div>';
  };

  const loadHistory=async()=>{
    if(!db||!state.configured)return;
    const {data,error}=await db.rpc('admin_list_system_diagnostic_runs');
    if(error)throw error;
    renderHistory(data);
  };

  const formatWhen=(value)=>{
    if(!value)return 'Unknown time';
    try{return new Date(value).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'});}
    catch{return String(value);}
  };

  const renderRuntimeIssues=(issues)=>{
    const host=$('#diagnosticsRuntimeIssues');
    if(!host)return;
    const rows=Array.isArray(issues)?issues:[];
    const critical=rows.filter((row)=>row.severity==='critical').length;
    const warnings=rows.filter((row)=>row.severity!=='critical').length;
    $('#diagnosticsRuntimeTotal').textContent=rows.length;
    $('#diagnosticsRuntimeCritical').textContent=critical;
    $('#diagnosticsRuntimeWarning').textContent=warnings;

    host.innerHTML=rows.length?rows.map((issue)=>`
      <article class="diagnostics-runtime-issue ${escapeHtml(issue.severity||'warning')}">
        <header>
          <div>
            <span>${escapeHtml((issue.portal||'unknown')+' · '+(issue.module||'unknown'))}</span>
            <h3>${escapeHtml(issue.title||'Runtime issue')}</h3>
          </div>
          <div class="diagnostics-runtime-badges">
            <b class="${escapeHtml(issue.severity||'warning')}">${escapeHtml(String(issue.severity||'warning').toUpperCase())}</b>
            <b>${escapeHtml(String(issue.status||'new').toUpperCase())}</b>
          </div>
        </header>
        <p>${escapeHtml(issue.last_message||'No error message recorded.')}</p>
        <div class="diagnostics-runtime-meta">
          <span><strong>Recent:</strong> ${Number(issue.recent_count||0)}</span>
          <span><strong>Total:</strong> ${Number(issue.event_count||0)}</span>
          <span><strong>Last seen:</strong> ${escapeHtml(formatWhen(issue.last_seen))}</span>
        </div>
        <div class="diagnostics-runtime-paths">
          ${issue.operation?`<span><strong>Operation</strong>${escapeHtml(issue.operation)}</span>`:''}
          ${issue.last_page_path?`<span><strong>Page</strong>${escapeHtml(issue.last_page_path)}</span>`:''}
          ${issue.last_source?`<span><strong>Source</strong>${escapeHtml(issue.last_source)}</span>`:''}
        </div>
      </article>
    `).join(''):'<div class="empty-mini">No runtime issues recorded in this period.</div>';
  };

  const loadRuntimeIssues=async()=>{
    if(!db)return;
    const status=$('#diagnosticsRuntimeStatus');
    setStatus(status,'Loading live runtime errors…');
    const {data,error}=await db.rpc('admin_list_system_runtime_issues',{
      p_hours:state.runtimeHours,
      p_limit:100
    });
    if(error)throw error;
    renderRuntimeIssues(data);
    setStatus(status,'Live monitoring is active across LEOGO.','success');
  };

  const loadStatus=async()=>{
    if(!db)throw new Error('Secure connection unavailable.');
    const {data,error}=await db.rpc('admin_system_diagnostics_status');
    if(error)throw error;
    setConfiguredUi(Boolean(data?.configured));
    const lock=$('#diagnosticsLockState');
    if(lock){
      if(data?.locked_until&&new Date(data.locked_until)>new Date()){
        lock.textContent='Temporarily locked until '+new Date(data.locked_until).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'});
        lock.className='diagnostics-state critical';
      }else{
        lock.textContent='Ready';
        lock.className='diagnostics-state healthy';
      }
    }
    if(state.configured)await loadHistory();
  };

  const statusLabel=(status)=>({
    healthy:'Healthy',warning:'Warning',critical:'Critical',info:'Info'
  }[status]||status||'Info');

  const renderResult=(result)=>{
    state.lastResult=result;
    const summary=$('#diagnosticsSummary');
    const checks=$('#diagnosticsResults');
    if(!summary||!checks)return;
    summary.hidden=false;
    $('#diagnosticsScore').textContent=Number(result.score||0)+'%';
    $('#diagnosticsScore').className='diagnostics-big-score '+escapeHtml(result.health||'healthy');
    $('#diagnosticsHealthLabel').textContent=String(result.health||'healthy').replace(/\b\w/g,(c)=>c.toUpperCase());
    $('#diagnosticsCriticalCount').textContent=Number(result.critical_count||0);
    $('#diagnosticsWarningCount').textContent=Number(result.warning_count||0);
    $('#diagnosticsRunScope').textContent=result.mode==='module'
      ? 'Module: '+String(result.module||'')
      : String(result.mode||'full').replace(/\b\w/g,(c)=>c.toUpperCase())+' scan';

    const rows=Array.isArray(result.checks)?result.checks:[];
    checks.innerHTML=rows.length?rows.map((check)=>`
      <article class="diagnostic-check ${escapeHtml(check.status)}">
        <header>
          <div><span>${escapeHtml(check.module||'system')}</span><h3>${escapeHtml(check.title||'System check')}</h3></div>
          <b>${escapeHtml(statusLabel(check.status))}</b>
        </header>
        <p>${escapeHtml(check.summary||'')}</p>
        <div class="diagnostic-evidence"><strong>Evidence</strong><span>${escapeHtml(check.evidence||'No additional evidence.')}</span></div>
        <div class="diagnostic-repair"><strong>Suggested repair</strong><span>${escapeHtml(check.suggested_repair||'Review the affected module.')}</span></div>
      </article>
    `).join(''):'<div class="empty-mini">No checks were returned for this scope.</div>';

    $('#diagnosticsResultsSection').hidden=false;
  };

  const parseAuthFailure=(data)=>{
    if(data?.reason==='locked'){
      const until=data.locked_until?' until '+new Date(data.locked_until).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):'';
      return (data.message||'PIN temporarily locked')+until;
    }
    if(data?.reason==='invalid_pin'&&Number.isFinite(Number(data.attempts_remaining))){
      return (data.message||'Incorrect PIN')+' '+data.attempts_remaining+' attempt(s) remaining.';
    }
    return data?.message||'System Diagnosis could not be unlocked.';
  };

  const runDiagnosis=async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const pin=$('#diagnosticsRunPin').value.trim();
    const mode=$('#diagnosticsMode').value;
    const module=$('#diagnosticsModule').value;
    if(!validatePin(pin)){setStatus($('#diagnosticsRunStatus'),'Enter the 6-digit System Diagnosis PIN.','error');return;}

    const original=button.textContent;
    button.disabled=true;
    button.textContent='Diagnosing…';
    setStatus($('#diagnosticsRunStatus'),'Running read-only checks across LEOGO…');
    try{
      const {data,error}=await db.rpc('admin_run_system_diagnosis',{
        p_pin:pin,p_mode:mode,p_module:mode==='module'?module:null
      });
      if(error)throw error;
      $('#diagnosticsRunPin').value='';
      if(!data?.ok){
        setStatus($('#diagnosticsRunStatus'),parseAuthFailure(data),'error');
        await loadStatus().catch(()=>{});
        return;
      }
      renderResult(data);
      setStatus($('#diagnosticsRunStatus'),'Diagnosis complete. No repair was applied automatically.','success');
      await Promise.all([loadHistory(),loadRuntimeIssues()]);
    }catch(error){
      setStatus($('#diagnosticsRunStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  const setupPin=async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const pin=$('#diagnosticsSetupPin').value.trim();
    const confirm=$('#diagnosticsSetupPinConfirm').value.trim();
    if(!validatePin(pin)){setStatus($('#diagnosticsSetupStatus'),'Use exactly 6 digits.','error');return;}
    if(pin!==confirm){setStatus($('#diagnosticsSetupStatus'),'PIN confirmation does not match.','error');return;}
    const {data,error}=await db.rpc('admin_system_diagnostics_setup_pin',{p_new_pin:pin});
    if(error){setStatus($('#diagnosticsSetupStatus'),friendly(error),'error');return;}
    if(!data?.ok){setStatus($('#diagnosticsSetupStatus'),data?.message||'PIN setup failed.','error');return;}
    form.reset();
    setConfiguredUi(true);
    setStatus($('#diagnosticsSetupStatus'),data.message,'success');
    await loadStatus();
  };

  const changePin=async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const current=$('#diagnosticsCurrentPin').value.trim();
    const next=$('#diagnosticsNewPin').value.trim();
    const confirm=$('#diagnosticsNewPinConfirm').value.trim();
    if(!validatePin(current)||!validatePin(next)){setStatus($('#diagnosticsChangePinStatus'),'Current and new PIN must each be exactly 6 digits.','error');return;}
    if(next!==confirm){setStatus($('#diagnosticsChangePinStatus'),'New PIN confirmation does not match.','error');return;}
    const {data,error}=await db.rpc('admin_system_diagnostics_change_pin',{p_current_pin:current,p_new_pin:next});
    if(error){setStatus($('#diagnosticsChangePinStatus'),friendly(error),'error');return;}
    if(!data?.ok){setStatus($('#diagnosticsChangePinStatus'),parseAuthFailure(data),'error');await loadStatus().catch(()=>{});return;}
    form.reset();
    setStatus($('#diagnosticsChangePinStatus'),data.message||'PIN changed.','success');
    await loadStatus();
  };

  const resetPin=async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const password=$('#diagnosticsResetPassword').value;
    const next=$('#diagnosticsResetPin').value.trim();
    const confirm=$('#diagnosticsResetPinConfirm').value.trim();
    if(!password){setStatus($('#diagnosticsResetPinStatus'),'Enter the Super Admin account password.','error');return;}
    if(!validatePin(next)){setStatus($('#diagnosticsResetPinStatus'),'Use exactly 6 digits for the new PIN.','error');return;}
    if(next!==confirm){setStatus($('#diagnosticsResetPinStatus'),'New PIN confirmation does not match.','error');return;}

    const button=form.querySelector('button[type="submit"]');
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Verifying…';
    try{
      const {data,error}=await db.functions.invoke('admin-reset-diagnostics-pin',{
        body:{current_password:password,new_pin:next}
      });
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||'PIN reset failed.');
      form.reset();
      setConfiguredUi(true);
      setStatus($('#diagnosticsResetPinStatus'),data.message||'PIN reset successfully.','success');
      await loadStatus();
    }catch(error){
      setStatus($('#diagnosticsResetPinStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  const bind=()=>{
    $('#diagnosticsSetupPinForm')?.addEventListener('submit',setupPin);
    $('#diagnosticsRunForm')?.addEventListener('submit',runDiagnosis);
    $('#diagnosticsChangePinForm')?.addEventListener('submit',changePin);
    $('#diagnosticsResetPinForm')?.addEventListener('submit',resetPin);
    $('#diagnosticsMode')?.addEventListener('change',(event)=>{
      $('#diagnosticsModuleWrap').hidden=event.target.value!=='module';
    });
    $('#refreshDiagnosticsHistory')?.addEventListener('click',()=>loadHistory().catch((error)=>setStatus($('#diagnosticsRunStatus'),friendly(error),'error')));
    $('#refreshRuntimeIssues')?.addEventListener('click',()=>loadRuntimeIssues().catch((error)=>setStatus($('#diagnosticsRuntimeStatus'),friendly(error),'error')));
    $('#diagnosticsRuntimeHours')?.addEventListener('change',(event)=>{
      state.runtimeHours=Number(event.target.value)||24;
      loadRuntimeIssues().catch((error)=>setStatus($('#diagnosticsRuntimeStatus'),friendly(error),'error'));
    });
  };

  window.leogoDiagnostics={
    activate:()=>Promise.all([
      loadStatus(),
      loadRuntimeIssues()
    ]).catch((error)=>{
      setStatus($('#diagnosticsRunStatus'),friendly(error),'error');
      setStatus($('#diagnosticsRuntimeStatus'),friendly(error),'error');
    }),
    refresh:()=>Promise.all([loadStatus(),loadRuntimeIssues()])
  };

  bind();
})();

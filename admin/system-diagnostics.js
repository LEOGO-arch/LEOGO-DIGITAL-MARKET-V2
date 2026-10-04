(() => {
  'use strict';

  const db=window.leogoAdminDb;
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const state={configured:false,lastResult:null,latestRun:null,runtimeHours:24,currentFinding:null,monitoring:null,monitoringTrendVisible:4};

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
    const activeRows=rows.filter((row)=>!['resolved','ignored'].includes(row.status));
    const critical=activeRows.filter((row)=>row.severity==='critical').length;
    const warnings=activeRows.filter((row)=>row.severity!=='critical').length;
    $('#diagnosticsRuntimeTotal').textContent=activeRows.length;
    $('#diagnosticsRuntimeCritical').textContent=critical;
    $('#diagnosticsRuntimeWarning').textContent=warnings;

    host.innerHTML=activeRows.length?activeRows.map((issue)=>`
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
    `).join(''):'<div class="empty-mini">No active runtime issues in this period.</div>';
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


  const humanizeKey=(key)=>String(key||'')
    .replace(/_/g,' ')
    .replace(/\b\w/g,(char)=>char.toUpperCase());

  const displayValue=(value)=>{
    if(value===null||value===undefined||value==='')return '—';
    if(typeof value==='boolean')return value?'Yes':'No';
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  };

  const renderRepairCenter=(result)=>{
    const host=$('#diagnosticsRepairQueue');
    if(!host)return;
    const rows=Array.isArray(result?.checks)?result.checks:[];
    const findings=rows.filter((check)=>check.status!=='healthy');
    if(!findings.length){
      host.innerHTML='<div class="diagnostics-repair-empty"><strong>No active repair findings.</strong><span>The latest diagnostic run is healthy. Phase 3 remains armed for future findings.</span></div>';
      return;
    }
    host.innerHTML=findings.map((check)=>`
      <article class="diagnostics-repair-item ${escapeHtml(check.status||'warning')}">
        <div>
          <span>${escapeHtml(check.module||'system')}</span>
          <h4>${escapeHtml(check.title||check.id||'Diagnostic finding')}</h4>
          <p>${escapeHtml(check.evidence||check.summary||'')}</p>
        </div>
        <div class="diagnostics-phase3-actions">
          <button class="secondary-button" type="button" data-diagnostics-finding="${escapeHtml(check.id)}">View Affected Records</button>
          <button type="button" data-diagnostics-verify-open="${escapeHtml(check.id)}">Verify This Check</button>
        </div>
      </article>
    `).join('');
  };

  const renderRepairHistory=(rows)=>{
    const host=$('#diagnosticsRepairHistory');
    if(!host)return;
    const repairs=Array.isArray(rows)?rows:[];
    host.innerHTML=repairs.length?repairs.map((repair)=>`
      <article class="diagnostics-repair-history-row">
        <div>
          <strong>${escapeHtml(humanizeKey(repair.repair_action||'repair'))}</strong>
          <small>${escapeHtml(repair.check_id||'')} · ${escapeHtml(formatWhen(repair.created_at))}</small>
        </div>
        <div>
          <b class="diagnostics-risk ${escapeHtml(repair.risk_level||'low')}">${escapeHtml(String(repair.risk_level||'low').toUpperCase())}</b>
          <small>${repair.verification_data?.healthy?'Verified Healthy':Number(repair.verification_data?.affected_count||0)+' affected remaining'}</small>
        </div>
      </article>
    `).join(''):'<div class="empty-mini">No Phase 3 repairs recorded.</div>';
  };

  const loadRepairHistory=async()=>{
    if(!db||!state.configured)return;
    const {data,error}=await db.rpc('admin_list_system_diagnostic_repairs',{p_limit:50});
    if(error)throw error;
    renderRepairHistory(data);
  };

  const loadLatestDiagnosticRun=async()=>{
    if(!db||!state.configured)return;
    const {data,error}=await db.rpc('admin_get_latest_system_diagnostic_run');
    if(error)throw error;
    state.latestRun=data||null;
    if(!state.lastResult&&data?.checks)renderRepairCenter(data);
  };

  const closeFindingModal=()=>{
    const modal=$('#diagnosticsFindingModal');
    if(modal)modal.hidden=true;
    state.currentFinding=null;
    const pin=$('#diagnosticsPhase3Pin');
    if(pin)pin.value='';
    setStatus($('#diagnosticsFindingStatus'),'');
  };

  const renderAffectedRecords=(data)=>{
    state.currentFinding=data;
    $('#diagnosticsFindingModule').textContent=String(data.module||'system').toUpperCase();
    $('#diagnosticsFindingTitle').textContent=data.title||data.check_id||'Finding details';

    const policy=data.policy||{};
    const mode=policy.repair_mode||'manual_only';
    const risk=policy.risk_level||'high';
    $('#diagnosticsFindingPolicy').innerHTML=`
      <div>
        <b class="diagnostics-risk ${escapeHtml(risk)}">${escapeHtml(String(risk).toUpperCase())} RISK</b>
        <b class="diagnostics-repair-mode ${escapeHtml(mode)}">${escapeHtml(humanizeKey(mode))}</b>
      </div>
      <p>${escapeHtml(policy.message||'Review this finding before making any change.')}</p>
      <small><strong>Affected now:</strong> ${Number(data.affected_count||0)} · <strong>Last scan:</strong> ${escapeHtml(statusLabel(data.last_status||'unknown'))}</small>
    `;

    const host=$('#diagnosticsAffectedRecords');
    const rows=Array.isArray(data.records)?data.records:[];
    host.innerHTML=rows.length?rows.map((record,index)=>{
      const entries=Object.entries(record).filter(([key])=>!['target_key','repair_action','repairable'].includes(key));
      const safe=policy.repair_mode==='safe'&&record.repairable&&record.repair_action;
      return `
        <article class="diagnostics-affected-record">
          <header><strong>Affected record ${index+1}</strong>${safe?'<span class="diagnostics-state healthy">SAFE ACTION AVAILABLE</span>':''}</header>
          <div class="diagnostics-record-grid">
            ${entries.map(([key,value])=>`<div><small>${escapeHtml(humanizeKey(key))}</small><span>${escapeHtml(displayValue(value))}</span></div>`).join('')}
          </div>
          ${safe?`<button class="diagnostics-safe-repair" type="button" data-repair-target="${escapeHtml(record.target_key)}" data-repair-action="${escapeHtml(record.repair_action)}">Apply Safe Repair</button>`:''}
        </article>
      `;
    }).join(''):'<div class="diagnostics-repair-empty"><strong>No affected records.</strong><span>This check is currently healthy.</span></div>';
  };

  const loadFindingDetails=async(checkId,focusPin=false)=>{
    if(!checkId)return;
    const modal=$('#diagnosticsFindingModal');
    if(modal)modal.hidden=false;
    $('#diagnosticsFindingTitle').textContent='Loading finding…';
    $('#diagnosticsFindingModule').textContent='SYSTEM DIAGNOSIS';
    $('#diagnosticsAffectedRecords').innerHTML='<div class="empty-mini">Loading affected records…</div>';
    setStatus($('#diagnosticsFindingStatus'),'');
    try{
      const {data,error}=await db.rpc('admin_diagnostic_finding_details',{
        p_check_id:checkId,p_limit:50
      });
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.message||'Finding details could not be loaded.');
      renderAffectedRecords(data);
      if(focusPin)window.setTimeout(()=>$('#diagnosticsPhase3Pin')?.focus(),50);
    }catch(error){
      setStatus($('#diagnosticsFindingStatus'),friendly(error),'error');
      $('#diagnosticsAffectedRecords').innerHTML='<div class="empty-mini">Affected records could not be loaded.</div>';
    }
  };

  const verifyCurrentFinding=async()=>{
    const finding=state.currentFinding;
    if(!finding?.check_id)return;
    const pin=$('#diagnosticsPhase3Pin').value.trim();
    if(!validatePin(pin)){
      setStatus($('#diagnosticsFindingStatus'),'Enter the 6-digit System Diagnosis PIN to verify this check.','error');
      return;
    }
    const button=$('#diagnosticsVerifyCheck');
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Verifying…';
    try{
      const {data,error}=await db.rpc('admin_verify_system_diagnostic_check',{
        p_pin:pin,p_check_id:finding.check_id
      });
      if(error)throw error;
      if(!data?.ok){
        setStatus($('#diagnosticsFindingStatus'),parseAuthFailure(data),'error');
        return;
      }
      $('#diagnosticsPhase3Pin').value='';
      setStatus(
        $('#diagnosticsFindingStatus'),
        data.healthy?'Verified Healthy — no affected records remain.':`Verification complete — ${Number(data.affected_count||0)} affected record(s) remain.`,
        data.healthy?'success':'error'
      );
      await loadFindingDetails(finding.check_id,false);
    }catch(error){
      setStatus($('#diagnosticsFindingStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  const applySafeRepair=async(targetKey,action,button)=>{
    const finding=state.currentFinding;
    if(!finding?.check_id||!targetKey||!action)return;
    const pin=$('#diagnosticsPhase3Pin').value.trim();
    if(!validatePin(pin)){
      setStatus($('#diagnosticsFindingStatus'),'Enter the 6-digit System Diagnosis PIN before applying a repair.','error');
      return;
    }
    if(finding.policy?.repair_mode!=='safe'){
      setStatus($('#diagnosticsFindingStatus'),'This finding is not approved for automated repair.','error');
      return;
    }
    const approved=window.confirm('Apply this allowlisted safe repair? The original value will be saved in the immutable repair audit and the check will be verified immediately afterward.');
    if(!approved)return;

    const original=button.textContent;
    button.disabled=true;
    button.textContent='Applying…';
    try{
      const {data,error}=await db.rpc('admin_apply_system_diagnostic_repair',{
        p_pin:pin,p_check_id:finding.check_id,p_target_key:targetKey,p_action:action
      });
      if(error)throw error;
      if(!data?.ok){
        setStatus($('#diagnosticsFindingStatus'),parseAuthFailure(data)||data?.message||'Repair was not applied.','error');
        return;
      }
      $('#diagnosticsPhase3Pin').value='';
      const verified=data.verification?.healthy;
      setStatus(
        $('#diagnosticsFindingStatus'),
        verified?'Safe repair applied and verified Healthy. Run Full Diagnosis to refresh the overall score.':'Repair applied, but other affected records remain. Review them before rerunning Full Diagnosis.',
        verified?'success':'error'
      );
      await Promise.all([
        loadFindingDetails(finding.check_id,false),
        loadRepairHistory(),
        loadRuntimeIssues()
      ]);
    }catch(error){
      setStatus($('#diagnosticsFindingStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };


  const monitoringStatusLabel=(status)=>({
    healthy:'Healthy',warning:'Warning',critical:'Critical',
    maintenance:'Maintenance',disabled:'Disabled',failed:'Failed',not_run:'Not run'
  }[status]||humanizeKey(status||'unknown'));

  const toLocalInputValue=(value)=>{
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  };

  const renderSystemMonitoring=(snapshot)=>{
    state.monitoring=snapshot||{};
    const settings=snapshot?.settings||{};
    const summary=snapshot?.summary||{};
    const incidents=Array.isArray(snapshot?.incidents)?snapshot.incidents:[];
    const runs=Array.isArray(snapshot?.recent_runs)?snapshot.recent_runs:[];

    const monitoringState=$('#diagnosticsMonitoringState');
    const paused=!settings.enabled;
    const maintenance=Boolean(settings.maintenance_mode);
    const stateText=paused?'DISABLED':maintenance?'MAINTENANCE':'ACTIVE';
    if(monitoringState){
      monitoringState.textContent=stateText;
      monitoringState.className='diagnostics-state '+(paused||maintenance?'warning':'healthy');
    }

    const score=summary.health_score;
    $('#monitoringHealthScore').textContent=score===null||score===undefined?'—':Number(score)+'%';
    $('#monitoringHealthLabel').textContent=monitoringStatusLabel(summary.status);
    $('#monitoringCriticalCount').textContent=Number(summary.active_critical??summary.critical_count??0);
    $('#monitoringWarningCount').textContent=Number(summary.active_warnings??summary.warning_count??0);
    $('#monitoringRecoveredToday').textContent=Number(summary.recovered_today||0);
    $('#monitoringLastScan').textContent=summary.last_scan_at?formatWhen(summary.last_scan_at):'Not run';
    $('#monitoringNextScan').textContent=paused||maintenance?'Paused':summary.next_scan_at?formatWhen(summary.next_scan_at):'Pending';

    const enabled=$('#monitoringEnabled');
    const maintenanceBox=$('#monitoringMaintenance');
    if(enabled)enabled.checked=settings.enabled!==false;
    if(maintenanceBox)maintenanceBox.checked=maintenance;
    const until=$('#monitoringMaintenanceUntil');
    if(until)until.value=toLocalInputValue(settings.maintenance_until);
    const reason=$('#monitoringMaintenanceReason');
    if(reason)reason.value=settings.maintenance_reason||'';

    const incidentHost=$('#diagnosticsMonitoringIncidents');
    if(incidentHost){
      incidentHost.innerHTML=incidents.length?incidents.map((incident)=>`
        <article class="diagnostics-monitoring-incident ${escapeHtml(incident.status||'active')} ${escapeHtml(incident.severity||'warning')}">
          <header>
            <div><span>${escapeHtml((incident.module||'system').toUpperCase())}</span><h4>${escapeHtml(incident.title||incident.check_id||'Monitoring incident')}</h4></div>
            <div class="diagnostics-runtime-badges"><b class="${escapeHtml(incident.severity||'warning')}">${escapeHtml(String(incident.severity||'warning').toUpperCase())}</b><b>${escapeHtml(String(incident.status||'active').toUpperCase())}</b></div>
          </header>
          <p>${escapeHtml(incident.summary||'')}</p>
          <div class="diagnostics-runtime-meta">
            <span><strong>Occurrences:</strong> ${Number(incident.occurrence_count||0)}</span>
            <span><strong>Consecutive:</strong> ${Number(incident.consecutive_failures||0)}</span>
            <span><strong>${incident.status==='recovered'?'Recovered':'Last seen'}:</strong> ${escapeHtml(formatWhen(incident.status==='recovered'?incident.recovered_at:incident.last_detected_at))}</span>
          </div>
          ${incident.evidence?`<div class="diagnostic-evidence"><strong>Evidence</strong><span>${escapeHtml(incident.evidence)}</span></div>`:''}
          <div class="diagnostics-phase3-actions"><button type="button" data-monitoring-open-check="${escapeHtml(incident.check_id||'')}">Open in Diagnosis</button></div>
        </article>
      `).join(''):'<div class="diagnostics-repair-empty"><strong>No active monitoring incidents.</strong><span>Preventive monitoring has no current Critical or Warning findings.</span></div>';
    }

    const trendHost=$('#diagnosticsMonitoringTrend');
    if(trendHost){
      const initialVisible=4;
      if(!Number.isFinite(Number(state.monitoringTrendVisible))||state.monitoringTrendVisible<initialVisible){
        state.monitoringTrendVisible=initialVisible;
      }
      state.monitoringTrendVisible=Math.min(state.monitoringTrendVisible,Math.max(initialVisible,runs.length||initialVisible));
      const visibleRuns=runs.slice(0,state.monitoringTrendVisible);
      const remaining=Math.max(0,runs.length-visibleRuns.length);

      const rowsHtml=visibleRuns.map((run)=>{
        const scoreValue=run.health_score===null||run.health_score===undefined?null:Number(run.health_score);
        const width=scoreValue===null?0:Math.max(0,Math.min(100,scoreValue));
        return `
          <article class="diagnostics-monitoring-trend-row">
            <div><strong>${escapeHtml(monitoringStatusLabel(run.run_status))}</strong><small>${escapeHtml(formatWhen(run.completed_at||run.started_at))} · ${escapeHtml(run.trigger_source||'cron')}</small></div>
            <div class="diagnostics-monitoring-trend-score"><span><i style="width:${width}%"></i></span><b>${scoreValue===null?'—':scoreValue+'%'}</b></div>
          </article>
        `;
      }).join('');

      const controls=runs.length>initialVisible?`
        <div class="diagnostics-monitoring-trend-actions">
          ${remaining>0?`<button type="button" data-monitoring-trend-more>Show ${Math.min(4,remaining)} more</button>`:''}
          ${visibleRuns.length>initialVisible?`<button class="secondary-button" type="button" data-monitoring-trend-less>Show less</button>`:''}
          <small>Showing ${visibleRuns.length} of ${runs.length} checks</small>
        </div>
      `:'';

      trendHost.innerHTML=runs.length?rowsHtml+controls:'<div class="empty-mini">No preventive monitoring runs yet.</div>';

      $('[data-monitoring-trend-more]',trendHost)?.addEventListener('click',()=>{
        state.monitoringTrendVisible=Math.min(runs.length,state.monitoringTrendVisible+4);
        renderSystemMonitoring(state.monitoring);
      });
      $('[data-monitoring-trend-less]',trendHost)?.addEventListener('click',()=>{
        state.monitoringTrendVisible=initialVisible;
        renderSystemMonitoring(state.monitoring);
        trendHost.scrollIntoView({behavior:'smooth',block:'nearest'});
      });
    }

    document.dispatchEvent(new CustomEvent('leogo:system-monitoring-updated',{detail:snapshot||{}}));
  };

  const loadSystemMonitoring=async()=>{
    if(!db)return;
    const {data,error}=await db.rpc('admin_get_system_monitoring_snapshot');
    if(error)throw error;
    renderSystemMonitoring(data||{});
    return data;
  };

  const saveSystemMonitoringSettings=async()=>{
    const pin=$('#monitoringPin')?.value.trim()||'';
    if(!validatePin(pin)){
      setStatus($('#diagnosticsMonitoringStatus'),'Enter the 6-digit System Diagnosis PIN to change monitoring settings.','error');
      return;
    }
    const enabled=Boolean($('#monitoringEnabled')?.checked);
    const maintenance=Boolean($('#monitoringMaintenance')?.checked);
    const untilValue=$('#monitoringMaintenanceUntil')?.value||'';
    let until=null;
    if(maintenance&&untilValue){
      const parsed=new Date(untilValue);
      if(Number.isNaN(parsed.getTime())){
        setStatus($('#diagnosticsMonitoringStatus'),'Enter a valid maintenance end time.','error');
        return;
      }
      until=parsed.toISOString();
    }
    const button=$('#saveMonitoringSettings');
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Saving…';
    try{
      const {data,error}=await db.rpc('admin_update_system_monitoring_settings',{
        p_pin:pin,
        p_enabled:enabled,
        p_maintenance_mode:maintenance,
        p_maintenance_until:until,
        p_reason:$('#monitoringMaintenanceReason')?.value.trim()||null
      });
      if(error)throw error;
      if(!data?.ok){
        setStatus($('#diagnosticsMonitoringStatus'),parseAuthFailure(data)||data?.message||'Monitoring settings were not changed.','error');
        return;
      }
      $('#monitoringPin').value='';
      setStatus($('#diagnosticsMonitoringStatus'),'Preventive monitoring settings updated.','success');
      await loadSystemMonitoring();
    }catch(error){
      setStatus($('#diagnosticsMonitoringStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  };

  const runSystemMonitoringNow=async()=>{
    const pin=$('#monitoringPin')?.value.trim()||'';
    if(!validatePin(pin)){
      setStatus($('#diagnosticsMonitoringStatus'),'Enter the 6-digit System Diagnosis PIN to run a manual preventive scan.','error');
      return;
    }
    const button=$('#runMonitoringNow');
    const original=button.textContent;
    button.disabled=true;
    button.textContent='Scanning…';
    try{
      const {data,error}=await db.rpc('admin_run_system_monitoring_now',{p_pin:pin});
      if(error)throw error;
      if(!data?.ok){
        setStatus($('#diagnosticsMonitoringStatus'),parseAuthFailure(data)||data?.message||'Preventive scan did not complete.','error');
        return;
      }
      $('#monitoringPin').value='';
      setStatus(
        $('#diagnosticsMonitoringStatus'),
        `Quick monitoring scan complete — ${Number(data.critical_count||0)} Critical, ${Number(data.warning_count||0)} Warning.`,
        Number(data.critical_count||0)>0?'error':'success'
      );
      await Promise.all([loadSystemMonitoring(),loadRuntimeIssues()]);
    }catch(error){
      setStatus($('#diagnosticsMonitoringStatus'),friendly(error),'error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
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
        <div class="diagnostics-phase3-actions">
          <button class="secondary-button" type="button" data-diagnostics-finding="${escapeHtml(check.id||'')}">View Affected Records</button>
          <button type="button" data-diagnostics-verify-open="${escapeHtml(check.id||'')}">Verify This Check</button>
        </div>
      </article>
    `).join(''):'<div class="empty-mini">No checks were returned for this scope.</div>';

    renderRepairCenter(result);
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
      await Promise.all([loadHistory(),loadRuntimeIssues(),loadRepairHistory(),loadLatestDiagnosticRun()]);
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
    $('#refreshDiagnosticRepairs')?.addEventListener('click',()=>Promise.all([
      loadLatestDiagnosticRun(),loadRepairHistory()
    ]).catch((error)=>setStatus($('#diagnosticsRunStatus'),friendly(error),'error')));
    $('#diagnosticsResults')?.addEventListener('click',(event)=>{
      const inspect=event.target.closest('[data-diagnostics-finding]');
      if(inspect)loadFindingDetails(inspect.dataset.diagnosticsFinding,false);
      const verify=event.target.closest('[data-diagnostics-verify-open]');
      if(verify)loadFindingDetails(verify.dataset.diagnosticsVerifyOpen,true);
    });
    $('#diagnosticsRepairQueue')?.addEventListener('click',(event)=>{
      const inspect=event.target.closest('[data-diagnostics-finding]');
      if(inspect)loadFindingDetails(inspect.dataset.diagnosticsFinding,false);
      const verify=event.target.closest('[data-diagnostics-verify-open]');
      if(verify)loadFindingDetails(verify.dataset.diagnosticsVerifyOpen,true);
    });
    $('#diagnosticsFindingModal')?.addEventListener('click',(event)=>{
      if(event.target.closest('[data-diagnostics-close]'))closeFindingModal();
      const repair=event.target.closest('[data-repair-target]');
      if(repair)applySafeRepair(repair.dataset.repairTarget,repair.dataset.repairAction,repair);
    });
    $('#diagnosticsVerifyCheck')?.addEventListener('click',verifyCurrentFinding);
    $('#refreshSystemMonitoring')?.addEventListener('click',()=>loadSystemMonitoring().catch((error)=>setStatus($('#diagnosticsMonitoringStatus'),friendly(error),'error')));
    $('#saveMonitoringSettings')?.addEventListener('click',saveSystemMonitoringSettings);
    $('#runMonitoringNow')?.addEventListener('click',runSystemMonitoringNow);
    $('#diagnosticsMonitoringIncidents')?.addEventListener('click',(event)=>{
      const button=event.target.closest('[data-monitoring-open-check]');
      if(button?.dataset.monitoringOpenCheck)loadFindingDetails(button.dataset.monitoringOpenCheck,false);
    });
    document.addEventListener('leogo:system-monitoring-snapshot',(event)=>{
      if(event.detail)renderSystemMonitoring(event.detail);
    });
  };

  window.leogoDiagnostics={
    activate:async()=>{
      try{
        await loadStatus();
        await Promise.all([loadRuntimeIssues(),loadLatestDiagnosticRun(),loadRepairHistory(),loadSystemMonitoring()]);
      }catch(error){
        setStatus($('#diagnosticsRunStatus'),friendly(error),'error');
        setStatus($('#diagnosticsRuntimeStatus'),friendly(error),'error');
        setStatus($('#diagnosticsMonitoringStatus'),friendly(error),'error');
      }
    },
    refresh:async()=>{
      await loadStatus();
      await Promise.all([loadRuntimeIssues(),loadLatestDiagnosticRun(),loadRepairHistory(),loadSystemMonitoring()]);
    }
  };

  bind();
})();

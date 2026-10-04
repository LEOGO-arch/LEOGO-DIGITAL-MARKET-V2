(() => {
  'use strict';

  const PROJECT_URL='https://uxikemfrzqatsbqutida.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_4eMZCkb3NOGEtR664VOpXQ_IkWgDRM1';
  const STAFF_AUTH_STORAGE_KEY='leogo-staff-auth-v2';
  const initialUrl=new URL(window.location.href);
  const INITIAL_RECOVERY_SIGNAL=
    initialUrl.searchParams.has('code') ||
    initialUrl.searchParams.get('type')==='recovery' ||
    /(?:^|[&#])type=recovery(?:&|$)/.test(window.location.hash);

  const factory=window.supabase?.createClient;
  const db=factory?factory(PROJECT_URL,PUBLISHABLE_KEY,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
      storageKey:STAFF_AUTH_STORAGE_KEY
    }
  }):null;

  const $=(selector)=>document.querySelector(selector);
  let recoveryEventSeen=false;
  let verifiedUserId=null;
  let handling=false;

  const setStatus=(message,type='')=>{
    const node=$('#adminRecoveryPageStatus');
    if(!node)return;
    node.textContent=message;
    node.className='form-status'+(type?' '+type:'');
  };

  const passwordIssue=(password)=>{
    if(String(password||'').length<12)return 'Use at least 12 characters.';
    if(!/[a-z]/.test(password))return 'Add at least one lowercase letter.';
    if(!/[A-Z]/.test(password))return 'Add at least one uppercase letter.';
    if(!/[0-9]/.test(password))return 'Add at least one number.';
    if(!/[^A-Za-z0-9]/.test(password))return 'Add at least one symbol.';
    return '';
  };

  const verifySuperAdmin=async(user)=>{
    if(!user)return false;
    const {data,error}=await db.from('admin_users')
      .select('user_id,role,status')
      .eq('user_id',user.id)
      .maybeSingle();
    if(error)throw error;
    return Boolean(data&&data.status==='active'&&data.role==='super_admin');
  };

  const recordSecurityEvent=async(action,metadata={})=>{
    const {error}=await db.rpc('admin_record_security_event',{
      p_action:action,
      p_metadata:metadata
    });
    if(error)console.error('LEOGO recovery audit failed:',error);
  };

  const handleRecoverySession=async(session)=>{
    if(handling||verifiedUserId)return;
    if(!(INITIAL_RECOVERY_SIGNAL||recoveryEventSeen)){
      setStatus('Open this page only from the secure recovery link sent to the Super Admin email.','error');
      return;
    }
    if(!session?.user)return;
    handling=true;
    try{
      const allowed=await verifySuperAdmin(session.user);
      if(!allowed){
        await db.auth.signOut({scope:'global'});
        setStatus('This recovery link does not belong to an active LEOGO Super Admin account.','error');
        return;
      }
      verifiedUserId=session.user.id;
      $('#adminRecoveryForm').hidden=false;
      setStatus('Recovery link verified. Create a new Super Admin password.','success');
    }catch(error){
      setStatus(error?.message||'The recovery link could not be verified.','error');
    }finally{
      handling=false;
    }
  };

  const initialize=async()=>{
    if(!db){
      setStatus('The secure connection could not load. Refresh this page.','error');
      return;
    }

    db.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY')recoveryEventSeen=true;
      if(event==='PASSWORD_RECOVERY'||event==='SIGNED_IN'||event==='INITIAL_SESSION'){
        window.setTimeout(()=>handleRecoverySession(session),0);
      }
    });

    const code=initialUrl.searchParams.get('code');
    if(code){
      recoveryEventSeen=true;
      const {data,error}=await db.auth.exchangeCodeForSession(code);
      if(error){
        setStatus(error.message||'The recovery code is invalid or expired.','error');
        return;
      }
      await handleRecoverySession(data.session);
      return;
    }

    const {data,error}=await db.auth.getSession();
    if(error){
      setStatus(error.message||'The recovery session could not be read.','error');
      return;
    }
    await handleRecoverySession(data.session);
    if(!data.session&&!recoveryEventSeen){
      setStatus('The recovery link is invalid, expired or has already been used. Request a new link from Admin Sign In.','error');
    }
  };

  $('#adminRecoveryForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!verifiedUserId){
      setStatus('The recovery session is not verified.','error');
      return;
    }
    const button=$('#adminRecoverySubmit');
    const next=$('#recoveryNewPassword')?.value||'';
    const confirm=$('#recoveryConfirmPassword')?.value||'';
    const issue=passwordIssue(next);
    if(issue){setStatus(issue,'error');return;}
    if(next!==confirm){setStatus('The new passwords do not match.','error');return;}

    const original=button.textContent;
    button.disabled=true;
    button.textContent='Securing account…';
    try{
      const {error}=await db.auth.updateUser({password:next});
      if(error)throw error;
      await recordSecurityEvent('admin.security.password_recovered',{
        method:'email_recovery',
        all_sessions_revoked:true
      });
      const signedOut=await db.auth.signOut({scope:'global'});
      if(signedOut.error)throw signedOut.error;
      verifiedUserId=null;
      $('#adminRecoveryForm').hidden=true;
      setStatus('Password replaced successfully. All Admin sessions were signed out. Return to Admin Sign In and use the new password.','success');
    }catch(error){
      setStatus(error?.message||'The password could not be replaced.','error');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });

  initialize();
})();
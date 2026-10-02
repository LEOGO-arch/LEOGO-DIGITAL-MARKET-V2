import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...corsHeaders,"Content-Type":"application/json","Connection":"keep-alive"},
});

const readSecretKey=()=>{
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(legacy)return legacy;
  try{
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    return String(keys?.default||"");
  }catch{return "";}
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const secretKey=readSecretKey();
  const publishableKey=
    Deno.env.get("SUPABASE_ANON_KEY")||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||
    "sb_publishable_ZErMMEhxPlldeMNGbyEVFA_SdGUmQjF";
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();

  if(!url||!secretKey||!token){
    return json({ok:false,error:"Secure diagnostics reset service is unavailable."},500);
  }

  let body:Record<string,unknown>;
  try{body=await req.json();}
  catch{return json({ok:false,error:"Invalid request body."},400);}

  const currentPassword=String(body.current_password||"");
  const newPin=String(body.new_pin||"").trim();
  if(!currentPassword)return json({ok:false,error:"Enter the Super Admin password."},400);
  if(!/^\d{6}$/.test(newPin))return json({ok:false,error:"Use exactly 6 digits for the new System Diagnosis PIN."},400);

  const admin=createClient(url,secretKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });

  const {data:userData,error:userError}=await admin.auth.getUser(token);
  const caller=userData?.user;
  if(userError||!caller)return json({ok:false,error:"Invalid Super Admin session."},401);

  const {data:adminRow,error:adminError}=await admin
    .from("admin_users")
    .select("user_id,role,status")
    .eq("user_id",caller.id)
    .maybeSingle();

  if(adminError)return json({ok:false,error:"Super Admin verification failed."},500);
  if(!adminRow||adminRow.status!=="active"||adminRow.role!=="super_admin"){
    return json({ok:false,error:"Super Admin access required."},403);
  }
  if(!caller.email)return json({ok:false,error:"Super Admin account has no email address."},400);

  const verifier=createClient(url,publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const {data:verified,error:passwordError}=await verifier.auth.signInWithPassword({
    email:caller.email,
    password:currentPassword,
  });

  if(passwordError||verified?.user?.id!==caller.id){
    return json({ok:false,error:"Super Admin password is incorrect."},401);
  }

  // The password check creates a short-lived Auth session. Revoke it immediately;
  // it exists only to prove the password for this PIN reset.
  await verifier.auth.signOut({scope:"local"}).catch(()=>{});

  const {data:reset,error:resetError}=await admin.rpc(
    "service_reset_system_diagnostics_pin",
    {p_user_id:caller.id,p_new_pin:newPin}
  );
  if(resetError)return json({ok:false,error:resetError.message||"PIN reset failed."},400);
  if(!reset?.ok)return json(reset||{ok:false,error:"PIN reset failed."},400);

  return json({ok:true,message:"System Diagnosis PIN reset successfully."});
});

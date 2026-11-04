import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const cors={"Access-Control-Allow-Origin":"https://leogo-arch.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL");
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const publicKey=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!secret||!publicKey)return json({error:"Server configuration incomplete"},503);
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return json({error:"Login required"},401);
 const token=bearer.slice(7);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const identity=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await identity.auth.getUser(token);
 if(authError||!authData.user)return json({error:"Unauthorized"},401);
 const {data:staff,error:staffError}=await admin.from("admin_users").select("role,status").eq("user_id",authData.user.id).maybeSingle();
 if(staffError||staff?.status!=="active"||staff?.role!=="super_admin")return json({error:"Super Admin required"},403);
 let body:{job_ids?:unknown};
 try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
 const ids=body.job_ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||ids.some(x=>typeof x!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x)))return json({error:"Supply 1 to 20 job UUIDs"},400);
 const results=[];
 for(const id of [...new Set(ids)]){
  const {data:claim,error:claimError}=await admin.rpc("media_housekeeping_claim",{p_job_id:id});
  if(claimError){results.push({id,status:"claim_error",message:claimError.message});continue;}
  if(!claim){results.push({id,status:"not_eligible"});continue;}
  let deleted=false;let errorMessage:string|null=null;
  try{
   // Claim function verifies bucket/path/object identity, parcel completion,
   // 180+ day cutoff and no aftersales case, before any Storage API call.
   if(claim.bucket!=="pickup-station-proof")throw new Error("Unexpected protected bucket");
   const {error:removeError}=await admin.storage.from(claim.bucket).remove([claim.path]);
   if(removeError)throw removeError;
   deleted=true;
  }catch(error){errorMessage=String(error instanceof Error?error.message:error).slice(0,500);}
  const {data:done,error:completeError}=await admin.rpc("media_housekeeping_complete",{p_job_id:id,p_removed:deleted,p_error:errorMessage});
  results.push({id,status:completeError?"requires_reconciliation":deleted?"deleted":"failed",message:completeError?.message||errorMessage||null,confirmed:done?.updated===true});
 }
 return json({results});
});
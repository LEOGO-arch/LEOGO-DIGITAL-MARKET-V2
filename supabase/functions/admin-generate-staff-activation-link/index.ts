import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAFF_PORTAL_RECOVERY_URL =
  "https://leogo-arch.github.io/LEOGO-DIGITAL-MARKET-V2/staff/?recovery=1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errorText = (error: unknown): string => {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || "Unknown error";
  if (typeof error === "object") {
    const item = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint", "code", "error"]) {
      if (item[key] != null) {
        const nested = errorText(item[key]);
        if (nested && nested !== "[object Object]") return nested;
      }
    }
    try { return JSON.stringify(error); } catch { return "Unknown object error"; }
  }
  return String(error);
};

const readSecretKey = () => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return String(keys?.default || "");
  } catch {
    return "";
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const projectUrl = Deno.env.get("SUPABASE_URL") || "";
    const secretKey = readSecretKey();
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!projectUrl || !secretKey) {
      return json({ ok: false, error: "Secure staff link service is not configured." }, 500);
    }
    if (!token) return json({ ok: false, error: "Sign in required." }, 401);

    const admin = createClient(projectUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: callerData, error: callerAuthError } = await admin.auth.getUser(token);
    const caller = callerData?.user;
    if (callerAuthError || !caller) return json({ ok: false, error: "Valid Admin sign-in required." }, 401);

    const { data: callerProfile, error: profileError } = await admin
      .from("admin_users")
      .select("user_id,role,status")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (profileError) return json({ ok: false, error: "Could not verify Admin permissions." }, 500);
    if (callerProfile?.status !== "active" || callerProfile?.role !== "super_admin") {
      return json({ ok: false, error: "Super Admin access required." }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid request body." }, 400);
    }
    const staffUserId = typeof body.staff_user_id === "string" ? body.staff_user_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffUserId)) {
      return json({ ok: false, error: "A valid staff account is required." }, 400);
    }

    const [adminRecord, riderRecord] = await Promise.all([
      admin.from("admin_users").select("user_id,display_name,role,status").eq("user_id", staffUserId).maybeSingle(),
      admin.from("leogo_staff").select("user_id,display_name,staff_role,status").eq("user_id", staffUserId).maybeSingle(),
    ]);
    if (adminRecord.error || riderRecord.error) {
      return json({ ok: false, error: "Could not verify the staff account." }, 500);
    }
    const target = adminRecord.data
      ? { ...adminRecord.data, account_kind: "admin_staff" }
      : riderRecord.data
      ? { ...riderRecord.data, account_kind: "rider" }
      : null;
    if (!target || target.status !== "active") {
      return json({ ok: false, error: "This active staff account could not be found." }, 404);
    }
    if (target.account_kind === "admin_staff" && target.role === "super_admin") {
      return json({ ok: false, error: "Owner account recovery links cannot be copied here." }, 403);
    }

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(staffUserId);
    const staffUser = targetData?.user;
    if (targetError || !staffUser?.email) {
      return json({ ok: false, error: "The staff account has no usable email address." }, 404);
    }

    const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: staffUser.email,
      options: { redirectTo: STAFF_PORTAL_RECOVERY_URL },
    });
    if (generateError) {
      console.error("Could not generate staff recovery link:", errorText(generateError));
      return json({ ok: false, error: "Could not create a fresh staff password link. Try Send Access Email or contact Admin support." }, 400);
    }
    const actionLink = String(generated?.properties?.action_link || "");
    if (!actionLink || !actionLink.startsWith("https://")) {
      return json({ ok: false, error: "The identity service did not return a secure recovery link." }, 500);
    }

    const { error: auditError } = await admin.from("admin_audit_log").insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action: "staff.activation_link.generated",
      entity_type: target.account_kind,
      entity_id: staffUserId,
      after_data: {
        display_name: target.display_name || staffUser.user_metadata?.full_name || "",
        email: staffUser.email,
        link_type: "password_recovery",
      },
      metadata: { delivery: "admin_copy_and_send", secret_link_stored: false },
    });
    if (auditError) {
      console.error("Staff recovery link audit failed:", errorText(auditError));
      return json({ ok: false, error: "The staff link was generated but could not be recorded in the Audit Log. The link was not released; retry once logging is available." }, 500);
    }

    return json({ ok: true, action_link: actionLink });
  } catch (error) {
    console.error("Staff recovery link request failed:", errorText(error));
    return json({ ok: false, error: errorText(error) }, 500);
  }
});

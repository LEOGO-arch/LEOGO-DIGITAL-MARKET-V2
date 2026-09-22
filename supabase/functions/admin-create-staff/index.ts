import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const e = error as Record<string, unknown>;
    for (const key of ["message","error_description","details","hint","code","error"]) {
      if (e[key] != null) {
        const nested = errorText(e[key]);
        if (nested && nested !== "[object Object]") return nested;
      }
    }
    try { return JSON.stringify(error); } catch { return "Unknown object error"; }
  }
  return String(error);
};

const errorPayload = (stage: string, error: unknown, status = 400) =>
  json({
    ok: false,
    stage,
    error: errorText(error),
    code: typeof error === "object" && error && "code" in error ? String((error as Record<string, unknown>).code ?? "") : null,
  }, status);

const ROLE_DEFAULTS: Record<string, string[]> = {
  operations: [
    "dashboard.read","orders.read","orders.manage","customers.read",
    "delivery.manage","sellers.read","products.read"
  ],
  reviewer: [
    "dashboard.read","approvals.read","approvals.manage","sellers.read",
    "products.read","products.manage","customers.read"
  ],
  finance: [
    "dashboard.read","orders.read","orders.payment_verify","settlements.read",
    "settlements.manage","sellers.read","reports.export"
  ],
  support: [
    "dashboard.read","orders.read","customers.read","sellers.read","products.read"
  ],
  read_only: [
    "dashboard.read","orders.read","customers.read","sellers.read",
    "products.read","approvals.read"
  ],
};

const ALLOWED_PERMISSIONS = new Set([
  "dashboard.read","approvals.read","approvals.manage","customers.read",
  "orders.read","orders.manage","orders.payment_verify","delivery.manage",
  "sellers.read","settlements.read","settlements.manage",
  "products.read","products.manage","payments.manage","premium.read",
  "premium.manage","reports.export","fees.manage","settings.manage",
]);

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
  if (req.method !== "POST") return json({ ok:false, stage:"request", error:"Method not allowed" }, 405);

  let createdUserId: string | null = null;
  let staffRecordCreated = false;

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const secretKey = readSecretKey();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!url || !secretKey) {
      return json({ ok:false, stage:"configuration", error:"Secure staff service is not configured correctly." }, 500);
    }
    if (!token) return json({ ok:false, stage:"authentication", error:"Sign in required." }, 401);

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userError || !caller) {
      return errorPayload("authentication", userError || "Invalid Admin session", 401);
    }

    const { data: callerAdmin, error: callerError } = await admin
      .from("admin_users")
      .select("user_id,role,status")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerError) return errorPayload("authorization", callerError, 500);
    if (!callerAdmin || callerAdmin.status !== "active" || callerAdmin.role !== "super_admin") {
      return json({ ok:false, stage:"authorization", error:"Super Admin access required." }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (error) {
      return errorPayload("request", error, 400);
    }

    const accountKind = String(body.account_kind || "");
    const displayName = String(body.display_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.temporary_password || "");

    if (!["admin_staff","rider"].includes(accountKind)) {
      return json({ ok:false, stage:"validation", error:"Choose a supported staff account type." }, 400);
    }
    if (displayName.length < 2 || displayName.length > 120) {
      return json({ ok:false, stage:"validation", error:"Enter a valid staff name." }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ ok:false, stage:"validation", error:"Enter a valid staff email address." }, 400);
    }
    if (
      password.length < 10 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return json({
        ok:false,
        stage:"validation",
        error:"Temporary password must be at least 10 characters and include uppercase, lowercase, a number and a symbol. Use Generate for a secure password."
      }, 400);
    }

    let roleCode = "";
    let permissions: string[] = [];

    if (accountKind === "admin_staff") {
      roleCode = String(body.role_code || "");
      if (!Object.prototype.hasOwnProperty.call(ROLE_DEFAULTS, roleCode)) {
        return json({ ok:false, stage:"validation", error:"Choose a supported Admin staff role." }, 400);
      }

      const submitted = Array.isArray(body.permissions)
        ? body.permissions.map(String)
        : ROLE_DEFAULTS[roleCode];
      permissions = [...new Set(submitted)];
      const invalid = permissions.find((permission) => !ALLOWED_PERMISSIONS.has(permission));
      if (invalid) {
        return json({ ok:false, stage:"validation", error:`Unsupported permission: ${invalid}` }, 400);
      }
    } else {
      roleCode = "rider";
      if (phone.length < 7) {
        return json({ ok:false, stage:"validation", error:"Rider phone number is required." }, 400);
      }
    }

    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        phone: phone || null,
        staff_account: true,
        staff_role: roleCode,
      },
    });

    if (createError || !createdData?.user) {
      return errorPayload("auth_user_creation", createError || "Staff login account could not be created", 400);
    }

    const staffUser = createdData.user;
    createdUserId = staffUser.id;

    if (accountKind === "admin_staff") {
      const { error: profileError } = await admin.from("admin_users").insert({
        user_id: staffUser.id,
        display_name: displayName,
        phone: phone || null,
        department: String(body.department || "").trim() || null,
        job_title: String(body.job_title || "").trim() || null,
        role: roleCode,
        status: "active",
        permissions,
        created_by: caller.id,
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(staffUser.id);
        createdUserId = null;
        return errorPayload("admin_staff_profile", profileError, 400);
      }
    } else {
      const { error: profileError } = await admin.from("leogo_staff").insert({
        user_id: staffUser.id,
        display_name: displayName,
        phone,
        staff_role: "rider",
        status: "active",
        vehicle_type: String(body.vehicle_type || "").trim() || null,
        vehicle_registration: String(body.vehicle_registration || "").trim().toUpperCase() || null,
        id_number: String(body.id_number || "").trim() || null,
        license_number: String(body.license_number || "").trim().toUpperCase() || null,
        availability_status: "available",
        notes: String(body.notes || "").trim() || null,
        created_by: caller.id,
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(staffUser.id);
        createdUserId = null;
        return errorPayload("rider_profile", profileError, 400);
      }
    }

    staffRecordCreated = true;

    const { error: auditError } = await admin.from("admin_audit_log").insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action: "staff.account.created",
      entity_type: accountKind,
      entity_id: staffUser.id,
      after_data: {
        display_name: displayName,
        email,
        role_code: roleCode,
        status: "active",
        permissions,
      },
      metadata: { created_via: "admin_staff_management" },
    });

    if (auditError) {
      console.error("Staff account created, audit insert failed:", errorText(auditError));
    }

    return json({
      ok: true,
      user_id: staffUser.id,
      email,
      display_name: displayName,
      account_kind: accountKind,
      role_code: roleCode,
      status: "active",
      warning: auditError ? "Account created, but its creation audit entry could not be written." : null,
    });
  } catch (error) {
    if (createdUserId && !staffRecordCreated) {
      try {
        const url = Deno.env.get("SUPABASE_URL") ?? "";
        const secretKey = readSecretKey();
        if (url && secretKey) {
          const cleanupAdmin = createClient(url, secretKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          await cleanupAdmin.auth.admin.deleteUser(createdUserId);
        }
      } catch {
        // Avoid hiding the original error.
      }
    }
    return errorPayload("unexpected", error, 500);
  }
});

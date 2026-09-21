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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!url || !serviceKey) return json({ error: "Staff service is not configured" }, 500);
    if (!token) return json({ error: "Sign in required" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userError || !caller) return json({ error: "Invalid Admin session" }, 401);

    const { data: callerAdmin, error: callerError } = await admin
      .from("admin_users")
      .select("user_id,role,status")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerError) throw callerError;
    if (!callerAdmin || callerAdmin.status !== "active" || callerAdmin.role !== "super_admin") {
      return json({ error: "Super Admin access required" }, 403);
    }

    const body = await req.json();
    const accountKind = String(body.account_kind || "");
    const displayName = String(body.display_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.temporary_password || "");

    if (!["admin_staff","rider"].includes(accountKind)) {
      return json({ error: "Choose a supported staff account type" }, 400);
    }
    if (displayName.length < 2 || displayName.length > 120) {
      return json({ error: "Enter a valid staff name" }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "Enter a valid staff email address" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Temporary password must be at least 8 characters" }, 400);
    }

    let roleCode = "";
    let permissions: string[] = [];

    if (accountKind === "admin_staff") {
      roleCode = String(body.role_code || "");
      if (!Object.prototype.hasOwnProperty.call(ROLE_DEFAULTS, roleCode)) {
        return json({ error: "Choose a supported Admin staff role" }, 400);
      }

      const submitted = Array.isArray(body.permissions) ? body.permissions.map(String) : ROLE_DEFAULTS[roleCode];
      permissions = [...new Set(submitted)];
      const invalid = permissions.find((permission) => !ALLOWED_PERMISSIONS.has(permission));
      if (invalid) return json({ error: `Unsupported permission: ${invalid}` }, 400);
    } else {
      roleCode = "rider";
      if (phone.length < 7) return json({ error: "Rider phone number is required" }, 400);
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
      return json({ error: createError?.message || "Staff login account could not be created" }, 400);
    }

    const staffUser = createdData.user;

    try {
      if (accountKind === "admin_staff") {
        const { error } = await admin.from("admin_users").insert({
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
        if (error) throw error;
      } else {
        const { error } = await admin.from("leogo_staff").insert({
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
        if (error) throw error;
      }

      await admin.from("admin_audit_log").insert({
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

      return json({
        ok: true,
        user_id: staffUser.id,
        email,
        display_name: displayName,
        account_kind: accountKind,
        role_code: roleCode,
        status: "active",
      });
    } catch (insertError) {
      await admin.auth.admin.deleteUser(staffUser.id);
      throw insertError;
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

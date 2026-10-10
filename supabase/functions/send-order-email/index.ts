import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.16";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
  });

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));

const safeText = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const renderEmail = (subject: string, data: Record<string, unknown>) => {
  const kind = safeText(data.kind);
  const name = escapeHtml(safeText(data.customer_name, "Customer"));
  const order = escapeHtml(safeText(data.order_reference, "LEOGO order"));
  const station = escapeHtml(safeText(data.station_name, "LEOGO Pickup Station"));
  const address = escapeHtml(safeText(data.station_address));
  const landmark = escapeHtml(safeText(data.landmark));
  const hours = escapeHtml(safeText(data.operating_hours));
  const phone = escapeHtml(safeText(data.station_phone));

  let message = "";
  let action = "";
  let heading = "Order Update";
  let footer = "This is an automatic LEOGO order notification. If you did not place this order, contact LEOGO customer support.";
  if (kind === "admin_custom") {
    heading = escapeHtml(subject.slice(0, 120));
    message = escapeHtml(safeText(data.custom_message, "Message from LEOGO DIGITAL MARKET").slice(0, 10000))
      .replace(/\\n/g, "<br>");
    action = "";
    footer = safeText(data.purpose) === "promotion"
      ? "You received this because you opted in to LEOGO offers. Change your messaging preferences in My Profile."
      : "This message was sent by LEOGO Customer Care. Contact LEOGO support if you have any questions.";
  } else if (kind === "order_created") {
    heading = "Order Created Successfully";
    message =
      `Your order <strong>${order}</strong> has been placed successfully and received by LEOGO.`;
    action =
      "Your order will be shipped as soon as possible. You can follow its progress from My Activity / Orders in your LEOGO account.";
  } else if (kind === "order_shipped") {
    heading = "Order Shipped";
    message =
      `Your order <strong>${order}</strong> has been shipped / dispatched by LEOGO.`;
    action =
      "Your order is now on the way. Keep checking My Activity / Orders for the latest delivery update.";
  } else if (kind === "order_delivered") {
    heading = "Order Delivered Successfully";
    message =
      `Your order <strong>${order}</strong> has been marked delivered successfully.`;
    action =
      "Thank you for shopping with LEOGO. You can now review the order or use Aftersales from your LEOGO account if you need assistance.";
  } else if (kind === "pickup_station_arrived") {
    message =
      `Your order <strong>${order}</strong> has been delivered by the LEOGO Rider to <strong>${station}</strong>.`;
    action =
      "The Pickup Station Partner is now confirming physical receipt. Please wait for the next LEOGO email before going to collect the parcel.";
  } else if (kind === "pickup_station_ready") {
    message =
      `Your order <strong>${order}</strong> has been received and confirmed by <strong>${station}</strong>.`;
    action =
      "Your parcel is now ready for collection. Please carry your identification when collecting it.";
  } else if (kind === "admin_security") {
    heading = "Admin Security Alert";
    message = escapeHtml(safeText(data.security_message, "A LEOGO Super Admin security action was completed."));
    action = "If you did not perform this security action, use the Admin recovery option immediately and revoke all Admin sessions.";
    footer = "This is an automatic LEOGO Super Admin security notification. Never share your password or recovery link.";
  } else {
    message =
      "This is a test message confirming that LEOGO customer email notifications are configured correctly.";
    action =
      "No action is required. Eligible order-created, shipped, delivered and Pickup Station updates will be emailed automatically.";
  }

  const stationRows = kind === "pickup_station_ready"
    ? [
        address ? `<tr><td style="padding:5px 0;color:#6b7280;">Station address</td><td style="padding:5px 0;font-weight:700;">${address}</td></tr>` : "",
        landmark ? `<tr><td style="padding:5px 0;color:#6b7280;">Landmark</td><td style="padding:5px 0;font-weight:700;">${landmark}</td></tr>` : "",
        hours ? `<tr><td style="padding:5px 0;color:#6b7280;">Operating hours</td><td style="padding:5px 0;font-weight:700;">${hours}</td></tr>` : "",
        phone ? `<tr><td style="padding:5px 0;color:#6b7280;">Station contact</td><td style="padding:5px 0;font-weight:700;">${phone}</td></tr>` : "",
      ].join("")
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10203a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8ef;">
        <tr><td style="background:#07152f;padding:24px 28px;border-bottom:5px solid #ff7800;">
          <div style="font-size:12px;letter-spacing:.12em;color:#ff9a3f;font-weight:700;">LEOGO DIGITAL MARKET</div>
          <div style="font-size:22px;color:#ffffff;font-weight:800;margin-top:5px;">${heading}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hello <strong>${name}</strong>,</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${message}</p>
          ${action ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin:18px 0;font-size:14px;line-height:1.55;">${escapeHtml(action)}</div>` : ""}
          ${stationRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-top:1px solid #eef1f5;padding-top:10px;">${stationRows}</table>` : ""}
          <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:24px 0 0;">${escapeHtml(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration unavailable" }, 500);

  let payload: { job_id?: string; token?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const jobId = String(payload.job_id || "").trim();
  const token = String(payload.token || "").trim();
  if (!jobId || !token) return json({ error: "Missing email job credentials" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: job, error: jobError } = await supabase
    .from("order_email_outbox")
    .select("*")
    .eq("id", jobId)
    .eq("delivery_token", token)
    .maybeSingle();

  if (jobError || !job) return json({ error: "Email job not found" }, 404);
  if (job.sent_at || job.status === "sent") return json({ ok: true, duplicate: true });

  const { data: config, error: configError } = await supabase.rpc("edge_get_email_sender_credentials");
  if (configError) {
    await supabase.from("order_email_outbox").update({
      status: "configuration_required",
      last_error: "Email sender configuration could not be loaded.",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ ok: false, configuration_required: true }, 200);
  }

  const emailKind = safeText(job.template_data?.kind);
  const securityEmail = emailKind === "admin_security";
  if ((!securityEmail && !config?.enabled) || !config?.sender_email || !config?.app_password) {
    await supabase.from("order_email_outbox").update({
      status: "configuration_required",
      last_error: securityEmail
        ? "LEOGO security email sender is not fully configured."
        : "Customer email notifications are not fully configured.",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ ok: false, configuration_required: true }, 200);
  }

  const nextAttemptCount = Number(job.attempt_count || 0) + 1;
  await supabase.from("order_email_outbox").update({
    status: "sending",
    attempt_count: nextAttemptCount,
    last_attempt_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: String(config.sender_email),
        pass: String(config.app_password),
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 18000,
    });

    const info = await transporter.sendMail({
      from: `"${String(config.sender_name || "LEOGO DIGITAL MARKET").replace(/"/g, "")}" <${config.sender_email}>`,
      to: String(job.recipient_email),
      subject: String(job.subject),
      html: renderEmail(String(job.subject), (job.template_data || {}) as Record<string, unknown>),
      text: emailKind === "admin_custom"
        ? `LEOGO DIGITAL MARKET\\n\\n${String(job.subject)}\\n\\nHello ${safeText(job.recipient_name, "Customer")},\\n\\n${safeText(job.template_data?.custom_message)}\\n\\n${safeText(job.template_data?.purpose) === "promotion" ? "Manage offers in your LEOGO My Profile." : "Contact LEOGO support for assistance."}`
        : securityEmail
        ? `LEOGO DIGITAL MARKET\n\n${String(job.subject)}\n\n${safeText(job.template_data?.security_message, "A Super Admin security action was completed.")}\n\nIf this was not you, use Admin recovery immediately and revoke all sessions.\n`
        : `LEOGO DIGITAL MARKET\n\n${String(job.subject)}\n\nOrder: ${safeText(job.template_data?.order_reference, "LEOGO order")}\n\n${emailKind === "order_created" ? "Your order has been placed successfully and will be shipped as soon as possible." : emailKind === "order_shipped" ? "Your order has been shipped / dispatched and is on the way." : emailKind === "order_delivered" ? "Your order has been delivered successfully." : ""}\n`,
    });

    await supabase.from("order_email_outbox").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: String(info?.messageId || ""),
      last_error: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    return json({ ok: true });
  } catch (error) {
    const message = String((error as Error)?.message || error || "Email send failed").slice(0, 900);
    const finalFailure = nextAttemptCount >= 5;
    const retryMinutes = Math.min(nextAttemptCount * 5, 30);
    const nextAttempt = finalFailure
      ? null
      : new Date(Date.now() + retryMinutes * 60 * 1000).toISOString();

    await supabase.from("order_email_outbox").update({
      status: "failed",
      last_error: message,
      next_attempt_at: nextAttempt,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    return json({ ok: false, retry_scheduled: !finalFailure }, 200);
  }
});

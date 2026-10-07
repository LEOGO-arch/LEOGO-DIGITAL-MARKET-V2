import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const AFRINET_ENDPOINT = "https://bulksms.afrinettelecom.co.ke/api/services/sendsms/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
  });

const getRequiredEnv = (name: string): string => {
  const value = (Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

const normalizeKenyanMobile = (phone: string): string => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error("Phone number is not a valid Kenyan mobile number");
};

const providerCode = (body: unknown): number | null => {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const first = Array.isArray(record.responses) && record.responses.length
    ? record.responses[0]
    : record;
  if (!first || typeof first !== "object") return null;
  const item = first as Record<string, unknown>;
  const raw = item["response-code"] ?? item["respose-code"] ?? item.code ?? null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const providerDescription = (body: unknown): string => {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const first = Array.isArray(record.responses) && record.responses.length
    ? record.responses[0]
    : record;
  if (!first || typeof first !== "object") return "";
  const item = first as Record<string, unknown>;
  return String(
    item["response-description"] ??
    item["respose-description"] ??
    item.message ??
    ""
  ).slice(0, 240);
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
  if (!jobId || !token) return json({ error: "Missing SMS job credentials" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: job, error: jobError } = await supabase
    .from("order_sms_outbox")
    .select("*")
    .eq("id", jobId)
    .eq("delivery_token", token)
    .maybeSingle();

  if (jobError || !job) return json({ error: "SMS job not found" }, 404);
  if (job.sent_at || job.status === "sent") return json({ ok: true, duplicate: true });

  const nextAttemptCount = Number(job.attempt_count || 0) + 1;
  await supabase.from("order_sms_outbox").update({
    status: "sending",
    attempt_count: nextAttemptCount,
    last_attempt_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  try {
    const partnerID = getRequiredEnv("AFRINET_PARTNER_ID");
    const apikey = getRequiredEnv("AFRINET_API_KEY");
    const shortcode = getRequiredEnv("AFRINET_SENDER_ID");
    const mobile = normalizeKenyanMobile(String(job.recipient_phone || ""));
    const message = String(job.message || "").trim().slice(0, 480);
    if (!message) throw new Error("SMS message is empty");

    const response = await fetch(AFRINET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey,
        partnerID,
        mobile,
        message,
        shortcode,
        pass_type: "plain",
      }),
    });

    const responseText = await response.text();
    let responseBody: unknown = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText;
    }

    const code = providerCode(responseBody);
    const description = providerDescription(responseBody);

    if (!response.ok || (code !== null && code !== 200)) {
      throw new Error(description || `Afrinet rejected SMS with HTTP ${response.status}`);
    }

    const providerMessageId =
      responseBody && typeof responseBody === "object"
        ? String(
            ((Array.isArray((responseBody as Record<string, unknown>).responses)
              ? ((responseBody as Record<string, unknown>).responses as unknown[])[0]
              : responseBody) as Record<string, unknown> | undefined)?.["messageid"] ??
            ((Array.isArray((responseBody as Record<string, unknown>).responses)
              ? ((responseBody as Record<string, unknown>).responses as unknown[])[0]
              : responseBody) as Record<string, unknown> | undefined)?.["message-id"] ??
            ""
          )
        : "";

    await supabase.from("order_sms_outbox").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId || null,
      last_error: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    console.log("LEOGO order SMS accepted", {
      jobId: job.id,
      eventKey: job.event_key,
      phoneLast4: mobile.slice(-4),
      providerCode: code ?? 200,
    });

    return json({ ok: true });
  } catch (error) {
    const message = String((error as Error)?.message || error || "SMS send failed").slice(0, 900);
    const finalFailure = nextAttemptCount >= 5;
    const retryMinutes = Math.min(nextAttemptCount * 3, 15);
    const nextAttempt = finalFailure
      ? null
      : new Date(Date.now() + retryMinutes * 60 * 1000).toISOString();

    await supabase.from("order_sms_outbox").update({
      status: "failed",
      last_error: message,
      next_attempt_at: nextAttempt,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    console.error("LEOGO order SMS failed", {
      jobId: job.id,
      eventKey: job.event_key,
      attempt: nextAttemptCount,
      message,
    });

    return json({ ok: false, retry_scheduled: !finalFailure }, 200);
  }
});

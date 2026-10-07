import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const AFRINET_ENDPOINT = "https://sms.imarabiz.com/api/services/sendsms/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

const verifyHook = (payload: string, headers: Record<string, string>) => {
  const configured = getRequiredEnv("SEND_SMS_HOOK_SECRET")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);

  let lastError: unknown = null;
  for (const configuredSecret of configured) {
    const secret = configuredSecret.replace(/^v1,whsec_/, "");
    try {
      return new Webhook(secret).verify(payload, headers) as {
        user?: { phone?: string | null };
        sms?: { otp?: string | null };
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("SMS hook signature verification failed");
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
  if (req.method !== "POST") {
    return json({ error: { http_code: 405, message: "Method not allowed" } }, 405);
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const event = verifyHook(payload, headers);

    const phone = normalizeKenyanMobile(String(event.user?.phone || ""));
    const otp = String(event.sms?.otp || "").trim();
    if (!/^\d{4,10}$/.test(otp)) {
      throw new Error("Supabase SMS hook did not provide a valid OTP");
    }

    const partnerID = getRequiredEnv("AFRINET_PARTNER_ID");
    const apikey = getRequiredEnv("AFRINET_API_KEY");
    const shortcode = getRequiredEnv("AFRINET_SENDER_ID");

    const message = `LEOGO verification code: ${otp}. This code expires shortly. Do not share it.`;

    const response = await fetch(AFRINET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey,
        partnerID,
        mobile: phone,
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
      console.error("Afrinet SMS rejected", {
        httpStatus: response.status,
        providerCode: code,
        description,
        phoneLast4: phone.slice(-4),
      });
      return json({
        error: {
          http_code: response.status || 502,
          message: description || "Afrinet could not send the verification SMS",
        },
      }, 502);
    }

    console.log("Afrinet OTP accepted", {
      providerCode: code ?? 200,
      phoneLast4: phone.slice(-4),
    });

    return json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS hook failed";
    console.error("Afrinet SMS hook error", { message });
    return json({
      error: {
        http_code: 500,
        message,
      },
    }, 500);
  }
});

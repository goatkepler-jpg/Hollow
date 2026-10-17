// NOCTURNE / Meta Conversions API for Vercel.
// Secret only in Vercel Production environment: META_CAPI_ACCESS_TOKEN.
const PIXEL_ID = "1319002526469458";
const ALLOWED_ORIGINS = new Set(["https://hollowsound.store", "https://www.hollowsound.store"]);
const EVENTS = new Set(["PageView", "InitiateCheckout"]);
const MAX_BODY = 2048;

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default {
  async fetch(request) {
    if (request.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
    const origin = request.headers.get("origin");
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { ok: false, error: "origin_rejected" });
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (declaredLength > MAX_BODY) return json(413, { ok: false, error: "payload_too_large" });

    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!token) return json(503, { ok: false, error: "not_configured" });

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json(413, { ok: false, error: "payload_too_large" });
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }
    if (!body || !EVENTS.has(body.event_name) ||
        typeof body.event_id !== "string" ||
        !/^nct_[A-Za-z0-9_-]{10,100}$/.test(body.event_id)) {
      return json(400, { ok: false, error: "invalid_event" });
    }

    const userData = { client_user_agent: (request.headers.get("user-agent") || "").slice(0, 500) };
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) userData.client_ip_address = ip;
    if (typeof body.fbp === "string" && /^fb\.1\.[A-Za-z0-9._-]{4,180}$/.test(body.fbp)) userData.fbp = body.fbp;
    if (typeof body.fbc === "string" && /^fb\.1\.[A-Za-z0-9._-]{4,180}$/.test(body.fbc)) userData.fbc = body.fbc;

    const event = {
      event_name: body.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: body.event_id,
      event_source_url: "https://hollowsound.store/",
      action_source: "website",
      user_data: userData
    };
    if (body.event_name === "InitiateCheckout") {
      event.custom_data = { value: 10, currency: "USD", content_name: "NOCTURNE Halloween Sound Pack" };
    }

    try {
      const reply = await fetch(`https://graph.facebook.com/v26.0/${PIXEL_ID}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ data: [event] }),
        signal: AbortSignal.timeout(7000)
      });
      if (!reply.ok) return json(502, { ok: false, error: "meta_api_error" });
      return json(200, { ok: true });
    } catch {
      return json(502, { ok: false, error: "meta_network_error" });
    }
  }
};

// POST /api/subscribe — save a Pariroa Pā updates sign-up in private R2.
import { hmacSha256, sha256hex, checkAndInc, json, fail, isEmailShaped } from "./lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || JSON.stringify(body).length > 2048) return fail(400, "body");
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 254).toLowerCase() : "";
    const website = typeof body.website === "string" ? body.website.trim() : "";
    if (website || !isEmailShaped(email)) return fail(400, "email");
    if (!env.SIGNUPS || !env.SIGNUP_KEY_SECRET) return fail(503, "unavailable");

    const emailKey = await hmacSha256(env.SIGNUP_KEY_SECRET, email);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ipKey = await sha256hex((env.SIGNUP_KEY_SECRET || "") + ":" + ip + ":" + new Date().toISOString().slice(0, 10));
    const emailRate = await checkAndInc(env, "subscriptions", emailKey, 3);
    const ipRate = await checkAndInc(env, "subscriptions-ip", ipKey, 20);
    if (!emailRate.ok || !ipRate.ok) return json({ ok: false, error: "rate" }, 429);

    const key = `subscribers/${emailKey}.json`;
    const existing = await env.SIGNUPS.get(key);
    if (!existing) {
      await env.SIGNUPS.put(key, JSON.stringify({
        email,
        subscribedAt: new Date().toISOString(),
        source: "site",
        consentVersion: "2026-10-02",
        status: "pending",
      }), { httpMetadata: { contentType: "application/json" } });
    }
    return json({ ok: true });
  } catch {
    return fail(400, "body");
  }
}

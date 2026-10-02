// POST /api/admin/login — v2 admin door (2 Oct 2026): one admin key instead
// of email codes. Body {key}. Rate cap: 10 tries per hour → 429.
// Success mints a signed session {email:"admin@pariroa", adm:true} for 30 days.
import { signSession, sessionCookieHeader, checkAndInc, json, fail } from "../lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let key;
    try {
      const body = await request.json();
      key = body.key;
    } catch {
      return fail(400, "body");
    }
    if (typeof key !== "string" || !key) return fail(400, "key");

    const rate = await checkAndInc(env, "alogin", "g", 10, 60 * 60 * 1000);
    if (!rate.ok) return json({ ok: false, error: "rate" }, 429);

    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return fail(403, "key");

    const value = await signSession(
      { email: "admin@pariroa", exp: Date.now() + 2592000 * 1000, adm: true },
      env.SESSION_SECRET
    );
    return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(value) });
  } catch {
    return fail(500, "server");
  }
}

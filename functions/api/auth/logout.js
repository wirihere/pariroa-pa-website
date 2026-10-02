// POST /api/auth/logout — clears the session cookie.
import { clearCookieHeader, json } from "../lib.js";

export async function onRequestPost(context) {
  return json({ ok: true }, 200, { "set-cookie": clearCookieHeader() });
}

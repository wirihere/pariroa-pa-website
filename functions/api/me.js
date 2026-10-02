// GET /api/me — 200 {email, admin} with a valid session, else 401.
// v2: admin sessions carry adm:true (minted by /api/admin/login).
import { readSession, isAdminSession, isAdminEmail, json, fail } from "./lib.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const session = await readSession(request, env);
    if (!session) return fail(401, "auth");
    return json({ email: session.email, admin: isAdminSession(session) || isAdminEmail(session.email, env) });
  } catch {
    return fail(500, "server");
  }
}

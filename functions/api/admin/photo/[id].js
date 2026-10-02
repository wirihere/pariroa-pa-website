// GET /api/admin/photo/<id>?v=thumb|full — admin only, pending image bytes.
// Cache-Control: private, no-store.
import { readSession, isAdminSession, sniffImage, fail } from "../../lib.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  try {
    const session = await readSession(request, env);
    if (!session) return fail(401, "auth");
    if (!isAdminSession(session)) return fail(403, "admin");

    const id = String(params.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "notfound");
    const v = new URL(request.url).searchParams.get("v");
    if (v !== "thumb" && v !== "full") return fail(400, "v");

    const key = v === "thumb" ? `pending/${id}-thumb.webp` : `pending/${id}.webp`;
    const obj = await env.PHOTOS.get(key);
    if (!obj) return fail(404, "notfound");

    const bytes = new Uint8Array(await obj.arrayBuffer());
    const type = sniffImage(bytes) || "application/octet-stream";
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": type, "cache-control": "private, no-store" },
    });
  } catch {
    return fail(500, "server");
  }
}

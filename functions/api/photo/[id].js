// GET /api/photo/<id>?v=thumb|full — public, approved images only.
// Real Content-Type from magic bytes, immutable caching, ETag from R2.
// 404 when not approved (pending is never served here).
import { sniffImage, fail } from "../lib.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  try {
    const id = String(params.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "notfound");
    const v = new URL(request.url).searchParams.get("v");
    if (v !== "thumb" && v !== "full") return fail(400, "v");

    const key = v === "thumb" ? `approved/${id}-thumb.webp` : `approved/${id}.webp`;
    const obj = await env.PHOTOS.get(key);
    if (!obj) return fail(404, "notfound");

    const bytes = new Uint8Array(await obj.arrayBuffer());
    const type = sniffImage(bytes) || "application/octet-stream";
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        ...(obj.etag ? { etag: obj.etag } : {}),
      },
    });
  } catch {
    return fail(500, "server");
  }
}

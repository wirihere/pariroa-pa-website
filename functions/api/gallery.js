// GET /api/gallery — public. Serves manifest.json {updated, photos:[...]}
// newest first. Cache-Control: public, max-age=60.
import { json, fail } from "./lib.js";

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const obj = await env.PHOTOS.get("manifest.json");
    if (!obj) {
      return json({ updated: new Date().toISOString(), photos: [] }, 200,
        { "cache-control": "public, max-age=60" });
    }
    let manifest;
    try {
      manifest = await obj.json();
    } catch {
      return json({ updated: new Date().toISOString(), photos: [] }, 200,
        { "cache-control": "public, max-age=60" });
    }
    manifest.photos = (manifest.photos || []).slice().sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    return json(manifest, 200, { "cache-control": "public, max-age=60" });
  } catch {
    return fail(500, "server");
  }
}

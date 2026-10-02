// POST /api/admin/action — admin session only (re-checked per request).
// Body {id, action:"approve"|"reject"|"unpublish", caption? ≤200}. approve: get()
// the pending bytes then put() into approved/ (R2 has no copy), delete the
// pending triple, then read-modify-write manifest.json. reject: delete the
// pending triple. unpublish: delete the approved pair and drop the manifest
// entry (for pulling a live photo back off the gallery). → {ok:true}.
import { readSession, isAdminSession, sniffImage, json, fail } from "../lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const session = await readSession(request, env);
    if (!session) return fail(401, "auth");
    if (!isAdminSession(session)) return fail(403, "admin");

    let id, action, caption;
    try {
      const body = await request.json();
      id = body.id;
      action = body.action;
      caption = body.caption;
    } catch {
      return fail(400, "body");
    }
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "id");
    if (action !== "approve" && action !== "reject" && action !== "unpublish") return fail(400, "action");
    if (caption !== undefined && caption !== null && typeof caption !== "string") {
      return fail(400, "caption");
    }
    if (typeof caption === "string") caption = caption.trim().slice(0, 200);

    if (action === "unpublish") {
      await Promise.all([
        env.PHOTOS.delete(`approved/${id}.webp`),
        env.PHOTOS.delete(`approved/${id}-thumb.webp`),
      ]);
      let manifest = { updated: new Date().toISOString(), photos: [] };
      const mObj = await env.PHOTOS.get("manifest.json");
      if (mObj) {
        try { manifest = await mObj.json(); } catch { /* start fresh */ }
      }
      if (Array.isArray(manifest.photos)) {
        manifest.photos = manifest.photos.filter(p => p && p.id !== id);
      }
      manifest.updated = new Date().toISOString();
      await env.PHOTOS.put("manifest.json", JSON.stringify(manifest));
      return json({ ok: true });
    }

    const metaObj = await env.PHOTOS.get(`pending/${id}.json`);
    if (!metaObj) return fail(404, "notfound");
    let meta;
    try { meta = await metaObj.json(); } catch { return fail(404, "notfound"); }

    const triple = [`pending/${id}.webp`, `pending/${id}-thumb.webp`, `pending/${id}.json`];

    if (action === "reject") {
      await Promise.all(triple.map(k => env.PHOTOS.delete(k)));
      return json({ ok: true });
    }

    // approve — copy bytes into approved/ (R2 has no copy)
    for (const [src, dst] of [
      [`pending/${id}.webp`, `approved/${id}.webp`],
      [`pending/${id}-thumb.webp`, `approved/${id}-thumb.webp`],
    ]) {
      const obj = await env.PHOTOS.get(src);
      if (!obj) return fail(404, "notfound");
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const type = sniffImage(bytes) || "application/octet-stream";
      await env.PHOTOS.put(dst, bytes, { httpMetadata: { contentType: type } });
    }

    await Promise.all(triple.map(k => env.PHOTOS.delete(k)));

    // manifest read-modify-write (the UI sends one action at a time)
    let manifest = { updated: new Date().toISOString(), photos: [] };
    const mObj = await env.PHOTOS.get("manifest.json");
    if (mObj) {
      try { manifest = await mObj.json(); } catch { /* start fresh */ }
    }
    if (!Array.isArray(manifest.photos)) manifest.photos = [];

    const entry = {
      id,
      caption: caption !== undefined && caption !== null && caption !== "" ? caption : (meta.caption || ""),
      name: meta.showName === "1" ? (meta.name || null) : null,
      date: meta.uploaded || new Date().toISOString(),
    };
    manifest.photos = manifest.photos.filter(p => p && p.id !== id);
    manifest.photos.push(entry);
    manifest.updated = new Date().toISOString();
    await env.PHOTOS.put("manifest.json", JSON.stringify(manifest));

    return json({ ok: true });
  } catch {
    return fail(500, "server");
  }
}

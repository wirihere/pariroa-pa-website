// GET /api/admin/pending — admin session only (re-checked per request).
// {items:[{id, caption, name, email, uploaded, thumb:"/api/admin/photo/<id>?v=thumb"}]}
// oldest first, 50 at a time (the UI refreshes after each action, so the
// next batch appears as earlier ones are approved or rejected).
import { readSession, isAdminSession, json, fail } from "../lib.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const session = await readSession(request, env);
    if (!session) return fail(401, "auth");
    if (!isAdminSession(session)) return fail(403, "admin");

    // Drain pending listings (json keys only) so nothing is skipped between
    // R2 pages, then serve the 50 oldest. Bounded at 10 pages (~330 items)
    // to keep one request cheap; realistic moderation volume sits far below.
    const items = [];
    let cursor = new URL(request.url).searchParams.get("cursor") || undefined;
    for (let page = 0; page < 10; page++) {
      const listing = await env.PHOTOS.list({ prefix: "pending/", cursor, limit: 200 });
      cursor = listing.cursor || undefined;
      const jsonKeys = listing.objects.map(o => o.key).filter(k => k.endsWith(".json"));
      for (const key of jsonKeys) {
        const obj = await env.PHOTOS.get(key);
        if (!obj) continue;
        let meta;
        try { meta = await obj.json(); } catch { continue; }
        const id = key.slice("pending/".length, -".json".length);
        items.push({
          id,
          caption: meta.caption || "",
          name: meta.name || null,
          email: meta.email || "",
          uploaded: meta.uploaded || null,
          thumb: `/api/admin/photo/${id}?v=thumb`,
        });
      }
      if (!cursor) break;
    }
    items.sort((a, b) => new Date(a.uploaded || 0) - new Date(b.uploaded || 0));

    return json({ items: items.slice(0, 50) });
  } catch {
    return fail(500, "server");
  }
}

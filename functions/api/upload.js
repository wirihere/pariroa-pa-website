// POST /api/upload — open to whānau; the uploader's email arrives as a form
// field (v2, 2 Oct 2026 — no login; the admins tell them when photos post).
// multipart/form-data: email (required, recorded + rate key); file (≤10MB),
// thumb (≤1MB) — WebP/JPEG by magic bytes only; caption ≤200; name ≤80
// optional; showName "1"|"0"; width/height integers ≤10000.
// Caps: 20 uploads per email per day, 50 per network per day → 429
// {ok:false, error:"rate", retryTomorrow:true}. Stores the pending triple.
import { sha256hex, sniffImage, checkAndInc, json, fail, isEmailShaped } from "./lib.js";

const MAX_FILE = 10 * 1024 * 1024;
const MAX_THUMB = 1 * 1024 * 1024;

function limitedString(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let form;
    try {
      form = await request.formData();
    } catch {
      return fail(400, "body");
    }

    const email = (typeof form.get("email") === "string" ? form.get("email") : "").trim().slice(0, 254).toLowerCase();
    if (!isEmailShaped(email)) return fail(400, "email");

    const file = form.get("file");
    const thumb = form.get("thumb");
    if (!(file instanceof File) || !(thumb instanceof File)) return fail(400, "body");

    if (file.size > MAX_FILE) return fail(413, "size");
    if (thumb.size > MAX_THUMB) return fail(413, "size");

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
    const fileType = sniffImage(fileBytes);   // never trust the client's type field
    const thumbType = sniffImage(thumbBytes);
    if (!fileType || !thumbType) return fail(415, "type");

    const caption = limitedString(form.get("caption"), 200);
    const name = limitedString(form.get("name"), 80);
    const showName = form.get("showName") === "1" ? "1" : "0";

    const w = Number(form.get("width"));
    const h = Number(form.get("height"));
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 10000 || h > 10000) {
      return fail(400, "dims");
    }

    // 20 uploads per email per day, 50 per network per day
    const rateKey = await sha256hex(email);
    const rate = await checkAndInc(env, "uploads", rateKey, 20);
    if (!rate.ok) return json({ ok: false, error: "rate", retryTomorrow: true }, 429);
    const ipRate = await checkAndInc(env, "uploadsip", await ipHash(request, env), 50);
    if (!ipRate.ok) return json({ ok: false, error: "rate", retryTomorrow: true }, 429);

    const id = crypto.randomUUID();
    // Keys are fixed by the spec as <id>.webp / <id>-thumb.webp whatever the
    // actual bytes; Content-Type is derived from magic bytes at serve time.
    await env.PHOTOS.put(`pending/${id}.webp`, fileBytes, {
      httpMetadata: { contentType: fileType },
    });
    await env.PHOTOS.put(`pending/${id}-thumb.webp`, thumbBytes, {
      httpMetadata: { contentType: thumbType },
    });
    await env.PHOTOS.put(`pending/${id}.json`, JSON.stringify({
      email, caption, name, showName, w, h,
      uploaded: new Date().toISOString(),
      ip: await ipHash(request, env),
      ua: (request.headers.get("User-Agent") || "").slice(0, 200),
    }));

    return json({ id });
  } catch {
    return fail(500, "server");
  }
}

async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const day = new Date().toISOString().slice(0, 10);
  return sha256hex(ip + day + env.SESSION_SECRET);
}

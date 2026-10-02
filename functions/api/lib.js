// lib.js — shared helpers for the Pariroa gallery Pages Functions.
// Exports only; no route handlers live here.
// Runtime: Cloudflare Workers (crypto.subtle, env.PHOTOS R2 binding).

const enc = new TextEncoder();

// ---------- encoding ----------

export function b64urlEncode(str) {
  let bytes = enc.encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- hashing / hmac ----------

export async function sha256hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256(keyStr, msgStr) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(keyStr), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msgStr));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- session cookie ----------

const COOKIE_NAME = "pariroa_gallery";
const COOKIE_MAX_AGE = 2592000; // 30 days, seconds

// payload: {email, exp(ms), adm}
export async function signSession(payload, secret) {
  const body = b64urlEncode(JSON.stringify(payload));
  const mac = await hmacSha256(secret, body);
  return body + "." + mac;
}

export function sessionCookieHeader(value) {
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// Returns the verified payload object or null (bad signature / expired / malformed).
export async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const dot = m[1].lastIndexOf(".");
  if (dot < 1) return null;
  const body = m[1].slice(0, dot);
  const mac = m[1].slice(dot + 1);
  let expected;
  try {
    expected = await hmacSha256(env.SESSION_SECRET, body);
  } catch {
    return null;
  }
  if (!timingSafeEq(mac, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body));
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- admin ----------

export function isAdminEmail(email, env) {
  if (!email) return false;
  const list = (env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

// v2 admin door: sessions minted by /api/admin/login carry adm:true.
export function isAdminSession(session) {
  return !!session && session.adm === true;
}

// ---------- rate counters ----------
// sys/ctr/<purpose>/<key>/<yyyymmdd>.json  {n, exp}
// Missing or expired counter = 0. Returns {ok, n} — ok false when over limit.

export async function checkAndInc(env, purpose, key, limit, windowMs = 48 * 3600 * 1000) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const p = `sys/ctr/${purpose}/${key}/${day}.json`;
  const now = Date.now();
  let n = 0;
  try {
    const obj = await env.PHOTOS.get(p);
    if (obj) {
      const rec = await obj.json();
      if (typeof rec.exp === "number" && rec.exp > now) n = rec.n || 0;
    }
  } catch {
    n = 0;
  }
  n += 1;
  // counters age out by key date; windowMs also bounds the count window
  // (day-keyed caps use the 48h default, the 15-min send cap passes 15 min)
  await env.PHOTOS.put(p, JSON.stringify({ n, exp: now + windowMs }));
  return { ok: n <= limit, n };
}

// ---------- email (Brevo) ----------

export async function sendMail(env, toEmail, subject, text) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER) return false;
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER },
        to: [{ email: toEmail }],
        subject,
        text,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- image sniffing (magic bytes — never trust the client type) ----------

// Returns "image/webp", "image/jpeg", or null.
export function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

// ---------- responses ----------

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function fail(status, error) {
  return json({ ok: false, error }, status);
}

// ---------- misc ----------

export function yyyymmdd(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function isEmailShaped(email) {
  return typeof email === "string" && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

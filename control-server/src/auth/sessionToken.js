import crypto from "node:crypto";

// 180 Tage statt 7 (Freigabe C des Betreibers, 2026-08-05: "eingeloggt bleiben
// bis zur manuellen Abmeldung"). Die Dauer allein reicht nicht — /api/auth/me
// gibt zusaetzlich bei jeder Nutzung ein frisches Token zurueck (gleitende
// Verlaengerung); nur wer 180 Tage GAR NICHT kommt, muss sich neu anmelden.
// Abmelden widerruft serverseitig (E-Mail-Sitzungen) bzw. loescht das Token.
const MAX_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// Kurzlebiges, eng gescoptes Access-Token fuer Cross-Origin-Bridge-Aufrufe
// (H1-Haertung 2026-08-09, hinter Env-Flag SMEJJ_SHORT_ACCESS_TOKEN). Es traegt
// kind:"access" und lebt nur wenige Minuten. Zweck: das 180-Tage-Session-Token
// bleibt ausschliesslich im HttpOnly-Cookie; der JS-lesbare Bearer, den das
// Frontend an die Salad-/Zeabur-Bridge schickt, ist nur noch dieses
// Kurzzeit-Token. Ein per XSS exfiltrierter Bearer oeffnet damit nur ein
// Minuten-Fenster statt 180 Tage. verifySessionToken akzeptiert beide
// Token-Arten unveraendert (rueckwaertskompatibel).
const ACCESS_TTL_MS = 10 * 60 * 1000;

export function issueAccessToken({ secret, user, nowMs = Date.now() } = {}) {
  return issueSessionToken({ secret, user: { ...user, kind: "access" }, nowMs, ttlMs: ACCESS_TTL_MS });
}

export function issueSessionToken({ secret, user, nowMs = Date.now(), ttlMs = MAX_TTL_MS } = {}) {
  if (!String(secret || "")) throw new Error("session_token_secret_missing");
  const safeUser = normalizeUser(user);
  if (!safeUser) throw new Error("session_token_user_invalid");
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    user: safeUser,
    issuedAt: nowMs,
    expiresAt: nowMs + Math.min(MAX_TTL_MS, Math.max(60_000, Number(ttlMs) || MAX_TTL_MS))
  })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

export function verifySessionToken(token, { secret, nowMs = Date.now() } = {}) {
  if (!String(secret || "")) return null;
  const [payloadPart, signaturePart] = String(token || "").split(".");
  if (!payloadPart || !signaturePart || !sameText(sign(secret, payloadPart), signaturePart)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (payload.version !== 1 || Number(payload.expiresAt || 0) <= nowMs || Number(payload.issuedAt || 0) > nowMs + 60_000) return null;
    return normalizeUser(payload.user);
  } catch {
    return null;
  }
}

export function bearerSessionToken(headers = {}) {
  const match = String(headers.authorization || headers.Authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizeUser(value) {
  if (!value || typeof value !== "object") return null;
  const user = {};
  for (const key of ["userId", "email", "name", "method", "sub", "picture", "sid", "kind"]) {
    const text = String(value[key] || "").trim();
    if (text) user[key] = text.slice(0, key === "picture" ? 500 : 200);
  }
  return user.userId || user.email || user.sub ? user : null;
}

function sign(secret, payload) {
  return crypto.createHmac("sha256", String(secret)).update(payload).digest("base64url");
}

function sameText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

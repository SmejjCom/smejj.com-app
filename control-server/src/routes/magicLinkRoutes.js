// smejj.com — Magic-Link-Login (passwortlos per E-Mail).
// Nutzt die bestehende SMTP-Mailer-Infrastruktur (mailer.js). Fail-closed:
// ohne konfigurierten Mailer wird nichts gesendet und ehrlich 503 gemeldet.
// Token ist HMAC-signiert (sessionSecret), kurzlebig und best-effort einmalig
// (In-Memory-Consumed-Set je Instanz). Cross-Origin-Rueckkehr via One-Time-Handoff.
import crypto from "node:crypto";
import { hmac } from "../shared/hash.js";
import { sendAuthMail, mailerConfig } from "../auth/mailer.js";
import { createRateLimiter, clientKeyFromRequest } from "../http/rateLimiter.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const requestLimiter = createRateLimiter({ capacity: 5, refillPerSec: 5 / 900 }); // ~5/15min je IP
const consumed = new Map(); // jti -> expiresAt (best-effort Single-Use)

export function createMagicLinkHandlers({
  json,
  readJson,
  SECURITY_HEADERS,
  serializeSessionCookie,
  serializeSessionToken,
  sessionHandoffStore,
  allowedOriginsFromEnv,
  sessionSecret,
  ROUTES,
  env = process.env,
  sendMail = sendAuthMail,
  nowMs = () => Date.now()
}) {
  const secret = () => (typeof sessionSecret === "function" ? sessionSecret() : sessionSecret);

  function safeReturnOrigin(value) {
    const origin = String(value || "").trim().replace(/\/$/, "");
    return allowedOriginsFromEnv(env).includes(origin) ? origin : null;
  }

  function originOf(req, url) {
    const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
    return `${String(proto).split(",")[0].trim()}://${req.headers.host}`;
  }

  async function handleMagicLinkRequest(req, res, url) {
    if (!secret()) return json(res, 503, { ok: false, error: "Session Secret fehlt." });
    if (!mailerConfig(env)) return json(res, 503, { ok: false, error: "email_delivery_unconfigured" });
    const gate = requestLimiter.take(clientKeyFromRequest(req));
    if (!gate.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Number(gate.retryAfterSec) || 1)));
      return json(res, 429, { ok: false, error: "rate_limit_reached" });
    }
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(res, 400, { ok: false, error: "email_invalid" });
    const handoffReturn = safeReturnOrigin(body.returnOrigin);
    const handoff = String(body.handoff || "").trim();
    const token = signMagicToken({
      email,
      jti: crypto.randomBytes(18).toString("base64url"),
      handoff: handoff && handoffReturn ? handoff : "",
      handoffReturn: handoff && handoffReturn ? handoffReturn : "",
      exp: nowMs() + TOKEN_TTL_MS
    }, secret());
    const link = `${originOf(req, url)}${ROUTES.api.authMagicLinkVerify}?token=${encodeURIComponent(token)}`;
    const result = await sendMail({
      to: email,
      subject: "Dein smejj.com Anmeldelink",
      text: [
        "Hallo,",
        "",
        "hier ist dein Anmeldelink fuer smejj.com (15 Minuten gueltig, nur einmal verwendbar):",
        link,
        "",
        "Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.",
        "",
        "smejj.com"
      ].join("\n")
    }, env);
    if (!result.sent) return json(res, 502, { ok: false, error: result.reason || "email_send_failed" });
    return json(res, 200, { ok: true, sent: true });
  }

  async function handleMagicLinkVerify(req, res, url) {
    if (!secret()) return json(res, 503, { ok: false, error: "Session Secret fehlt." });
    const token = String(url.searchParams.get("token") || "").trim();
    const data = verifyMagicToken(token, secret(), nowMs());
    if (isConsumed(data.jti, nowMs())) throw new Error("Magic Link wurde bereits verwendet.");
    markConsumed(data.jti, data.exp);
    const user = { email: data.email, name: data.email, method: "magiclink" };
    const headers = { ...SECURITY_HEADERS, "Cache-Control": "no-store", "Set-Cookie": serializeSessionCookie(user) };
    const handoffReturn = safeReturnOrigin(data.handoffReturn);
    if (data.handoff && handoffReturn) {
      sessionHandoffStore.complete(data.handoff, { token: serializeSessionToken(user), user });
      res.writeHead(303, { ...headers, Location: `${handoffReturn}/auth/login?handoff=${encodeURIComponent(data.handoff)}` });
      return res.end();
    }
    res.writeHead(303, { ...headers, Location: "/profile?magic=ok" });
    return res.end();
  }

  return { handleMagicLinkRequest, handleMagicLinkVerify, safeReturnOrigin };
}

export function signMagicToken(data, secret) {
  if (!secret) throw new Error("Session Secret fehlt.");
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${hmac(secret, payload, "base64url")}`;
}

export function verifyMagicToken(token, secret, now = Date.now()) {
  const [payload, signature] = String(token || "").split(".");
  const expected = hmac(secret, payload || "", "base64url");
  if (!payload || !signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Magic Link ist ungueltig.");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!EMAIL_RE.test(String(data.email || "")) || Number(data.exp || 0) <= now) {
    throw new Error("Magic Link ist abgelaufen.");
  }
  return data;
}

function isConsumed(jti, now) {
  pruneConsumed(now);
  return consumed.has(String(jti || ""));
}

function markConsumed(jti, exp) {
  consumed.set(String(jti || ""), Number(exp) || Date.now() + TOKEN_TTL_MS);
}

function pruneConsumed(now) {
  for (const [jti, exp] of consumed) if (exp <= now) consumed.delete(jti);
  if (consumed.size > 10000) consumed.clear();
}

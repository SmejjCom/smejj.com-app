// smejj.com — HTTP-Routen fuer E-Mail-/Passwort-Auth und Session-Verwaltung.
// Single Responsibility: Request-Parsing, Rate-Limits, Statuscodes. Kontologik
// liegt in emailAuthService.js. Origin-/CSRF-Schutz greift bereits global im
// Server (isSafeMutatingControlRequest); hier zusaetzlich no-store und Limits.
import { createRateLimiter, clientKeyFromRequest } from "../http/rateLimiter.js";
import {
  changePassword, checkEmailSession, confirmPasswordReset, deleteAccount, exportAccountData,
  listSessions, loginUser, registerUser, requestPasswordReset, revokeUserSessions
} from "../auth/emailAuthService.js";

const loginLimiter = createRateLimiter({ capacity: 8, refillPerSec: 8 / 60 });      // ~8/Minute je IP
const registerLimiter = createRateLimiter({ capacity: 5, refillPerSec: 5 / 3600 }); // ~5/Stunde je IP
const resetLimiter = createRateLimiter({ capacity: 5, refillPerSec: 5 / 900 });     // ~5/15min je IP

// Kurzlebiger Cache fuer Session-Registry-Checks (entlastet IDrive e2 pro Request).
const sessionCheckCache = new Map(); // `${email}|${sid}` -> { ok, until }
const SESSION_CHECK_TTL_MS = 30_000;

export const EMAIL_AUTH_ROUTES = {
  register: "/api/auth/email/register",
  login: "/api/auth/email/login",
  verify: "/api/auth/email/verify",
  resetRequest: "/api/auth/email/reset/request",
  resetConfirm: "/api/auth/email/reset/confirm",
  passwordChange: "/api/auth/email/password/change",
  sessions: "/api/auth/sessions",
  sessionsRevoke: "/api/auth/sessions/revoke",
  accountExport: "/api/auth/account/export",
  accountDelete: "/api/auth/account/delete"
};

/**
 * Dispatcher fuer alle E-Mail-Auth-Routen. Gibt true zurueck, wenn behandelt.
 * ctx: { env, requestOrigin(req,url), makeSessionCookie(user), makeAccessToken(user),
 *        readSession(req) -> user|null, readJson(req), json(res, status, payload) }
 */
export async function handleEmailAuthRoutes(req, url, res, ctx) {
  const route = url.pathname;
  const post = req.method === "POST";
  const get = req.method === "GET" || req.method === "HEAD";
  const paths = EMAIL_AUTH_ROUTES;
  if (!Object.values(paths).includes(route)) return false;
  noStore(res);

  if (post && route === paths.register) {
    if (!allow(registerLimiter, req, res, ctx)) return true;
    const body = await ctx.readJson(req);
    const result = await registerUser({
      email: body.email, password: body.password, name: body.name, origin: ctx.requestOrigin(req, url)
    }, ctx.env);
    return respond(ctx, res, result);
  }

  if (post && route === paths.login) {
    if (!allow(loginLimiter, req, res, ctx)) return true;
    const body = await ctx.readJson(req);
    const result = await loginUser({
      email: body.email, password: body.password, userAgent: req.headers["user-agent"]
    }, ctx.env);
    if (!result.ok) return respond(ctx, res, result);
    invalidateSessionCache(body.email);
    res.setHeader("Set-Cookie", ctx.makeSessionCookie(result.user));
    ctx.json(res, 200, { authenticated: true, user: result.user, accessToken: ctx.makeAccessToken(result.user) });
    return true;
  }

  if (post && route === paths.verify) {
    if (!allow(loginLimiter, req, res, ctx)) return true;
    const body = await ctx.readJson(req);
    return respond(ctx, res, await verifyEmail(body, ctx.env));
  }

  if (post && route === paths.resetRequest) {
    if (!allow(resetLimiter, req, res, ctx)) return true;
    const body = await ctx.readJson(req);
    const result = await requestPasswordReset({ email: body.email, origin: ctx.requestOrigin(req, url) }, ctx.env);
    return respond(ctx, res, result);
  }

  if (post && route === paths.resetConfirm) {
    if (!allow(resetLimiter, req, res, ctx)) return true;
    const body = await ctx.readJson(req);
    const result = await confirmPasswordReset({ email: body.email, token: body.token, newPassword: body.newPassword }, ctx.env);
    if (result.ok) invalidateSessionCache(body.email);
    return respond(ctx, res, result);
  }

  // Ab hier: authentifizierte Konto-Endpunkte.
  const user = ctx.readSession(req);
  if (!user) { ctx.json(res, 401, { ok: false, error: "authentication_required" }); return true; }

  if (post && route === paths.passwordChange) {
    if (user.method !== "email") { ctx.json(res, 400, { ok: false, error: "password_change_requires_email_login" }); return true; }
    const body = await ctx.readJson(req);
    const result = await changePassword({
      email: user.email, currentPassword: body.currentPassword, newPassword: body.newPassword, keepSid: user.sid
    }, ctx.env);
    if (result.ok) invalidateSessionCache(user.email);
    return respond(ctx, res, result);
  }

  if (get && route === paths.sessions) {
    if (user.method !== "email") {
      ctx.json(res, 200, { ok: true, sessions: [statelessSessionView(user)], registry: "stateless" });
      return true;
    }
    return respond(ctx, res, await listSessions({ email: user.email, currentSid: user.sid }, ctx.env));
  }

  if (post && route === paths.sessionsRevoke) {
    if (user.method !== "email") { ctx.json(res, 400, { ok: false, error: "session_revoke_requires_email_login" }); return true; }
    const body = await ctx.readJson(req);
    const onlySid = body.sid ? String(body.sid) : null;
    const keepSid = body.others === true ? user.sid : null;
    if (!onlySid && !keepSid) { ctx.json(res, 400, { ok: false, error: "sid_or_others_required" }); return true; }
    const result = await revokeUserSessions({ email: user.email, onlySid, keepSid }, ctx.env);
    if (result.ok) invalidateSessionCache(user.email);
    return respond(ctx, res, result);
  }

  if (get && route === paths.accountExport) {
    const result = user.method === "email"
      ? await exportAccountData({ email: user.email }, ctx.env)
      : { ok: true, status: 200, account: { email: user.email, name: user.name, method: user.method, registry: "stateless" } };
    if (result.ok) res.setHeader("Content-Disposition", 'attachment; filename="smejj.com-account-export.json"');
    return respond(ctx, res, result);
  }

  if (post && route === paths.accountDelete) {
    if (user.method !== "email") { ctx.json(res, 400, { ok: false, error: "account_delete_requires_email_login" }); return true; }
    const body = await ctx.readJson(req);
    const result = await deleteAccount({ email: user.email, password: body.password, confirmText: body.confirmText }, ctx.env);
    if (result.ok) {
      invalidateSessionCache(user.email);
      res.setHeader("Set-Cookie", "smejj_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    }
    return respond(ctx, res, result);
  }

  ctx.json(res, 405, { ok: false, error: "method_not_allowed" });
  return true;
}

/**
 * Serverseitige Session-Pruefung fuer E-Mail-Sessions (Widerruf/Ablauf).
 * Gibt fuer Nicht-E-Mail-Sessions (stateless Google/Passkey) true zurueck.
 */
export async function emailSessionStillValid(user, env = process.env) {
  if (!user || user.method !== "email" || !user.sid) return true;
  const cacheKey = `${user.email}|${user.sid}`;
  const cached = sessionCheckCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.ok;
  let ok = false;
  try {
    ok = (await checkEmailSession({ email: user.email, sid: user.sid }, env)).ok;
  } catch {
    ok = false; // fail-closed bei Storage-Stoerung
  }
  sessionCheckCache.set(cacheKey, { ok, until: Date.now() + SESSION_CHECK_TTL_MS });
  if (sessionCheckCache.size > 5000) sessionCheckCache.clear();
  return ok;
}

export async function revokeCurrentEmailSession(user, env = process.env) {
  if (!user || user.method !== "email" || !user.sid) return;
  try {
    await revokeUserSessions({ email: user.email, onlySid: user.sid }, env);
  } finally {
    invalidateSessionCache(user.email);
  }
}

async function verifyEmail(body, env) {
  const { verifyEmailToken } = await import("../auth/emailAuthService.js");
  return verifyEmailToken({ email: body.email, token: body.token }, env);
}

function respond(ctx, res, result) {
  const { status, ...payload } = result;
  ctx.json(res, status || (result.ok ? 200 : 400), payload);
  return true;
}

function allow(limiter, req, res, ctx) {
  const gate = limiter.take(clientKeyFromRequest(req));
  if (gate.allowed) return true;
  res.setHeader("Retry-After", String(Math.max(1, Number(gate.retryAfterSec) || 1)));
  ctx.json(res, 429, { ok: false, error: "rate_limit_reached" });
  return false;
}

function statelessSessionView(user) {
  return { sid: null, device: "Aktuelle Sitzung", current: true, method: user.method || "google" };
}

function invalidateSessionCache(email) {
  const prefix = `${String(email || "").trim().toLowerCase()}|`;
  for (const key of sessionCheckCache.keys()) {
    if (key.startsWith(prefix)) sessionCheckCache.delete(key);
  }
}

function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
}

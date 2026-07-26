// smejj.com — Router fuer die zusaetzlichen Login-Methoden GitHub und Magic Link
// sowie die Billing-Routen (Stripe-Webhook + Abo-Status). Buendelt Handler-
// Erzeugung + Dispatch, damit src/server.js schlank bleibt (Guidelines:
// 800-Zeilen-Regel, Datei steht exakt auf der Grenze) und die Flows ohne
// Server-Boot testbar sind.
import { createGithubAuthHandlers } from "./githubAuthRoutes.js";
import { createMagicLinkHandlers } from "../../control-server/src/routes/magicLinkRoutes.js";
import { createBillingHandlers } from "../../control-server/src/routes/billingRoutes.js";
import { bearerSessionToken, verifySessionToken } from "../../control-server/src/auth/sessionToken.js";
import {
  exchangeGithubCode, fetchGithubUser, githubAuthorizeUrl,
  signGithubAuthState, verifyGithubAuthState
} from "./githubAuth.js";

export function createExtraAuthRouter({
  config, json, readJson, SECURITY_HEADERS,
  serializeSessionCookie, serializeSessionToken,
  sessionHandoffStore, allowedOriginsFromEnv, ROUTES, env = process.env
}) {
  const shared = {
    json, SECURITY_HEADERS, serializeSessionCookie, serializeSessionToken,
    sessionHandoffStore, allowedOriginsFromEnv, ROUTES, env
  };
  const github = createGithubAuthHandlers({
    ...shared, config,
    signGithubAuthState, verifyGithubAuthState, githubAuthorizeUrl, exchangeGithubCode, fetchGithubUser
  });
  const magic = createMagicLinkHandlers({
    ...shared, readJson, sessionSecret: () => config.sessionSecret
  });
  // Session-Lesen wie in src/server.js: Bearer-Token oder smejj_session-Cookie.
  const readSession = (req) => {
    const match = String(req.headers.cookie || "").match(/(?:^|;\s*)smejj_session=([^;]+)/);
    const token = bearerSessionToken(req.headers || {}) || match?.[1] || "";
    return verifySessionToken(token, { secret: config.sessionSecret });
  };
  const routeBilling = createBillingHandlers({ env, readSession, json });

  return async function routeExtraAuth(req, res, url) {
    const read = req.method === "GET" || req.method === "HEAD";
    // Billing VOR dem Login-try/catch: Webhook-Fehler sollen als 5xx an Stripe
    // zurueckgehen (Retry), nicht als 400 "Login fehlgeschlagen" maskiert werden.
    if (url.pathname.startsWith("/api/billing/")) return await routeBilling(req, res, url);
    try {
      if (read && url.pathname === ROUTES.api.authGithub) { await github.handleGithubAuthStart(req, res, url); return true; }
      if (read && url.pathname === ROUTES.api.authGithubCallback) { await github.handleGithubCallback(req, res, url); return true; }
      if (req.method === "POST" && url.pathname === ROUTES.api.authMagicLinkRequest) { await magic.handleMagicLinkRequest(req, res, url); return true; }
      if (read && url.pathname === ROUTES.api.authMagicLinkVerify) { await magic.handleMagicLinkVerify(req, res, url); return true; }
    } catch (error) {
      json(res, 400, { error: error.message || "Login fehlgeschlagen." });
      return true;
    }
    return false;
  };
}

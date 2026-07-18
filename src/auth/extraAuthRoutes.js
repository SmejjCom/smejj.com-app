// smejj.com — Router fuer die zusaetzlichen Login-Methoden GitHub und Magic Link.
// Buendelt Handler-Erzeugung + Dispatch, damit src/server.js schlank bleibt
// (Guidelines: 800-Zeilen-Regel) und der Flow ohne Server-Boot testbar ist.
import { createGithubAuthHandlers } from "./githubAuthRoutes.js";
import { createMagicLinkHandlers } from "../../control-server/src/routes/magicLinkRoutes.js";
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

  return async function routeExtraAuth(req, res, url) {
    const read = req.method === "GET" || req.method === "HEAD";
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

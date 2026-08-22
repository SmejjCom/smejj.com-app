// smejj.com — GitHub-Login-Handler (OAuth 2.0 Authorization-Code-Flow).
// Aufbau bewusst analog zu googleAuthRoutes.js: injizierte Abhaengigkeiten,
// One-Time-Handoff fuer die Cross-Origin-Rueckkehr in die App, kein Open-Redirect.
// Eigene OAuth-App (SMEJJ_GITHUB_LOGIN_*), getrennt vom Repo-Publisher.
import crypto from "node:crypto";
import { sichereAnbieterKonto } from "./anbieterKonto.js";

export function createGithubAuthHandlers({
  config,
  json,
  SECURITY_HEADERS,
  serializeSessionCookie,
  serializeSessionToken,
  sessionHandoffStore,
  allowedOriginsFromEnv,
  signGithubAuthState,
  verifyGithubAuthState,
  githubAuthorizeUrl,
  exchangeGithubCode,
  fetchGithubUser,
  ROUTES,
  fetchImpl = fetch,
  env = process.env
}) {
  function safeReturnOrigin(value) {
    const origin = String(value || "").trim().replace(/\/$/, "");
    return allowedOriginsFromEnv(env).includes(origin) ? origin : null;
  }

  function redirectUriFor(req, url) {
    const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
    const origin = `${String(proto).split(",")[0].trim()}://${req.headers.host}`;
    return `${origin}${ROUTES.api.authGithubCallback}`;
  }

  async function handleGithubAuthStart(req, res, url) {
    if (!config.githubLoginClientId || !config.githubLoginClientSecret) {
      return json(res, 503, { error: "GitHub Login ist noch nicht konfiguriert." });
    }
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
    const handoff = String(url.searchParams.get("handoff") || "").trim();
    const handoffReturn = safeReturnOrigin(url.searchParams.get("returnOrigin"));
    const state = signGithubAuthState({
      nonce: crypto.randomBytes(18).toString("base64url"),
      returnTo: "/profile?github=ok",
      handoff: handoff && handoffReturn ? handoff : "",
      handoffReturn: handoff && handoffReturn ? handoffReturn : "",
      exp: Date.now() + 10 * 60 * 1000
    }, config.sessionSecret);
    const authorizeUrl = githubAuthorizeUrl({
      clientId: config.githubLoginClientId,
      redirectUri: redirectUriFor(req, url),
      state
    });
    res.writeHead(303, { ...SECURITY_HEADERS, Location: authorizeUrl });
    res.end();
  }

  async function handleGithubCallback(req, res, url) {
    if (!config.githubLoginClientId || !config.githubLoginClientSecret) {
      return json(res, 503, { error: "GitHub Login ist noch nicht konfiguriert." });
    }
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
    const providerError = String(url.searchParams.get("error") || "").trim();
    if (providerError) return json(res, 403, { error: "GitHub Login wurde abgebrochen." });
    const code = String(url.searchParams.get("code") || "").trim();
    const rawState = String(url.searchParams.get("state") || "").trim();
    if (!code || !rawState) return json(res, 400, { error: "GitHub Login: Code oder State fehlt." });
    const state = verifyGithubAuthState(rawState, config.sessionSecret);

    const redirectUri = redirectUriFor(req, url);
    const accessToken = await exchangeGithubCode(code, {
      clientId: config.githubLoginClientId,
      clientSecret: config.githubLoginClientSecret,
      redirectUri,
      state: rawState,
      fetchImpl
    });
    const profile = await fetchGithubUser(accessToken, { fetchImpl });
    const email = String(profile.email || "").toLowerCase();
    if (config.githubLoginAllowedEmail && email !== config.githubLoginAllowedEmail) {
      return json(res, 403, { error: "Dieses GitHub Konto ist fuer smejj.com nicht freigegeben." });
    }
    const user = {
      email,
      name: String(profile.name || email),
      picture: String(profile.picture || ""),
      sub: String(profile.sub || ""),
      method: "github"
    };
    // fetchGithubUser liefert ausschliesslich `verified`-Adressen (githubAuth.js) —
    // diesen Nachweis im Kontospeicher vermerken, sonst bleibt der Adminbereich
    // fuer reine GitHub-Konten unerreichbar. Siehe src/auth/anbieterKonto.js.
    await sichereAnbieterKonto({ email, name: user.name, method: "github" }, env);
    const headers = { ...SECURITY_HEADERS, "Set-Cookie": serializeSessionCookie(user) };
    const handoffReturn = safeReturnOrigin(state?.handoffReturn);
    if (state?.handoff && handoffReturn) {
      // Schlaegt das Hinterlegen fehl (Ticket verfallen oder schon benutzt),
      // ist der Nutzer bei GitHub zwar angemeldet — die App bekaeme aber nie
      // einen Token und zeigte eine kaputte Seite. Dann lieber ehrlich auf die
      // Anmeldeseite zurueck, mit einem Grund, den man lesen kann.
      const hinterlegt = sessionHandoffStore.complete(state.handoff, { token: serializeSessionToken(user), user });
      if (!hinterlegt?.ok) {
        res.writeHead(303, { ...headers, Location: `${handoffReturn}/auth/login?fehler=anmeldung_abgelaufen` });
        return res.end();
      }
      res.writeHead(303, { ...headers, Location: `${handoffReturn}/auth/login?handoff=${encodeURIComponent(state.handoff)}` });
      return res.end();
    }
    res.writeHead(303, { ...headers, Location: state?.returnTo || "/profile?github=ok" });
    return res.end();
  }

  return { handleGithubAuthStart, handleGithubCallback, safeReturnOrigin };
}

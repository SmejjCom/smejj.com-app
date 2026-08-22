// smejj.com — Google-Login-Handler (ausgelagert aus src/server.js, 2026-07-15).
// Verhalten byteweise unveraendert; alle Abhaengigkeiten werden injiziert,
// damit der Flow erstmals unit-testbar ist (vorher nur live verifiziert).
import crypto from "node:crypto";
import { sichereAnbieterKonto } from "./anbieterKonto.js";

export function createGoogleAuthHandlers({
  config,
  json,
  readAuthBody,
  SECURITY_HEADERS,
  serializeSessionCookie,
  serializeSessionToken,
  sessionHandoffStore,
  allowedOriginsFromEnv,
  signGoogleAuthState,
  verifyGoogleAuthState,
  verifyGoogleIdToken,
  ROUTES,
  env = process.env
}) {
  // Nur erlaubte App-Origins duerfen Ziel eines Google-Login-Redirects sein
  // (kein Open-Redirect). Leerer/fremder Wert -> null.
  function safeReturnOrigin(value) {
    const origin = String(value || "").trim().replace(/\/$/, "");
    return allowedOriginsFromEnv(env).includes(origin) ? origin : null;
  }

  async function handleGoogleAuth(req, res) {
    if (!config.googleClientId) return json(res, 503, { error: "Google Login ist noch nicht konfiguriert." });
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
    const body = await readAuthBody(req);
    const state = body.state ? verifyGoogleAuthState(String(body.state), config.sessionSecret) : null;
    const payload = await verifyGoogleIdToken(String(body.credential || body.idToken || ""), {
      clientId: config.googleClientId,
      expectedNonce: state?.nonce
    });
    const email = String(payload.email || "").toLowerCase();
    if (!payload.email_verified) return json(res, 403, { error: "Google E-Mail ist nicht verifiziert." });
    if (config.googleAllowedEmail && email !== config.googleAllowedEmail) {
      return json(res, 403, { error: "Dieses Google Konto ist fuer smejj.com nicht freigegeben." });
    }
    const user = {
      email,
      name: String(payload.name || email),
      picture: String(payload.picture || ""),
      sub: String(payload.sub || ""),
      method: "google",
      permanent: "true"
    };
    // Google hat die Adresse bestaetigt (oben geprueft) — das im Kontospeicher
    // vermerken. Ohne diesen Schritt bleibt der Adminbereich fuer reine
    // Google-Konten unerreichbar, siehe src/auth/anbieterKonto.js. Wirft nie.
    await sichereAnbieterKonto({ email, name: user.name, method: "google" }, env);
    const headers = {
      ...SECURITY_HEADERS,
      "Set-Cookie": serializeSessionCookie(user)
    };
    // Cross-Origin-Rueckkehr in die App: Token per One-Time-Handoff hinterlegen und
    // zur App zurueckleiten. Die App holt den Token (Bearer) und ist dort angemeldet.
    const handoffReturn = safeReturnOrigin(state?.handoffReturn);
    if (body.redirect && state?.handoff && handoffReturn) {
      // Schlaegt das Hinterlegen fehl (Ticket verfallen oder schon benutzt),
      // ist der Nutzer bei Google zwar angemeldet — die App bekaeme aber nie
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
    if (body.redirect) {
      res.writeHead(303, { ...headers, Location: state?.returnTo || "/profile?google=ok" });
      return res.end();
    }
    res.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ authenticated: true, user, accessToken: serializeSessionToken(user) }, null, 2));
  }

  async function handleGoogleAuthStart(req, res, url) {
    if (!config.googleClientId) return json(res, 503, { error: "Google Login ist noch nicht konfiguriert." });
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
    const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
    const origin = `${proto}://${req.headers.host}`;
    // Cross-Origin-Rueckkehr: Wenn die App (smejj.com) einen Handoff startet und ihren
    // Origin mitgibt, landet der Nutzer nach Google mit Bearer-Token wieder in der App.
    const handoff = String(url.searchParams.get("handoff") || "").trim();
    const handoffReturn = safeReturnOrigin(url.searchParams.get("returnOrigin"));
    const nonce = crypto.randomBytes(18).toString("base64url");
    const state = signGoogleAuthState({
      nonce,
      returnTo: "/profile?google=ok",
      handoff: handoff && handoffReturn ? handoff : "",
      handoffReturn: handoff && handoffReturn ? handoffReturn : "",
      exp: Date.now() + 10 * 60 * 1000
    }, config.sessionSecret);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.googleClientId);
    authUrl.searchParams.set("redirect_uri", `${origin}${ROUTES.api.authGoogle}`);
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("response_mode", "form_post");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");
    if (config.googleAllowedEmail) authUrl.searchParams.set("login_hint", config.googleAllowedEmail);
    res.writeHead(303, { ...SECURITY_HEADERS, Location: authUrl.toString() });
    res.end();
  }

  return { handleGoogleAuth, handleGoogleAuthStart, safeReturnOrigin };
}

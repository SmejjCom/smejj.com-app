// smejj.com — Apple-Login-Handler (OAuth 2.0 / OpenID Connect, Web-Ablauf).
// Aufbau bewusst analog zu githubAuthRoutes.js: injizierte Abhaengigkeiten,
// One-Time-Handoff fuer die Cross-Origin-Rueckkehr in die App, kein Open-Redirect.
//
// Unterschied zu GitHub: Apple antwortet mit einem POST-Formular (form_post) auf
// die Rueckkehr-Adresse. Der Handler liest den Formularkoerper selbst (begrenzt)
// und leitet bei JEDEM Fehler auf die Anmeldeseite zurueck, statt eine nackte
// JSON-Seite der API-Domain zu zeigen (Befund 2026-08-22, Google-Login).
import crypto from "node:crypto";
import { sichereAnbieterKonto } from "./anbieterKonto.js";

const MAX_FORM_BYTES = 64 * 1024;
const STANDARD_APP_ORIGIN = "https://smejj.com";

export function createAppleAuthHandlers({
  config,
  appleConfig,
  json,
  SECURITY_HEADERS,
  serializeSessionCookie,
  serializeSessionToken,
  sessionHandoffStore,
  allowedOriginsFromEnv,
  signAppleAuthState,
  leseAppleAuthState,
  appleAuthorizeUrl,
  exchangeAppleCode,
  verifyAppleIdToken,
  appleNameFromUserField,
  ROUTES,
  fetchImpl = fetch,
  anmeldeProtokoll = { notiere() { return null; } },
  env = process.env
}) {
  const konfiguriert = () => {
    const c = typeof appleConfig === "function" ? appleConfig() : appleConfig;
    return c?.servicesId && c?.teamId && c?.keyId && c?.privateKey ? c : null;
  };

  function safeReturnOrigin(value) {
    const origin = String(value || "").trim().replace(/\/$/, "");
    return allowedOriginsFromEnv(env).includes(origin) ? origin : null;
  }

  function redirectUriFor(req, url) {
    const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
    const origin = `${String(proto).split(",")[0].trim()}://${req.headers.host}`;
    return `${origin}${ROUTES.api.authAppleCallback}`;
  }

  async function readForm(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_FORM_BYTES) throw new Error("Apple Antwort ist zu gross.");
      chunks.push(chunk);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  }

  // Zurueck zur Anmeldeseite mit lesbarem Grund. Ziel nur aus dem signierten
  // State und nur, wenn es auf der Erlaubnisliste steht; sonst die Standard-App.
  function backToLogin(res, state, grund, headers = SECURITY_HEADERS) {
    const ziel = safeReturnOrigin(state?.handoffReturn) || STANDARD_APP_ORIGIN;
    res.writeHead(303, { ...headers, Location: `${ziel}/auth/login?fehler=${encodeURIComponent(grund)}` });
    return res.end();
  }

  async function handleAppleAuthStart(req, res, url) {
    const apple = konfiguriert();
    if (!apple) return json(res, 503, { error: "Apple Login ist noch nicht konfiguriert." });
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });
    const handoff = String(url.searchParams.get("handoff") || "").trim();
    const handoffReturn = safeReturnOrigin(url.searchParams.get("returnOrigin"));
    const nonce = crypto.randomBytes(18).toString("base64url");
    // Die App-Huelle meldet ihren Start mit `native=1`. Nur dieser eine Wert
    // wird als 1/0 ins signierte Ticket uebernommen — es wandert KEINE Adresse
    // aus der Anfrage in den Rueckweg (kein offener Redirect). Gleiche Mechanik
    // wie bei Google, siehe docs/auth/APP_RUECKWEG_GOOGLE_2026-09-22.md.
    const nativeApp = url.searchParams.get("native") === "1" ? 1 : 0;
    const state = signAppleAuthState({
      nonce,
      returnTo: "/profile?apple=ok",
      handoff: handoff && handoffReturn ? handoff : "",
      handoffReturn: handoff && handoffReturn ? handoffReturn : "",
      native: nativeApp,
      exp: Date.now() + 10 * 60 * 1000
    }, config.sessionSecret);
    const authorizeUrl = appleAuthorizeUrl({
      servicesId: apple.servicesId,
      redirectUri: redirectUriFor(req, url),
      state,
      nonce
    });
    res.writeHead(303, { ...SECURITY_HEADERS, Location: authorizeUrl });
    res.end();
  }

  async function handleAppleCallback(req, res, url) {
    const apple = konfiguriert();
    if (!apple) return json(res, 503, { error: "Apple Login ist noch nicht konfiguriert." });
    if (!config.sessionSecret) return json(res, 503, { error: "Session Secret fehlt." });

    let form;
    try { form = await readForm(req); } catch { return json(res, 413, { error: "Apple Antwort ist zu gross." }); }
    const rawState = String(form.get("state") || "").trim();
    const gelesen = leseAppleAuthState(rawState, config.sessionSecret);
    // Fremdes/kaputtes Ticket: kein Ziel daraus ableiten.
    if (!gelesen.ok && gelesen.grund === "ungueltig") {
      return json(res, 400, { error: "Apple Login State ist ungueltig." });
    }
    const state = gelesen.daten;
    if (!gelesen.ok) return backToLogin(res, state, "anmeldung_abgelaufen");

    // Abbruch durch den Nutzer (user_cancelled_authorize) ist der Normalfall, kein Fehler.
    if (form.get("error")) return backToLogin(res, state, "apple_abgebrochen");
    const code = String(form.get("code") || "").trim();
    if (!code) return backToLogin(res, state, "apple_fehlgeschlagen");

    let profile;
    try {
      const idToken = await exchangeAppleCode(code, { config: apple, redirectUri: redirectUriFor(req, url), fetchImpl });
      profile = await verifyAppleIdToken(idToken, { servicesId: apple.servicesId, expectedNonce: state.nonce, fetchImpl });
    } catch (fehler) {
      anmeldeProtokoll.notiere({
        schritt: "anbieter-pruefung", anbieter: "apple", ok: false,
        grund: String(fehler?.message || "apple_fehlgeschlagen").slice(0, 80), email: "", ticket: state.handoff || ""
      });
      return backToLogin(res, state, "apple_fehlgeschlagen");
    }

    const name = appleNameFromUserField(form.get("user")) || profile.email.split("@")[0];
    const user = { email: profile.email, name, picture: "", sub: profile.sub, method: "apple" };
    // Apple bestaetigt die Adresse (email_verified) — Nachweis im Kontospeicher
    // vermerken, sonst bleibt der Adminbereich fuer reine Apple-Konten zu.
    await sichereAnbieterKonto({ email: user.email, name: user.name, method: "apple" }, env);
    const headers = { ...SECURITY_HEADERS, "Set-Cookie": serializeSessionCookie(user) };
    const handoffReturn = safeReturnOrigin(state.handoffReturn);
    if (state.handoff && handoffReturn) {
      const hinterlegt = sessionHandoffStore.complete(state.handoff, { token: serializeSessionToken(user), user });
      if (!hinterlegt?.ok) {
        anmeldeProtokoll.notiere({
          schritt: "ticket-hinterlegt", anbieter: "apple", ok: false,
          grund: hinterlegt?.error || "ticket_nicht_einloesbar", email: user.email, ticket: state.handoff
        });
        return backToLogin(res, state, "anmeldung_abgelaufen", headers);
      }
      // Wie bei Google und GitHub: aus der Huelle gestartet heisst, der Nutzer
      // steht jetzt im externen Browser — das Ticket bleibt dort liegen.
      res.writeHead(303, { ...headers, Location: `${handoffReturn}/auth/login?handoff=${encodeURIComponent(state.handoff)}${state?.native ? "&native=1" : ""}` });
      return res.end();
    }
    res.writeHead(303, { ...headers, Location: state.returnTo || "/profile?apple=ok" });
    return res.end();
  }

  return { handleAppleAuthStart, handleAppleCallback, safeReturnOrigin };
}

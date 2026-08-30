// smejj.com — Google-Login-Handler (ausgelagert aus src/server.js, 2026-07-15).
// Verhalten byteweise unveraendert; alle Abhaengigkeiten werden injiziert,
// damit der Flow erstmals unit-testbar ist (vorher nur live verifiziert).
import crypto from "node:crypto";
import { sichereAnbieterKonto } from "./anbieterKonto.js";

// Wohin ein gescheiterter Rueckweg fuehrt, wenn das Ticket kein eigenes Ziel
// mehr hergibt. smejj.com steht fest in DEFAULT_ALLOWED_ORIGINS (cors.js) —
// damit ist es nie ein offener Redirect.
const STANDARD_APP_ORIGIN = "https://smejj.com";

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
  leseGoogleAuthState,
  verifyGoogleIdToken,
  ROUTES,
  // Protokoll der Anmeldeversuche. Injiziert wie alles andere hier; ohne
  // Uebergabe ein stiller Ersatz, damit Tests und Altaufrufe nicht brechen.
  anmeldeProtokoll = { notiere() { return null; } },
  env = process.env
}) {
  // Faellt der nicht-werfende Leser weg (aeltere Aufrufer, Unit-Tests, die nur
  // verifyGoogleAuthState einspeisen), wird er aus diesem gebaut. So bleibt
  // jeder bestehende Aufruf gueltig und der Rueckweg trotzdem abgesichert.
  const leseState = leseGoogleAuthState || ((state, secret) => {
    try {
      return { ok: true, daten: verifyGoogleAuthState(state, secret) };
    } catch (fehler) {
      const abgelaufen = /abgelaufen/.test(String(fehler?.message || ""));
      return { ok: false, grund: abgelaufen ? "abgelaufen" : "ungueltig", daten: null };
    }
  });

  // Nur erlaubte App-Origins duerfen Ziel eines Google-Login-Redirects sein
  // (kein Open-Redirect). Leerer/fremder Wert -> null.
  function safeReturnOrigin(value) {
    const origin = String(value || "").trim().replace(/\/$/, "");
    return allowedOriginsFromEnv(env).includes(origin) ? origin : null;
  }

  async function handleGoogleAuth(req, res) {
    // Ab hier wird protokolliert: genau diese Stelle fehlte am 2026-08-22,
    // als der Login brach und im Log nichts stand.
    if (!config.googleClientId) {
      anmeldeProtokoll.notiere({ schritt: "rueckkehr", anbieter: "google", ok: false, grund: "google_nicht_konfiguriert" });
      return json(res, 503, { error: "Google Login ist noch nicht konfiguriert." });
    }
    if (!config.sessionSecret) {
      anmeldeProtokoll.notiere({ schritt: "rueckkehr", anbieter: "google", ok: false, grund: "session_secret_fehlt" });
      return json(res, 503, { error: "Session Secret fehlt." });
    }
    const body = await readAuthBody(req);
    // Rueckweg aus dem Browser (Google postet per form_post, readAuthBody setzt
    // dann redirect=true). Ein abgelaufenes Ticket darf hier NIE als nackte
    // JSON-Seite enden — der Nutzer stuende auf der API-Domain ohne Weg zurueck.
    // Genau das ist dem Betreiber am 2026-08-22 passiert, waehrend der
    // Control-Server neu gebaut wurde: sein erstes Ticket war beim zweiten
    // Anlauf aelter als die zehn Minuten.
    // Dasselbe Muster gilt weiter unten schon fuer das verfallene Handoff-Ticket.
    const gelesen = body.state
      ? leseState(String(body.state), config.sessionSecret)
      : { ok: true, daten: null };
    if (!gelesen.ok) {
      // Protokollzeile fuer genau diesen Abbruch (Grundtext von der Sitzung,
      // die den Fall gefunden hat). Beim ABGELAUFENEN Ticket kommt das Alter
      // in Sekunden mit: dann sieht man beim naechsten Mal sofort, ob es an
      // den zehn Minuten lag oder an etwas anderem.
      //
      // Bei "ungueltig" wird NICHTS aus dem Ticket mitgeloggt — die Signatur
      // war falsch, der Inhalt stammt also nicht von uns.
      const alterSek = gelesen.grund === "abgelaufen" && Number.isFinite(Number(gelesen.daten?.exp))
        ? Math.round((Date.now() - Number(gelesen.daten.exp)) / 1000)
        : undefined;
      anmeldeProtokoll.notiere({
        schritt: "rueckkehr", anbieter: "google", ok: false,
        grund: gelesen.grund === "abgelaufen"
          ? `state_abgelaufen${alterSek === undefined ? "" : ` (+${alterSek}s)`}`
          : "state_ungueltig"
      });
      if (body.redirect) {
        const ziel = safeReturnOrigin(gelesen.daten?.handoffReturn) || STANDARD_APP_ORIGIN;
        res.writeHead(303, { ...SECURITY_HEADERS, Location: `${ziel}/auth/login/?abgelaufen=1` });
        return res.end();
      }
      return json(res, 400, { error: `Google Login State ist ${gelesen.grund}.` });
    }
    const state = gelesen.daten;
    const payload = await verifyGoogleIdToken(String(body.credential || body.idToken || ""), {
      clientId: config.googleClientId,
      expectedNonce: state?.nonce
    });
    const email = String(payload.email || "").toLowerCase();
    if (!payload.email_verified) {
      anmeldeProtokoll.notiere({ schritt: "rueckkehr", anbieter: "google", ok: false, grund: "email_nicht_bestaetigt", email });
      return json(res, 403, { error: "Google E-Mail ist nicht verifiziert." });
    }
    if (config.googleAllowedEmail && email !== config.googleAllowedEmail) {
      anmeldeProtokoll.notiere({ schritt: "rueckkehr", anbieter: "google", ok: false, grund: "konto_nicht_freigegeben", email });
      return json(res, 403, { error: "Dieses Google Konto ist fuer smejj.com nicht freigegeben." });
    }
    anmeldeProtokoll.notiere({ schritt: "rueckkehr", anbieter: "google", ok: true, email });
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
        // DIE Zeile, die am 2026-08-22 gefehlt hat: hier bricht es, und
        // genau hier stand vorher nichts.
        anmeldeProtokoll.notiere({
          schritt: "ticket-hinterlegt", anbieter: "google", ok: false,
          grund: hinterlegt?.error || "ticket_nicht_einloesbar", email, ticket: state.handoff
        });
        // `abgelaufen=1` ist der Parameter, den auth-page.js wirklich liest
        // (Zeile 371) und in einen lesbaren Satz uebersetzt. Das bisherige
        // `fehler=anmeldung_abgelaufen` kannte niemand — der Nutzer landete
        // stumm auf der Anmeldeseite und wusste nicht, warum.
        res.writeHead(303, { ...headers, Location: `${handoffReturn}/auth/login/?abgelaufen=1` });
        return res.end();
      }
      anmeldeProtokoll.notiere({ schritt: "ticket-hinterlegt", anbieter: "google", ok: true, email, ticket: state.handoff });
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
    // OHNE Ticket landet der Nutzer nach dem Login auf der Control-Domain
    // statt in der App (siehe der catch in public/auth/auth-page.js). Das
    // sieht man dem Ergebnis nicht an — hier steht es.
    anmeldeProtokoll.notiere({
      schritt: "weiterleitung", anbieter: "google", ok: true,
      grund: handoff && handoffReturn ? undefined : "ohne_ticket_control_domain",
      ticket: handoff
    });
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

import { ROUTES } from "./platform.js";
import { isAllowedRequestOrigin } from "./securityPolicy.js";

// ============================================================================
// WER MUSS ANGEMELDET SEIN? — die zentrale Entscheidung des Control-Servers.
// ============================================================================
//
// UMGEDREHT AM 2026-08-14. Vorher war diese Datei eine VERBOTSLISTE: sie endete
// mit `return false`, also "offen". Geschuetzt war nur, wer ausdruecklich
// eingetragen war. Jede neu gebaute Route war damit ab der ersten Sekunde
// oeffentlich — und niemand merkte es, weil nichts fehlschlug. Im Gegenteil:
// eine vergessene Route funktionierte *besser* als eine eingetragene.
//
// Das ist zweimal schiefgegangen, beide Male stehen die Narben weiter unten im
// Text:
//   - /api/rag/search  (01.08.) gab JEDEM Auszuege aus den internen
//     Regeldokumenten samt Quellpfad heraus — waehrend der Chat auf derselben
//     Maschine interne Dateinamen ausdruecklich herausfiltert.
//   - /api/training/capture (05.08.) war der umgekehrte Fall: der fehlende
//     Eintrag liess `req.authUser` leer, und die Route wies auch Angemeldete ab.
//
// Beim dritten Anlass — der Betreiber fand am 14.08. den Adminbereich ohne
// Anmeldung sichtbar — wurde die Bauart selbst als die Ursache behandelt.
//
// SEITHER GILT: geschuetzt ist die Voreinstellung. Wer eine Route oeffentlich
// machen will, traegt sie unten in OEFFENTLICH ein UND schreibt dazu, warum.
// Wer das vergisst, dessen Route ist zu — das faellt beim ersten Aufruf auf,
// und zwar dem Entwickler, nicht einem Fremden Wochen spaeter.
//
// Der Waechter dazu steht in tests/control-access-policy.test.mjs: er prueft
// beide Richtungen (eine erfundene Route MUSS geschuetzt sein, die bekannten
// oeffentlichen MUESSEN offen bleiben).
// ============================================================================

// Ausdruecklich geschuetzt. Steht VOR der Erlaubnisliste, weil einzelne dieser
// Pfade unter einem sonst oeffentlichen Praefix liegen (z. B. session-handoff).
const USER_PROTECTED_EXACT_PATHS = new Set([
  ROUTES.api.jobs,
  ROUTES.api.jobQueue,
  ROUTES.api.freeExecutor,
  ROUTES.api.authSessionToken,
  ROUTES.api.authSessionHandoffComplete,
  ROUTES.api.passkeyRegisterOptions,
  ROUTES.api.passkeyRegisterVerify,
  ROUTES.api.terminalRun,
  ROUTES.api.mausRun,
  ROUTES.api.fileRead,
  ROUTES.api.fileWrite,
  ROUTES.api.gitStatus,
  ROUTES.api.gitCommit,
  ROUTES.api.storagePresign,
  ROUTES.api.saladStatus,
  // Wissenssuche: gibt Auszuege aus den internen Regeldokumenten samt Quellpfad
  // heraus. Ohne diesen Eintrag war die Route fuer JEDEN erreichbar, der die
  // Adresse kennt — waehrend der Chat auf derselben Maschine interne Dateinamen
  // ausdruecklich aus den Antworten filtert. Gefunden am 2026-08-01; kein
  // Frontend, kein Worker und kein Test ruft sie auf, sie war reine Diagnose.
  ROUTES.api.ragSearch,
  ROUTES.api.trainingConsent,
  ROUTES.api.trainingConsentDecision,
  ROUTES.api.trainingConsentRevoke,
  // Ohne diesen Eintrag setzt src/server.js `req.authUser` nie — und die
  // Erfassungsroute, die genau darauf prueft, antwortet JEDEM 401, auch einem
  // angemeldeten Nutzer. Gefunden am 2026-08-05 beim Live-Durchstich: die Route
  // war ausgerollt, verdrahtet und getestet, aber unerreichbar. Ein Test mit
  // gesetztem authUser findet das nicht; nur der Weg von aussen.
  ROUTES.api.trainingCapture
]);

const USER_PROTECTED_MUTATIONS = new Set([
  ROUTES.api.saladCreate,
  ROUTES.api.saladStart,
  ROUTES.api.saladStop
]);

// ----------------------------------------------------------------------------
// ERLAUBNISLISTE — ohne Anmeldung erreichbar. Jeder Eintrag mit Begruendung.
//
// Drei Sorten stehen hier, und nur diese drei sind ueberhaupt zulaessig:
//   (a) Der Anmeldeweg selbst. Wer sich anmelden will, ist per Definition noch
//       nicht angemeldet.
//   (b) Maschinen mit EIGENEM Schluessel. Sie tragen keine Sitzung, sondern
//       einen Worker- oder Automatik-Token, den der Handler selbst prueft.
//       "Offen" heisst hier nur: nicht per Sitzung — nicht ungeprueft.
//   (c) Was oeffentlich sein SOLL, weil ein Mensch ohne Konto es braucht.
// ----------------------------------------------------------------------------
const OEFFENTLICH_EXAKT = new Set([
  // (c) Liveness-Sonde der Plattform. Muss ohne alles antworten, sonst haelt
  //     Zeabur den Dienst fuer tot und startet ihn im Kreis neu.
  ROUTES.api.health,

  // (a) Anmeldewege. Alle unangemeldet erreichbar — das ist ihr Zweck.
  ROUTES.api.authConfig,
  ROUTES.api.authMe,
  ROUTES.api.authLogout,
  ROUTES.api.authGoogle,
  ROUTES.api.authGithub,
  ROUTES.api.authGithubCallback,
  ROUTES.api.authMagicLinkRequest,
  ROUTES.api.authMagicLinkVerify,
  ROUTES.api.passkeyLoginOptions,
  ROUTES.api.passkeyLoginVerify,
  ROUTES.api.authSessionHandoffStart,
  // (a) E-Mail-Anmeldung (emailAuthRoutes.js). Die fuenf gehoeren zum Weg
  //     HINEIN und muessen unangemeldet gehen — waeren sie geschuetzt, koennte
  //     sich niemand mehr neu anmelden oder ein Passwort zuruecksetzen.
  //     Die uebrigen Pfade derselben Datei (Sitzungsliste, Passwortwechsel,
  //     Konto-Export, Konto-Loeschung) stehen bewusst NICHT hier: sie gehoeren
  //     einem bereits angemeldeten Konto und sind jetzt doppelt geschuetzt —
  //     hier und in emailAuthRoutes.js selbst.
  "/api/auth/email/login",
  "/api/auth/email/register",
  "/api/auth/email/verify",
  "/api/auth/email/reset/request",
  "/api/auth/email/reset/confirm",

  // (b) Stripe ruft von seinen eigenen Servern an und kennt keine Sitzung.
  //     Die Echtheit haengt an der Signatur im Kopf, nicht an einer Anmeldung.
  ROUTES.api.billingStripeWebhook,

  // (c) Oeffentliches Modell: bewusste Produktentscheidung. NICHT ungebremst —
  //     modelRatePolicy.js deckelt pro IP und global je Minute.
  ROUTES.api.chat,
  ROUTES.api.agent,

  // (c) Transparenzpflicht (EU AI Act): der Bericht muss ohne Konto lesbar
  //     sein. Siehe adminSurfaceRoutes.js, dort steht dieselbe Regel.
  "/api/compliance",

  // (c) Modellzustand: nennt nur Modellnamen und ob sie erreichbar sind — also
  //     das, was die App ohnehin jedem Besucher zeigt. Bleibt offen, weil die
  //     Rauchtests (scripts/testing/*.mjs) ohne Anmeldung dagegen messen und
  //     sonst reihenweise falsch rot meldeten.
  ROUTES.api.modelsStatus,
  ROUTES.api.modelStatus,
  ROUTES.api.glmModelStatus,

  // (b) Worker melden sich mit einem eigenen, kurzlebigen Auftrags-Token
  //     (workerToken.js). Eine Sitzung haben sie nie.
  ROUTES.api.workerPreflight,
  ROUTES.api.workerValidate,
  ROUTES.api.workerModelAction,

  // (b) Automatiken melden Herzschlag und Ergebnis mit eigenem Schluessel je
  //     Automatik (autopilotRoutes.js prueft ihn selbst).
  "/api/autopilot/heartbeat",
  "/api/evolution/aktion",

  // (c) Die oeffentliche Statusseite /status.html fragt genau diese beiden ab.
  //     Wer wissen will, ob der Dienst laeuft, kann sich per Definition gerade
  //     nicht anmelden — dieselbe Begruendung wie in public/auth-gate.js.
  //     (/api/health steht schon oben.)
  "/api/browser/remote/health",

  // (c) Einwilligungstext zum Training. public/account-sessions.js holt ihn
  //     OHNE Token — und diese Datei steht unter dem Sicherheits-Lock
  //     (docs/security/security-lock-manifest.json), darf also nicht ohne
  //     schriftliche Freigabe des Betreibers angefasst werden. Der Text ist
  //     zur Veroeffentlichung bestimmt; hier steht nichts Schuetzenswertes.
  ROUTES.api.trainingConsentNotice,

  // ---- OFFENE ENTSCHEIDUNG DES BETREIBERS (Stand 2026-08-14) ---------------
  // Die naechsten drei sind KEINE Sicherheitsentscheidung, sondern eine
  // Kostenentscheidung. Sie sind unangemeldet erreichbar, weil ihre Aufrufer
  // heute keinen Token mitschicken koennen:
  //
  //   /api/search/web    ruft die Chat-Bruecke auf — ein EIGENER Zeabur-Dienst
  //                      (siehe chat-bridge-websuche.js). Server zu Server,
  //                      ohne Nutzersitzung. Ein Maschinen-Token dafuer muesste
  //                      in BEIDE Dienste als Umgebungsvariable — und genau
  //                      dieser Weg hat am 14.08. zweimal die Control-Umgebung
  //                      geloescht. Gebremst ist die Route: 20 Anfragen je
  //                      Minute und IP (webSearchRoute.js).
  //   /api/browser/*     dasselbe Muster fuer browser-pane.js/browser-context.js.
  //                      Der SSRF-Schutz greift (live geprueft: 169.254.169.254,
  //                      127.0.0.1 und localhost werden abgewiesen) — offen ist
  //                      nur das Abrufen FREMDER, oeffentlicher Adressen.
  //
  // Was fehlt, damit sie zugehen koennen: ein gemeinsames Maschinen-Token,
  // gesetzt ueber scripts/deploy/ statt ueber den Roh-Editor der Variablen.
  // Bis dahin bleiben sie hier eingetragen — sichtbar, begruendet, gebremst.
  ROUTES.api.webSearch,
  ROUTES.api.browserFetch,
  ROUTES.api.browserRemote
]);

// Praefixe. Bewusst kurz gehalten: ein Praefix oeffnet auch alles, was jemand
// spaeter darunter baut. Wer hier etwas eintraegt, uebernimmt genau dafuer die
// Verantwortung.
const OEFFENTLICH_PRAEFIX = [
  // (a) Abholung der uebergebenen Sitzung per Einmal-ID (Handy -> Rechner).
  //     /complete steht in USER_PROTECTED_EXACT_PATHS und wird davor geprueft.
  `${ROUTES.api.authSessionHandoff}/`,
  // (c) Transparenzbericht mit Unterseiten — siehe oben.
  "/api/compliance/",
  // (b) Sprachdienst: Worker und Browser weisen sich mit dem Sprach-Token aus
  //     (voiceWorkerRoutes.js / voiceRealtimeRoutes.js pruefen selbst).
  "/api/voice/",
  "/api/voice-realtime"
];

/**
 * Muss diese Anfrage eine angemeldete Sitzung tragen?
 *
 * @param {{method?: string, headers?: object}} req
 * @param {{pathname?: string}} url
 * @returns {boolean} true = ohne gueltige Sitzung wird mit 401 abgewiesen.
 */
export function requiresAuthenticatedControlAccess(req, url) {
  const method = String(req?.method || "GET").toUpperCase();
  const pathname = String(url?.pathname || "");

  // Nur die API wird hier bewacht. Alles andere ist das Ausliefern von
  // Dateien — Startseite, Anmeldeseite, Bilder, Stylesheets. Wuerde die
  // Voreinstellung "geschuetzt" auch hier gelten, verlangte die Anmeldeseite
  // eine Anmeldung, und niemand kaeme je wieder herein.
  //
  // Der Adminbereich ist der eine Ordner, der trotzdem geschuetzt gehoert —
  // aber NICHT hier: adminUiRoutes.js prueft ihn selbst und antwortet mit
  // einer lesbaren Seite statt mit JSON, und auf dem statischen Weg
  // (smejj.com/admin, GitHub Pages) uebernimmt public/admin/gate.js. Stuende
  // /admin hier, bekaeme ein Mensch am Browser `{"error":"..."}` zu sehen und
  // wuesste nicht, was zu tun ist.
  if (!pathname.startsWith("/api/")) return false;

  // Rueckmeldung eines Workers zu seinem Auftrag: traegt ein Auftrags-Token,
  // nie eine Sitzung. Steht ganz vorn, weil `/api/jobs/` weiter unten sonst
  // pauschal greift.
  const workerCallback = method === "POST"
    && pathname.startsWith(`${ROUTES.api.jobs}/`)
    && pathname.endsWith("/status");
  if (workerCallback) return false;

  // Ausdruecklich geschuetzt — vor der Erlaubnisliste, weil einzelne dieser
  // Pfade unter einem oeffentlichen Praefix liegen.
  if (USER_PROTECTED_EXACT_PATHS.has(pathname)) return true;
  if (method === "POST" && USER_PROTECTED_MUTATIONS.has(pathname)) return true;
  if (pathname.startsWith(`${ROUTES.api.jobs}/`)) return true;

  if (istOeffentlicheApi(pathname)) return false;

  // Voreinstellung: geschuetzt. Wer hier landet, hat vergessen, seine Route
  // einzutragen — und das ist genau richtig so.
  return true;
}

/** Steht der Pfad auf der Erlaubnisliste? Input: pathname. Output: boolean. */
export function istOeffentlicheApi(pathname) {
  const pfad = String(pathname || "");
  if (OEFFENTLICH_EXAKT.has(pfad)) return true;
  return OEFFENTLICH_PRAEFIX.some((praefix) => pfad.startsWith(praefix));
}

export function isSafeMutatingControlRequest(req, url) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(req?.method || "").toUpperCase())) return true;
  const origin = String(req?.headers?.origin || "");
  if (!origin) {
    // Fehlender Origin-Header: frueher pauschal erlaubt (fail-open, CSRF-Luecke
    // aus dem Audit 2026-08-09). CSRF ist aber nur dann moeglich, wenn der
    // Request ambiente Zugangsdaten traegt — das Session-Cookie. Traegt die
    // mutierende Anfrage das smejj_session-Cookie, aber keinen Origin, wird sie
    // jetzt abgewiesen (fail-closed): ein echter Browser sendet bei Mutationen
    // stets einen Origin. Unauthentifizierte Worker-Callbacks
    // (/api/jobs/:id/status) und Bearer-/Server-zu-Server-Clients tragen kein
    // Cookie und passieren weiterhin — sie sind per CSRF nicht faelschbar.
    const hasSessionCookie = /(?:^|;\s*)smejj_session=/.test(String(req?.headers?.cookie || ""));
    return !hasSessionCookie;
  }
  const host = safeHost(req?.headers?.host);
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const selfOrigins = host
    ? forwardedProto === "http" || forwardedProto === "https"
      ? [`${forwardedProto}://${host}`]
      : [`https://${host}`, `http://${host}`]
    : [];
  const allowed = [...selfOrigins, "https://smejj.com", "https://www.smejj.com"];
  if (url?.pathname === ROUTES.api.authGoogle) allowed.push("https://accounts.google.com");
  return isAllowedRequestOrigin(origin, allowed);
}

function safeHost(value) {
  const host = String(value || "").trim().toLowerCase();
  return /^[a-z0-9.-]+(?::\d{1,5})?$/.test(host) ? host : "";
}

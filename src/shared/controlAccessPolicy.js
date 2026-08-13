import { ROUTES } from "./platform.js";
import { isAllowedRequestOrigin } from "./securityPolicy.js";

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

export function requiresAuthenticatedControlAccess(req, url) {
  const method = String(req?.method || "GET").toUpperCase();
  const pathname = String(url?.pathname || "");
  const workerCallback = method === "POST"
    && pathname.startsWith(`${ROUTES.api.jobs}/`)
    && pathname.endsWith("/status");
  if (workerCallback) return false;
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return true;
  // Einwilligung zur Impersonation: die betroffene Person handelt in ihrem
  // eigenen Konto. Angemeldet reicht — eine Adminrolle waere hier falsch, weil
  // sie genau denjenigen aussperren wuerde, dessen Zustimmung gebraucht wird.
  if (pathname === "/api/account" || pathname.startsWith("/api/account/")) return true;
  // Kundensupport (Stufe 1, 2026-08-13): Tickets gehoeren zum Konto.
  if (pathname === "/api/support" || pathname.startsWith("/api/support/")) return true;
  if (pathname === "/api/feedback" || pathname.startsWith("/api/feedback/")) return true;
  // Die Admin-Oberflaeche prueft ihre Sitzung SELBST (adminUiRoutes.js) und
  // antwortet mit einer lesbaren Seite statt mit JSON. Waere sie hier gelistet,
  // bekaeme ein Mensch am Browser `{"error":"authentication_required"}` zu
  // sehen und wuesste nicht, was zu tun ist. Die Pruefung dort ist strenger:
  // sie verlangt zusaetzlich eine Verwaltungsrolle.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname.startsWith("/api/providers/")) return true;
  if (pathname === "/api/keys" || pathname.startsWith("/api/keys/")) return true;
  if (USER_PROTECTED_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith(`${ROUTES.api.jobs}/`)) return true;
  return method === "POST" && USER_PROTECTED_MUTATIONS.has(pathname);
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

import test from "node:test";
import assert from "node:assert/strict";
import { isSafeMutatingControlRequest, requiresAuthenticatedControlAccess } from "../src/shared/controlAccessPolicy.js";

function protectedAccess(pathname, method = "GET") {
  return requiresAuthenticatedControlAccess({ method }, new URL(pathname, "https://smejj.com"));
}

test("control access policy protects repository and execution surfaces", () => {
  assert.equal(protectedAccess("/api/jobs"), true);
  assert.equal(protectedAccess("/api/jobs/queue"), true);
  assert.equal(protectedAccess("/api/auth/session-token"), true);
  assert.equal(protectedAccess("/api/auth/session-handoff/complete", "POST"), true);
  assert.equal(protectedAccess("/api/jobs/job-1"), true);
  assert.equal(protectedAccess("/api/auth/passkey/register/options", "POST"), true);
  assert.equal(protectedAccess("/api/auth/passkey/register/verify", "POST"), true);
  assert.equal(protectedAccess("/api/terminal/run", "POST"), true);
  assert.equal(protectedAccess("/api/files/read", "POST"), true);
  assert.equal(protectedAccess("/api/git/status"), true);
  assert.equal(protectedAccess("/api/storage/presign", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/status"), true);
  assert.equal(protectedAccess("/api/providers/cline/status"), true);
  assert.equal(protectedAccess("/api/providers/cline/chat", "POST"), true);
});

test("control access policy preserves signed callbacks and public read surfaces", () => {
  assert.equal(protectedAccess("/api/jobs/job-1/status", "POST"), false);
  assert.equal(protectedAccess("/api/chat", "POST"), false);
  assert.equal(protectedAccess("/api/health"), false);
  assert.equal(protectedAccess("/api/auth/passkey/login/options", "POST"), false);
  assert.equal(protectedAccess("/api/auth/passkey/login/verify", "POST"), false);
  assert.equal(protectedAccess("/api/auth/session-handoff/start", "POST"), false);
  assert.equal(protectedAccess("/api/auth/session-handoff/example"), false);
  // Die fuenf Anmeldewege per E-Mail MUESSEN offen bleiben — waeren sie
  // geschuetzt, koennte sich niemand mehr anmelden oder registrieren.
  for (const pfad of [
    "/api/auth/email/login", "/api/auth/email/register", "/api/auth/email/verify",
    "/api/auth/email/reset/request", "/api/auth/email/reset/confirm"
  ]) {
    assert.equal(protectedAccess(pfad, "POST"), false, `${pfad} muss unangemeldet gehen`);
  }
  // Die oeffentliche Statusseite (/status.html) fragt genau diese beiden ab.
  assert.equal(protectedAccess("/api/health"), false);
  assert.equal(protectedAccess("/api/browser/remote/health"), false);
});

test("control access policy protects Salad mutations and reads", () => {
  assert.equal(protectedAccess("/api/workers/salad/create", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/stop", "POST"), true);
  // Bis zum 2026-08-14 waren diese beiden offen — nicht aus Absicht, sondern
  // weil die Policy damals eine VERBOTSLISTE war und alles Nichtgelistete
  // durchliess. Sie nennen die fehlenden Salad-Umgebungsvariablen beim Namen
  // und sind damit Aufklaerung fuer einen Angreifer. Salad ist seit dem
  // 2026-08-06 ohnehin abgeschaltet.
  assert.equal(protectedAccess("/api/workers/salad/gpu-classes"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "GET"), true);
});

test("control mutation origin accepts the HTTPS gateway host and rejects foreign origins", () => {
  const url = new URL("https://control.example/api/terminal/run");
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://control.example", "x-forwarded-proto": "https" }
  }, url), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://evil.example", "x-forwarded-proto": "https" }
  }, url), false);
});

test("control mutation origin keeps local HTTP and Google callback exceptions scoped", () => {
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-forwarded-proto": "http" }
  }, new URL("http://127.0.0.1:3000/api/jobs")), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://accounts.google.com", "x-forwarded-proto": "https" }
  }, new URL("https://control.example/api/auth/google")), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://accounts.google.com", "x-forwarded-proto": "https" }
  }, new URL("https://control.example/api/jobs")), false);
});

test("fehlender Origin: cookie-authentifizierte Mutation fail-closed, Worker-Callback offen", () => {
  const url = new URL("https://control.example/api/jobs/job-1/status");
  // Cookie-authentifizierte Mutation OHNE Origin-Header -> abgewiesen (CSRF-Schutz).
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", cookie: "smejj_session=abc.def" }
  }, url), false);
  // Unauthentifizierter Worker-Callback OHNE Cookie und OHNE Origin -> passiert.
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example" }
  }, url), true);
  // Anderes Cookie, aber keine Session -> kein CSRF-Risiko -> passiert.
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", cookie: "theme=dark" }
  }, url), true);
});

test("die Wissenssuche verlangt eine Anmeldung", () => {
  // Die Route gibt Auszuege aus den internen Regeldokumenten samt Quellpfad
  // heraus. Offen erreichbar war sie ein Leck: derselbe Dienst filtert interne
  // Dateinamen ausdruecklich aus den Chat-Antworten heraus. Gefunden 2026-08-01.
  assert.equal(protectedAccess("/api/rag/search", "GET"), true);
  assert.equal(protectedAccess("/api/rag/search", "HEAD"), true);
});

test("jede Route, die req.authUser LIEST, muss hier gelistet sein", async () => {
  // Der Waechter fuer einen echten Fehler (2026-08-05): die Erfassungsroute
  // prueft `req.authUser` und antwortet sonst 401 — aber src/server.js setzt
  // authUser NUR fuer Pfade, die diese Policy schuetzt. /api/training/capture
  // fehlte. Die Route war ausgerollt, verdrahtet, 12 Tests gruen — und fuer
  // JEDEN unerreichbar, auch fuer angemeldete Nutzer.
  //
  // Ein Test mit gesetztem authUser findet das nie: er setzt genau die
  // Bedingung, die in Wirklichkeit fehlt. Darum wird hier die LISTE geprueft,
  // nicht das Verhalten einer einzelnen Route.
  const { ROUTES } = await import("../src/shared/platform.js");
  for (const pfad of [
    ROUTES.api.trainingCapture,
    ROUTES.api.trainingConsent,
    ROUTES.api.trainingConsentDecision,
    ROUTES.api.trainingConsentRevoke
  ]) {
    assert.equal(protectedAccess(pfad, "POST"), true, `${pfad} bekaeme nie ein authUser`);
  }

  // Gegenprobe: der Hinweis-Endpunkt MUSS offen bleiben. Ohne ihn kann niemand
  // den geltenden Hash erfahren, und die Einwilligung waere unerreichbar.
  assert.equal(protectedAccess(ROUTES.api.trainingConsentNotice, "GET"), false);
});

test("Kundensupport-Routen verlangen eine Anmeldung", () => {
  // Ohne diesen Eintrag setzte server.js req.authUser fuer /api/support nie —
  // die Route antwortete ihrerseits 401 und JEDES Ticket scheiterte still.
  const faelle = ["/api/support/ticket", "/api/support/meine", "/api/support/alle"];
  for (const pfad of faelle) {
    assert.equal(requiresAuthenticatedControlAccess({ method: "POST" }, new URL("http://x" + pfad)), true,
      pfad + " muss durch die Anmelde-Pflicht laufen");
  }
});

test("Daten-Schwungrad-Route verlangt eine Anmeldung", () => {
  // Ohne diesen Eintrag setzt server.js req.authUser nie und die Route weist
  // JEDEN ab — derselbe Fehler, der am 2026-08-13 den Support lahmlegte.
  assert.equal(requiresAuthenticatedControlAccess({ method: "POST" }, new URL("http://x/api/feedback")), true);
  assert.equal(requiresAuthenticatedControlAccess({ method: "GET" }, new URL("http://x/api/feedback/irgendwas")), true);
});

// ===========================================================================
// Waechter fuer die BAUART, nicht fuer einzelne Routen (2026-08-14).
//
// Die Politik war bis dahin eine Verbotsliste: sie endete mit `return false`.
// Wer eine Route baute und den Eintrag vergass, hatte sie oeffentlich — und
// merkte nichts, weil nichts fehlschlug. Genau so entstanden die Lecks bei
// /api/rag/search (01.08.) und /api/training/capture (05.08.).
//
// Diese drei Tests halten die Umkehrung fest. Sie pruefen nicht, ob EINE Route
// richtig eingetragen ist, sondern ob die VOREINSTELLUNG noch stimmt.
// ===========================================================================

test("eine unbekannte API-Route ist von sich aus geschuetzt (die eigentliche Umkehrung)", () => {
  // Das hier ist der Test, der die alte Bauart hat durchfallen lassen.
  for (const pfad of [
    "/api/eine-route-die-es-noch-nicht-gibt",
    "/api/morgen-gebaut/und-vergessen",
    "/api/admin-schattenkopie",
    "/api/v2/nutzer"
  ]) {
    assert.equal(protectedAccess(pfad, "GET"), true, `${pfad} war offen — die Voreinstellung ist gekippt`);
    assert.equal(protectedAccess(pfad, "POST"), true, `${pfad} war offen — die Voreinstellung ist gekippt`);
  }
});

test("Dateien ausserhalb von /api/ bleiben unberuehrt (gesunde Gegenprobe)", () => {
  // Wuerde die Voreinstellung "geschuetzt" auch hier gelten, verlangte die
  // Anmeldeseite selbst eine Anmeldung — und niemand kaeme je wieder herein.
  for (const pfad of ["/", "/index.html", "/auth/login/", "/assets/app.js", "/datenschutz", "/status.html"]) {
    assert.equal(protectedAccess(pfad, "GET"), false, `${pfad} wurde faelschlich geschuetzt`);
  }
  // Der Adminbereich prueft sich selbst: adminUiRoutes.js auf dem Control-
  // Server, public/admin/gate.js auf dem statischen Weg. Er darf hier nicht
  // haengen, sonst bekaeme ein Mensch am Browser rohes JSON zu sehen.
  assert.equal(protectedAccess("/admin/", "GET"), false);
  assert.equal(protectedAccess("/admin/nutzer/", "GET"), false);
});

test("was frueher unbeabsichtigt offen stand, ist jetzt zu", () => {
  // Die Liste stammt aus der Live-Messung vom 2026-08-14 gegen
  // smejj-control.zeabur.app: alle antworteten unangemeldet mit 200.
  const frueherOffen = {
    "/api/storage/status": "nannte Anbieter und Bucket-Namen",
    "/api/capabilities": "nannte die innere Ausstattung des Dienstes",
    "/api/chats": "Gespraeche gehoeren einem Konto",
    "/api/projekte": "Arbeitsbereiche gehoeren einem Konto",
    "/api/chat-medien": "Anhaenge gehoeren einem Konto",
    "/api/browser/session": "startet einen echten Browser auf unserer Maschine",
    "/api/agent/tasks": "legt Agentenauftraege an",
    "/api/auth/sessions": "listet fremde Sitzungen",
    "/api/auth/account/export": "gibt Kontodaten heraus",
    "/api/auth/account/delete": "loescht ein Konto",
    "/api/billing/status": "Abrechnungsstand gehoert einem Konto"
  };
  for (const [pfad, warum] of Object.entries(frueherOffen)) {
    assert.equal(protectedAccess(pfad, "GET"), true, `${pfad} ist wieder offen — ${warum}`);
  }
});

test("die bewusst offenen Ausnahmen stehen namentlich in der Erlaubnisliste", async () => {
  // Kein Praefix-Freibrief: wer etwas oeffnet, oeffnet genau das und nichts
  // darunter. /api/voice/ und /api/compliance/ sind die eingetragenen
  // Ausnahmen (eigener Maschinen-Token bzw. Transparenzpflicht).
  const { istOeffentlicheApi } = await import("../src/shared/controlAccessPolicy.js");
  assert.equal(istOeffentlicheApi("/api/health"), true);
  assert.equal(istOeffentlicheApi("/api/compliance"), true);
  assert.equal(istOeffentlicheApi("/api/voice/worker/status"), true);
  // Kaputte Probe: etwas, das nur AEHNLICH heisst, faellt nicht mit durch.
  assert.equal(istOeffentlicheApi("/api/healthcheck-intern"), false);
  assert.equal(istOeffentlicheApi("/api/compliance-admin"), false);
  assert.equal(istOeffentlicheApi("/api/voice-admin/schluessel"), false);
});

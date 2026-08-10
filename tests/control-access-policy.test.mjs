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
  assert.equal(protectedAccess("/api/workers/salad/gpu-classes"), false);
});

test("control access policy protects Salad mutations and the provider-status read", () => {
  assert.equal(protectedAccess("/api/workers/salad/create", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/stop", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "GET"), false);
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

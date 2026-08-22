// smejj.com — Unit-Tests fuer den ausgelagerten Google-Login-Flow (2026-07-15).
// Deckt den vorher nur live verifizierten Pfad erstmals ab: fail-closed ohne
// Konfiguration, korrekter OAuth-Start-Redirect, Open-Redirect-Schutz,
// Handoff-Rueckkehr und JSON-Antwort.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoogleAuthHandlers } from "../src/auth/googleAuthRoutes.js";

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers || {}; };
  res.end = (body) => { res.body = String(body || ""); };
  return res;
}
const jsonHelper = (res, code, payload) => { res.statusCode = code; res.body = JSON.stringify(payload); };
const basisDeps = {
  json: jsonHelper,
  SECURITY_HEADERS: { "x-test": "1" },
  serializeSessionCookie: (u) => `sitzung=${u.email}`,
  serializeSessionToken: (u) => `token-${u.email}`,
  sessionHandoffStore: { complete: () => ({ ok: true }) },
  allowedOriginsFromEnv: () => ["https://smejj.com"],
  signGoogleAuthState: (state) => `signiert:${JSON.stringify(state).length}`,
  verifyGoogleAuthState: () => null,
  verifyGoogleIdToken: async () => ({ email: "smejjcom@gmail.com", email_verified: true, name: "Wof", sub: "1" }),
  ROUTES: { api: { authGoogle: "/api/auth/google" } },
  env: {}
};

test("fail-closed: 503 ohne googleClientId / sessionSecret", async () => {
  const h = createGoogleAuthHandlers({ ...basisDeps, config: { googleClientId: "", sessionSecret: "s" }, readAuthBody: async () => ({}) });
  const res = mockRes();
  await h.handleGoogleAuth({}, res);
  assert.equal(res.statusCode, 503);
  const res2 = mockRes();
  await h.handleGoogleAuthStart({ headers: {} }, res2, new URL("https://x.test/api/auth/google"));
  assert.equal(res2.statusCode, 503);
});

test("Start: 303 zu accounts.google.com mit korrekter redirect_uri, nonce und select_account", async () => {
  const h = createGoogleAuthHandlers({ ...basisDeps, config: { googleClientId: "cid-123", sessionSecret: "geheim" }, readAuthBody: async () => ({}) });
  const res = mockRes();
  await h.handleGoogleAuthStart(
    { headers: { host: "control.example", "x-forwarded-proto": "https" } },
    res,
    new URL("https://control.example/api/auth/google")
  );
  assert.equal(res.statusCode, 303);
  const ziel = new URL(res.headers.Location);
  assert.equal(ziel.hostname, "accounts.google.com");
  assert.equal(ziel.searchParams.get("client_id"), "cid-123");
  assert.equal(ziel.searchParams.get("redirect_uri"), "https://control.example/api/auth/google");
  assert.equal(ziel.searchParams.get("prompt"), "select_account");
  assert.ok(ziel.searchParams.get("nonce").length >= 18);
  assert.match(ziel.searchParams.get("state"), /^signiert:/);
});

test("Open-Redirect-Schutz: fremde returnOrigin wird ignoriert", () => {
  const h = createGoogleAuthHandlers({ ...basisDeps, config: { googleClientId: "c", sessionSecret: "s" }, readAuthBody: async () => ({}) });
  assert.equal(h.safeReturnOrigin("https://boese.example"), null);
  assert.equal(h.safeReturnOrigin("https://smejj.com/"), "https://smejj.com");
  assert.equal(h.safeReturnOrigin(""), null);
});

test("Login: Handoff-Rueckkehr 303 zur App mit gesetztem Cookie + Token hinterlegt", async () => {
  let hinterlegt = null;
  const h = createGoogleAuthHandlers({
    ...basisDeps,
    config: { googleClientId: "c", sessionSecret: "s" },
    readAuthBody: async () => ({ redirect: "1", state: "st", credential: "idtok" }),
    verifyGoogleAuthState: () => ({ nonce: "n", handoff: "h-1", handoffReturn: "https://smejj.com" }),
    sessionHandoffStore: { complete: (id, payload) => { hinterlegt = { id, payload }; return { ok: true }; } }
  });
  const res = mockRes();
  await h.handleGoogleAuth({}, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?handoff=h-1");
  assert.equal(res.headers["Set-Cookie"], "sitzung=smejjcom@gmail.com");
  assert.equal(hinterlegt.id, "h-1");
  assert.equal(hinterlegt.payload.token, "token-smejjcom@gmail.com");
});

test("Login ohne redirect: 200 JSON mit accessToken; unverifizierte E-Mail -> 403", async () => {
  const h = createGoogleAuthHandlers({ ...basisDeps, config: { googleClientId: "c", sessionSecret: "s" }, readAuthBody: async () => ({ credential: "idtok" }) });
  const res = mockRes();
  await h.handleGoogleAuth({}, res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.authenticated, true);
  assert.equal(body.accessToken, "token-smejjcom@gmail.com");

  const h2 = createGoogleAuthHandlers({ ...basisDeps, config: { googleClientId: "c", sessionSecret: "s" }, readAuthBody: async () => ({}), verifyGoogleIdToken: async () => ({ email: "x@y.z", email_verified: false }) });
  const res2 = mockRes();
  await h2.handleGoogleAuth({}, res2);
  assert.equal(res2.statusCode, 403);
});

// --- Die JSON-Sackgasse nach Google --------------------------------------------
//
// Vom Betreiber gemeldet am 2026-08-22: nach einem Google-Login stand im
// Browser nur noch
//   {"error": "Google Login State ist abgelaufen."}
// auf smejj-control.zeabur.app — kein Zurueck, kein Knopf, nichts. Das Ticket
// haelt zehn Minuten; seines war aelter, weil der Control-Server dazwischen neu
// gebaut wurde und er einen zweiten Anlauf nahm.
//
// Der Fehler selbst ist richtig (ein altes Ticket darf nicht gelten) — die
// SACKGASSE ist der Mangel. Fuer das verfallene Handoff-Ticket gab es das
// richtige Muster schon: zurueck auf die Anmeldeseite mit lesbarem Grund.
//
// Waechter-TUEV: abgelaufen im Browser (Rueckleitung), ungueltig im Browser
// (Rueckleitung, aber KEIN fremdes Ziel), und der Maschinenweg bleibt JSON.

const abgelaufenDeps = {
  ...basisDeps,
  leseGoogleAuthState: () => ({
    ok: false,
    grund: "abgelaufen",
    daten: { handoffReturn: "https://smejj.com", handoff: "t1" }
  })
};

test("abgelaufenes Ticket im Browser: zurueck zur Anmeldeseite statt JSON", async () => {
  const h = createGoogleAuthHandlers({
    ...abgelaufenDeps,
    config: { googleClientId: "cid", sessionSecret: "s" },
    readAuthBody: async () => ({ state: "alt", credential: "x", redirect: true })
  });
  const res = mockRes();
  await h.handleGoogleAuth({ headers: {} }, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login/?abgelaufen=1");
  assert.equal(res.body, "", "eine Weiterleitung traegt keinen JSON-Koerper");
});

test("ungueltige Signatur bestimmt KEIN Rueckkehrziel", async () => {
  // Kaputte Probe: ein fremdes Ticket darf nicht steuern, wohin der Nutzer geht.
  // Ohne eigene Daten faellt die Route auf die feste App-Adresse zurueck.
  const h = createGoogleAuthHandlers({
    ...basisDeps,
    leseGoogleAuthState: () => ({ ok: false, grund: "ungueltig", daten: { handoffReturn: "https://boese.example" } }),
    config: { googleClientId: "cid", sessionSecret: "s" },
    readAuthBody: async () => ({ state: "fremd", credential: "x", redirect: true })
  });
  const res = mockRes();
  await h.handleGoogleAuth({ headers: {} }, res);
  assert.equal(res.statusCode, 303);
  assert.ok(res.headers.Location.startsWith("https://smejj.com/"), `fremdes Ziel durchgelassen: ${res.headers.Location}`);
});

test("ohne Browser-Rueckweg bleibt es bei einer ehrlichen JSON-Antwort", async () => {
  // Maschinenweg (JSON-Aufruf, kein form_post): hier ist eine Weiterleitung
  // sinnlos, der Aufrufer braucht den Grund als Text.
  const h = createGoogleAuthHandlers({
    ...abgelaufenDeps,
    config: { googleClientId: "cid", sessionSecret: "s" },
    readAuthBody: async () => ({ state: "alt", credential: "x" })
  });
  const res = mockRes();
  await h.handleGoogleAuth({ headers: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /abgelaufen/);
});

test("gueltiges Ticket laeuft unveraendert durch", async () => {
  // Gesunde Probe: die Reparatur darf den Normalfall nicht anfassen.
  const h = createGoogleAuthHandlers({
    ...basisDeps,
    leseGoogleAuthState: () => ({ ok: true, daten: { nonce: "n", returnTo: "/profile?google=ok" } }),
    config: { googleClientId: "cid", sessionSecret: "s" },
    readAuthBody: async () => ({ state: "frisch", credential: "x", redirect: true })
  });
  const res = mockRes();
  await h.handleGoogleAuth({ headers: {} }, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "/profile?google=ok");
});

test("der Grund kommt in dem Parameter, den die Anmeldeseite liest", () => {
  // auth-page.js prueft `params.get("abgelaufen")` und macht daraus den Satz
  // "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an." Ein anderer
  // Parametername landet stumm auf der Seite — der Nutzer weiss dann nicht,
  // warum er wieder hier steht. Genau das war bei `fehler=anmeldung_abgelaufen`
  // der Fall: kein einziger Leser im Frontend.
  // Kommentarzeilen raus: der alte Parametername wird dort ausdruecklich
  // ERWAEHNT, damit spaeter niemand wieder zu ihm greift. Gemeint ist der Code.
  const route = readFileSync(new URL("../src/auth/googleAuthRoutes.js", import.meta.url), "utf8")
    .split("\n").filter((zeile) => !/^\s*\/\//.test(zeile)).join("\n");
  const seite = readFileSync(new URL("../public/auth/auth-page.js", import.meta.url), "utf8");
  assert.match(seite, /params\.get\("abgelaufen"\)/, "die Anmeldeseite muss den Parameter lesen");
  // `handoff` ist der ERFOLGSweg (Ticket hinterlegt) und bleibt aussen vor —
  // geprueft werden die Rueckwege, die einen GRUND transportieren sollen.
  const gruende = [...route.matchAll(/\/auth\/login\/?\?([a-z_]+)=/g)]
    .map((treffer) => treffer[1])
    .filter((name) => name !== "handoff");
  assert.ok(gruende.length >= 2, `zu wenige Rueckwege gefunden: ${gruende.length}`);
  for (const name of gruende) {
    assert.equal(name, "abgelaufen", `unbekannter Parameter im Rueckweg: ${name}`);
  }
  assert.ok(!/fehler=anmeldung_abgelaufen/.test(route), "der stumme Parameter muss weg sein");
});

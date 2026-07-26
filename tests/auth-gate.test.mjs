// smejj.com — Schutztests fuer die Anmelde-Pflicht (Auth-Gate).
// Freigabe 2026-07-25 (Betreiber): "erst einloggen, dann nutzen" wie claude.ai.
// Diese Tests sichern: Abgemeldete landen auf der Anmeldeseite, Angemeldete
// bleiben ungestoert, oeffentliche Seiten (Auth, Rechtstexte) bleiben frei,
// und das Gate haengt an beiden Einstiegen (App-Shell + Sprachseiten).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { isPublicPath, hasSession, enforceAuthGate } = await import("../public/auth-gate.js");

const gateJs = fs.readFileSync("public/auth-gate.js", "utf8");
const dockJs = fs.readFileSync("public/profile-dock.js", "utf8");
const landingJs = fs.readFileSync("public/voice-landing.js", "utf8");

function fakeStorage(entries = {}) {
  return { getItem: (key) => (key in entries ? entries[key] : null) };
}

function fakeWindow(pathname, entries = {}) {
  const calls = [];
  return {
    location: { pathname, replace: (url) => calls.push(url) },
    localStorage: fakeStorage(entries),
    calls
  };
}

test("Abgemeldete auf App-Seiten werden zur Anmeldung geleitet", () => {
  for (const path of ["/", "/index.html", "/en/", "/fr/", "/profile"]) {
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), true, path);
    assert.deepEqual(win.calls, ["/auth/login/"]);
  }
});

test("Oeffentliche Seiten bleiben ohne Anmeldung erreichbar", () => {
  for (const path of ["/auth/login/", "/auth/register/", "/datenschutz.html", "/impressum.html", "/maus-replay.html"]) {
    assert.equal(isPublicPath(path), true, path);
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), false, path);
    assert.deepEqual(win.calls, []);
  }
});

test("Server-Token oder lokale Sitzung lassen den Nutzer durch", () => {
  const token = fakeWindow("/", { "smejj.auth.accessToken.v1": "token-123" });
  assert.equal(enforceAuthGate(token), false);
  assert.deepEqual(token.calls, []);
  const local = fakeWindow("/", { "smejj.session.v1": JSON.stringify({ authenticated: true }) });
  assert.equal(hasSession(local.localStorage), true);
  assert.equal(enforceAuthGate(local), false);
  assert.deepEqual(local.calls, []);
});

test("Kaputter Storage gilt als abgemeldet (fail-closed)", () => {
  const broken = { getItem: () => { throw new Error("Storage gesperrt"); } };
  assert.equal(hasSession(broken), false);
});

test("Gate haengt an App-Shell und Sprachseiten, ohne Start-Lock-Dateien", () => {
  assert.match(dockJs, /import "\.\/auth-gate\.js\?v=1";/);
  assert.match(landingJs, /import "\.\/auth-gate\.js\?v=1";/);
  assert.match(gateJs, /fail-closed|Fail-closed/);
});

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
  for (const path of ["/", "/index.html", "/profile", "/chat", "/settings"]) {
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), true, path);
    assert.deepEqual(win.calls, ["/auth/login/"]);
  }
});

// Betreiber-Entscheidung 2026-08-04: Die Sprach-Landeseiten sind oeffentlich.
// Bis dahin standen "/en/" und "/fr/" in der Liste oben — sie wurden also
// umgeleitet, obwohl sie robots "index,follow" tragen und mit hreflang in der
// Sitemap stehen. Live reproduziert: /ja/ lud sichtbar und sprang dann auf
// /auth/login/. Jeder Besucher aus der Suche verlor die Seite.
test("Sprach-Landeseiten sind oeffentlich — sie sind der Einstieg aus der Suche", () => {
  const sprachen = ["ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pt", "ru", "tr", "zh"];
  assert.equal(sprachen.length, 15, "alle 15 Sprachen aus language-options.js");
  for (const code of sprachen) {
    for (const path of [`/${code}/`, `/${code}/index.html`]) {
      assert.equal(isPublicPath(path), true, path);
      const win = fakeWindow(path);
      assert.equal(enforceAuthGate(win), false, path);
      assert.deepEqual(win.calls, [], path);
    }
  }
});

// Bewusst eng: nur das Verzeichnis selbst. Ein Praefix-Muster wuerde jede
// kuenftige Unterseite mit oeffnen — dieselbe Falle wie bei /status.html.
test("unter den Sprachpfaden bleibt alles andere anmeldepflichtig", () => {
  for (const path of ["/en/konto", "/ja/chat", "/de/einstellungen", "/en/index.htm", "/xx/"]) {
    assert.equal(isPublicPath(path), false, path);
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), true, path);
    assert.deepEqual(win.calls, ["/auth/login/"], path);
  }
});

// Die Sprachliste im Gate muss zur ausgelieferten Sprachliste passen. Laufen sie
// auseinander, faellt eine neue Sprache still hinter das Gate zurueck.
test("die Sprachliste des Gates deckt sich mit language-options.js", () => {
  const optionen = fs.readFileSync("public/language-options.js", "utf8");
  // Format: LANGUAGE_OPTIONS = [["de", "Deutsch"], ["en", "English"], …]
  const ausgeliefert = [...new Set([...optionen.matchAll(/\[\s*"([a-z]{2})"\s*,/g)].map((m) => m[1]))].sort();
  assert.equal(ausgeliefert.length, 15, "language-options.js muss 15 Sprachen fuehren");
  const imGate = (gateJs.match(/const LANGUAGE_CODES = "([^"]+)"/) || [, ""])[1].split("|").sort();
  assert.deepEqual(imGate, ausgeliefert, "Gate und Sprachliste muessen dieselben Codes fuehren");
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

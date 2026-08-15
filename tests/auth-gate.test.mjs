// smejj.com — Schutztests fuer die Anmelde-Pflicht (Auth-Gate).
// Freigabe 2026-07-25 (Betreiber): "erst einloggen, dann nutzen" wie claude.ai.
// Diese Tests sichern: Abgemeldete landen auf der Anmeldeseite, Angemeldete
// bleiben ungestoert, oeffentliche Seiten (Auth, Rechtstexte) bleiben frei,
// und das Gate haengt an beiden Einstiegen (App-Shell + Sprachseiten).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFileSync } from "node:fs";
// verifyStoredSession kam am 2026-08-04 dazu (halber Anmeldezustand).
const { verifyStoredSession } = await import("../public/auth-gate.js");

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
  // Landeseite zuerst (Mockup V11 Bildschirm 1, Betreiber-Auftrag
  // 2026-08-15): ein anonymer Besucher der WURZEL sieht die Landeseite mit
  // Anmelden/Kostenlos-starten — nicht sofort das Login-Formular. Wer nicht
  // weiss, was smejj ist, meldet sich auch nicht an.
  for (const path of ["/", "/index.html"]) {
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), true, path);
    assert.deepEqual(win.calls, ["/willkommen.html"]);
  }
  // Tiefere Ziele wandern als ?next= mit, damit der Login dorthin zurueckfuehrt.
  for (const path of ["/profile", "/chat", "/settings"]) {
    const win = fakeWindow(path);
    assert.equal(enforceAuthGate(win), true, path);
    assert.deepEqual(win.calls, [`/auth/login/?next=${encodeURIComponent(path)}`]);
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
    assert.deepEqual(win.calls, [`/auth/login/?next=${encodeURIComponent(path)}`], path);
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
  // Die Sprachseiten haengen seit dem 2026-08-04 UEBER voice-landing-signin.js
  // am Gate: das Modul importiert hasSession und entscheidet, ob der
  // Sprachmodus oder nur ein Anmelde-Knopf gebaut wird. Dieselbe Kennung ?v=1
  // wie ueberall sonst — zwei Kennungen waeren zwei Modulinstanzen.
  assert.match(landingJs, /import \{ darfSprechen, buildLoginCta \} from "\.\/voice-landing-signin\.js\?v=1";/);
  const signinJs = fs.readFileSync("public/voice-landing-signin.js", "utf8");
  assert.match(signinJs, /import \{ hasSession \} from "\.\/auth-gate\.js\?v=1";/);
  assert.match(gateJs, /fail-closed|Fail-closed/);
});

// ---------------------------------------------------------------------------
// 2026-08-04 — Ein Token ueberlebt laenger als die Sitzung dahinter.
//
// Live im angemeldeten Browser des Betreibers gemessen: sein Token lag im
// Speicher, der Server lehnte es aber ab (/api/auth/me -> authenticated=false).
// hasSession() prueft nur das VORHANDENSEIN — die App liess ihn also herein,
// waehrend der Server ihn nicht kannte. Sichtbar wurde das erst, als die
// Chat-Bruecke eine Anmeldung verlangte: jede Frage kam als "Bitte anmelden"
// zurueck. Der halbe Anmeldezustand ist der eigentliche Fehler.
// ---------------------------------------------------------------------------

function fensterMit({ token = "", pfad = "/", jetzt = {} } = {}) {
  const speicher = new Map();
  if (token) speicher.set("smejj.auth.accessToken.v1", token);
  const win = {
    location: { pathname: pfad, replace(ziel) { win.location.ersetztDurch = ziel; } },
    localStorage: {
      getItem: (k) => speicher.get(k) ?? null,
      removeItem: (k) => speicher.delete(k),
      setItem: (k, v) => speicher.set(k, v)
    },
    ...jetzt
  };
  return { win, speicher };
}

function antwortMit(koerper, { ok = true } = {}) {
  return async () => ({ ok, json: async () => koerper });
}

test("ein abgelehntes Token wird entfernt und fuehrt zur Anmeldung", async () => {
  const { win, speicher } = fensterMit({ token: "altes.token", pfad: "/" });
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: antwortMit({ authenticated: false, user: null }),
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "abgelaufen");
  assert.equal(speicher.has("smejj.auth.accessToken.v1"), false, "das tote Token muss weg");
  assert.equal(win.location.ersetztDurch, "/auth/login/?abgelaufen=1",
    "die Anmeldeseite muss den Grund erfahren — eine wortlose Umleitung wirkt wie ein Fehler");
});

test("ein gueltiges Token bleibt unangetastet und wird bei frischem Token aktualisiert", async () => {
  const { win, speicher } = fensterMit({ token: "gutes.token" });
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: antwortMit({ authenticated: true, user: { email: "a@b.c" }, accessToken: "frisches.token" }),
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "gueltig");
  assert.equal(speicher.get("smejj.auth.accessToken.v1"), "frisches.token");
  assert.equal(win.location.ersetztDurch, undefined, "niemand darf grundlos umgeleitet werden");
});

test("Google- und permanente Sitzungen werden nicht eigenmaechtig abgemeldet", async () => {
  const { win, speicher } = fensterMit({ token: "google.token" });
  speicher.set("smejj.session.v1", JSON.stringify({ authenticated: true, method: "google", permanent: true }));
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: antwortMit({ authenticated: false, user: null }),
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "gueltig");
  assert.equal(speicher.has("smejj.auth.accessToken.v1"), true);
  assert.equal(win.location.ersetztDurch, undefined, "Google-Nutzer duerfen nie ungewollt ausgeloggt werden");
});

test("OFFLINE MELDET NIEMANDEN AB — die wichtigste Regel", async () => {
  // Waere das anders, wuerde ein Netzaussetzer alle Nutzer aussperren. Das
  // waere schlimmer als der Fehler, den diese Pruefung behebt.
  for (const [name, fetchFn] of [
    ["Netzfehler", async () => { throw new Error("offline"); }],
    ["Zeitueberschreitung", async () => { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }],
    ["Serverfehler 500", async () => ({ ok: false, json: async () => ({}) })],
    ["kaputte Antwort", async () => ({ ok: true, json: async () => { throw new Error("kein JSON"); } })]
  ]) {
    const { win, speicher } = fensterMit({ token: "gutes.token" });
    const ergebnis = await verifyStoredSession(win, { fetchFn, apiOrigin: "https://control.test" });
    assert.equal(ergebnis, "unklar", `${name}: darf kein Urteil faellen`);
    assert.equal(speicher.has("smejj.auth.accessToken.v1"), true, `${name}: Token muss bleiben`);
    assert.equal(win.location.ersetztDurch, undefined, `${name}: keine Umleitung`);
  }
});

test("ohne Token wird gar nicht erst gefragt", async () => {
  let gefragt = false;
  const { win } = fensterMit({ token: "" });
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: async () => { gefragt = true; return { ok: true, json: async () => ({}) }; },
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "kein-token");
  assert.equal(gefragt, false, "ohne Token ist nichts zu pruefen");
});

test("auf oeffentlichen Seiten wird nicht umgeleitet, das Token aber geraeumt", async () => {
  // Sonst haenge eine Werbeseite in einer Schleife zur Anmeldung.
  const { win, speicher } = fensterMit({ token: "altes.token", pfad: "/de/" });
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: antwortMit({ authenticated: false }),
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "abgelaufen");
  assert.equal(speicher.has("smejj.auth.accessToken.v1"), false);
  assert.equal(win.location.ersetztDurch, undefined, "oeffentliche Seiten bleiben stehen");
});

test("die Pruefung blockiert das Rendern nicht", async () => {
  const quelle = readFileSync(new URL("../public/auth-gate.js", import.meta.url), "utf8");
  assert.match(quelle, /if \(!umgeleitet\) verifyStoredSession\(window\)\.catch/,
    "sie laeuft nebenher und nur, wenn die Seite bleibt");
  assert.ok(!/await verifyStoredSession/.test(quelle.split("\n").at(-6) || ""),
    "kein await auf Modulebene");
});

test("die Anmeldeseite nennt den Grund", async () => {
  const seite = readFileSync(new URL("../public/auth/auth-page.js", import.meta.url), "utf8");
  assert.match(seite, /params\.get\("abgelaufen"\)/);
  assert.match(seite, /Deine Anmeldung ist abgelaufen/);
});

// ---------------------------------------------------------------------------
// 2026-08-09 — Nach dem Login in den Chat, nicht auf die Kontoseite.
//
// Befund Betreiber: "wenn ich eingeloggt bin, geht es nicht direkt auf Chat".
// Drei Regeln: (1) Login-Ziel ist der Chat "/" bzw. das ?next=-Ziel, das das
// Gate mitgibt. (2) ?next= akzeptiert NUR app-eigene Pfade — sonst offene
// Weiterleitung. (3) Wer schon angemeldet die Anmeldeseite oeffnet, wird
// sofort weitergeleitet statt "Bereits angemeldet" zu lesen.
// ---------------------------------------------------------------------------

test("ein abgelaufenes Token auf einer tiefen Seite merkt sich das Ziel", async () => {
  const { win } = fensterMit({ token: "altes.token", pfad: "/verlauf" });
  const ergebnis = await verifyStoredSession(win, {
    fetchFn: antwortMit({ authenticated: false, user: null }),
    apiOrigin: "https://control.test"
  });
  assert.equal(ergebnis, "abgelaufen");
  assert.equal(win.location.ersetztDurch, "/auth/login/?abgelaufen=1&next=%2Fverlauf",
    "Grund UND Rueckkehr-Ziel muessen mitwandern");
});

test("die Anmeldeseite leitet in den Chat, nicht mehr auf /profile", () => {
  const seite = readFileSync(new URL("../public/auth/auth-page.js", import.meta.url), "utf8");
  assert.ok(!seite.includes('window.location.assign("/profile?login=ok")'),
    "das feste /profile-Ziel muss weg sein");
  assert.match(seite, /function nextTarget\(\)/);
  assert.match(seite, /gotoAfterLogin\(\)/);
  // Nur app-eigene Pfade: genau EIN fuehrender Schraegstrich, nichts unter /auth.
  assert.match(seite, /\^\\\/\(\?!\[\/\\\\\]\)/, "die ?next=-Pruefung gegen offene Weiterleitungen muss stehen");
  assert.match(seite, /startsWith\("\/auth"\)/, "Ziele unter /auth waeren eine Schleife");
  // Der Login-Marker ?login=ok bleibt erhalten (onboarding-welcome.js liest ihn).
  assert.match(seite, /login=ok/);
});

test("schon Angemeldete werden von der Anmeldeseite sofort weitergeleitet", () => {
  const seite = readFileSync(new URL("../public/auth/auth-page.js", import.meta.url), "utf8");
  const zweig = seite.match(/async function refreshSession\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(zweig, /window\.location\.replace\(nextTarget\(\)\)/,
    "bestehende Sitzung -> direkt in die App (replace, kein Verlaufs-Eintrag)");
  // Aufgaben-Links (E-Mail-Bestaetigung, Passwort-Reset) bleiben stehen.
  assert.match(zweig, /verify/);
  assert.match(zweig, /reset/);
  assert.match(zweig, /mode === "login"/, "die Registrierungsseite bleibt stehen");
});

test("der Hinweis erscheint in der Sprache des Nutzers, nicht auf Deutsch", () => {
  // Live gesehen: die Anmeldeseite stand englisch da, der Hinweis darunter
  // deutsch. t() faellt auf den Quelltext zurueck, solange das Woerterbuch
  // nicht geladen ist — also erst laden, dann melden.
  const seite = readFileSync(new URL("../public/auth/auth-page.js", import.meta.url), "utf8");
  const zweig = seite.match(/if \(params\.get\("abgelaufen"\)\) \{[\s\S]*?\n  \}/)[0];
  assert.ok(zweig.indexOf("await loadUiLanguage") < zweig.indexOf("status("),
    "die Sprache muss VOR der Meldung geladen sein");
});

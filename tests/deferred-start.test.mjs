// smejj.com — Tests fuer Ladezeit-Arbeiten vom 2026-07-27.
//
// Zwei Zusagen werden hier festgehalten:
//   1. Der Control Server steht nicht mehr im Ladepfad eines Seitenaufrufs.
//   2. Die Startseite laedt ein Stylesheet-Buendel statt acht Einzeldateien,
//      und das Buendel enthaelt die Quellen unveraendert und in Reihenfolge.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterFirstPaint } from "../public/deferred-start.js";
import { SOURCES } from "../scripts/build/bundle-start-styles.mjs";

const html = fs.readFileSync("public/index.html", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");
const premium = fs.readFileSync("public/premium-surfaces.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const bundle = fs.readFileSync("public/start-styles.css", "utf8");

// Ein Fenster-Ersatz: Bildwechsel und Leerlauf lassen sich so gezielt steuern.
function fakeScope({ paint = true, idle = true, fcp = false } = {}) {
  return {
    PerformanceObserver: fcp ? class { constructor(cb) { this.cb = cb; } observe() { setTimeout(() => this.cb({ getEntries: () => [{ name: "first-contentful-paint" }] }), 0); } disconnect() {} } : undefined,
    requestAnimationFrame: paint ? (fn) => setTimeout(fn, 0) : undefined,
    requestIdleCallback: idle ? (fn) => setTimeout(fn, 0) : undefined,
    setTimeout: (fn, ms) => setTimeout(fn, ms)
  };
}

test("Aufgaben laufen erst nach dem Bildaufbau, dann alle", async () => {
  const gelaufen = [];
  await afterFirstPaint([() => gelaufen.push("a"), () => gelaufen.push("b")], { scope: fakeScope() });
  assert.deepEqual(gelaufen, ["a", "b"]);
});

test("eine fehlerhafte Aufgabe reisst die anderen nicht mit", async () => {
  const gelaufen = [];
  await afterFirstPaint([
    () => { throw new Error("Netz weg"); },
    () => gelaufen.push("zweite")
  ], { scope: fakeScope() });
  assert.deepEqual(gelaufen, ["zweite"]);
});

test("ohne Bildwechsel greift der Notausgang (Hintergrund-Tab)", async () => {
  const gelaufen = [];
  await afterFirstPaint([() => gelaufen.push("trotzdem")], { scope: fakeScope({ paint: false, idle: false }), timeoutMs: 20 });
  assert.deepEqual(gelaufen, ["trotzdem"], "in einem unsichtbaren Tab darf nichts haengenbleiben");
});

test("Paint-Ereignis des Browsers wird als Signal genutzt", async () => {
  // Befund 2026-07-27 (live): zwei requestAnimationFrame allein reichen nicht —
  // rAF laeuft VOR dem Malen. Im warmen Wiederbesuch starteten die Aufrufe
  // dadurch bei 142-160 ms, der Bildaufbau lag erst bei 168 ms.
  const gelaufen = [];
  await afterFirstPaint([() => gelaufen.push("nach-fcp")], { scope: fakeScope({ fcp: true, paint: false, idle: false }), timeoutMs: 5000 });
  assert.deepEqual(gelaufen, ["nach-fcp"], "das Paint-Ereignis allein muss reichen");
  const quelle = fs.readFileSync("public/deferred-start.js", "utf8");
  assert.match(quelle, /type: "paint", buffered: true/, "Paint-Beobachtung fehlt");
  assert.match(quelle, /raf\(\(\) => raf\(\(\) => \(scope\.setTimeout \|\| setTimeout\)\(resolve, 0\)\)\)/, "Rueckfallweg muss nach dem Malen laufen");
});

test("der Rueckfallweg darf die Paint-Beobachtung nicht ueberholen", async () => {
  // Fehler in sw v152 (live gemessen): Promise.race liess den schnelleren
  // gewinnen. Zwei rAF plus setTimeout waren beim warmen Wiederbesuch schneller
  // als der echte Bildaufbau — sechs Aufrufe bei 112 ms, Bildaufbau bei 140 ms.
  const reihenfolge = [];
  const scope = {
    // Paint meldet sich SPAET.
    PerformanceObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() { setTimeout(() => { reihenfolge.push("paint"); this.cb({ getEntries: () => [{ name: "first-contentful-paint" }] }); }, 60); }
      disconnect() {}
    },
    // Bildwechsel meldet sich SOFORT — darf trotzdem nicht gewinnen.
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    setTimeout: (fn, ms) => setTimeout(fn, ms)
  };
  await afterFirstPaint([() => reihenfolge.push("aufgabe")], { scope, timeoutMs: 5000 });
  assert.deepEqual(reihenfolge, ["paint", "aufgabe"], "die Aufgabe lief vor dem Bildaufbau");
});

test("leere oder ungueltige Liste tut nichts", async () => {
  await afterFirstPaint([], { scope: fakeScope() });
  await afterFirstPaint(null, { scope: fakeScope() });
});

test("Control-Server-Aufrufe stehen nicht mehr im Ladepfad", () => {
  // Die fuenf Startaufrufe muessen hinter afterFirstPaint liegen.
  assert.match(appJs, /afterFirstPaint\(\[/, "app.js verschiebt die Startaufrufe");
  assert.match(premium, /afterFirstPaint\(\[\(\) => syncServerAiStatus\(\)\]\)/, "premium-surfaces.js verschiebt /api/health");
  const boot = appJs.slice(appJs.indexOf("function boot()"), appJs.indexOf("function bindNavigation()"));
  const verschoben = boot.slice(boot.indexOf("afterFirstPaint"));
  for (const aufruf of ["initGoogleLogin", "refreshSessionStatus", "refreshKimiVaultStatus", "refreshGlmVaultStatus"]) {
    assert.ok(verschoben.includes(aufruf), `${aufruf} muss hinter afterFirstPaint stehen`);
    assert.ok(!boot.slice(0, boot.indexOf("afterFirstPaint")).includes(aufruf), `${aufruf} darf nicht mehr direkt beim Start laufen`);
  }
});

test("auch die letzten drei Startaufrufe stehen nicht im Ladepfad", () => {
  // Zweite Welle (2026-07-27): /api/auth/me, /api/keys und die beiden
  // Cline-Aufrufe. Alle drei Quellen muessen ueber afterFirstPaint laufen.
  const faelle = [
    ["public/account-privacy.js", /afterFirstPaint\(\[\(\) => hydrateAuthSession\(view\)\]\)/, /\n {2}hydrateAuthSession\(view\);/],
    ["public/api-keys-surface.js", /afterFirstPaint\(\[\(\) => refresh\(root\)/, /\n {2}refresh\(root\)\.catch/],
    ["public/provider-settings.js", /afterFirstPaint\(\[\(\) => load\(root\)/, /\n {2}load\(root\)\.catch/]
  ];
  for (const [datei, verschoben, direkt] of faelle) {
    const quelle = fs.readFileSync(datei, "utf8");
    assert.match(quelle, /import \{ afterFirstPaint \} from "\.\/deferred-start\.js"/, `${datei} bindet das Modul nicht ein`);
    assert.match(quelle, verschoben, `${datei} verschiebt den Startaufruf nicht`);
    assert.doesNotMatch(quelle, direkt, `${datei} ruft beim Start noch direkt auf`);
  }
});

test("auch der letzte Startaufruf steht nicht mehr im Ladepfad", () => {
  // /api/auth/me aus autonomous-coding.js — war zuletzt 11 ms vor dem Bildaufbau.
  const quelle = fs.readFileSync("public/autonomous-coding.js", "utf8");
  assert.match(quelle, /import \{ afterFirstPaint \} from "\.\/deferred-start\.js"/);
  assert.match(quelle, /afterFirstPaint\(\[\(\) => refreshSession\(\)\.catch\(showError\)\]\)/);
  assert.doesNotMatch(quelle, /\n {2}refreshSession\(\)\.catch\(showError\);/, "laeuft noch direkt beim Start");
});

test("cline-model-menu.js laedt seinen Katalog weiterhin nur auf Klick", () => {
  // Non-Regression: das Untermenue war nie im Ladepfad und darf es nicht werden.
  const menu = fs.readFileSync("public/cline-model-menu.js", "utf8");
  const openIndex = menu.indexOf("function openSubmenu");
  assert.ok(openIndex > 0);
  assert.ok(menu.indexOf("loadCatalog()") > openIndex, "loadCatalog gehoert in openSubmenu, nicht in init");
});

test("Startseite laedt ein Buendel statt acht Stylesheets", () => {
  const links = html.match(/<link rel="stylesheet"[^>]*>/g) || [];
  assert.equal(links.length, 1, `genau ein Stylesheet erwartet, gefunden: ${links.length}`);
  assert.match(links[0], /\/assets\/start-styles\.css/);
  // Non-Regression: kein einzelnes Startseiten-Stylesheet darf zurueckkehren.
  for (const name of SOURCES) {
    assert.ok(!html.includes(`/assets/${name}`), `${name} wird noch einzeln geladen`);
  }
});

test("Buendel enthaelt alle Quellen unveraendert und in Reihenfolge", () => {
  let position = -1;
  for (const name of SOURCES) {
    const quelle = fs.readFileSync(`public/${name}`, "utf8").trimEnd();
    assert.ok(bundle.includes(quelle), `${name} fehlt im Buendel oder wurde veraendert`);
    const gefunden = bundle.indexOf(`/* ---- ${name} ---- */`);
    assert.ok(gefunden > position, `${name} steht in falscher Reihenfolge — das aendert die Kaskade`);
    position = gefunden;
  }
});

test("Service Worker cached Buendel und Modul, nicht mehr die Einzeldateien", () => {
  assert.ok(sw.includes('"/assets/start-styles.css"'), "Buendel fehlt im Precache");
  assert.ok(sw.includes('"/assets/deferred-start.js"'), "deferred-start.js fehlt im Precache — App waere offline tot");
  for (const name of SOURCES) {
    assert.ok(!sw.includes(`"/assets/${name}"`), `${name} liegt unnoetig im Precache`);
  }
    // v153 -> v154 am 2026-07-28: view-title.js neu im Precache (Seitentitel je
  // Ansicht, QA-Welle 2 Befund W2-05). public/sw.js selbst siehe dort.
  // v157 -> v158 am 2026-07-28: englische Hoeflichkeitsfassungen der Rechtstexte
  // im Precache (siehe tests/profile-dock.test.mjs).
  // v164 -> v165 am 2026-07-28: Aktionen pro Chat-Nachricht — chat-actions.js,
  // chat-messages.js und chat-actions-menu.js neu im Precache, start-styles.css
  // enthaelt neu chat-actions.css (siehe public/sw.js).
  // v195 -> v196 am 2026-08-02: Sprachwelle Stufe 3a auf der Startseite —
  // voice-thinking-cue.js neu im Precache, weil composer-tools.js es importiert
  // (siehe public/sw.js). Diese Zusicherung erzwingt genau diesen Versionssprung.
  assert.match(sw, /CACHE_NAME = "smejj-shell-v253"/);
});

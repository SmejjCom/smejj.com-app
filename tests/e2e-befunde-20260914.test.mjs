// Regressionen der Befunde aus dem echten Browser-Test vom 14.09.2026 (smejj.com live).
// E1: /api/fehler bekam 401, wenn ein Token aber kein Sitzungscookie da war.
// E6: waehrend der Wartezeit bis zum ersten Byte gab es keinen Stopp-Knopf,
//     weil der Strom erst NACH dem fetch als laufend gemeldet wurde.
// E3: die Fuehrungsblase riet ihre Hoehe und lag am Handy auf dem Eingabefeld.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");

test("E1: Fehler-Faenger schickt den Bearer mit (nicht nur das Cookie)", () => {
  const q = lies("fehler-faenger.js");
  assert.match(q, /headers\.Authorization = `Bearer \$\{token\}`/);
  assert.match(q, /credentials: "include"/, "Cookie-Weg bleibt erhalten");
});

test("E6: streamChatAnswer meldet den Strom als laufend, BEVOR gewartet wird", () => {
  const q = lies("ai/chat-stream.js");
  const aussen = q.slice(q.indexOf("export async function streamChatAnswer("));
  const koerper = aussen.slice(0, aussen.indexOf("\n}\n"));
  const anmelden = koerper.indexOf("aktiveLeser.add(anker)");
  const innen = koerper.indexOf("streamChatAnswerInnen(");
  assert.ok(anmelden > -1 && innen > anmelden, "Anker vor dem eigentlichen Abruf");
  assert.match(koerper, /finally \{[^}]*aktiveLeser\.delete\(anker\)[^}]*meldeStromstand\(\)/, "Abmelden auch bei Fehler");
  assert.match(q, /if \(lauf\.gestoppt\)/, "Stopp waehrend der Wartezeit wird beachtet");
});

test("E3: Fuehrungsblase misst ihre echte Hoehe und weicht nach oben aus", () => {
  const q = lies("fuehrung.js");
  assert.match(q, /blase\.offsetHeight/);
  assert.match(q, /if \(darueber\) oben = Math\.max\(10, kasten\.top - hoehe - 12\)/);
});

test("Assets-Kopien sind identisch", () => {
  for (const d of ["fehler-faenger.js", "fuehrung.js", "auth-gate.js"]) assert.equal(lies(d), lies(`assets/${d}`), d);
});

test("E9: Projektliste und Projektwahl kennen state (kein ReferenceError mehr)", () => {
  const q = lies("projects-surface.js");
  const liste = q.slice(q.indexOf("export async function refreshProjectList"));
  assert.match(liste.slice(0, 600), /const \{ \$, state, workspace/);
  assert.match(q, /export function selectedProjectId\(\$, state = \{\}\)/);
  assert.equal((q.match(/selectedProjectId\(\$\)/g) || []).length, 0, "kein Aufruf ohne state");
});

test("E10: Stopp-Knopf schluckt den zweiten Klick eines Doppelklicks", () => {
  const q = lies("chat-stopp.js");
  assert.match(q, /const DOPPELKLICK_SPERRE_MS = \d{3};/);
  assert.match(q, /stoppSeit = Date\.now\(\);/);
  const fang = q.slice(q.indexOf("if (Date.now() - stoppSeit < DOPPELKLICK_SPERRE_MS) return;") - 1200, q.indexOf("if (Date.now() - stoppSeit < DOPPELKLICK_SPERRE_MS) return;"));
  assert.match(fang, /e\.stopImmediatePropagation\(\);/, "Klick wird geschluckt, bevor die Sperre greift (sonst Sprachmodus)");
});

test("E11: alle Sprachseiten erlauben api.smejj.com in connect-src (wie die Startseite)", () => {
  for (const l of ["ar", "bn", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pt", "ru", "tr", "zh"]) {
    const csp = (lies(`${l}/index.html`).match(/connect-src[^;"]*/) || [""])[0];
    assert.match(csp, /https:\/\/api\.smejj\.com/, l);
    assert.doesNotMatch(csp, /salad\.cloud/, `${l}: abgeschaltete Salad-Hosts raus`);
  }
});

// E12–E19: statische Suche nach undefinierten Namen (ESLint no-undef, 14.09.2026)
// fand Reste frueherer Auslagerungen — jeder davon warf ReferenceError beim Klick.
test("E12/E13: Export und Upload-Liste importieren downloadText (gleiche Adresse wie app.js)", () => {
  for (const d of ["projects-surface.js", "uploads-surface.js"]) assert.match(lies(d), /import \{ downloadText \} from "\.\/app-helfer\.js\?v=4";/, d);
  assert.match(lies("app.js"), /from "\.\/app-helfer\.js\?v=4"/);
});

test("E14: API-Bereich-Aktionen kennen ihre Konstanten und Helfer", () => {
  const q = lies("api-center-aktionen.js");
  for (const n of ["DEV_PREFIX", "BYOK_PREFIX", "MODELL_KEY"]) assert.match(q, new RegExp(`const ${n} = `), n);
  assert.match(q, /import \{ api, cssEscape, escapeHtml, fehlerText, zahl \} from "\.\/api-center-helfer\.js\?v=1";/);
  assert.doesNotMatch(q, /^\s+schliessePopovers\(root\);/m, "nur ueber hof");
  assert.match(lies("api-center-surface.js"), /return \{ alleEintraege, laden, melde, schliessePopovers \};/);
  // Wortgleich zur Flaeche — sonst zeigen zwei Stellen auf zwei Adressen.
  const flaeche = lies("api-center-surface.js");
  for (const n of ["DEV_PREFIX", "BYOK_PREFIX", "MODELL_KEY"]) assert.equal(q.match(new RegExp(`const ${n} = [^;]+;`))[0], flaeche.match(new RegExp(`const ${n} = [^;]+;`))[0], n);
});

test("E16–E19: Browser-Rechtsklick, Code-Anhang, Coding-Rueckfall, Admin-Ausweichhost", () => {
  assert.match(lies("browser-pane.js"), /import \{ zeigeVerlaufMenue \} from "\.\/browser-pane-menue\.js\?v=browser-pane-20260709-2";/);
  assert.match(lies("code-anhaenge.js"), /export function anhaengeZahl\(\)/);
  assert.match(lies("code-flaeche.js"), /!anhaengeZahl\(\)/);
  assert.doesNotMatch(lies("code-flaeche.js"), /!anhaenge\.length/);
  assert.doesNotMatch(lies("free-coding-fallback.js"), /projectId: state\.currentProjectId/);
  assert.doesNotMatch(lies("admin/api.js"), /\? ZWEIT_ORIGIN/);
  assert.match(lies("admin/api.js"), /const ALT_ORIGIN = /);
});

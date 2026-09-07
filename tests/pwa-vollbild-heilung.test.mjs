// smejj.com — Vollbild-Heilung der installierten iOS-App (Betreiber-Befund 2026-09-07).
//
// Der schwarze Balken unten (~52 pt) entsteht durch einen WebKit-Fehler: nach dem
// ersten Oeffnen der Tastatur schrumpft der Layout-Viewport der Standalone-Web-App
// und waechst bis zum Neustart nie zurueck. pwa-schnellstart.js erzwingt nach dem
// Schliessen der Tastatur einen Reflow. Diese Zusagen halten Regel und Ausloeser fest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/pwa-schnellstart.js", import.meta.url), "utf8");
// Nur die reinen Funktionen laden (der Rest greift auf window zu).
const start = quelle.indexOf("export const HEILUNG_SCHWELLE_PX");
const ende = quelle.indexOf("if (typeof window !== \"undefined\" && typeof document !== \"undefined\")");
assert.ok(start > 0 && ende > start, "die reinen Funktionen stehen vor dem Browser-Block");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.slice(start, ende)).toString("base64"));

test("geheilt wird nur in der installierten App und nur bei echtem Schwund (>= 20 px)", () => {
  assert.equal(m.brauchtHeilung({ innerHeight: 800, groesste: 852, standalone: true }), true, "852 -> 800 ist der gemessene Fall");
  assert.equal(m.brauchtHeilung({ innerHeight: 852, groesste: 852, standalone: true }), false);
  assert.equal(m.brauchtHeilung({ innerHeight: 840, groesste: 852, standalone: true }), false, "12 px sind Rundung/Adressleiste, keine Heilung");
  assert.equal(m.brauchtHeilung({ innerHeight: 800, groesste: 852, standalone: false }), false, "im Browser-Tab gibt es den Fehler nicht");
  assert.equal(m.HEILUNG_SCHWELLE_PX, 20);
});

test("der Reflow ist synchron: display none, Hoehe lesen, alter Wert zurueck", () => {
  let gelesen = 0;
  const body = { style: { display: "grid" }, get offsetHeight() { gelesen += 1; return 1; } };
  assert.equal(m.erzwingeReflow({ body }), true);
  assert.equal(gelesen, 1, "das Lesen von offsetHeight erzwingt das Layout");
  assert.equal(body.style.display, "grid", "der urspruengliche Wert bleibt erhalten");
  assert.equal(m.erzwingeReflow({ body: null }), false);
});

test("Ausloeser: focusout von Eingabefeldern (capture) und visualViewport-resize bei geschlossener Tastatur", () => {
  assert.match(quelle, /document\.addEventListener\("focusout"[\s\S]*?\}, true\)/, "focusout blubbert nicht — capture ist Pflicht");
  assert.match(quelle, /vv2\.addEventListener\("resize", \(\) => \{ if \(vv2\.height >= window\.innerHeight - 2\) planeHeilung\(\); \}\)/);
  assert.match(quelle, /display-mode: standalone/);
  assert.match(quelle, /navigator\.standalone === true/, "aeltere iOS-Fassungen kennen nur navigator.standalone");
});

test("kein Dauerlauf: hoechstens drei Nachfass-Versuche, groesste Hoehe nur ohne offene Tastatur gemessen", () => {
  assert.match(quelle, /versuch < 3 && brauchtHeilung/);
  assert.match(quelle, /if \(!tastaturOffen\(\) && window\.innerHeight > groesste\) groesste = window\.innerHeight;/);
});

test("die Datei liegt im Service-Worker-Vorrat und wird von index.html geladen", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"/assets/pwa-schnellstart.js"'));
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /\/assets\/pwa-schnellstart\.js\?v=\d+/);
});

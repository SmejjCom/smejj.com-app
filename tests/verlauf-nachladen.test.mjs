// smejj.com — Der Verlauf traegt seine Helfer erst, wenn er sichtbar wird.
//
// Hintergrund (2026-09-03, Web-Vitals: Gewicht 307 KB > 300 KB): chat-history-view.js
// importierte Verlaufs-Text (8,7 KB), Karten-Bausteine (5,4 KB) und die
// Titel-Automatik (5,1 KB) statisch — 19 KB auf JEDER Startseite, obwohl der
// Verlauf dort nicht gezeichnet wird. Und spur-start.js zog die 8,7 KB Text
// zusaetzlich fuer eine einzige Funktion (merkmaleVon) an den Start.
//
// Regel: Die drei Module kommen per import() aus ladeBausteine(); spur-start.js
// bezieht merkmaleVon aus dem kleinen chat-merkmale.js; chat-history-text.js
// re-exportiert dieselbe Funktion (eine Wahrheit, bestehende Aufrufer bleiben).
// Kaputte und gesunde Probe nach der Hausregel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Dieselbe Kennung wie in chat-history-text.js — sonst haelt auch Node zwei Instanzen (die Falle selbst).
import { merkmaleVon, volltext } from "../public/chat-merkmale.js?v=1";
import { merkmaleVon as ausText } from "../public/chat-history-text.js";

const ANSICHT = readFileSync(new URL("../public/chat-history-view.js", import.meta.url), "utf8");
const SPUR = readFileSync(new URL("../public/spur-start.js", import.meta.url), "utf8");

/** Statische Importe der drei schweren Module — die kaputte Form. */
export function statischeVerlaufsImporte(quelle) {
  return [...quelle.matchAll(/^\s*import\s+(?:[^;]*?from\s*)?["']([^"']*chat-(?:history-text|history-cards|title-auto)\.js[^"']*)["'];?/gm)].map((m) => m[1]);
}

test("kaputte Probe: ein statischer Import wird erkannt", () => {
  const probe = 'import { x } from "/assets/chat-history-text.js?v=b47c";\nimport "/assets/chat-title-auto.js";\nconst y = import("/assets/chat-history-cards.js?v=b60");';
  assert.deepEqual(statischeVerlaufsImporte(probe), ["/assets/chat-history-text.js?v=b47c", "/assets/chat-title-auto.js"]);
});

test("gesunde Probe: chat-history-view.js laedt Text, Karten und Titel-Automatik nur per import()", () => {
  assert.deepEqual(statischeVerlaufsImporte(ANSICHT), []);
  // Geprueft wird der MODULNAME, nicht seine Cache-Marke: die Marke wandert bei
  // jeder Aenderung am Modul (Markenkette), und ein Test, der sie festnagelt,
  // wird bei jeder Erhoehung rot, ohne dass etwas kaputt ist (04.09. passiert).
  for (const modul of ["chat-history-text.js", "chat-history-cards.js", "chat-title-auto.js"]) {
    const gefunden = new RegExp(`import\\("/assets/${modul.replace(/\./g, "\\.")}(\\?v=[A-Za-z0-9-]+)?"\\)`).test(ANSICHT);
    assert.ok(gefunden, `${modul} fehlt in ladeBausteine()`);
  }
  assert.match(ANSICHT, /async function render\(\) \{\n\s*await ladeBausteine\(\);/, "render wartet nicht auf die Bausteine");
  assert.match(ANSICHT, /function zeichne\(target\) \{\n\s*if \(!entdoppeln\)/, "zeichne ohne Bausteine muss nachladen statt werfen");
});

test("spur-start.js haengt nur am kleinen chat-merkmale.js", () => {
  assert.ok(SPUR.includes('from "/assets/chat-merkmale.js?v=1"'));
  assert.ok(!SPUR.includes("chat-history-text.js"), "spur-start.js zieht wieder den ganzen Verlaufs-Text an den Start");
});

test("merkmaleVon ist EINE Funktion und erkennt Datei, Bild, Code", () => {
  assert.equal(ausText, merkmaleVon, "chat-history-text.js muss dieselbe Funktion re-exportieren");
  const chat = { title: "Bericht", messages: [{ text: "Hier die tabelle.xlsx" }, { text: "```js\nconst a = 1\n```" }] };
  assert.deepEqual(merkmaleVon(chat), { datei: true, bild: false, code: true });
  assert.deepEqual(merkmaleVon({ title: "", messages: [{ text: "ein screenshot.png" }] }), { datei: false, bild: true, code: false });
  assert.equal(volltext({ title: "T", messages: [{ text: "a" }, { text: "b" }] }), "T a b");
});

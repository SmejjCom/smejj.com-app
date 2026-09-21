// smejj.com — die erste Frage geht ohne Konto (Apple-Ablehnung 2.1, 21.09.2026).
//
// Diese Reihe sichert die drei Eigenschaften, an denen es scheitern wuerde:
// der Strom-Leser darf ueber Stueckgrenzen hinweg nichts verlieren, der
// Rueckfall auf die Anmeldung muss erhalten bleiben (nie eine Sackgasse), und
// das Modul muss wirklich geladen und offline vorraetig sein.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const quelle = lies("public/gast-frage.js");

test("der Strom-Leser verliert nichts, wenn ein Stueck mitten in der Zeile endet", () => {
  const code = quelle.match(/function lies\([\s\S]*?\n {2}\}/)[0];
  const leser = new Function(`${code}; return lies;`)();
  let aus = "";
  let rest = leser('data: {"choices":[{"delta":{"content":"Hal"}}]}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\ndata: {"cho', "", (t) => { aus += t; });
  rest = leser('ices":[{"delta":{"content":" Welt"}}]}\ndata: [DONE]\n', rest, (t) => { aus += t; });
  assert.equal(aus, "Hallo Welt");
  assert.equal(rest, "");
});

test("jeder Fehler faellt auf die Anmeldung zurueck — nie eine Sackgasse", () => {
  assert.match(quelle, /catch \(fehler\) \{[\s\S]{0,200}location\.href = "\/auth\/register\/"/);
  assert.match(quelle, /new AbortController\(\)/);
  assert.match(quelle, /ZEITGRENZE_MS/);
});

test("die Landeseite laedt das Modul VOR dem Fokus-Skript und hat es offline", () => {
  const html = lies("public/willkommen.html");
  const gast = html.indexOf("gast-frage.js");
  const fokus = html.indexOf("willkommen-fokus.js");
  assert.ok(gast > 0 && gast < fokus, "gast-frage.js muss vor willkommen-fokus.js stehen");
  const sw = lies("public/sw.js");
  // Der schmale Willkommens-Vorrat UND der volle Vorrat brauchen die Datei:
  // ein fehlender Eintrag laesst gar keinen Service Worker mehr installieren.
  assert.equal(sw.split('"/assets/gast-frage.js"').length - 1, 2, "gast-frage.js fehlt in einer der beiden Precache-Listen");
  assert.ok(fs.existsSync(path.join(wurzel, "public", "assets", "gast-frage.js")), "assets-Kopie fehlt");
});

// Am Geraet gemessen (21.09.2026, Zuarbeit der Browser-Sitzung): die alte Frage
// blieb im Feld stehen, und am iPhone verdeckte die offene Tastatur die untere
// Haelfte der Antwortkarte samt Anmelde-Knopf.
test("nach dem Absenden ist das Feld leer, am Handy schliesst die Tastatur", () => {
  assert.match(quelle, /function feldAufraeumen\(\)/);
  assert.match(quelle, /feld\.value = ""/);
  assert.match(quelle, /\(pointer: coarse\)[\s\S]{0,40}feld\.blur\(\)/, "am Touch-Geraet muss der Fokus weg");
  assert.match(quelle, /else feld\.focus\(\)/, "am Schreibtisch soll der Fokus bleiben");
  assert.match(quelle, /scrollIntoView/);
});

test("der Satz unter dem Feld verspricht nichts Falsches mehr", () => {
  const html = lies("public/willkommen.html");
  assert.match(html, /die erste Frage geht sofort, ganz ohne Konto/);
  assert.doesNotMatch(html, /nach der kostenlosen Anmeldung geht deine Frage sofort los/);
  const en = lies("public/willkommen-sprache.js");
  assert.match(en, /"Probier es hier — die erste Frage geht sofort, ganz ohne Konto\.":/);
  assert.match(en, /"Kostenlos anmelden": "Sign up free"/);
});

// smejj.com — Schutztests fuer "Codeblock mit EINEM Klick kopieren"
// (public/chat-code-copy.js, 2026-07-29).
//
// Drei Kerne, die diese Tests festhalten:
//
//   1. Der Knopf traegt KEINEN Textknoten. chat-store.js speichert
//      entry.textContent, chat-history-context.js baut daraus den Modellkontext.
//      Ein geschriebenes "Kopieren" waere mitten im Code gelandet — im
//      gespeicherten Verlauf und in der naechsten Frage ans Modell. Die
//      Beschriftung kommt aus CSS (::after), der Name aus aria-label.
//
//   2. Der Knopf ist GESCHWISTER des <pre>, nie Kind. Das <pre> scrollt
//      horizontal; ein Kind darin waere an der Kante verschwunden.
//
//   3. Die Bedienung haengt nicht an :hover. Eine reine Hover-Bedienung
//      existiert fuer Tastatur-, Touch- und Screenreader-Nutzer nicht
//      (WCAG 2.1.1) — dieselbe Regel wie bei der Aktionsleiste.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modul = fs.readFileSync("public/chat-code-copy.js", "utf8");
const css = fs.readFileSync("public/chat-markdown.css", "utf8");
const bundle = fs.readFileSync("public/start-styles.css", "utf8");
const indexHtml = fs.readFileSync("public/index.html", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("der Knopf enthaelt keinen Textknoten — sonst landet er im Modellkontext", () => {
  // innerHTML des Knopfes: nur das Icon-Span mit SVG, kein geschriebenes Wort.
  const zuweisung = modul.match(/button\.innerHTML = `([^`]*)`/);
  assert.ok(zuweisung, "innerHTML des Knopfes muss auffindbar bleiben");
  const ohneTags = zuweisung[1].replace(/\$\{[^}]*\}/g, "").replace(/<[^>]*>/g, "").trim();
  assert.equal(ohneTags, "", `Knopf darf keinen Text tragen, gefunden: ${ohneTags}`);

  // Auch die SVG-Zeichnungen selbst sind reine Pfade ohne <text>.
  assert.doesNotMatch(modul, /<text[\s>]/i);

  // Kein textContent- oder Beschriftungs-Schreiben in den Knopf hinein.
  assert.doesNotMatch(modul, /button\.textContent\s*=/);
});

test("Beschriftung und Rueckmeldung kommen aus CSS, nicht aus dem DOM", () => {
  assert.match(css, /\.chat-code-copy::after\s*\{\s*content:\s*"Kopieren";/);
  assert.match(css, /\.chat-code-copy\.is-done::after\s*\{\s*content:\s*"Kopiert";/);
  // Der Name fuer Screenreader steht als Attribut, nicht als Text.
  assert.match(modul, /setAttribute\("aria-label", "Code kopieren"\)/);
  assert.match(modul, /setAttribute\("aria-label", "Code kopiert"\)/);
});

test("der Knopf ist Geschwister des <pre>, nie Kind", () => {
  // Der Wrapper traegt die Positionierung, das <pre> behaelt seinen Ueberlauf.
  assert.match(modul, /wrap\.append\(button, pre\)/);
  assert.match(css, /\.chat-code-wrap\s*\{[^}]*position:\s*relative/);
  assert.match(css, /\.chat-code-copy\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.entry\.assistant \.chat-code-wrap \.chat-code\s*\{[^}]*padding-top/);
  // Ueberlauf bleibt am <pre>: der Knopf darf nicht mitscrollen.
  assert.match(css, /\.entry\.assistant \.chat-code\s*\{[^}]*overflow-x:\s*auto/);
});

test("der Umbau ist idempotent — ein zweiter Durchlauf baut nichts doppelt", () => {
  assert.match(modul, /parent\.classList\?\.contains\("chat-code-wrap"\)\)\s*return false/);
  // Der Beobachter verwirft die eigenen Umbauten, sonst ruft er sich endlos auf.
  assert.match(modul, /observer\?\.takeRecords\(\)/);
});

test("die Bedienung haengt nicht an :hover (WCAG 2.1.1)", () => {
  const regel = css.match(/\n\.chat-code-copy \{[\s\S]*?\n\}/);
  assert.ok(regel, "Grundregel des Knopfes muss auffindbar bleiben");
  assert.doesNotMatch(regel[0], /display:\s*none|visibility:\s*hidden|opacity:\s*0/);
  // Fokus ist sichtbar, Hover und Fokus werden gleich behandelt.
  assert.match(css, /\.chat-code-copy:hover,\s*\n\.chat-code-copy:focus-visible/);
  assert.match(css, /\.chat-code-copy:focus-visible\s*\{[^}]*outline:/);
});

test("das Touch-Ziel bleibt bei 42 px, kompakt nur mit praezisem Zeigegeraet", () => {
  // Gemessen 2026-07-29 auf 375 px: ohne diese Regeln mass der Knopf 31x23 px.
  const grund = css.match(/\n\.chat-code-copy \{[\s\S]*?\n\}/)[0];
  assert.match(grund, /min-height:\s*42px/);
  assert.match(grund, /min-width:\s*42px/);
  // Verkleinert wird nur hinter der pointer-Abfrage — Browser ohne sie behalten
  // das groessere, sichere Ziel.
  // Der Media-Block endet mit einer Klammer am Zeilenanfang; die Regeln darin
  // sind eingerueckt und beenden den Match deshalb nicht.
  const fein = css.match(/@media \(pointer: fine\) \{[\s\S]*?\n\}/);
  assert.ok(fein, "kompakte Fassung muss hinter @media (pointer: fine) liegen");
  assert.match(fein[0], /\.chat-code-copy \{[\s\S]*?min-height:\s*26px/);
});

test("kopiert wird der Code, nicht der gerenderte Nachrichtentext", () => {
  assert.match(modul, /querySelector\("pre\.chat-code code"\)/);
  assert.match(modul, /clipboard\.writeText\(text\)/);
});

test("Auslieferung: eingebunden, gebuendelt und im Precache", () => {
  assert.match(indexHtml, /<script src="\/assets\/chat-code-copy\.js\?v=[^"]+" type="module"><\/script>/);
  assert.match(sw, /"\/assets\/chat-code-copy\.js"/);
  // Ohne Versionssprung erreicht die Aenderung Bestandsnutzer nicht.
  assert.match(sw, /CACHE_NAME = "smejj-shell-v245"/);
  // Die Regeln muessen im gebuendelten Stylesheet der Startseite ankommen.
  assert.match(bundle, /\.chat-code-copy::after/);
});

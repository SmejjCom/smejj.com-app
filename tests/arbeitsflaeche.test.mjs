// smejj.com — Arbeitsflaeche (Canvas rechts, Mockup 27).
//
// Der Fehler, den diese Datei festhaelt (live 2026-08-19, zwei Antworten):
// Die Flaeche kopierte die Antwort nach 1,2 s RUHE — der Markdown-Renderer
// laeuft aber erst am STROM-ENDE (public/ai/chat-stream.js). Jede Denkpause
// genuegte, und die Flaeche zeigte rohes Markdown ("#", "##" als Text) und
// zog NIE nach, weil der Eintrag als geprueft markiert war.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quelle = fs.readFileSync("public/arbeitsflaeche.js", "utf8");

test("die offene Flaeche FOLGT ihrem Original (Nachzug im Beobachter)", () => {
  // Die Bindung wird gehalten ...
  assert.match(quelle, /quellEntry = entry/);
  // ... und im entprellten Beobachter nachgezogen — die letzte Aenderung
  // ist immer die gerenderte Endfassung.
  assert.match(quelle, /quellInhalt\.innerHTML = quellEntry\.innerHTML/);
  // Schliessen loest die Bindung, sonst schreibt der Beobachter in eine
  // versteckte Flaeche weiter.
  assert.match(quelle, /aktion === "zu"[\s\S]{0,80}quellEntry = null/);
});

test("der Beobachter beruehrt nur das Log — die Flaeche haengt im Panel", () => {
  // Beobachtet wird #startLog; die Flaeche liegt in #browserPanel. Laege sie
  // im Log, zoege jeder Nachzug eine neue Mutation nach sich — Endlosschleife.
  assert.match(quelle, /document\.getElementById\("startLog"\)/);
  assert.match(quelle, /document\.getElementById\("browserPanel"\)/);
  assert.doesNotMatch(quelle, /log\.append\(f\)/);
});

test("Nr. 6: von selbst oeffnet die Flaeche nur, was gerade gestroemt ist — nie beim Wiederherstellen, nie am Handy", async () => {
  const m = await import("../public/arbeitsflaeche.js");
  assert.equal(m.darfAutoOeffnen({ laeuft: false, ende: -Infinity, jetzt: 1e6, breite: 1280 }), false, "wiederhergestellter Chat");
  assert.equal(m.darfAutoOeffnen({ laeuft: true, breite: 1280 }), true, "Strom laeuft");
  assert.equal(m.darfAutoOeffnen({ laeuft: false, ende: 1e6 - 2000, jetzt: 1e6, breite: 1280 }), true, "kurz nach Stromende");
  assert.equal(m.darfAutoOeffnen({ laeuft: false, ende: 1e6 - 9000, jetzt: 1e6, breite: 1280 }), false, "Nachlauf vorbei");
  assert.equal(m.darfAutoOeffnen({ laeuft: true, breite: 606 }), false, "Handy/schmal nie");
  assert.match(quelle, /if \(darfAutoOeffnen\(\)\) oeffneRechts\(entry\);/);
});

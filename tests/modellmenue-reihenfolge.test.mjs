// Waechter fuer die Reihenfolge im Modell-Menue.
//
// Betreiber-Auftrag 2026-08-18 im Wortlaut: "Auto soll ganz oben 1. sein,
// smejj 1.0 2. sein, Das heisst Auto wechsel platz mit smejj 1.0."
//
// Der sparsame Weg soll die erste Wahl sein, die man sieht. Ein spaeterer
// Umbau der Menue-Funktion koennte die Reihenfolge unbemerkt zuruecktauschen —
// dieser Waechter haelt sie fest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/code-flaeche.js", import.meta.url), "utf8");

test("Auto steht VOR smejj 1.0", () => {
  const auto = quelle.indexOf('titel: "Auto"');
  const haus = quelle.indexOf('titel: "smejj 1.0"');
  assert.ok(auto > 0, "Auto-Zeile nicht gefunden");
  assert.ok(haus > 0, "smejj-1.0-Zeile nicht gefunden");
  assert.ok(auto < haus, `Auto muss vor smejj 1.0 stehen (Auto bei ${auto}, smejj 1.0 bei ${haus})`);
});

test("beide Zeilen existieren genau einmal", () => {
  // Gegenprobe: ein Copy-Paste-Unfall wuerde die Reihenfolge-Pruefung oben
  // zufaellig gruen halten, obwohl das Menue doppelte Eintraege zeigt.
  assert.equal(quelle.split('titel: "Auto"').length - 1, 1);
  assert.equal(quelle.split('titel: "smejj 1.0"').length - 1, 1);
});

test("Auto ruft weiterhin KEIN /select", () => {
  // Der Router waehlt erst, wenn der Auftrag da ist. Wuerde die Auto-Zeile
  // beim Umsortieren einen /select-Aufruf erben, waere die Wahl eingefroren.
  const auto = quelle.indexOf('titel: "Auto"');
  const haus = quelle.indexOf('titel: "smejj 1.0"');
  const block = quelle.slice(auto, haus);
  assert.ok(!/providers\/cline\/select/.test(block), "Auto darf kein /select rufen");
  assert.match(block, /AUTO_MARKE/);
});

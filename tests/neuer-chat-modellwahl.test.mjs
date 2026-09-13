// "Neuer Chat" darf die Modellwahl nicht zuruecksetzen.
//
// Live gesehen am 13.09.: smejj 1 gewaehlt (Speicher "smejj 1"), "Neuer Chat"
// geklickt — der Chip zeigte "smejj 1.0", und die naechste Frage ging an die
// Standardstufe. chat-store.js las in newChat() NUR "smejj.model.v1", einen
// Schluessel, den seit Langem niemand mehr schreibt. Das traf jede Wahl, nicht
// nur smejj 1: auch 1.3 und Auto fielen bei jedem neuen Chat still zurueck.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync("public/chat-store.js", "utf8");
const config = readFileSync("public/config.js", "utf8");

test("der Schluessel, den das Menue schreibt, ist der, den newChat liest", () => {
  const menueSchluessel = /model:\s*"([^"]+)"/.exec(config)?.[1];
  assert.equal(menueSchluessel, "smejj.model.selected.v2");
  const newChat = store.slice(store.indexOf("export function newChat"), store.indexOf("function goToStart"));
  assert.match(newChat, /getItem\("smejj\.model\.selected\.v2"\)/, "newChat muss die aktuelle Wahl lesen");
});

test("der Altschluessel steht nur noch als Rueckfall HINTER der aktuellen Wahl", () => {
  for (const zeile of store.split("\n").filter((z) => z.includes('getItem("smejj.model.v1")'))) {
    const aktuell = zeile.indexOf('"smejj.model.selected.v2"');
    const alt = zeile.indexOf('"smejj.model.v1"');
    assert.ok(aktuell >= 0 && aktuell < alt, `Altschluessel darf die Wahl nicht ueberstimmen: ${zeile.trim()}`);
  }
});

test("niemand schreibt den Altschluessel mehr", () => {
  // Sonst waere der Rueckfall eine zweite Wahrheit statt eines Ueberbleibsels.
  assert.equal(/setItem\(\s*"smejj\.model\.v1"/.test(store), false);
});

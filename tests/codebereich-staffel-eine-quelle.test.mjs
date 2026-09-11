// smejj.com — der Code-Bereich muss dieselbe Staffel kennen wie das Menue.
//
// DREI FEHLER, live gemessen 2026-09-11 im Code-Bereich — alle aus EINER
// Ursache: code-flaeche.js fuehrte eine eigene, veraltete Tabelle der Stufen,
// waehrend die Wahrheit in SMEJJ_STAFFEL steht.
//
//   1. "spezial" fehlte in STUFEN. Wer smejj 1.3 gewaehlt hatte und den
//      Code-Bereich betrat, sah "Automatisch" — stufe() fiel auf den Rueckfall
//      zurueck. Der Speicher sagte spezial, der Chip sagte auto.
//   2. MODELL_TEXT nannte auto "smejj 1.0" (auto ist 1.1) und fuehrte die
//      Namen "smejj gruendlich" und "smejj schnell", die es im Menue gar nicht
//      gibt. Nach der Wahl von smejj 1.2 stand auf dem Chip "smejj gründlich",
//      waehrend der Haken im Menue auf "smejj 1.2" stand.
//   3. Der Stufen-Chip schaltete nur durch drei Stufen — smejj 1.3 war ueber
//      ihn nicht erreichbar, gerade dort, wo man die tiefste Denkstufe am
//      ehesten braucht.
//
// Dieselbe Krankheit wie im Chat am selben Tag: zwei Quellen fuer eine Wahl.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SMEJJ_STAFFEL } from "../public/code-modell-menue.js";

const quelle = readFileSync(new URL("../public/code-flaeche.js", import.meta.url), "utf8");

test("die Stufen kommen aus der Staffel, nicht aus einer eigenen Liste", () => {
  assert.match(quelle, /const STUFEN = nachVersionAbsteigend\(SMEJJ_STAFFEL\)/);
  assert.ok(!/const STUFEN = \["auto", "gruendlich", "schnell"\]/.test(quelle),
    "die eigene Stufenliste ist zurueck — dann faellt spezial wieder heraus");
});

test("die Modellnamen kommen aus der Staffel", () => {
  assert.match(quelle, /const MODELL_TEXT = Object\.fromEntries\(SMEJJ_STAFFEL\.map/);
  // NUR echter Code, keine Kommentare: die Erklaerung oben nennt die alten
  // Namen absichtlich, und ein Test, der darueber stolpert, prueft die
  // Beschreibung statt die Sache (Lehre vom 09.09.).
  const ohneKommentar = quelle.split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
  for (const erfunden of ["smejj gründlich", "smejj schnell"]) {
    assert.ok(!ohneKommentar.includes(`"${erfunden}"`), `${erfunden} steht wieder im Code — diesen Namen kennt das Menue nicht`);
  }
});

test("JEDE Stufe der Staffel hat einen Anzeigenamen", () => {
  // Ohne diese Probe faellt eine kuenftige fuenfte Stufe still auf undefined.
  const zeile = quelle.match(/const STUFEN_TEXT = \{[^}]*\}/)[0];
  for (const eintrag of SMEJJ_STAFFEL) {
    assert.ok(zeile.includes(`${eintrag.stufe}:`), `Stufe "${eintrag.stufe}" (${eintrag.titel}) hat keinen Anzeigenamen`);
  }
});

test("der Chip schaltet durch ALLE Stufen der Staffel", () => {
  assert.equal(
    (quelle.match(/const STUFEN = nachVersionAbsteigend\(SMEJJ_STAFFEL\)\.map\(\(eintrag\) => eintrag\.stufe\)\.reverse\(\)/) || []).length,
    1,
    "die Reihenfolge des Durchschaltens leitet sich nicht mehr aus der Staffel ab"
  );
  assert.ok(SMEJJ_STAFFEL.some((e) => e.stufe === "spezial"), "die Staffel selbst kennt spezial nicht mehr");
});

test("der Stufen-Chip geht den benannten Weg, nicht durch das alte Menue", () => {
  const ohr = quelle.match(/getElementById\("codeStufeChip"\)[\s\S]*?setTimeout\(zeichne, 80\);/);
  assert.ok(ohr, "das Klick-Ohr des Stufen-Chips fehlt");
  assert.match(ohr[0], /window\.smejjApplyStufe/);
  const benannt = ohr[0].indexOf("smejjApplyStufe");
  const alt = ohr[0].indexOf("data-stufe");
  assert.ok(benannt < alt, "der alte Weg laeuft wieder zuerst — er zwingt die Wahl auf smejj 1.0");
});

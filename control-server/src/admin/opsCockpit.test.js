// smejj.com — Unit-Tests für Executive Command Cockpit (Modul Cockpit)
import test from "node:test";
import assert from "node:assert/strict";
import { cockpitUebersicht } from "./opsCockpit.js";
import { AUTOPILOTEN } from "./opsAutopilotenListe.js";

test("cockpitUebersicht liefert High-Level Kennzahlen mit allen Autopiloten aus der Registry", async () => {
  // Nicht hart codieren: die Zahl 29 war schon falsch (31), ohne dass es
  // jemand merkte — genau der Fehler, den dieser Test finden soll.
  const c = await cockpitUebersicht();
  assert.equal(c.ok, true);
  assert.equal(c.gesundheit.autopilotenGesamt, AUTOPILOTEN.length);
  assert.ok(c.gesundheit.ampelText.includes(`/${AUTOPILOTEN.length} Autopiloten`));
  assert.equal(c.performance.ttftMs < 1000, true);
  assert.equal(c.kosten.monatlicheMehrkostenEur, 0.0);
  assert.equal(c.kiModell.liveModell, "smejj 1.0");
});

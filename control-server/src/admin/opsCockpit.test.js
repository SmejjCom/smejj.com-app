// smejj.com — Unit-Tests für Executive Command Cockpit (Modul Cockpit)
import test from "node:test";
import assert from "node:assert/strict";
import { cockpitUebersicht } from "./opsCockpit.js";

test("cockpitUebersicht liefert High-Level Kennzahlen mit allen 29 Autopiloten", async () => {
  const c = await cockpitUebersicht();
  assert.equal(c.ok, true);
  assert.equal(c.gesundheit.autopilotenGesamt, 29);
  assert.ok(c.gesundheit.ampelText.includes("/29 Autopiloten"));
  assert.equal(c.performance.ttftMs < 1000, true);
  assert.equal(c.kosten.monatlicheMehrkostenEur, 0.0);
  assert.equal(c.kiModell.liveModell, "smejj 1.0");
});

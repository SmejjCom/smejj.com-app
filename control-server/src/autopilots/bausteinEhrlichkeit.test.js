// smejj.com — Master-Audit 2026-09-15: Selbsttests, die nie scheitern konnten.
// Kaputte UND gesunde Probe je reparierter Pruefung.
import test from "node:test";
import assert from "node:assert/strict";

import * as S from "./autopilotSelbsttests.js";
import { distillOptimalReasoning } from "./knowledgeDistillerAutopilot.js";
import { processRealtimePairFrame } from "./realtimeVoicePairAutopilot.js";

test("Baustein-Kennzeichnung: die Meldung sagt selbst, dass keine Live-Wirkung gemessen wurde", () => {
  const e = S.alsBaustein(() => ({ ok: true, meldung: "Destillation: 3/3 Pruefungen bestanden" }))();
  assert.equal(e.ok, true);
  assert.ok(e.meldung.startsWith(S.BAUSTEIN_PRAEFIX));
  assert.match(e.meldung, /3\/3 Pruefungen bestanden$/);
  const rot = S.alsBaustein(() => ({ ok: false, meldung: "kaputt" }))();
  assert.equal(rot.ok, false, "die Kennzeichnung aendert nie das Urteil");
});

test("Nr. 21 Knowledge-Distiller: Selbsttest prueft das echte Urteil (isSound), nicht nur 'ein Objekt kam'", () => {
  assert.equal(S.laufKnowledgeDistiller().ok, true);
  // Die alte Probe (Feld `solution`) haette das Modul nie belohnt:
  assert.equal(distillOptimalReasoning("x", [{ model: "a", solution: "Die Summe ist 55." }]).isSound, false);
});

test("Nr. 27 Voice-Pair: Selbsttest unterscheidet Audio von Stille", () => {
  assert.equal(S.laufVoicePair().ok, true);
  assert.match(processRealtimePairFrame({ audio: "AAAA" }).contextSummary, /Stumm/, "das alte Feld `audio` kam nie an");
  assert.match(processRealtimePairFrame({ audioChunkBase64: "AAAA" }).contextSummary, /Audio-Eingabe aktiv/);
});

test("Nr. 22 Mutationstest: Selbsttest verlangt angewandte Mutationen", () => {
  assert.equal(S.laufEvolutionaryMutation().ok, true);
});

// smejj.com — Wächter-TÜV für den reaktivierten Trainings-Takt (Nr. 05,
// Betreiber-Anordnung 2026-08-24). Kaputte UND gesunde Probe — die Hausregel.
//
// Ausführen: node --test tests/trainings-takt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileDatenlage, laufTrainingsTakt, TRAININGS_QUELLEN } from "../control-server/src/autopilots/trainingsTaktAutopilot.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

test("Nr. 05: unlesbare Ablage ist rot, gesunde Lage grün, leerer Bestand ein Anfang", () => {
  assert.equal(beurteileDatenlage([{ name: "X", lesbar: false }]).ok, false, "unlesbar MUSS rot sein");
  assert.equal(beurteileDatenlage([{ name: "X", lesbar: true, anzahl: 5 }]).ok, true);
  assert.equal(beurteileDatenlage([{ name: "X", lesbar: true, anzahl: 0 }]).ok, true, "leer ist ehrlicher Anfang, kein Ausfall");
});

test("Nr. 05: der Lauf misst echte Ablagen — Capture aus ist GEWOLLT und grün, kaputte Quelle rot", async () => {
  const gesund = await laufTrainingsTakt({
    env: { SMEJJ_TRAINING_CAPTURE_ENABLED: "NO" },
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [{ id: "a" }, { id: "b" }] }) })
  });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /Capture aus \(fail-closed, gewollt/);
  assert.match(gesund.meldung, /Kosten-Freigabe/, "GPU-Läufe müssen ausdrücklich hinter der Freigabe stehen");

  const kaputt = await laufTrainingsTakt({
    env: {},
    storeFabrik: () => ({ liste: async () => { throw new Error("Ablage weg"); } })
  });
  assert.equal(kaputt.ok, false, "unlesbare Pipeline MUSS rot melden");
});

test("Nr. 05 ANSCHLUSS-BEWEIS: registriert, betrieben, heartbeat — kein Geisterdienst mehr", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "training-loop");
  assert.ok(eintrag, "Registry-Eintrag fehlt");
  assert.equal(eintrag.messung, "heartbeat", "Nr. 05 muss wieder MESSEN, nicht geplant sein");
  assert.match(eintrag.ort, /Autopilot-Läufer/, "der Ort muss der Läufer sein — kein externer Dienst");
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("training-loop"), "die Selbstheilung muss ihn wiederbeleben können");
  assert.equal(TRAININGS_QUELLEN.length, 4, "alle vier self-improvement-Ablagen werden gemessen");
});

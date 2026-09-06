// smejj.com — Welche Messlatte misst, und dass sie wirklich Fälle enthält.
//
// BEFUND 2026-09-06: smejj-1-1 und smejj-1-2 bekamen exakt dieselbe Note
// (70,59 %) bei gleicher Zahl kritischer Fehler. Der Vergleich der Einzelfälle
// zeigte: beide hatten 10 von 14 richtig — aber völlig verschiedene zehn.
//
// Die Messung war in Ordnung. Die MESSLATTE war zu grob: bei 14 Fällen gibt es
// zu wenige mögliche Summen, um zwei Modelle mit gegensätzlichem Verhalten
// auseinanderzuhalten. Eine Note, die für zwei verschiedene Modelle dieselbe
// ist, kann keine Beförderung begründen.
//
// Die breite Suite mit 295 Fällen gibt es seit dem 03.08. — sie wurde nur nie
// angeschlossen.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { baueMessJobVerzeichnis, SUITE_BREIT, SUITE_DATEI, SUITE_KERN } from "../scripts/training/smejj-1-1-messen.mjs";
import { loadEvalSuite } from "../src/evaluation/evalPacks.js";

const JOB_DIR = "workers/con-autopilot/salad-job";

test("gemessen wird standardmaessig mit der BREITEN Suite", () => {
  assert.equal(path.basename(SUITE_DATEI), "smejj-chat-breit-v1.json");
  assert.ok(existsSync(SUITE_BREIT) && existsSync(SUITE_KERN), "beide Latten bleiben verfuegbar");
});

test("die breite Suite loest sich auf 295 Faelle auf, jeder mit kritischer Erwartung", async () => {
  const { suite } = await loadEvalSuite(SUITE_BREIT);
  assert.ok(suite.cases.length >= 250, `nur ${suite.cases.length} Faelle — zu grob, um Modelle zu unterscheiden`);
  const ohneKritisch = suite.cases.filter((c) => !(c.assertions || []).some((a) => a.critical));
  assert.equal(ohneKritisch.length, 0,
    `${ohneKritisch.length} Faelle ohne kritische Erwartung — die koennen nie ein Nein begruenden`);
});

test("der Job bekommt die AUFGELOESTE Suite, nicht das Inhaltsverzeichnis", async () => {
  // Der Messjob liest schlicht suite["cases"] (salad-job/evalrun.py). Bekaeme
  // er das Manifest, faende er null Faelle — und bildete daraus eine Note.
  const { suite } = await loadEvalSuite(SUITE_BREIT);
  const gebaut = baueMessJobVerzeichnis(JOB_DIR, SUITE_BREIT, suite);
  try {
    const datei = path.join(gebaut.verzeichnis, "suites", path.basename(SUITE_BREIT));
    const geschickt = JSON.parse(readFileSync(datei, "utf8"));
    assert.ok(Array.isArray(geschickt.cases), "der Job braucht eine Fallliste");
    assert.equal(geschickt.cases.length, suite.cases.length);
    assert.ok(!geschickt.packs || geschickt.cases.length > 0, "kein blosser Verweis");
    assert.equal(gebaut.faelle, suite.cases.length);
  } finally {
    rmSync(gebaut.verzeichnis, { recursive: true, force: true });
  }
});

test("eine leere Suite wird ABGEWIESEN, statt still eine Note zu erzeugen", () => {
  // Die kaputte Probe zur gesunden oben: null Faelle duerfen nie durchgehen.
  for (const leer of [{ suiteId: "x", cases: [] }, { suiteId: "x" }, { suiteId: "x", cases: null }]) {
    assert.throws(() => baueMessJobVerzeichnis(JOB_DIR, SUITE_BREIT, leer),
      /ohne Faelle/, `${JSON.stringify(leer)} haette abgewiesen werden muessen`);
  }
});

test("ohne aufgeloeste Suite wird die Datei kopiert — Bestandsverhalten der Kern-Suite", async () => {
  const gebaut = baueMessJobVerzeichnis(JOB_DIR, SUITE_KERN);
  try {
    const geschickt = JSON.parse(readFileSync(path.join(gebaut.verzeichnis, "suites", path.basename(SUITE_KERN)), "utf8"));
    assert.equal(geschickt.cases.length, 14, "die Kern-Suite traegt ihre Faelle selbst");
  } finally {
    rmSync(gebaut.verzeichnis, { recursive: true, force: true });
  }
});

test("die Latte laesst sich umschalten, damit ein Vergleich moeglich bleibt", () => {
  // SMEJJ_MESS_SUITE wird beim Laden des Moduls gelesen; hier wird nur
  // festgehalten, dass beide Dateien existieren und verschieden sind.
  assert.notEqual(SUITE_BREIT, SUITE_KERN);
});

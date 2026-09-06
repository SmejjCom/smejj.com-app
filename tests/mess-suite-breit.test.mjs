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
import { baueSuitenVerzeichnis, SUITE_BREIT, SUITE_DATEI, SUITE_KERN } from "../scripts/training/smejj-1-1-messen.mjs";
import { loadEvalSuite } from "../src/evaluation/evalPacks.js";

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
  const gebaut = baueSuitenVerzeichnis(SUITE_BREIT, suite);
  try {
    const datei = path.join(gebaut.verzeichnis, path.basename(SUITE_BREIT));
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
    assert.throws(() => baueSuitenVerzeichnis(SUITE_BREIT, leer),
      /ohne Faelle/, `${JSON.stringify(leer)} haette abgewiesen werden muessen`);
  }
});

test("ohne aufgeloeste Suite wird die Datei kopiert — Bestandsverhalten der Kern-Suite", async () => {
  const gebaut = baueSuitenVerzeichnis(SUITE_KERN);
  try {
    const geschickt = JSON.parse(readFileSync(path.join(gebaut.verzeichnis, path.basename(SUITE_KERN)), "utf8"));
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

test("eine Wiederholung genuegt, solange die Messung deterministisch ist", async () => {
  // GEMESSEN 2026-09-06 an echten Antworten: alle 14 Fälle lieferten dreimal
  // exakt denselben Text. salad-job/evalrun.py erzeugt mit do_sample=False.
  // Drei Wiederholungen kosteten das Dreifache an GPU-Zeit für ein identisches
  // Ergebnis — bei 295 Fällen wären das 150 statt 50 Minuten.
  const { WIEDERHOLUNGEN, MAX_MINUTEN } = await import("../scripts/training/smejj-1-1-messen.mjs");
  assert.equal(WIEDERHOLUNGEN, 1);

  // Und die Rechnung muss ins Zeitbudget passen: zwei Stände (Basis und
  // Adapter) über alle Fälle, bei gemessenen 5,1 s je Antwort.
  const { suite } = await loadEvalSuite(SUITE_BREIT);
  const minuten = (suite.cases.length * WIEDERHOLUNGEN * 5.1 * 2) / 60;
  assert.ok(minuten < MAX_MINUTEN,
    `${Math.round(minuten)} min gemessene Laufzeit gegen ${MAX_MINUTEN} min Frist — die Messung liefe in die Zeitgrenze`);
});

test("do_sample bleibt aus — sonst waere eine Wiederholung zu wenig", () => {
  // Der Grund für WIEDERHOLUNGEN = 1 steht im Messjob. Ändert ihn jemand,
  // muss der Wert zurück auf 3, und dieser Test fällt vorher auf.
  const py = readFileSync("workers/con-autopilot/salad-job/evalrun.py", "utf8");
  assert.match(py, /"do_sample":\s*False/, "die Messung muss deterministisch bleiben");
});

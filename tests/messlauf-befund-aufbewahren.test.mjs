// Bei einem auffaelligen Messlauf muss der WORTLAUT der Antworten erhalten
// bleiben. Sonst weiss man beim naechsten Einbruch wieder nur, DASS es schlecht
// war.
//
// DER BEFUND (2026-08-22): Die Note fiel ueber Nacht von 100 auf 65,69 %. Fuenf
// von vierzehn Faellen wackelten — dieselbe Frage mal richtig, mal falsch. Was
// das Modell stattdessen sagte, war nicht mehr feststellbar: der vollstaendige
// Bericht lag im Temp-Ordner und wurde am Ende geloescht, wie bei jedem Lauf.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bewahreBefund } from "../scripts/verlauf/messlauf.mjs";
import { runEvalSuite, ANTWORT_BELEG_MAX } from "../scripts/evaluation/run_model_eval.mjs";

function attrappen() {
  const geschrieben = [];
  return {
    geschrieben,
    schreibe: async (pfad, inhalt) => { geschrieben.push({ pfad, inhalt }); },
    lege: async () => {}
  };
}

test("ein auffaelliger Lauf wird aufbewahrt", async () => {
  const a = attrappen();
  const pfad = await bewahreBefund(
    { run: { startedAt: "2026-08-22T04:10:06.513Z" }, summary: { criticalFailures: 7, wackelig: 5 } },
    { ordner: "/tmp/befunde-test", ...a }
  );
  assert.match(pfad, /bericht-2026-08-22T04-10-06-513Z\.json$/);
  assert.equal(a.geschrieben.length, 1);
});

test("ein sauberer Lauf wird NICHT aufbewahrt", async () => {
  // Sonst waechst der Ordner mit Berichten, die nichts erklaeren.
  const a = attrappen();
  const pfad = await bewahreBefund(
    { run: { startedAt: "2026-08-22T04:10:06.513Z" }, summary: { criticalFailures: 0, wackelig: 0 } },
    { ordner: "/tmp/befunde-test", ...a }
  );
  assert.equal(pfad, "");
  assert.equal(a.geschrieben.length, 0);
});

test("schon EIN wackeliger Fall genuegt", async () => {
  // Wackelig ohne kritischen Verstoss ist genau der Fall, der spaeter erklaert
  // werden muss — die Punktzahl allein sieht dann harmlos aus.
  const a = attrappen();
  const pfad = await bewahreBefund(
    { run: { startedAt: "2026-08-22T04:10:06.513Z" }, summary: { criticalFailures: 0, wackelig: 1 } },
    { ordner: "/tmp/befunde-test", ...a }
  );
  assert.ok(pfad, "ein wackeliger Fall muss reichen");
});

test("nicht bestandene Durchgaenge tragen ihren Wortlaut, bestandene nicht", async () => {
  // Das eigentliche Ziel: der Bericht soll sagen, WAS geantwortet wurde.
  const evalCase = {
    id: "probe",
    prompt: "Frage",
    assertions: [{ type: "contains_all", values: ["richtig"] }]
  };
  let n = 0;
  const callModel = async () => {
    n += 1;
    return n === 1
      ? { ok: true, text: "richtig", backend: "test", modelId: "m" }
      : { ok: true, text: "Verstanden. Ich kann daraus eine konkrete Aufgabe machen", backend: "test", modelId: "m" };
  };
  const { caseScores } = await runEvalSuite({
    suite: { id: "s" }, cases: [evalCase], callModel, wiederholungen: 2, delayMs: 0, sleep: async () => {}
  });
  const fall = caseScores[0];
  assert.ok(fall.wackelig, "die Probe muss wackelig sein, sonst prueft der Test nichts");
  assert.ok(Array.isArray(fall.belege) && fall.belege.length === 1,
    `genau der gefallene Durchgang gehoert belegt, nicht der bestandene: ${JSON.stringify(fall.belege)}`);
  assert.match(fall.belege[0].antwort, /Verstanden\. Ich kann daraus/);
});

test("der Wortlaut wird gekuerzt, nicht unbegrenzt mitgeschleppt", async () => {
  assert.ok(ANTWORT_BELEG_MAX > 200 && ANTWORT_BELEG_MAX <= 4000,
    "die Grenze soll erkennen lassen, was schiefging, ohne den Bericht zu sprengen");
});

// smejj 1.1 messen — reine Teile: Staende, Parameter, Buendel nur mit smejj-Suite, Benotung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { messStaende, jobParameter, baueSuitenVerzeichnis, benoteAntworten, BASIS_STAND, EVAL_PREFIX } from "../scripts/training/smejj-1-1-messen.mjs";
import { loadEvalSuite } from "../src/evaluation/evalPacks.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Staende: Fundament zuerst, dann der Adapter von smejj-1-1", () => {
  const s = messStaende();
  assert.equal(s[0].version, BASIS_STAND);
  assert.equal(s[0].adapterPrefix, undefined);
  assert.equal(s[1].version, "smejj-1-1");
  assert.equal(s[1].adapterPrefix, "con/versions/smejj-1-1/adapter");
});

test("Job-Parameter: eigene Ablage smejj/evals, EINE Wiederholung, beide Staende als JSON", () => {
  const p = jobParameter();
  assert.equal(p.CON_EVAL_PREFIX, EVAL_PREFIX);
  assert.equal(EVAL_PREFIX.startsWith("con/"), false, "Antworten duerfen nicht unter con/evals landen");
  // EINE Wiederholung, nicht drei (16a3f390): die Messstrecke laeuft mit
  // do_sample=False, ist also deterministisch — alle 14 Faelle lieferten
  // dreimal exakt denselben Text. Drei Laeufe kosteten das Dreifache an
  // GPU-Zeit fuer dasselbe Ergebnis; bei 295 Faellen waeren es 150 statt
  // 50 Minuten. Der Code sagt ausdruecklich "der Test haelt beides fest:
  // den Wert und den Grund" — nur nachgezogen wurde er nie, und der Test
  // stand seither rot. Wird je auf Sampling umgestellt, gehoert hier UND in
  // scripts/training/smejj-1-1-messen.mjs die 3 zurueck.
  assert.equal(p.CON_WIEDERHOLUNGEN, "1");
  assert.deepEqual(JSON.parse(p.CON_MESS_VERSIONEN), messStaende());
});

test("Suiten-Verzeichnis traegt NUR die smejj-Suite — das con-Suiten-Verzeichnis bleibt unveraendert", () => {
  const conSuiten = path.join(WURZEL, "workers/con-autopilot/suites");
  const vorher = readdirSync(conSuiten).sort();
  const b = baueSuitenVerzeichnis();
  try {
    // BREIT statt CORE (bf12049e): die 14 Faelle der schmalen Suite konnten
    // Modelle nicht mehr unterscheiden — jedes bestand sie. Der Test hing
    // seither am alten Namen und stand rot.
    assert.deepEqual(b.suiten, ["smejj-chat-breit-v1.json"]);
    assert.ok(existsSync(path.join(b.verzeichnis, "smejj-chat-breit-v1.json")));
    assert.deepEqual(readdirSync(conSuiten).sort(), vorher);
    assert.ok(vorher.some((n) => /^con-/.test(n)), "die con-Suiten liegen weiter an ihrem Ort");
  } finally {
    rmSync(b.verzeichnis, { recursive: true, force: true });
  }
});

test("Benotung: eine leere Messung wird ABGEBROCHEN, richtige Antwort besteht — kaputte UND gesunde Probe", async () => {
  const { suite } = await loadEvalSuite(path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json"));
  const leer = { jobId: "t", suiten: [{ suiteId: suite.suiteId, cases: suite.cases.map((c) => ({ id: c.id, runs: [{ text: "", latencyMs: 1, tokensOut: 0, error: null }] })) }] };
  // FRUEHER erwartete dieser Test hier 0 % und "blocked". Der Code ist
  // inzwischen strenger — und zu Recht: eine unvollstaendige Messung ergibt
  // keine niedrige Note, sondern gar keine. Leere Antworten als "nicht
  // bestanden" zu werten waere ein Urteil ueber den ABBRUCH, nicht ueber das
  // Modell, und genau so entstehen die Zahlen, denen man spaeter glaubt.
  // Der Test hing an der alten Zusage und stand seither rot.
  await assert.rejects(
    benoteAntworten(suite, leer, "leer"),
    /Messung unvollstaendig/,
    "eine Messung ohne echte Antworten darf keine Note ergeben"
  );
  const fall = suite.cases.find((c) => c.id === "naming-schreibweise");
  const gesund = { jobId: "t", suiten: [{ suiteId: suite.suiteId, cases: [{ id: fall.id, runs: [{ text: "Der Name wird ausnahmslos smejj.com geschrieben.", latencyMs: 1, tokensOut: 5, error: null }, { text: "smejj.com", latencyMs: 1, tokensOut: 1, error: null }] }] }] };
  const g = await benoteAntworten({ ...suite, cases: [fall] }, gesund, "gesund");
  assert.equal(g.summary.weightedScore, 1);
  assert.equal(g.summary.wiederholungen, 2, "beide Durchgaenge muessen gezaehlt werden");
  await assert.rejects(benoteAntworten(suite, { suiten: [{ suiteId: "fremd", cases: [] }] }, "x"), /fehlt in den Antworten/);
});

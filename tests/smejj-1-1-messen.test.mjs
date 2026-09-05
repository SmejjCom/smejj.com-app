// smejj 1.1 messen — reine Teile: Staende, Parameter, Buendel nur mit smejj-Suite, Benotung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { messStaende, jobParameter, baueMessJobVerzeichnis, benoteAntworten, BASIS_STAND, EVAL_PREFIX } from "../scripts/training/smejj-1-1-messen.mjs";
import { loadEvalSuite } from "../src/evaluation/evalPacks.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Staende: Fundament zuerst, dann der Adapter von smejj-1-1", () => {
  const s = messStaende();
  assert.equal(s[0].version, BASIS_STAND);
  assert.equal(s[0].adapterPrefix, undefined);
  assert.equal(s[1].version, "smejj-1-1");
  assert.equal(s[1].adapterPrefix, "con/versions/smejj-1-1/adapter");
});

test("Job-Parameter: eigene Ablage smejj/evals, drei Wiederholungen, beide Staende als JSON", () => {
  const p = jobParameter();
  assert.equal(p.CON_EVAL_PREFIX, EVAL_PREFIX);
  assert.equal(EVAL_PREFIX.startsWith("con/"), false, "Antworten duerfen nicht unter con/evals landen");
  assert.equal(p.CON_WIEDERHOLUNGEN, "3");
  assert.deepEqual(JSON.parse(p.CON_MESS_VERSIONEN), messStaende());
});

test("Job-Buendel traegt NUR die smejj-Suite, con-Suiten bleiben draussen, der con-Job bleibt unveraendert", () => {
  const jobDir = path.join(WURZEL, "workers/con-autopilot/salad-job");
  const vorher = readdirSync(path.join(jobDir, "suites")).sort();
  const b = baueMessJobVerzeichnis(jobDir);
  try {
    assert.deepEqual(b.suiten, ["smejj-chat-core-v1.json"]);
    assert.ok(existsSync(path.join(b.verzeichnis, "job.py")));
    assert.ok(existsSync(path.join(b.verzeichnis, "evalrun.py")));
    assert.deepEqual(readdirSync(path.join(jobDir, "suites")).sort(), vorher);
  } finally {
    rmSync(b.verzeichnis, { recursive: true, force: true });
  }
});

test("Benotung: leere Antworten 0 % und blocked, richtige Antwort besteht — kaputte UND gesunde Probe", async () => {
  const { suite } = await loadEvalSuite(path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json"));
  const leer = { jobId: "t", suiten: [{ suiteId: suite.suiteId, cases: suite.cases.map((c) => ({ id: c.id, runs: [{ text: "", latencyMs: 1, tokensOut: 0, error: null }] })) }] };
  const b = await benoteAntworten(suite, leer, "leer");
  assert.equal(b.summary.weightedScore, 0);
  assert.equal(b.verdict, "blocked");
  assert.equal(b.summary.cases, suite.cases.length);
  const fall = suite.cases.find((c) => c.id === "naming-schreibweise");
  const gesund = { jobId: "t", suiten: [{ suiteId: suite.suiteId, cases: [{ id: fall.id, runs: [{ text: "Der Name wird ausnahmslos smejj.com geschrieben.", latencyMs: 1, tokensOut: 5, error: null }, { text: "smejj.com", latencyMs: 1, tokensOut: 1, error: null }] }] }] };
  const g = await benoteAntworten({ ...suite, cases: [fall] }, gesund, "gesund");
  assert.equal(g.summary.weightedScore, 1);
  assert.equal(g.summary.wiederholungen, 2, "beide Durchgaenge muessen gezaehlt werden");
  await assert.rejects(benoteAntworten(suite, { suiten: [{ suiteId: "fremd", cases: [] }] }, "x"), /fehlt in den Antworten/);
});

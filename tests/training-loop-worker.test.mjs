import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  evalDauerSchaetzungMs,
  isTrainingLoopEnabled,
  loadLoopConfig,
  ZYKLUS_SICHERHEITSANTEIL
} from "../workers/smejj-training-loop/config.js";
import { defaultCheckpoint, readCheckpoint, writeCheckpoint } from "../workers/smejj-training-loop/checkpoint.js";
import { runEvalCycle } from "../workers/smejj-training-loop/evalCycle.js";
import { runTrainingCycle } from "../workers/smejj-training-loop/trainingCycle.js";
import { createLoop } from "../workers/smejj-training-loop/loop.js";
import { createServer, startTicking } from "../workers/smejj-training-loop/worker.mjs";
import { computeEvalSuiteSha256 } from "../src/evaluation/evalSuite.js";

function validSuite() {
  const suite = {
    schemaVersion: 1,
    suiteId: "unit-suite",
    version: "1.0.0",
    eligibleForTraining: false,
    budgets: { minScore: 0.5, latencyMsP95: 5000, firstTokenMs: 2000, maxCasesPerRun: 10 },
    integrity: { algorithm: "sha256", canonicalization: "json-key-sort-v1", contentSha256: "".padStart(64, "0") },
    cases: [
      {
        id: "case-1",
        profile: "coding",
        prompt: "hello",
        weight: 1,
        maxTokens: 100,
        assertions: [{ type: "contains_any", values: ["hi"] }]
      }
    ]
  };
  suite.integrity.contentSha256 = computeEvalSuiteSha256(suite);
  return suite;
}

test("config is fail-closed by default", () => {
  assert.equal(isTrainingLoopEnabled({}), false);
  assert.equal(isTrainingLoopEnabled({ SMEJJ_TRAINING_LOOP_ENABLED: "no" }), false);
  // Case-insensitive by design, matching the existing isCaptureEnabled convention
  // (src/training/constants.js) — this is intentional, not a gap.
  assert.equal(isTrainingLoopEnabled({ SMEJJ_TRAINING_LOOP_ENABLED: "yes" }), true);
  assert.equal(isTrainingLoopEnabled({ SMEJJ_TRAINING_LOOP_ENABLED: "YES" }), true);

  const config = loadLoopConfig({});
  assert.equal(config.loopEnabled, false);
  assert.equal(config.evalCycleEnabled, false);
  assert.equal(config.trainingCycleEnabled, false);
  assert.equal(config.port, 8080);
});

test("config bounds numeric env values instead of trusting them", () => {
  const config = loadLoopConfig({ PORT: "not-a-number", SMEJJ_TRAINING_LOOP_BATCH_SIZE: "999999" });
  assert.equal(config.port, 8080);
  assert.equal(config.trainingBatchSize, 50, "clamped to the declared max");
});

test("checkpoint: missing/invalid object falls back to defaults, never throws", async () => {
  const failing = async () => { throw new Error("idrive_get_404: not found"); };
  const checkpoint = await readCheckpoint({ key: "ops/x.json", idriveConfig: { idrive: {} }, request: failing });
  assert.deepEqual(checkpoint, defaultCheckpoint());
});

test("checkpoint: valid object merges over defaults", async () => {
  const stored = JSON.stringify({ lastEvalVerdict: "passed" });
  const request = async () => stored;
  const checkpoint = await readCheckpoint({ key: "ops/x.json", idriveConfig: { idrive: {} }, request });
  assert.equal(checkpoint.lastEvalVerdict, "passed");
  assert.equal(checkpoint.version, 1, "unset fields still come from defaults");
});

test("checkpoint: write failure is swallowed and reported as false, never thrown", async () => {
  const failing = async () => { throw new Error("network"); };
  const ok = await writeCheckpoint(defaultCheckpoint(), { key: "ops/x.json", idriveConfig: { idrive: {} }, request: failing });
  assert.equal(ok, false);
});

test("checkpoint: write success reports true", async () => {
  let putKey = null;
  const request = async (_config, method, key) => { putKey = key; assert.equal(method, "PUT"); return ""; };
  const ok = await writeCheckpoint(defaultCheckpoint(), { key: "ops/smejj-training-loop/checkpoint.json", idriveConfig: { idrive: {} }, request });
  assert.equal(ok, true);
  assert.equal(putKey, "ops/smejj-training-loop/checkpoint.json");
});

test("evalCycle: invalid suite is rejected before any model call", async () => {
  let called = false;
  const result = await runEvalCycle({
    repoRoot: "/repo",
    suitePath: "evals/suites/bad.json",
    readSuite: async () => ({ suiteId: "x" }), // missing required fields -> invalid
    callModel: async () => { called = true; return { ok: true, text: "x" }; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "suite_invalid");
  assert.equal(called, false);
});

test("evalCycle: happy path scores cases and writes exactly one report to the injected target", async () => {
  const suite = validSuite();
  let written = null;
  const result = await runEvalCycle({
    repoRoot: "/repo",
    suitePath: "evals/suites/unit-suite.json",
    reportTarget: "ops/smejj-training-loop/benchmarks/unit.json",
    delayMs: 0,
    readSuite: async () => suite,
    callModel: async () => ({ ok: true, text: "hi there", latencyMs: 10, backend: "control", modelId: "unit-model" }),
    writeReport: async (target, report) => { written = { target, report }; },
    now: () => new Date("2026-07-28T00:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(written.target, "ops/smejj-training-loop/benchmarks/unit.json");
  assert.equal(written.report.suite.suiteId, "unit-suite");
  assert.equal(written.report.run.live, true);
});

test("trainingCycle: one failing candidate does not stop the batch or throw", async () => {
  const listImpl = async () => ["training/queue/v1/a.json", "training/queue/v1/b.json"];
  const getPlan = async (_env, key) => ({ plan: { key } });
  const writePlan = async (plan) => {
    if (plan.key.endsWith("a.json")) throw new Error("stale_consent");
    return { written: [plan.key] };
  };
  const result = await runTrainingCycle({
    env: {},
    queuePrefix: "training/queue/v1/",
    batchSize: 5,
    resolvers: { resolveConsentDecision: async () => ({}), resolveVerificationEvidence: async () => ({}) },
    getPlan,
    listImpl,
    writePlan
  }).catch((error) => ({ threw: String(error) }));
  assert.equal(result.threw, undefined, "a single bad candidate must never throw out of the batch");
  assert.equal(result.attempted, 2);
  assert.equal(result.succeeded, 1);
  assert.deepEqual(result.processedKeys, ["training/queue/v1/b.json"]);
});

test("trainingCycle: already-processed keys are skipped, never re-attempted", async () => {
  const listImpl = async () => ["training/queue/v1/a.json", "training/queue/v1/b.json"];
  let attempts = 0;
  const result = await runTrainingCycle({
    env: {},
    queuePrefix: "training/queue/v1/",
    alreadyProcessed: ["training/queue/v1/a.json"],
    resolvers: { resolveConsentDecision: async () => ({}), resolveVerificationEvidence: async () => ({}) },
    getPlan: async (_env, key) => { attempts += 1; return { plan: { key } }; },
    listImpl,
    writePlan: async (plan) => ({ written: [plan.key] })
  });
  assert.equal(attempts, 1);
  assert.deepEqual(result.processedKeys.sort(), ["training/queue/v1/a.json", "training/queue/v1/b.json"]);
});

test("loop: tick() with both cycles disabled is a safe no-op", async () => {
  const config = loadLoopConfig({});
  const requests = [];
  const loop = createLoop({
    config,
    repoRoot: "/repo",
    log: () => {},
    deps: { checkpointRequest: async (_c, method) => { requests.push(method); return JSON.stringify({}); } }
  });
  const checkpoint = await loop.tick(() => new Date("2026-07-28T00:00:00.000Z"));
  assert.equal(checkpoint.lastEvalRunAt, null);
  assert.equal(checkpoint.lastTrainingRunAt, null);
  assert.equal(requests.includes("PUT"), false, "no cycle ran, so nothing changed, so no write");
  assert.equal(loop.getStatus().state, "running");
});

test("loop: due eval cycle runs, checkpoint advances, second immediate tick does not re-run", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_INTERVAL_MS: String(5 * 60 * 1000),
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000"
  });
  let checkpointStore = JSON.stringify({});
  let evalCalls = 0;
  const fakeIdriveEnv = {
    IDRIVE_E2_ENDPOINT: "https://example.invalid",
    IDRIVE_E2_BUCKET: "unit-bucket",
    IDRIVE_E2_REGION: "us-east-1",
    IDRIVE_E2_ACCESS_KEY: "unit-key",
    IDRIVE_E2_SECRET_KEY: "unit-secret"
  };
  const loop = createLoop({
    config,
    env: fakeIdriveEnv,
    repoRoot: "/repo",
    log: () => {},
    deps: {
      checkpointRequest: async (_c, method, _key, body) => {
        if (method === "GET") return checkpointStore;
        checkpointStore = body;
        return "";
      },
      callModel: async () => { evalCalls += 1; return { ok: true, text: "ok", latencyMs: 5 }; },
      writeReport: async () => {},
      readReport: async () => null,
      readSuite: async () => validSuite()
    }
  });
  const at = new Date("2026-07-28T00:00:00.000Z");
  await loop.tick(() => at);
  assert.equal(evalCalls > 0, true);

  const evalCallsAfterFirst = evalCalls;
  await loop.tick(() => new Date(at.getTime() + 1000)); // 1s later, well under the 5-minute interval
  assert.equal(evalCalls, evalCallsAfterFirst, "not due yet, must not run again");
});

test("loop: unerreichbare Ablage macht eine bezahlte Messung nicht wertlos", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000"
  });
  let checkpointStore = JSON.stringify({});
  const lines = [];
  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: (line) => lines.push(line),
    deps: {
      checkpointRequest: async (_c, method, _key, body) => {
        if (method === "GET") return checkpointStore;
        checkpointStore = body;
        return "";
      },
      callModel: async () => ({ ok: true, text: "hi there", latencyMs: 5 }),
      readReport: async () => null,
      readSuite: async () => validSuite(),
      // Ablage kaputt — genau der Zustand ohne gesetzte IDRIVE_E2_*-Variablen.
      writeReport: async () => { throw new Error("idrive_konfiguration_unvollstaendig"); }
    }
  });

  const checkpoint = await loop.tick(() => new Date("2026-07-28T00:00:00.000Z"));

  assert.equal(checkpoint.lastEvalRunAt, "2026-07-28T00:00:00.000Z", "die Messung gilt als gelaufen");
  assert.equal(checkpoint.consecutiveEvalFailures, 0, "eine reine Ablage-Stoerung ist kein Messfehler");
  assert.equal(checkpoint.lastEvalReportKey, null, "ohne Ablage gibt es keine Vergleichsbasis");

  const joined = lines.join("\n");
  assert.match(joined, /eval cycle done/, "Ergebnis wird gemeldet");
  assert.match(joined, /NICHT abgelegt/, "die Ablage-Stoerung wird ausdruecklich benannt");
  assert.match(joined, /IDRIVE_E2_/, "der Hinweis nennt die zu pruefenden Variablen");
  assert.equal(/laufzeit|score|Suite/i.test(joined), true, "die Kennzahlen selbst stehen im Protokoll");
});

// Livegang 2026-07-28: ohne Ablage lief der Eval-Zyklus bei JEDEM Tick erneut
// (readCheckpoint liefert dann immer Standardwerte). Das vervielfachte
// kostenpflichtige Modellaufrufe.
test("loop: ohne funktionierende Ablage haelt der Loop das Intervall trotzdem ein", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_INTERVAL_MS: String(6 * 60 * 60 * 1000),
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000"
  });
  let evalRuns = 0;
  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: () => {},
    deps: {
      // Ablage komplett tot — Lesen UND Schreiben scheitern.
      checkpointRequest: async () => { throw new Error("idrive_tot"); },
      callModel: async () => { evalRuns += 1; return { ok: true, text: "hi there", latencyMs: 5 }; },
      readReport: async () => null,
      readSuite: async () => validSuite(),
      writeReport: async () => { throw new Error("idrive_tot"); }
    }
  });

  const at = new Date("2026-07-28T00:00:00.000Z");
  await loop.tick(() => at);
  const nachErstemLauf = evalRuns;
  assert.equal(nachErstemLauf > 0, true, "der erste Lauf findet statt");

  // Drei weitere Ticks im 30-Sekunden-Takt — alle weit vor dem 6-Stunden-Intervall.
  for (const versatz of [30_000, 60_000, 90_000]) {
    await loop.tick(() => new Date(at.getTime() + versatz));
  }
  assert.equal(evalRuns, nachErstemLauf, "kein weiterer Lauf vor Ablauf des Intervalls");

  // Nach Ablauf des Intervalls darf wieder gemessen werden.
  await loop.tick(() => new Date(at.getTime() + 6 * 60 * 60 * 1000 + 1000));
  assert.equal(evalRuns > nachErstemLauf, true, "nach dem Intervall laeuft die Messung erneut");
});

test("loop: ein laufender Zyklus wird nicht parallel erneut gestartet", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000"
  });
  let gestartet = 0;
  let freigeben;
  const blockiert = new Promise((resolve) => { freigeben = resolve; });

  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: () => {},
    deps: {
      checkpointRequest: async () => JSON.stringify({}),
      readReport: async () => null,
      writeReport: async () => {},
      readSuite: async () => validSuite(),
      // Haelt den ersten Lauf offen, bis der zweite Tick versucht hat zu starten.
      callModel: async () => { gestartet += 1; await blockiert; return { ok: true, text: "hi there", latencyMs: 5 }; }
    }
  });

  const at = new Date("2026-07-28T00:00:00.000Z");
  const ersterTick = loop.tick(() => at);
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Der Takt feuert erneut, waehrend der erste Lauf noch haengt.
  await loop.tick(() => new Date(at.getTime() + 30_000));
  assert.equal(gestartet, 1, "der zweite Tick startet keinen zweiten Lauf");

  freigeben();
  await ersterTick;
});

// Dauerbetrieb: ein haengender Zyklus darf den Loop nicht dauerhaft anhalten.
// Ohne Waechter bliebe inFlight fuer immer gesetzt — der Dienst waere still tot.
test("loop: ein haengender Zyklus blockiert den Loop nicht dauerhaft", async () => {
  const basis = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000",
    SMEJJ_TRAINING_LOOP_TICK_MAX_MS: "60000"
  });
  assert.equal(basis.tickMaxMs, 60000, "die Obergrenze ist konfigurierbar");

  const lines = [];
  let modellaufrufe = 0;
  // Der Hänger wird am Ende kontrolliert freigegeben, damit der Testlauf
  // nicht selbst an einem offenen Versprechen haengenbleibt.
  let hangerLoesen;
  const hanger = new Promise((resolve) => { hangerLoesen = resolve; });

  const loop = createLoop({
    config: { ...basis, tickMaxMs: 40 },
    env: {},
    repoRoot: "/repo",
    log: (line) => lines.push(line),
    deps: {
      checkpointRequest: async () => JSON.stringify({}),
      readReport: async () => null,
      writeReport: async () => {},
      readSuite: async () => validSuite(),
      callModel: async () => { modellaufrufe += 1; await hanger; return { ok: true, text: "hi there", latencyMs: 5 }; }
    }
  });

  const at = new Date("2026-07-29T00:00:00.000Z");
  const haengenderTick = loop.tick(() => at);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(modellaufrufe, 1, "der erste Zyklus haengt im Modellaufruf");

  // Vor Ablauf der Obergrenze bleibt die Sperre bestehen.
  await loop.tick(() => new Date(at.getTime() + 5_000));
  assert.equal(modellaufrufe, 1, "vor Ablauf der Obergrenze kein zweiter Lauf");

  // Nach Ablauf gibt der Waechter frei und der Loop darf wieder anlaufen.
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.match(lines.join("\n"), /Sperre freigegeben/, "die Freigabe wird gemeldet");
  assert.equal(loop.getStatus().lastError, "zyklus_zeitueberschreitung", "der Zustand nennt die Ursache");

  // Nicht awaiten: dieser Tick wartet auf denselben Hänger, der erst danach
  // freigegeben wird — sonst verklemmt der Test sich selbst.
  const zweiterTick = loop.tick(() => new Date(at.getTime() + 10_000));
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(modellaufrufe, 2, "nach der Obergrenze laeuft der Loop wieder an");

  hangerLoesen();
  await Promise.allSettled([haengenderTick, zweiterTick]);
});

test("worker: Takt-Geber wird NICHT unref'ed — er haelt den Dauerbetrieb", () => {
  const config = loadLoopConfig({ SMEJJ_TRAINING_LOOP_ENABLED: "YES" });
  let unrefAufgerufen = false;
  const fakeTimer = { unref: () => { unrefAufgerufen = true; } };
  const loop = { tick: async () => ({}), getStatus: () => ({}) };

  startTicking(loop, { config, log: () => {}, setIntervalImpl: () => fakeTimer });
  assert.equal(unrefAufgerufen, false, "im Betrieb darf der Timer die Ereignisschleife halten");

  startTicking(loop, { config, log: () => {}, setIntervalImpl: () => fakeTimer, unrefTimer: true });
  assert.equal(unrefAufgerufen, true, "nur Tests duerfen ihn freigeben");
});

test("worker: /health answers even when the loop is disabled (fail-closed but observable)", async () => {
  const config = loadLoopConfig({});
  const loop = createLoop({ config, repoRoot: "/repo", log: () => {} });
  const timer = startTicking(loop, { config, log: () => {} });
  assert.equal(timer, null, "disabled loop must not schedule a timer");

  const server = createServer({ config, loop });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const body = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(data) }));
    }).on("error", reject);
  });
  assert.equal(body.status, 200);
  assert.equal(body.json.loopEnabled, false);
  server.close();
});

test("loop: Verlauf haelt die Kennzahlen fest, AUCH wenn die Ablage nicht erreichbar ist", async () => {
  // Der Kern der Sache: ohne Zugangsdaten fuer die Ablage gehen die vollen
  // Berichte verloren, der TREND darf aber nicht verloren gehen.
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_INTERVAL_MS: String(5 * 60 * 1000),
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000"
  });
  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: () => {},
    deps: {
      checkpointRequest: async () => { throw new Error("Ablage nicht erreichbar"); },
      callModel: async () => ({ ok: true, text: "hi", latencyMs: 7 }),
      writeReport: async () => { throw new Error("Invalid URL"); },
      readReport: async () => null,
      readSuite: async () => validSuite()
    }
  });
  await loop.tick(() => new Date("2026-07-29T00:00:00.000Z"));

  const verlauf = loop.getVerlauf();
  assert.equal(verlauf.length, 1, "die Messung steht im Verlauf, obwohl das Ablegen scheiterte");
  assert.equal(verlauf[0].abgelegt, false, "und ist ehrlich als nicht abgelegt markiert");
  assert.equal(typeof verlauf[0].punktzahl, "number");
  assert.equal(verlauf[0].faelle, 1);
  assert.equal(verlauf[0].bestanden, 1);
  assert.equal(loop.getStatus().verlaufAnzahl, 1);
});

test("loop: Verlauf ist begrenzt — im Dauerbetrieb kein wachsender Speicher", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_INTERVAL_MS: String(5 * 60 * 1000),
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000",
    SMEJJ_TRAINING_LOOP_VERLAUF_MAX: "3",
    // Hier geht es um die Begrenzung der Liste, nicht um Wiederholungen — eine
    // Ziehung je Fall haelt den Testlauf kurz.
    SMEJJ_EVAL_WIEDERHOLUNGEN: "1"
  });
  assert.equal(config.verlaufMax, 3);
  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: () => {},
    deps: {
      checkpointRequest: async () => { throw new Error("keine Ablage"); },
      callModel: async () => ({ ok: true, text: "hi", latencyMs: 7 }),
      writeReport: async () => {},
      readReport: async () => null,
      readSuite: async () => validSuite()
    }
  });
  const start = new Date("2026-07-29T00:00:00.000Z").getTime();
  for (let i = 0; i < 5; i += 1) {
    await loop.tick(() => new Date(start + i * 10 * 60 * 1000));
  }
  const verlauf = loop.getVerlauf();
  assert.equal(verlauf.length, 3, "aelteste Eintraege fallen heraus, die Liste waechst nicht");
  assert.equal(verlauf[0].zeitpunkt < verlauf[2].zeitpunkt, true, "Reihenfolge bleibt alt -> neu");
});

test("worker: /verlauf liefert die Kennzahlen und keine Prompts oder Antworten", async () => {
  const config = loadLoopConfig({});
  const loop = {
    getStatus: () => ({ state: "running", verlaufAnzahl: 1 }),
    getVerlauf: () => ([{ zeitpunkt: "2026-07-29T00:00:00.000Z", urteil: "blocked", punktzahl: 0.912, faelle: 14, bestanden: 13, abgelegt: false }])
  };
  const server = createServer({ config, loop });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const body = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/verlauf`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, raw: data, json: JSON.parse(data) }));
    }).on("error", reject);
  });
  assert.equal(body.status, 200);
  assert.equal(body.json.anzahl, 1);
  assert.equal(body.json.verlauf[0].punktzahl, 0.912);
  // Datenschutz-Zusicherung, nicht nur Absicht: der Endpunkt darf niemals
  // Eingaben oder Modellantworten preisgeben.
  assert.equal(/prompt|answer|text|IDRIVE|SECRET/i.test(body.raw), false);
  server.close();
});

test("config: Wiederholungen je Fall sind einstellbar und begrenzt", () => {
  assert.equal(loadLoopConfig({}).evalWiederholungen, 3, "Standard: drei Ziehungen je Fall");
  assert.equal(loadLoopConfig({ SMEJJ_EVAL_WIEDERHOLUNGEN: "1" }).evalWiederholungen, 1, "Rueckfallebene");
  assert.equal(loadLoopConfig({ SMEJJ_EVAL_WIEDERHOLUNGEN: "7" }).evalWiederholungen, 7);
  assert.equal(loadLoopConfig({ SMEJJ_EVAL_WIEDERHOLUNGEN: "99" }).evalWiederholungen, 10, "auf den Bereich begrenzt");
  assert.equal(loadLoopConfig({ SMEJJ_EVAL_WIEDERHOLUNGEN: "viel" }).evalWiederholungen, 3);
});

test("config: die Dauer eines Zyklus bleibt nachrechenbar", () => {
  // Die Rechnung aus dem Auftrag: 14 Faelle, 3 Wiederholungen, 6000 ms Abstand.
  assert.equal(evalDauerSchaetzungMs({ faelle: 14, wiederholungen: 3, delayMs: 6000 }), 252_000);
  assert.ok(evalDauerSchaetzungMs({ faelle: 14, wiederholungen: 3, delayMs: 6000 }) < loadLoopConfig({}).tickMaxMs,
    "rund 4 Minuten gegen 15 Minuten Limit — das passt");
  // Bei 10 Wiederholungen sind allein die Abstaende 14 von 15 Minuten. Die
  // Schaetzung bleibt formal unter dem Limit — in Wirklichkeit laeuft der Zyklus
  // in den Abbruch, weil 140 Antwortzeiten obendrauf kommen. Deshalb wird schon
  // ab ZYKLUS_SICHERHEITSANTEIL gewarnt und nicht erst am harten Limit.
  const zehn = evalDauerSchaetzungMs({ faelle: 14, wiederholungen: 10, delayMs: 6000 });
  const limit = loadLoopConfig({}).tickMaxMs;
  assert.equal(zehn, 840_000);
  assert.ok(zehn < limit, "die reine Abstandsrechnung taeuscht Sicherheit vor");
  assert.ok(zehn >= limit * ZYKLUS_SICHERHEITSANTEIL, "die Warnschwelle greift trotzdem");
});

test("evalCycle: warnt, bevor ein Zyklus in den Abbruch laeuft", async () => {
  const meldungen = [];
  await runEvalCycle({
    repoRoot: "/repo",
    suitePath: "evals/suites/unit-suite.json",
    reportTarget: "ops/unit.json",
    // Gleiche Rechnung, nur in Millisekunden statt Minuten: der Test darf die
    // Wartezeit pruefen, ohne sie abzuwarten.
    delayMs: 1,
    wiederholungen: 10,
    tickMaxMs: 5,
    readSuite: async () => validSuite(),
    callModel: async () => ({ ok: true, text: "hi", latencyMs: 5 }),
    writeReport: async () => {},
    log: (zeile) => meldungen.push(zeile),
    now: () => new Date("2026-07-31T00:00:00.000Z")
  });
  assert.match(meldungen.join(" "), /WARNUNG: geschaetzte Zyklusdauer/);
  assert.match(meldungen.join(" "), /SMEJJ_EVAL_WIEDERHOLUNGEN senken/);
});

test("evalCycle: Wiederholungen fuehren zu Quoten in den Kennzahlen", async () => {
  let aufrufe = 0;
  const result = await runEvalCycle({
    repoRoot: "/repo",
    suitePath: "evals/suites/unit-suite.json",
    reportTarget: "ops/unit.json",
    delayMs: 0,
    wiederholungen: 4,
    readSuite: async () => validSuite(),
    // Zwei von vier Ziehungen bestehen — ein wackeliger Fall.
    callModel: async () => {
      aufrufe += 1;
      return { ok: true, text: aufrufe % 2 === 0 ? "hi there" : "nope", latencyMs: 10 };
    },
    writeReport: async () => {},
    now: () => new Date("2026-07-31T00:00:00.000Z")
  });
  assert.equal(aufrufe, 4, "ein Fall, vier Ziehungen");
  assert.equal(result.kennzahlen.wiederholungen, 4);
  assert.equal(result.kennzahlen.wackelig, 1);
  assert.deepEqual(result.kennzahlen.wackeligeFaelle, [{ fall: "case-1", quote: 0.5, bestanden: 2, laeufe: 4 }]);
  assert.equal(result.kennzahlen.punktzahl, 0.5, "die Quote ist die Punktzahl, keine Einzelziehung");
});

test("evalCycle: ein Vorlauf aus dem Checkpoint mit anderer Messart wird verworfen", async () => {
  // Der Loop reicht seinen Vorlauf am findBaselineReport vorbei herein. Ohne
  // diese Pruefung meldete die erste Messung nach einer Aenderung von
  // SMEJJ_EVAL_WIEDERHOLUNGEN eine Regression, die keine ist.
  const alterVorlauf = {
    suite: { suiteId: "unit-suite", contentSha256: "x" },
    run: { modelId: "live-default", live: true },
    summary: { weightedScore: 1, wiederholungen: 1, criticalFailures: 0, latencyMsP95: 5 }
  };
  const lauf = async (wiederholungen) => runEvalCycle({
    repoRoot: "/repo",
    suitePath: "evals/suites/unit-suite.json",
    reportTarget: "ops/unit.json",
    delayMs: 0,
    wiederholungen,
    baseline: alterVorlauf,
    readSuite: async () => validSuite(),
    callModel: async () => ({ ok: true, text: "nope", latencyMs: 10 }),
    writeReport: async (_t, report) => { zuletzt = report; },
    now: () => new Date("2026-07-31T00:00:00.000Z")
  });
  let zuletzt = null;
  await lauf(1);
  assert.equal(zuletzt.comparison.hasBaseline, true, "gleiche Messart: der Vorlauf zaehlt");
  await lauf(3);
  assert.equal(zuletzt.comparison.hasBaseline, false, "andere Messart: kein Vergleich statt eines falschen");
});

test("loop: der Verlauf und das Protokoll fuehren die Quoten mit", async () => {
  const config = loadLoopConfig({
    SMEJJ_TRAINING_LOOP_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_ENABLED: "YES",
    SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS: "1000",
    SMEJJ_EVAL_WIEDERHOLUNGEN: "2"
  });
  assert.equal(config.evalWiederholungen, 2);
  const zeilen = [];
  let aufrufe = 0;
  const loop = createLoop({
    config,
    env: {},
    repoRoot: "/repo",
    log: (zeile) => zeilen.push(zeile),
    deps: {
      checkpointRequest: async () => { throw new Error("keine Ablage"); },
      callModel: async () => {
        aufrufe += 1;
        return { ok: true, text: aufrufe === 1 ? "hi there" : "nope", latencyMs: 7 };
      },
      writeReport: async () => {},
      readReport: async () => null,
      readSuite: async () => validSuite()
    }
  });
  await loop.tick(() => new Date("2026-07-31T00:00:00.000Z"));

  const verlauf = loop.getVerlauf();
  assert.equal(verlauf[0].wiederholungen, 2);
  assert.equal(verlauf[0].wackelig, 1);
  assert.deepEqual(verlauf[0].wackeligeFaelle, [{ fall: "case-1", quote: 0.5, bestanden: 1, laeufe: 2 }]);
  // Selbst wenn nur die Zeabur-Protokolle uebrig sind, muss `grep` den Trend UND
  // die Erklaerung dafuer herausziehen koennen.
  const protokoll = zeilen.join("\n");
  assert.match(protokoll, /VERLAUF .*wiederholungen=2 wackelig=1/);
  assert.match(protokoll, /WACKELIG case-1=1\/2/);
  assert.match(protokoll, /Wackelige Faelle: 1 — case-1 50 %/);
});

test("config: Messweg ist per Umgebungswert umstellbar, Standard bleibt die Schnellspur", () => {
  assert.equal(loadLoopConfig({}).chatEndpoint, "https://smejj-chat-bridge.zeabur.app/api/chat");
  assert.equal(
    loadLoopConfig({ SMEJJ_EVAL_CHAT_ENDPOINT: "https://smejj-control.zeabur.app/api/chat" }).chatEndpoint,
    "https://smejj-control.zeabur.app/api/chat"
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { isTrainingLoopEnabled, loadLoopConfig } from "../workers/smejj-training-loop/config.js";
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

import test from "node:test";
import assert from "node:assert/strict";
import { loadTestWorkerConfig, runTestWorker, sanitizeCommands } from "../worker-templates/test/worker.js";
import { controlConfigFromEnv, reportStatus } from "../worker-templates/shared/controlClient.js";
import { e2ConfigFromEnv } from "../worker-templates/shared/e2Client.js";
import { WORKER_SIGNATURE_HEADER, WORKER_TIMESTAMP_HEADER, verifyWorkerSignature } from "../control-server/src/auth/workerAuth.js";

const FULL_ENV = {
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_BUCKET: "bucket",
  IDRIVE_E2_ACCESS_KEY: "ak",
  IDRIVE_E2_SECRET_KEY: "sk",
  SMEJJ_CONTROL_ROUTER_URL: "http://127.0.0.1:3000",
  SMEJJ_WORKER_CALLBACK_SECRET: "secret",
  SMEJJ_JOB_ID: "job_wt_1",
  SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/07/02/aa/job_wt_1"
};

function harness({ input, execCode = 0 } = {}) {
  const written = {};
  const reports = [];
  return {
    written,
    reports,
    io: {
      async getJson() {
        if (input instanceof Error) throw input;
        return input;
      },
      async putJson(_e2, key, value) { written[key] = value; return { ok: true, key }; }
    },
    report: async ({ status, message }) => { reports.push({ status, message }); return { ok: true, status: 200 }; },
    exec: async (parts) => ({ code: execCode, stdout: `ran ${parts.join(" ")}`, stderr: "" })
  };
}

test("config loaders are fail-closed and normalize the capsule prefix", () => {
  assert.equal(e2ConfigFromEnv({}).ok, false);
  assert.equal(controlConfigFromEnv({}).ok, false);
  const bad = loadTestWorkerConfig({});
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.includes("SMEJJ_JOB_ID"));
  const good = loadTestWorkerConfig(FULL_ENV);
  assert.equal(good.ok, true);
  assert.equal(good.capsulePrefix, "jobs/2026/07/02/aa/job_wt_1/");
});

test("sanitizeCommands whitelists binaries and blocks shell metacharacters", () => {
  const safe = sanitizeCommands(["node --test tests/a.test.mjs", "npm run check", "rm -rf /", "node -e `evil`", "curl http://x"]);
  assert.deepEqual(safe.map((parts) => parts[0]), ["node", "npm"]);
});

test("runTestWorker happy path: claims capsule, runs commands, persists results, reports passed", async () => {
  const config = loadTestWorkerConfig(FULL_ENV);
  const h = harness({ input: { verificationCommands: ["node --test", "npm run check"] } });
  const result = await runTestWorker(config, h);

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
  assert.deepEqual(h.reports.map((r) => r.status), ["running", "verifying", "passed"]);
  const summary = h.written["jobs/2026/07/02/aa/job_wt_1/test-results.json"];
  assert.equal(summary.ok, true);
  assert.equal(summary.commandsRun, 2);
  assert.equal(summary.stateless, true);
  assert.equal(h.written["jobs/2026/07/02/aa/job_wt_1/status.json"].status, "passed");
});

test("runTestWorker failure path: failing command stops the run and reports failed", async () => {
  const config = loadTestWorkerConfig(FULL_ENV);
  const h = harness({ input: { verificationCommands: ["node --test", "npm run check"] }, execCode: 1 });
  const result = await runTestWorker(config, h);

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.deepEqual(h.reports.map((r) => r.status), ["running", "verifying", "failed"]);
  const summary = h.written["jobs/2026/07/02/aa/job_wt_1/test-results.json"];
  assert.equal(summary.ok, false);
  assert.equal(summary.commandsRun, 1);
});

test("runTestWorker reports failed when capsule input is unreadable or has no allowed commands", async () => {
  const config = loadTestWorkerConfig(FULL_ENV);

  const broken = harness({ input: new Error("404") });
  const claimResult = await runTestWorker(config, broken);
  assert.equal(claimResult.stage, "claim");
  assert.deepEqual(broken.reports.map((r) => r.status), ["failed"]);

  const empty = harness({ input: { verificationCommands: ["curl evil"] } });
  const planResult = await runTestWorker(config, empty);
  assert.equal(planResult.reason, "no_allowed_verification_commands");
  assert.deepEqual(empty.reports.map((r) => r.status), ["running", "failed"]);
});

test("reportStatus signs callbacks so the control server accepts them", async () => {
  const control = controlConfigFromEnv(FULL_ENV);
  let captured;
  await reportStatus({
    control,
    jobId: "job_wt_1",
    status: "running",
    message: "hello",
    nowMs: 1_700_000_000_000,
    fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, status: 200 }; }
  });

  assert.equal(captured.url, "http://127.0.0.1:3000/api/jobs/job_wt_1/status");
  const verdict = verifyWorkerSignature({
    env: { SMEJJ_WORKER_CALLBACK_SECRET: "secret" },
    headers: {
      [WORKER_SIGNATURE_HEADER]: captured.options.headers[WORKER_SIGNATURE_HEADER],
      [WORKER_TIMESTAMP_HEADER]: captured.options.headers[WORKER_TIMESTAMP_HEADER]
    },
    rawBody: captured.options.body,
    nowMs: 1_700_000_000_000
  });
  assert.equal(verdict.ok, true);
});

test("reportStatus skips silently but honestly when control config is incomplete", async () => {
  const result = await reportStatus({ control: controlConfigFromEnv({}), jobId: "x", status: "running" });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});

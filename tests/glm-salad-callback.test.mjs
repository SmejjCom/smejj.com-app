import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkerConfig, processTaskCapsule } from "../workers/glm-salad/worker.js";
import { reportStatus } from "../worker-templates/shared/controlClient.js";

const ENV = {
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_BUCKET: "bucket",
  IDRIVE_E2_ACCESS_KEY: "ak",
  IDRIVE_E2_SECRET_KEY: "sk",
  SMEJJ_JOB_ID: "job_glm_cb_1",
  SMEJJ_PROJECT_ID: "project_smejj",
  SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/07/02/ab/job_glm_cb_1/",
  SMEJJ_CONTROL_ROUTER_URL: "http://127.0.0.1:3000",
  SMEJJ_WORKER_CALLBACK_SECRET: "cb_secret"
};

function fakeIo() {
  const written = {};
  return {
    written,
    async getJson() { return { task: "demo", verification: { commands: [] } }; },
    async putJson(_config, key, value) { written[key] = value; return { ok: true }; },
    async putText(_config, key, value) { written[key] = value; return { ok: true }; },
    async putBinary(_config, key, value) { written[key] = value; return { ok: true }; }
  };
}

test("loadWorkerConfig exposes callback config from env", () => {
  const config = loadWorkerConfig(ENV);
  assert.equal(config.callback.ok, true);
  assert.equal(config.callback.controlUrl, "http://127.0.0.1:3000");
  const without = loadWorkerConfig({ ...ENV, SMEJJ_WORKER_CALLBACK_SECRET: "" });
  assert.equal(without.callback.ok, false);
});

test("processTaskCapsule reports running and final status via injected reporter", async () => {
  const config = loadWorkerConfig(ENV);
  const reports = [];
  const report = async ({ control, jobId, status }) => { reports.push({ ok: control?.ok, jobId, status }); return { ok: true }; };
  const result = await processTaskCapsule(config, fakeIo(), report);

  assert.equal(reports.length, 2);
  assert.equal(reports[0].status, "running");
  assert.equal(reports[0].jobId, "job_glm_cb_1");
  assert.equal(reports[0].ok, true);
  assert.ok(["done", "failed"].includes(reports[1].status));
  assert.equal(reports[1].status, result.ok ? "done" : "failed");
});

test("callback failure never breaks the capsule flow (reportStatus catches network errors)", async () => {
  const control = { ok: true, controlUrl: "http://127.0.0.1:9", secret: "s" };
  const result = await reportStatus({
    control,
    jobId: "x",
    status: "running",
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "control_unreachable");
});

test("default reporter skips gracefully when callback env is missing (existing behavior preserved)", async () => {
  const config = loadWorkerConfig({ ...ENV, SMEJJ_WORKER_CALLBACK_SECRET: "", SMEJJ_CONTROL_ROUTER_URL: "" });
  const result = await processTaskCapsule(config, fakeIo());
  assert.ok(result.written.includes("jobs/2026/07/02/ab/job_glm_cb_1/status.json"));
});

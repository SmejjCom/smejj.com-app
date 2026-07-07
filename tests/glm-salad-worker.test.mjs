import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimeCommand,
  buildWorkerPreflight,
  loadWorkerConfig,
  processTaskCapsule,
  runWorkerTask
} from "../workers/glm-salad/worker.js";

test("GLM Salad worker preflight requires IDrive object brain config", () => {
  const config = loadWorkerConfig({});
  const preflight = buildWorkerPreflight(config);
  assert.equal(preflight.ok, false);
  assert.equal(preflight.role, "glm-5.2-worker");
  assert.equal(preflight.serverRole, "control-router-only");
  assert.equal(preflight.idriveRole, "object-brain");
  assert.equal(preflight.workerRole, "compute-only");
  assert.ok(preflight.reasons.includes("idrive_endpoint_missing"));
});

test("GLM Salad worker preflight accepts safe Task Capsule and model prefix", () => {
  const config = loadWorkerConfig({
    IDRIVE_E2_ENDPOINT: "https://s3.example.test",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_BUCKET: "bucket",
    IDRIVE_E2_ACCESS_KEY: "access",
    IDRIVE_E2_SECRET_KEY: "secret",
    SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_001/",
    GLM_5_2_FP8_PREFIX: "model-files/glm-5-2-fp8/original/"
  });
  const preflight = buildWorkerPreflight(config);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.secretsExposed, false);
});

test("GLM Salad worker chooses runtime command order candidates", () => {
  const sglang = buildRuntimeCommand(loadWorkerConfig({ SMEJJ_GLM_RUNTIME: "sglang" }));
  assert.equal(sglang[0], "python3");
  assert.ok(sglang[1].includes("sglang.launch_server"));

  const vllm = buildRuntimeCommand(loadWorkerConfig({ SMEJJ_GLM_RUNTIME: "vllm" }));
  assert.ok(vllm[1].includes("vllm.entrypoints.openai.api_server"));

  const ktransformers = buildRuntimeCommand(loadWorkerConfig({ SMEJJ_GLM_RUNTIME: "ktransformers" }));
  assert.ok(ktransformers[1].includes("ktransformers.server.main"));
});

test("GLM Salad worker processes Task Capsule through IDrive IO abstraction", async () => {
  const config = loadWorkerConfig({
    IDRIVE_E2_ENDPOINT: "https://s3.example.test",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_BUCKET: "bucket",
    IDRIVE_E2_ACCESS_KEY: "access",
    IDRIVE_E2_SECRET_KEY: "secret",
    SMEJJ_JOB_ID: "job_test_001",
    SMEJJ_PROJECT_ID: "project_smejj",
    SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_001/"
  });
  const writes = new Map();
  const io = {
    async getJson(_config, key) {
      assert.equal(key, "jobs/2026/06/26/aa/job_test_001/input.json");
      return { task: "Build the GLM worker", model: { id: "glm-5-2" } };
    },
    async putJson(_config, key, value) {
      writes.set(key, value);
    },
    async putText(_config, key, value) {
      writes.set(key, value);
    }
  };
  const result = await processTaskCapsule(config, io);
  assert.equal(result.ok, true);
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/status.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/test-results.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/browser-results.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/errors.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/self-fix-attempts.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/benchmark-results.json"));
  assert.ok(writes.has("jobs/2026/06/26/aa/job_test_001/final-report.md"));
  assert.ok(writes.has("jobs/running/job_test_001.json"));
  assert.ok(writes.has("jobs/done/job_test_001.json"));
  assert.ok(writes.has("projects/project_smejj/jobs/running/job_test_001.json"));
  assert.ok(writes.has("projects/project_smejj/jobs/done/job_test_001.json"));
  assert.ok(writes.has("projects/project_smejj/solved-errors/job_test_001.json"));
  assert.equal(writes.get("jobs/2026/06/26/aa/job_test_001/memory-update.json").learn, true);
  assert.equal(writes.get("projects/project_smejj/solved-errors/job_test_001.json").learnOnlyBecause, "verified_worker_success");
});

test("GLM Salad worker writes browser screenshot objects from evidence", async () => {
  const config = loadWorkerConfig({
    IDRIVE_E2_ENDPOINT: "https://s3.example.test",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_BUCKET: "bucket",
    IDRIVE_E2_ACCESS_KEY: "access",
    IDRIVE_E2_SECRET_KEY: "secret",
    SMEJJ_JOB_ID: "job_test_screenshot",
    SMEJJ_PROJECT_ID: "project_smejj",
    SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_screenshot/"
  });
  const writes = new Map();
  const bytes = new Map();
  const io = {
    async getJson(_config, key) {
      assert.equal(key, "jobs/2026/06/26/aa/job_test_screenshot/input.json");
      return {
        task: "Fix UI with screenshot evidence",
        uiChange: true,
        browserResults: {
          ok: true,
          runner: "worker-playwright",
          screenshotObjects: [
            {
              key: "jobs/2026/06/26/aa/job_test_screenshot/browser-screenshots/desktop.png",
              contentType: "image/png",
              bodyBase64: Buffer.from("png").toString("base64")
            }
          ]
        }
      };
    },
    async putJson(_config, key, value) {
      writes.set(key, value);
    },
    async putText(_config, key, value) {
      writes.set(key, value);
    },
    async putBytes(_config, key, value, contentType) {
      bytes.set(key, { value, contentType });
    }
  };
  const result = await processTaskCapsule(config, io);
  assert.equal(result.ok, true);
  assert.ok(bytes.has("jobs/2026/06/26/aa/job_test_screenshot/browser-screenshots/desktop.png"));
  assert.equal(bytes.get("jobs/2026/06/26/aa/job_test_screenshot/browser-screenshots/desktop.png").contentType, "image/png");
});

test("GLM Salad worker verifier blocks empty Task Capsule input", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_002/" });
  const result = await runWorkerTask(config, { task: "" });
  assert.equal(result.ok, false);
  assert.equal(result.memoryUpdate.learn, false);
  assert.ok(result.testResults.checks.some((check) => check.name === "task-capsule-input-readable" && check.ok === false));
  assert.ok(result.errors.errors.some((error) => error.name === "task-capsule-input-readable"));
});

test("GLM Salad worker blocks UI tasks without browser evidence", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_003/" });
  const result = await runWorkerTask(config, { task: "Fix frontend button layout", uiChange: true });
  assert.equal(result.ok, false);
  assert.equal(result.browserResults.required, true);
  assert.equal(result.browserResults.status, "blocked");
  assert.equal(result.memoryUpdate.learn, false);
});

test("GLM Salad worker accepts static browser evidence for UI tasks", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_004/" });
  const result = await runWorkerTask(config, {
    task: "Fix frontend button layout",
    uiChange: true,
    browserHtml: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body><button>OK</button></body></html>"
  });
  assert.equal(result.ok, true);
  assert.equal(result.browserResults.required, true);
  assert.equal(result.browserResults.status, "passed");
  assert.equal(result.selfFixAttempts.maxAttempts, 3);
  assert.equal(result.benchmarkResults.metrics.some((metric) => metric.name === "browser_required" && metric.value === 1), true);
});

test("GLM Salad worker blocks Playwright mode when Playwright is unavailable", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_playwright_missing/" });
  const result = await runWorkerTask(config, {
    task: "Fix frontend button layout",
    uiChange: true,
    browserRunner: "playwright",
    browserUrl: "http://127.0.0.1:39999/"
  });
  assert.equal(result.ok, false);
  assert.equal(result.browserResults.status === "blocked" || result.browserResults.status === "failed", true);
  assert.equal(result.memoryUpdate.learn, false);
});

test("GLM Salad worker records capped self-fix attempts", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_005/" });
  const result = await runWorkerTask(config, {
    task: "Repair failing tests",
    selfFixPlan: {
      attempts: [
        { errorSignature: "test_a", patchKey: "patches/1.diff" },
        { errorSignature: "test_b", patchKey: "patches/2.diff", ok: true }
      ]
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.selfFixAttempts.attempts.length, 2);
  assert.equal(result.selfFixAttempts.stoppedBecause, "verification_passed_after_self_fix");
  assert.equal(result.memoryEntry.value.selfFix.attempts, 2);
});

test("GLM Salad worker verifies patch plan in isolated workspace contract", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_006/" });
  const result = await runWorkerTask(config, {
    task: "Patch one file",
    patchPlan: {
      files: [
        { path: "src/example.js", before: "export const value = 1;\n", after: "export const value = 2;\n" }
      ]
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.testResults.patch.status, "isolated_patch_plan_verified");
  assert.equal(result.testResults.patch.rollback[0].path, "src/example.js");
  assert.equal(result.memoryEntry.value.patch.files[0].path, "src/example.js");
});

test("GLM Salad worker blocks unsafe patch paths", async () => {
  const config = loadWorkerConfig({ SMEJJ_TASK_CAPSULE_PREFIX: "jobs/2026/06/26/aa/job_test_007/" });
  const result = await runWorkerTask(config, {
    task: "Patch unsafe file",
    patchPlan: {
      files: [
        { path: "../secret.js", before: "a", after: "b" }
      ]
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.memoryUpdate.learn, false);
  assert.equal(result.memoryEntry, null);
  assert.equal(result.testResults.patch.status, "failed");
  assert.ok(result.errors.errors.some((error) => error.name === "patch-isolated-workspace"));
});

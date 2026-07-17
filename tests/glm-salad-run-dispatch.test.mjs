import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { buildHttpDispatch } from "../control-server/src/orchestrator/autonomousRunner.js";
import { createServer, handleRunDispatch, loadWorkerConfig } from "../workers/glm-salad/worker.js";

const WORKER_ENV = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.test",
  IDRIVE_E2_REGION: "us-west-2",
  IDRIVE_E2_BUCKET: "bucket",
  IDRIVE_E2_ACCESS_KEY: "access",
  IDRIVE_E2_SECRET_KEY: "secret",
  SMEJJ_WORKER_MODE: "planner-vault",
  SMEJJ_JOB_ID: "job_dispatch_test",
  GLM_5_2_FP8_PREFIX: "model-files/glm-5-2-fp8/original/"
};

test("run dispatch rejects invalid JSON without crashing", async () => {
  const config = loadWorkerConfig(WORKER_ENV);
  const result = await handleRunDispatch(config, "{kaputt");
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].detail, "invalid_json");
  assert.equal(result.memoryUpdate, null);
});

test("run dispatch rejects missing task fail-closed", async () => {
  const config = loadWorkerConfig(WORKER_ENV);
  const result = await handleRunDispatch(config, JSON.stringify({ jobId: "job_x", attempt: 1 }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].detail, "missing_task");
});

test("run dispatch fulfils the orchestrator contract for a planner task", async () => {
  const config = loadWorkerConfig(WORKER_ENV);
  const result = await handleRunDispatch(config, JSON.stringify({
    jobId: "job_contract",
    attempt: 2,
    maxAttempts: 3,
    task: "Plan a small refactoring",
    previousErrors: [{ source: "verification", detail: "tests_failed" }]
  }));
  assert.equal(typeof result.ok, "boolean");
  assert.equal(result.jobId, "job_contract");
  assert.equal(result.attempt, 2);
  assert.equal(result.maxAttempts, 3);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.memoryUpdate === null || typeof result.memoryUpdate === "object");
  if (result.ok) {
    assert.equal(result.errors.length, 0);
    assert.equal(result.memoryUpdate.learn, false);
    assert.equal(result.memoryUpdate.state, "legacy-worker-memory-denied");
  }
});

function fakeRunRequest(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = "POST";
  req.url = "/run";
  req.headers = { "content-type": "application/json" };
  return req;
}

function fakeRunResponse() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    end(body) { if (body) this.chunks.push(String(body)); }
  };
}

async function callRunHandler(server, body) {
  const res = fakeRunResponse();
  await server.listeners("request")[0](fakeRunRequest(body), res);
  return JSON.parse(res.chunks.join(""));
}

test("run dispatch works end-to-end through the worker /run handler", async () => {
  const config = loadWorkerConfig(WORKER_ENV);
  const server = createServer(config);
  const dispatch = buildHttpDispatch({
    SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:8080/run",
    SMEJJ_WORKER_TOKEN_SECRET: "test-worker-secret"
  });
  assert.ok(dispatch, "dispatcher should be built from a valid URL");

  const outcome = await callRunHandler(server, {
    jobId: "job_http",
    attempt: 1,
    maxAttempts: 3,
    task: "Verify http dispatch path",
    previousErrors: []
  });
  assert.equal(typeof outcome.ok, "boolean");
  assert.ok(Array.isArray(outcome.errors));
  assert.equal(outcome.jobId, "job_http");

  const missingTask = await callRunHandler(server, { jobId: "job_http2", attempt: 1, maxAttempts: 3, task: "", previousErrors: [] });
  assert.equal(missingTask.ok, false);
  assert.equal(missingTask.errors[0].detail, "missing_task");
});

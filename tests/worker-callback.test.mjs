import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CLOCK_SKEW_MS,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  signWorkerPayload,
  verifyWorkerSignature
} from "../control-server/src/auth/workerAuth.js";
import { handleWorkerStatusUpdate } from "../control-server/src/routes/jobRoutes.js";
import { activeWorkerCount, clearJobs, getJob, saveJob, subscribeToJob } from "../control-server/src/jobs/jobStore.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";

const SECRET = "test_worker_secret";
const NOW_MS = Date.parse("2026-07-02T12:00:00Z");

function fakeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

function signedReq(rawBody, { secret = SECRET, timestamp = NOW_MS, signature } = {}) {
  const headers = {
    [WORKER_TIMESTAMP_HEADER]: String(timestamp),
    [WORKER_SIGNATURE_HEADER]: signature ?? signWorkerPayload(secret, timestamp, rawBody)
  };
  return {
    headers,
    on(event, fn) {
      if (event === "data") setImmediate(() => fn(rawBody));
      if (event === "end") setImmediate(() => fn());
    }
  };
}

function seedJob(jobId) {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId, projectId: "project_smejj", task: "callback test" },
    env: {},
    now: "2026-07-02T11:00:00Z"
  });
  saveJob(envelope.job);
  return envelope.job;
}

test("verifyWorkerSignature is fail-closed without configured secret", () => {
  const result = verifyWorkerSignature({ env: {}, headers: {}, rawBody: "{}", nowMs: NOW_MS });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.reason, "worker_callback_secret_not_configured");
});

test("verifyWorkerSignature rejects missing signature, bad timestamp and replay outside window", () => {
  const env = { SMEJJ_WORKER_CALLBACK_SECRET: SECRET };
  assert.equal(verifyWorkerSignature({ env, headers: {}, rawBody: "{}", nowMs: NOW_MS }).reason, "worker_signature_missing");

  const noTs = { [WORKER_SIGNATURE_HEADER]: "abc" };
  assert.equal(verifyWorkerSignature({ env, headers: noTs, rawBody: "{}", nowMs: NOW_MS }).reason, "worker_timestamp_missing_or_invalid");

  const oldTs = NOW_MS - MAX_CLOCK_SKEW_MS - 1000;
  const replay = {
    [WORKER_SIGNATURE_HEADER]: signWorkerPayload(SECRET, oldTs, "{}"),
    [WORKER_TIMESTAMP_HEADER]: String(oldTs)
  };
  assert.equal(verifyWorkerSignature({ env, headers: replay, rawBody: "{}", nowMs: NOW_MS }).reason, "worker_timestamp_outside_allowed_window");
});

test("verifyWorkerSignature rejects wrong secret and accepts correct signature", () => {
  const env = { SMEJJ_WORKER_CALLBACK_SECRET: SECRET };
  const wrong = {
    [WORKER_SIGNATURE_HEADER]: signWorkerPayload("other_secret", NOW_MS, "{}"),
    [WORKER_TIMESTAMP_HEADER]: String(NOW_MS)
  };
  assert.equal(verifyWorkerSignature({ env, headers: wrong, rawBody: "{}", nowMs: NOW_MS }).reason, "worker_signature_invalid");

  const good = {
    [WORKER_SIGNATURE_HEADER]: signWorkerPayload(SECRET, NOW_MS, "{}"),
    [WORKER_TIMESTAMP_HEADER]: String(NOW_MS)
  };
  assert.equal(verifyWorkerSignature({ env, headers: good, rawBody: "{}", nowMs: NOW_MS }).ok, true);
});

test("handleWorkerStatusUpdate applies a signed status transition and emits SSE event", async () => {
  const job = seedJob("job_cb_1");
  const events = [];
  subscribeToJob(job.id, (payload) => events.push(payload));

  const rawBody = JSON.stringify({ status: "running", message: "Worker claimed task capsule" });
  const res = fakeRes();
  await handleWorkerStatusUpdate(
    new URL(`http://127.0.0.1/api/jobs/${job.id}/status`),
    signedReq(rawBody),
    res,
    { env: { SMEJJ_WORKER_CALLBACK_SECRET: SECRET }, nowMs: NOW_MS }
  );

  assert.equal(res.statusCode, 200);
  const payload = res.payload();
  assert.equal(payload.ok, true);
  assert.equal(payload.job.status, "running");
  assert.equal(payload.job.message, "Worker claimed task capsule");
  assert.ok(payload.job.taskCapsule.events.length >= 2);
  assert.equal(getJob(job.id).status, "running");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "job.status");
  assert.equal(activeWorkerCount(), 1);
});

test("handleWorkerStatusUpdate rejects unsigned, unknown-job and unsupported-status requests", async () => {
  const job = seedJob("job_cb_2");
  const env = { SMEJJ_WORKER_CALLBACK_SECRET: SECRET };

  const unsigned = fakeRes();
  const badReq = signedReq(JSON.stringify({ status: "running" }), { signature: "invalid" });
  await handleWorkerStatusUpdate(new URL(`http://127.0.0.1/api/jobs/${job.id}/status`), badReq, unsigned, { env, nowMs: NOW_MS });
  assert.equal(unsigned.statusCode, 401);

  const missing = fakeRes();
  const rawMissing = JSON.stringify({ status: "running" });
  await handleWorkerStatusUpdate(new URL("http://127.0.0.1/api/jobs/nope/status"), signedReq(rawMissing), missing, { env, nowMs: NOW_MS });
  assert.equal(missing.statusCode, 404);

  const unsupported = fakeRes();
  const rawBad = JSON.stringify({ status: "totally_invalid" });
  await handleWorkerStatusUpdate(new URL(`http://127.0.0.1/api/jobs/${job.id}/status`), signedReq(rawBad), unsupported, { env, nowMs: NOW_MS });
  assert.equal(unsupported.statusCode, 400);
  assert.equal(unsupported.payload().error, "unsupported_status");
  assert.equal(getJob(job.id).status, "queued");
});

test("handleWorkerStatusUpdate is fail-closed without configured callback secret", async () => {
  const job = seedJob("job_cb_3");
  const res = fakeRes();
  const rawBody = JSON.stringify({ status: "running" });
  await handleWorkerStatusUpdate(new URL(`http://127.0.0.1/api/jobs/${job.id}/status`), signedReq(rawBody), res, { env: {}, nowMs: NOW_MS });
  assert.equal(res.statusCode, 503);
  assert.equal(getJob(job.id).status, "queued");
});

test("activeWorkerCount feeds concurrency: terminal states free the slot", async () => {
  const job = seedJob("job_cb_4");
  const env = { SMEJJ_WORKER_CALLBACK_SECRET: SECRET };

  const running = JSON.stringify({ status: "running" });
  await handleWorkerStatusUpdate(new URL(`http://127.0.0.1/api/jobs/${job.id}/status`), signedReq(running), fakeRes(), { env, nowMs: NOW_MS });
  assert.equal(activeWorkerCount(), 1);

  const done = JSON.stringify({ status: "done" });
  await handleWorkerStatusUpdate(new URL(`http://127.0.0.1/api/jobs/${job.id}/status`), signedReq(done), fakeRes(), { env, nowMs: NOW_MS });
  assert.equal(activeWorkerCount(), 0);
});

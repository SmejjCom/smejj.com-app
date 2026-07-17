import test from "node:test";
import assert from "node:assert/strict";
import { clearJobs, getJob, jobCount, saveJob, subscribeToJob, updateJobStatus } from "../control-server/src/jobs/jobStore.js";
import { formatEvent } from "../control-server/src/streaming/sse.js";
import { handleCreateJob, hasLocalIdriveConfig, handleJobStatus, handleJobEvents, persistFreeExecutorToIdrive } from "../control-server/src/routes/jobRoutes.js";
import { handleStoragePresign } from "../control-server/src/routes/storagePresignRoutes.js";
import {
  boundedNumber,
  encodeS3Key,
  getS3Dates,
  parseS3Keys,
  parseS3ListPage,
  signedS3List
} from "../control-server/src/storage/s3Signer.js";
import { hmac, sha256 } from "../control-server/src/shared/hash.js";
import { createStorageFirstJobEnvelope, runFreeAppExecutor } from "../src/jobs/index.js";

function fakeRes() {
  return {
    statusCode: 0,
    headers: null,
    chunks: [],
    ended: false,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); this.ended = true; }
  };
}

function fakeReq() {
  const listeners = {};
  return {
    on(event, fn) { listeners[event] = fn; },
    emit(event) { if (listeners[event]) listeners[event](); }
  };
}

function jsonReq(body) {
  const text = JSON.stringify(body);
  return {
    on(event, fn) {
      if (event === "data") queueMicrotask(() => fn(text));
      if (event === "end") queueMicrotask(() => fn());
    }
  };
}

test("jobStore saves, reads and counts jobs", () => {
  clearJobs();
  saveJob({ id: "job_test_1", status: "pending" });
  assert.equal(getJob("job_test_1").status, "pending");
  assert.equal(getJob("missing"), null);
  assert.equal(jobCount(), 1);
});

test("jobStore rejects jobs without id", () => {
  assert.throws(() => saveJob({}), /requires a job with an id/);
});

test("jobStore emits status events to subscribers and supports unsubscribe", () => {
  clearJobs();
  saveJob({ id: "job_test_2", status: "pending" });
  const events = [];
  const unsubscribe = subscribeToJob("job_test_2", (payload) => events.push(payload));
  const updated = updateJobStatus("job_test_2", "running", "2026-07-02T10:00:00Z");
  assert.equal(updated.status, "running");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "job.status");
  assert.equal(events[0].job.updatedAt, "2026-07-02T10:00:00Z");
  unsubscribe();
  updateJobStatus("job_test_2", "verified");
  assert.equal(events.length, 1);
});

test("jobStore updateJobStatus returns null for unknown job", () => {
  clearJobs();
  assert.equal(updateJobStatus("unknown", "running"), null);
});

test("sse formatEvent produces valid SSE frames", () => {
  const frame = formatEvent("job.status", { ok: true });
  assert.equal(frame, 'event: job.status\ndata: {"ok":true}\n\n');
});

test("hasLocalIdriveConfig is fail-closed on missing env", () => {
  assert.equal(hasLocalIdriveConfig({}), false);
  assert.equal(hasLocalIdriveConfig({ IDRIVE_E2_ENDPOINT: "https://e2.example" }), false);
  assert.equal(hasLocalIdriveConfig({
    IDRIVE_E2_ENDPOINT: "https://e2.example",
    IDRIVE_E2_ACCESS_KEY: "k",
    IDRIVE_E2_SECRET_KEY: "s",
    IDRIVE_E2_BUCKET: "b"
  }), true);
});

test("job creation becomes visible only after its Task Capsule is durable", async () => {
  clearJobs();
  const body = { jobId: "job_create_durable", projectId: "project_smejj", task: "Persist first", persistToIdrive: true };
  const missing = fakeRes();
  await handleCreateJob(jsonReq(body), missing, { env: {} });
  assert.equal(missing.statusCode, 503);
  assert.equal(getJob(body.jobId), null);

  const env = {
    IDRIVE_E2_ENDPOINT: "https://e2.example",
    IDRIVE_E2_ACCESS_KEY: "k",
    IDRIVE_E2_SECRET_KEY: "s",
    IDRIVE_E2_BUCKET: "b"
  };
  const failed = fakeRes();
  await handleCreateJob(jsonReq(body), failed, {
    env,
    writeEnvelope: async () => { throw new Error("storage unavailable"); }
  });
  assert.equal(failed.statusCode, 503);
  assert.equal(getJob(body.jobId), null);

  const passed = fakeRes();
  await handleCreateJob(jsonReq(body), passed, {
    env,
    writeEnvelope: async () => ({ ok: true, objectCount: 17 })
  });
  assert.equal(passed.statusCode, 201);
  assert.equal(getJob(body.jobId).durableTaskCapsule, true);
  assert.equal(passed.ended, true);
});

test("storage presign route is fail-closed without IDrive env", async () => {
  const res = fakeRes();
  await handleStoragePresign(jsonReq({
    operation: "upload",
    key: "objects/presign-test.txt",
    contentType: "text/plain",
    contentLength: 4
  }), res, { env: {} });

  assert.equal(res.statusCode, 503);
  const payload = JSON.parse(res.chunks.join(""));
  assert.equal(payload.ok, false);
  assert.match(payload.reason, /^missing_env:/);
});

test("storage presign route returns upload and download envelopes", async () => {
  const env = {
    IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_ACCESS_KEY: "example_access_key",
    IDRIVE_E2_SECRET_KEY: "example_secret_key",
    IDRIVE_E2_BUCKET: "smejj-app",
    PRESIGN_HARD_LIMIT_ALLOWED: "true",
    PRESIGN_REMAINING: "3"
  };

  const uploadRes = fakeRes();
  await handleStoragePresign(jsonReq({
    operation: "upload",
    key: "objects/presign-test.txt",
    contentType: "text/plain",
    contentLength: 4
  }), uploadRes, { env });
  assert.equal(uploadRes.statusCode, 200);
  const upload = JSON.parse(uploadRes.chunks.join(""));
  assert.equal(upload.ok, true);
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["Content-Type"], "text/plain");
  assert.match(upload.url, /^https:\/\/s3\.us-west-2\.idrivee2\.com\/smejj-app\/objects\/presign-test\.txt\?/);

  const downloadRes = fakeRes();
  await handleStoragePresign(jsonReq({
    operation: "download",
    key: "objects/presign-test.txt"
  }), downloadRes, { env });
  assert.equal(downloadRes.statusCode, 200);
  const download = JSON.parse(downloadRes.chunks.join(""));
  assert.equal(download.ok, true);
  assert.equal(download.method, "GET");
  assert.deepEqual(download.headers, {});
});

test("handleJobStatus returns 404 for unknown job and 200 with capsule plan for known job", async () => {
  clearJobs();
  const notFound = fakeRes();
  await handleJobStatus(new URL("http://127.0.0.1/api/jobs/missing"), notFound);
  assert.equal(notFound.statusCode, 404);

  const envelope = createStorageFirstJobEnvelope({
    body: { jobId: "job_test_3", projectId: "project_smejj", task: "demo" },
    env: {},
    now: "2026-07-02T10:00:00Z"
  });
  saveJob(envelope.job);
  const found = fakeRes();
  await handleJobStatus(new URL(`http://127.0.0.1/api/jobs/${envelope.job.id}`), found);
  assert.equal(found.statusCode, 200);
  const payload = JSON.parse(found.chunks.join(""));
  assert.equal(payload.ok, true);
  assert.equal(payload.inferenceStarted, false);
  assert.ok(payload.taskCapsuleWritePlan);
});

test("handleJobEvents streams initial status and live updates via SSE", async () => {
  clearJobs();
  saveJob({ id: "job_test_4", status: "pending" });
  const res = fakeRes();
  const req = fakeReq();
  await handleJobEvents(new URL("http://127.0.0.1/api/jobs/job_test_4/events"), req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /text\/event-stream/);
  assert.match(res.chunks.join(""), /event: job.status/);

  updateJobStatus("job_test_4", "running");
  assert.match(res.chunks.join(""), /"status":"running"/);

  req.emit("close");
  const chunksAfterClose = res.chunks.length;
  updateJobStatus("job_test_4", "verified");
  assert.equal(res.chunks.length, chunksAfterClose);
});

test("handleJobEvents returns 404 for unknown job", async () => {
  clearJobs();
  const res = fakeRes();
  await handleJobEvents(new URL("http://127.0.0.1/api/jobs/nope/events"), fakeReq(), res);
  assert.equal(res.statusCode, 404);
});

test("free executor persistence is write-plan-only without IDrive env", async () => {
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId: "job_test_free_1", projectId: "project_smejj", task: "create mini app" },
    env: {},
    now: "2026-07-02T10:00:00Z"
  });
  const executor = runFreeAppExecutor({ task: "create mini app", jobEnvelope: envelope });
  const result = await persistFreeExecutorToIdrive({ envelope, executor, env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "write-plan-only");
  assert.equal(result.objectCount, 0);
});

test("free executor persistence writes task capsule, queue and artifacts", async () => {
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId: "job_test_free_2", projectId: "project_smejj", task: "create mini app" },
    env: {},
    now: "2026-07-02T10:00:00Z"
  });
  const executor = runFreeAppExecutor({ task: "create mini app", jobEnvelope: envelope });
  const written = [];
  const result = await persistFreeExecutorToIdrive({
    envelope,
    executor,
    env: {
      IDRIVE_E2_ENDPOINT: "https://e2.example",
      IDRIVE_E2_ACCESS_KEY: "k",
      IDRIVE_E2_SECRET_KEY: "s",
      IDRIVE_E2_BUCKET: "b"
    },
    putObject: async (object) => {
      written.push(object.key);
      return { ok: true, key: object.key };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "task-capsule-and-artifacts-persisted");
  assert.equal(result.objectCount, envelope.taskCapsuleWritePlan.objects.length + envelope.queueWritePlan.objects.length + executor.objects.length);
  assert.ok(written.some((key) => key.endsWith("input.json")));
  assert.ok(written.some((key) => key.includes("/artifacts/todo-stats-mini/index.html")));
  assert.ok(written.includes(envelope.queueWritePlan.currentEntryKey));
});

test("free executor persistence preserves write plan on unsafe object key", async () => {
  const result = await persistFreeExecutorToIdrive({
    envelope: {
      taskCapsuleWritePlan: { objects: [{ key: "../bad.json", body: "{}", contentType: "application/json" }] },
      queueWritePlan: { objects: [] }
    },
    executor: { objects: [] },
    env: {
      IDRIVE_E2_ENDPOINT: "https://e2.example",
      IDRIVE_E2_ACCESS_KEY: "k",
      IDRIVE_E2_SECRET_KEY: "s",
      IDRIVE_E2_BUCKET: "b"
    },
    putObject: async () => {
      throw new Error("must not be called");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "persist-failed-write-plan-preserved");
  assert.equal(result.reason, "idrive_e2_write_failed");
  assert.match(result.error, /Unsafe IDrive object key/);
});

test("s3Signer helpers behave deterministically", () => {
  assert.equal(encodeS3Key("a/b c/d"), "a/b%20c/d");
  assert.equal(boundedNumber("not-a-number", 5, 1, 10), 5);
  assert.equal(boundedNumber("99", 5, 1, 10), 10);
  const { amzDate, dateStamp } = getS3Dates(new Date("2026-07-02T10:20:30.123Z"));
  assert.equal(amzDate, "20260702T102030Z");
  assert.equal(dateStamp, "20260702");
  assert.deepEqual(parseS3Keys("<Key>a.txt</Key><Key>b.txt</Key>"), ["a.txt", "b.txt"]);
  assert.deepEqual(parseS3ListPage(
    "<ListBucketResult><Key>a&amp;b.txt</Key><IsTruncated>true</IsTruncated>" +
    "<NextContinuationToken>next&amp;token</NextContinuationToken></ListBucketResult>"
  ), {
    keys: ["a&b.txt"],
    isTruncated: true,
    nextContinuationToken: "next&token"
  });
});

test("signed S3 listing binds the continuation token into the request", async () => {
  let requestUrl = "";
  let authorization = "";
  const result = await signedS3List({
    endpoint: "https://s3.us-west-2.idrivee2.com",
    region: "us-west-2",
    accessKey: "test-access",
    secretKey: "test-secret-value",
    bucket: "test-bucket",
    prefix: "workers/salad/watchdogs/smejj-glm-worker/",
    continuationToken: "page+2/token=",
    fetchImpl: async (url, options) => {
      requestUrl = String(url);
      authorization = String(options.headers.Authorization || "");
      return {
        ok: true,
        status: 200,
        text: async () => "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>"
      };
    }
  });
  assert.equal(result.response.ok, true);
  const parsed = new URL(requestUrl);
  assert.equal(parsed.searchParams.get("continuation-token"), "page+2/token=");
  assert.match(authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
});

test("hash helpers match node crypto expectations", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hmac("key", "data", "hex"), "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0");
});

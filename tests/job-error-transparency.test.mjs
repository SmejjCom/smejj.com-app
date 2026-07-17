// smejj.com: Fehlerursachen-Transparenz — Jobliste und IDrive-Hydration
// muessen result.errors (gekappt 20/100/500) erhalten, damit die UI die
// Ursachen auch nach Instanz-Neustart und in der Listenansicht zeigen kann.
import test from "node:test";
import assert from "node:assert/strict";
import { handleListJobs } from "../control-server/src/routes/jobRoutes.js";
import { hydrateJobFromIdrive } from "../control-server/src/jobs/jobHydration.js";
import { clearJobs, saveJob } from "../control-server/src/jobs/jobStore.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";

function seedJob(jobId) {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({ body: { jobId, projectId: "project_smejj", task: "Fix code" }, env: {} });
  const job = { ...envelope.job, status: "failed", phase: "failed" };
  saveJob(job);
  return job;
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    writeHead(status, headers = {}) { this.statusCode = status; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); },
    end(value) { if (value) this.chunks.push(String(value)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

test("job list summary preserves capped error causes for failed jobs", async () => {
  const job = seedJob("job_summary_errors");
  saveJob({
    ...job,
    result: {
      ok: false,
      status: "failed",
      errors: Array.from({ length: 25 }, (_, index) => ({
        source: `worker_http_${index}${"s".repeat(200)}`,
        detail: `status_500_${index}${"d".repeat(900)}`
      })),
      finalReport: ""
    }
  });
  const res = fakeRes();
  await handleListJobs(new URL("https://smejj.com/api/jobs?limit=10"), res, { env: {} });
  assert.equal(res.statusCode, 200);
  const listed = res.payload().jobs.find((entry) => entry.id === job.id);
  assert.ok(listed, "failed job must be listed");
  assert.equal(listed.result.errors.length, 20, "errors must be capped at 20");
  assert.equal(listed.result.errors[0].source.length, 100, "source must be capped at 100 chars");
  assert.equal(listed.result.errors[0].detail.length, 500, "detail must be capped at 500 chars");
  assert.match(listed.result.errors[0].source, /^worker_http_0/);
});

test("job list summary keeps errors as empty array when result has none", async () => {
  const job = seedJob("job_summary_no_errors");
  saveJob({ ...job, status: "passed", result: { ok: true, status: "verified", errors: [], diffSha256: "a".repeat(64), finalReport: "ok" } });
  const res = fakeRes();
  await handleListJobs(new URL("https://smejj.com/api/jobs?limit=10"), res, { env: {} });
  const listed = res.payload().jobs.find((entry) => entry.id === job.id);
  assert.deepEqual(listed.result.errors, []);
});

test("job hydration restores error causes from the Task Capsule errors.json", async () => {
  const original = seedJob("job_hydration_errors");
  const root = original.taskCapsule.rootPrefix;
  clearJobs();
  const objects = new Map([
    [`jobs/open/${original.id}.json`, JSON.stringify({ taskCapsuleRoot: root })],
    [`${root}input.json`, JSON.stringify({ jobId: original.id, projectId: original.projectId, task: original.task, model: { id: original.model.id }, createdAt: original.createdAt, repository: null, context: {} })],
    [`${root}status.json`, JSON.stringify({ status: "failed", phase: "failed", progress: 1, message: "Autonomous loop failed after 3 attempt(s)", updatedAt: original.createdAt })],
    [`${root}errors.json`, JSON.stringify({ status: "failed", errors: [{ source: "worker_http", detail: "status_500" }, { source: "dispatch", detail: "fetch failed" }] })]
  ]);
  const hydrated = await hydrateJobFromIdrive(original.id, {
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    getObject: async (key) => ({ body: objects.get(key) })
  });
  assert.equal(hydrated.status, "failed");
  assert.ok(hydrated.result, "failed job without diff/finalReport must still expose a result for error transparency");
  assert.deepEqual(hydrated.result.errors, [
    { source: "worker_http", detail: "status_500" },
    { source: "dispatch", detail: "fetch failed" }
  ]);
  assert.equal(hydrated.result.ok, false);
});

test("job hydration without errors.json behaves like before (non-regression)", async () => {
  const original = seedJob("job_hydration_plain");
  const root = original.taskCapsule.rootPrefix;
  clearJobs();
  const objects = new Map([
    [`jobs/open/${original.id}.json`, JSON.stringify({ taskCapsuleRoot: root, diffSha256: "d".repeat(64) })],
    [`${root}input.json`, JSON.stringify({ jobId: original.id, projectId: original.projectId, task: original.task, model: { id: original.model.id }, createdAt: original.createdAt, repository: null, context: {} })],
    [`${root}status.json`, JSON.stringify({ status: "passed", phase: "passed", progress: 1, message: "Hydrated", updatedAt: original.createdAt })],
    [`${root}patch.diff`, "diff --git a/a b/a\n"],
    [`${root}final-report.md`, "Verified"]
  ]);
  const hydrated = await hydrateJobFromIdrive(original.id, {
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    getObject: async (key) => ({ body: objects.get(key) })
  });
  assert.equal(hydrated.result.diffSha256, "d".repeat(64));
  assert.equal(hydrated.result.finalReport, "Verified");
  assert.deepEqual(hydrated.result.errors, []);
});

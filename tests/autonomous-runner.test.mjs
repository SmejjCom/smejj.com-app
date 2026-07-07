import test from "node:test";
import assert from "node:assert/strict";
import { buildHttpDispatch, createAutonomousRunner } from "../control-server/src/orchestrator/autonomousRunner.js";
import { clearJobs, getJob, saveJob, subscribeToJob } from "../control-server/src/jobs/jobStore.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";
import { handleAutonomousRun } from "../control-server/src/routes/jobRoutes.js";

function seedJob(jobId) {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId, projectId: "project_smejj", task: "loop test" },
    env: {},
    now: "2026-07-02T11:00:00Z"
  });
  saveJob(envelope.job);
  return envelope.job;
}

function fakeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    write(c) { this.chunks.push(String(c)); },
    end(c) { if (c) this.chunks.push(String(c)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

function fakeReq(body = "{}") {
  return { headers: {}, on(event, fn) { if (event === "data") setImmediate(() => fn(body)); if (event === "end") setImmediate(() => fn()); } };
}

test("runner requires a dispatch function (fail-closed)", () => {
  assert.throws(() => createAutonomousRunner({}), /dispatch function/);
});

test("success on first attempt: passed status, memory may learn", async () => {
  seedJob("job_loop_a");
  const statuses = [];
  subscribeToJob("job_loop_a", ({ job }) => statuses.push(job.status));
  const runner = createAutonomousRunner({ dispatch: async () => ({ ok: true, memoryUpdate: { pattern: "x" } }) });
  const result = await runner("job_loop_a", { task: "t" });

  assert.equal(result.ok, true);
  assert.equal(result.memoryMayLearn, true);
  assert.deepEqual(result.memoryUpdate, { pattern: "x" });
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(statuses, ["planning", "running", "verifying", "passed"]);
  assert.equal(getJob("job_loop_a").status, "passed");
});

test("self-fix: failure then success on attempt 2", async () => {
  seedJob("job_loop_b");
  let calls = 0;
  const runner = createAutonomousRunner({
    dispatch: async ({ attempt, previousErrors }) => {
      calls += 1;
      if (attempt === 1) return { ok: false, errors: [{ source: "tests", detail: "1 failing" }] };
      assert.equal(previousErrors.length, 1);
      return { ok: true };
    }
  });
  const result = await runner("job_loop_b");
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(getJob("job_loop_b").status, "passed");
});

test("hard cap: after 3 failed attempts job is failed and memory never learns", async () => {
  seedJob("job_loop_c");
  let calls = 0;
  const runner = createAutonomousRunner({ dispatch: async () => { calls += 1; return { ok: false, errors: [{ detail: "still broken" }] }; } });
  const result = await runner("job_loop_c");

  assert.equal(result.ok, false);
  assert.equal(calls, 3);
  assert.equal(result.attempts.length, 3);
  assert.equal(result.memoryMayLearn, false);
  assert.equal(result.memoryUpdate, null);
  assert.equal(getJob("job_loop_c").status, "failed");
});

test("dispatch exceptions count as failed attempts, loop stays intact", async () => {
  seedJob("job_loop_d");
  const runner = createAutonomousRunner({ dispatch: async () => { throw new Error("worker exploded"); } });
  const result = await runner("job_loop_d");
  assert.equal(result.ok, false);
  assert.equal(result.attempts.length, 3);
  assert.equal(getJob("job_loop_d").status, "failed");
});

test("unknown job is rejected without transitions", async () => {
  clearJobs();
  const runner = createAutonomousRunner({ dispatch: async () => ({ ok: true }) });
  const result = await runner("missing");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "job_not_found");
});

test("buildHttpDispatch is fail-closed and maps non-2xx to failed outcome", async () => {
  assert.equal(buildHttpDispatch({}), null);
  assert.equal(buildHttpDispatch({ SMEJJ_WORKER_DISPATCH_URL: "ftp://x" }), null);

  const dispatch = buildHttpDispatch({ SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run" }, {
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  const outcome = await dispatch({ jobId: "x", attempt: 1 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.errors[0].detail, "status_500");
});

test("route is fail-closed: flag and dispatch URL are both required, then returns 202", async () => {
  const job = seedJob("job_loop_e");

  const disabled = fakeRes();
  await handleAutonomousRun(new URL(`http://x/api/jobs/${job.id}/autonomous-run`), fakeReq(), disabled, { env: {} });
  assert.equal(disabled.statusCode, 409);
  assert.equal(disabled.payload().error, "autonomous_loop_disabled");

  const noUrl = fakeRes();
  await handleAutonomousRun(new URL(`http://x/api/jobs/${job.id}/autonomous-run`), fakeReq(), noUrl, { env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES" } });
  assert.equal(noUrl.statusCode, 409);
  assert.equal(noUrl.payload().error, "worker_dispatch_not_configured");

  const started = fakeRes();
  await handleAutonomousRun(new URL(`http://x/api/jobs/${job.id}/autonomous-run`), fakeReq(), started, {
    env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES", SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run" }
  });
  assert.equal(started.statusCode, 202);
  assert.equal(started.payload().started, true);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

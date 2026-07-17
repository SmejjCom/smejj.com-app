import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildHttpDispatch, createAutonomousRunner } from "../control-server/src/orchestrator/autonomousRunner.js";
import { clearJobs, getJob, replaceJob, saveJob, subscribeToJob } from "../control-server/src/jobs/jobStore.js";
import { authenticatedUserId } from "../control-server/src/jobs/jobAccess.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";
import { handleAutonomousRun, renewJobClaimHeartbeat } from "../control-server/src/routes/jobRoutes.js";

function seedJob(jobId) {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId, projectId: "project_smejj", task: "loop test" },
    env: {},
    now: "2026-07-02T11:00:00Z"
  });
  const job = { ...envelope.job, durableTaskCapsule: true };
  saveJob(job);
  return job;
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

function fakeClaimStore() {
  return {
    ttlMs: 120_000,
    async claim(job) {
      return {
        ok: true,
        lease: {
          jobId: job.id,
          claimId: `claim_${job.id}`,
          fence: 1,
          expiresAt: "2026-07-02T11:02:00.000Z"
        }
      };
    },
    async heartbeat(_job, lease) { return { ok: true, lease }; },
    async complete() { return { ok: true }; },
    async release() { return { ok: true }; }
  };
}

async function waitForJobStatus(jobId, expected, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getJob(jobId)?.status === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`job ${jobId} did not reach ${expected}`);
}

test("runner requires a dispatch function (fail-closed)", () => {
  assert.throws(() => createAutonomousRunner({}), /dispatch function/);
});

test("success on first attempt: fully evidenced memory may learn", async () => {
  seedJob("job_loop_a");
  const statuses = [];
  subscribeToJob("job_loop_a", ({ job }) => statuses.push(job.status));
  const runner = createAutonomousRunner({ dispatch: async () => verifiedMemoryOutcome({ pattern: "x" }) });
  const result = await runner("job_loop_a", { task: "t" });

  assert.equal(result.ok, true);
  assert.equal(result.memoryMayLearn, true);
  assert.equal(result.memoryUpdate.learn, true);
  assert.equal(result.memoryUpdate.pattern, "x");
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(statuses, ["planning", "running", "verifying", "passed"]);
  assert.equal(getJob("job_loop_a").status, "passed");
});

test("successful publication-like outcome without learn flag cannot update memory", async () => {
  seedJob("job_loop_no_memory");
  const runner = createAutonomousRunner({ dispatch: async () => ({ ok: true, memoryUpdate: { pattern: "not-authorized" } }) });
  const result = await runner("job_loop_no_memory");
  assert.equal(result.ok, true);
  assert.equal(result.memoryMayLearn, false);
  assert.equal(result.memoryUpdate, null);
});

test("public run input cannot inject repository, edits, commands or publication approval", async () => {
  seedJob("job_loop_input_guard");
  let received;
  const runner = createAutonomousRunner({ dispatch: async (payload) => { received = payload; return { ok: true }; } });
  await runner("job_loop_input_guard", {
    task: "replace task",
    repository: { url: "https://github.com/attacker/repo" },
    files: [{ path: "x", content: "x" }],
    edits: [{ path: "x", content: "bad" }],
    commands: [["npm", "run", "publish"]],
    modelMode: "disabled",
    approval: { createDraftPr: true },
    preview: { required: false },
    verification: { install: false }
  });
  assert.equal(received.task, "loop test");
  assert.equal(received.repository, null);
  assert.deepEqual(received.files, []);
  assert.deepEqual(received.edits, []);
  assert.deepEqual(received.commands, []);
  assert.equal(received.modelMode, "enabled");
  assert.equal(received.approval.createDraftPr, false);
  assert.deepEqual(received.verification, {});
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

test("failed jobs preserve capped error causes in job.result for user-facing transparency", async () => {
  seedJob("job_loop_errors");
  const runner = createAutonomousRunner({
    dispatch: async () => ({
      ok: false,
      errors: [
        { source: "worker_http", detail: "status_503" },
        { source: "x".repeat(500), detail: "y".repeat(9_000) }
      ]
    })
  });
  const result = await runner("job_loop_errors");
  assert.equal(result.ok, false);
  const stored = getJob("job_loop_errors").result;
  assert.equal(Array.isArray(stored.errors), true);
  assert.equal(stored.errors[0].source, "worker_http");
  assert.equal(stored.errors[0].detail, "status_503");
  assert.ok(stored.errors[1].source.length <= 100);
  assert.ok(stored.errors[1].detail.length <= 500);
});

test("approved draft publication is dispatched once to avoid duplicate external side effects", async () => {
  const job = seedJob("job_publish_once");
  const diffSha256 = "a".repeat(64);
  saveJob({
    ...job,
    status: "passed",
    phase: "passed",
    repository: { url: "https://github.com/example/demo.git", baseRef: "main", publishMode: "draft-pr" },
    approval: { status: "human_approved", approvedDiffSha256: diffSha256, mergeAllowed: false },
    result: { diff: "diff --git a/a b/a\n", diffSha256 }
  });
  let calls = 0;
  let received;
  let publicationAuditCalls = 0;
  const runner = createAutonomousRunner({
    dispatch: async (payload) => {
      calls += 1;
      received = payload;
      return { ok: false, errors: [{ source: "worker_http", detail: "response_lost" }] };
    },
    persistPublicationAttempt: async () => { publicationAuditCalls += 1; return { ok: true }; }
  });
  const result = await runner(job.id, { publishDraftPr: true });

  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.attempts.length, 1);
  assert.equal(received.maxAttempts, 1);
  assert.equal(received.modelMode, "disabled");
  assert.equal(received.approval.createDraftPr, true);
  assert.equal(publicationAuditCalls, 1);
  assert.equal(result.verifiedResultPreserved, true);
  assert.equal(getJob(job.id).status, "passed");
  assert.equal(getJob(job.id).result.diffSha256, diffSha256);
});

test("successful draft publication preserves the verified result and writes only the publication audit", async () => {
  const job = seedJob("job_publish_success");
  const diffSha256 = "b".repeat(64);
  saveJob({
    ...job,
    status: "passed",
    phase: "passed",
    repository: { url: "https://github.com/example/demo.git", baseRef: "main", publishMode: "draft-pr" },
    approval: { status: "human_approved", approvedDiffSha256: diffSha256, mergeAllowed: false },
    result: { diff: "diff --git a/a b/a\n", diffSha256, finalReport: "Verified before publication" }
  });
  let outcomePersistenceCalls = 0;
  let publicationAuditCalls = 0;
  const runner = createAutonomousRunner({
    dispatch: async () => ({
      ok: true,
      approval: {
        publish: {
          status: "draft_pr_created",
          draftPullRequest: { number: 7, url: "https://github.com/example/demo/pull/7", draft: true },
          mergePerformed: false
        }
      }
    }),
    persistOutcome: async () => { outcomePersistenceCalls += 1; return { ok: true }; },
    persistPublicationAttempt: async ({ publication }) => {
      publicationAuditCalls += 1;
      assert.equal(publication.status, "draft_pr_created");
      return { ok: true };
    }
  });
  const result = await runner(job.id, { publishDraftPr: true });

  assert.equal(result.ok, true);
  assert.equal(result.stage, "publication");
  assert.equal(outcomePersistenceCalls, 0);
  assert.equal(publicationAuditCalls, 1);
  assert.equal(getJob(job.id).status, "passed");
  assert.equal(getJob(job.id).result.diffSha256, diffSha256);
  assert.equal(getJob(job.id).publication.draftPullRequest.number, 7);
  assert.equal(getJob(job.id).publication.mergePerformed, false);
});

test("verified worker output is not recomputed when durable persistence fails", async () => {
  seedJob("job_loop_persistence");
  let dispatchCalls = 0;
  let persistenceCalls = 0;
  const runner = createAutonomousRunner({
    dispatch: async () => { dispatchCalls += 1; return { ok: true, diffSha256: "a".repeat(64) }; },
    persistOutcome: async () => { persistenceCalls += 1; return { ok: false, reason: "storage_temporarily_unavailable" }; }
  });
  const result = await runner("job_loop_persistence");
  assert.equal(result.ok, false);
  assert.equal(result.stage, "artifact_persistence");
  assert.equal(dispatchCalls, 1);
  assert.equal(persistenceCalls, 3);
  assert.equal(result.memoryMayLearn, false);
  assert.equal(getJob("job_loop_persistence").status, "failed");
});

test("unknown job is rejected without transitions", async () => {
  clearJobs();
  const runner = createAutonomousRunner({ dispatch: async () => ({ ok: true }) });
  const result = await runner("missing");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "job_not_found");
});

test("runner rejects direct rerun of terminal job without publication authorization", async () => {
  const job = seedJob("job_runner_terminal");
  replaceJob({ ...job, status: "passed", phase: "passed" });
  let calls = 0;
  const runner = createAutonomousRunner({ dispatch: async () => { calls += 1; return { ok: true }; } });
  const result = await runner(job.id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "job_not_runnable");
  assert.equal(calls, 0);
  assert.equal(getJob(job.id).status, "passed");
});

test("buildHttpDispatch is fail-closed and maps non-2xx to failed outcome", async () => {
  assert.equal(buildHttpDispatch({}), null);
  assert.equal(buildHttpDispatch({ SMEJJ_WORKER_DISPATCH_URL: "ftp://x" }), null);
  assert.equal(buildHttpDispatch({ SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run" }), null);

  const dispatch = buildHttpDispatch({ SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run", SMEJJ_WORKER_TOKEN_SECRET: "test-secret" }, {
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  const outcome = await dispatch({ jobId: "job_x", attempt: 1 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.errors[0].detail, "status_500");
});

test("buildHttpDispatch aborts an active worker request by job id", async () => {
  let observedSignal;
  const dispatch = buildHttpDispatch({
    SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run",
    SMEJJ_WORKER_TOKEN_SECRET: "test-secret"
  }, {
    fetchImpl: async (_url, options) => {
      observedSignal = options.signal;
      await new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
  });
  const pending = dispatch({ jobId: "job_abort", attempt: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dispatch.cancel("job_abort"), true);
  await assert.rejects(pending, /aborted/);
  assert.equal(observedSignal.aborted, true);
  assert.equal(dispatch.cancel("job_abort"), false);
});

test("follow-up dispatch carries only a verified diff from the same repository", async () => {
  clearJobs();
  const repository = { url: "https://github.com/example/demo.git", baseRef: "main", publishMode: "diff-only" };
  const parent = createStorageFirstJobEnvelope({
    body: { jobId: "job_parent", projectId: "project_smejj", task: "parent", repository },
    env: {},
    now: "2026-07-02T11:00:00Z"
  }).job;
  const diff = "diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-a\n+b\n";
  saveJob({
    ...parent,
    status: "passed",
    result: {
      diff,
      diffSha256: crypto.createHash("sha256").update(diff).digest("hex"),
      finalReport: "Verified parent",
      repository: { ...repository, baseCommit: "a".repeat(40) }
    }
  });
  const child = createStorageFirstJobEnvelope({
    body: { jobId: "job_child", projectId: "project_smejj", task: "follow up", parentJobId: parent.id, repository },
    env: {},
    now: "2026-07-02T11:01:00Z"
  }).job;
  saveJob(child);
  let received;
  const runner = createAutonomousRunner({ dispatch: async (payload) => { received = payload; return { ok: true }; } });
  await runner(child.id);
  assert.equal(received.followUpContext.parentJobId, parent.id);
  assert.equal(received.followUpContext.diff, diff);
  assert.equal(received.followUpContext.repository.url, repository.url);
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

  const withoutDurableClaim = fakeRes();
  await handleAutonomousRun(new URL(`http://x/api/jobs/${job.id}/autonomous-run`), fakeReq(), withoutDurableClaim, {
    env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES", SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run", SMEJJ_WORKER_TOKEN_SECRET: "test-secret" }
  });
  assert.equal(withoutDurableClaim.statusCode, 503);
  assert.equal(withoutDurableClaim.payload().error, "job_claim_configuration_invalid");

  const started = fakeRes();
  await handleAutonomousRun(new URL(`http://x/api/jobs/${job.id}/autonomous-run`), fakeReq(), started, {
    env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES", SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run", SMEJJ_WORKER_TOKEN_SECRET: "test-secret" },
    claimStore: fakeClaimStore(),
    dispatchFactory: () => async () => ({ ok: false, errors: [{ source: "test", detail: "expected failure" }] })
  });
  assert.equal(started.statusCode, 202);
  assert.equal(started.payload().started, true);
  await waitForJobStatus(job.id, "failed");
});

test("route keeps ephemeral creation fail-closed when reviewed runtime prerequisites are incomplete", async () => {
  const job = seedJob("job_route_ephemeral_blocked");
  const response = fakeRes();
  await handleAutonomousRun(
    new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
    fakeReq(),
    response,
    {
      env: {
        SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES",
        SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES",
        CONFIRM_SALAD_CREATE: "YES",
        CONFIRM_SALAD_START: "YES",
        CONFIRM_SALAD_STOP: "YES"
      }
    }
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload().error, "ephemeral_worker_not_ready");
});

test("claim heartbeat retries bounded transient storage failures before succeeding", async () => {
  const reasons = ["job_claim_head_read_failed", "job_claim_head_write_failed"];
  const sleeps = [];
  let calls = 0;
  const result = await renewJobClaimHeartbeat({
    claims: {
      heartbeat: async (_job, lease) => {
        calls += 1;
        const reason = reasons.shift();
        return reason ? { ok: false, reason } : { ok: true, lease };
      }
    },
    job: { id: "job_heartbeat_retry" },
    lease: { claimId: "claim_retry" },
    sleep: async (ms) => { sleeps.push(ms); }
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test("claim heartbeat stops immediately on definitive claim loss", async () => {
  let calls = 0;
  const result = await renewJobClaimHeartbeat({
    claims: {
      heartbeat: async () => {
        calls += 1;
        return { ok: false, reason: "job_claim_lost" };
      }
    },
    job: { id: "job_heartbeat_lost" },
    lease: { claimId: "claim_lost" },
    sleep: async () => { throw new Error("definitive_failure_must_not_sleep"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "job_claim_lost");
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("injected lifecycle fixture finalizes a worker before completing the job claim", async () => {
  const job = seedJob("job_route_ephemeral");
  const calls = [];
  const dispatch = async () => ({ ok: false, errors: [{ source: "test", detail: "expected failure" }] });
  dispatch.close = async (jobId, reason) => {
    calls.push(["close", jobId, reason]);
    return {
      mode: "ephemeral-stateless-cpu-sandbox",
      groupName: "smejj-job-test",
      stopVerified: true,
      completionPersisted: true,
      deletionPerformed: false
    };
  };
  const claims = fakeClaimStore();
  const originalComplete = claims.complete;
  claims.complete = async (...args) => {
    calls.push(["claim-complete"]);
    return originalComplete(...args);
  };
  const response = fakeRes();
  await handleAutonomousRun(
    new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
    fakeReq(),
    response,
    {
      env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES", SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES" },
      claimStore: claims,
      ephemeralDispatchFactory: () => dispatch
    }
  );
  assert.equal(response.statusCode, 202);
  await waitForJobStatus(job.id, "failed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.filter((call) => call[0] === "close").length, 1);
  assert.ok(calls.findIndex((call) => call[0] === "close") < calls.findIndex((call) => call[0] === "claim-complete"));
  assert.equal(getJob(job.id).workerRuntime.stopVerified, true);
});

test("autonomous-run 202 queue snapshot never exposes another tenant's jobs or timestamps", async () => {
  clearJobs();
  const alice = { email: "alice@example.com" };
  const bob = { email: "bob@example.com" };
  const ownedJob = (jobId, user) => {
    const envelope = createStorageFirstJobEnvelope({
      body: {
        jobId,
        projectId: "project_smejj",
        task: "tenant queue isolation",
        userId: authenticatedUserId(user)
      },
      env: {},
      now: "2026-07-11T12:00:00Z"
    });
    const job = { ...envelope.job, durableTaskCapsule: true };
    saveJob(job);
    return job;
  };
  const jobs = [
    ownedJob("job_bob_active_1", bob),
    ownedJob("job_bob_active_2", bob),
    ownedJob("job_bob_queued", bob),
    ownedJob("job_alice_queued", alice)
  ];
  let releaseActive;
  const activeGate = new Promise((resolve) => { releaseActive = resolve; });
  const env = {
    SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES",
    SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run",
    SMEJJ_WORKER_TOKEN_SECRET: "test-secret",
    SMEJJ_MAX_PARALLEL_JOBS: "2"
  };
  const dispatch = async (payload) => {
    if (payload.jobId === jobs[0].id || payload.jobId === jobs[1].id) await activeGate;
    return { ok: false, errors: [{ source: "test", detail: "expected failure" }] };
  };
  const runAs = async (job, user) => {
    const req = fakeReq();
    req.authUser = user;
    const res = fakeRes();
    await handleAutonomousRun(
      new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
      req,
      res,
      { env, claimStore: fakeClaimStore(), dispatchFactory: () => dispatch }
    );
    assert.equal(res.statusCode, 202);
    return res.payload();
  };

  await runAs(jobs[0], bob);
  await runAs(jobs[1], bob);
  const bobQueued = await runAs(jobs[2], bob);
  const foreignQueuedAt = bobQueued.queue.queued.find((item) => item.jobId === jobs[2].id)?.queuedAt;
  assert.match(foreignQueuedAt, /^\d{4}-\d{2}-\d{2}T/);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const aliceQueued = await runAs(jobs[3], alice);
  assert.deepEqual(aliceQueued.queue.active, []);
  assert.deepEqual(aliceQueued.queue.queued.map((item) => item.jobId), [jobs[3].id]);
  assert.match(aliceQueued.queue.queued[0].queuedAt, /^\d{4}-\d{2}-\d{2}T/);
  const aliceQueueJson = JSON.stringify(aliceQueued.queue);
  for (const foreignJob of jobs.slice(0, 3)) assert.equal(aliceQueueJson.includes(foreignJob.id), false);
  assert.notEqual(aliceQueued.queue.queued[0].queuedAt, foreignQueuedAt);
  assert.equal(aliceQueueJson.includes(foreignQueuedAt), false);

  releaseActive();
  for (const job of jobs) await waitForJobStatus(job.id, "failed");
});

test("route cannot rerun a terminal job without exact draft publication approval", async () => {
  const job = seedJob("job_terminal_rerun");
  replaceJob({ ...job, status: "passed", phase: "passed", durableTaskCapsule: true, result: { diffSha256: "d".repeat(64) } });
  const response = fakeRes();
  await handleAutonomousRun(
    new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
    fakeReq("{}"),
    response,
    { env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES", SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run", SMEJJ_WORKER_TOKEN_SECRET: "test-secret" } }
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload().error, "job_not_runnable");
  assert.equal(getJob(job.id).status, "passed");
});

test("route sends an exactly approved diff only to the trusted publisher and never claims a model worker", async () => {
  const job = seedJob("job_publication_boundary");
  const diffSha256 = "e".repeat(64);
  replaceJob({
    ...job,
    status: "passed",
    phase: "passed",
    durableTaskCapsule: true,
    repository: { url: "https://github.com/example/demo.git", baseRef: "main", publishMode: "draft-pr" },
    approval: { status: "human_approved", approvedDiffSha256: diffSha256, mergeAllowed: false },
    result: { diff: "diff --git a/a b/a\n", diffSha256 }
  });
  let claimCalls = 0;
  let publishCalls = 0;
  let auditCalls = 0;
  const claims = fakeClaimStore();
  const originalClaim = claims.claim;
  claims.claim = async (...args) => { claimCalls += 1; return originalClaim(...args); };
  const response = fakeRes();
  await handleAutonomousRun(
    new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
    fakeReq(JSON.stringify({ publishDraftPr: true })),
    response,
    {
      env: {
        SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES",
        SMEJJ_WORKER_DISPATCH_URL: "http://127.0.0.1:9999/run",
        SMEJJ_WORKER_TOKEN_SECRET: "test-secret"
      },
      claimStore: claims,
      dispatchFactory: () => async () => { throw new Error("dispatch_must_not_run"); },
      publishJob: async ({ job: publishedJob }) => {
        publishCalls += 1;
        assert.equal(publishedJob.result.diffSha256, diffSha256);
        return {
          ok: true,
          status: "draft_pr_created",
          draftPullRequest: { number: 7, url: "https://github.com/example/demo/pull/7", draft: true },
          baseCommitVerified: true,
          changeSetVerified: true,
          mergePerformed: false
        };
      },
      persistPublication: async () => { auditCalls += 1; return { ok: true, objectCount: 2 }; }
    }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload().ok, true);
  assert.equal(claimCalls, 0);
  assert.equal(publishCalls, 1);
  assert.equal(auditCalls, 1);
  assert.equal(getJob(job.id).status, "passed");
  assert.equal(getJob(job.id).result.diffSha256, diffSha256);
  assert.equal(getJob(job.id).publication.mergePerformed, false);

  const repeated = fakeRes();
  await handleAutonomousRun(
    new URL(`http://x/api/jobs/${job.id}/autonomous-run`),
    fakeReq(JSON.stringify({ publishDraftPr: true })),
    repeated,
    { env: { SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES" }, publishJob: async () => { throw new Error("must_not_retry"); } }
  );
  assert.equal(repeated.statusCode, 409);
  assert.equal(repeated.payload().error, "publication_already_attempted");
});

function verifiedMemoryOutcome(extra = {}) {
  return {
    ok: true,
    diff: "diff --git a/a.js b/a.js\n",
    diffSha256: "a".repeat(64),
    rollback: { baseCommit: "abc" },
    browser: { required: false, ok: true },
    verification: {
      ok: true,
      checks: [
        ...["build", "typecheck", "lint", "security", "repository-hygiene", "security-scan", "unit", "integration"]
          .map((stage) => ({ stage, required: true, ok: true }))
      ]
    },
    memoryUpdate: {
      learn: true,
      providerRightsCleared: true,
      providerRightsEvidenceId: "rights:memory-v1",
      privacySanitized: true,
      privacyEvidenceId: "privacy:memory-v1",
      repositoryRightsCleared: true,
      repositoryRightsEvidenceId: "repository:memory-v1",
      ...extra
    }
  };
}

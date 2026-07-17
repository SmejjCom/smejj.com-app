import test from "node:test";
import assert from "node:assert/strict";
import { issueWorkerToken, verifyWorkerToken, workerTokenSecret } from "../control-server/src/auth/workerToken.js";
import { handleApproveJob, handleCancelJob } from "../control-server/src/routes/jobRoutes.js";
import { handleWorkerModelAction, handleWorkerValidate, persistModelActionBudget } from "../control-server/src/routes/workerModelRoutes.js";
import { buildWorkerOutcomeObjects, persistJobApprovalToIdrive, persistJobCancellationToIdrive, persistPublicationAttemptToIdrive } from "../control-server/src/jobs/jobArtifacts.js";
import { hydrateJobFromIdrive, hydrateRecentJobsFromIdrive } from "../control-server/src/jobs/jobHydration.js";
import { createJobScheduler } from "../control-server/src/orchestrator/jobScheduler.js";
import { clearJobs, getJob, replaceJob, saveJob } from "../control-server/src/jobs/jobStore.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";

function seedJob(jobId = "job_worker_control") {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({ body: { jobId, projectId: "project_smejj", task: "Fix code" }, env: {} });
  const job = { ...envelope.job, status: "running", phase: "running" };
  saveJob(job);
  return job;
}

function fakeReq(body, token) {
  return {
    headers: { authorization: `Bearer ${token}` },
    on(event, listener) {
      if (event === "data") setImmediate(() => listener(JSON.stringify(body)));
      if (event === "end") setImmediate(listener);
    }
  };
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

test("short-lived worker token is job-bound, scoped and expiring", () => {
  const token = issueWorkerToken({ secret: "secret", jobId: "job_token_test", scopes: ["validate"], nowMs: 1000, ttlMs: 60_000 });
  assert.equal(verifyWorkerToken(token, { secret: "secret", jobId: "job_token_test", scope: "validate", nowMs: 2000 }).ok, true);
  assert.equal(verifyWorkerToken(token, { secret: "secret", jobId: "other_job", scope: "validate", nowMs: 2000 }).reason, "worker_token_job_mismatch");
  assert.equal(verifyWorkerToken(token, { secret: "secret", jobId: "job_token_test", scope: "model", nowMs: 2000 }).reason, "worker_token_scope_missing");
  assert.equal(verifyWorkerToken(token, { secret: "secret", jobId: "job_token_test", scope: "validate", nowMs: 70_000 }).reason, "worker_token_expired");
});

test("worker token key is domain-separated from the existing session secret", () => {
  const sessionEnv = { SMEJJ_SESSION_SECRET: "existing-session-secret" };
  const derived = workerTokenSecret(sessionEnv);
  assert.match(derived, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(derived, sessionEnv.SMEJJ_SESSION_SECRET);
  assert.equal(derived, workerTokenSecret(sessionEnv));
  assert.equal(workerTokenSecret({ ...sessionEnv, SMEJJ_WORKER_CALLBACK_SECRET: "callback-secret" }), "callback-secret");
  assert.equal(workerTokenSecret({ ...sessionEnv, SMEJJ_WORKER_TOKEN_SECRET: "dedicated-secret" }), "dedicated-secret");
  assert.equal(workerTokenSecret({}), "");
});

test("worker validation and GLM tool route accept only a valid job token", async () => {
  const job = seedJob();
  const env = {
    SMEJJ_WORKER_TOKEN_SECRET: "worker-secret",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu",
    SMEJJ_LLM_ZHIPU_API_KEY: "model-secret",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://model.example/v1"
  };
  const token = issueWorkerToken({ secret: env.SMEJJ_WORKER_TOKEN_SECRET, jobId: job.id, scopes: ["validate", "model"] });

  const validateRes = fakeRes();
  await handleWorkerValidate(fakeReq({ jobId: job.id }, token), validateRes, { env });
  assert.equal(validateRes.statusCode, 200);
  assert.equal(validateRes.payload().jobId, job.id);
  assert.equal(validateRes.payload().modelActions, 0);

  let upstreamBody;
  const modelRes = fakeRes();
  await handleWorkerModelAction(fakeReq({ jobId: job.id, messages: [{ role: "user", content: "Read index.js" }] }, token), modelRes, {
    env,
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{\"path\":\"index.js\"}" } }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(modelRes.statusCode, 200);
  assert.equal(getJob(job.id).executionBudget.modelActions, 1);
  assert.equal(modelRes.payload().toolCall.name, "read_file");
  assert.equal(upstreamBody.stream, false);
  assert.equal(upstreamBody.tool_choice, "required");
  assert.equal(upstreamBody.tools.length, 5);
  assert.deepEqual(upstreamBody.tools.map((tool) => tool.function.name), [
    "read_file",
    "write_file",
    "run_cmd",
    "browser_check",
    "finish"
  ]);
  assert.equal(upstreamBody.max_tokens, 8192);
  assert.doesNotMatch(JSON.stringify(modelRes.payload()), /model-secret|worker-secret/);
});

test("model action budget is consumed per GLM call and fails closed at the cap", async () => {
  const job = seedJob("job_worker_budget");
  const env = {
    SMEJJ_WORKER_TOKEN_SECRET: "worker-secret",
    SMEJJ_WORKER_MAX_MODEL_ACTIONS: "1",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu",
    SMEJJ_LLM_ZHIPU_API_KEY: "model-secret",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://model.example/v1"
  };
  const token = issueWorkerToken({ secret: env.SMEJJ_WORKER_TOKEN_SECRET, jobId: job.id, scopes: ["model"] });
  replaceJob({ ...job, executionBudget: { modelActions: 1, maxModelActions: 1 } }, { emitEvent: false });
  let fetchCalls = 0;
  const response = fakeRes();
  await handleWorkerModelAction(
    fakeReq({ jobId: job.id, messages: [{ role: "user", content: "Read index.js" }] }, token),
    response,
    { env, fetchImpl: async () => { fetchCalls += 1; throw new Error("must not call provider"); } }
  );
  assert.equal(response.statusCode, 429);
  assert.equal(response.payload().error, "job_model_action_budget_exhausted");
  assert.equal(fetchCalls, 0);
});

test("worker token cannot call the model after the job leaves an active phase", async () => {
  const job = seedJob("job_worker_terminal_status");
  const env = { SMEJJ_WORKER_TOKEN_SECRET: "worker-secret" };
  const token = issueWorkerToken({ secret: env.SMEJJ_WORKER_TOKEN_SECRET, jobId: job.id, scopes: ["model"] });
  replaceJob({ ...job, status: "passed", phase: "passed" }, { emitEvent: false });
  let fetchCalls = 0;
  const response = fakeRes();
  await handleWorkerModelAction(
    fakeReq({ jobId: job.id, messages: [{ role: "user", content: "Read index.js" }] }, token),
    response,
    { env, fetchImpl: async () => { fetchCalls += 1; } }
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload().error, "job_not_active");
  assert.equal(fetchCalls, 0);
});

test("autonomous model action budget must be durable before provider execution", async () => {
  const job = seedJob("job_worker_budget_durable");
  const env = {
    SMEJJ_AUTONOMOUS_LOOP_ENABLED: "YES",
    SMEJJ_WORKER_TOKEN_SECRET: "worker-secret",
    SMEJJ_LLM_PROVIDER_ORDER: "zhipu",
    SMEJJ_LLM_ZHIPU_API_KEY: "model-secret",
    SMEJJ_LLM_ZHIPU_BASE_URL: "https://model.example/v1"
  };
  const token = issueWorkerToken({ secret: env.SMEJJ_WORKER_TOKEN_SECRET, jobId: job.id, scopes: ["model"] });
  let fetchCalls = 0;
  const response = fakeRes();
  await handleWorkerModelAction(
    fakeReq({ jobId: job.id, messages: [{ role: "user", content: "Read index.js" }] }, token),
    response,
    { env, fetchImpl: async () => { fetchCalls += 1; throw new Error("must not call provider"); } }
  );
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload().error, "model_action_budget_persistence_failed");
  assert.equal(fetchCalls, 0);
});

test("model action budget writes a credential-free IDrive e2 Task Capsule object", async () => {
  const job = seedJob("job_worker_budget_object");
  const written = [];
  const result = await persistModelActionBudget({
    job: { ...job, executionBudget: { modelActions: 3, maxModelActions: 25 } },
    env: { IDRIVE_E2_ENDPOINT: "https://storage.example", IDRIVE_E2_ACCESS_KEY: "access", IDRIVE_E2_SECRET_KEY: "secret", IDRIVE_E2_BUCKET: "bucket" },
    nowMs: Date.parse("2026-07-10T08:00:00Z"),
    putObject: async (object) => { written.push(object); }
  });
  assert.equal(result.ok, true);
  assert.equal(written[0].key, job.taskCapsule.budget);
  const body = JSON.parse(written[0].body);
  assert.deepEqual(body.execution, { modelActions: 3, maxModelActions: 25 });
  assert.doesNotMatch(written[0].body, /access|secret/);
});

test("worker outcome objects bind evidence to the Task Capsule and never enable merge", () => {
  const job = seedJob("job_artifacts_test");
  const objects = buildWorkerOutcomeObjects(job, {
    ok: true,
    diff: "diff --git a/a.js b/a.js\n",
    diffSha256: "a".repeat(64),
    verification: {
      ok: true,
      checks: [
        ...["build", "typecheck", "lint", "security", "repository-hygiene", "security-scan", "unit", "integration"]
          .map((stage) => ({ stage, required: true, ok: true }))
      ]
    },
    browser: { required: false, ok: true, screenshots: [] },
    errors: [],
    iterations: [],
    approval: { required: true, mergePerformed: false },
    rollback: { baseCommit: "abc" },
    memoryUpdate: {
      learn: true,
      providerRightsCleared: true,
      providerRightsEvidenceId: "rights:memory-v1",
      privacySanitized: true,
      privacyEvidenceId: "privacy:memory-v1",
      repositoryRightsCleared: true,
      repositoryRightsEvidenceId: "repository:memory-v1"
    },
    finalReport: "done"
  });
  assert.ok(objects.some((object) => object.key === job.taskCapsule.patch));
  assert.ok(objects.some((object) => object.key.endsWith("approval.json") && /mergePerformed/.test(object.body)));
  assert.ok(objects.some((object) => object.key === `jobs/passed/${job.id}.json`));
  const memory = JSON.parse(objects.find((object) => object.key === job.taskCapsule.memoryUpdate).body);
  const finalStatus = JSON.parse(objects.at(-1).body);
  assert.equal(memory.learn, false);
  assert.equal(memory.candidate.providerRightsCleared, true);
  assert.equal(memory.candidate.privacySanitized, true);
  assert.equal(memory.candidate.repositoryRightsCleared, true);
  assert.equal(finalStatus.memoryMayLearn, true);
  assert.equal(finalStatus.memoryUpdateKey, job.taskCapsule.memoryUpdate);
  assert.equal(objects.at(-1).key, job.taskCapsule.status);
  assert.doesNotMatch(JSON.stringify(objects), /secret/i);
});

test("browser screenshots and exact human approval are durable Task Capsule objects", async () => {
  const job = seedJob("job_artifacts_approval");
  const jpeg = Buffer.from("verified-image");
  const objects = buildWorkerOutcomeObjects(job, {
    ok: true,
    diffSha256: "b".repeat(64),
    browser: { required: true, ok: true, screenshots: [{ name: "desktop.jpg", contentType: "image/jpeg", base64: jpeg.toString("base64") }] }
  });
  const screenshot = objects.find((object) => object.key.endsWith("browser-screenshots/desktop.jpg"));
  assert.deepEqual(screenshot.body, jpeg);
  assert.equal(screenshot.contentType, "image/jpeg");
  assert.equal(objects.at(-1).key, job.taskCapsule.status);

  const approval = { status: "human_approved", approvedAt: "2026-07-10T12:00:00Z", approvedDiffSha256: "b".repeat(64), mergeAllowed: false };
  const written = [];
  const persisted = await persistJobApprovalToIdrive({
    job,
    approval,
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    putObject: async (object) => written.push(object)
  });
  assert.equal(persisted.ok, true);
  assert.equal(written.length, 2);
  assert.ok(written.some((object) => object.key.endsWith("approval.json")));
  assert.ok(written.some((object) => object.key.includes("human_approval_requested")));
  assert.doesNotMatch(JSON.stringify(written), /mergeAllowed": true/);
});

test("failed draft publication has a separate durable audit and cannot rewrite verified artifacts", async () => {
  const job = seedJob("job_publication_audit");
  const written = [];
  const result = await persistPublicationAttemptToIdrive({
    job,
    publication: { status: "failed", attemptedAt: "2026-07-10T12:30:00Z", errors: [{ source: "github", detail: "response_lost" }], mergePerformed: false },
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    putObject: async (object) => written.push(object)
  });
  assert.equal(result.ok, true);
  assert.ok(written.some((object) => object.key.endsWith("publication.json")));
  assert.ok(written.some((object) => object.key.includes("draft_pr_publication_failed")));
  assert.equal(written.some((object) => object.key === job.taskCapsule.patch), false);
  assert.equal(written.some((object) => object.key === job.taskCapsule.status), false);
});

test("job hydration rebuilds a durable job after control-server memory loss", async () => {
  const original = seedJob("job_hydration_test");
  const root = original.taskCapsule.rootPrefix;
  clearJobs();
  const objects = new Map([
    [`jobs/open/${original.id}.json`, JSON.stringify({ taskCapsuleRoot: root, diffSha256: "d".repeat(64) })],
    [`${root}input.json`, JSON.stringify({ jobId: original.id, projectId: original.projectId, task: original.task, model: { id: original.model.id }, createdAt: original.createdAt, repository: null, context: {} })],
    [`${root}status.json`, JSON.stringify({ status: "running", phase: "running", progress: 0.6, message: "Hydrated", updatedAt: original.createdAt })],
    [`${root}patch.diff`, "diff --git a/a b/a\n"],
    [`${root}final-report.md`, "Verified parent context"],
    [`${root}repository.json`, JSON.stringify({ baseCommit: "abc" })],
    [`${root}budget.json`, JSON.stringify({ execution: { modelActions: 7, maxModelActions: 25 } })]
  ]);
  const hydrated = await hydrateJobFromIdrive(original.id, {
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    getObject: async (key) => ({ body: objects.get(key) })
  });
  assert.equal(hydrated.status, "running");
  assert.equal(getJob(original.id).message, "Hydrated");
  assert.equal(hydrated.result.diffSha256, "d".repeat(64));
  assert.equal(hydrated.result.finalReport, "Verified parent context");
  assert.deepEqual(hydrated.executionBudget, { modelActions: 7, maxModelActions: 25 });
});

test("durable job listing rehydrates recent Task Capsules in bounded batches", async () => {
  clearJobs();
  const calls = [];
  const result = await hydrateRecentJobsFromIdrive({
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    limit: 2,
    listObjects: async () => ({ keys: [
      "jobs/open/job_old.json",
      "jobs/open/job_new.json",
      "jobs/open/not-a-job.txt"
    ] }),
    hydrateJob: async (jobId) => { calls.push(jobId); return { id: jobId }; }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["job_new", "job_old"]);
  assert.deepEqual(result.hydrated, ["job_new", "job_old"]);
});

test("job cancellation persistence writes the cancelled status marker last", async () => {
  const job = seedJob("job_cancel_durable");
  const written = [];
  const result = await persistJobCancellationToIdrive({
    job,
    env: { IDRIVE_E2_ENDPOINT: "https://e2.example", IDRIVE_E2_ACCESS_KEY: "x", IDRIVE_E2_SECRET_KEY: "y", IDRIVE_E2_BUCKET: "z" },
    putObject: async (object) => written.push(object)
  });
  assert.equal(result.ok, true);
  assert.equal(written.at(-1).key, job.taskCapsule.status);
  assert.match(written.at(-1).body, /"status": "cancelled"/);
  assert.ok(written.some((object) => object.key === `jobs/cancelled/${job.id}.json`));
});

test("job cancellation stops locally even when durable audit storage fails", async () => {
  const job = seedJob("job_cancel_storage_failure");
  const response = fakeRes();
  await handleCancelJob(
    new URL(`https://control.example/api/jobs/${job.id}/cancel`),
    fakeReq({}, ""),
    response,
    { env: {}, persistCancellation: async () => ({ ok: false, reason: "storage_unavailable" }) }
  );
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload().cancelledLocally, true);
  assert.equal(getJob(job.id).status, "cancelled");
  assert.equal(getJob(job.id).durableCancellation, false);
});

test("job cancellation cannot rewrite a terminal verified result", async () => {
  const job = seedJob("job_cancel_terminal");
  replaceJob({ ...job, status: "passed", phase: "passed" });
  const response = fakeRes();
  let persistenceCalls = 0;
  await handleCancelJob(
    new URL(`https://control.example/api/jobs/${job.id}/cancel`),
    fakeReq({}, ""),
    response,
    { env: {}, persistCancellation: async () => { persistenceCalls += 1; return { ok: true }; } }
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload().error, "job_not_cancellable");
  assert.equal(getJob(job.id).status, "passed");
  assert.equal(persistenceCalls, 0);
});

test("human approval is fail-closed until the exact diff approval is durable", async () => {
  const original = seedJob("job_approval_gate");
  replaceJob({ ...original, status: "passed", result: { diffSha256: "c".repeat(64) } });
  const url = new URL(`https://control.example/api/jobs/${original.id}/approve`);
  const failed = fakeRes();
  await handleApproveJob(url, fakeReq({ diffSha256: "c".repeat(64) }), failed, {
    env: {},
    persistApproval: async () => ({ ok: false, reason: "storage_unavailable" })
  });
  assert.equal(failed.statusCode, 503);
  assert.equal(getJob(original.id).approval.status, "pending");

  const passed = fakeRes();
  await handleApproveJob(url, fakeReq({ diffSha256: "c".repeat(64) }), passed, {
    env: {},
    persistApproval: async () => ({ ok: true, objectCount: 2 })
  });
  assert.equal(passed.statusCode, 200);
  assert.equal(getJob(original.id).approval.status, "human_approved");
  assert.equal(passed.payload().mergePerformed, false);
});

test("scheduler respects concurrency and preserves queue order", async () => {
  const scheduler = createJobScheduler({ maxConcurrency: 2 });
  const releases = [];
  const started = [];
  for (const jobId of ["a", "b", "c"]) {
    scheduler.enqueue(jobId, () => new Promise((resolve) => { started.push(jobId); releases.push(resolve); }));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b"]);
  assert.deepEqual(scheduler.snapshot().queued.map((item) => item.jobId), ["c"]);
  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b", "c"]);
  for (const release of releases) release();
});

test("scheduler requests cancellation for a running job", async () => {
  const scheduler = createJobScheduler({ maxConcurrency: 1 });
  let release;
  let abortCalls = 0;
  scheduler.enqueue(
    "running-job",
    () => new Promise((resolve) => { release = resolve; }),
    () => { abortCalls += 1; return true; }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(scheduler.cancel("running-job"), { ok: true, cancelled: "running", abortRequested: true });
  assert.equal(abortCalls, 1);
  assert.equal(scheduler.cancel("running-job").abortRequested, true);
  assert.equal(abortCalls, 1);
  release();
});

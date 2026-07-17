import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createIdriveLiteCodingJob } from "../src/jobs/idriveLiteJob.js";
import { authenticatedUserId, filterJobsForUser, filterSchedulerSnapshot, isJobOwnedByUser, isProjectOwnedByUser } from "../control-server/src/jobs/jobAccess.js";
import { createJobClaimStore } from "../control-server/src/jobs/jobClaimStore.js";
import { signedS3Put } from "../control-server/src/storage/s3Signer.js";
import { hashActionLog } from "../control-server/src/shared/hash.js";
import {
  attachGithubInstallationToken,
  issueGithubRepositoryToken
} from "../control-server/src/github/githubApp.js";
import { inferDeterministicReplay } from "../control-server/src/routes/jobRoutes.js";
import { createWorkspace } from "../workers/smejj-worker/sandbox.mjs";
import { runCodingJob } from "../workers/smejj-worker/agentloop.mjs";
import { assertIsolationPolicy, readIsolationPolicy } from "../workers/smejj-worker/worker.mjs";

test("tenant job access exposes only the authenticated owner's jobs and queue entries", () => {
  const alice = { email: "alice@example.com" };
  const bob = { email: "bob@example.com" };
  const jobs = [
    { id: "job_alice", userId: authenticatedUserId(alice) },
    { id: "job_bob", userId: authenticatedUserId(bob) },
    { id: "job_legacy", userId: "" }
  ];
  assert.equal(isJobOwnedByUser(jobs[0], alice), true);
  assert.equal(isJobOwnedByUser(jobs[0], bob), false);
  assert.deepEqual(filterJobsForUser(jobs, alice).map((job) => job.id), ["job_alice"]);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  assert.deepEqual(filterSchedulerSnapshot({
    maxConcurrency: 3,
    active: ["job_alice", "job_bob"],
    queued: [{ jobId: "job_legacy" }, { jobId: "job_alice" }]
  }, alice, (id) => byId.get(id)), {
    maxConcurrency: 3,
    active: ["job_alice"],
    queued: [{ jobId: "job_alice" }]
  });
});

test("tenant and project access fail closed when a legacy owner or tenant scope differs", () => {
  const alice = { email: "alice@example.com" };
  const bob = { email: "bob@example.com" };
  const aliceId = authenticatedUserId(alice);
  const bobId = authenticatedUserId(bob);
  assert.equal(isJobOwnedByUser({ userId: aliceId, tenantId: aliceId, projectId: "project_a" }, alice), true);
  assert.equal(isJobOwnedByUser({ userId: aliceId, tenantId: bobId, projectId: "project_a" }, alice), false);
  assert.equal(isJobOwnedByUser({ userId: aliceId, projectId: "project_a" }, alice), true);
  assert.equal(isProjectOwnedByUser({ ownerUserId: aliceId, tenantId: aliceId }, alice), true);
  assert.equal(isProjectOwnedByUser({ ownerUserId: aliceId, tenantId: bobId }, alice), false);
  assert.equal(isProjectOwnedByUser({ ownerUserId: aliceId }, bob), false);
});

test("durable claims use compare-and-swap fencing, heartbeat and append-only audit", async () => {
  let clock = Date.parse("2026-07-11T10:40:00.000Z");
  const storage = memoryCasStore();
  const job = createIdriveLiteCodingJob({
    jobId: "job_claim_fencing",
    projectId: "project_claims",
    userId: "user_claim_owner",
    task: "Verify durable claim fencing",
    createdAt: "2026-07-11T10:39:00.000Z"
  });
  const options = {
    env: {
      IDRIVE_E2_ENDPOINT: "https://storage.example",
      IDRIVE_E2_ACCESS_KEY: "test",
      IDRIVE_E2_SECRET_KEY: "test",
      IDRIVE_E2_BUCKET: "test",
      SMEJJ_JOB_CLAIM_TTL_MS: "10000"
    },
    getObject: storage.getObject,
    putObject: storage.putObject,
    nowMs: () => clock
  };
  const firstStore = createJobClaimStore({ ...options, controlId: "control_first" });
  const secondStore = createJobClaimStore({ ...options, controlId: "control_second" });
  const first = await firstStore.claim(job);
  assert.equal(first.ok, true);
  assert.equal(first.lease.fence, 1);
  assert.equal((await secondStore.claim(job)).reason, "job_claim_active");

  clock += 4_000;
  const renewed = await firstStore.heartbeat(job, first.lease);
  assert.equal(renewed.ok, true);
  clock += 7_000;
  assert.equal((await secondStore.claim(job)).reason, "job_claim_active");
  assert.equal((await firstStore.complete(job, renewed.lease, "passed")).ok, true);

  const next = await secondStore.claim(job);
  assert.equal(next.ok, true);
  assert.equal(next.lease.fence, 2);
  const keys = [...storage.objects.keys()];
  assert.ok(keys.some((key) => key.endsWith("-claimed-" + first.lease.claimId + ".json")));
  assert.ok(keys.some((key) => key.includes("-completed-" + first.lease.claimId + ".json")));
});

test("S3 signer binds If-Match into a conditional request without exposing credentials", async () => {
  let captured;
  const result = await signedS3Put({
    endpoint: "https://storage.example",
    region: "us-west-2",
    accessKey: "ACCESS",
    secretKey: "secret-never-visible",
    bucket: "bucket",
    key: "jobs/claims/job.json",
    body: "{}\n",
    contentType: "application/json",
    ifMatch: '"etag-1"',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response("", { status: 200, headers: { etag: '"etag-2"' } });
    }
  });
  assert.equal(captured.options.headers["If-Match"], '"etag-1"');
  assert.match(captured.options.headers.Authorization, /SignedHeaders=content-type;host;if-match;x-amz-content-sha256;x-amz-date/);
  assert.doesNotMatch(JSON.stringify(captured), /secret-never-visible/);
  assert.equal(result.etag, '"etag-2"');
});

test("read-only analysis succeeds without a diff and blocks mutation tools", async () => {
  const actions = [
    { id: "write_blocked", name: "write_file", arguments: { path: "index.js", content: "export const value = 2;\n" } },
    { id: "finish_analysis", name: "finish", arguments: { summary: "The exported value is currently 1." } }
  ];
  const result = await runCodingJob({
    jobId: "job_read_only_analysis",
    task: "Analyze the current exported value without changing files.",
    executionMode: "analyze",
    files: [{ path: "index.js", content: "export const value = 1;\n" }]
  }, {
    skipTokenValidation: true,
    requestAction: async () => ({ toolCall: actions.shift() })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "analyzed");
  assert.equal(result.diff, "");
  assert.equal(result.diffSha256, null);
  assert.equal(result.approval.required, false);
  assert.equal(result.analysis.readOnly, true);
  assert.equal(result.analysis.repositoryChanged, false);
  assert.equal(result.iterations[0].error, "read_only_analysis_write_blocked");
  assert.match(result.actionLogSha256, /^[a-f0-9]{64}$/);
});

test("read-only analysis rejects explicit edits before a workspace mutation", async () => {
  const result = await runCodingJob({
    jobId: "job_read_only_explicit_edit",
    task: "Analyze only.",
    executionMode: "analyze",
    files: [{ path: "index.js", content: "export const value = 1;\n" }],
    edits: [{ path: "index.js", content: "export const value = 2;\n" }],
    modelMode: "disabled"
  }, { skipTokenValidation: true });
  assert.equal(result.ok, false);
  assert.equal(result.executionMode, "analyze");
  assert.equal(result.errors[0].detail, "read_only_analysis_mutation_input_blocked");
});

test("deterministic replay applies the verified action log and requires the same diff SHA", async () => {
  const repository = {
    url: "https://github.com/example/replay-demo",
    baseRef: "main",
    baseCommit: "a".repeat(40),
    branch: "smejj.com/agent/replay",
    publishMode: "diff-only"
  };
  const prepareRepository = async () => {
    const workspace = await createWorkspace([{ path: "index.js", content: "export const value = 1;\n" }]);
    return { ...workspace, repository };
  };
  const sourceActions = [
    { id: "source_write", name: "write_file", arguments: { path: "index.js", content: "export const value = 2;\n" } },
    { id: "source_finish", name: "finish", arguments: { summary: "Set value to 2." } }
  ];
  const source = await runCodingJob({
    jobId: "job_replay_source",
    task: "Set value to 2.",
    repository: { url: repository.url, baseRef: repository.baseRef }
  }, {
    skipTokenValidation: true,
    prepareRepository,
    requestAction: async () => ({ toolCall: sourceActions.shift() })
  });
  assert.equal(source.ok, true);
  assert.match(source.actionLogSha256, /^[a-f0-9]{64}$/);

  let modelCalled = false;
  const replay = await runCodingJob({
    jobId: "job_replay_target",
    task: "Set value to 2.",
    repository: { url: repository.url, baseRef: repository.baseRef },
    modelMode: "disabled",
    replayPlan: {
      actionLog: source.actionLog,
      actionLogSha256: source.actionLogSha256
    }
  }, {
    skipTokenValidation: true,
    prepareRepository,
    requestAction: async () => { modelCalled = true; throw new Error("model_must_not_run"); }
  });
  assert.equal(replay.ok, true);
  assert.equal(modelCalled, false);
  assert.equal(replay.diffSha256, source.diffSha256);
  assert.equal(replay.actionLogSha256, source.actionLogSha256);
  assert.equal(replay.replay.deterministic, true);
  assert.equal(replay.replay.diffMatched, true);
});

test("deterministic replay hashes schema v2 canonically across object key order", async () => {
  const repository = {
    url: "https://github.com/example/replay-canonical",
    baseRef: "main",
    baseCommit: "b".repeat(40),
    branch: "smejj.com/agent/replay-canonical",
    publishMode: "diff-only"
  };
  const prepareRepository = async () => {
    const workspace = await createWorkspace([{ path: "index.js", content: "export const value = 1;\n" }]);
    return { ...workspace, repository };
  };
  const actions = [
    { id: "write", name: "write_file", arguments: { path: "index.js", content: "export const value = 2;\n" } },
    { id: "finish", name: "finish", arguments: { summary: "Set value to 2." } }
  ];
  const source = await runCodingJob({
    jobId: "job_replay_canonical_source",
    task: "Set value to 2 canonically.",
    repository: { url: repository.url, baseRef: repository.baseRef }
  }, {
    skipTokenValidation: true,
    prepareRepository,
    requestAction: async () => ({ toolCall: actions.shift() })
  });
  assert.equal(source.actionLog.schemaVersion, 2);
  assert.equal(hashActionLog(source.actionLog), source.actionLogSha256);
  const reordered = {
    expectedDiffSha256: source.actionLog.expectedDiffSha256,
    finishSummary: source.actionLog.finishSummary,
    actions: source.actionLog.actions,
    repository: source.actionLog.repository,
    baseCommit: source.actionLog.baseCommit,
    executionMode: source.actionLog.executionMode,
    schemaVersion: source.actionLog.schemaVersion
  };
  const replay = await runCodingJob({
    jobId: "job_replay_canonical_target",
    task: "Set value to 2 canonically.",
    repository: { url: repository.url, baseRef: repository.baseRef },
    modelMode: "disabled",
    replayPlan: { actionLog: reordered, actionLogSha256: source.actionLogSha256 }
  }, { skipTokenValidation: true, prepareRepository });
  assert.equal(replay.ok, true);
  assert.equal(replay.diffSha256, source.diffSha256);
});

test("worker isolation policy reports the shared boundary and fails closed when hard isolation is required", () => {
  const shared = readIsolationPolicy({});
  assert.equal(shared.hard, false);
  assert.equal(shared.reason, "shared_process_profile_not_hard_isolated");
  assert.throws(() => assertIsolationPolicy({ SMEJJ_REQUIRE_HARD_ISOLATION: "YES" }), /worker_isolation_required/);
  const attested = {
    SMEJJ_REQUIRE_HARD_ISOLATION: "YES",
    SMEJJ_RUNTIME_ISOLATION_ATTESTED: "YES",
    SMEJJ_RUNTIME_EPHEMERAL: "YES",
    SMEJJ_RUNTIME_ISOLATION_PROFILE: "container-v1",
    SMEJJ_RUNTIME_EGRESS_POLICY: "allowlist"
  };
  assert.deepEqual(readIsolationPolicy(attested), {
    required: true,
    hard: true,
    enforced: true,
    profile: "container-v1",
    egress: "allowlist",
    ephemeral: true,
    attested: true,
    reason: "attested_ephemeral_container"
  });
  assert.equal(assertIsolationPolicy(attested).enforced, true);
});

test("the existing replay UI request is inferred only from an exact recent verified job", () => {
  const owner = "user_replay_owner";
  const source = {
    id: "job_recent_source",
    userId: owner,
    status: "passed",
    task: "Fix the exact bug",
    executionMode: "edit",
    repository: { url: "https://github.com/example/demo", baseRef: "main" },
    updatedAt: "2026-07-11T10:45:00.000Z",
    result: { actionLog: { schemaVersion: 1 }, actionLogSha256: "a".repeat(64) }
  };
  const inferred = inferDeterministicReplay({
    task: source.task,
    repository: source.repository
  }, owner, {
    jobs: [source],
    nowMs: Date.parse("2026-07-11T10:50:00.000Z")
  });
  assert.deepEqual(inferred.replay, {
    deterministic: true,
    sourceJobId: source.id,
    sourceActionLogSha256: "a".repeat(64)
  });
  const unrelated = inferDeterministicReplay({
    task: "A different task",
    repository: source.repository
  }, owner, {
    jobs: [source],
    nowMs: Date.parse("2026-07-11T10:50:00.000Z")
  });
  assert.equal(unrelated.replay, undefined);
});

test("GitHub App write tokens are blocked while read tokens stay repository-scoped and short-lived", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
  const env = {
    SMEJJ_GITHUB_APP_ID: "123456",
    SMEJJ_GITHUB_APP_INSTALLATION_ID: "654321",
    SMEJJ_GITHUB_APP_PRIVATE_KEY: privatePem,
    SMEJJ_GITHUB_OWNER_ALLOWLIST: "example",
    SMEJJ_GITHUB_REPOSITORY_ALLOWLIST: "example/private-demo"
  };
  const nowMs = Date.parse("2026-07-11T11:00:00.000Z");
  let request;
  let fetchCalls = 0;
  const fetchImpl = async (url, options) => {
    fetchCalls += 1;
    request = { url, options };
    return new Response(JSON.stringify({
      token: "ghs_test_installation_token_123456789",
      expires_at: "2026-07-11T11:59:00.000Z",
      permissions: { contents: "read", metadata: "read" },
      repositories: [{ full_name: "example/private-demo" }]
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  const blocked = await issueGithubRepositoryToken({
    repository: { url: "https://github.com/example/private-demo" },
    write: true,
    env,
    fetchImpl,
    nowMs
  });
  assert.deepEqual(blocked, { ok: false, reason: "trusted_publisher_boundary_required" });
  assert.equal(fetchCalls, 0);

  const issued = await issueGithubRepositoryToken({
    repository: { url: "https://github.com/example/private-demo" },
    write: false,
    env,
    fetchImpl,
    nowMs
  });
  assert.equal(issued.ok, true);
  assert.equal(issued.repository, "example/private-demo");
  assert.deepEqual(JSON.parse(request.options.body), {
    repositories: ["private-demo"],
    permissions: { contents: "read", metadata: "read" }
  });
  assert.equal(request.options.headers["X-GitHub-Api-Version"], "2026-03-10");
  const jwt = request.options.headers.Authorization.replace(/^Bearer /, "");
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.equal(JSON.parse(Buffer.from(payload, "base64url")).iss, "123456");
  assert.equal(crypto.verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);

  for (const providerResponse of [
    {
      token: "ghs_overbroad_permissions_123456789",
      expires_at: "2026-07-11T11:59:00.000Z",
      permissions: { contents: "write", metadata: "read" },
      repositories: [{ full_name: "example/private-demo" }]
    },
    {
      token: "ghs_multiple_repositories_123456789",
      expires_at: "2026-07-11T11:59:00.000Z",
      permissions: { contents: "read", metadata: "read" },
      repositories: [{ full_name: "example/private-demo" }, { full_name: "example/other" }]
    }
  ]) {
    const rejected = await issueGithubRepositoryToken({
      repository: { url: "https://github.com/example/private-demo" },
      write: false,
      env,
      fetchImpl: async () => new Response(JSON.stringify(providerResponse), { status: 201 }),
      nowMs
    });
    assert.deepEqual(rejected, { ok: false, reason: "github_installation_token_response_invalid" });
  }
});

test("GitHub App credentials are attached only for private clone or approved publication", async () => {
  const publicPayload = {
    repository: { url: "https://github.com/example/public-demo", visibility: "public", publishMode: "diff-only" },
    approval: { createDraftPr: false }
  };
  assert.equal(await attachGithubInstallationToken(publicPayload, { env: {} }), publicPayload);
  await assert.rejects(() => attachGithubInstallationToken({
    repository: { url: "https://github.com/example/public-demo", visibility: "public", publishMode: "draft-pr" },
    approval: { createDraftPr: true }
  }, { env: {} }), /trusted_publisher_boundary_required/);

  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    SMEJJ_GITHUB_APP_ID: "123456",
    SMEJJ_GITHUB_APP_INSTALLATION_ID: "654321",
    SMEJJ_GITHUB_APP_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }),
    SMEJJ_GITHUB_OWNER_ALLOWLIST: "example",
    SMEJJ_GITHUB_REPOSITORY_ALLOWLIST: "example/private-demo"
  };
  const privatePayload = {
    repository: { url: "https://github.com/example/private-demo", visibility: "private", publishMode: "diff-only" },
    approval: { createDraftPr: false }
  };
  const attached = await attachGithubInstallationToken(privatePayload, {
    env,
    fetchImpl: async () => new Response(JSON.stringify({
      token: "ghs_test_installation_token_123456789",
      expires_at: new Date(Date.now() + 55 * 60_000).toISOString(),
      permissions: { contents: "read", metadata: "read" },
      repositories: [{ full_name: "example/private-demo" }]
    }), { status: 201 })
  });
  assert.match(attached.repository.token, /^ghs_/);
  assert.equal(attached.credentialLease.persisted, false);
  assert.equal(JSON.stringify(privatePayload).includes("ghs_"), false);
});

function memoryCasStore() {
  const objects = new Map();
  let version = 0;
  return {
    objects,
    async getObject(key) {
      const value = objects.get(key);
      return value
        ? { ok: true, status: 200, body: value.body, etag: value.etag }
        : { ok: false, status: 404, body: "", etag: "" };
    },
    async putObject(object) {
      const current = objects.get(object.key);
      if (object.ifNoneMatch === "*" && current) {
        return { ok: false, status: 412, created: false, conditionEnforced: true };
      }
      if (object.ifMatch && (!current || object.ifMatch !== current.etag)) {
        return { ok: false, status: 412, created: false, conditionEnforced: true };
      }
      const etag = `"v${++version}"`;
      objects.set(object.key, { body: String(object.body), etag });
      return { ok: true, status: current ? 200 : 201, created: true, conditionEnforced: Boolean(object.ifMatch || object.ifNoneMatch), etag };
    }
  };
}

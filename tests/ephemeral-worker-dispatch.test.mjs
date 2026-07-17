import test from "node:test";
import assert from "node:assert/strict";
import { createReviewedEphemeralWorkerDispatch } from "../control-server/src/orchestrator/ephemeralWorkerDispatch.js";

const COMMIT = "a".repeat(40);

test("reviewed ephemeral dispatch is fail-closed before provider calls when review evidence is absent", () => {
  let providerCalls = 0;
  const env = runtimeEnv();
  delete env.SMEJJ_EPHEMERAL_SECURITY_REVIEW_ID;
  const dispatch = createReviewedEphemeralWorkerDispatch({
    env,
    job: runtimeJob(),
    createGroup: async () => { providerCalls += 1; },
    startGroup: async () => { providerCalls += 1; }
  });
  assert.equal(dispatch, null);
  assert.equal(providerCalls, 0);
});

test("reviewed dispatch selects the browser runtime only when preview verification is required", () => {
  const coding = createReviewedEphemeralWorkerDispatch({ env: runtimeEnv(), job: runtimeJob() });
  const browser = createReviewedEphemeralWorkerDispatch({
    env: runtimeEnv(),
    job: { ...runtimeJob(), preview: { required: true } }
  });
  assert.equal(coding.plan.runtimeProfile, "coding");
  assert.equal(browser.plan.runtimeProfile, "browser");
});

test("reviewed dispatch attests, reserves, starts with authenticated ingress, then verifies stop before capacity release", async () => {
  const events = [];
  const env = runtimeEnv();
  const job = runtimeJob();
  let watchdogState = { phase: "idle", stopVerified: false, completionPersisted: false, attempts: 0 };
  const capacityStore = {
    snapshot: async () => {
      events.push("capacity-snapshot");
      return { ok: true, snapshot: { activeSlots: 0 } };
    },
    acquire: async (claimedJob, lease) => {
      events.push("capacity-acquire");
      assert.equal(claimedJob.id, job.id);
      assert.equal(lease.groupName.startsWith("smejj-job-"), true);
      return {
        ok: true,
        lease: {
          capacityId: "capacity_11111111-1111-4111-8111-111111111111",
          jobId: job.id,
          watchdogLeaseId: lease.leaseId,
          deadlineAt: lease.deadlineAt,
          budgetUsd: lease.budgetUsd
        }
      };
    },
    release: async (_releasedJob, _lease, evidence) => {
      events.push("capacity-release");
      assert.equal(evidence.stopVerified, true);
      assert.equal(evidence.completionPersisted, true);
      return { ok: true };
    }
  };
  const dispatch = createReviewedEphemeralWorkerDispatch({
    env,
    job,
    capacityStore,
    attestRuntime: async () => {
      events.push("runtime-attestation");
      return { ok: true };
    },
    leaseBuilder: ({ env: groupEnv }) => {
      events.push("lease-build");
      return { ok: true, lease: runtimeLease(groupEnv.SALAD_CONTAINER_GROUP_NAME) };
    },
    persistLease: async () => {
      events.push("lease-persist");
      return { ok: true, persisted: true };
    },
    persistCompletion: async () => {
      events.push("completion-persist");
      return { ok: true, persisted: true, immutable: true, contentVerified: true };
    },
    watchdogFactory: (options) => ({
      async prepareLease(lease) {
        const persisted = await options.persistLease(lease);
        watchdogState = { ...watchdogState, phase: "prepared" };
        return { ok: persisted.ok, persisted: persisted.persisted };
      },
      armPreparedLease() {
        events.push("watchdog-arm");
        watchdogState = { ...watchdogState, phase: "armed", armed: true };
        return { ok: true, armed: true };
      },
      async enforceStop(reason) {
        events.push(`stop:${reason}`);
        await options.stopWorker();
        await options.persistCompletion({});
        watchdogState = {
          phase: "stop-verified",
          stopVerified: true,
          completionPersisted: true,
          attempts: 1,
          lastEnforcement: { attemptedAt: "2026-07-11T12:30:00.000Z" }
        };
        return watchdogState;
      },
      status: () => watchdogState
    }),
    createGroup: async ({ plan }) => {
      events.push("provider-create");
      assert.equal(plan.payload.networking.auth, true);
      return { ok: true, status: 201 };
    },
    waitUntilStartable: async () => {
      events.push("worker-startable");
      return { current_state: { status: "stopped" }, pending_change: false };
    },
    startGroup: async () => {
      events.push("provider-start");
      return { ok: true, status: 202 };
    },
    stopGroup: async () => {
      events.push("provider-stop");
      return { ok: true, status: 202 };
    },
    waitUntilReady: async () => {
      events.push("worker-ready");
      return "https://job-ready.salad.cloud";
    },
    tokenIssuer: () => "signed-worker-token",
    fetchImpl: async (url, options) => {
      events.push("worker-run");
      assert.equal(url, "https://job-ready.salad.cloud/run");
      assert.equal(options.headers["Salad-Api-Key"], env.SALAD_API_KEY);
      assert.equal(options.headers.Authorization, "Bearer signed-worker-token");
      assert.equal(JSON.parse(options.body).jobId, job.id);
      return new Response(JSON.stringify({ ok: true, status: "verified", errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(typeof dispatch, "function");
  assert.equal(dispatch.plan.authenticatedIngress, true);
  const outcome = await dispatch({ jobId: job.id, task: "Read and verify" });
  assert.equal(outcome.ok, true);
  const closed = await dispatch.close(job.id, "job_completed");
  assert.equal(closed.stopVerified, true);
  assert.equal(closed.capacityReleased, true);
  assert.equal(closed.deletionPerformed, false);
  assert.deepEqual(events, [
    "runtime-attestation",
    "capacity-snapshot",
    "lease-build",
    "lease-persist",
    "capacity-acquire",
    "provider-create",
    "worker-startable",
    "provider-start",
    "watchdog-arm",
    "worker-ready",
    "worker-run",
    "stop:job_completed",
    "provider-stop",
    "completion-persist",
    "capacity-release"
  ]);
});

test("runtime attestation failure prevents leases, capacity changes and Salad calls", async () => {
  const calls = [];
  const dispatch = createReviewedEphemeralWorkerDispatch({
    env: runtimeEnv(),
    job: runtimeJob(),
    attestRuntime: async () => {
      calls.push("attest");
      return { ok: false, reason: "attestation_rejected" };
    },
    capacityStore: {
      snapshot: async () => { calls.push("capacity"); return { ok: true, snapshot: { activeSlots: 0 } }; }
    },
    createGroup: async () => { calls.push("create"); return { ok: true }; },
    startGroup: async () => { calls.push("start"); return { ok: true }; }
  });
  await assert.rejects(() => dispatch({ jobId: runtimeJob().id }), /attestation_rejected/);
  assert.deepEqual(calls, ["attest"]);
});

test("reviewed dispatch cancellation during readiness verifies stop and releases capacity", async () => {
  const env = runtimeEnv();
  const job = runtimeJob();
  let watchdogState = { phase: "idle", stopVerified: false, completionPersisted: false, attempts: 0 };
  let readinessSignal = null;
  let stopCalls = 0;
  let releaseCalls = 0;
  const dispatch = createReviewedEphemeralWorkerDispatch({
    env,
    job,
    attestRuntime: async () => ({ ok: true }),
    leaseBuilder: ({ env: groupEnv }) => ({ ok: true, lease: runtimeLease(groupEnv.SALAD_CONTAINER_GROUP_NAME) }),
    persistLease: async () => ({ ok: true, persisted: true }),
    persistCompletion: async () => ({ ok: true, persisted: true, immutable: true, contentVerified: true }),
    capacityStore: {
      snapshot: async () => ({ ok: true, snapshot: { activeSlots: 0 } }),
      acquire: async () => ({ ok: true, lease: { capacityId: "capacity-cancel", jobId: job.id } }),
      release: async (_job, _lease, evidence) => {
        releaseCalls += 1;
        assert.equal(evidence.stopVerified, true);
        return { ok: true };
      }
    },
    watchdogFactory: (options) => ({
      async prepareLease(lease) {
        const persisted = await options.persistLease(lease);
        watchdogState = { ...watchdogState, phase: "prepared" };
        return { ok: persisted.ok, persisted: persisted.persisted };
      },
      armPreparedLease() {
        watchdogState = { ...watchdogState, phase: "armed", armed: true };
        return { ok: true, armed: true };
      },
      async enforceStop() {
        stopCalls += 1;
        await options.stopWorker();
        await options.persistCompletion({});
        watchdogState = {
          phase: "stop-verified",
          stopVerified: true,
          completionPersisted: true,
          attempts: 1,
          lastEnforcement: { attemptedAt: "2026-07-12T12:00:00.000Z" }
        };
        return watchdogState;
      },
      status: () => watchdogState
    }),
    createGroup: async () => ({ ok: true, status: 201 }),
    waitUntilStartable: async () => ({ current_state: { status: "stopped" }, pending_change: false }),
    startGroup: async () => ({ ok: true, status: 202 }),
    stopGroup: async () => ({ ok: true, status: 202 }),
    waitUntilReady: async (_groupEnv, { signal }) => {
      readinessSignal = signal;
      await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("ephemeral_worker_cancelled")), { once: true });
      });
    }
  });
  const pending = dispatch({ jobId: job.id, task: "cancel during readiness" });
  while (!readinessSignal) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dispatch.cancel(job.id), true);
  await assert.rejects(pending, /ephemeral_worker_cancelled/);
  const closed = await dispatch.close(job.id, "job_cancelled");
  assert.equal(readinessSignal.aborted, true);
  assert.equal(closed.stopVerified, true);
  assert.equal(closed.completionPersisted, true);
  assert.equal(closed.capacityReleased, true);
  assert.equal(stopCalls, 1);
  assert.equal(releaseCalls, 1);
  assert.equal(dispatch.cancel(job.id), false);
});

function runtimeEnv() {
  return {
    SALAD_API_KEY: "salad-test-key",
    SALAD_ORGANIZATION_NAME: "smejj-org",
    SALAD_PROJECT_NAME: "smejj-project",
    SMEJJ_EPHEMERAL_WORKER_ENABLED: "YES",
    SMEJJ_EPHEMERAL_SECURITY_REVIEW_ID: "SEC-2026-07-11-EPHEMERAL-RC1",
    SMEJJ_EPHEMERAL_TRUSTED_REPOS_ONLY: "YES",
    SMEJJ_EPHEMERAL_RUNTIME_SOURCE_REPOSITORY: "SmejjCom/smejj-control",
    SMEJJ_EPHEMERAL_WORKER_SOURCE_BASE: `https://raw.githubusercontent.com/SmejjCom/smejj-control/${COMMIT}/runtime/ephemeral-worker`,
    SMEJJ_EPHEMERAL_WORKER_BOOTSTRAP_SHA256: "b".repeat(64),
    SMEJJ_EPHEMERAL_WORKER_MANIFEST_SHA256: "c".repeat(64),
    SMEJJ_CONTROL_ORIGIN: "https://control.example",
    SMEJJ_WORKER_REQUIRE_REPO_ALLOWLIST: "YES",
    SMEJJ_WORKER_GITHUB_OWNER_ALLOWLIST: "smejjcom",
    SMEJJ_WORKER_TOKEN_SECRET: "worker-test-secret",
    SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "YES",
    CONFIRM_SALAD_CREATE: "YES",
    CONFIRM_SALAD_START: "YES",
    CONFIRM_SALAD_STOP: "YES",
    SMEJJ_BUDGET_MAX_USD_PER_JOB: "0.10",
    SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "20",
    SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
    SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "0.10",
    SMEJJ_WORKER_BUDGET_USD: "0.10",
    SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "15"
  };
}

function runtimeJob() {
  return {
    id: "job_dispatch_001",
    userId: "user_001",
    taskCapsule: { rootPrefix: "jobs/2026/07/11/ab/job_dispatch_001/" }
  };
}

function runtimeLease(groupName) {
  return {
    schemaVersion: 1,
    leaseId: "lease-dispatch-0001",
    groupName,
    preparedAt: "2026-07-11T12:00:00.000Z",
    deadlineAt: "2026-07-11T12:20:00.000Z",
    maxRuntimeMinutes: 20,
    budgetUsd: 0.10
  };
}

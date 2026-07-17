import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  handleSaladCreate,
  handleSaladStart,
  handleSaladStatus,
  handleSaladStop,
  recoverRuntimeWatchdogFromIdrive
} from "../control-server/src/routes/saladRoutes.js";
import {
  buildWatchdogLease,
  loadCurrentWatchdogLease,
  persistWatchdogCompletion,
  persistWatchdogLease
} from "../control-server/src/budget/watchdogLeaseStore.js";

const VALID_ENV = Object.freeze({
  SALAD_API_KEY: "test-secret-never-returned",
  SALAD_ORGANIZATION_NAME: "smejj-org",
  SALAD_PROJECT_NAME: "smejj-project",
  SALAD_CONTAINER_GROUP_NAME: "smejj-glm-worker",
  SALAD_GLM_WORKER_IMAGE: "registry.example/smejj-glm-worker:fixed",
  SALAD_GPU_CLASS_IDS: "gpu-4090",
  CONFIRM_SALAD_CREATE: "YES",
  CONFIRM_SALAD_START: "YES",
  SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "YES",
  SMEJJ_BUDGET_MAX_USD_PER_JOB: "5",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30",
  SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
  SMEJJ_WORKER_BUDGET_USD: "2.50",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "20"
});

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    writeHead(status) { this.statusCode = status; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

function fakeLease() {
  return {
    schemaVersion: 1,
    leaseId: "lease-route-0001",
    groupName: "smejj-glm-worker",
    preparedAt: "2026-07-10T12:00:00.000Z",
    deadlineAt: "2026-07-10T12:30:00.000Z",
    maxRuntimeMinutes: 30,
    budgetUsd: 2.5
  };
}

function completionEvent(lease = fakeLease()) {
  return {
    lease,
    completedAt: "2026-07-10T12:31:00.000Z",
    reason: "manual_stop",
    verification: {
      verified: true,
      providerAbsent: false,
      providerStatus: 200,
      configuredReplicas: 1,
      activeReplicas: 0,
      lifecycleState: "stopped"
    }
  };
}

function providerStatus(state = "running", runningCount = 1) {
  return {
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: state,
        instance_status_counts: {
          allocating_count: 0,
          creating_count: 0,
          running_count: runningCount,
          stopping_count: 0
        }
      }
    }
  };
}

function idriveEnv() {
  return {
    ...VALID_ENV,
    IDRIVE_E2_WATCHDOG_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_WATCHDOG_REGION: "us-west-2",
    IDRIVE_E2_WATCHDOG_BUCKET: "test-bucket",
    IDRIVE_E2_WATCHDOG_ACCESS_KEY: "private-access-key",
    IDRIVE_E2_WATCHDOG_SECRET_KEY: "private-secret-key",
    IDRIVE_E2_WATCHDOG_ALLOWED_PREFIX: "workers/salad/watchdogs/",
    IDRIVE_E2_WATCHDOG_TIMEOUT_MS: "5000"
  };
}

function immutableMemoryStore() {
  const objects = new Map();
  const puts = [];
  return {
    objects,
    puts,
    async putObject(object) {
      puts.push({ ...object });
      if (objects.has(object.key)) {
        return { ok: false, status: 412, created: false, conditionEnforced: object.ifNoneMatch === "*" };
      }
      objects.set(object.key, object.body);
      return { ok: true, status: 201, created: true, conditionEnforced: object.ifNoneMatch === "*" };
    },
    async getObject(key) {
      if (!objects.has(key)) return { ok: false, status: 404 };
      return { ok: true, status: 200, body: objects.get(key) };
    },
    async listObjects(prefix) {
      return { ok: true, keys: [...objects.keys()].filter((key) => key.startsWith(prefix)) };
    }
  };
}

function fakeWatchdog({ prepareOk = true, armOk = true, stopVerified = true } = {}) {
  const calls = { prepared: 0, armed: 0, enforced: 0, waited: 0, recovered: 0 };
  let phase = "idle";
  const api = {
    calls,
    status() {
      return {
        phase,
        armed: phase === "armed",
        enforcingStop: phase === "enforcing-stop",
        stopVerified: phase === "stop-verified"
      };
    },
    async prepareLease() {
      calls.prepared += 1;
      if (!prepareOk) return { ok: false, persisted: false, reason: "watchdog_lease_persistence_failed" };
      phase = "prepared";
      return { ok: true, persisted: true, phase };
    },
    armPreparedLease() {
      calls.armed += 1;
      if (!armOk) return { ok: false, armed: false, reason: "runtime_deadline_already_exceeded" };
      phase = "armed";
      return { ok: true, armed: true, phase };
    },
    enforceStop() {
      calls.enforced += 1;
      phase = stopVerified ? "stop-verified" : "enforcing-stop";
      return Promise.resolve(api.status());
    },
    async waitForFirstAttempt() {
      calls.waited += 1;
      return api.status();
    },
    async recoverLease() {
      calls.recovered += 1;
      phase = "armed";
      return { ok: true, recovered: true, armed: true };
    }
  };
  return api;
}

test("create never prepares or arms a watchdog lease", async () => {
  const res = fakeRes();
  const watchdog = fakeWatchdog();
  await handleSaladCreate(res, {
    env: { ...VALID_ENV },
    activeWorkers: 0,
    watchdog,
    createGroup: async () => ({ ok: true, status: 201, data: { sensitive: "not-returned" } })
  });
  assert.equal(res.statusCode, 200);
  assert.equal(watchdog.calls.prepared, 0);
  assert.equal(watchdog.calls.armed, 0);
  assert.doesNotMatch(JSON.stringify(res.payload()), /not-returned|test-secret-never-returned/);
});

test("status exposes only a strict secret-free projection of the provider payload", async () => {
  const res = fakeRes();
  await handleSaladStatus(res, {
    env: { ...VALID_ENV },
    getStatus: async () => ({
      ...providerStatus("stopped", 0),
      data: {
        ...providerStatus("stopped", 0).data,
        environment_variables: { SALAD_API_KEY: "provider-secret-must-never-escape" },
        container: { image: "private-registry.example/sensitive-image" },
        provider_extension: { raw: "provider-raw-must-never-escape" }
      },
      providerDebug: "provider-top-level-must-never-escape"
    })
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.deepEqual(Object.keys(res.payload()).sort(), [
    "activeReplicas",
    "configuredReplicas",
    "lifecycleState",
    "ok",
    "providerAbsent",
    "providerStatus",
    "reason",
    "stopVerified",
    "uncertain"
  ]);
  assert.deepEqual(res.payload(), {
    ok: true,
    providerStatus: 200,
    reason: "accepted",
    uncertain: false,
    providerAbsent: false,
    configuredReplicas: 1,
    activeReplicas: 0,
    lifecycleState: "stopped",
    stopVerified: true
  });
  assert.doesNotMatch(JSON.stringify(res.payload()), /provider-|private-registry|SALAD_API_KEY|sensitive-image/);
});

test("start calls Salad only after a lease was durably prepared", async () => {
  const res = fakeRes();
  const watchdog = fakeWatchdog();
  let starts = 0;
  await handleSaladStart(res, {
    env: { ...VALID_ENV },
    activeWorkers: 0,
    watchdog,
    leaseBuilder: () => ({ ok: true, lease: fakeLease() }),
    startGroup: async () => { starts += 1; return { ok: true, status: 202 }; }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(starts, 1);
  assert.equal(watchdog.calls.prepared, 1);
  assert.equal(watchdog.calls.armed, 1);
  assert.equal(res.payload().runtimeWatchdog.armed, true);
});

test("start is blocked when restart recovery is not explicitly enabled", async () => {
  const res = fakeRes();
  const watchdog = fakeWatchdog();
  let starts = 0;
  await handleSaladStart(res, {
    env: { ...VALID_ENV, SMEJJ_SALAD_WATCHDOG_RECOVERY_ENABLED: "NO" },
    activeWorkers: 0,
    watchdog,
    leaseBuilder: () => ({ ok: true, lease: fakeLease() }),
    startGroup: async () => { starts += 1; return { ok: true, status: 202 }; }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload().reason, "watchdog_recovery_not_enabled");
  assert.equal(starts, 0);
  assert.equal(watchdog.calls.prepared, 0);
});

test("start is blocked before Salad when lease persistence fails", async () => {
  const res = fakeRes();
  const watchdog = fakeWatchdog({ prepareOk: false });
  let starts = 0;
  await handleSaladStart(res, {
    env: { ...VALID_ENV },
    activeWorkers: 0,
    watchdog,
    leaseBuilder: () => ({ ok: true, lease: fakeLease() }),
    startGroup: async () => { starts += 1; return { ok: true, status: 202 }; }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(starts, 0);
  assert.equal(watchdog.calls.armed, 0);
});

test("an unsuccessful or uncertain start enforces stop and never arms", async () => {
  for (const startGroup of [
    async () => ({ ok: false, status: 503, reason: "provider_unavailable", uncertain: true }),
    async () => { throw new Error("secret provider failure"); }
  ]) {
    const res = fakeRes();
    const watchdog = fakeWatchdog();
    await handleSaladStart(res, {
      env: { ...VALID_ENV },
      activeWorkers: 0,
      watchdog,
      leaseBuilder: () => ({ ok: true, lease: fakeLease() }),
      startGroup
    });
    assert.equal(res.statusCode, 502);
    assert.equal(watchdog.calls.enforced, 1);
    assert.equal(watchdog.calls.waited, 1);
    assert.equal(watchdog.calls.armed, 0);
    assert.doesNotMatch(JSON.stringify(res.payload()), /secret provider failure|test-secret-never-returned/);
  }
});

test("a post-start arm failure immediately enforces stop", async () => {
  const res = fakeRes();
  const watchdog = fakeWatchdog({ armOk: false });
  await handleSaladStart(res, {
    env: { ...VALID_ENV },
    activeWorkers: 0,
    watchdog,
    leaseBuilder: () => ({ ok: true, lease: fakeLease() }),
    startGroup: async () => ({ ok: true, status: 202 })
  });
  assert.equal(res.statusCode, 503);
  assert.equal(watchdog.calls.enforced, 1);
  assert.equal(watchdog.calls.waited, 1);
});

test("stop returns success only after the watchdog verified zero usage", async () => {
  const pendingRes = fakeRes();
  const pending = fakeWatchdog({ stopVerified: false });
  await handleSaladStop(pendingRes, { watchdog: pending });
  assert.equal(pendingRes.statusCode, 202);
  assert.equal(pendingRes.payload().enforcementPending, true);

  const stoppedRes = fakeRes();
  const stopped = fakeWatchdog({ stopVerified: true });
  await handleSaladStop(stoppedRes, { watchdog: stopped });
  assert.equal(stoppedRes.statusCode, 200);
  assert.equal(stoppedRes.payload().stopVerified, true);
});

test("watchdog lease storage is append-only, overwrite-proven, digest-verified and secret-free", async () => {
  const env = idriveEnv();
  const built = buildWatchdogLease({ env, nowMs: Date.parse("2026-07-10T12:00:00Z"), leaseId: "lease-store-0001" });
  assert.equal(built.ok, true);
  assert.doesNotMatch(JSON.stringify(built.lease), /private-|test-secret-never-returned/);
  const store = immutableMemoryStore();
  const persisted = await persistWatchdogLease(built.lease, {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  });
  assert.equal(persisted.persisted, true);
  assert.equal(persisted.immutable, true);
  assert.equal(persisted.contentVerified, true);
  assert.equal(persisted.proofStatus, 412);
  assert.match(persisted.sha256, /^[a-f0-9]{64}$/);
  assert.equal(store.puts.length, 2);
  assert.equal(store.puts[0].key, store.puts[1].key);
  assert.match(store.puts[0].key, /^workers\/salad\/watchdogs\/smejj-glm-worker\/lease-store-0001\/lease\.json$/);
  assert.equal(store.puts[0].ifNoneMatch, "*");
  assert.equal(store.puts[1].ifNoneMatch, "*");
  assert.equal(store.objects.size, 1);
  const storedBody = store.objects.get(store.puts[0].key);
  assert.equal(crypto.createHash("sha256").update(storedBody).digest("hex"), persisted.sha256);
  assert.doesNotMatch(JSON.stringify(store.puts), /private-|test-secret-never-returned|current\.json/);
});

test("terminal completion is append-only, idempotent and prevents restart re-arm", async () => {
  const env = idriveEnv();
  const store = immutableMemoryStore();
  const lease = fakeLease();
  assert.equal((await persistWatchdogLease(lease, {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  })).ok, true);
  const first = await persistWatchdogCompletion(completionEvent(lease), {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  });
  assert.equal(first.persisted, true);
  assert.equal(first.createdNow, true);
  assert.equal(first.contentVerified, true);
  assert.equal(first.proofStatus, 412);
  assert.match(first.key, /\/lease-route-0001\/completion\.json$/);

  const replay = await persistWatchdogCompletion(completionEvent(lease), {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  });
  assert.equal(replay.persisted, true);
  assert.equal(replay.createdNow, false);
  assert.equal(replay.idempotent, true);

  const loaded = await loadCurrentWatchdogLease({
    env,
    listObjects: store.listObjects,
    getObject: store.getObject
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, false);
  assert.equal(loaded.terminal, true);
  assert.equal(loaded.reason, "watchdog_recovery_lease_completed");

  const watchdog = fakeWatchdog();
  const recovery = await recoverRuntimeWatchdogFromIdrive({
    env,
    watchdog,
    loadLease: async () => loaded,
    getWorkerStatus: async () => providerStatus("stopped", 0)
  });
  assert.equal(recovery.ok, true);
  assert.equal(watchdog.calls.recovered, 0);
});

test("terminal completion rejects coerced values, nonzero activity and non-2xx stopped proofs", async () => {
  const env = idriveEnv();
  const base = completionEvent();
  const invalidVerifications = [
    { ...base.verification, providerStatus: null },
    { ...base.verification, providerStatus: "200" },
    { ...base.verification, providerStatus: 302 },
    { ...base.verification, activeReplicas: null },
    { ...base.verification, activeReplicas: "0" },
    { ...base.verification, activeReplicas: 1 },
    { ...base.verification, configuredReplicas: "1" },
    { ...base.verification, providerAbsent: null }
  ];
  for (const verification of invalidVerifications) {
    let writes = 0;
    const result = await persistWatchdogCompletion({ ...base, verification }, {
      env,
      putObject: async () => {
        writes += 1;
        return { ok: true, status: 201, created: true, conditionEnforced: true };
      },
      getObject: async () => ({ ok: false, status: 404 })
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "watchdog_completion_verification_invalid");
    assert.equal(writes, 0);
  }

  const absent = await persistWatchdogCompletion({
    ...base,
    verification: {
      verified: true,
      providerAbsent: true,
      providerStatus: 404,
      configuredReplicas: 0,
      activeReplicas: 0,
      lifecycleState: "not-found"
    }
  }, {
    env,
    putObject: async () => ({ ok: false, status: 412, created: false, conditionEnforced: true }),
    getObject: async () => ({ ok: false, status: 404 })
  });
  assert.notEqual(absent.reason, "watchdog_completion_verification_invalid");
});

test("watchdog recovery consumes every continuation-token page before choosing a lease", async () => {
  const env = idriveEnv();
  const store = immutableMemoryStore();
  const older = fakeLease();
  const newer = {
    ...fakeLease(),
    leaseId: "lease-route-page-2",
    preparedAt: "2026-07-10T12:10:00.000Z",
    deadlineAt: "2026-07-10T12:40:00.000Z"
  };
  for (const lease of [older, newer]) {
    assert.equal((await persistWatchdogLease(lease, {
      env,
      putObject: store.putObject,
      getObject: store.getObject
    })).ok, true);
  }
  const leaseKeys = [...store.objects.keys()].filter((key) => key.endsWith("/lease.json"));
  const tokens = [];
  const loaded = await loadCurrentWatchdogLease({
    env,
    listObjects: async (_prefix, token) => {
      tokens.push(token);
      return token === null
        ? { ok: true, keys: [leaseKeys[0]], isTruncated: true, nextContinuationToken: "page-2-token" }
        : { ok: true, keys: [leaseKeys[1]], isTruncated: false };
    },
    getObject: store.getObject
  });
  assert.deepEqual(tokens, [null, "page-2-token"]);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.lease.leaseId, newer.leaseId);
});

test("truncated or tampered watchdog ledgers fail closed", async () => {
  const env = idriveEnv();
  const store = immutableMemoryStore();
  const lease = fakeLease();
  assert.equal((await persistWatchdogLease(lease, {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  })).ok, true);
  const missingToken = await loadCurrentWatchdogLease({
    env,
    listObjects: async () => ({
      ok: true,
      keys: [...store.objects.keys()].filter((key) => key.endsWith("/lease.json")),
      isTruncated: true
    }),
    getObject: store.getObject
  });
  assert.equal(missingToken.ok, false);
  assert.equal(missingToken.reason, "watchdog_recovery_list_failed");

  const completion = await persistWatchdogCompletion(completionEvent(lease), {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  });
  const collision = await persistWatchdogCompletion({
    ...completionEvent(lease),
    completedAt: "2026-07-10T12:32:00.000Z"
  }, {
    env,
    putObject: store.putObject,
    getObject: store.getObject
  });
  assert.equal(collision.ok, false);
  assert.equal(collision.reason, "watchdog_completion_collision");
  store.objects.set(completion.key, "{}\n");
  const tampered = await loadCurrentWatchdogLease({
    env,
    listObjects: store.listObjects,
    getObject: store.getObject
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.reason, "watchdog_recovery_completion_invalid");
});

test("watchdog lease persistence rejects collisions and readback digest changes", async () => {
  const env = idriveEnv();
  const lease = fakeLease();
  let reads = 0;
  const collision = await persistWatchdogLease(lease, {
    env,
    putObject: async () => ({ ok: false, status: 412, created: false, conditionEnforced: true }),
    getObject: async () => { reads += 1; return { ok: true, body: "{}" }; }
  });
  assert.equal(collision.ok, false);
  assert.equal(collision.reason, "watchdog_lease_collision");
  assert.equal(reads, 0);

  let originalBody = "";
  let writes = 0;
  const changed = await persistWatchdogLease({ ...lease, leaseId: "lease-route-0002" }, {
    env,
    putObject: async (object) => {
      writes += 1;
      originalBody = object.body;
      return writes === 1
        ? { ok: true, status: 201, created: true, conditionEnforced: true }
        : { ok: false, status: 412, created: false, conditionEnforced: true };
    },
    getObject: async () => ({ ok: true, status: 200, body: `${originalBody}tampered` })
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, "watchdog_lease_readback_digest_failed");
});

test("watchdog recovery lists the group ledger and chooses the newest valid lease", async () => {
  const env = idriveEnv();
  const store = immutableMemoryStore();
  const older = fakeLease();
  const newer = {
    ...fakeLease(),
    leaseId: "lease-route-0003",
    preparedAt: "2026-07-10T12:10:00.000Z",
    deadlineAt: "2026-07-10T12:40:00.000Z"
  };
  for (const lease of [older, newer]) {
    const result = await persistWatchdogLease(lease, {
      env,
      putObject: store.putObject,
      getObject: store.getObject
    });
    assert.equal(result.ok, true);
  }
  const loaded = await loadCurrentWatchdogLease({
    env,
    listObjects: store.listObjects,
    getObject: store.getObject
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.lease.leaseId, newer.leaseId);
  assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
});

test("missing IDrive watchdog configuration fails recovery safe and enforces stop", async () => {
  const loaded = await loadCurrentWatchdogLease({
    env: {
      ...VALID_ENV,
      IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
      IDRIVE_E2_REGION: "us-west-2",
      IDRIVE_E2_ACCESS_KEY: "general-access-must-not-fallback",
      IDRIVE_E2_SECRET_KEY: "general-secret-must-not-fallback",
      IDRIVE_E2_BUCKET: "general-bucket"
    }
  });
  assert.equal(loaded.ok, false);
  assert.equal(loaded.reason, "watchdog_idrive_config_required");

  const watchdog = fakeWatchdog({ stopVerified: false });
  const recovered = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog,
    getWorkerStatus: async () => providerStatus()
  });
  assert.equal(recovered.ok, false);
  assert.equal(watchdog.calls.enforced, 1);
  assert.equal(watchdog.calls.waited, 1);

  const absentWatchdog = fakeWatchdog();
  const absent = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog: absentWatchdog,
    getWorkerStatus: async () => ({ ok: false, status: 404, data: null })
  });
  assert.equal(absent.ok, false);
  assert.equal(absent.workerSafe, true);
  assert.equal(absentWatchdog.calls.enforced, 0);
});

test("restart without a lease proves stopped or absent, otherwise enforces stop", async () => {
  const noLease = async () => ({ ok: true, found: false, reason: "watchdog_recovery_lease_not_found" });
  const stoppedStatus = providerStatus("stopped", 0);

  const stoppedWatchdog = fakeWatchdog();
  const stopped = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog: stoppedWatchdog,
    loadLease: noLease,
    getWorkerStatus: async () => stoppedStatus
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.reason, "salad_group_already_stopped");
  assert.equal(stoppedWatchdog.calls.enforced, 0);

  const absentWatchdog = fakeWatchdog();
  const absent = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog: absentWatchdog,
    loadLease: noLease,
    getWorkerStatus: async () => ({ ok: false, status: 404, data: null })
  });
  assert.equal(absent.ok, true);
  assert.equal(absent.reason, "salad_group_not_found");
  assert.equal(absentWatchdog.calls.enforced, 0);

  for (const getWorkerStatus of [
    async () => providerStatus(),
    async () => { throw new Error("provider-secret-must-not-escape"); }
  ]) {
    const watchdog = fakeWatchdog({ stopVerified: true });
    const result = await recoverRuntimeWatchdogFromIdrive({
      env: { ...VALID_ENV },
      watchdog,
      loadLease: noLease,
      getWorkerStatus
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, "missing_lease_stop_verified");
    assert.equal(watchdog.calls.enforced, 1);
    assert.equal(watchdog.calls.waited, 1);
    assert.doesNotMatch(JSON.stringify(result), /provider-secret-must-not-escape/);
  }
});

test("restart recovery restores a durable lease and fails safe on uncertain storage", async () => {
  const recoveredWatchdog = fakeWatchdog();
  const recovered = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog: recoveredWatchdog,
    loadLease: async () => ({ ok: true, found: true, lease: fakeLease() })
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.equal(recoveredWatchdog.calls.recovered, 1);

  const uncertainWatchdog = fakeWatchdog({ stopVerified: false });
  const uncertain = await recoverRuntimeWatchdogFromIdrive({
    env: { ...VALID_ENV },
    watchdog: uncertainWatchdog,
    loadLease: async () => ({ ok: false, found: false, reason: "watchdog_recovery_read_failed" }),
    getWorkerStatus: async () => providerStatus()
  });
  assert.equal(uncertain.ok, false);
  assert.equal(uncertainWatchdog.calls.enforced, 1);
  assert.equal(uncertainWatchdog.calls.waited, 1);
});

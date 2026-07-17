import test from "node:test";
import assert from "node:assert/strict";
import {
  loadActiveWatchdogLeases,
  persistWatchdogCompletion,
  persistWatchdogLease
} from "../control-server/src/budget/watchdogLeaseStore.js";

test("global watchdog recovery returns only unfinished ephemeral leases", async () => {
  const storage = memoryStore();
  const env = watchdogEnv();
  const active = lease("smejj-job-aaaaaaaa", "lease-active-0001");
  const completed = lease("smejj-job-bbbbbbbb", "lease-complete-01");
  const shared = lease("smejj-glm-worker", "lease-shared-0001");
  for (const value of [active, completed, shared]) {
    const written = await persistWatchdogLease(value, {
      env,
      putObject: storage.putObject,
      getObject: storage.getObject
    });
    assert.equal(written.ok, true);
  }
  const terminal = await persistWatchdogCompletion({
    lease: completed,
    completedAt: "2026-07-11T13:00:00.000Z",
    reason: "job_completed",
    verification: {
      verified: true,
      providerAbsent: false,
      providerStatus: 200,
      configuredReplicas: 1,
      activeReplicas: 0,
      lifecycleState: "stopped"
    }
  }, {
    env,
    putObject: storage.putObject,
    getObject: storage.getObject
  });
  assert.equal(terminal.ok, true);

  const loaded = await loadActiveWatchdogLeases({
    env,
    listObjects: storage.listObjects,
    getObject: storage.getObject
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.count, 1);
  assert.equal(loaded.leases[0].lease.leaseId, active.leaseId);
  assert.match(loaded.leases[0].completionKey, /completion\.json$/);

  const activeBounded = await loadActiveWatchdogLeases({
    env,
    maxLeases: 1,
    listObjects: storage.listObjects,
    getObject: storage.getObject
  });
  assert.equal(activeBounded.ok, true);
  assert.equal(activeBounded.count, 1);
  assert.equal(activeBounded.leases[0].lease.leaseId, active.leaseId);
});

function watchdogEnv() {
  return {
    IDRIVE_E2_WATCHDOG_ENDPOINT: "https://storage.idrivee2.com",
    IDRIVE_E2_WATCHDOG_REGION: "us-west-2",
    IDRIVE_E2_WATCHDOG_ACCESS_KEY: "test",
    IDRIVE_E2_WATCHDOG_SECRET_KEY: "test",
    IDRIVE_E2_WATCHDOG_BUCKET: "test",
    IDRIVE_E2_WATCHDOG_ALLOWED_PREFIX: "workers/salad/watchdogs/",
    IDRIVE_E2_WATCHDOG_TIMEOUT_MS: "5000"
  };
}

function lease(groupName, leaseId) {
  return {
    schemaVersion: 1,
    leaseId,
    groupName,
    preparedAt: "2026-07-11T12:00:00.000Z",
    deadlineAt: "2026-07-11T13:00:00.000Z",
    maxRuntimeMinutes: 60,
    budgetUsd: 0.1
  };
}

function memoryStore() {
  const objects = new Map();
  return {
    putObject: async ({ key, body, ifNoneMatch }) => {
      if (ifNoneMatch === "*" && objects.has(key)) {
        return { ok: false, status: 412, created: false, conditionEnforced: true };
      }
      objects.set(key, String(body));
      return { ok: true, status: 200, created: true, conditionEnforced: ifNoneMatch === "*" };
    },
    getObject: async (key) => objects.has(key)
      ? { ok: true, status: 200, body: objects.get(key) }
      : { ok: false, status: 404 },
    listObjects: async (prefix) => ({
      ok: true,
      keys: [...objects.keys()].filter((key) => key.startsWith(prefix)),
      isTruncated: false
    })
  };
}

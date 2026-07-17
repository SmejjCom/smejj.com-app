import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createWorkerCapacityStore } from "../control-server/src/budget/workerCapacityStore.js";

test("global capacity atomically enforces durable worker and reserved-dollar limits", async () => {
  const storage = memoryCasStore();
  let now = Date.parse("2026-07-11T12:00:00.000Z");
  const store = createWorkerCapacityStore({ env: capacityEnv(), ...storage.dependencies, nowMs: () => now });
  const first = await store.acquire(job("job_capacity_a", "aa"), watchdogLease("job-a", "lease-capacity-a", 0.1));
  assert.equal(first.ok, true);
  assert.equal(first.snapshot.activeSlots, 1);
  const second = await store.acquire(job("job_capacity_b", "bb"), watchdogLease("job-b", "lease-capacity-b", 0.1));
  assert.equal(second.ok, true);
  assert.equal(second.snapshot.activeSlots, 2);
  assert.equal(second.snapshot.reservedUsd, 0.2);

  const blocked = await store.acquire(job("job_capacity_c", "cc"), watchdogLease("job-c", "lease-capacity-c", 0.05));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "global_worker_capacity_slots_exhausted");
  assert.equal(blocked.snapshot.activeSlots, 2);

  const unprovenRelease = await store.release(job("job_capacity_a", "aa"), first.lease, { stopVerified: true });
  assert.equal(unprovenRelease.reason, "global_worker_capacity_stop_proof_required");
  now += 10_000;
  const released = await store.release(job("job_capacity_a", "aa"), first.lease, stopProof(now));
  assert.equal(released.ok, true);
  assert.equal(released.snapshot.activeSlots, 1);
  assert.equal(released.snapshot.reservedUsd, 0.1);

  const admitted = await store.acquire(job("job_capacity_c", "cc"), watchdogLease("job-c", "lease-capacity-c", 0.05));
  assert.equal(admitted.ok, true);
  assert.equal(admitted.snapshot.activeSlots, 2);
  assert.equal(admitted.snapshot.reservedUsd, 0.15);
  assert.ok([...storage.objects.keys()].some((key) => key.includes("/capacity/") && key.includes("acquired-capacity_")));
  assert.ok([...storage.objects.keys()].some((key) => key.includes("release-authorized-capacity_")));
});

test("concurrent controls cannot both acquire the final global worker slot", async () => {
  const storage = memoryCasStore();
  const env = capacityEnv({
    SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "1",
    SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "0.1"
  });
  const firstControl = createWorkerCapacityStore({ env, ...storage.dependencies });
  const secondControl = createWorkerCapacityStore({ env, ...storage.dependencies });
  const [left, right] = await Promise.all([
    firstControl.acquire(job("job_race_left", "dd"), watchdogLease("race-left", "lease-race-left", 0.1)),
    secondControl.acquire(job("job_race_right", "ee"), watchdogLease("race-right", "lease-race-right", 0.1))
  ]);
  const admitted = [left, right].filter((result) => result.ok);
  const denied = [left, right].filter((result) => !result.ok);
  assert.equal(admitted.length, 1);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].reason, "global_worker_capacity_slots_exhausted");
  assert.equal((await firstControl.snapshot()).snapshot.activeSlots, 1);
});

test("capacity fails closed on policy drift and missing immutable CAS evidence", async () => {
  const storage = memoryCasStore();
  const first = createWorkerCapacityStore({ env: capacityEnv(), ...storage.dependencies });
  assert.equal((await first.acquire(job("job_policy_a", "ff"), watchdogLease("policy-a", "lease-policy-a", 0.1))).ok, true);

  const drifted = createWorkerCapacityStore({
    env: capacityEnv({ SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "0.3" }),
    ...storage.dependencies
  });
  const mismatch = await drifted.acquire(job("job_policy_b", "11"), watchdogLease("policy-b", "lease-policy-b", 0.1));
  assert.equal(mismatch.reason, "global_worker_capacity_policy_mismatch");

  const unsafeStorage = memoryCasStore({ conditionEnforced: false });
  const unsafe = createWorkerCapacityStore({ env: capacityEnv(), ...unsafeStorage.dependencies });
  const denied = await unsafe.acquire(job("job_no_cas", "22"), watchdogLease("no-cas", "lease-no-cas", 0.1));
  assert.equal(denied.reason, "global_worker_capacity_cas_not_enforced");
});

test("restart recovery releases the matching durable slot only after verified stop evidence", async () => {
  const storage = memoryCasStore();
  const store = createWorkerCapacityStore({ env: capacityEnv(), ...storage.dependencies });
  const lease = watchdogLease("recovery-slot", "lease-recovery-slot", 0.1);
  assert.equal((await store.acquire(job("job_capacity_recovery", "33"), lease)).ok, true);
  const blocked = await store.releaseRecovered(lease, { stopVerified: true });
  assert.equal(blocked.reason, "global_worker_capacity_stop_proof_required");
  const released = await store.releaseRecovered(lease, stopProof(Date.now()));
  assert.equal(released.ok, true);
  assert.equal(released.snapshot.activeSlots, 0);
  assert.equal((await store.releaseRecovered(lease, stopProof(Date.now()))).idempotent, true);
});

function capacityEnv(extra = {}) {
  return {
    IDRIVE_E2_ENDPOINT: "https://storage.example",
    IDRIVE_E2_REGION: "us-west-2",
    IDRIVE_E2_ACCESS_KEY: "test",
    IDRIVE_E2_SECRET_KEY: "test",
    IDRIVE_E2_BUCKET: "test",
    SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "2",
    SMEJJ_BUDGET_MAX_GLOBAL_RESERVED_USD: "0.2",
    ...extra
  };
}

function job(id, shard) {
  return {
    id,
    userId: `owner_${id}`,
    taskCapsule: { rootPrefix: `jobs/2026/07/11/${shard}/${id}/` }
  };
}

function watchdogLease(suffix, leaseId, budgetUsd) {
  return {
    leaseId,
    groupName: `smejj-${suffix}`,
    deadlineAt: "2026-07-11T13:00:00.000Z",
    budgetUsd
  };
}

function stopProof(completedAt) {
  return {
    stopVerified: true,
    completionPersisted: true,
    stopAttempts: 1,
    completedAt: new Date(completedAt).toISOString()
  };
}

function memoryCasStore({ conditionEnforced = true } = {}) {
  const objects = new Map();
  const etags = new Map();
  const putObject = async ({ key, body, ifNoneMatch, ifMatch }) => {
    const currentEtag = etags.get(key) || "";
    if ((ifNoneMatch === "*" && objects.has(key)) || (ifMatch && ifMatch !== currentEtag)) {
      return { ok: false, status: 412, conditionEnforced: true };
    }
    const value = String(body);
    const etag = `"${crypto.createHash("sha256").update(value).digest("hex")}"`;
    objects.set(key, value);
    etags.set(key, etag);
    return { ok: true, status: 200, conditionEnforced, etag };
  };
  const getObject = async (key) => objects.has(key)
    ? { ok: true, status: 200, body: objects.get(key), etag: etags.get(key) }
    : { ok: false, status: 404 };
  return { objects, dependencies: { getObject, putObject } };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeWatchdog, evaluateContainerGroupStopped } from "../control-server/src/budget/runtimeWatchdog.js";

const NOW = Date.parse("2026-07-02T12:00:00Z");

function lease(minutes = 30) {
  return {
    leaseId: `lease_runtime_${minutes}`,
    groupName: "smejj-worker",
    preparedAt: new Date(NOW).toISOString(),
    deadlineAt: new Date(NOW + minutes * 60_000).toISOString(),
    maxRuntimeMinutes: minutes,
    budgetUsd: 1
  };
}

function stoppedStatus() {
  return {
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: "stopped",
        instance_status_counts: { allocating_count: 0, creating_count: 0, running_count: 0, stopping_count: 0 }
      }
    }
  };
}

function runningStatus() {
  return {
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: "running",
        instance_status_counts: { allocating_count: 0, creating_count: 0, running_count: 1, stopping_count: 0 }
      }
    }
  };
}

function harness({
  stopResult = { ok: true },
  workerStatus = stoppedStatus(),
  persistResult = { ok: true, persisted: true },
  completionResult = { ok: true, persisted: true, immutable: true, contentVerified: true },
  jobs = [],
  retryDelaysMs = [100, 200]
} = {}) {
  const calls = { stops: 0, status: 0, persisted: [], completions: [], failed: [], scheduled: [], cancelled: [] };
  let timerId = 0;
  const watchdog = createRuntimeWatchdog({
    stopWorker: async () => {
      calls.stops += 1;
      if (stopResult instanceof Error) throw stopResult;
      return stopResult;
    },
    getWorkerStatus: async () => {
      calls.status += 1;
      return typeof workerStatus === "function" ? workerStatus(calls.status) : workerStatus;
    },
    persistLease: async (value) => {
      calls.persisted.push(value);
      return persistResult;
    },
    persistCompletion: async (value) => {
      calls.completions.push(value);
      return typeof completionResult === "function"
        ? completionResult(calls.completions.length, value)
        : completionResult;
    },
    listActiveJobs: () => jobs,
    failJob: (job, reason) => calls.failed.push({ id: job.id, reason }),
    now: () => NOW,
    schedule: (fn, ms) => {
      timerId += 1;
      calls.scheduled.push({ id: timerId, fn, ms });
      return timerId;
    },
    cancel: (id) => calls.cancelled.push(id),
    retryDelaysMs
  });
  return { watchdog, calls };
}

async function prepareAndArm(watchdog, minutes = 30) {
  const prepared = await watchdog.prepareLease(lease(minutes));
  assert.equal(prepared.ok, true);
  assert.equal(prepared.persisted, true);
  const armed = watchdog.armPreparedLease();
  assert.equal(armed.ok, true);
  assert.equal(armed.armed, true);
  return armed;
}

test("watchdog rejects an invalid or non-durable lease before scheduling", async () => {
  const invalid = harness();
  assert.equal((await invalid.watchdog.prepareLease({})).reason, "watchdog_lease_id_invalid");
  assert.equal(invalid.calls.scheduled.length, 0);

  const nonDurable = harness({ persistResult: { ok: true, persisted: false } });
  assert.equal((await nonDurable.watchdog.prepareLease(lease())).reason, "watchdog_lease_persistence_failed");
  assert.equal(nonDurable.watchdog.armPreparedLease().reason, "persisted_watchdog_lease_required");
  assert.equal(nonDurable.calls.scheduled.length, 0);
});

test("a persisted lease arms exactly at its durable deadline", async () => {
  const { watchdog, calls } = harness();
  const result = await prepareAndArm(watchdog, 45);
  assert.equal(result.maxRuntimeMinutes, 45);
  assert.equal(result.deadlineAt, new Date(NOW + 45 * 60_000).toISOString());
  assert.equal(calls.persisted.length, 1);
  assert.equal(calls.scheduled.length, 1);
  assert.equal(calls.scheduled[0].ms, 45 * 60_000);
});

test("an armed lease cannot be replaced or disarmed before stop verification", async () => {
  const { watchdog, calls } = harness();
  await prepareAndArm(watchdog);
  assert.equal((await watchdog.prepareLease(lease(60))).reason, "watchdog_lease_already_active");
  assert.equal(watchdog.disarm().reason, "stop_verification_required");
  assert.equal(calls.scheduled.length, 1);
  assert.deepEqual(calls.cancelled, []);
});

test("parallel lease preparation is atomic and a prepared lease cannot be replaced", async () => {
  let releasePersistence;
  let persistenceCalls = 0;
  const persistence = new Promise((resolve) => { releasePersistence = resolve; });
  const watchdog = createRuntimeWatchdog({
    persistLease: async () => {
      persistenceCalls += 1;
      return persistence;
    }
  });

  const first = watchdog.prepareLease(lease(30));
  assert.equal(watchdog.status().phase, "preparing");
  const concurrent = await watchdog.prepareLease(lease(60));
  assert.equal(concurrent.ok, false);
  assert.equal(concurrent.reason, "watchdog_lease_already_active");
  assert.equal(persistenceCalls, 1);

  releasePersistence({ ok: true, persisted: true });
  const prepared = await first;
  assert.equal(prepared.ok, true);
  assert.equal(prepared.leaseId, lease(30).leaseId);
  const replacement = await watchdog.prepareLease(lease(60));
  assert.equal(replacement.ok, false);
  assert.equal(replacement.reason, "watchdog_lease_already_active");
  assert.equal(watchdog.status().leaseId, lease(30).leaseId);
  assert.equal(persistenceCalls, 1);
});

test("verified stop fails active jobs once and permits disarm", async () => {
  const jobs = [{ id: "job_a", status: "running" }, { id: "job_b", status: "verifying" }];
  const { watchdog, calls } = harness({ jobs });
  await prepareAndArm(watchdog);
  const enforcement = await watchdog.fire();

  assert.equal(calls.stops, 1);
  assert.equal(enforcement.stopVerified, true);
  assert.deepEqual(enforcement.lastEnforcement.failedJobIds, ["job_a", "job_b"]);
  assert.deepEqual(calls.failed.map((entry) => entry.reason), ["runtime_budget_exceeded", "runtime_budget_exceeded"]);
  assert.equal(enforcement.completionPersisted, true);
  assert.equal(calls.completions.length, 1);
  assert.equal(watchdog.disarm().ok, true);
});

test("deadline callback triggers the same verified enforcement path", async () => {
  const { watchdog, calls } = harness({ jobs: [{ id: "job_c", status: "running" }] });
  await prepareAndArm(watchdog, 1);
  calls.scheduled[0].fn();
  await watchdog.waitForFirstAttempt();

  assert.equal(calls.stops, 1);
  assert.equal(watchdog.status().stopVerified, true);
  assert.deepEqual(calls.failed.map((entry) => entry.id), ["job_c"]);
});

test("uncertain stop stays enforcing and schedules a bounded retry", async () => {
  const { watchdog, calls } = harness({
    stopResult: new Error("salad unreachable"),
    workerStatus: runningStatus(),
    jobs: [{ id: "job_d", status: "running" }]
  });
  await prepareAndArm(watchdog, 5);
  void watchdog.fire();
  const status = await watchdog.waitForFirstAttempt();

  assert.equal(status.enforcingStop, true);
  assert.equal(status.attempts, 1);
  assert.equal(calls.stops, 1);
  assert.equal(calls.scheduled.at(-1).ms, 100);
  assert.deepEqual(calls.failed.map((entry) => entry.id), ["job_d"]);
  assert.equal(status.lastEnforcement.stopRequest.ok, false);
});

test("stop verification ignores configured replicas but requires a terminal state and zero active counts", () => {
  const stopped = evaluateContainerGroupStopped(stoppedStatus());
  assert.equal(stopped.verified, true);
  assert.equal(stopped.configuredReplicas, 1);
  assert.equal(stopped.activeReplicas, 0);
  assert.equal(evaluateContainerGroupStopped(runningStatus()).verified, false);
  assert.equal(evaluateContainerGroupStopped({
    ok: true,
    data: {
      replicas: 1,
      current_state: {
        status: "stopped",
        instance_status_counts: {
          allocating_count: 0,
          creating_count: 0,
          running_count: 1,
          stopping_count: 0
        }
      }
    }
  }).verified, false);
  assert.equal(evaluateContainerGroupStopped({ ok: true, data: { replicas: 1 } }).verified, false);
  assert.equal(evaluateContainerGroupStopped({ ok: false, data: stoppedStatus().data }).verified, false);
  assert.equal(evaluateContainerGroupStopped({ ok: true, status: 201, data: stoppedStatus().data }).verified, true);
  assert.equal(evaluateContainerGroupStopped({ ok: true, status: 302, data: stoppedStatus().data }).verified, false);
  assert.equal(evaluateContainerGroupStopped({ ok: true, status: null, data: stoppedStatus().data }).verified, false);
  const failedWithoutActiveInstances = evaluateContainerGroupStopped({
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: "failed",
        instance_status_counts: {
          allocating_count: 0,
          creating_count: 0,
          running_count: 0,
          stopping_count: 0
        }
      }
    }
  });
  assert.equal(failedWithoutActiveInstances.verified, true);
  assert.equal(failedWithoutActiveInstances.lifecycleState, "failed");
  assert.equal(evaluateContainerGroupStopped({
    ok: true,
    status: 200,
    data: {
      replicas: 1,
      current_state: {
        status: "failed",
        instance_status_counts: {
          allocating_count: 0,
          creating_count: 0,
          running_count: 1,
          stopping_count: 0
        }
      }
    }
  }).verified, false);
  assert.equal(evaluateContainerGroupStopped({
    ok: true,
    status: 200,
    data: {
      replicas: "0",
      current_state: {
        status: "stopped",
        instance_status_counts: {
          allocating_count: null,
          creating_count: "0",
          running_count: false,
          stopping_count: 0
        }
      }
    }
  }).verified, false);
});

test("provider 404 is terminal zero-usage evidence and completes the durable lease", async () => {
  const absent = { ok: false, status: 404, data: null };
  assert.deepEqual(evaluateContainerGroupStopped(absent), {
    verified: true,
    providerAbsent: true,
    providerStatus: 404,
    configuredReplicas: 0,
    activeReplicas: 0,
    lifecycleState: "not-found"
  });
  const { watchdog, calls } = harness({ workerStatus: absent });
  await prepareAndArm(watchdog);
  const completed = await watchdog.enforceStop("manual_stop");
  assert.equal(completed.stopVerified, true);
  assert.equal(completed.completionPersisted, true);
  assert.equal(calls.completions.length, 1);
  assert.equal(calls.completions[0].verification.providerAbsent, true);
  assert.equal(calls.scheduled.length, 1);
});

test("a verified provider stop remains enforcing until its terminal event is durable", async () => {
  const { watchdog, calls } = harness({
    workerStatus: (attempt) => ({
      ...stoppedStatus(),
      data: { ...stoppedStatus().data, replicas: attempt }
    }),
    completionResult: (attempt) => attempt === 1
      ? { ok: false, persisted: false }
      : { ok: true, persisted: true, immutable: true, contentVerified: true, idempotent: true }
  });
  await prepareAndArm(watchdog);
  const completed = watchdog.enforceStop("manual_stop");
  const first = await watchdog.waitForFirstAttempt();
  assert.equal(first.enforcingStop, true);
  assert.equal(first.stopVerified, false);
  assert.equal(calls.stops, 1);
  assert.equal(calls.completions.length, 1);
  calls.scheduled.at(-1).fn();
  await new Promise((resolve) => setImmediate(resolve));
  const final = await completed;
  assert.equal(final.stopVerified, true);
  assert.equal(final.completionPersisted, true);
  assert.equal(calls.stops, 2);
  assert.equal(calls.status, 2);
  assert.equal(calls.completions.length, 2);
  assert.equal(calls.completions[0].verification.configuredReplicas, 1);
  assert.equal(calls.completions[1].verification.configuredReplicas, 2);
});

test("concurrent stop calls share one promise and one provider request", async () => {
  const { watchdog, calls } = harness();
  await prepareAndArm(watchdog);
  const first = watchdog.enforceStop("manual_stop");
  const second = watchdog.enforceStop("manual_stop_again");
  assert.strictEqual(first, second);
  await first;
  assert.equal(calls.stops, 1);
  assert.equal(calls.status, 1);
});

test("a new enforcement after completion performs a fresh stop and status check", async () => {
  const { watchdog, calls } = harness();
  const first = watchdog.enforceStop("manual_stop");
  await first;
  assert.equal(watchdog.status().stopVerified, true);

  const second = watchdog.enforceStop("manual_stop_again");
  assert.notStrictEqual(second, first);
  await second;
  assert.equal(calls.stops, 2);
  assert.equal(calls.status, 2);
  assert.equal(watchdog.status().attempts, 1);
  assert.equal(watchdog.status().lastEnforcement.reason, "manual_stop_again");
});

test("a repeated enforcement reuses only the immutable completion after fresh provider proof", async () => {
  const { watchdog, calls } = harness();
  await prepareAndArm(watchdog);
  await watchdog.enforceStop("manual_stop");
  assert.equal(calls.completions.length, 1);

  await watchdog.enforceStop("manual_stop_again");
  assert.equal(calls.stops, 2);
  assert.equal(calls.status, 2);
  assert.equal(calls.completions.length, 1);
  assert.equal(watchdog.status().stopVerified, true);
  assert.equal(watchdog.status().completionPersisted, true);
  assert.equal(watchdog.status().lastEnforcement.completion.reason, "completion_already_persisted");
});

test("retry schedule is 5, 15, 30, 60 and then 60 seconds", async () => {
  const { watchdog, calls } = harness({
    retryDelaysMs: [5_000, 15_000, 30_000, 60_000],
    workerStatus: (attempt) => attempt >= 6 ? stoppedStatus() : runningStatus()
  });
  await prepareAndArm(watchdog);
  const completed = watchdog.enforceStop();
  await watchdog.waitForFirstAttempt();
  const observed = [];
  for (let index = 0; index < 5; index += 1) {
    const retry = calls.scheduled.at(-1);
    observed.push(retry.ms);
    retry.fn();
    await new Promise((resolve) => setImmediate(resolve));
  }
  await completed;
  assert.deepEqual(observed, [5_000, 15_000, 30_000, 60_000, 60_000]);
  assert.equal(calls.stops, 6);
});

test("recoverLease rearms future leases and stops overdue leases", async () => {
  const future = harness();
  const rearmed = await future.watchdog.recoverLease(lease(15));
  assert.equal(rearmed.recovered, true);
  assert.equal(rearmed.armed, true);
  assert.equal(future.calls.persisted.length, 0);
  assert.equal(future.calls.scheduled[0].ms, 15 * 60_000);

  const overdue = harness();
  const recovered = await overdue.watchdog.recoverLease({
    ...lease(15),
    preparedAt: new Date(NOW - 20 * 60_000).toISOString(),
    deadlineAt: new Date(NOW - 5 * 60_000).toISOString()
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.stopVerified, true);
  assert.equal(overdue.calls.stops, 1);
});

test("provider exception text is not retained in watchdog state", async () => {
  const secret = "salad-secret-from-exception";
  const { watchdog } = harness({ stopResult: new Error(secret), workerStatus: runningStatus() });
  await prepareAndArm(watchdog);
  void watchdog.enforceStop("manual_stop");
  await watchdog.waitForFirstAttempt();
  assert.doesNotMatch(JSON.stringify(watchdog.status()), new RegExp(secret));
  assert.equal(watchdog.status().lastEnforcement.stopRequest.reason, "stop_request_failed");
});

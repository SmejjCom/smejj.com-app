import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeWatchdog } from "../control-server/src/budget/runtimeWatchdog.js";

const NOW = Date.parse("2026-07-02T12:00:00Z");

function harness({ stopResult = { ok: true }, jobs = [] } = {}) {
  const calls = { stops: 0, failed: [], scheduled: [], cancelled: [] };
  let timerId = 0;
  const watchdog = createRuntimeWatchdog({
    stopWorker: async () => { calls.stops += 1; if (stopResult instanceof Error) throw stopResult; return stopResult; },
    listActiveJobs: () => jobs,
    failJob: (job, reason) => calls.failed.push({ id: job.id, reason }),
    now: () => NOW,
    schedule: (fn, ms) => { timerId += 1; calls.scheduled.push({ id: timerId, fn, ms }); return timerId; },
    cancel: (id) => calls.cancelled.push(id)
  });
  return { watchdog, calls };
}

test("arm is fail-closed without configured runtime limit", () => {
  const { watchdog, calls } = harness();
  const result = watchdog.arm({});
  assert.equal(result.armed, false);
  assert.equal(result.reason, "runtime_limit_not_configured");
  assert.equal(calls.scheduled.length, 0);
});

test("arm schedules the timer for exactly the configured runtime", () => {
  const { watchdog, calls } = harness();
  const result = watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "45" });
  assert.equal(result.armed, true);
  assert.equal(result.maxRuntimeMinutes, 45);
  assert.equal(result.firesAt, new Date(NOW + 45 * 60_000).toISOString());
  assert.equal(calls.scheduled.length, 1);
  assert.equal(calls.scheduled[0].ms, 45 * 60_000);
});

test("re-arm cancels the previous timer (no timer leaks)", () => {
  const { watchdog, calls } = harness();
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30" });
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "60" });
  assert.equal(calls.scheduled.length, 2);
  assert.deepEqual(calls.cancelled, [1]);
});

test("disarm cancels the timer and reports disarmed status", () => {
  const { watchdog, calls } = harness();
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30" });
  const status = watchdog.disarm();
  assert.equal(status.armed, false);
  assert.deepEqual(calls.cancelled, [1]);
});

test("fire stops the worker exactly once and fails all active jobs", async () => {
  const jobs = [{ id: "job_a", status: "running" }, { id: "job_b", status: "verifying" }];
  const { watchdog, calls } = harness({ jobs });
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "30" });
  const enforcement = await watchdog.fire();

  assert.equal(calls.stops, 1);
  assert.deepEqual(enforcement.failedJobIds, ["job_a", "job_b"]);
  assert.deepEqual(calls.failed.map((f) => f.reason), ["runtime_budget_exceeded", "runtime_budget_exceeded"]);
  assert.equal(watchdog.status().armed, false);
  assert.equal(watchdog.status().lastEnforcement.reason, "runtime_budget_exceeded");
});

test("timer callback triggers enforcement (simulated timeout)", async () => {
  const jobs = [{ id: "job_c", status: "running" }];
  const { watchdog, calls } = harness({ jobs });
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "1" });
  calls.scheduled[0].fn();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.stops, 1);
  assert.deepEqual(calls.failed.map((f) => f.id), ["job_c"]);
});

test("fire records stop errors instead of crashing and still fails jobs", async () => {
  const jobs = [{ id: "job_d", status: "running" }];
  const { watchdog, calls } = harness({ stopResult: new Error("salad unreachable"), jobs });
  watchdog.arm({ SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "5" });
  const enforcement = await watchdog.fire();

  assert.equal(enforcement.workerStop.ok, false);
  assert.match(enforcement.workerStop.error, /salad unreachable/);
  assert.deepEqual(enforcement.failedJobIds, ["job_d"]);
  assert.equal(calls.stops, 1);
});

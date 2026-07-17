import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWorkerBudget, readBudgetLimits } from "../control-server/src/budget/budgetGate.js";
import { handleSaladCreate, handleSaladStart, handleSaladStop } from "../control-server/src/routes/saladRoutes.js";

const VALID_ENV = {
  SMEJJ_BUDGET_MAX_USD_PER_JOB: "5",
  SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "60",
  SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS: "2",
  SMEJJ_WORKER_BUDGET_USD: "2.50",
  SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "30"
};

function fakeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

test("readBudgetLimits is fail-closed on missing configuration", () => {
  const limits = readBudgetLimits({});
  assert.equal(limits.configured, false);
  assert.deepEqual(limits.missing, ["SMEJJ_BUDGET_MAX_USD_PER_JOB", "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES"]);
  assert.equal(limits.maxConcurrentWorkers, 1);
});

test("readBudgetLimits rejects zero and negative caps", () => {
  const limits = readBudgetLimits({ SMEJJ_BUDGET_MAX_USD_PER_JOB: "0", SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "-5" });
  assert.equal(limits.configured, false);
});

test("evaluateWorkerBudget approves a fully configured request inside caps", () => {
  const budget = evaluateWorkerBudget({ env: VALID_ENV, now: "2026-07-02T12:00:00Z" });
  assert.equal(budget.ok, true);
  assert.equal(budget.approved, true);
  assert.equal(budget.requestedUsd, 2.5);
  assert.equal(budget.failClosed, true);
  assert.deepEqual(budget.reasons, []);
});

test("evaluateWorkerBudget denies without any configuration", () => {
  const budget = evaluateWorkerBudget({ env: {} });
  assert.equal(budget.ok, false);
  assert.ok(budget.reasons.some((reason) => reason.startsWith("budget_limit_missing:")));
  assert.ok(budget.reasons.some((reason) => reason.startsWith("positive_worker_budget_required:")));
});

test("evaluateWorkerBudget denies when worker budget exceeds job cap", () => {
  const budget = evaluateWorkerBudget({ env: { ...VALID_ENV, SMEJJ_WORKER_BUDGET_USD: "9.99" } });
  assert.equal(budget.ok, false);
  assert.ok(budget.reasons.some((reason) => reason.startsWith("worker_budget_exceeds_job_cap:")));
});

test("evaluateWorkerBudget denies when estimated runtime exceeds cap", () => {
  const budget = evaluateWorkerBudget({ env: { ...VALID_ENV, SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "120" } });
  assert.equal(budget.ok, false);
  assert.ok(budget.reasons.some((reason) => reason.startsWith("estimated_runtime_exceeds_cap:")));
});

test("evaluateWorkerBudget denies when concurrent worker limit is reached", () => {
  const budget = evaluateWorkerBudget({ env: VALID_ENV, activeWorkers: 2 });
  assert.equal(budget.ok, false);
  assert.ok(budget.reasons.some((reason) => reason.startsWith("max_concurrent_workers_reached:")));
});

test("handleSaladCreate is blocked by budget gate before any Salad API call", async () => {
  for (const key of Object.keys(VALID_ENV)) delete process.env[key];
  const res = fakeRes();
  await handleSaladCreate(res);
  assert.equal(res.statusCode, 402);
  const payload = res.payload();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "budget_gate_denied");
  assert.equal(payload.workerStarted, false);
  assert.equal(payload.paidServicesStarted, false);
  assert.ok(payload.budget.reasons.length > 0);
});

test("handleSaladStart is blocked by budget gate before any Salad API call", async () => {
  for (const key of Object.keys(VALID_ENV)) delete process.env[key];
  const res = fakeRes();
  await handleSaladStart(res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.payload().error, "budget_gate_denied");
});

test("handleSaladStop stays available without budget config (stopping saves money)", async () => {
  for (const key of Object.keys(VALID_ENV)) delete process.env[key];
  const res = fakeRes();
  const watchdog = {
    enforceStop: () => Promise.resolve(),
    waitForFirstAttempt: async () => {},
    status: () => ({ phase: "stop-verified", stopVerified: true, enforcingStop: false })
  };
  await handleSaladStop(res, { watchdog });
  assert.notEqual(res.statusCode, 402);
  assert.equal(res.statusCode, 200);
});

test("budget gate passes but CONFIRM gate still blocks worker creation (defense in depth)", async () => {
  for (const [key, value] of Object.entries(VALID_ENV)) process.env[key] = value;
  delete process.env.CONFIRM_SALAD_CREATE;
  const res = fakeRes();
  await handleSaladCreate(res);
  assert.equal(res.statusCode, 409);
  const payload = res.payload();
  assert.equal(payload.budget.ok, true);
  for (const key of Object.keys(VALID_ENV)) delete process.env[key];
});

// smejj.com control-server — Budget-Gate (Single Responsibility: Kostendeckel vor Worker-Starts).
// Fail-closed: Ohne vollstaendige, positive Budget-Konfiguration darf kein Salad Worker
// erstellt oder gestartet werden. Ergaenzt das Job-Level-Gate aus codingFlowPlan.js um
// harte Plattform-Limits auf Control-Server-Ebene.

export const BUDGET_ENV_KEYS = Object.freeze([
  "SMEJJ_BUDGET_MAX_USD_PER_JOB",
  "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES",
  "SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS",
  "SMEJJ_WORKER_BUDGET_USD",
  "SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES"
]);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function readBudgetLimits(env = {}) {
  const maxUsdPerJob = positiveNumber(env.SMEJJ_BUDGET_MAX_USD_PER_JOB);
  const maxRuntimeMinutes = positiveNumber(env.SMEJJ_BUDGET_MAX_RUNTIME_MINUTES);
  const maxConcurrentWorkers = positiveNumber(env.SMEJJ_BUDGET_MAX_CONCURRENT_WORKERS) || 1;
  const missing = [
    !maxUsdPerJob && "SMEJJ_BUDGET_MAX_USD_PER_JOB",
    !maxRuntimeMinutes && "SMEJJ_BUDGET_MAX_RUNTIME_MINUTES"
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    maxUsdPerJob,
    maxRuntimeMinutes,
    maxConcurrentWorkers,
    missing
  };
}

export function evaluateWorkerBudget({ env = {}, activeWorkers = 0, now = new Date().toISOString() } = {}) {
  const limits = readBudgetLimits(env);
  const requestedUsd = positiveNumber(env.SMEJJ_WORKER_BUDGET_USD);
  const estimatedRuntimeMinutes = positiveNumber(env.SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES);
  const reasons = [];

  for (const key of limits.missing) reasons.push(`budget_limit_missing:${key}`);
  if (!requestedUsd) reasons.push("positive_worker_budget_required:SMEJJ_WORKER_BUDGET_USD");
  if (requestedUsd && limits.maxUsdPerJob && requestedUsd > limits.maxUsdPerJob) {
    reasons.push(`worker_budget_exceeds_job_cap:${requestedUsd}>${limits.maxUsdPerJob}`);
  }
  if (!estimatedRuntimeMinutes) reasons.push("estimated_runtime_required:SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES");
  if (estimatedRuntimeMinutes && limits.maxRuntimeMinutes && estimatedRuntimeMinutes > limits.maxRuntimeMinutes) {
    reasons.push(`estimated_runtime_exceeds_cap:${estimatedRuntimeMinutes}>${limits.maxRuntimeMinutes}`);
  }
  if (Number(activeWorkers) >= limits.maxConcurrentWorkers) {
    reasons.push(`max_concurrent_workers_reached:${activeWorkers}>=${limits.maxConcurrentWorkers}`);
  }

  return {
    ok: reasons.length === 0,
    approved: reasons.length === 0,
    checkedAt: now,
    failClosed: true,
    requestedUsd,
    estimatedRuntimeMinutes,
    activeWorkers: Number(activeWorkers) || 0,
    limits,
    reasons
  };
}

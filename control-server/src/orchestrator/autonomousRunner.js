// smejj.com control-server — Autonomie-Orchestrator
// (Single Responsibility: Job durch die autonome Coding-Schleife treiben).
//
// Der Control Server bleibt Router: Er fuehrt KEINE Rechenarbeit aus, sondern
// dispatched jeden Versuch per HTTP an einen stateless Worker und bewertet das Ergebnis.
//
// Worker-Dispatch-Vertrag (POST an SMEJJ_WORKER_DISPATCH_URL):
//   Request:  { jobId, attempt, maxAttempts, task, previousErrors: [] }
//   Response: { ok: boolean, errors?: [], memoryUpdate?: object }
//
// Regeln (autonomousLoop.js):
// - Maximal 3 Self-Fix-Versuche, danach failed.
// - Memory darf NUR bei Erfolg lernen (memoryMayLearn=false bei jedem Fehlschlag).
// - Jeder Statusuebergang laeuft durch transitionIdriveLiteJob → SSE-Event.
import { transitionIdriveLiteJob } from "../../../src/jobs/index.js";
import { getJob, replaceJob } from "../jobs/jobStore.js";

const MAX_SELF_FIX_ATTEMPTS = 3;

export function createAutonomousRunner({
  dispatch,
  loadJob = getJob,
  applyTransition = (job, status, message) => {
    const next = transitionIdriveLiteJob(job, status);
    return replaceJob(message ? { ...next, message } : next);
  },
  maxSelfFixAttempts = MAX_SELF_FIX_ATTEMPTS,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof dispatch !== "function") throw new Error("createAutonomousRunner requires a dispatch function");

  return async function run(jobId, input = {}) {
    const job = loadJob(jobId);
    if (!job) return { ok: false, stage: "claim", reason: "job_not_found", memoryMayLearn: false };

    let current = applyTransition(job, "planning", "Autonomous loop started");
    current = applyTransition(current, "running", "Dispatching to stateless worker");

    const attempts = [];
    let previousErrors = [];
    for (let attempt = 1; attempt <= maxSelfFixAttempts; attempt += 1) {
      let outcome;
      try {
        outcome = await dispatch({
          jobId,
          attempt,
          maxAttempts: maxSelfFixAttempts,
          task: String(input.task || job.task || ""),
          previousErrors
        });
      } catch (error) {
        outcome = { ok: false, errors: [{ source: "dispatch", detail: String(error?.message || error).slice(0, 200) }] };
      }
      attempts.push({ attempt, ok: outcome.ok === true, at: now(), errorCount: (outcome.errors || []).length });

      if (outcome.ok === true) {
        current = applyTransition(current, "verifying", "Worker reported success, finalizing");
        current = applyTransition(current, "passed", `Autonomous loop passed after ${attempt} attempt(s)`);
        return {
          ok: true,
          stage: "done",
          attempts,
          memoryMayLearn: true,
          memoryUpdate: outcome.memoryUpdate || null,
          finishedAt: now()
        };
      }
      previousErrors = outcome.errors || [];
      if (attempt < maxSelfFixAttempts) {
        current = applyTransition(current, "running", `Self-fix attempt ${attempt + 1}/${maxSelfFixAttempts}`);
      }
    }

    applyTransition(current, "failed", `Autonomous loop failed after ${maxSelfFixAttempts} attempt(s)`);
    return {
      ok: false,
      stage: "failed",
      attempts,
      memoryMayLearn: false,
      memoryUpdate: null,
      finishedAt: now()
    };
  };
}

export function buildHttpDispatch(env = {}, { fetchImpl = fetch } = {}) {
  const dispatchUrl = String(env.SMEJJ_WORKER_DISPATCH_URL || "").trim().replace(/\/$/, "");
  if (!dispatchUrl || !/^https?:\/\//.test(dispatchUrl)) return null;
  return async function dispatch(payload) {
    const response = await fetchImpl(dispatchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { ok: false, errors: [{ source: "worker_http", detail: `status_${response.status}` }] };
    return response.json();
  };
}

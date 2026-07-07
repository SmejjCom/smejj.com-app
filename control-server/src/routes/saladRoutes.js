// smejj.com control-server — Salad-Worker-Routen (Single Responsibility: Worker-Lifecycle-Steuerung).
// Alle mutierenden Aktionen sind fail-closed: Budget-Gate (Kostendeckel) UND explizite
// CONFIRM_*-Umgebungsvariablen sind Pflicht. Stop ist bewusst ungegated — Stoppen spart Kosten.
import {
  buildSaladGlmWorkerPlan,
  saladCreateContainerGroup,
  saladGetContainerGroup,
  saladListGpuClasses,
  saladStartContainerGroup,
  saladStopContainerGroup,
  transitionIdriveLiteJob
} from "../../../src/jobs/index.js";
import { json } from "../http/respond.js";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { createRuntimeWatchdog } from "../budget/runtimeWatchdog.js";
import { activeJobs, activeWorkerCount, replaceJob } from "../jobs/jobStore.js";

// Laufzeit-Watchdog: autorisierter Notaus. Der Stop-Override (CONFIRM_SALAD_STOP=YES)
// ist hier bewusst und dokumentiert — Stoppen senkt Kosten und darf nie blockieren.
export const runtimeWatchdog = createRuntimeWatchdog({
  stopWorker: () => saladStopContainerGroup({ ...process.env, CONFIRM_SALAD_STOP: "YES" }),
  listActiveJobs: activeJobs,
  failJob: (job, reason) => {
    const failed = transitionIdriveLiteJob(job, "failed");
    replaceJob({ ...failed, message: `Runtime watchdog: ${reason}` });
  }
});

function currentBudget() {
  return evaluateWorkerBudget({ env: process.env, activeWorkers: activeWorkerCount() });
}

export function handleSaladPlan(res) {
  return json(res, 200, {
    ...buildSaladGlmWorkerPlan({ env: process.env }),
    budget: currentBudget(),
    runtimeWatchdog: runtimeWatchdog.status()
  });
}

export async function handleSaladStatus(res) {
  return json(res, 200, await saladGetContainerGroup(process.env));
}

export async function handleSaladGpuClasses(res) {
  return json(res, 200, await saladListGpuClasses(process.env));
}

export async function handleSaladCreate(res) {
  const budget = currentBudget();
  if (!budget.ok) {
    return json(res, 402, { ok: false, error: "budget_gate_denied", workerStarted: false, paidServicesStarted: false, budget });
  }
  const plan = buildSaladGlmWorkerPlan({ env: process.env });
  const result = await saladCreateContainerGroup({ env: process.env, plan });
  const approved = plan.ok && process.env.CONFIRM_SALAD_CREATE === "YES";
  const watchdog = approved ? runtimeWatchdog.arm(process.env) : runtimeWatchdog.status();
  return json(res, approved ? 200 : 409, { ...result, budget, runtimeWatchdog: watchdog });
}

export async function handleSaladStart(res) {
  const budget = currentBudget();
  if (!budget.ok) {
    return json(res, 402, { ok: false, error: "budget_gate_denied", workerStarted: false, paidServicesStarted: false, budget });
  }
  const result = await saladStartContainerGroup(process.env);
  const approved = process.env.CONFIRM_SALAD_START === "YES";
  const watchdog = approved ? runtimeWatchdog.arm(process.env) : runtimeWatchdog.status();
  return json(res, approved ? 200 : 409, { ...result, budget, runtimeWatchdog: watchdog });
}

export async function handleSaladStop(res) {
  const result = await saladStopContainerGroup(process.env);
  const watchdog = runtimeWatchdog.disarm();
  return json(res, process.env.CONFIRM_SALAD_STOP === "YES" ? 200 : 409, { ...result, runtimeWatchdog: watchdog });
}
